# For creators

## Start from a template

The create page has three starting points: **Learn Zcash** (three questions that teach shielded
basics, for workshops and onboarding), **Meetup scavenger hunt** (code cards hidden around a
venue) and **CTF / puzzle prize** (one stage; the flag is the answer). Templates leave the
final answer empty on purpose: pick something only your solvers can find.

## Write the hunt

- **Title and first clue** are public. Everyone sees them.
- **Each stage** has an answer and, except the last, the clue it reveals.
- **The final answer protects the prize.** Anyone can download a hunt and let a computer try
  guesses offline, so the create page shows how long that would take ("about 3 seconds" for a
  single common word, "thousands of years" for a few random words and a number). Simple final
  answers are allowed, but you have to confirm you understand someone could guess it and take
  the prize.

Good final answers combine something the solver *finds* with something they *can't guess*:
a code word printed at the last location, a number hidden in an image, or several unrelated
words. "paris" is weak; "violet otter 7719 lantern" is strong.

Earlier stages can be easier. They guard the next clue, not the prize.

The page also refuses an answer that appears inside one of your clues.

## Add images, video, audio and links

Any clue can carry up to three files: images up to 5 MB, video or audio up to 25 MB. Think
photo riddles, a video with the answer hidden in a frame, or an audio clip to decode.

- Files are **encrypted in your browser** before upload; the server only stores ciphertext.
- Media on the **first clue** is public, like the clue.
- Media on **later clues stays locked** until someone solves the stage before it. Nobody can
  peek, including us.

You can also paste links (to YouTube, a web page, anything) straight into a clue. They show as
clickable links that open in a new tab. We don't embed them, because an embedded player would
tell that site about everyone who opens the hunt.

## Make it private (invite-only)

Tick **Private hunt** on the create page for a hunt only your guests can open:

- It isn't listed on the Hunts page or the home page.
- The title, the first clue and its media are encrypted with an invite key made in
  your browser. The key exists only in the invite link, after the `#`. Browsers never
  send that part to a server, so even this site can't read your hunt.
- Without the invite, a correct answer doesn't work either: stage 1 is locked to the key.

After publishing you get the invite link. **Save it straight away**: it can't be
recovered. Anyone you send it to can play, so share it only with people you want in.
The backup file also holds the invite key. The prize is still public and verifiable,
like every hunt: people can see that a private hunt exists and what its pot holds,
just not what it's about.

## Back up the pot

After you continue, you'll see the prize pot's seed phrase once. A green box, "Made in your
browser", means the words were created on your device and the server received only the pot's
viewing key. **Download the backup file.** It contains the seed phrase and your answers. It's
the only way to take the prize back if nobody solves the hunt. We never had a copy.

## Lock and publish

Your browser locks each stage (a second or two per stage), checks that every stage opens with
your answers, and publishes the hunt. Only ciphertext leaves your browser.

## Fund the prize

Scan the QR code on the last screen with a Zcash testnet wallet, or copy the pot address.

- Send from a **shielded** balance. Funding from a transparent (t-) address publicly links
  that address to the hunt.
- Leave the **memo empty**. The pot's viewing key is public, and it can read memos sent to the
  pot.

The hunt page shows the prize as *confirming*, then *verified* after about 3 blocks (5–15
minutes). Anyone can add to the prize the same way.

## Run it in the real world

On the last screen, **Print clue cards** prints a start card (the first clue and a QR code to
the hunt) and one code card per stage with that stage's answer. Hide each code card where its
clue points. This is only available right after creating the hunt, while the answers are still
in your browser; the hunt page itself can only print the public start card.

Anyone can **add to the prize** from the hunt page, so a community can grow a pot together.

## Take the prize back

If nobody solves it, open the hunt, expand **Made this hunt? Take the prize back**, choose your
backup file and give a shielded address. The file is read in your browser and the phrase is
never shown. This ends the hunt.
