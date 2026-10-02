// Claim: "Images, video and audio are encrypted in the creator's browser. Media
// for later clues stays locked, and the server can't infer progress from which
// files a solver fetches."
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe } from "../lib/recorder";
import { createHunt, guess, storedFiles, storedHuntFile, visitor, WEB } from "../lib/site";

// A valid 1x1 PNG followed by a marker, so the plaintext is easy to spot.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const MARKER_1 = "PLAINTEXT-MARKER-FIRST-CLUE-PHOTO-61127";
const MARKER_2 = "PLAINTEXT-MARKER-SECOND-CLUE-PHOTO-90453";
const ANSWER_1 = "saffron weathervane 4416";
const ANSWER_2 = "indigo sextant 7203 brass";

test("clue media is uploaded as ciphertext, and fetching it reveals nothing about progress", async ({ browser }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sq-media-"));
  const first = path.join(dir, "harbour-map-first.png");
  const second = path.join(dir, "vault-door-second.png");
  fs.writeFileSync(first, Buffer.concat([PNG, Buffer.from(MARKER_1)]));
  fs.writeFileSync(second, Buffer.concat([PNG, Buffer.from(MARKER_2)]));

  const creator = await visitor(browser);
  const hunt = await createHunt(creator.page, {
    title: "Media test",
    firstClue: "Look at the photo. What turns on the roof?",
    stages: [{ answer: ANSWER_1, nextClue: "Now the second photo. What is on the desk?" }, { answer: ANSWER_2 }],
    firstMedia: [first],
    secondMedia: [second],
  });

  // Uploads: two of them, neither containing the picture or anything about it.
  const uploads = creator.rec.seen.filter((r) => r.method === "POST" && r.path === "/api/media");
  expect(uploads).toHaveLength(2);
  const pngHeader = PNG.subarray(0, 8).toString("latin1");
  for (const up of uploads) {
    const body = up.body!.toString("latin1");
    for (const plain of [MARKER_1, MARKER_2, pngHeader, "IHDR", "harbour-map", "vault-door"]) {
      expect(body, "an upload body contains plaintext").not.toContain(plain);
    }
    expect(JSON.stringify(up.headers), "an upload's headers name the file").not.toMatch(/harbour-map|vault-door|image\/png/);
  }
  for (const secret of [MARKER_1, MARKER_2, "vault-door-second"]) {
    expect(describe(creator.rec.carrying(secret)), `the creator's browser sent "${secret}"`).toEqual([]);
  }

  // Storage: ciphertext only. The later clue's file name is sealed inside its stage.
  const files = storedFiles();
  expect(files.filter(([name]) => name.startsWith("media")).length).toBe(2);
  for (const [name, bytes] of files) {
    const text = bytes.toString("latin1");
    for (const plain of [MARKER_1, MARKER_2, pngHeader, "vault-door"]) expect(text, `${name} contains plaintext`).not.toContain(plain);
  }
  const stored = JSON.parse(storedHuntFile(hunt.id)).hunt;
  expect(stored.media_ids).toHaveLength(2);

  // A solver's browser fetches every media file when the page opens, solved or not...
  const solver = await visitor(browser);
  await solver.page.goto(hunt.link, { waitUntil: "networkidle" });
  await solver.page.waitForSelector(".media-list img");
  const fetchedOnOpen = new Set(solver.rec.seen.map((r) => r.path.match(/^\/api\/media\/([0-9a-f]{32})$/)?.[1]).filter(Boolean));
  for (const id of stored.media_ids) expect(fetchedOnOpen.has(id), `media ${id} wasn't fetched when the page opened`).toBe(true);

  // ...shows only the first clue's picture, decrypted in memory...
  const img = solver.page.locator(".media-list img");
  await expect(img).toHaveCount(1);
  expect(await img.first().getAttribute("src")).toMatch(/^blob:/);
  await expect.poll(() => img.first().evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);

  // ...and solving a stage reveals the next picture without asking the server for anything.
  await solver.page.waitForTimeout(500);
  const beforeSolving = solver.rec.mark();
  await guess(solver.page, ANSWER_1, true);
  await expect(img).toHaveCount(2);
  await expect.poll(() => img.nth(1).evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
  const afterSolving = solver.rec.since(beforeSolving).filter((r) => !/^(data|blob):/.test(r.url));
  expect(afterSolving.filter((r) => r.path.startsWith("/api/media")).map((r) => r.path), "solving a stage triggered a media request").toEqual([]);

  expect(solver.rec.otherHosts(WEB)).toEqual([]);
  expect(solver.errors).toEqual([]);
  await creator.context.close();
  await solver.context.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
