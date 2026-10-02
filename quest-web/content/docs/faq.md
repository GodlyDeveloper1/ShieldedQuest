# FAQ

**Is this real money?**
No. Shielded Quest runs on the Zcash **testnet**. TAZ has no value.

**Can the site see my answers?**
No. Answers and guesses are processed in your browser and never sent. Only the locked hunt
file is stored.

**Can the site steal the prize?**
The signer generates each pot and hands its seed phrase to the creator's browser without
keeping it. A dishonest operator could change that code, which is why we list it as a trust
assumption on the [Privacy](/docs/privacy) page. A future version will let your browser
generate the pot itself.

**Why does each guess take a moment?**
On purpose. Each guess runs Argon2id with 64 MiB of memory. It's barely noticeable for you and
very expensive for someone trying millions of guesses.

**What if I lose my backup file?**
If nobody solves the hunt, the prize stays in the pot forever. Keep the backup.

**Can two people win?**
The first valid claim takes the whole pot. Everyone else who finishes sees that it's been
claimed.

**Can I add to someone else's prize?**
Yes. Send shielded TAZ to the pot address on the hunt page. The prize goes up for everyone.

**Who can see that I won?**
Nobody, from the chain. The claim is a single shielded transaction that even the pot's public
viewing key can't decrypt. The site briefly sees your address if you use one-click claim;
sweeping yourself avoids even that.

**Does the site track me?**
No accounts, no cookies for tracking, no analytics, no third-party scripts or fonts. Pages send
`Referrer-Policy: no-referrer`.

## What is a private hunt?

A hunt only people with its invite link can open. It isn't listed, and its title and
first clue are encrypted with a key that lives in the link after the `#`, which never
reaches the server. Opening the hunt's address without the key shows a locked page.
See [For creators](/docs/creators).

## I lost my private hunt's invite link. Can you recover it?

No. The key was only ever in the link and in your backup file. Check the backup: it
lists the invite key. Without it nobody can read the hunt, but you can still take the
prize back from the hunt's page with the backup file.
