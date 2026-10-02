// Server-only client for the Rust signer. The signer binds to 127.0.0.1, so
// browsers never talk to it directly; they go through our API routes.
import "server-only";

const SIGNER_URL = process.env.SIGNER_URL ?? "http://127.0.0.1:8081";

export interface NewPot {
  pot_id: string;
  seed_phrase: string;
  viewing_key: string;
  address: string;
  birthday_height: number;
}

export interface PotStatus {
  pot_id: string;
  viewing_key: string;
  address: string;
  balance_total_zatoshis: number;
  balance_spendable_zatoshis: number;
  scanned_height: number;
  /** Missing from signers built before Oct 1. */
  birthday_height?: number;
  claimed: boolean;
}

export class SignerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SIGNER_URL}${path}`, { ...init, cache: "no-store" });
  } catch {
    throw new SignerError(503, "The signer isn't reachable. Is it running (cargo run --release)?");
  }
  if (!res.ok) throw new SignerError(res.status, (await res.text()) || `signer returned ${res.status}`);
  return (await res.json()) as T;
}

/** Creates a pot. The response holds the seed phrase: pass it straight through, never log or store it. */
export function createPot(): Promise<NewPot> {
  return call<NewPot>("/pots", { method: "POST" });
}

export interface ImportedPot {
  pot_id: string;
  viewing_key: string;
  address: string;
  birthday_height: number;
}

/**
 * Registers a pot whose keys were made in the creator's browser. Only its
 * viewing key and the seed's fingerprint are sent; the seed phrase never is.
 */
export function importPot(viewingKey: string, seedFingerprint: string): Promise<ImportedPot> {
  return call<ImportedPot>("/pots/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ viewing_key: viewingKey, seed_fingerprint: seedFingerprint }),
  });
}

export function potStatus(potId: string): Promise<PotStatus> {
  if (!/^[0-9a-f]{1,64}$/.test(potId)) throw new SignerError(400, "bad pot id");
  return call<PotStatus>(`/pots/${potId}`);
}

const statusCache = new Map<string, { at: number; value: Promise<PotStatus> }>();

/**
 * Pot status with a few seconds of caching, for pages anyone can load (the
 * hunt list, a hunt page, its balance box). Without it, every page view would
 * turn into signer work, and a flood of views could stall real claims. A claim
 * clears the pot's entry, so "Claimed" shows at once.
 */
export function potStatusCached(potId: string, ttlMs = 5000): Promise<PotStatus> {
  const now = Date.now();
  const hit = statusCache.get(potId);
  if (hit && now - hit.at < ttlMs) return hit.value;
  const value = potStatus(potId);
  statusCache.set(potId, { at: now, value });
  value.catch(() => statusCache.delete(potId)); // don't cache failures
  if (statusCache.size > 5000) for (const [k, v] of statusCache) if (now - v.at > 60_000) statusCache.delete(k);
  return value;
}

/**
 * Sweeps a pot to the winner. The body holds the pot's seed phrase: never log
 * it. The signer checks the phrase matches the pot and locks the pot before
 * broadcasting, so a second claim is refused.
 */
export async function claimPot(potId: string, seedPhrase: string, to: string): Promise<{ txid: string }> {
  if (!/^[0-9a-f]{1,64}$/.test(potId)) throw new SignerError(400, "bad pot id");
  try {
    return await call<{ txid: string }>(`/pots/${potId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed_phrase: seedPhrase, to }),
    });
  } finally {
    statusCache.delete(potId);
  }
}

export interface ChainStatus {
  chain_tip: number;
  scanned_height: number;
}

/** Sync heights only, for the status line in the sidebar. */
export async function chainStatus(): Promise<ChainStatus | null> {
  try {
    const p = await call<{ chain_tip: number; scanned_height: number }>("/payments");
    return { chain_tip: p.chain_tip, scanned_height: p.scanned_height };
  } catch {
    return null;
  }
}

/** Sends from the signer's own wallet. No memo on purpose (pot viewing keys are public). */
export function send(to: string, zatoshis: number): Promise<{ txid: string }> {
  return call<{ txid: string }>("/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, zatoshis }),
  });
}

/** A fresh, never-reused address of the signer's own wallet. */
export async function newAddress(): Promise<string> {
  const r = await call<{ address: string }>("/address", { method: "POST" });
  return r.address;
}
