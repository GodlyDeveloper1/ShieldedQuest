# Page guide

Every page in Shielded Quest and what it's for.

| Page | Address | What you do there |
|---|---|---|
| Home | `/` | The story, how it works, use cases, live hunts |
| Explore hunts | `/hunts` | Every hunt with its verified prize and status: open, waiting for a prize, or claimed |
| One-minute hunt | `/demo` | A guided practice hunt with the answers in the hints; claim without a wallet |
| Create a hunt | `/create` | Pick a template or start blank, write clues and answers, optionally make it private (invite-only), back up the pot, lock and publish, fund (QR), print clue cards |
| A hunt | `/hunt/<id>` | Solve, claim, verify the prize and the hunt file, or reclaim it as the creator. A private hunt needs its invite link (`/hunt/<id>#k=…`); without it the page stays locked |
| Getting started | `/docs` | Start here |
| How it works | `/docs/how-it-works` | The cryptography and the parts, in plain words |
| For creators | `/docs/creators` | Writing strong hunts, funding, reclaiming |
| For solvers | `/docs/solvers` | Solving and claiming |
| Privacy | `/docs/privacy` | Threat model, trust assumptions, known limits |
| Verify it yourself | `/docs/verify` | Check prizes and hunt files with your own tools |
| FAQ | `/docs/faq` | Short answers |

## On every app page

- **Privacy X-ray** (bottom-right button): a live log of everything the page sends, and what it
  does in your browser instead. Counters show guesses sent (always 0), guesses checked locally,
  requests to this site and requests to other sites (always 0). Click a row to see what was in
  it. The claim is the only request carrying a secret; it's marked "key".

- **Quest Guide** (gold button next to it): a scripted helper, not an AI. It answers common
  questions, reads the clue on screen with you (word counts, links, capitals, numbers, first
  letters) and has puzzle tools: all Caesar shifts/ROT13, Base64 or hex, reverse, first letters,
  counting. It can't know the answers, and nothing typed into it leaves your browser.

## On a hunt page

- **Share**: the hunt's link to copy, a QR code to scan or save as an image, your phone's share
  sheet, or WhatsApp, Telegram, X and email. Not shown on practice hunts.
- **Prize box**: the verified prize (spendable in the pot) and anything still confirming. It
  refreshes every 30 seconds.
- **Stages**: which stages you've solved. Solved clues stay visible.
- **Answer box**: checked in your browser. Wrong guesses show a count; editing clears it.
- **Add to the prize**: a QR code and the pot address, so anyone can top up the prize.
- **Print start card**: a printable card with the first clue and a QR code to the hunt.
- **Verify it yourself**: viewing key, pot address, birthday height, ready-to-run commands,
  the hunt file and its fingerprint.
- **Made this hunt?**: the creator's reclaim, using the backup file.
