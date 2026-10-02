// Link a transaction to a public testnet explorer. Opening it tells that explorer
// which transaction you're looking at, so it's a plain link you choose to click.
const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_TX_URL ?? "https://testnet.zecblock.com/tx/";

export default function TxLink({ txid }: { txid: string }) {
  return (
    <span className="txlink">
      <span className="mono">txid {txid}</span>{" "}
      <a href={`${EXPLORER}${txid}`} target="_blank" rel="noreferrer noopener" className="small">
        View on a testnet explorer ↗
      </a>
      <span className="muted tiny"> (it can see the transaction exists, not who sent what to whom)</span>
    </span>
  );
}
