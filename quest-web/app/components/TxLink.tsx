"use client";

// A payout's transaction id, with an optional link to a public testnet explorer.
// Opening the link tells that explorer your internet address and which
// transaction you care about, moments after the payout: that could point at the
// winner. So the id is copyable, and the link says what it costs before you click.
import { useState } from "react";

const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_TX_URL ?? "https://testnet.zecblock.com/tx/";

export default function TxLink({ txid }: { txid: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(txid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the id is selectable
    }
  }
  return (
    <span className="txlink">
      <span className="mono">txid {txid}</span>
      <span className="txlink-actions">
        <button type="button" className="link small" onClick={copy}>
          {copied ? "Copied" : "Copy the id"}
        </button>
        <a href={`${EXPLORER}${txid}`} target="_blank" rel="noreferrer noopener" className="small">
          View on a testnet explorer ↗
        </a>
      </span>
      <span className="muted tiny txlink-note">
        The explorer can show the transaction exists, not who sent what to whom. But opening it tells that site your
        internet address and that you care about this transaction. To keep that to yourself, copy the id and look it up
        later, or through Tor or a VPN.
      </span>
    </span>
  );
}
