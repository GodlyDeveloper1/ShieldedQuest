// Claim: "A private hunt's title, first clue and invite key never reach the server."
import { expect, test } from "@playwright/test";
import { describe } from "../lib/recorder";
import { createHunt, guess, signerLog, storedFiles, storedHuntFile, visitor, WEB } from "../lib/site";

const TITLE = "Surprise for Odalys 8842";
const FIRST_CLUE = "Where did grandfather hide the zebra-striped umbrella?";
const ANSWER = "behind the cedar wardrobe 2290";

test("an invite-only hunt keeps its title, first clue and invite key off the server", async ({ browser }) => {
  const creator = await visitor(browser);
  const hunt = await createHunt(creator.page, { title: TITLE, firstClue: FIRST_CLUE, stages: [{ answer: ANSWER }], isPrivate: true });
  const key = hunt.inviteKey!;

  // The creator's browser published only ciphertext.
  for (const secret of [key, TITLE, FIRST_CLUE, "zebra-striped", ANSWER]) {
    expect(describe(creator.rec.carrying(secret)), `the creator's browser sent "${secret}"`).toEqual([]);
  }

  // What the server stored: a placeholder title, an empty first clue, no key.
  const file = storedHuntFile(hunt.id);
  const stored = JSON.parse(file).hunt;
  expect(stored.title).toBe("Private hunt");
  expect(stored.first_clue).toBe("");
  for (const [name, bytes] of storedFiles()) {
    const text = bytes.toString("latin1");
    for (const secret of [key, TITLE, "Odalys", "zebra", "cedar wardrobe"]) expect(text, `${name} contains "${secret}"`).not.toContain(secret);
  }
  expect(JSON.stringify(await signerLog())).not.toContain(key);

  // It isn't listed anywhere.
  const stranger = await visitor(browser);
  const listing = await (await stranger.context.request.get(`${WEB}/hunts`)).text();
  expect(listing).not.toContain(hunt.id);
  const home = await (await stranger.context.request.get(`${WEB}/`)).text();
  expect(home).not.toContain(hunt.id);

  // Without the invite, the page is locked and the server's reply has no title or clue in it.
  const raw = await (await stranger.context.request.get(`${WEB}/hunt/${hunt.id}`)).text();
  expect(raw).not.toContain("Odalys");
  expect(raw).not.toContain("zebra");
  await stranger.page.goto(`/hunt/${hunt.id}`, { waitUntil: "networkidle" });
  await expect(stranger.page.locator("text=You need the invite link")).toBeVisible();
  await expect(stranger.page.locator(`text=${TITLE}`)).toHaveCount(0);

  // A made-up invite key doesn't open it, and neither does the right answer without the key.
  await stranger.page.fill('input[aria-label="Invite link"]', `${WEB}/hunt/${hunt.id}#k=${"A".repeat(43)}`);
  await stranger.page.click('button:has-text("Open")');
  await expect(stranger.page.locator("text=doesn't open this hunt")).toBeVisible();

  // With the invite link, a guest reads the title and clue and can solve it...
  const guest = await visitor(browser);
  await guest.page.goto(hunt.link, { waitUntil: "networkidle" });
  await expect(guest.page.locator(`h1:has-text("${TITLE}")`)).toBeVisible();
  await expect(guest.page.locator(".card.stage", { hasText: FIRST_CLUE })).toBeVisible();
  await guest.page.waitForTimeout(500);
  await guess(guest.page, "definitely not this 5567", false, 0);
  await guess(guest.page, ANSWER, true);

  // ...and the guest's browser never sent the key (the part after # stays in
  // the browser), the title, the clue or a guess. Not in an address, not in a
  // Referer header, not in a body.
  for (const secret of [key, TITLE, FIRST_CLUE, ANSWER, "definitely not this 5567"]) {
    expect(describe(guest.rec.carrying(secret)), `the guest's browser sent "${secret}"`).toEqual([]);
  }
  for (const r of guest.rec.seen) expect(r.url).not.toContain("#");

  expect(guest.errors).toEqual([]);
  for (const v of [creator, stranger, guest]) await v.context.close();
});
