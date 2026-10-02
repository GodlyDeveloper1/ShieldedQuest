# Shielded Quest — privacy and threat model

Shielded Quest is a treasure hunt with a shielded Zcash prize. A creator writes
clues and answers; the answers lock the pot's seed phrase; whoever solves the
hunt first can sweep the pot. This file lists what each party can learn, what we
do about it, and what we don't protect against. Testnet only.

## Parts

| Part | Runs where | Holds |
|---|---|---|
| Browser (creator / solver) | the person's device | answers, stage keys; the pot seed phrase, which the creator's browser makes and a solver's browser unlocks |
| Web app (Next.js) | the operator's machine | published hunt files (public by design) |
| Signer (Rust) | the operator's machine, reachable by the web app only | its own wallet seed; pots' viewing keys; pot seeds only in memory during a claim |
| lightwalletd + Zebra | the operator's machine (or a public server, see limits) | the public chain |

## Who learns what

The short version, one row per party that could learn something.

| Who | Can learn | Never learns |
|---|---|---|
| **Anyone reading the blockchain** | That a pot exists and what it holds (its viewing key is public); deposits into it and any memo on them; that it was emptied | Who won; where the prize went or how it was split; who funded it, if funded from a shielded balance |
| **This site (web app and signer)** | Your IP address while you browse and which hunt pages you open (used for rate limits in memory, never logged); the pot's viewing key when the creator's browser registers the pot; on a one-click claim, the unlocked seed phrase and the address you paste | The pot's seed phrase while the hunt is unsolved (it is made in the creator's browser; see the fallback under "Trust"); your guesses or answers; how far you've got; a private hunt's title, first clue or invite key; your payout address, if you sweep the pot yourself |
| **The light-client server the signer uses** | The operator's IP address and every transaction the signer broadcasts | Anything about visitors: their browsers never contact it |
| **A block explorer, only if you click its link** | Your IP address and which transaction you looked at | Anything from us: the site never contacts it |
| **An app you share a link through** | The link, including a private hunt's invite key | Your progress or answers: they aren't in the link |
| **Your network or internet provider** | That you visited this site (HTTPS hides which pages and what was sent) | Anything inside the connection |

Wording used across the site follows this table. "Nobody can see who won" and
"winners stay anonymous" mean nobody learns the winner's identity: the chain
shows nothing about them, and there are no accounts, names or emails. On a
one-click claim the site does see the fresh shielded address the winner pastes
(second row), which names nobody; the sweep-it-yourself option avoids even that.

## What stays private

**Answers and guesses.** Answers are turned into keys with Argon2id (64 MiB,
3 passes) in the browser and never sent anywhere. Each guess is checked by
trying to decrypt the stage locally. A browser test (`privacy-tests/` in the
repository, test `01-guesses`) records every request and checks that none ever
carries a guess, an answer or a later clue, that nothing with a body is sent
while guessing, and that the browser contacts no host other than the site itself
(no fonts, analytics or CDNs).

**Progress.** How far a solver has got lives in that tab's `sessionStorage`
only. The server can't tell who is solving, how many guesses they made, or
which stage they're on.

**The hunt file.** It contains only the first clue, ciphertext, KDF parameters
and the pot's public details. Every stage is padded to the same size, so nobody
can tell which stage holds the seed phrase or how long the clues are. The
publish endpoint rebuilds the file from known fields only, so nothing extra can
ride along.

**Media in clues.** Images, video and audio are encrypted in the creator's
browser with a fresh key per file, and only ciphertext is uploaded. Keys for
first-clue media are in the public hunt file; keys for later media are inside
the stage that reveals them, so nobody can view them early. A solver's browser
downloads every media file of the hunt when the page opens, so the server can't
infer progress from which files are fetched. File sizes (and the number of files)
are visible to the server. Links in clues are never embedded or previewed; they
open only if the solver clicks.

**Private (invite-only) hunts.** The creator's browser makes a random 32-byte
invite key. The title, first clue and first-clue media keys are encrypted with
it, and stage 1 is chained to it, so without the invite a correct answer doesn't
even decrypt. The key travels only in the invite link's `#fragment`
(`/hunt/<id>#k=…`), which browsers never send to a server. The published file
has a placeholder title and an empty first clue; private hunts are left out of
every list. A browser test (`03-private-hunt`) checks that no request carries
the key, the title or the first clue, and that the stored file contains none of
them. What
the server still sees for a private hunt: that it exists, its id, its stage
count, its publication day, its pot (address, viewing key, balance) and the
sizes of its encrypted parts.

**The prize key.** The pot's 24-word seed phrase is generated in the creator's
browser by the `pot-keys` module (Rust compiled to WebAssembly, served from this
site, no third party). The browser derives the pot's viewing key and the seed's
fingerprint (a one-way hash) and sends only those two values. The signer
registers the pot from them and never receives the phrase. The create page shows
a green "Made in your browser" box, and its Privacy X-ray lists the request with
"seed phrase: not sent". A browser test (`02-prize-key`), run against a
production build with the Content-Security-Policy on, checks that the phrase
appears in no request, in nothing the signer receives and in no stored file, and
that the browser derives exactly the key the native code derives from the same
phrase. From then on the phrase exists in the creator's backup file and,
encrypted, inside the hunt's last stage.

**The winner.** The claim sweeps the pot in one shielded transaction to the
winner's shielded address. The pot's viewing key is public, so the sweep is
built with `OvkPolicy::Discard`: viewers see the pot's balance drop to zero,
but cannot decrypt where the money went or how much the winner received.
Transparent addresses are refused as claim destinations.

**Dates.** Hunts store only the publication day, not a timestamp.

## What is public on purpose

- The pot's address and full viewing key, so anyone can verify the prize without
  trusting the site. This also reveals **funding amounts and funding memos**. The
  create page tells creators to fund from a shielded balance and leave the memo
  empty.
- The hunt file and its SHA-256 fingerprint, so anyone can check it wasn't
  changed after publishing.

## Trust the v1 design asks for

- **One-click claim.** The winner's browser sends the unlocked seed phrase and
  their address to the site, which passes them to the signer to build the sweep.
  The site sees both in transit (never logged or stored). Winners who don't
  want this can reveal the phrase and sweep the pot in their own wallet; nothing
  is sent to the site that way.
- **Pot creation, fallback only.** Normally the creator's browser makes the pot
  and the server never sees its seed phrase (see "The prize key"). If the browser
  can't run WebAssembly, the signer makes the pot and hands the phrase over once;
  it does not keep it, but a malicious operator could. The create page shows an
  orange "Made by the server" box in that case, so the creator always knows
  which happened. Practice hunts are made by the server too: it writes them, so
  it knows their answers and keys by construction.
- **The pot address comes from the server.** The browser checks that the server
  registered the viewing key it sent, but the pot's address is derived by the
  signer. A dishonest server could show a different address to fund. The prize
  shown on the hunt page is read through the published viewing key, so a creator
  can confirm their deposit arrived in the right pot with any Zcash tool.
- **The operator sees metadata:** which IP created which hunt, which IP claimed
  it, and when. Use Tor or a VPN if that matters to you.

## Hardening in place

- Signer binds to 127.0.0.1; the web app binds to 127.0.0.1 (`npm run dev` /
  `npm start`), not the whole network. Under Docker Compose the signer has no
  published port and sits on a private network that only the web app shares.
- `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `nosniff`, a
  restrictive `Permissions-Policy` and `Cross-Origin-Opener-Policy` on every
  page.
- Next.js telemetry is disabled on install (`postinstall`).
- Hunt files are write-once; a pot can back only one hunt; a pot can be claimed
  once (locked before broadcasting).
- Loaded hunt files are checked for a KDF floor, so a tampered file can't make
  guessing cheap.
- Claim request bodies are never logged by the web app or the signer.
- The payout's transaction id comes with a copy button, and the explorer link
  says what clicking it reveals (your IP and your interest in that transaction).
- A **Content-Security-Policy** on every page: scripts, styles, fonts, images
  and requests may only come from the site itself (plus in-memory `data:` and
  `blob:` for QR codes and decrypted media). The browser enforces "this site
  talks to nobody else", and an injected script couldn't send a guess or an
  invite key to another server with `fetch`, an image or a form.
- Request bodies are read with hard size limits (hunt file 100 kB, claim 4 kB,
  media 25 MB), and uploads have a per-visitor byte budget, so the server can't
  be made to buffer or store unbounded data.
- Rate limits use only the address our own proxy reports, pot lookups for public
  pages are cached for a few seconds, and practice-hunt refills are capped per
  hour. See [`../SECURITY.md`](../SECURITY.md) for the full review.
- **Privacy tests anyone can run.** The `privacy-tests/` folder holds ten
  browser tests that record every request and check the claims on this page:
  guesses, the prize key, private hunts, the claim, other hosts and cookies, and
  clue media. They run on every push, and were checked against deliberate leaks
  to confirm they fail when privacy is broken. Its README lists what they cover
  and what they can't.
- **Privacy X-ray** on every app page: a live log of each request the page makes
  (method, address, what was in the body, in plain words) and each check done
  locally. It counts guesses sent to the server by checking outgoing bodies for
  anything typed as a guess. It runs in the browser and sends nothing. It is a
  convenience, not proof: a dishonest page could lie about itself, so your
  browser's own network tools stay the ground truth, and they show the same.

## Known limits

- **Private hunts trust the page's code.** The invite key never leaves the
  browser by design, but the page that reads it from the address bar is served
  by this site, so a dishonest or compromised server could ship code that
  uploads it. Anyone holding the link can also share it: an invite is a key, not
  an identity. Messaging apps a link is sent through can see it too. A lost
  invite link can't be recovered; the creator can still take the prize back with
  the backup file.

- **Offline guessing.** Anyone can download the hunt file and guess answers as
  fast as their hardware runs Argon2id. The create page shows how long a
  powerful computer would need to guess each answer, and a simple final answer
  needs an explicit "I understand" from the creator. It refuses answers that
  appear in clues, but the estimate can't know if a clue makes an answer easy.
  Stages are solved in order, so a hunt is about as strong as its strongest
  stage.
- **Races.** Once more than one person has solved a hunt, the first valid claim
  wins.
- **Light client server.** If the signer uses a public lightwalletd (the default
  is `testnet.zec.rocks`), that server sees the operator's IP, every broadcast,
  and the txids the signer fetches to read memos. Running your own Zebra +
  lightwalletd removes this; see the README.
- **Stranded pots.** If a creator loses the backup and nobody solves the hunt,
  the prize stays in the pot forever.
