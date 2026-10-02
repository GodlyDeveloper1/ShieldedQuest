// Helpers that drive the real pages the way a person would, plus access to the
// two things a test can inspect on the "server side": the files the web app
// wrote, and everything the stand-in signer was sent.
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { Recorder } from "./recorder";

export const WEB = process.env.SQ_WEB!;
export const SIGNER = process.env.SQ_SIGNER!;
export const DATA_DIR = process.env.SQ_TEST_DATA!;

let visitors = 0;

export interface Visitor {
  context: BrowserContext;
  page: Page;
  rec: Recorder;
  errors: string[];
}

/**
 * A fresh browser profile with every request recorded. Each visitor reports its
 * own address through X-Forwarded-For (the app runs with TRUST_PROXY=1, as it
 * does behind a proxy), so rate limits apply per test visitor.
 */
export async function visitor(browser: Browser): Promise<Visitor> {
  visitors += 1;
  const context = await browser.newContext({
    extraHTTPHeaders: { "X-Forwarded-For": `10.${process.pid % 250}.${Math.floor(visitors / 250)}.${(visitors % 250) + 1}` },
    acceptDownloads: true,
  });
  const rec = new Recorder(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, rec, errors };
}

export interface Stage {
  /** The clue this stage's answer reveals. Leave out for the last stage: it reveals the prize. */
  answer: string;
  nextClue?: string;
}

export interface HuntSpec {
  title: string;
  firstClue: string;
  stages: Stage[];
  isPrivate?: boolean;
  /** Files to attach to the first clue. */
  firstMedia?: string[];
  /** Files to attach to the clue revealed by stage 1. */
  secondMedia?: string[];
}

export interface Made {
  id: string;
  /** The address to open the hunt. For a private hunt this is the invite link. */
  link: string;
  /** The 24 words shown to the creator on the backup step. */
  seedPhrase: string;
  /** Private hunts only: the invite key from the link's #fragment. */
  inviteKey?: string;
  /** Which side made the pot, read from the box on the backup step. */
  madeBy: "browser" | "server";
}

/** Creates and publishes a hunt through the create page. */
export async function createHunt(page: Page, spec: HuntSpec): Promise<Made> {
  await page.goto("/create", { waitUntil: "networkidle" });
  await page.waitForSelector("#tpl");
  await page.waitForTimeout(500); // let the form become interactive

  await page.fill("#title", spec.title);
  await page.fill("#clue1", spec.firstClue);
  if (spec.isPrivate) await page.check(".private-toggle input");
  if (spec.firstMedia) await page.locator(".picker-add input").first().setInputFiles(spec.firstMedia);

  for (let i = 0; i < spec.stages.length; i++) {
    const stage = spec.stages[i];
    await page.fill(`#a${i}`, stage.answer);
    if (i < spec.stages.length - 1) {
      await page.click("text=Add a stage");
      await page.fill(`#c${i}`, stage.nextClue ?? `Clue ${i + 2}`);
      if (i === 0 && spec.secondMedia) await page.locator(".card.stage .picker-add input").first().setInputFiles(spec.secondMedia);
    }
  }

  await page.click("main button.primary");
  await page.waitForSelector(".seed", { timeout: 60_000 });
  const madeBy = (await page.locator(".made-here").count()) > 0 ? "browser" : "server";
  const spans = await page.locator(".seed span").allInnerTexts();
  const seedPhrase = spans.map((w) => w.replace(/^\s*\d+\.\s*/, "").trim()).join(" ");
  expect(seedPhrase.split(" ")).toHaveLength(24);

  await page.check("label.row input[type=checkbox]");
  await page.click("text=Lock the hunt and publish");
  await page.waitForSelector("text=Your hunt is live", { timeout: 120_000 });

  const href = await page.locator('a:has-text("Open the hunt page")').first().getAttribute("href");
  const id = href!.match(/hunt\/([0-9a-f]{32})/)![1];
  if (!spec.isPrivate) return { id, link: `${WEB}/hunt/${id}`, seedPhrase, madeBy };

  const link = (await page.locator(".share-url").first().innerText()).trim();
  const inviteKey = link.split("#k=")[1];
  expect(inviteKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return { id, link: `${WEB}/hunt/${id}#k=${inviteKey}`, seedPhrase, inviteKey, madeBy };
}

/** Types a guess and waits for the page to say whether it was right. */
export async function guess(page: Page, text: string, expectRight: boolean, wrongSoFar = 0): Promise<void> {
  await page.fill("#answer", text);
  await page.click("form button.primary");
  if (expectRight) {
    await expect(page.locator("text=/Correct! Stage \\d+ unlocked|You solved it/").first()).toBeVisible({ timeout: 60_000 });
  } else {
    const n = wrongSoFar + 1;
    await expect(page.locator(`text=(${n} ${n === 1 ? "try" : "tries"} on this clue)`)).toBeVisible({ timeout: 60_000 });
  }
}

/** What the web app stored for a hunt, as raw text. */
export function storedHuntFile(id: string): string {
  return fs.readFileSync(path.join(DATA_DIR, "hunts", `${id}.json`), "utf8");
}

/** Every file the web app has written, as [relative path, bytes]. */
export function storedFiles(): [string, Buffer][] {
  const out: [string, Buffer][] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push([path.relative(DATA_DIR, full), fs.readFileSync(full)]);
    }
  };
  walk(DATA_DIR);
  return out;
}

export interface SignerEntry {
  method: string;
  path: string;
  body: string;
}

/** Everything the stand-in signer has been sent since it started. */
export async function signerLog(): Promise<SignerEntry[]> {
  const res = await fetch(`${SIGNER}/__log`);
  return (await res.json()) as SignerEntry[];
}
