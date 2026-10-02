// Simple in-memory rate limits for the public demo. Each pot the signer creates is
// another account it has to scan forever, so pot creation is limited both per
// visitor and globally. In-memory is enough for a single-server deployment; limits
// reset when the app restarts.
import "server-only";

type Window = { hits: number[] };
const buckets = new Map<string, Window>();

export interface Limit {
  name: string;
  max: number;
  windowMs: number;
}

export const LIMITS = {
  potPerIp: { name: "pot-ip", max: 3, windowMs: 60 * 60_000 },
  potGlobal: { name: "pot-all", max: 30, windowMs: 60 * 60_000 },
  huntPerIp: { name: "hunt-ip", max: 10, windowMs: 60 * 60_000 },
  claimPerIp: { name: "claim-ip", max: 10, windowMs: 60 * 60_000 },
  mediaPerIp: { name: "media-ip", max: 40, windowMs: 60 * 60_000 },
  /** Bytes, not requests: 200 MB of uploads per visitor per hour. */
  mediaBytesPerIp: { name: "media-bytes-ip", max: 200 * 1024 * 1024, windowMs: 60 * 60_000 },
  /** New demo hunts the server will make and fund per hour, however many are claimed. */
  demoRefill: { name: "demo-refill", max: 12, windowMs: 60 * 60_000 },
} satisfies Record<string, Limit>;

/**
 * The visitor's address, used only as a rate-limit key in memory (never logged or
 * stored). X-Forwarded-For is trusted only when TRUST_PROXY=1, i.e. behind our
 * own Caddy, and only its LAST entry: that's the one our proxy appended. Earlier
 * entries come from the visitor and could be made up to dodge limits.
 */
export function clientKey(req: Request): string {
  if (process.env.TRUST_PROXY === "1") {
    const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1].slice(0, 64);
  }
  return "direct";
}

// Off under `next dev` so local testing isn't throttled; on in production builds.
function enabled(): boolean {
  return process.env.NODE_ENV === "production" || process.env.RATE_LIMITS === "on";
}

/** Records a hit and returns how many seconds to wait if over the limit, or 0. */
export function hit(limit: Limit, key: string): number {
  if (!enabled()) return 0;
  const id = `${limit.name}:${key}`;
  const now = Date.now();
  const w = buckets.get(id) ?? { hits: [] };
  w.hits = w.hits.filter((t) => now - t < limit.windowMs);
  if (w.hits.length >= limit.max) {
    buckets.set(id, w);
    return Math.ceil((limit.windowMs - (now - w.hits[0])) / 1000);
  }
  w.hits.push(now);
  buckets.set(id, w);
  return 0;
}

/** Checks several limits; records hits only if all pass. Returns seconds to wait, or 0. */
export function hitAll(checks: [Limit, string][]): number {
  if (!enabled()) return 0;
  const now = Date.now();
  for (const [limit, key] of checks) {
    const w = buckets.get(`${limit.name}:${key}`);
    const recent = w ? w.hits.filter((t) => now - t < limit.windowMs) : [];
    if (recent.length >= limit.max) return Math.ceil((limit.windowMs - (now - recent[0])) / 1000);
  }
  for (const [limit, key] of checks) hit(limit, key);
  return 0;
}

type Spend = { t: number; n: number }[];
const budgets = new Map<string, Spend>();

/**
 * A budget measured in units (e.g. bytes) instead of requests. Records `amount`
 * and returns 0, or returns the seconds to wait if it would go over the limit.
 * Always enforced when `always` is set (used for the demo pool, which costs coins).
 */
export function spend(limit: Limit, key: string, amount: number, always = false): number {
  if (!always && !enabled()) return 0;
  const id = `${limit.name}:${key}`;
  const now = Date.now();
  const list = (budgets.get(id) ?? []).filter((e) => now - e.t < limit.windowMs);
  const used = list.reduce((s, e) => s + e.n, 0);
  if (used + amount > limit.max) {
    budgets.set(id, list);
    return list.length ? Math.ceil((limit.windowMs - (now - list[0].t)) / 1000) : Math.ceil(limit.windowMs / 1000);
  }
  list.push({ t: now, n: amount });
  budgets.set(id, list);
  return 0;
}

export function tooMany(retryAfterS: number, what: string) {
  const mins = Math.max(1, Math.round(retryAfterS / 60));
  return Response.json(
    { error: `Too many ${what} from here. Please try again in about ${mins} minute${mins === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(retryAfterS), "Cache-Control": "no-store" } },
  );
}

// Drop stale buckets now and then so memory doesn't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [id, w] of buckets) if (w.hits.every((t) => now - t > 60 * 60_000)) buckets.delete(id);
  for (const [id, list] of budgets) if (list.every((e) => now - e.t > 60 * 60_000)) budgets.delete(id);
}, 10 * 60_000).unref?.();
