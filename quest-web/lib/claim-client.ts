// Browser-side claim request, shared by the winner's claim and the creator's
// reclaim. A claim can take a while: the signer syncs, builds a zero-knowledge
// proof and broadcasts. We tell the person what's happening instead of
// spinning silently, and stop waiting after a few minutes.

export const SLOW_AFTER_MS = 10_000;
const GIVE_UP_AFTER_MS = 180_000;

export const SLOW_MESSAGE =
  "Still working: the signer is building the transaction's zero-knowledge proof. This usually takes under a minute.";

export class ClaimTimeoutError extends Error {
  constructor() {
    super(
      "This is taking longer than usual. The pot is locked to you once the claim starts, so if the prize box above says Claimed, your transaction is on its way. The signer keeps retrying it in the background.",
    );
    this.name = "ClaimTimeoutError";
  }
}

export async function postClaim(huntId: string, seedPhrase: string, to: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GIVE_UP_AFTER_MS);
  try {
    const res = await fetch(`/api/hunts/${huntId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed_phrase: seedPhrase, to }),
      signal: ctrl.signal,
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "claim failed");
    return body.txid as string;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      window.dispatchEvent(new Event("sq-pot-refresh"));
      throw new ClaimTimeoutError();
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
