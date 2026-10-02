# Shielded Quest

[![tests](https://github.com/GodlyDeveloper1/ShieldedQuest/actions/workflows/ci.yml/badge.svg)](https://github.com/GodlyDeveloper1/ShieldedQuest/actions/workflows/ci.yml)

**Privacy first. Solve puzzles without being known.** Treasure hunts with a shielded Zcash prize. Hide ZEC behind a riddle. Solvers' guesses never
leave their browser, anyone can verify the prize is real, and nobody can see who won.

Built solo by [@Diaguren_Labs](https://x.com/Diaguren_Labs) for the
[Zecathon](https://thezecathon.com/) (Wildcard track). **Testnet only.**

- **Live demo:** _added before submission_
- **Video (2 min):** _added before submission_

## What it does

A creator writes a hunt: a first clue, then an answer and a next clue for each stage. The
creator's browser makes a fresh Zcash pot for the prize and gives the site only its viewing key.
It then locks each stage behind its answer, seals the pot's seed phrase inside the last one, and
publishes only ciphertext. Solvers answer
clue by clue in their own browser, and the final answer unlocks the prize. The winner claims with
one click to a shielded address, or sweeps the pot from their own wallet.

| | |
|---|---|
| **Guesses stay on your device** | Every guess is stretched with Argon2id (64 MiB) and tried against the locked stage locally. Wrong or right, nothing is sent. |
| **The server holds ciphertext** | Hunts are stored locked and padded to equal sizes. Nothing the site stores can reveal an answer, a later clue or the prize key. |
| **The prize key is made in the browser** | The pot's 24-word seed phrase is generated in the creator's browser (Rust compiled to WebAssembly). The server receives the viewing key, which can see the balance but can't spend. It never sees the seed phrase at creation. |
| **The prize is verifiable** | Each pot's viewing key is published. Check the balance in any Zcash tool, without trusting the site. |
| **The chain doesn't show the winner** | The claim is one shielded transaction that discards the outgoing viewing key, so even the public viewing key can't see where the prize went. |

What the site itself can and can't learn is spelled out, party by party, in
[`quest-web/PRIVACY.md`](quest-web/PRIVACY.md#who-learns-what).

## Features

- **Create a hunt** from a template or from scratch, with a crack-time meter for every answer.
- **Browser-made prize pots.** The pot's keys are derived in the creator's browser by the
  `pot-keys` module; only the viewing key is sent. The create page shows which side made the
  pot, in green or orange.
- **Private, invite-only hunts.** The title and first clue are encrypted with a key that lives
  only in the invite link's `#fragment`, which browsers never send to a server. Unlisted, and a
  correct answer doesn't work without the invite.
- **Image, video and audio clues**, encrypted in the creator's browser before upload. Media for
  later clues stays locked until the stage before it is solved.
- **Privacy X-ray.** A live panel on every page listing each request the page makes and what was
  in it, with a counter of guesses sent (always 0).
- **Quest Guide.** A scripted in-browser helper: common questions, a clue reader, and puzzle
  tools (Caesar shifts, Base64, first letters). Not an AI; nothing typed into it leaves the page.
- **Crowdfunded prizes.** Anyone can top up a pot by QR code or address.
- **Real-world hunts.** Printable start cards and code cards with QR codes.
- **Share** by link, QR code or app. **Verify** with ready-to-run commands. **Reclaim** an
  unsolved prize with the creator's backup file.
- **A one-minute practice hunt** with a real testnet prize, claimable without a wallet.
- **Privacy tests anyone can run.** Ten browser tests record every request the pages make and
  check the claims above. See [`privacy-tests/`](privacy-tests/README.md).
- **Documentation** inside the app, a [threat model](quest-web/PRIVACY.md) and a
  [security review](SECURITY.md).

## How it works

```
 creator / solver browser            operator's machine (127.0.0.1)
 ┌───────────────────────┐   HTTP   ┌──────────────┐  HTTP  ┌──────────┐  gRPC  ┌──────────────┐
 │ quest-crypto          │ ───────▶ │ quest-web    │ ─────▶ │ signer   │ ─────▶ │ lightwalletd │──▶ Zebra
 │ answers → Argon2id    │          │ (Next.js)    │        │ (Rust)   │        │ (own or      │   (testnet)
 │ stages ↔ AES-GCM      │          │ hunt files   │        │ wallet,  │        │  public)     │
 └───────────────────────┘          └──────────────┘        │ pots     │        └──────────────┘
                                                             └──────────┘
```

Stage keys are chained: `k_i = Argon2id(normalize(answer_i), hunt_id ‖ i ‖ k_(i-1))` (64 MiB,
3 passes). Stage `i` decrypts with `k_i` (AES-256-GCM) to reveal clue `i+1`; the last stage holds
the pot's seed phrase. All stages are padded to the same size. `k_0` is zero bytes for a public
hunt and the invite key for a private one, whose title and first clue are sealed with that key
too.

Each pot is a fresh 24-word wallet made in the creator's browser. The `pot-keys` module derives
its unified full viewing key (ZIP 32, Orchard + Sapling) and the seed's fingerprint, and the
signer registers the pot from those two values alone. A test checks the browser's derivation is
identical to the signer's. The signer sweeps a pot with one shielded transaction when a valid
seed phrase is presented. The sweep discards the outgoing viewing key, so the published viewing
key can't reveal the winner.

If a browser can't run WebAssembly, the create page says so ("Made by the server") and the
signer makes the pot instead, handing the seed phrase over once without storing it. Practice
hunts are also made by the server, which writes them and so knows their answers anyway.

## Repository layout

| Folder | What it is |
|---|---|
| `signer/` | Rust service: wallet sync, sends, pot registration and claims. Holds its own wallet seed and pots' viewing keys. Listens on 127.0.0.1 only. |
| `pot-keys/` | Rust crate compiled to WebAssembly. Makes a pot's seed phrase, viewing key and seed fingerprint in the browser. 5 tests. |
| `quest-crypto/` | TypeScript library: Argon2id key chain, AES-256-GCM stages, invite keys, media encryption. Runs in the browser and in Node. 24 tests. |
| `privacy-tests/` | Browser tests (Playwright) that record every request and check the privacy claims against a production build, with a stand-in signer. 10 tests. |
| `quest-web/` | Next.js app: landing page, create, browse, solve, claim, verify, reclaim, docs. The built `pot-keys` module is committed under `public/wasm/`. |
| `docker-compose.yml`, `zcash.conf` | Optional own node: Zebra + lightwalletd on testnet. |

## Run it

You need [Rust](https://rustup.rs/) (stable) and [Node.js](https://nodejs.org/) 22 or newer.
Docker Desktop is only needed for the optional own node.

### 1. The signer

```
cd signer
cargo run --release
```

Always use `--release`: proving takes minutes in a debug build and seconds in release. The first
build takes 20–30 minutes. On first run the signer creates `signer/data/wallet.json` (its seed;
never share or commit it) and starts syncing testnet through `https://testnet.zec.rocks:443`.
Wait for a line like `synced to 4422669 (tip 4422669) …`.

To fund it, get an address and request testnet ZEC (TAZ) from a testnet faucet:

```
# PowerShell
(Invoke-RestMethod -Method Post http://127.0.0.1:8081/address).address
# bash
curl -s -X POST http://127.0.0.1:8081/address
```

### 2. The web app

```
cd quest-crypto
npm install
cd ../quest-web
npm install
npm run dev
```

Open http://127.0.0.1:3000. The app talks to the signer at `SIGNER_URL`
(default `http://127.0.0.1:8081`). For a production build: `npm run build`, then `npm start`.

The browser key module is already built and committed, so nothing else is needed. To rebuild it
from source, see [`pot-keys/README.md`](pot-keys/README.md).

### 3. Optional: your own node

```
docker compose up -d
docker compose logs --tail 30 zebra | grep sync_percent
```

Zebra's first testnet sync takes a day or more. When it's done, point the signer at it with
`LIGHTWALLETD_URL=http://127.0.0.1:9067`. Check that a test signer (see `SIGNER_DATA_DIR` /
`SIGNER_PORT` below) sees the same balance as one using the public server before switching.

## Configuration

| Variable | Used by | Default | Meaning |
|---|---|---|---|
| `LIGHTWALLETD_URL` | signer | `https://testnet.zec.rocks:443` | Light client server to sync and broadcast through |
| `SIGNER_BIRTHDAY` | signer | tip − 1000 | Height to start scanning a new wallet from |
| `SIGNER_DATA_DIR` | signer | `data` | Folder for the wallet seed, database and pot records |
| `SIGNER_PORT` | signer | `8081` | Port on 127.0.0.1 |
| `SIGNER_URL` | quest-web | `http://127.0.0.1:8081` | Where the web app finds the signer |
| `DEMO_POOL_SIZE` | quest-web | `3` | Funded practice hunts to keep ready for the one-minute hunt (`0` turns the pool off) |
| `DEMO_PRIZE_ZAT` | quest-web | `100000` | Prize per practice hunt, in zatoshis (0.001 TAZ), funded from the signer's wallet |
| `MEDIA_MAX_TOTAL_MB` | quest-web | `3000` | Total size of encrypted clue media the server will store |
| `NEXT_PUBLIC_EXPLORER_TX_URL` | quest-web | `https://testnet.zecblock.com/tx/` | Block explorer link prefix for payout transactions |
| `TRUST_PROXY` | quest-web | off | Set to `1` behind your own reverse proxy so rate limits see visitors' addresses |
| `RATE_LIMITS` | quest-web | on in production | Set to `on` to enforce rate limits under `npm run dev` too |
| `QUEST_DATA_DIR` | quest-web | `quest-web/data` | Folder for published hunts, encrypted media and the practice-hunt registry |

## Signer API (127.0.0.1 only)

| Route | Purpose |
|---|---|
| `GET /health` | Liveness |
| `GET /viewing-key` | The signer wallet's viewing key |
| `POST /address` | A fresh, never-reused address |
| `GET /payments` | Sync status, balances, received payments with memos, sent transactions |
| `POST /send` `{to, zatoshis, memo}` | Build, prove and broadcast a payment |
| `POST /pots/import` `{viewing_key, seed_fingerprint}` | Register a pot made in the browser. No seed phrase involved |
| `POST /pots` | Fallback: the signer makes the pot and returns its seed phrase **once** |
| `GET /pots/{id}` | Pot balance (verified via its viewing key) and claimed flag |
| `POST /pots/{id}/claim` `{seed_phrase, to}` | Sweep the whole pot to a shielded address; locks the pot |

## A hunt from start to finish

1. **Create.** At `/create`, write the clues and answers. The page shows how long a computer would
   need to guess each answer; a simple final answer needs your explicit OK. Tick "Private hunt"
   for an invite-only one. Continue: a green box confirms the pot's keys were made in your
   browser. Download the backup file (seed phrase, answers and, for a private hunt, the invite
   key) and tick the box. Lock and publish.
2. **Fund.** Send TAZ from a shielded balance to the pot address shown, with no memo.
3. **Verify.** The hunt page shows the verified prize after about 3 confirmations, plus the
   viewing key and the hunt file's SHA-256 fingerprint.
4. **Solve.** In another browser, answer clue by clue. Open the Privacy X-ray to watch: wrong
   guesses never leave the browser.
5. **Claim.** After the final answer, claim to a fresh shielded address, or reveal the seed
   phrase and sweep the pot from any wallet. A second claim is refused.
6. **Reclaim (creator).** Nobody solved it? Open the hunt, choose your backup file under
   "Made this hunt? Take the prize back", and the prize returns to you.

## Tests

```
cd quest-crypto
npm install
npm test
```

24 tests cover solving, wrong answers, key chaining, tampering, swapped stages, KDF floors,
padding, media encryption, private hunts and the no-secrets-in-the-file check.

```
cd pot-keys
cargo test
```

5 tests cover the browser key module, including that it derives exactly the viewing key the
signer derives from the same seed phrase.

```
cd privacy-tests
npm install
npm run browser
npm test
```

10 browser tests check the privacy claims: they drive the real pages, record every request, and
read back what the server stored. They need the web app installed (step 2 above) but no signer
and no coins. [`privacy-tests/README.md`](privacy-tests/README.md) lists what each one checks.

All three suites, a signer compile check, a WebAssembly build of the key module and a
production build of the web app run on every push: see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml). The real flow on testnet (fund, solve,
claim) needs a synced signer and coins, so it is tested by hand.

## Privacy and security

- [`quest-web/PRIVACY.md`](quest-web/PRIVACY.md): what stays private, what is public on purpose,
  what the design asks you to trust, and known limits.
- [`SECURITY.md`](SECURITY.md): the pre-freeze security review and what it fixed.

## Rules for this repo

- Testnet only.
- Never commit `signer/data/`, `signer/data-*/`, `devwallet/` or `quest-web/data/` (all
  ignored). They hold seeds or local state.
- The signer never stores a pot's seed phrase, and for a browser-made pot never receives it
  until someone claims. No one logs claim request bodies.

## Licence

[MIT](LICENSE)
