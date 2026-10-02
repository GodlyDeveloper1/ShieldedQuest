// Claim: "One request, one shielded payment." The one-click claim is the only
// time the prize key leaves a browser, and sweeping the pot yourself avoids
// even that. This is the trade-off the site states on the claim form.
import { expect, test } from "@playwright/test";
import { describe } from "../lib/recorder";
import { createHunt, guess, signerLog, visitor, WEB } from "../lib/site";

const ANSWER = "lighthouse keeper 3907 amber";
const PAYOUT = "utest1privacytestwinner0000000000000000000000000000000000000000000000000000";

test("the claim is the only request that carries the prize key", async ({ browser }) => {
  const creator = await visitor(browser);
  const hunt = await createHunt(creator.page, {
    title: "Claim test",
    firstClue: "Who trims the lamp at dusk?",
    stages: [{ answer: ANSWER }],
  });

  const solver = await visitor(browser);
  await solver.page.goto(hunt.link, { waitUntil: "networkidle" });
  await solver.page.waitForSelector("#answer");
  await solver.page.waitForTimeout(500);
  await guess(solver.page, ANSWER, true);

  // The solver's browser unlocked the very phrase the creator's browser made.
  // Showing it, to sweep the pot from your own wallet, sends nothing.
  await solver.page.click("text=Show the seed phrase");
  const shown = (await solver.page.locator(".seed span").allInnerTexts()).map((w) => w.replace(/^\s*\d+\.\s*/, "").trim()).join(" ");
  expect(shown).toBe(hunt.seedPhrase);
  await solver.page.waitForTimeout(1000);
  expect(describe(solver.rec.carryingPhrase(hunt.seedPhrase)), "the phrase was sent before any claim").toEqual([]);
  expect(describe(solver.rec.seen.filter((r) => r.method !== "GET")), "the solver's browser sent something before claiming").toEqual([]);
  expect(JSON.stringify(await signerLog())).not.toContain(hunt.seedPhrase);

  // The one-click claim.
  await solver.page.fill("#to", PAYOUT);
  await solver.page.click('button:has-text("Claim the prize")');
  await expect(solver.page.locator(".txlink a")).toBeVisible({ timeout: 60_000 });

  // Exactly one request carried the phrase: the claim, to this site, holding
  // the phrase and the payout address and nothing else.
  const withPhrase = solver.rec.carryingPhrase(hunt.seedPhrase);
  expect(describe(withPhrase)).toEqual([`POST /api/hunts/${hunt.id}/claim`]);
  expect(new URL(withPhrase[0].url).origin).toBe(WEB);
  expect(Object.keys(JSON.parse(withPhrase[0].body!.toString("utf8"))).sort()).toEqual(["seed_phrase", "to"]);
  expect(describe(solver.rec.carrying(PAYOUT))).toEqual([`POST /api/hunts/${hunt.id}/claim`]);

  // The signer received that phrase once, on the claim, and at no other time.
  const withPhraseAtSigner = (await signerLog()).filter((e) => e.body.includes(hunt.seedPhrase));
  expect(withPhraseAtSigner.map((e) => e.path)).toHaveLength(1);
  expect(withPhraseAtSigner[0].path).toMatch(/^\/pots\/[0-9a-f]+\/claim$/);
  expect(JSON.parse(withPhraseAtSigner[0].body)).toEqual({ seed_phrase: hunt.seedPhrase, to: PAYOUT });

  // The payout's explorer link is only a link: the page didn't contact the
  // explorer, and following it sends no Referer.
  const link = solver.page.locator(".txlink a").first();
  expect(await link.getAttribute("href")).toMatch(/^https:\/\//);
  expect(await link.getAttribute("rel")).toContain("noreferrer");
  expect(solver.rec.otherHosts(WEB)).toEqual([]);

  // A second claim is refused.
  const again = await solver.context.request.post(`${WEB}/api/hunts/${hunt.id}/claim`, { data: { seed_phrase: hunt.seedPhrase, to: PAYOUT } });
  expect(again.status()).toBe(400);

  // A transparent address is refused: the payout must be shielded.
  const other = await visitor(browser);
  const transparent = await other.context.request.post(`${WEB}/api/hunts/${hunt.id}/claim`, { data: { seed_phrase: hunt.seedPhrase, to: "tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU" } });
  expect(transparent.status()).toBe(400);
  expect((await transparent.json()).error).toContain("shielded");

  expect(solver.errors).toEqual([]);
  for (const v of [creator, solver, other]) await v.context.close();
});
