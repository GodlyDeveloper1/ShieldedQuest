#!/usr/bin/env bash
# Builds the pot-keys WebAssembly module into quest-web/public/wasm.
set -euo pipefail
cd "$(dirname "$0")"
BINDGEN=0.2.129   # must match the wasm-bindgen version in Cargo.lock
rustup target add wasm32-unknown-unknown
wasm-bindgen --version 2>/dev/null | grep -q "$BINDGEN" || cargo install wasm-bindgen-cli --version "$BINDGEN" --locked
cargo build --release --locked --target wasm32-unknown-unknown
mkdir -p ../quest-web/public/wasm
wasm-bindgen --target no-modules --no-typescript --out-dir ../quest-web/public/wasm target/wasm32-unknown-unknown/release/pot_keys.wasm
ls -l ../quest-web/public/wasm
