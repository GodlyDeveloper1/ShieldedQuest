# How it works

Three parts: your **browser** does the cryptography, the **web app** stores public hunt files,
and the **signer** (the only part holding keys) makes and pays out prize pots on the Zcash
testnet.

```
 your browser                    the site                 the signer              Zcash testnet
 ─────────────                   ────────                 ──────────              ─────────────
 answers → Argon2id   ─────────▶ stores the hunt file ──▶ makes the prize pot ──▶ shielded pool
 stages ↔ AES-GCM                (ciphertext only)        sweeps it on a claim
```

## 1. Locking a hunt

A hunt has stages. Each stage has an answer. Your browser turns each answer into a key:

```
k₁ = Argon2id(answer₁, hunt id ‖ 1 ‖ 000…0)
k₂ = Argon2id(answer₂, hunt id ‖ 2 ‖ k₁)
kₙ = Argon2id(answerₙ, hunt id ‖ n ‖ kₙ₋₁)
```

Argon2id is deliberately slow and memory-hungry (64 MiB, 3 passes), so every guess costs real
work. Each key also depends on the one before, so the last stage can't be attacked without
solving every earlier one first.

Stage *i* is the next clue (or, for the last stage, the prize pot's seed phrase) encrypted with
`kᵢ` using AES-256-GCM. Every stage is padded to the same size, so nobody can tell which one
holds the prize or how long the clues are.

Answers are forgiving: case, accents, punctuation and extra spaces are ignored, so
"The Eiffel-Tower!" and "the eiffel tower" give the same key.

## 2. The prize pot

When you create a hunt, the signer makes a brand-new Zcash wallet just for the prize (the
**pot**) and hands its 24-word seed phrase to your browser once. Your browser seals it into the
last stage and gives you a backup. The signer keeps only the pot's **viewing key**, which can
see the balance but can't spend.

You fund the pot like any Zcash address. The viewing key is published on the hunt page, so
anyone can confirm the prize is there.

## 3. Solving

The hunt page downloads the public hunt file. Each guess is run through Argon2id and tried
against the current stage, entirely in your browser. A wrong guess fails to decrypt; a right
one reveals the next clue. Nothing about your guesses is sent anywhere.

## 4. Claiming

The final answer reveals the pot's seed phrase. Then either:

- **Claim with one click.** Your browser sends the phrase and your shielded address to the
  signer, which moves the whole pot to you in one shielded transaction and locks the pot so a
  second claim fails.
- **Sweep it yourself.** Restore the phrase in any Zcash wallet and send the funds to yourself.
  Nothing is sent to the site.

The one-click claim is built so the published viewing key **can't** decrypt where the prize
went (the sweep discards its outgoing viewing key). Everyone sees the pot empty; nobody sees
the winner.

## Built with

Zcash's `librustzcash` crates (wallet sync, Sapling/Orchard/Ironwood shielded pools, proving)
in a Rust signer; Next.js for the site; `hash-wasm` Argon2id and the browser's WebCrypto
AES-GCM for the stages. Source and tests are in the repository.
