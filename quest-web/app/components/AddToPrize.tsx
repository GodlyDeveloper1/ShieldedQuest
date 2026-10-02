"use client";

// Fund or top up a pot: QR (a ZIP-321 payment URI) plus the address to copy.
// Anyone can add to a prize; the warnings keep the funding private.
import { useState } from "react";
import QrCode from "./QrCode";

export default function AddToPrize({ address, intro }: { address: string; intro?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the address is selectable below
    }
  }
  return (
    <div className="card add-prize">
      <QrCode value={`zcash:${address}`} size={156} label="Pot address as a Zcash payment QR code" />
      <div>
        {intro}
        <div className="mono addr">{address}</div>
        <button type="button" onClick={copy} style={{ marginTop: 10 }}>
          {copied ? "Copied" : "Copy address"}
        </button>
        <ul className="plain small muted" style={{ margin: "12px 0 0" }}>
          <li>Send from a shielded balance; a transparent (t-) address would publicly link you to this hunt.</li>
          <li>Leave the memo empty; the pot&apos;s viewing key is public and can read memos.</li>
          <li>Shows as confirming, then verified after about 3 blocks.</li>
        </ul>
      </div>
    </div>
  );
}
