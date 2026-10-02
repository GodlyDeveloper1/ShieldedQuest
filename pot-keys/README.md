# pot-keys

Makes a Shielded Quest prize pot's keys **in the creator's browser**, so the server never sees
the pot's seed phrase.

A pot is a small Zcash wallet that holds a hunt's prize. This crate turns a 24-word seed phrase
into the pot's unified full viewing key and the seed's ZIP 32 fingerprint. Compiled to
WebAssembly, it runs on the create page: the browser makes the seed phrase, keeps it, and sends
the signer only the viewing key (which can watch the balance but can't spend) and the
fingerprint (a one-way hash).

The derivation is the one `zcash_keys::UnifiedSpendingKey::from_seed` performs (ZIP 32, testnet,
account 0, Orchard + Sapling), written with the underlying `orchard`, `sapling-crypto` and
`zcash_address` crates so the WebAssembly build is pure Rust with no C compiler needed. A test
checks the result is byte-for-byte what `zcash_keys` produces, which is what the signer compares
against when a winner claims.

## Build

```
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File build.ps1
# macOS / Linux
./build.sh
```

This writes `pot_keys.js` and `pot_keys_bg.wasm` into `quest-web/public/wasm/`. They are
committed, so running the web app doesn't need the Rust toolchain.

## Test

```
cargo test
```

## If the module is missing

The web app notices and falls back to asking the signer to make the pot. The create page says
so plainly ("Made by the server"), because in that case the signer does see the seed phrase
once.
