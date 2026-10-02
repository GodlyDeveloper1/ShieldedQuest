# Shielded Quest — video script (2 minutes)

The submission allows two minutes. Testnet. Record at 1920×1080, browser zoom 110–125%, so text
is readable when the video is shrunk.

## Before recording

- Signer (release build) and web app running, signer synced, at least 0.03 TAZ spendable.
- The Hunts page showing hunts in different states (open, waiting for a prize, claimed). Make
  these the day before.
- **One public hunt already funded and confirmed** for the solving scene. Keep its answers handy
  (they're in its backup file).
- **One private hunt already published**, with its invite link copied somewhere off screen.
- Two browser windows: normal (creator) and private/incognito (solver). Signer log in a
  terminal with a large font.
- Never show a funded pot's seed phrase on screen. Blur or cut the backup step.
- Close other tabs and hide bookmarks. Turn off notifications.

## Script

**0:00–0:12 · The idea.** Home page hero; let the headline decrypt.
> "Shielded Quest is a treasure hunt where the treasure is shielded Zcash. Your guesses never
> leave your browser, anyone can verify the prize, and nobody can see who won."

**0:12–0:30 · The story, by scrolling.** Scroll slowly through "Follow one guess".
- Let the guess type, the 64 blocks fill, the lock open, and the server's counters tick to 0.
> "Here's one guess from start to finish. Your browser does the work. The server sees nothing
> until the single request that claims the prize."

**0:30–0:50 · Create.** Creator window, `/create`.
- Type a weak final answer ("paris"): the crack-time meter turns orange and asks to confirm.
  > "Hunts can be guessed offline, so we show how fast a simple answer falls."
- Strong answer, Continue, flash the backup step (blurred), Lock and publish. Keep one
  "Locking stage 1 of 2…" moment.
  > "Each answer is stretched with Argon2id in the browser. The server only gets ciphertext."

**0:50–1:05 · Private hunts.** Open the private hunt's address without the link: the locked page.
Paste the invite link: the title and clue appear.
> "A private hunt is encrypted with a key that only exists in the invite link. Browsers never
> send that part to a server, so even we can't read it."

**1:05–1:35 · Solve.** Solver window, the pre-funded public hunt.
- Open the Privacy X-ray (bottom right). Type a wrong answer: the box shakes, "Not it". The
  X-ray adds a green "in your browser" row and "guesses sent" stays 0.
  > "Checked locally. Nothing was sent, and you can watch that live."
- Optional two seconds: ask Kee, the Quest Guide, to "look at this clue with me".
- Right answers: confetti, next clue, then "You solved it."

**1:35–1:53 · Claim and verify.** Paste a fresh shielded address, click Claim, "Prize sent".
- The X-ray shows the claim: the one request that carries a key, and none of the answers.
- Click "view on explorer": the transaction exists; no amount, no recipient.
- Cut to the signer log (`broadcast … accepted`), then the hunt page shows "Claimed".
> "One shielded transaction. The pot's public viewing key shows it emptied, but not where the
> prize went."

**1:53–2:00 · Close.** Back to the home page.
> "Shielded Quest: private puzzles, public proof, shielded prizes."

## If you need to cut

Drop in this order: the Quest Guide moment, the weak-answer meter, the explorer click. Keep the
scroll story, the X-ray at 0, the private hunt and the claim.

## After recording

- Trim waits but keep one Argon2id "Locking…" moment and one "Checking…" spinner.
- Caption the terminal lines.
- Check no funded pot's seed phrase and no real invite link you still use appears in any frame.
- Longer material (reclaim, media clues, printable cards, the threat model) belongs in the
  README and the docs, not the video.
