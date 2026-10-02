# Security review

A self-review of Shielded Quest, done on 2 October 2026 before the feature freeze. It lists
what was checked, what was fixed, and what is knowingly left as a limit. The privacy model and
trust assumptions are in [`quest-web/PRIVACY.md`](quest-web/PRIVACY.md). **Testnet only.**

To report a problem, open an issue or message @Diaguren_Labs.

## What was checked

| Area | Result |
|---|---|
| Secrets in requests | Answers, guesses, stage keys and invite keys never leave the browser. Verified in browser tests that record every request. The only secret-bearing requests are pot creation (the reply carries the seed phrase once) and the claim (seed phrase + payout address). |
| Secrets at rest | The server stores hunt files (ciphertext, public pot details), encrypted media, and the practice-hunt registry. The signer stores its own wallet seed and each pot's viewing key; never a pot's seed phrase. |
| Logging | The web app logs no request bodies. The signer logs transaction ids and error text; error text never includes a seed phrase. |
| Input validation | Hunt ids, media ids and pot ids are checked against strict patterns before touching the filesystem or the signer. Hunt files are validated and rebuilt from known fields only. Claim destinations must be shielded testnet addresses. |
| Write-once storage | Hunt files and media files can't be overwritten. A pot can back one hunt and be claimed once (locked before broadcasting). |
| Rendering | Clue text is rendered as text. Links must start with `http://` or `https://`, open in a new tab, and are never embedded. Media is shown from in-memory `blob:` URLs with its type restricted to image, video or audio. Docs are rendered from this repository's own Markdown files. |
| Headers | `Content-Security-Policy`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. |
| Network exposure | The signer and the web app bind to 127.0.0.1. In a hosted setup only the reverse proxy is public; the signer must never be. |
| Dependencies | Small on purpose: `next`, `react`, `hash-wasm` (Argon2id), `qrcode`, `marked`, a bundled font. No analytics, CDNs or third-party scripts. |

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

## Known limits (accepted for the hackathon)

- **The site serves the code that runs in the browser.** A dishonest or compromised server
  could ship code that leaks answers or invite keys. The Content-Security-Policy narrows this;
  it doesn't remove it. Verifiable builds would.
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
