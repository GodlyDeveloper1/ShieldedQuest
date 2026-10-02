// Claim: "Guesses never leave your browser."
//
// A creator publishes a hunt. A solver, in a separate browser profile, makes
// wrong and right guesses. Every request the solver's browser makes is recorded.
import { expect, test } from "@playwright/test";
import { describe } from "../lib/recorder";
import { createHunt, guess, signerLog, storedHuntFile, visitor } from "../lib/site";

const ANSWER_1 = "Marigold Lantern 5521";
const CLUE_2 = "Second clue: count the copper kettles on the windowsill.";
const ANSWER_2 = "seventeen copper kettles 9034";
const WRONG = ["periwinkle hedgehog 3310", "walnut submarine 7742", "obsidian teacup 1188"];

test("wrong and right guesses are checked in the browser and never sent", async ({ browser }) => {
  const creator = await visitor(browser);
  const hunt = await createHunt(creator.page, {
    title: "Guess test",
    firstClue: "First clue: what hangs over the garden gate?",
    stages: [{ answer: ANSWER_1, nextClue: CLUE_2 }, { answer: ANSWER_2 }],
  });

  const solver = await visitor(browser);
  await solver.page.goto(hunt.link, { waitUntil: "networkidle" });
  await solver.page.waitForSelector("#answer");
  await solver.page.waitForTimeout(500);

  const beforeGuessing = solver.rec.mark();
  await guess(solver.page, WRONG[0], false, 0);
  await guess(solver.page, WRONG[1], false, 1);
  await guess(solver.page, "MARIGOLD-lantern, 5521!", true); // forgiving about case and punctuation
  await expect(solver.page.locator(".card.stage", { hasText: CLUE_2 })).toBeVisible();
  await guess(solver.page, WRONG[2], false, 0);
  await guess(solver.page, ANSWER_2, true);
  await expect(solver.page.locator("text=You solved it.")).toBeVisible();

  // 1. No request carries any guess, right or wrong, in any common encoding.
  for (const secret of [...WRONG, ANSWER_1, ANSWER_2, "MARIGOLD-lantern, 5521!"]) {
    expect(describe(solver.rec.carrying(secret)), `a request carried the guess "${secret}"`).toEqual([]);
  }

  // 2. Stronger: while guessing, the browser sent nothing with a body and
  //    nothing with a query string. The only request allowed is the periodic
  //    balance check, which is the same for every visitor.
  const whileGuessing = solver.rec.since(beforeGuessing).filter((r) => !/^(data|blob):/.test(r.url));
  for (const r of whileGuessing) {
    expect(r.method, `unexpected ${r.method} ${r.path} while guessing`).toBe("GET");
    expect(r.body, `request to ${r.path} had a body`).toBeNull();
    expect(new URL(r.url).search, `request to ${r.path} had a query string`).toBe("");
    expect(r.path).toBe(`/api/hunts/${hunt.id}/pot`);
  }

  // 3. The server can't tell how far the solver got: no request differs by progress.
  expect(solver.rec.carrying(CLUE_2)).toEqual([]);

  // 4. Neither side of the server ever held an answer or a later clue.
  const file = storedHuntFile(hunt.id);
  for (const secret of [ANSWER_1, ANSWER_2, CLUE_2, "copper kettles", "marigold"]) {
    expect(file.toLowerCase(), `the stored hunt file contains "${secret}"`).not.toContain(secret.toLowerCase());
  }
  const sent = JSON.stringify(await signerLog()).toLowerCase();
  for (const secret of [...WRONG, ANSWER_1, ANSWER_2]) expect(sent).not.toContain(secret.toLowerCase());

  // 5. The creator's browser didn't send the answers either: it published ciphertext.
  for (const secret of [ANSWER_1, ANSWER_2, CLUE_2]) {
    expect(describe(creator.rec.carrying(secret)), `the creator's browser sent "${secret}"`).toEqual([]);
  }

  expect(solver.errors).toEqual([]);
  await creator.context.close();
  await solver.context.close();
});

test("progress survives a reload without the server knowing it", async ({ browser }) => {
  const creator = await visitor(browser);
  const hunt = await createHunt(creator.page, {
    title: "Progress test",
    firstClue: "First clue: what hangs over the garden gate?",
    stages: [{ answer: ANSWER_1, nextClue: CLUE_2 }, { answer: ANSWER_2 }],
  });

  const solver = await visitor(browser);
  await solver.page.goto(hunt.link, { waitUntil: "networkidle" });
  await solver.page.waitForSelector("#answer");
  await solver.page.waitForTimeout(500);
  await guess(solver.page, ANSWER_1, true);

  const beforeReload = solver.rec.mark();
  await solver.page.reload({ waitUntil: "networkidle" });
  await expect(solver.page.locator(".card.stage", { hasText: CLUE_2 })).toBeVisible(); // restored from this tab's own storage

  // The reload looks the same to the server as a first visit: no cookie, no
  // query string, nothing that says "this visitor is on stage 2".
  expect(await solver.context.cookies()).toEqual([]);
  // (Next.js adds ?_rsc=<build hash> when it preloads a linked page; it is the same for everyone.)
  for (const r of solver.rec.since(beforeReload).filter((r) => !/^(data|blob):/.test(r.url))) {
    expect(r.method).toBe("GET");
    expect(new URL(r.url).search.replace(/^\?_rsc=[\w-]+$/, ""), `query string on ${r.path}`).toBe("");
    expect(r.headers["cookie"]).toBeUndefined();
  }
  expect(solver.rec.carrying(ANSWER_1)).toEqual([]);

  await creator.context.close();
  await solver.context.close();
});
