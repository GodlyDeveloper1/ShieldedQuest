# Security review

A self-review of Shielded Quest, done on 2 October 2026 before the feature freeze. It lists
what was checked, what was fixed, and what is knowingly left as a limit. The privacy model and
trust assumptions are in [`quest-web/PRIVACY.md`](quest-web/PRIVACY.md). **Testnet only.**

To report a problem, open an issue or message @Diaguren_Labs.

## What was checked

| Area | Result |
|---|---|
| Secrets in requests | Answers, guesses, stage keys and invite keys never leave the browser. Verified by the browser tests in `privacy-tests/`, which record every request, read back what the server stored and what the signer was sent, and run on every push. The only secret-bearing request is the claim (seed phrase + payout address). Pot creation sends the pot's viewing key and seed fingerprint, not the seed phrase, which is made in the creator's browser. The server-made fallback (browsers without WebAssembly, and practice hunts) returns the phrase once. |
| Secrets at rest | The server stores hunt files (ciphertext, public pot details), encrypted media, and the practice-hunt registry. The signer stores its own wallet seed and each pot's viewing key; never a pot's seed phrase. |
| Logging | The web app logs no request bodies. The signer logs transaction ids and error text; error text never includes a seed phrase. |
| Input validation | Hunt ids, media ids and pot ids are checked against strict patterns before touching the filesystem or the signer. Hunt files are validated and rebuilt from known fields only. Claim destinations must be shielded testnet addresses. |
| Write-once storage | Hunt files and media files can't be overwritten. A pot can back one hunt and be claimed once (locked before broadcasting). |
| Rendering | Clue text is rendered as text. Links must start with `http://` or `https://`, open in a new tab, and are never embedded. Media is shown from in-memory `blob:` URLs with its type restricted to image, video or audio. Docs are rendered from this repository's own Markdown files. |
| Headers | `Content-Security-Policy`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. |
| Network exposure | Run from source, the signer and the web app bind to 127.0.0.1. With Docker Compose, the signer has no published port and shares a private network with the web app only; the web app is published on 127.0.0.1. The signer has no authentication, so it must never be reachable by anything but the web app. In a hosted setup only the reverse proxy is public. |
| Key derivation in the browser | The `pot-keys` module derives the pot's viewing key with the same `orchard`, `sapling-crypto` and `zip32` crates the signer uses. A test checks it against `zcash_keys`; a browser test checks the WebAssembly build against the native build. The signer rejects a viewing key that lacks a shielded pool, a malformed fingerprint, and a key that is already registered. The browser rejects a reply that names a different viewing key. |
| Dependencies | Small on purpose: `next`, `react`, `hash-wasm` (Argon2id), `qrcode`, `marked`, a bundled font, and the site's own `pot-keys` module. No analytics, CDNs or third-party scripts. |

## Fixed in this review

1. **Unbounded request bodies.** Route handlers read the whole body before checking its size,
   and a missing or false `Content-Length` could make the server buffer a huge upload. Bodies are
   now read in chunks and dropped the moment they pass the limit (hunt file 100 kB, claim 4 kB,
   media 25 MB).
2. **Rate limits could be dodged behind a proxy.** The limiter trusted the first
   `X-Forwarded-For` entry, which the visitor controls. It now uses the last entry, the one
   our own proxy appends.
3. **Page views could become signer work.** Listing hunts and showing a balance called the
   signer on every request. Pot status is now cached for a few seconds, and cleared on a claim.
4. **Media storage could be filled by one visitor.** Added a byte budget per visitor per hour
   (200 MB) on top of the request limit, and abandoned uploads are now deleted after two hours
   instead of a day.
5. **Practice-hunt prizes could be drained in a loop.** Refills are capped per hour, and claimed
   practice hunts are no longer re-checked on every visit.
6. **No Content-Security-Policy.** Added one: scripts, styles, fonts, images and requests may
   only come from the site itself (plus in-memory `data:` and `blob:`). The browser now enforces
   the "talks to nobody else" promise, and an injected script couldn't send an invite key or a
   guess to another server with `fetch`, an image or a form.
7. **Ignore rules.** `.env` files, build output and development screenshots are now ignored, as
   well as every signer data folder.
8. **The server saw every pot's seed phrase at creation.** The signer made each pot and handed
   the phrase to the creator's browser. The browser now makes the pot itself and the server is
   given only the viewing key. This removed the largest trust assumption in the first design.

## Known limits (accepted for the hackathon)

- **The site serves the code that runs in the browser.** A dishonest or compromised server
  could ship code that leaks answers or invite keys. The Content-Security-Policy narrows this;
  it doesn't remove it. Verifiable builds would.
- **The pot address is derived by the signer.** The browser verifies the registered viewing
  key, not the address it is told to fund. A creator can confirm a deposit landed in the pot by
  checking the published viewing key with their own tool.
- **`'wasm-unsafe-eval'` in the script policy.** Needed to run WebAssembly (Argon2id and the
  key module). It allows compiling WebAssembly from the site's own files, not JavaScript `eval`.
- **The claim trusts the signer.** A one-click claim sends the pot's seed phrase and the
  winner's address through the site. Winners who don't want that can sweep the pot themselves
  with the unlocked seed phrase.
- **`'unsafe-inline'` in the script policy.** Next.js needs it for its own bootstrap scripts
  without per-request nonces. Requests and images are still restricted to the site.
- **Rate limits are in memory.** They reset when the app restarts and assume a single server.
- **Offline guessing.** Anyone can download a hunt file and guess as fast as Argon2id allows;
  weak final answers are warned about, not forbidden.
- **A public light-client server** (the default `testnet.zec.rocks`) sees the operator's IP and
  every broadcast. Running your own node removes that.
