//! The wallet worker: one background thread that owns the wallet database and
//! the lightwalletd connection, and does everything that touches the chain.
//!
//! - Proof 2 (detect): every 30s, `zcash_client_backend::sync::run` scans new
//!   blocks (Sapling, Orchard, Ironwood) into `data/wallet.sqlite`, using a small
//!   in-memory block cache implemented here.
//! - Step C (memos): after each scan, full transactions are fetched for anything
//!   the wallet is involved in ("enhancement") so memos get decrypted and stored.
//! - Proof 3 (send): HTTP requests are queued to this thread, which builds,
//!   proves and broadcasts a shielded transaction.
//!
//! Keeping all of this on one thread means the SQLite handle is never shared.

use std::{
    fmt,
    num::NonZeroUsize,
    path::PathBuf,
    str::FromStr,
    sync::{
        atomic::{AtomicU32, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use anyhow::{anyhow, Context};
use async_trait::async_trait;
use rand::{rand_core::UnwrapErr, rngs::SysRng};
/// The operating system's random numbers, as the wallet database and the transaction builder take them.
type OsRng = UnwrapErr<SysRng>;
fn os_rng() -> OsRng {
    UnwrapErr(SysRng)
}
use secrecy::SecretVec;
use tokio::sync::{mpsc, oneshot};
use tonic::{
    transport::{Channel, ClientTlsConfig},
    Code,
};
use zcash_address::ZcashAddress;
use zcash_client_backend::{
    data_api::{
        chain::{error::Error as ChainError, BlockCache, BlockSource},
        error::Error as WalletError,
        scanning::ScanRange,
        wallet::{
            create_proposed_transactions, decrypt_and_store_transaction,
            input_selection::{
                GreedyInputSelector, GreedyInputSelectorError, LockedInputPolicy, SpendPolicy,
            },
            propose_send_max_transfer, propose_transfer, ConfirmationsPolicy, SpendingKeys,
        },
        Account, AccountBalance, AccountBirthday, AccountPurpose, MaxSpendMode, TransactionDataRequest,
        TransactionStatus, WalletRead, WalletWrite, Zip32Derivation,
    },
    fees::{standard::MultiOutputChangeStrategy, DustOutputPolicy, SplitPolicy, StandardFeeRule},
    proto::{
        compact_formats::CompactBlock,
        service::{self, compact_tx_streamer_client::CompactTxStreamerClient, RawTransaction},
    },
    wallet::OvkPolicy,
};
use zcash_client_sqlite::{
    error::SqliteClientError, util::SystemClock, wallet::commitment_tree,
    wallet::init::init_wallet_db, AccountUuid, ReceivedNoteId, WalletDb,
};
use zcash_keys::keys::{UnifiedAddressRequest, UnifiedFullViewingKey, UnifiedSpendingKey};
use zcash_primitives::transaction::{fees::zip317, Transaction, TxId};
use zcash_proofs::prover::LocalTxProver;
use zcash_protocol::{
    consensus::{BlockHeight, BranchId, TestNetwork},
    memo::{Memo, MemoBytes},
    value::Zatoshis,
    ShieldedPool,
};
use zip32::{fingerprint::SeedFingerprint, AccountId, DiversifierIndex};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use zip321::{Payment, TransactionRequest};

const SYNC_INTERVAL: Duration = Duration::from_secs(30);
const BATCH_SIZE: u32 = 1_000;

type Db = WalletDb<rusqlite::Connection, TestNetwork, SystemClock, OsRng>;

/// The concrete error type of the transfer APIs for a SQLite wallet
/// (same instantiation ECC's zcash-devtool uses).
type TransferError = WalletError<
    SqliteClientError,
    commitment_tree::Error,
    GreedyInputSelectorError,
    zip317::FeeError,
    zip317::FeeError,
    ReceivedNoteId,
>;

// ---------------------------------------------------------------------------
// In-memory block cache
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub struct CacheError(String);

impl fmt::Display for CacheError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "block cache error: {}", self.0)
    }
}

impl std::error::Error for CacheError {}

/// Holds downloaded compact blocks between download and scan. Blocks are
/// deleted by the sync engine once scanned, so this stays small.
#[derive(Default)]
pub struct MemoryBlockCache {
    blocks: Mutex<Vec<CompactBlock>>,
}

fn height_of(block: &CompactBlock) -> BlockHeight {
    BlockHeight::from_u32(block.height as u32)
}

impl BlockSource for MemoryBlockCache {
    type Error = CacheError;

    fn with_blocks<F, WalletErrT>(
        &self,
        from_height: Option<BlockHeight>,
        limit: Option<usize>,
        mut with_block: F,
    ) -> Result<(), ChainError<WalletErrT, Self::Error>>
    where
        F: FnMut(CompactBlock) -> Result<(), ChainError<WalletErrT, Self::Error>>,
    {
        // Copy out under the lock, then call back without holding it.
        let mut blocks: Vec<CompactBlock> = self
            .blocks
            .lock()
            .map_err(|_| ChainError::BlockSource(CacheError("lock poisoned".into())))?
            .iter()
            .filter(|b| from_height.map_or(true, |h| height_of(b) >= h))
            .cloned()
            .collect();
        blocks.sort_by_key(|b| b.height);

        for block in blocks.into_iter().take(limit.unwrap_or(usize::MAX)) {
            with_block(block)?;
        }
        Ok(())
    }
}

#[async_trait]
impl BlockCache for MemoryBlockCache {
    fn get_tip_height(&self, range: Option<&ScanRange>) -> Result<Option<BlockHeight>, Self::Error> {
        let blocks = self.blocks.lock().map_err(|_| CacheError("lock poisoned".into()))?;
        Ok(blocks
            .iter()
            .map(height_of)
            .filter(|h| range.map_or(true, |r| r.block_range().contains(h)))
            .max())
    }

    async fn read(&self, range: &ScanRange) -> Result<Vec<CompactBlock>, Self::Error> {
        let blocks = self.blocks.lock().map_err(|_| CacheError("lock poisoned".into()))?;
        let mut out: Vec<CompactBlock> = blocks
            .iter()
            .filter(|b| range.block_range().contains(&height_of(b)))
            .cloned()
            .collect();
        out.sort_by_key(|b| b.height);
        Ok(out)
    }

    async fn insert(&self, compact_blocks: Vec<CompactBlock>) -> Result<(), Self::Error> {
        let mut blocks = self.blocks.lock().map_err(|_| CacheError("lock poisoned".into()))?;
        // Replace any existing block at the same height (e.g. after a reorg).
        let new_heights: Vec<u64> = compact_blocks.iter().map(|b| b.height).collect();
        blocks.retain(|b| !new_heights.contains(&b.height));
        blocks.extend(compact_blocks);
        Ok(())
    }

    async fn delete(&self, range: ScanRange) -> Result<(), Self::Error> {
        let mut blocks = self.blocks.lock().map_err(|_| CacheError("lock poisoned".into()))?;
        blocks.retain(|b| !range.block_range().contains(&height_of(b)));
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Worker: status, config, commands
// ---------------------------------------------------------------------------

/// Shared, read-only-to-HTTP view of the worker's progress.
#[derive(Default)]
pub struct SyncStatus {
    pub scanned_height: AtomicU32,
    pub chain_tip: AtomicU32,
    /// Total wallet balance in zatoshis, including funds not yet spendable.
    pub balance_total: AtomicU64,
    /// What can be spent right now (confirmed, and not tied up in a pending send).
    pub balance_spendable: AtomicU64,
    pub last_error: Mutex<Option<String>>,
}

pub struct SyncConfig {
    pub seed: Vec<u8>,
    pub db_path: PathBuf,
    pub server: String,
    /// Height to start scanning from when the wallet DB is first created.
    /// If None, starts 1000 blocks (~20 hours on testnet) below the chain tip.
    pub birthday: Option<u32>,
}

pub struct SendRequest {
    pub to: String,
    pub zatoshis: u64,
    pub memo: Option<String>,
}

pub enum Command {
    Send {
        request: SendRequest,
        reply: oneshot::Sender<anyhow::Result<String>>,
    },
    CreatePot {
        reply: oneshot::Sender<anyhow::Result<NewPot>>,
    },
    /// A pot whose keys were made in the creator's browser: only its viewing key
    /// and seed fingerprint arrive here, never the seed phrase.
    ImportPot {
        viewing_key: String,
        seed_fingerprint: String,
        reply: oneshot::Sender<anyhow::Result<ImportedPot>>,
    },
    PotInfo {
        pot_id: String,
        reply: oneshot::Sender<anyhow::Result<PotStatus>>,
    },
    ClaimPot {
        pot_id: String,
        seed_phrase: String,
        to: String,
        reply: oneshot::Sender<anyhow::Result<String>>,
    },
}

/// Returned once, to the creator's browser. The signer does not keep the seed phrase.
#[derive(Serialize)]
pub struct NewPot {
    pub pot_id: String,
    pub seed_phrase: String,
    pub viewing_key: String,
    pub address: String,
    pub birthday_height: u32,
}

/// A browser-made pot, as registered here. No seed phrase: the signer never had it.
#[derive(Serialize)]
pub struct ImportedPot {
    pub pot_id: String,
    pub viewing_key: String,
    pub address: String,
    pub birthday_height: u32,
}

#[derive(Serialize)]
pub struct PotStatus {
    pub pot_id: String,
    pub viewing_key: String,
    pub address: String,
    pub balance_total_zatoshis: u64,
    pub balance_spendable_zatoshis: u64,
    pub scanned_height: u32,
    /// Height the pot was created at: where a viewing-key wallet should start scanning.
    pub birthday_height: u32,
    pub claimed: bool,
}

/// What the signer remembers about a pot: public data only.
#[derive(Serialize, Deserialize, Clone)]
struct PotRecord {
    viewing_key: String,
    address: String,
    birthday_height: u32,
    /// Set as soon as a valid claim is accepted; locks the pot.
    #[serde(default)]
    claimed_txid: Option<String>,
}

/// Starts the worker on its own thread and returns the queue for commands.
pub fn spawn(config: SyncConfig, status: Arc<SyncStatus>) -> mpsc::UnboundedSender<Command> {
    let (tx, mut rx) = mpsc::unbounded_channel::<Command>();
    std::thread::Builder::new()
        .name("zcash-wallet".into())
        .spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("wallet runtime");
            rt.block_on(async move {
                let cache = MemoryBlockCache::default();
                run_sync(&config, &cache, &status).await;
                // A ticker, not a sleep inside the loop: a sleep would start again
                // every time a request arrived, so a steady stream of requests
                // (a page polling every few seconds) would stop the wallet from
                // ever scanning a new block.
                let mut ticker = tokio::time::interval(SYNC_INTERVAL);
                ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
                ticker.tick().await; // the first tick is immediate, and we have just synced
                loop {
                    tokio::select! {
                        _ = ticker.tick() => {
                            run_sync(&config, &cache, &status).await;
                        }
                        cmd = rx.recv() => match cmd {
                            Some(Command::Send { request, reply }) => {
                                // Build against the real chain tip, so the transaction's
                                // expiry height is not already in the past.
                                run_sync(&config, &cache, &status).await;
                                let result = send_once(&config, &request).await;
                                if let Err(e) = &result {
                                    eprintln!("send error: {e:#}");
                                }
                                let _ = reply.send(result);
                            }
                            Some(Command::CreatePot { reply }) => {
                                let result = create_pot(&config).await;
                                if let Err(e) = &result {
                                    eprintln!("create pot error: {e:#}");
                                } else {
                                    // A new account adds a scan range; until it is scanned the
                                    // wallet treats nothing as spendable. Sync now so the caller
                                    // can fund the pot straight away.
                                    run_sync(&config, &cache, &status).await;
                                }
                                let _ = reply.send(result);
                            }
                            Some(Command::ImportPot { viewing_key, seed_fingerprint, reply }) => {
                                let result = import_pot(&config, &viewing_key, &seed_fingerprint).await;
                                if let Err(e) = &result {
                                    eprintln!("import pot error: {e:#}");
                                } else {
                                    // Same as CreatePot: scan the new account's range now.
                                    run_sync(&config, &cache, &status).await;
                                }
                                let _ = reply.send(result);
                            }
                            Some(Command::ClaimPot { pot_id, seed_phrase, to, reply }) => {
                                run_sync(&config, &cache, &status).await;
                                let result = claim_pot(&config, &pot_id, &seed_phrase, &to).await;
                                if let Err(e) = &result {
                                    // Never log the seed phrase; the error text doesn't contain it.
                                    eprintln!("claim {pot_id} error: {e:#}");
                                }
                                let _ = reply.send(result);
                            }
                            Some(Command::PotInfo { pot_id, reply }) => {
                                let _ = reply.send(pot_info(&config, &status, &pot_id));
                            }
                            None => break, // HTTP side has shut down
                        },
                    }
                }
            });
        })
        .expect("spawn wallet thread");
    tx
}

const SYNC_PASS_LIMIT: Duration = Duration::from_secs(600);

async fn run_sync(config: &SyncConfig, cache: &MemoryBlockCache, status: &SyncStatus) {
    let result = match tokio::time::timeout(SYNC_PASS_LIMIT, sync_once(config, cache, status)).await {
        Ok(r) => r,
        Err(_) => Err(anyhow!("sync pass took longer than {}s; will retry", SYNC_PASS_LIMIT.as_secs())),
    };
    match result {
        Ok(()) => {
            *status.last_error.lock().unwrap() = None;
            println!(
                "synced to {} (tip {}), balance {} zat, spendable {} zat",
                status.scanned_height.load(Ordering::Relaxed),
                status.chain_tip.load(Ordering::Relaxed),
                status.balance_total.load(Ordering::Relaxed),
                status.balance_spendable.load(Ordering::Relaxed),
            );
        }
        Err(e) => {
            eprintln!("sync error: {e:#}");
            *status.last_error.lock().unwrap() = Some(format!("{e:#}"));
        }
    }
}

async fn connect(server: &str) -> anyhow::Result<CompactTxStreamerClient<Channel>> {
    let mut endpoint = Channel::from_shared(server.to_string())
        .with_context(|| format!("bad lightwalletd URL: {server}"))?
        // Never wait forever on the server: bound connecting and each request.
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120));
    if let Some(rest) = server.strip_prefix("https://") {
        let host = rest.split(':').next().unwrap_or(rest).to_string();
        endpoint = endpoint.tls_config(
            ClientTlsConfig::new()
                .domain_name(host)
                .assume_http2(true)
                .with_webpki_roots(),
        )?;
    }
    let channel = endpoint
        .connect()
        .await
        .with_context(|| format!("connecting to {server}"))?;
    Ok(CompactTxStreamerClient::new(channel))
}

fn open_db(config: &SyncConfig) -> anyhow::Result<Db> {
    let mut db = WalletDb::for_path(&config.db_path, TestNetwork, SystemClock, os_rng())?;
    init_wallet_db(&mut db, None).map_err(|e| anyhow!("init wallet db: {e:?}"))?;
    Ok(db)
}

// ---------------------------------------------------------------------------
// Proof 2 + step C: sync and enhance
// ---------------------------------------------------------------------------

async fn sync_once(
    config: &SyncConfig,
    cache: &MemoryBlockCache,
    status: &SyncStatus,
) -> anyhow::Result<()> {
    let mut client = connect(&config.server).await?;

    let latest = client
        .get_latest_block(service::ChainSpec::default())
        .await?
        .into_inner();
    let tip = u32::try_from(latest.height)?;
    status.chain_tip.store(tip, Ordering::Relaxed);

    let mut db = open_db(config)?;

    // First run: register our seed's account 0 (the same account the signer derives
    // addresses from) with a birthday, so scanning starts there and not at genesis.
    if main_account(config, &db)?.is_none() {
        let birthday_height = config.birthday.unwrap_or(tip.saturating_sub(1_000));
        let tree_state = client
            .get_tree_state(service::BlockId {
                height: u64::from(birthday_height.saturating_sub(1)),
                ..Default::default()
            })
            .await?
            .into_inner();
        let birthday = AccountBirthday::from_treestate(tree_state, None)
            .map_err(|e| anyhow!("building birthday: {e:?}"))?;
        db.create_account("signer", &SecretVec::new(config.seed.clone()), &birthday, None)?;
        println!("wallet db created; scanning from height {birthday_height}");
    }

    zcash_client_backend::sync::run(&mut client, &TestNetwork, cache, &mut db, BATCH_SIZE)
        .await
        .map_err(|e| anyhow!("{e}"))?;

    if let Some(meta) = db.block_max_scanned()? {
        status
            .scanned_height
            .store(u32::from(meta.block_height()), Ordering::Relaxed);
    }

    println!("  scan done; fetching full transactions");
    enhance(&mut client, &mut db).await?;
    println!("  enhance done; rebroadcasting pending sends");
    rebroadcast_pending(&mut client, &db, &config.db_path).await;

    if let (Some(summary), Some(main)) = (
        db.get_wallet_summary(ConfirmationsPolicy::default())?,
        main_account(config, &db)?,
    ) {
        if let Some(balance) = summary.account_balances().get(&main) {
            status.balance_total.store(balance.total().into_u64(), Ordering::Relaxed);
            status.balance_spendable.store(spendable_of(balance), Ordering::Relaxed);
        }
    }
    Ok(())
}

/// Fetch a full transaction from lightwalletd. `None` if the server doesn't know it.
async fn fetch_transaction(
    client: &mut CompactTxStreamerClient<Channel>,
    chain_tip: BlockHeight,
    txid: TxId,
) -> anyhow::Result<Option<(Transaction, Option<BlockHeight>)>> {
    let request = service::TxFilter {
        hash: txid.as_ref().to_vec(),
        ..Default::default()
    };
    let raw = match client.get_transaction(request).await {
        Ok(response) => response.into_inner(),
        Err(status) if status.code() == Code::NotFound => return Ok(None),
        Err(status) => return Err(status.into()),
    };
    let mined_height = (raw.height > 0 && raw.height <= u64::from(u32::MAX))
        .then(|| BlockHeight::from_u32(raw.height as u32));
    let tx = Transaction::read(
        &raw.data[..],
        BranchId::for_height(&TestNetwork, mined_height.unwrap_or(chain_tip)),
    )?;
    Ok(Some((tx, mined_height)))
}

/// Step C: download full transactions the wallet asks for, so memos (which
/// compact blocks don't carry) are decrypted and stored, and track the status
/// of transactions we sent.
async fn enhance(client: &mut CompactTxStreamerClient<Channel>, db: &mut Db) -> anyhow::Result<()> {
    let Some(chain_tip) = db.chain_height()? else {
        return Ok(());
    };
    let requests = db.transaction_data_requests()?;
    if !requests.is_empty() {
        println!("  {} transaction data request(s)", requests.len());
    }
    for request in requests {
        match request {
            TransactionDataRequest::GetStatus(txid) => {
                let status = match fetch_transaction(client, chain_tip, txid).await? {
                    None => TransactionStatus::TxidNotRecognized,
                    Some((_, Some(h))) => TransactionStatus::Mined(h),
                    Some((_, None)) => TransactionStatus::NotInMainChain,
                };
                db.set_transaction_status(txid, status)?;
            }
            TransactionDataRequest::Enhancement(txid) => {
                match fetch_transaction(client, chain_tip, txid).await? {
                    None => db.set_transaction_status(txid, TransactionStatus::TxidNotRecognized)?,
                    Some((tx, mined_height)) => {
                        decrypt_and_store_transaction(&TestNetwork, db, &tx, mined_height)?
                    }
                }
            }
            // Other request kinds concern transparent addresses, which we don't use.
            #[allow(unreachable_patterns)]
            _ => {}
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Proof 3: send
// ---------------------------------------------------------------------------

#[allow(deprecated)]
async fn send_once(config: &SyncConfig, request: &SendRequest) -> anyhow::Result<String> {
    let mut db = open_db(config)?;
    let account = main_account(config, &db)?
        .ok_or_else(|| anyhow!("wallet not initialised yet; wait for the first sync"))?;

    // Build the ZIP-321 payment request.
    let to = ZcashAddress::from_str(&request.to).map_err(|_| anyhow!("invalid recipient address"))?;
    let amount = Zatoshis::from_u64(request.zatoshis).map_err(|_| anyhow!("invalid amount"))?;
    let memo = request
        .memo
        .as_deref()
        .map(Memo::from_str)
        .transpose()
        .map_err(|_| anyhow!("memo is too long (max 512 bytes)"))?
        .map(MemoBytes::from);
    let payment = Payment::new(to, Some(amount), memo, None, None, vec![])
        .map_err(|e| anyhow!("invalid payment: {:?}", e.with_index(0)))?;
    let tx_request =
        TransactionRequest::new(vec![payment]).map_err(|e| anyhow!("invalid request: {e:?}"))?;

    // Change stays in Ironwood (where our funds are), so no value crosses pools.
    let change_strategy = MultiOutputChangeStrategy::new(
        StandardFeeRule::Zip317,
        None,
        ShieldedPool::Ironwood,
        DustOutputPolicy::default(),
        SplitPolicy::with_min_output_value(
            NonZeroUsize::new(1).unwrap(),
            Zatoshis::from_u64(10_000_000)?,
        ),
    );

    let proposal = propose_transfer(
        &mut db,
        &TestNetwork,
        account,
        &GreedyInputSelector::new(),
        &change_strategy,
        tx_request,
        ConfirmationsPolicy::default(),
        &SpendPolicy::default(),
        None,
        None,
    )
    .map_err(|e: TransferError| anyhow!("could not build proposal: {e}"))?;

    let usk = UnifiedSpendingKey::from_seed(&TestNetwork, &config.seed, AccountId::ZERO)
        .map_err(|e| anyhow!("deriving spending key: {e:?}"))?;
    let prover = LocalTxProver::bundled();
    let txids = create_proposed_transactions(
        &mut db,
        &TestNetwork,
        &SystemClock,
        &mut os_rng(),
        &prover,
        &prover,
        &SpendingKeys::from_unified_spending_key(usk),
        OvkPolicy::Sender,
        &proposal,
        None,
    )
    .map_err(|e: TransferError| anyhow!("could not create transaction: {e}"))?;

    if txids.len() > 1 {
        return Err(anyhow!("multi-transaction proposals are not supported"));
    }
    let txid = *txids.first();

    let tx = db
        .get_transaction(txid)?
        .ok_or_else(|| anyhow!("created transaction {txid} not found in wallet"))?;

    broadcast_with_retries(config, txid, &tx).await?;
    println!("sent {txid}");
    Ok(txid.to_string())
}

/// Sends a raw transaction to lightwalletd. Errors if the node rejects it.
async fn broadcast(
    client: &mut CompactTxStreamerClient<Channel>,
    tx: &Transaction,
) -> anyhow::Result<()> {
    let mut raw = RawTransaction::default();
    tx.write(&mut raw.data)?;
    let response = client.send_transaction(raw).await?.into_inner();
    if response.error_code != 0 {
        return Err(anyhow!(
            "node rejected transaction ({}): {}",
            response.error_code,
            response.error_message
        ));
    }
    Ok(())
}

/// Re-sends our own transactions that are neither mined nor expired, the way
/// wallets normally do, in case an earlier broadcast was lost.
async fn rebroadcast_pending(
    client: &mut CompactTxStreamerClient<Channel>,
    db: &Db,
    db_path: &std::path::Path,
) {
    let pending: Vec<[u8; 32]> = match (|| -> anyhow::Result<Vec<[u8; 32]>> {
        let conn = rusqlite::Connection::open_with_flags(
            db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        rusqlite::vtab::array::load_module(&conn)?;
        let mut stmt = conn.prepare(
            "SELECT txid FROM v_transactions
             WHERE account_balance_delta < 0 AND mined_height IS NULL
               AND COALESCE(expired_unmined, 0) = 0",
        )?;
        let rows = stmt.query_map([], |r| r.get::<_, Vec<u8>>(0))?;
        let mut out = Vec::new();
        for r in rows {
            if let Ok(arr) = <[u8; 32]>::try_from(r?) {
                out.push(arr);
            }
        }
        Ok(out)
    })() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("rebroadcast: could not list pending transactions: {e:#}");
            return;
        }
    };

    for bytes in pending {
        let txid = TxId::from_bytes(bytes);
        match db.get_transaction(txid) {
            Ok(Some(tx)) => match broadcast(client, &tx).await {
                Ok(()) => println!("rebroadcast {txid}: accepted"),
                Err(e) if format!("{e:#}").contains("already in state") => {
                    println!("rebroadcast {txid}: node already has it (mined or in mempool)")
                }
                Err(e) => println!("rebroadcast {txid}: {e:#}"),
            },
            Ok(None) => {}
            Err(e) => eprintln!("rebroadcast {txid}: {e}"),
        }
    }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

fn spendable_of(balance: &AccountBalance) -> u64 {
    balance.sapling_balance().spendable_value().into_u64()
        + balance.orchard_balance().spendable_value().into_u64()
        + balance.ironwood_balance().spendable_value().into_u64()
}

/// The signer's own account (seed account 0), if registered yet. Pots are
/// separate accounts in the same database.
fn main_account(config: &SyncConfig, db: &Db) -> anyhow::Result<Option<AccountUuid>> {
    let usk = UnifiedSpendingKey::from_seed(&TestNetwork, &config.seed, AccountId::ZERO)
        .map_err(|e| anyhow!("deriving main key: {e:?}"))?;
    Ok(db
        .get_account_for_ufvk(&usk.to_unified_full_viewing_key())?
        .map(|a| a.id()))
}

// ---------------------------------------------------------------------------
// Shielded Quest pots
// ---------------------------------------------------------------------------

fn pots_path(config: &SyncConfig) -> PathBuf {
    config.db_path.with_file_name("pots.json")
}

fn load_pots(config: &SyncConfig) -> BTreeMap<String, PotRecord> {
    std::fs::read_to_string(pots_path(config))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn save_pots(config: &SyncConfig, pots: &BTreeMap<String, PotRecord>) -> anyhow::Result<()> {
    let path = pots_path(config);
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(pots)?)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// Registers a pot's viewing key as an account to watch (and later sweep, when a
/// winner supplies the seed phrase). Only public data is stored: the viewing
/// key, the pot's address and the seed's fingerprint (a one-way hash).
async fn register_pot(
    config: &SyncConfig,
    ufvk: &UnifiedFullViewingKey,
    fingerprint: SeedFingerprint,
) -> anyhow::Result<(String, PotRecord)> {
    let mut client = connect(&config.server).await?;
    let tip = u32::try_from(
        client
            .get_latest_block(service::ChainSpec::default())
            .await?
            .into_inner()
            .height,
    )?;

    let (address, _) = ufvk
        .find_address(DiversifierIndex::from(0u32), UnifiedAddressRequest::AllAvailableKeys)
        .map_err(|e| anyhow!("deriving pot address: {e:?}"))?;

    let mut db = open_db(config)?;

    // Birthday: the block just after the last one this wallet has scanned. The
    // pot cannot have been funded before now, so nothing is missed. It must not
    // be lower: since the NU7 libraries, a birthday below the scanned height
    // makes the wallet rewind its note commitment trees to it, and that rewind
    // can fail ("retains checkpoints both above and below height ...") when no
    // checkpoint sits at the height it needs.
    let scanned = db.block_max_scanned()?.map(|m| u32::from(m.block_height()));
    let prior = scanned.map_or(tip.saturating_sub(2), |s| s.min(tip));
    let birthday_height = prior + 1;
    let tree_state = client
        .get_tree_state(service::BlockId {
            height: u64::from(prior),
            ..Default::default()
        })
        .await?
        .into_inner();
    let birthday = AccountBirthday::from_treestate(tree_state, None)
        .map_err(|e| anyhow!("building birthday: {e:?}"))?;

    let mut id_bytes = [0u8; 8];
    getrandom::getrandom(&mut id_bytes).map_err(|e| anyhow!("rng: {e}"))?;
    let pot_id: String = id_bytes.iter().map(|b| format!("{b:02x}")).collect();

    db.import_account_ufvk(
        &format!("pot-{pot_id}"),
        ufvk,
        &birthday,
        AccountPurpose::Spending {
            derivation: Some(Zip32Derivation::new(fingerprint, AccountId::ZERO)),
        },
        None,
    )?;

    let record = PotRecord {
        viewing_key: ufvk.encode(&TestNetwork).map_err(|e| anyhow!("encoding the viewing key: {e:?}"))?,
        address: address.encode(&TestNetwork),
        birthday_height,
        claimed_txid: None,
    };
    let mut pots = load_pots(config);
    pots.insert(pot_id.clone(), record.clone());
    save_pots(config, &pots)?;
    Ok((pot_id, record))
}

/// Makes a fresh pot wallet here on the server (used for the practice hunts,
/// and as a fallback for browsers that can't make the keys themselves). The
/// seed phrase is returned once and not stored.
async fn create_pot(config: &SyncConfig) -> anyhow::Result<NewPot> {
    let mut entropy = [0u8; 32];
    getrandom::getrandom(&mut entropy).map_err(|e| anyhow!("rng: {e}"))?;
    let mnemonic =
        bip39::Mnemonic::from_entropy(&entropy).map_err(|e| anyhow!("mnemonic: {e:?}"))?;
    let seed = mnemonic.to_seed("");

    let usk = UnifiedSpendingKey::from_seed(&TestNetwork, &seed, AccountId::ZERO)
        .map_err(|e| anyhow!("deriving pot key: {e:?}"))?;
    let ufvk = usk.to_unified_full_viewing_key();
    let fingerprint =
        SeedFingerprint::from_seed(&seed).ok_or_else(|| anyhow!("bad seed length"))?;

    let (pot_id, record) = register_pot(config, &ufvk, fingerprint).await?;
    println!("created pot {pot_id} at height {}", record.birthday_height);

    Ok(NewPot {
        pot_id,
        seed_phrase: mnemonic.to_string(),
        viewing_key: record.viewing_key,
        address: record.address,
        birthday_height: record.birthday_height,
    })
}

/// Registers a pot whose keys were made in the creator's browser. The seed
/// phrase never comes here: only the viewing key (which can watch the balance
/// but not spend) and the seed's fingerprint. A later claim must present the
/// seed phrase that derives exactly this viewing key.
async fn import_pot(
    config: &SyncConfig,
    viewing_key: &str,
    seed_fingerprint: &str,
) -> anyhow::Result<ImportedPot> {
    let ufvk = UnifiedFullViewingKey::decode(&TestNetwork, viewing_key.trim())
        .map_err(|e| anyhow!("that is not a valid testnet viewing key: {e}"))?;
    // The same shape as the pots made here: shielded keys for both pools, so a
    // sweep can spend whatever the pot received.
    if ufvk.orchard().is_none() || ufvk.sapling().is_none() {
        return Err(anyhow!("the viewing key must include Orchard and Sapling keys"));
    }

    let fp = seed_fingerprint.trim();
    if fp.len() != 64 || !fp.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(anyhow!("the seed fingerprint must be 64 hex characters"));
    }
    let mut fp_bytes = [0u8; 32];
    for (i, byte) in fp_bytes.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&fp[i * 2..i * 2 + 2], 16)
            .map_err(|_| anyhow!("the seed fingerprint must be 64 hex characters"))?;
    }

    // One pot per key: a second registration would shadow the first.
    {
        let db = open_db(config)?;
        if db.get_account_for_ufvk(&ufvk)?.is_some() {
            return Err(anyhow!("a pot with this viewing key already exists"));
        }
    }

    let (pot_id, record) =
        register_pot(config, &ufvk, SeedFingerprint::from_bytes(fp_bytes)).await?;
    println!("imported browser-made pot {pot_id} at height {}", record.birthday_height);

    Ok(ImportedPot {
        pot_id,
        viewing_key: record.viewing_key,
        address: record.address,
        birthday_height: record.birthday_height,
    })
}

fn pot_info(config: &SyncConfig, status: &SyncStatus, pot_id: &str) -> anyhow::Result<PotStatus> {
    let record = load_pots(config)
        .get(pot_id)
        .cloned()
        .ok_or_else(|| anyhow!("unknown pot {pot_id}"))?;
    let ufvk = UnifiedFullViewingKey::decode(&TestNetwork, &record.viewing_key)
        .map_err(|e| anyhow!("stored viewing key is invalid: {e}"))?;
    let db = open_db(config)?;
    let account = db
        .get_account_for_ufvk(&ufvk)?
        .ok_or_else(|| anyhow!("pot {pot_id} is not in the wallet database"))?
        .id();
    let (total, spendable) = db
        .get_wallet_summary(ConfirmationsPolicy::default())?
        .and_then(|s| {
            s.account_balances()
                .get(&account)
                .map(|b| (b.total().into_u64(), spendable_of(b)))
        })
        .unwrap_or((0, 0));
    Ok(PotStatus {
        pot_id: pot_id.to_string(),
        viewing_key: record.viewing_key,
        address: record.address,
        balance_total_zatoshis: total,
        balance_spendable_zatoshis: spendable,
        scanned_height: status.scanned_height.load(Ordering::Relaxed),
        birthday_height: record.birthday_height,
        claimed: record.claimed_txid.is_some(),
    })
}

/// Connects only now (proving can take a while, and a connection opened before
/// proving gets closed by the server), and retries with a fresh connection.
async fn broadcast_with_retries(config: &SyncConfig, txid: TxId, tx: &Transaction) -> anyhow::Result<()> {
    let mut last_err = None;
    for attempt in 1..=3 {
        println!("broadcasting {txid} via {} (attempt {attempt})", config.server);
        let result: anyhow::Result<()> = async {
            let mut client = connect(&config.server).await?;
            broadcast(&mut client, tx).await
        }
        .await;
        match result {
            Ok(()) => {
                println!("broadcast {txid} accepted");
                return Ok(());
            }
            Err(e) => {
                eprintln!("broadcast attempt {attempt} failed: {e:#}");
                last_err = Some(e);
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
    // The transaction is saved; the sync loop keeps rebroadcasting it until it
    // is mined or expires.
    Err(last_err.unwrap().context(format!(
        "transaction {txid} was created but broadcast failed; it will be retried automatically"
    )))
}

/// Shielded Quest claim: the winner's browser sends the pot's seed phrase (decrypted
/// with the final answer) and the winner's shielded address. The whole pot, minus
/// the fee, is swept there, and the pot is locked so a second claim fails.
#[allow(deprecated)]
async fn claim_pot(
    config: &SyncConfig,
    pot_id: &str,
    seed_phrase: &str,
    to: &str,
) -> anyhow::Result<String> {
    let mut pots = load_pots(config);
    let record = pots
        .get(pot_id)
        .cloned()
        .ok_or_else(|| anyhow!("unknown pot {pot_id}"))?;
    if record.claimed_txid.is_some() {
        return Err(anyhow!("this pot has already been claimed"));
    }

    // The seed phrase must be the one this pot was made from.
    let mnemonic = bip39::Mnemonic::parse(seed_phrase.trim())
        .map_err(|_| anyhow!("that is not a valid seed phrase"))?;
    let seed = mnemonic.to_seed("");
    let usk = UnifiedSpendingKey::from_seed(&TestNetwork, &seed, AccountId::ZERO)
        .map_err(|e| anyhow!("deriving pot key: {e:?}"))?;
    let ufvk = usk.to_unified_full_viewing_key();
    if ufvk.encode(&TestNetwork).map_err(|e| anyhow!("encoding the viewing key: {e:?}"))? != record.viewing_key {
        return Err(anyhow!("the seed phrase does not match this pot"));
    }

    // Shielded recipients only, so the prize never lands in a public address.
    let recipient =
        ZcashAddress::from_str(to.trim()).map_err(|_| anyhow!("invalid recipient address"))?;
    if !recipient.can_receive_memo() {
        return Err(anyhow!("please use a shielded (unified) address to receive the prize"));
    }

    let mut db = open_db(config)?;
    let account = db
        .get_account_for_ufvk(&ufvk)?
        .ok_or_else(|| anyhow!("pot {pot_id} is not in the wallet database"))?
        .id();

    // Everything, or fail: never hand the winner a partial sweep.
    let proposal = propose_send_max_transfer(
        &mut db,
        &TestNetwork,
        account,
        &[ShieldedPool::Sapling, ShieldedPool::Orchard, ShieldedPool::Ironwood],
        &StandardFeeRule::Zip317,
        recipient,
        None,
        MaxSpendMode::Everything,
        ConfirmationsPolicy::default(),
        &LockedInputPolicy::Exclude,
        None,
    )
    .map_err(|e: TransferError| {
        anyhow!("the pot can't be swept yet (it may still be confirming, or be empty): {e}")
    })?;

    let prover = LocalTxProver::bundled();
    // Privacy: the pot's full viewing key is published on the hunt page. With
    // OvkPolicy::Sender, anyone holding it could decrypt this sweep's output and
    // learn the winner's address and amount. Discard means only the winner can
    // read it; viewers just see the pot's balance go to zero.
    let txids = create_proposed_transactions(
        &mut db,
        &TestNetwork,
        &SystemClock,
        &mut os_rng(),
        &prover,
        &prover,
        &SpendingKeys::from_unified_spending_key(usk),
        OvkPolicy::Discard,
        &proposal,
        None,
    )
    .map_err(|e: TransferError| anyhow!("could not create the sweep: {e}"))?;
    if txids.len() > 1 {
        return Err(anyhow!("multi-transaction sweeps are not supported"));
    }
    let txid = *txids.first();

    // Lock the pot before broadcasting: the sweep exists now, and the sync loop
    // will keep rebroadcasting it even if this first broadcast fails.
    if let Some(r) = pots.get_mut(pot_id) {
        r.claimed_txid = Some(txid.to_string());
    }
    save_pots(config, &pots)?;
    println!("pot {pot_id} claimed; sweep {txid}");

    let tx = db
        .get_transaction(txid)?
        .ok_or_else(|| anyhow!("created sweep {txid} not found in wallet"))?;
    broadcast_with_retries(config, txid, &tx).await?;
    Ok(txid.to_string())
}
