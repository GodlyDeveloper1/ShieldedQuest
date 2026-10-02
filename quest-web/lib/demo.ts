// The judge demo: a small pool of funded demo hunts, so "Try the demo" always
// has one ready. Demo hunts are made here on the server with the same code a
// creator's browser uses. Their answers are printed in the clues on purpose, so
// they skip the final-answer strength rule (which only the create page enforces).
//
// Lifecycle: create pot -> lock hunt -> publish -> fund from the signer's own
// wallet (no memo) -> confirming -> open -> claimed (by a judge, or swept back
// to the pool) -> a replacement is created on the next run.
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHunt } from "quest-crypto";
import { createPot, potStatus, potStatusCached, send } from "./signer";
import { saveHunt } from "./store";
import { LIMITS, spend } from "./ratelimit";

const POOL_SIZE = Number(process.env.DEMO_POOL_SIZE ?? 3);
const PRIZE_ZAT = Number(process.env.DEMO_PRIZE_ZAT ?? 100_000); // 0.001 TAZ
const REG_FILE = path.join(process.cwd(), "data", "demo.json");

export const DEMO = {
  title: "Practice: First Steps",
  firstClue:
    "Stage 1 of 2. What do you call Zcash that hides the sender, the receiver and the amount?\n\n" +
    "Hint: the answer is “shielded”.",
  stages: [
    {
      answer: "shielded",
      nextClue:
        "Stage 2 of 2. Every guess you make here is slowed down by a memory-hard password hashing function that " +
        "won the Password Hashing Competition. What is it called?\n\nHint: the answer is “argon2id”.",
    },
    { answer: "argon2id" },
  ],
};

interface DemoEntry {
  pot_id: string;
  address: string;
  created_at: string;
  funded_txid?: string;
  last_error?: string;
  /** Set once the hunt's prize has been claimed, so it's never looked up again. */
  claimed?: true;
}
type Registry = Record<string, DemoEntry>; // hunt_id -> entry

async function loadReg(): Promise<Registry> {
  try {
    return JSON.parse(await fs.readFile(REG_FILE, "utf8")) as Registry;
  } catch {
    return {};
  }
}

async function saveReg(reg: Registry): Promise<void> {
  await fs.mkdir(path.dirname(REG_FILE), { recursive: true });
  const tmp = REG_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(reg, null, 2));
  await fs.rename(tmp, REG_FILE);
}

export async function isDemoHunt(huntId: string): Promise<boolean> {
  return huntId in (await loadReg());
}

export async function demoHuntIds(): Promise<Set<string>> {
  return new Set(Object.keys(await loadReg()));
}

/** An open demo hunt (verified prize, not claimed), oldest first; null if none is ready. */
export async function pickDemoHunt(): Promise<string | null> {
  const reg = await loadReg();
  const ids = Object.keys(reg).sort((a, b) => reg[a].created_at.localeCompare(reg[b].created_at));
  for (const id of ids) {
    if (reg[id].claimed) continue;
    try {
      const p = await potStatusCached(reg[id].pot_id, 8000);
      if (!p.claimed && p.balance_spendable_zatoshis > 0) return id;
    } catch {
      // signer offline or pot unknown: skip
    }
  }
  return null;
}

async function createDemoHunt(reg: Registry): Promise<string> {
  const pot = await createPot();
  const hunt = await createHunt({
    title: DEMO.title,
    firstClue: DEMO.firstClue,
    stages: DEMO.stages,
    seedPhrase: pot.seed_phrase,
    pot: { pot_id: pot.pot_id, address: pot.address, viewing_key: pot.viewing_key },
  });
  await saveHunt(hunt);
  reg[hunt.hunt_id] = { pot_id: pot.pot_id, address: pot.address, created_at: new Date().toISOString() };
  await saveReg(reg);
  console.log(`[demo] created demo hunt ${hunt.hunt_id}`);
  return hunt.hunt_id;
}

async function fund(reg: Registry, huntId: string): Promise<void> {
  const e = reg[huntId];
  try {
    const { txid } = await send(e.address, PRIZE_ZAT);
    e.funded_txid = txid;
    delete e.last_error;
    console.log(`[demo] funded ${huntId} with ${PRIZE_ZAT} zat`);
  } catch (err) {
    e.last_error = err instanceof Error ? err.message.slice(0, 200) : "funding failed";
    console.log(`[demo] funding ${huntId} failed: ${e.last_error}`);
  }
  await saveReg(reg);
}

let running: Promise<void> | null = null;

/**
 * Tops the pool up to POOL_SIZE live (unclaimed) demo hunts and funds any that
 * aren't funded yet. Stops at the first funding failure so a problem can't
 * spiral. Safe to call often; concurrent calls share one run.
 */
export function ensureDemoPool(): Promise<void> {
  if (POOL_SIZE <= 0) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    const reg = await loadReg();
    let live = 0;
    let dirty = false;
    for (const id of Object.keys(reg)) {
      const e = reg[id];
      if (e.claimed) continue;
      let claimed = false;
      let total = 0;
      try {
        const p = await potStatus(e.pot_id);
        claimed = p.claimed;
        total = p.balance_total_zatoshis;
      } catch {
        continue; // signer offline: try again next run
      }
      if (claimed) {
        e.claimed = true;
        dirty = true;
        continue;
      }
      live++;
      if (!e.funded_txid && total === 0) await fund(reg, id);
    }
    if (dirty) await saveReg(reg);
    // Fill up to the pool size; stop at the first failure (e.g. low balance).
    for (let made = 0; live < POOL_SIZE && made < POOL_SIZE; made++, live++) {
      // An hourly cap on refills, so someone claiming demo prizes in a loop can't drain the wallet.
      if (spend(LIMITS.demoRefill, "all", 1, true)) {
        console.log("[demo] hourly refill limit reached; waiting");
        break;
      }
      const id = await createDemoHunt(reg);
      await fund(reg, id);
      if (reg[id].last_error) break;
    }
  })()
    .catch((err) => console.log(`[demo] pool run failed: ${err instanceof Error ? err.message : err}`))
    .finally(() => {
      running = null;
    });
  return running;
}

let started = false;

/** Called once at server start: first run after 20 s, then every 5 minutes. */
export function startDemoPool(): void {
  if (started || POOL_SIZE <= 0) return;
  started = true;
  console.log(`[demo] keeping ${POOL_SIZE} demo hunts ready (prize ${PRIZE_ZAT} zat each)`);
  setTimeout(() => void ensureDemoPool(), 20_000);
  setInterval(() => void ensureDemoPool(), 5 * 60_000).unref?.();
}
