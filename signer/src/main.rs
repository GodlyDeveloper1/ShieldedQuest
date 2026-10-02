// Testnet-only Zcash signer sidecar.
//
// Proof 1 (derive): done.
// Proof 2 step A (this file): keep ONE wallet seed on disk and hand out a fresh
//   diversified address per request, never reusing one.
// Proof 2 step B (sync.rs): a background thread scans the chain via lightwalletd
//   into a local wallet DB; GET /payments lists what was received.
// Step C (sync.rs): full transactions are fetched so memos are decoded.
// Proof 3 (sync.rs): POST /send builds, proves and broadcasts a shielded payment.
//
// The seed file lives in ./data (gitignored). It is testnet only. Never commit it.

mod sync;

use axum::{extract::State, http::StatusCode, routing::get, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{atomic::Ordering, Arc, Mutex},
};
use zcash_protocol::memo::{Memo, MemoBytes};
use zcash_protocol::TxId;
use zcash_keys::keys::{UnifiedAddressRequest, UnifiedFullViewingKey, UnifiedSpendingKey};
use zcash_protocol::consensus::TestNetwork;
use zip32::{AccountId, DiversifierIndex};

#[derive(Serialize, Deserialize)]
struct WalletFile {
    mnemonic: String,
    next_index: u32, // next diversifier index to try; only ever goes up
}

struct AppState {
    ufvk: UnifiedFullViewingKey,
    wallet: Mutex<WalletFile>,
    path: PathBuf,
    db_path: PathBuf,
    sync_status: Arc<sync::SyncStatus>,
    wallet_tx: tokio::sync::mpsc::UnboundedSender<sync::Command>,
}

fn data_dir() -> PathBuf {
    std::env::var("SIGNER_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("data"))
}

fn load_or_create_wallet(path: &PathBuf) -> WalletFile {
    if let Ok(text) = fs::read_to_string(path) {
        return serde_json::from_str(&text).expect("wallet file is corrupt");
    }
    let mut entropy = [0u8; 32];
    getrandom::getrandom(&mut entropy).expect("rng");
    let mnemonic = bip39::Mnemonic::from_entropy(&entropy).expect("mnemonic");
    let wallet = WalletFile { mnemonic: mnemonic.to_string(), next_index: 0 };
    save_wallet(path, &wallet);
    println!("created new testnet wallet at {}", path.display());
    wallet
}

fn save_wallet(path: &PathBuf, wallet: &WalletFile) {
    fs::create_dir_all(path.parent().unwrap()).expect("create data dir");
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(wallet).unwrap()).expect("write wallet");
    fs::rename(&tmp, path).expect("save wallet"); // atomic replace
}

async fn health() -> &'static str {
    "ok"
}

#[derive(Serialize)]
struct ViewingKey {
    ufvk: String,
}

// The viewing key can see incoming payments but cannot spend.
async fn viewing_key(State(s): State<Arc<AppState>>) -> Json<ViewingKey> {
    Json(ViewingKey { ufvk: s.ufvk.encode(&TestNetwork) })
}

#[derive(Serialize)]
struct NewAddress {
    address: String,
    diversifier_index: u32,
}

// Proof 2 step A: a fresh deposit address per call (one per auction / bid / hunt).
async fn new_address(State(s): State<Arc<AppState>>) -> Json<NewAddress> {
    let mut w = s.wallet.lock().unwrap();
    let (ua, idx) = s
        .ufvk
        .find_address(DiversifierIndex::from(w.next_index), UnifiedAddressRequest::AllAvailableKeys)
        .expect("address");
    // find_address may skip invalid indices, so continue from the one it actually used.
    let used = u32::try_from(idx).expect("diversifier index fits in u32");
    w.next_index = used + 1;
    save_wallet(&s.path, &w);
    Json(NewAddress { address: ua.encode(&TestNetwork), diversifier_index: used })
}

#[derive(Serialize)]
struct Payment {
    txid: String,
    mined_height: Option<u32>,
    pool: String,
    value_zatoshis: i64,
    to_address: Option<String>,
    memo: Option<String>,
}

#[derive(Serialize)]
struct SentOutput {
    value_zatoshis: i64,
    to_address: Option<String>,
    memo: Option<String>,
}

#[derive(Serialize)]
struct SentTx {
    txid: String,
    /// "mined", "pending" (broadcast or not, waiting to be mined) or "expired"
    status: String,
    mined_height: Option<u32>,
    expiry_height: Option<u32>,
    fee_zatoshis: Option<i64>,
    outputs: Vec<SentOutput>,
}

#[derive(Serialize)]
struct PaymentsResponse {
    chain_tip: u32,
    scanned_height: u32,
    sync_error: Option<String>,
    balance_total_zatoshis: u64,
    balance_spendable_zatoshis: u64,
    payments: Vec<Payment>,
    sent: Vec<SentTx>,
}

fn pool_name(code: i64) -> String {
    match code {
        0 => "transparent".into(),
        2 => "sapling".into(),
        3 => "orchard".into(),
        4 => "ironwood".into(),
        other => format!("pool {other}"),
    }
}

fn memo_text(bytes: Option<Vec<u8>>) -> Option<String> {
    let memo = MemoBytes::from_bytes(&bytes?).ok().and_then(|m| Memo::try_from(m).ok())?;
    match memo {
        Memo::Empty => None,
        Memo::Text(text) => Some(text.to_string()),
        _ => Some("<non-text memo>".into()),
    }
}

fn open_read_only(db_path: &Path) -> anyhow::Result<rusqlite::Connection> {
    let conn = rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    rusqlite::vtab::array::load_module(&conn)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(conn)
}

fn txid_string(bytes: Vec<u8>) -> anyhow::Result<String> {
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| anyhow::anyhow!("txid is not 32 bytes"))?;
    Ok(TxId::from_bytes(arr).to_string())
}

// Transactions that spent our funds, with their status and non-change outputs.
fn read_sent(db_path: &Path) -> anyhow::Result<Vec<SentTx>> {
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let conn = open_read_only(db_path)?;
    let mut tx_stmt = conn.prepare(
        "SELECT txid, mined_height, expiry_height, fee_paid, expired_unmined
         FROM v_transactions
         WHERE account_balance_delta < 0
         ORDER BY COALESCE(mined_height, expiry_height)",
    )?;
    let mut out_stmt = conn.prepare(
        "SELECT value, to_address, memo FROM v_tx_outputs
         WHERE txid = ?1
           AND NOT (is_change = 1 AND (memo IS NULL OR substr(memo, 1, 1) = X'F6'))",
    )?;
    let rows = tx_stmt.query_map([], |row| {
        let txid: Vec<u8> = row.get(0)?;
        let mined: Option<u32> = row.get(1)?;
        let expiry: Option<u32> = row.get(2)?;
        let fee: Option<i64> = row.get(3)?;
        let expired: Option<bool> = row.get(4)?;
        Ok((txid, mined, expiry, fee, expired.unwrap_or(false)))
    })?;

    let mut sent = Vec::new();
    for row in rows {
        let (txid_bytes, mined_height, expiry_height, fee, expired) = row?;
        let outputs = out_stmt
            .query_map([&txid_bytes], |r| {
                let memo: Option<Vec<u8>> = r.get(2)?;
                Ok(SentOutput { value_zatoshis: r.get(0)?, to_address: r.get(1)?, memo: memo_text(memo) })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let status = if mined_height.is_some() {
            "mined"
        } else if expired {
            "expired"
        } else {
            "pending"
        };
        sent.push(SentTx {
            txid: txid_string(txid_bytes)?,
            status: status.into(),
            mined_height,
            expiry_height,
            fee_zatoshis: fee,
            outputs,
        });
    }
    Ok(sent)
}

// Reads received (non-change) outputs from the wallet DB the sync thread maintains.
fn read_payments(db_path: &Path) -> anyhow::Result<Vec<Payment>> {
    if !db_path.exists() {
        return Ok(vec![]);
    }
    let conn = open_read_only(db_path)?;

    let mut stmt = conn.prepare(
        "SELECT t.txid, t.mined_height, o.output_pool, o.value, o.to_address, o.memo
         FROM v_tx_outputs o
         JOIN v_transactions t ON t.txid = o.txid
         WHERE o.to_account_uuid IS NOT NULL
           -- hide plain change, but keep self-sends that carry a memo
           AND NOT (o.is_change = 1 AND (o.memo IS NULL OR substr(o.memo, 1, 1) = X'F6'))
         ORDER BY t.mined_height",
    )?;
    let rows = stmt.query_map([], |row| {
        let txid: Vec<u8> = row.get(0)?;
        Ok((txid, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
    })?;

    let mut out = Vec::new();
    for row in rows {
        let (txid, mined_height, pool, value, to_address, memo): (
            Vec<u8>,
            Option<u32>,
            i64,
            i64,
            Option<String>,
            Option<Vec<u8>>,
        ) = row?;
        let txid: [u8; 32] = txid
            .try_into()
            .map_err(|_| anyhow::anyhow!("txid is not 32 bytes"))?;
        out.push(Payment {
            txid: TxId::from_bytes(txid).to_string(),
            mined_height,
            pool: pool_name(pool),
            value_zatoshis: value,
            to_address,
            memo: memo_text(memo),
        });
    }
    Ok(out)
}

// Proof 2 step B: what has the wallet received, and how far has it scanned?
async fn payments(
    State(s): State<Arc<AppState>>,
) -> Result<Json<PaymentsResponse>, (StatusCode, String)> {
    let payments = read_payments(&s.db_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}")))?;
    let sent = read_sent(&s.db_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}")))?;
    let st = &s.sync_status;
    Ok(Json(PaymentsResponse {
        chain_tip: st.chain_tip.load(Ordering::Relaxed),
        scanned_height: st.scanned_height.load(Ordering::Relaxed),
        sync_error: st.last_error.lock().unwrap().clone(),
        balance_total_zatoshis: st.balance_total.load(Ordering::Relaxed),
        balance_spendable_zatoshis: st.balance_spendable.load(Ordering::Relaxed),
        payments,
        sent,
    }))
}

#[derive(Deserialize)]
struct SendBody {
    to: String,
    zatoshis: u64,
    memo: Option<String>,
}

#[derive(Serialize)]
struct SendResponse {
    txid: String,
}

// Proof 3: queue a payment to the wallet worker, which proves and broadcasts it.
// Proving takes a few seconds.
async fn send(
    State(s): State<Arc<AppState>>,
    Json(body): Json<SendBody>,
) -> Result<Json<SendResponse>, (StatusCode, String)> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    let request = sync::SendRequest { to: body.to, zatoshis: body.zatoshis, memo: body.memo };
    s.wallet_tx
        .send(sync::Command::Send { request, reply: reply_tx })
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "wallet worker stopped".to_string()))?;
    match reply_rx.await {
        Ok(Ok(txid)) => Ok(Json(SendResponse { txid })),
        Ok(Err(e)) => Err((StatusCode::BAD_REQUEST, format!("{e:#}"))),
        Err(_) => Err((StatusCode::SERVICE_UNAVAILABLE, "wallet worker stopped".to_string())),
    }
}

// Shielded Quest: make a pot. The seed phrase is returned once and not kept.
async fn create_pot(
    State(s): State<Arc<AppState>>,
) -> Result<Json<sync::NewPot>, (StatusCode, String)> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    s.wallet_tx
        .send(sync::Command::CreatePot { reply: reply_tx })
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "wallet worker stopped".to_string()))?;
    match reply_rx.await {
        Ok(Ok(pot)) => Ok(Json(pot)),
        Ok(Err(e)) => Err((StatusCode::BAD_GATEWAY, format!("{e:#}"))),
        Err(_) => Err((StatusCode::SERVICE_UNAVAILABLE, "wallet worker stopped".to_string())),
    }
}

#[derive(Deserialize)]
struct ImportPotBody {
    viewing_key: String,
    seed_fingerprint: String,
}

// Shielded Quest: register a pot whose keys were made in the creator's browser.
// Only the viewing key and the seed's fingerprint arrive; the seed phrase never does.
async fn import_pot(
    State(s): State<Arc<AppState>>,
    Json(body): Json<ImportPotBody>,
) -> Result<Json<sync::ImportedPot>, (StatusCode, String)> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    s.wallet_tx
        .send(sync::Command::ImportPot {
            viewing_key: body.viewing_key,
            seed_fingerprint: body.seed_fingerprint,
            reply: reply_tx,
        })
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "wallet worker stopped".to_string()))?;
    match reply_rx.await {
        Ok(Ok(pot)) => Ok(Json(pot)),
        Ok(Err(e)) => Err((StatusCode::BAD_REQUEST, format!("{e:#}"))),
        Err(_) => Err((StatusCode::SERVICE_UNAVAILABLE, "wallet worker stopped".to_string())),
    }
}

// Shielded Quest: a pot's verified balance, as seen through its viewing key.
async fn get_pot(
    State(s): State<Arc<AppState>>,
    axum::extract::Path(pot_id): axum::extract::Path<String>,
) -> Result<Json<sync::PotStatus>, (StatusCode, String)> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    s.wallet_tx
        .send(sync::Command::PotInfo { pot_id, reply: reply_tx })
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "wallet worker stopped".to_string()))?;
    match reply_rx.await {
        Ok(Ok(info)) => Ok(Json(info)),
        Ok(Err(e)) => Err((StatusCode::NOT_FOUND, format!("{e:#}"))),
        Err(_) => Err((StatusCode::SERVICE_UNAVAILABLE, "wallet worker stopped".to_string())),
    }
}

#[derive(Deserialize)]
struct ClaimBody {
    seed_phrase: String,
    to: String,
}

// Shielded Quest: sweep a pot to the winner. Never log the request body.
async fn claim_pot(
    State(s): State<Arc<AppState>>,
    axum::extract::Path(pot_id): axum::extract::Path<String>,
    Json(body): Json<ClaimBody>,
) -> Result<Json<SendResponse>, (StatusCode, String)> {
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    s.wallet_tx
        .send(sync::Command::ClaimPot {
            pot_id,
            seed_phrase: body.seed_phrase,
            to: body.to,
            reply: reply_tx,
        })
        .map_err(|_| (StatusCode::SERVICE_UNAVAILABLE, "wallet worker stopped".to_string()))?;
    match reply_rx.await {
        Ok(Ok(txid)) => Ok(Json(SendResponse { txid })),
        Ok(Err(e)) => Err((StatusCode::BAD_REQUEST, format!("{e:#}"))),
        Err(_) => Err((StatusCode::SERVICE_UNAVAILABLE, "wallet worker stopped".to_string())),
    }
}

#[tokio::main]
async fn main() {
    let path = data_dir().join("wallet.json");
    let wallet = load_or_create_wallet(&path);

    let mnemonic = bip39::Mnemonic::parse(&wallet.mnemonic).expect("stored mnemonic");
    let seed = mnemonic.to_seed("");
    let usk = UnifiedSpendingKey::from_seed(&TestNetwork, &seed, AccountId::ZERO)
        .expect("spending key");
    let ufvk = usk.to_unified_full_viewing_key();

    // Start the background chain sync (proof 2 step B).
    let db_path = data_dir().join("wallet.sqlite");
    let sync_status = Arc::new(sync::SyncStatus::default());
    let server = std::env::var("LIGHTWALLETD_URL")
        .unwrap_or_else(|_| "https://testnet.zec.rocks:443".to_string());
    let birthday = std::env::var("SIGNER_BIRTHDAY").ok().and_then(|s| s.parse().ok());
    println!("syncing against {server}");
    let wallet_tx = sync::spawn(
        sync::SyncConfig { seed: seed.to_vec(), db_path: db_path.clone(), server, birthday },
        sync_status.clone(),
    );

    let state = Arc::new(AppState {
        ufvk,
        wallet: Mutex::new(wallet),
        path,
        db_path,
        sync_status,
        wallet_tx,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/viewing-key", get(viewing_key))
        .route("/address", post(new_address))
        .route("/payments", get(payments))
        .route("/send", post(send))
        .route("/pots", post(create_pot))
        .route("/pots/import", post(import_pot))
        .route("/pots/{id}", get(get_pot))
        .route("/pots/{id}/claim", post(claim_pot))
        .with_state(state);

    // Always loopback-only. SIGNER_PORT lets a second, test instance run beside the main one.
    let port: u16 = std::env::var("SIGNER_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8081);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    println!("signer listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
