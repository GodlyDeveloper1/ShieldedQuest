// Hunt summaries for the gallery, and a fingerprint for each hunt file.
import "server-only";
import { createHash } from "node:crypto";
import type { Hunt } from "quest-crypto";
import { listHunts } from "./store";
import { potStatusCached } from "./signer";
import { demoHuntIds } from "./demo";

export type HuntState = "open" | "unfunded" | "claimed" | "unknown";

export interface HuntSummary {
  hunt_id: string;
  title: string;
  stage_count: number;
  published_at: string;
  prize_zatoshis: number; // verified (spendable) balance
  confirming_zatoshis: number;
  state: HuntState;
}

/**
 * SHA-256 of the hunt file exactly as served by /api/hunts/[id].
 * Anyone who saved the file can recompute it and see if the site changed it.
 */
export function huntFingerprint(hunt: Hunt): string {
  return createHash("sha256").update(JSON.stringify(hunt)).digest("hex");
}

/**
 * Summaries for the gallery. Demo hunts (the judge pool) are left out unless
 * `only` asks for specific hunt ids. Private (invite-only) hunts are never listed.
 */
export async function huntSummaries(opts: { only?: string[] } = {}): Promise<HuntSummary[]> {
  const stored = await listHunts();
  const demo = await demoHuntIds();
  const out: HuntSummary[] = [];
  // One at a time: the signer handles pot lookups on a single worker anyway.
  for (const { hunt, published_at } of stored) {
    if (opts.only ? !opts.only.includes(hunt.hunt_id) : demo.has(hunt.hunt_id)) continue;
    if (hunt.private) continue; // invite-only hunts are never listed
    const base = { hunt_id: hunt.hunt_id, title: hunt.title, stage_count: hunt.stage_count, published_at };
    try {
      const p = await potStatusCached(hunt.pot.pot_id, 10_000);
      const state: HuntState = p.claimed ? "claimed" : p.balance_total_zatoshis > 0 ? "open" : "unfunded";
      out.push({
        ...base,
        prize_zatoshis: p.balance_spendable_zatoshis,
        confirming_zatoshis: p.balance_total_zatoshis - p.balance_spendable_zatoshis,
        state,
      });
    } catch {
      out.push({ ...base, prize_zatoshis: 0, confirming_zatoshis: 0, state: "unknown" });
    }
  }
  const rank: Record<HuntState, number> = { open: 0, unfunded: 1, unknown: 2, claimed: 3 };
  return out.sort(
    (a, b) =>
      rank[a.state] - rank[b.state] ||
      b.prize_zatoshis - a.prize_zatoshis ||
      b.published_at.localeCompare(a.published_at),
  );
}
