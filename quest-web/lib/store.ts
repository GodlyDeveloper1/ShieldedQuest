// Published hunts, one JSON file each in quest-web/data/hunts/.
// Hunt files are public by design: ciphertext, clues-to-start, pot address and viewing key.
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Hunt } from "quest-crypto";
import { DATA_DIR } from "./datadir";

const DIR = path.join(DATA_DIR, "hunts");

export interface StoredHunt {
  hunt: Hunt;
  published_at: string; // ISO date, day precision only
}

function fileFor(huntId: string): string {
  if (!/^[0-9a-f]{32}$/.test(huntId)) throw new Error("bad hunt id");
  return path.join(DIR, `${huntId}.json`);
}

export async function saveHunt(hunt: Hunt): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const record: StoredHunt = { hunt, published_at: new Date().toISOString().slice(0, 10) };
  // "wx" fails if the file exists, so a hunt can't be overwritten.
  await fs.writeFile(fileFor(hunt.hunt_id), JSON.stringify(record, null, 2), { flag: "wx" });
}

export async function getHunt(huntId: string): Promise<StoredHunt | null> {
  try {
    return JSON.parse(await fs.readFile(fileFor(huntId), "utf8")) as StoredHunt;
  } catch {
    return null;
  }
}

export async function listHunts(): Promise<StoredHunt[]> {
  let names: string[];
  try {
    names = await fs.readdir(DIR);
  } catch {
    return [];
  }
  const all = await Promise.all(
    names.filter((n) => /^[0-9a-f]{32}\.json$/.test(n)).map((n) => getHunt(n.slice(0, 32))),
  );
  return all.filter((h): h is StoredHunt => h !== null);
}

export async function potInUse(potId: string): Promise<boolean> {
  return (await listHunts()).some((h) => h.hunt.pot.pot_id === potId);
}
