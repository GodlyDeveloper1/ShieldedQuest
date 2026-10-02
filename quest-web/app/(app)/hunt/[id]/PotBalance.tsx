"use client";

import { useEffect, useState } from "react";

interface PotView {
  balance_total_zatoshis: number;
  balance_spendable_zatoshis: number;
  claimed: boolean;
}

const zec = (zat: number) => (zat / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 });

export default function PotBalance({ huntId }: { huntId: string }) {
  const [pot, setPot] = useState<PotView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const res = await fetch(`/api/hunts/${huntId}/pot`, { cache: "no-store" });
        const body = await res.json();
        if (!live) return;
        if (!res.ok) throw new Error(body.error ?? "couldn't load the pot");
        setPot(body);
        setError(null);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const t = setInterval(load, 30_000);
    // HuntSolver fires this after a successful claim.
    window.addEventListener("sq-pot-refresh", load);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener("sq-pot-refresh", load);
    };
  }, [huntId]);

  if (error) return <p className="error small">{error}</p>;
  if (!pot) return <p className="muted">Checking the pot…</p>;
  if (pot.claimed) return <p><strong>Claimed.</strong> The prize has been taken. You can still play this hunt for fun.</p>;

  const pending = pot.balance_total_zatoshis - pot.balance_spendable_zatoshis;
  return (
    <p>
      <strong style={{ fontSize: 24 }}>{zec(pot.balance_spendable_zatoshis)} TAZ</strong>{" "}
      <span className="muted small">verified prize</span>
      {pending > 0 && <span className="muted small"> · {zec(pending)} TAZ confirming</span>}
    </p>
  );
}
