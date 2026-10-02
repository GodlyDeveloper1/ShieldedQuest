//! Shielded Quest: pot keys made in the browser.
//!
//! A hunt's prize sits in a "pot", a small Zcash wallet. This crate, compiled to
//! WebAssembly, lets the creator's browser make that wallet itself:
//!
//!   24-word seed phrase  ->  unified full viewing key (UFVK) + seed fingerprint
//!
//! Only the viewing key (which can watch the balance but not spend) and the
//! fingerprint (a one-way hash of the seed) are sent to the server. The seed
//! phrase stays in the browser, where it is sealed inside the hunt's last stage.
//!
//! The derivation is the same one the signer uses (ZIP 32 account 0 on testnet),
//! so a winner's seed phrase later derives exactly the registered viewing key.

use sapling::zip32::ExtendedSpendingKey;
use wasm_bindgen::prelude::*;
use zcash_address::unified::{self, Encoding};
use zcash_protocol::consensus::NetworkType;
use zip32::{fingerprint::SeedFingerprint, AccountId, ChildIndex};

/// ZIP 32 coin type for Zcash testnet.
const COIN_TYPE: u32 = 1;

/// What the browser gets back. `seed_phrase` must never leave the browser.
pub struct Keys {
    pub seed_phrase: String,
    pub viewing_key: String,
    pub seed_fingerprint: String,
}

/// Derives a pot's public keys from its seed phrase.
///
/// This is the derivation `zcash_keys::UnifiedSpendingKey::from_seed` performs
/// (ZIP 32, testnet, account 0, Orchard + Sapling), written out with the
/// underlying crates so the build has no C dependencies. A test checks the
/// result is identical to `zcash_keys`.
pub fn derive(seed_phrase: &str) -> Result<Keys, String> {
    let mnemonic = bip39::Mnemonic::parse(seed_phrase.trim())
        .map_err(|_| "that is not a valid seed phrase".to_string())?;
    if mnemonic.word_count() != 24 {
        return Err("expected a 24-word seed phrase".to_string());
    }
    let seed = mnemonic.to_seed("");
    let account = AccountId::ZERO;

    // Orchard: full viewing key (96 bytes).
    let orchard_sk = orchard::keys::SpendingKey::from_zip32_seed(&seed, COIN_TYPE, account)
        .map_err(|e| format!("deriving the Orchard key: {e:?}"))?;
    let orchard_fvk = orchard::keys::FullViewingKey::from(&orchard_sk).to_bytes();

    // Sapling: diversifiable full viewing key (128 bytes), path m/32'/1'/0'.
    let sapling_extsk = ExtendedSpendingKey::from_path(
        &ExtendedSpendingKey::master(&seed),
        &[ChildIndex::hardened(32), ChildIndex::hardened(COIN_TYPE), account.into()],
    );
    let sapling_dfvk = sapling_extsk.to_diversifiable_full_viewing_key().to_bytes();

    let ufvk = unified::Ufvk::try_from_items(vec![
        unified::Fvk::Orchard(orchard_fvk),
        unified::Fvk::Sapling(sapling_dfvk),
    ])
    .map_err(|e| format!("building the viewing key: {e:?}"))?;

    let fingerprint = SeedFingerprint::from_seed(&seed).ok_or("bad seed length")?;
    Ok(Keys {
        seed_phrase: mnemonic.to_string(),
        viewing_key: ufvk.encode(&NetworkType::Test),
        seed_fingerprint: fingerprint.to_bytes().iter().map(|b| format!("{b:02x}")).collect(),
    })
}

/// Makes a brand-new pot from 256 bits of the browser's secure randomness.
pub fn generate() -> Result<Keys, String> {
    let mut entropy = [0u8; 32];
    getrandom::getrandom(&mut entropy).map_err(|e| format!("randomness unavailable: {e}"))?;
    let mnemonic = bip39::Mnemonic::from_entropy(&entropy).map_err(|e| format!("mnemonic: {e:?}"))?;
    let keys = derive(&mnemonic.to_string());
    entropy.fill(0);
    keys
}

// ---------------------------------------------------------------------------
// JavaScript interface
// ---------------------------------------------------------------------------

/// A pot's keys, as seen from JavaScript.
#[wasm_bindgen]
pub struct PotKeys {
    seed_phrase: String,
    viewing_key: String,
    seed_fingerprint: String,
}

#[wasm_bindgen]
impl PotKeys {
    /// The 24 words. Keep them in the browser.
    #[wasm_bindgen(getter)]
    pub fn seed_phrase(&self) -> String {
        self.seed_phrase.clone()
    }

    /// Safe to send to the server: it can see the pot's balance, not spend it.
    #[wasm_bindgen(getter)]
    pub fn viewing_key(&self) -> String {
        self.viewing_key.clone()
    }

    /// Safe to send to the server: a one-way hash of the seed (ZIP 32), 64 hex characters.
    #[wasm_bindgen(getter)]
    pub fn seed_fingerprint(&self) -> String {
        self.seed_fingerprint.clone()
    }
}

impl From<Keys> for PotKeys {
    fn from(k: Keys) -> Self {
        PotKeys { seed_phrase: k.seed_phrase, viewing_key: k.viewing_key, seed_fingerprint: k.seed_fingerprint }
    }
}

/// Makes a new pot in the browser.
#[wasm_bindgen]
pub fn new_pot() -> Result<PotKeys, JsError> {
    generate().map(PotKeys::from).map_err(|e| JsError::new(&e))
}

/// Re-derives a pot's public keys from its seed phrase (used to double-check a pot).
#[wasm_bindgen]
pub fn pot_from_phrase(seed_phrase: &str) -> Result<PotKeys, JsError> {
    derive(seed_phrase).map(PotKeys::from).map_err(|e| JsError::new(&e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use zcash_keys::keys::{UnifiedFullViewingKey, UnifiedSpendingKey};
    use zcash_protocol::consensus::TestNetwork;

    // The standard BIP 39 test phrase; never funded.
    const PHRASE: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";

    #[test]
    fn derives_a_testnet_viewing_key_with_both_shielded_pools() {
        let k = derive(PHRASE).unwrap();
        assert!(k.viewing_key.starts_with("uviewtest1"));
        let ufvk = UnifiedFullViewingKey::decode(&TestNetwork, &k.viewing_key).unwrap();
        assert!(ufvk.orchard().is_some() && ufvk.sapling().is_some());
        assert_eq!(k.seed_fingerprint.len(), 64);
    }

    #[test]
    fn is_deterministic_and_forgiving_about_spacing() {
        let a = derive(PHRASE).unwrap();
        let b = derive(&format!("  {PHRASE}\n")).unwrap();
        assert_eq!(a.viewing_key, b.viewing_key);
        assert_eq!(a.seed_fingerprint, b.seed_fingerprint);
    }

    #[test]
    fn matches_the_signers_derivation() {
        // The signer computes exactly this at claim time and compares the strings.
        for _ in 0..8 {
            let k = generate().unwrap();
            let seed = bip39::Mnemonic::parse(k.seed_phrase.as_str()).unwrap().to_seed("");
            let usk = UnifiedSpendingKey::from_seed(&TestNetwork, &seed, AccountId::ZERO).unwrap();
            assert_eq!(k.viewing_key, usk.to_unified_full_viewing_key().encode(&TestNetwork));
        }
        let seed = bip39::Mnemonic::parse(PHRASE).unwrap().to_seed("");
        let usk = UnifiedSpendingKey::from_seed(&TestNetwork, &seed, AccountId::ZERO).unwrap();
        let expected = usk.to_unified_full_viewing_key().encode(&TestNetwork);
        assert_eq!(derive(PHRASE).unwrap().viewing_key, expected);
        let fp = SeedFingerprint::from_seed(&seed).unwrap().to_bytes();
        let hex: String = fp.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(derive(PHRASE).unwrap().seed_fingerprint, hex);
    }

    #[test]
    fn new_pots_are_different_and_valid() {
        let a = generate().unwrap();
        let b = generate().unwrap();
        assert_ne!(a.seed_phrase, b.seed_phrase);
        assert_ne!(a.viewing_key, b.viewing_key);
        assert_eq!(a.seed_phrase.split(' ').count(), 24);
        assert_eq!(derive(&a.seed_phrase).unwrap().viewing_key, a.viewing_key);
    }

    #[test]
    fn rejects_bad_phrases() {
        assert!(derive("not a seed phrase").is_err());
        assert!(derive("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about").is_err());
    }
}
