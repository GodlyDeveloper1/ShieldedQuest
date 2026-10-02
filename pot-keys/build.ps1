# Builds the pot-keys WebAssembly module and puts it where the web app serves it
# (quest-web/public/wasm). Run from PowerShell:
#   powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Must match the wasm-bindgen version in Cargo.lock.
$bindgen = "0.2.129"

rustup target add wasm32-unknown-unknown
$have = ""
try { $have = (& wasm-bindgen --version) 2>$null } catch {}
if (-not $have -or -not $have.Contains($bindgen)) {
  cargo install wasm-bindgen-cli --version $bindgen --locked
}

cargo build --release --locked --target wasm32-unknown-unknown
New-Item -ItemType Directory -Force ..\quest-web\public\wasm | Out-Null
wasm-bindgen --target no-modules --no-typescript --out-dir ..\quest-web\public\wasm target\wasm32-unknown-unknown\release\pot_keys.wasm
Get-ChildItem ..\quest-web\public\wasm
