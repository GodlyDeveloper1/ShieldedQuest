// Privacy X-ray: a live log of what this page sends and what it does locally.
//
// Runs only in the browser. It wraps window.fetch (to see request bodies) and
// watches the Performance API (to catch everything else the page loads: scripts,
// styles, images, other sites). Nothing here is ever sent anywhere; the log lives
// in this tab's memory and disappears on reload.

export type XKind = "sent" | "local" | "asset";

export interface XField {
  k: string;
  v: string;
  note?: string;
}

export interface XEvent {
  id: number;
  t: number; // Date.now()
  kind: XKind;
  title: string;
  detail?: string;
  method?: string;
  path?: string;
  host?: string;
  offsite?: boolean;
  status?: number;
  bytesOut?: number;
  fields?: XField[];
  count?: number; // identical repeats (e.g. balance polling)
  secret?: boolean; // the request carries something sensitive (shown masked)
}

export interface XStats {
  sent: number; // requests to this site with a purpose (not page files)
  offsite: number; // requests to any other host
  guessesLocal: number;
  guessesSent: number; // always 0 by design; counted for real so the claim is checkable
  assets: number;
}

type Listener = () => void;

let events: XEvent[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const stats: XStats = { sent: 0, offsite: 0, guessesLocal: 0, guessesSent: 0, assets: 0 };
/** Every guess typed this session, kept only so outgoing bodies can be checked for them. */
const guesses = new Set<string>();
let snapshot: { events: XEvent[]; stats: XStats } = { events, stats: { ...stats } };

function changed() {
  snapshot = { events, stats: { ...stats } };
  listeners.forEach((l) => l());
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getSnapshot() {
  return snapshot;
}

const EMPTY = { events: [] as XEvent[], stats: { sent: 0, offsite: 0, guessesLocal: 0, guessesSent: 0, assets: 0 } };
export function getServerSnapshot() {
  return EMPTY;
}

function push(e: Omit<XEvent, "id" | "t">) {
  const last = events[0];
  if (last && last.kind === e.kind && last.title === e.title && last.path === e.path && last.method === e.method && e.kind !== "local") {
    events = [{ ...last, count: (last.count ?? 1) + 1, t: Date.now(), status: e.status ?? last.status }, ...events.slice(1)];
  } else {
    events = [{ ...e, id: nextId++, t: Date.now() }, ...events].slice(0, 200);
  }
  changed();
}

/** Record something that happened inside the browser (nothing sent). */
export function recordLocal(title: string, detail?: string, fields?: XField[]) {
  push({ kind: "local", title, detail, fields });
}

/** Record a guess checked in the browser. The guess itself is only shown masked. */
export function recordGuess(stage: number, guess: string, ok: boolean, ms: number) {
  stats.guessesLocal++;
  const g = guess.trim();
  if (g.length >= 3) guesses.add(g.toLowerCase());
  push({
    kind: "local",
    title: `Guess for stage ${stage} checked in your browser`,
    detail: ok ? "Correct: the next stage was decrypted here." : "Wrong: the stage didn't decrypt. Nothing was sent.",
    fields: [
      { k: "your guess", v: mask(g), note: "never left this tab" },
      { k: "how", v: "Argon2id (64 MiB, 3 passes) → AES-256-GCM" },
      { k: "time", v: `${Math.round(ms)} ms` },
    ],
  });
}

export function clearLog() {
  events = [];
  changed();
}

// ---------------------------------------------------------------------------

function mask(s: string) {
  if (!s) return "(empty)";
  return `${"•".repeat(Math.min(12, s.length))} (${s.length} characters, hidden here too)`;
}

function short(s: string, n = 28) {
  return s.length > n ? `${s.slice(0, n - 10)}…${s.slice(-6)}` : s;
}

function hexPreview(buf: ArrayBuffer | Uint8Array) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(b.slice(0, 16), (x) => x.toString(16).padStart(2, "0")).join(" ") + (b.length > 16 ? " …" : "");
}

function size(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const HEX32 = "[0-9a-f]{32}";

interface Described {
  title: string;
  detail: string;
  fields?: XField[];
  secret?: boolean;
}

/** Plain-language description of a request to this site, from its method, path and body. */
function describe(method: string, path: string, body: unknown): Described {
  const json = typeof body === "string" ? safeJson(body) : null;

  if (method === "POST" && new RegExp(`^/api/hunts/${HEX32}/claim$`).test(path)) {
    const to = typeof json?.to === "string" ? json.to : "";
    const seed = typeof json?.seed_phrase === "string" ? json.seed_phrase : "";
    return {
      title: "Claim: asks the signer to pay out the prize",
      detail:
        "The only request that carries a secret. It sends the key your final answer unlocked plus your payout address. None of your answers are in it.",
      secret: true,
      fields: [
        { k: "seed_phrase", v: seed ? `${seed.split(/\s+/).length} words (hidden here)` : "—", note: "unlocked by your final answer; the pot is emptied with it" },
        { k: "to", v: to === "demo-pool" ? "demo-pool" : short(to), note: "your shielded address, used once" },
      ],
    };
  }
  if (method === "POST" && path === "/api/pots") {
    return {
      title: "New prize pot",
      detail: "Asks the signer for a fresh Zcash account. The request is empty; the reply has the pot's address, viewing key and seed phrase. The signer doesn't keep the seed phrase.",
    };
  }
  if (method === "POST" && path === "/api/media") {
    const n = body instanceof Uint8Array || body instanceof ArrayBuffer ? body.byteLength : 0;
    return {
      title: "Encrypted media upload",
      detail: "Your file was encrypted in this browser first. The server stores these bytes and can't open them.",
      fields: n
        ? [
            { k: "size", v: size(n) },
            { k: "first bytes", v: hexPreview(body as Uint8Array), note: "ciphertext" },
          ]
        : undefined,
    };
  }
  if (method === "POST" && path === "/api/hunts") {
    const stages = Array.isArray(json?.stages) ? json.stages.length : 0;
    if (json?.private)
      return {
        title: "Publish the hunt file (private hunt)",
        detail:
          "The sealed hunt. Even its title and first clue are encrypted, with an invite key that stays in your link and isn't in this request.",
        fields: [
          { k: "title", v: String(json.title ?? ""), note: "a placeholder, the real one is encrypted" },
          { k: "first_clue", v: "(empty)", note: "encrypted inside the sealed opening" },
          { k: "private", v: "encrypted blob", note: "title + first clue, AES-256-GCM" },
          { k: "stages", v: `${stages} × encrypted blob`, note: "AES-256-GCM ciphertext" },
          { k: "pot", v: "address + viewing key", note: "public, so anyone can check the prize" },
        ],
      };
    return {
      title: "Publish the hunt file",
      detail: "The sealed hunt: title, first clue and the locked stages. Answers, later clues and the prize key are inside the ciphertext, not readable here.",
      fields: json
        ? [
            { k: "title", v: short(String(json.title ?? ""), 40), note: "public" },
            { k: "first_clue", v: short(String(json.first_clue ?? ""), 40), note: "public" },
            { k: "stages", v: `${stages} × encrypted blob`, note: "AES-256-GCM ciphertext" },
            { k: "pot", v: "address + viewing key", note: "public, so anyone can check the prize" },
          ]
        : undefined,
    };
  }
  if (method === "GET" && new RegExp(`^/api/hunts/${HEX32}/pot$`).test(path)) {
    return { title: "Prize balance check", detail: "Reads the pot's balance. Every visitor makes the same request, solved or not." };
  }
  if (method === "GET" && new RegExp(`^/api/media/${HEX32}$`).test(path)) {
    return {
      title: "Encrypted media download",
      detail: "Every media file of the hunt is downloaded when the page opens, so the server can't tell how far you got.",
    };
  }
  if (method === "GET" && new RegExp(`^/api/hunts/${HEX32}$`).test(path)) {
    return { title: "Hunt file", detail: "The public hunt file, the same for everyone." };
  }
  if (path.startsWith("/api/")) return { title: `${method} ${path}`, detail: "A request to this site." };
  return { title: "Page navigation", detail: "Loads the next page. Contains only the page address." };
}

function safeJson(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function bodyText(body: unknown): string {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return "";
}

/** True if any guess typed this session is sent as a value in the outgoing body.
 *  (The claim's seed phrase is skipped: it's random words, not something you typed.) */
function leaksGuess(body: unknown): boolean {
  if (!guesses.size) return false;
  const text = bodyText(body);
  if (!text) return false;
  const json = safeJson(text);
  if (json) {
    const values: string[] = [];
    const walk = (v: unknown, key = "") => {
      if (key === "seed_phrase") return;
      if (typeof v === "string") values.push(v.trim().toLowerCase());
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    walk(json);
    return values.some((v) => guesses.has(v));
  }
  const low = text.toLowerCase();
  for (const g of guesses) if (g.length >= 6 && low.includes(g)) return true;
  return false;
}

function isDevTooling(path: string) {
  return path.startsWith("/_next/") || path.startsWith("/__nextjs") || path.includes("webpack-hmr") || path.includes("turbopack");
}

let installed = false;

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input), window.location.href);
    const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    const body = init?.body;
    const offsite = url.host !== window.location.host;
    const res = await original(input, init);
    try {
      if (offsite) {
        stats.offsite++;
        push({ kind: "sent", title: `Request to another site: ${url.host}`, detail: "This site doesn't do this; if you see it, something is wrong.", method, path: url.pathname, host: url.host, offsite: true, status: res.status });
      } else if (!isDevTooling(url.pathname)) {
        stats.sent++;
        if (leaksGuess(body)) stats.guessesSent++;
        const d = describe(method, url.pathname, body);
        const n = typeof body === "string" ? body.length : body instanceof Uint8Array || body instanceof ArrayBuffer ? body.byteLength : 0;
        push({ kind: "sent", ...d, method, path: url.pathname, status: res.status, bytesOut: n });
      }
    } catch {
      // the X-ray must never break the page
    }
    return res;
  };

  // Everything else the page loads (scripts, styles, fonts, images, other sites).
  try {
    const seen = new Set<string>();
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const r = entry as PerformanceResourceTiming;
        if (r.initiatorType === "fetch" || r.initiatorType === "xmlhttprequest") continue; // the fetch wrapper has these
        if (seen.has(r.name)) continue;
        seen.add(r.name);
        let u: URL;
        try {
          u = new URL(r.name);
        } catch {
          continue;
        }
        if (u.protocol === "blob:" || u.protocol === "data:") continue;
        if (u.host !== window.location.host) {
          stats.offsite++;
          push({ kind: "sent", title: `Loaded from another site: ${u.host}`, detail: "Every file should come from this site.", path: u.pathname, host: u.host, offsite: true });
        } else {
          stats.assets++;
          changed();
        }
      }
    });
    obs.observe({ type: "resource", buffered: true });
  } catch {
    // older browsers: the fetch log still works
  }

  const nav = performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (nav) {
    push({ kind: "sent", title: "Opened this page", detail: "The page address only. Clues, answers and progress aren't part of it.", method: "GET", path: new URL(nav.name).pathname });
    stats.sent++;
    changed();
  }
}

install();
