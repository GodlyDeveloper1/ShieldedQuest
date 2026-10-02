"use client";

// For the hunt's creator: take the prize back using the backup file saved at
// creation. The file is read here in the browser and the seed phrase is never
// shown. It is sent once, to the claim route, like a winner's claim.

import { cx } from "@/lib/cx";
import { useState } from "react";
import { postClaim, SLOW_AFTER_MS, SLOW_MESSAGE } from "@/lib/claim-client";
import TxLink from "@/app/components/TxLink";

function parseBackup(text: string): { potId: string; seed: string } | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const potLine = lines.find((l) => l.startsWith("Pot id:"));
  const i = lines.indexOf("Seed phrase:");
  if (!potLine || i < 0) return null;
  const seed = (lines[i + 1] ?? "").split(/\s+/).join(" ");
  if (seed.split(" ").length !== 24) return null;
  return { potId: potLine.slice("Pot id:".length).trim(), seed };
}

export default function CreatorReclaim({ huntId, potId }: { huntId: string; potId: string }) {
  const [seed, setSeed] = useState<string | null>(null);
  const [fileMsg, setFileMsg] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txid, setTxid] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setSeed(null);
    setError(null);
    const f = e.target.files?.[0];
    e.target.value = ""; // don't keep the file around in the input
    if (!f) return;
    if (f.size > 20_000) return setFileMsg("That doesn't look like a Shielded Quest backup file.");
    const parsed = parseBackup(await f.text());
    if (!parsed) return setFileMsg("That doesn't look like a Shielded Quest backup file.");
    if (parsed.potId !== potId) return setFileMsg("That backup is for a different hunt's pot.");
    setSeed(parsed.seed);
    setFileMsg("Backup loaded. It matches this hunt's pot.");
  }

  async function reclaim(e: React.FormEvent) {
    e.preventDefault();
    if (!seed || busy) return;
    setBusy(true);
    setError(null);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    try {
      setTxid(await postClaim(huntId, seed, to.trim()));
      setSeed(null);
      window.dispatchEvent(new Event("sq-pot-refresh"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(slowTimer);
      setBusy(false);
      setSlow(false);
    }
  }

  return (
    <details className="card">
      <summary>Made this hunt? Take the prize back</summary>
      {txid ? (
        <p className="small">
          <strong>Prize sent back.</strong> It arrives after a few confirmations.
          <TxLink txid={txid} />
        </p>
      ) : (
        <form onSubmit={reclaim}>
          <p className="muted small" style={{ marginTop: 0 }}>
            Choose the backup file you downloaded when you created the hunt. It&apos;s read here in your browser;
            the words aren&apos;t shown. This ends the hunt: once the pot is empty, nobody can win it.
          </p>
          <label htmlFor="backup">Backup file (shielded-quest-pot-….txt)</label>
          <input id="backup" type="file" accept=".txt,text/plain" onChange={onFile} />
          {fileMsg && (
            <p className={cx("small", !seed && "error")} style={seed ? { color: "var(--good)" } : undefined}>
              {fileMsg}
            </p>
          )}
          <label htmlFor="reclaim-to">Your shielded testnet address</label>
          <input
            id="reclaim-to"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="utest1…"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setError(null);
            }}
          />
          {error && <p className="error small">{error}</p>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" disabled={!seed || !to.trim() || busy} aria-busy={busy}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Sending…
                </>
              ) : (
                "Take the prize back"
              )}
            </button>
          </div>
          {slow && <p className="muted small">{SLOW_MESSAGE}</p>}
        </form>
      )}
    </details>
  );
}
