// Encrypted media storage. The server only ever holds ciphertext: files are
// encrypted in the creator's browser (quest-crypto encryptMedia) and decrypted
// in solvers' browsers. The server can't tell what an upload is, only its size.
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { listHunts } from "./store";
import { DATA_DIR } from "./datadir";

const DIR = path.join(DATA_DIR, "media");
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024 + 28; // 25 MB file + nonce + tag
const MAX_TOTAL_BYTES = Number(process.env.MEDIA_MAX_TOTAL_MB ?? 3000) * 1024 * 1024;
// A hunt is published seconds after its files upload, so anything unclaimed after two hours is abandoned.
const ORPHAN_AGE_MS = 2 * 60 * 60_000;

const ID = /^[0-9a-f]{32}$/;

function fileFor(id: string): string {
  if (!ID.test(id)) throw new Error("bad media id");
  return path.join(DIR, `${id}.bin`);
}

async function totalBytes(): Promise<number> {
  try {
    const names = await fs.readdir(DIR);
    let sum = 0;
    for (const n of names) sum += (await fs.stat(path.join(DIR, n))).size;
    return sum;
  } catch {
    return 0;
  }
}

/** Stores one encrypted upload, write-once. */
export async function saveMedia(id: string, bytes: Uint8Array): Promise<void> {
  if (bytes.length < 29) throw new Error("upload too small");
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error("file too large (25 MB max)");
  if ((await totalBytes()) + bytes.length > MAX_TOTAL_BYTES) throw new Error("media storage is full right now");
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(fileFor(id), bytes, { flag: "wx" });
}

export async function readMedia(id: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await fs.readFile(fileFor(id)));
  } catch {
    return null;
  }
}

export async function mediaExists(id: string): Promise<boolean> {
  try {
    await fs.access(fileFor(id));
    return true;
  } catch {
    return false;
  }
}

/** Deletes uploads that no published hunt references and that are over two hours old. */
export async function cleanOrphanMedia(): Promise<number> {
  let names: string[];
  try {
    names = await fs.readdir(DIR);
  } catch {
    return 0;
  }
  const used = new Set((await listHunts()).flatMap(({ hunt }) => hunt.media_ids ?? []));
  let removed = 0;
  for (const n of names) {
    const id = n.replace(/\.bin$/, "");
    if (used.has(id)) continue;
    const p = path.join(DIR, n);
    const st = await fs.stat(p);
    if (Date.now() - st.mtimeMs > ORPHAN_AGE_MS) {
      await fs.unlink(p);
      removed++;
    }
  }
  return removed;
}
