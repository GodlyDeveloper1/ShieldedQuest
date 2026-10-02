"use client";

// The Privacy X-ray panel: a button in the corner that opens a live log of every
// request this page makes and every check it does locally. See lib/xray.ts.
import { cx } from "@/lib/cx";
import { useEffect, useState, useSyncExternalStore } from "react";
import { clearLog, getServerSnapshot, getSnapshot, subscribe, type XEvent } from "@/lib/xray";
import { IconEye } from "./Icons";

function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
}

function Row({ e, now }: { e: XEvent; now: number }) {
  const [open, setOpen] = useState(false);
  const tag = e.offsite ? "other site" : e.kind === "local" ? "in your browser" : "sent to this site";
  return (
    <li className={cx("xr-row", e.kind, e.offsite && "offsite", e.secret && "secret")}>
      <button type="button" className="xr-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="xr-tag">{tag}</span>
        <span className="xr-title">
          {e.title}
          {e.count && e.count > 1 ? <span className="muted"> ×{e.count}</span> : null}
        </span>
        <span className="xr-time muted">{ago(e.t, now)}</span>
      </button>
      {open && (
        <div className="xr-body">
          {e.method && e.path && (
            <p className="mono xr-req">
              {e.method} {e.host ? `${e.host}` : ""}
              {e.path}
              {e.status ? ` → ${e.status}` : ""}
              {e.bytesOut ? ` · ${e.bytesOut} bytes sent` : e.method === "GET" ? " · no body" : ""}
            </p>
          )}
          {e.detail && <p className="small">{e.detail}</p>}
          {e.fields && (
            <dl className="xr-fields">
              {e.fields.map((f) => (
                <div key={f.k}>
                  <dt>{f.k}</dt>
                  <dd>
                    <span className="mono">{f.v}</span>
                    {f.note && <span className="muted"> · {f.note}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </li>
  );
}

export default function XRay() {
  const { events, stats } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    setNow(Date.now());
    return () => clearInterval(t);
  }, [open, events]);

  // One corner panel at a time; the Quest Guide can also open this one.
  useEffect(() => {
    const onOther = (e: Event) => (e as CustomEvent).detail !== "xray" && setOpen(false);
    const onOpen = () => setOpen(true);
    window.addEventListener("sq-panel", onOther);
    window.addEventListener("sq-open-xray", onOpen);
    return () => {
      window.removeEventListener("sq-panel", onOther);
      window.removeEventListener("sq-open-xray", onOpen);
    };
  }, []);
  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent("sq-panel", { detail: "xray" }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={cx("xr-fab", open && "on")}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="xray"
        title="See everything this page sends"
      >
        <IconEye />
        <span>Privacy X-ray</span>
        <b className="xr-count">{stats.sent}</b>
      </button>

      {open && (
        <aside id="xray" className="xr-panel" aria-label="Privacy X-ray">
          <div className="xr-top">
            <div>
              <h3>Privacy X-ray</h3>
              <p className="muted small">Live: everything this page sends, and what it does without sending.</p>
            </div>
            <button type="button" className="link" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="xr-stats">
            <div className={stats.guessesSent ? "bad" : "good"}>
              <b>{stats.guessesSent}</b>
              <span>guesses sent</span>
            </div>
            <div>
              <b>{stats.guessesLocal}</b>
              <span>checked here</span>
            </div>
            <div>
              <b>{stats.sent}</b>
              <span>requests to this site</span>
            </div>
            <div className={stats.offsite ? "bad" : "good"}>
              <b>{stats.offsite}</b>
              <span>other sites</span>
            </div>
          </div>

          <ul className="xr-list">
            {events.length === 0 && <li className="muted small xr-empty">Nothing yet. Try a guess or open a hunt.</li>}
            {events.map((e) => (
              <Row key={e.id} e={e} now={now} />
            ))}
          </ul>

          <div className="xr-foot muted tiny">
            <span>
              Plus {stats.assets} page files (scripts, styles, fonts) from this site. This panel runs in your browser and
              sends nothing; its log is gone when you reload.
            </span>
            <button type="button" className="link tiny" onClick={clearLog}>
              Clear
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
