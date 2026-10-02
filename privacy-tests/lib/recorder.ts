// Records every request a browser context makes, and searches them for secrets.
//
// "Carrying" a secret means it appears in a request's address, headers or body
// in plain form or a common encoding (lower-cased, joined, percent-encoded,
// Base64, hex). That can't rule out every possible transformation, so the
// tests also assert the stronger thing wherever they can: that no request with
// a body was made at all, or that a body has exactly the expected fields.
import type { BrowserContext } from "@playwright/test";

export interface Seen {
  method: string;
  url: string;
  path: string;
  type: string;
  headers: Record<string, string>;
  body: Buffer | null;
}

function words(secret: string): string[] {
  return secret
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ");
}

/** The shapes a secret could travel in. Short shapes are dropped: they'd match by chance. */
export function forms(secret: string): { text: string[]; exact: string[] } {
  const s = secret.trim();
  const w = words(s);
  const text = new Set([s, w.join(" "), w.join(""), w.join("-"), w.join("_"), w.join("+"), w.join(","), w.join('","')]);
  const exact = new Set<string>();
  for (const v of text) {
    const bytes = Buffer.from(v, "utf8");
    exact.add(encodeURIComponent(v));
    exact.add(bytes.toString("base64").replace(/=+$/, ""));
    exact.add(bytes.toString("base64url"));
    exact.add(bytes.toString("hex"));
  }
  const long = (v: string) => v.length >= 6;
  return { text: [...text].filter(long), exact: [...exact].filter(long) };
}

function haystack(r: Seen): string {
  let decoded = r.url;
  try {
    decoded = decodeURIComponent(r.url);
  } catch {
    /* keep the raw address */
  }
  return [r.url, decoded, JSON.stringify(r.headers), r.body ? r.body.toString("latin1") : ""].join("\n");
}

const latin1 = (v: string) => Buffer.from(v, "utf8").toString("latin1");

export function carries(r: Seen, secret: string): boolean {
  const hay = haystack(r);
  const lower = hay.toLowerCase();
  const f = forms(secret);
  return f.text.some((v) => lower.includes(latin1(v).toLowerCase())) || f.exact.some((v) => hay.includes(v));
}

/** As `carries`, and also true when several of the phrase's words turn up as separate tokens. */
export function carriesPhrase(r: Seen, phrase: string): boolean {
  if (carries(r, phrase)) return true;
  const tokens = new Set(haystack(r).toLowerCase().split(/[^a-z]+/));
  const distinct = [...new Set(words(phrase))].filter((w) => w.length >= 5);
  return distinct.filter((w) => tokens.has(w)).length >= 6;
}

export class Recorder {
  readonly seen: Seen[] = [];
  readonly sockets: string[] = [];
  /** Requests the browser refused or couldn't complete: address -> the browser's reason. */
  readonly failed = new Map<string, string>();
  /** Addresses that got any response at all. */
  readonly answered = new Set<string>();

  constructor(context: BrowserContext) {
    context.on("requestfailed", (r) => this.failed.set(r.url(), r.failure()?.errorText ?? "failed"));
    context.on("response", (r) => this.answered.add(r.url()));
    context.on("request", (r) => {
      const url = r.url();
      this.seen.push({
        method: r.method(),
        url,
        path: /^https?:/.test(url) ? new URL(url).pathname : url.slice(0, 40),
        type: r.resourceType(),
        headers: r.headers(),
        body: r.postDataBuffer(),
      });
    });
    context.on("page", (page) => page.on("websocket", (ws) => this.sockets.push(ws.url())));
  }

  /** A position in the log, to look only at what happens after it. */
  mark(): number {
    return this.seen.length;
  }

  since(mark: number): Seen[] {
    return this.seen.slice(mark);
  }

  carrying(secret: string, from = 0): Seen[] {
    return this.seen.slice(from).filter((r) => carries(r, secret));
  }

  carryingPhrase(phrase: string, from = 0): Seen[] {
    return this.seen.slice(from).filter((r) => carriesPhrase(r, phrase));
  }

  /** Every host contacted other than `origin`. In-memory data: and blob: addresses don't count. */
  otherHosts(origin: string): string[] {
    const hosts = new Set<string>();
    for (const r of this.seen) {
      if (/^(data|blob):/.test(r.url)) continue;
      const o = new URL(r.url).origin;
      if (o !== origin) hosts.add(o);
    }
    for (const s of this.sockets) hosts.add(s);
    return [...hosts];
  }
}

/** For failure messages: which requests, without dumping bodies. */
export const describe = (list: Seen[]) => list.map((r) => `${r.method} ${r.path}`);
