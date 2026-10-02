# privacy-tests

Browser tests for Shielded Quest's privacy claims. Each test drives the real pages in a real
browser (Chromium, through Playwright), records **every request the browser makes**, and checks
what was in them. They also read back what the server side ended up holding: the files the web
app wrote and everything the signer was sent.

They run against a production build of `quest-web`, with its Content-Security-Policy and rate
limits on, not against the development server.

## Run them

You need Node.js 22 or newer. No signer, no wallet and no testnet coins: a small stand-in
signer (`mock-signer.mjs`) answers the routes the web app calls.

```
cd quest-crypto && npm install && cd ..
cd quest-web && npm install && cd ..
cd privacy-tests
npm install
npm run browser     # once: downloads the test browser
npm test
```

If the browser download fails (it comes from `cdn.playwright.dev`), skip `npm run browser` and
use a browser already on the computer instead: `npm run test:edge` or `npm run test:chrome`.

The first lines install the web app, which the tests build and start themselves on port 13000
(the stand-in signer uses 18081). Hunts made by the tests go into `privacy-tests/.data/`, never
into `quest-web/data/`. A run takes about a minute after the build.

## What each test checks

| File | Claim on the site | What the test does |
|---|---|---|
| `01-guesses` | Guesses never leave your browser | A solver makes wrong and right guesses. No request carries any of them. While guessing, the browser sends nothing with a body or a query string; the only request is the periodic balance check. A reload restores progress with no cookie and nothing that tells the server which stage the solver is on. The stored hunt file and the signer's log contain no answer and no later clue. |
| `02-prize-key` | The prize key is made in your browser | Creating a hunt sends one pot request whose body is exactly `viewing_key` and `seed_fingerprint`. The 24 words appear in no request, in nothing the signer received and in no stored file. The server-made fallback route is never called. Two hunts get two different keys. The WebAssembly module derives the same viewing key as the native build for a known test phrase. |
| `03-private-hunt` | A private hunt's title, first clue and invite key never reach the server | The creator's and a guest's browsers send none of them, in an address, a header or a body. The stored file has a placeholder title and an empty first clue. The hunt isn't listed. Without the invite the page is locked and the server's reply contains no title; a made-up key doesn't open it. |
| `04-claim` | One request, one shielded payment | The solver's browser unlocks the same 24 words the creator's browser made. Showing them (to sweep the pot yourself) sends nothing. The one-click claim is the only request that ever carries them, it goes to this site, and its body is exactly the phrase and the payout address. A second claim and a transparent address are refused. The explorer link is never contacted by the page. |
| `05-network` | No accounts, no tracking; the site talks to nobody else | Every page loads from this site only: no other host, no cookie, no WebSocket, no request other than page loads. The Content-Security-Policy names no other origin, and the browser really does stop a `fetch`, a beacon, an image and a form aimed at another server. |
| `06-media` | Clue media is encrypted in your browser | Uploads contain no plaintext, no file name and no file type. Stored media is ciphertext. A solver's browser fetches every media file when the page opens, so solving a stage triggers no media request, and the pictures still decrypt and display. |

## How a secret is searched for

A request "carries" a secret if the secret appears in its address, headers or body: as typed,
lower-cased, with its words joined in several ways, percent-encoded, Base64 or hex. For a seed
phrase, several of its words turning up as separate tokens also counts.

No search can rule out every possible transformation. So wherever it can, a test asserts
something stronger than "not found": that no request with a body was made at all (guessing),
or that a body has exactly the expected fields (the pot request, the claim).

## Do the tests catch a leak?

They were checked against deliberate ones. With each of these changes made to the app, the
matching test failed; with the changes removed, all ten pass:

| Deliberate leak | Caught by |
|---|---|
| Each guess sent in a POST body, Base64-encoded | `01-guesses` |
| The seed phrase added to the pot request as a list of words | `02-prize-key` |
| The invite key sent in a request header | `03-private-hunt` |
| A one-pixel image from another host on every page | `05-network` |

## What they don't cover

- **The chain.** The stand-in signer builds no transactions. That the payout can't be traced
  with the pot's public viewing key comes from how the real signer builds the sweep
  (`OvkPolicy::Discard` in `signer/src/sync.rs`), and is checked by hand on testnet.
- **The signer's own checks.** The stand-in accepts any 24 words on a claim. The real signer
  derives the pot's viewing key from the phrase and refuses a mismatch.
- **A hosted copy.** These test a build of this repository. They can't tell you that a server
  somewhere runs the same code. Your browser's own network tools, and the Privacy X-ray on each
  page, show the same requests on any copy.
