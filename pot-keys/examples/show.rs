// Prints the public keys for the standard BIP 39 test phrase (never funded).
// Handy for checking a WebAssembly build gives the same answer as a native one.
fn main() {
    let phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
    let k = pot_keys::derive(phrase).expect("derive");
    println!("{}\n{}", k.viewing_key, k.seed_fingerprint);
}
