// Claim a hunt's prize: the winner's browser sends the seed phrase it
// decrypted plus the winner's shielded address, and the signer sweeps the pot.
// This route sees the seed phrase in transit (v1 trust model, stated on the
// page). Never log the request body. Winners who don't want that can import
// the phrase into their own wallet instead.
import { NextResponse } from "next/server";
import { getHunt } from "@/lib/store";
import { claimPot, newAddress, SignerError } from "@/lib/signer";
import { ensureDemoPool, isDemoHunt } from "@/lib/demo";
import { clientKey, hit, LIMITS, tooMany } from "@/lib/ratelimit";
import { readCappedText } from "@/lib/body";

export const dynamic = "force-dynamic";

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const wait = hit(LIMITS.claimPerIp, clientKey(req));
  if (wait) return tooMany(wait, "claim attempts");
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) return bad("not found", 404);
  const stored = await getHunt(id);
  if (!stored) return bad("not found", 404);

  let text: string;
  try {
    text = await readCappedText(req, 4000);
  } catch {
    return bad("request too large", 413);
  }
  let body: { seed_phrase?: unknown; to?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return bad("invalid request");
  }
  const seed = typeof body.seed_phrase === "string" ? body.seed_phrase.trim().split(/\s+/).join(" ") : "";
  let to = typeof body.to === "string" ? body.to.trim() : "";
  if (seed.split(" ").length !== 24) return bad("expected the 24-word seed phrase from the final stage");
  const demo = await isDemoHunt(id);
  if (to === "demo-pool") {
    // Demo hunts only: no wallet needed; the prize goes back to the signer and funds the next demo.
    if (!demo) return bad("only practice hunts can be sent back to the practice pool");
    try {
      to = await newAddress();
    } catch (e) {
      return bad(e instanceof Error ? e.message : "signer error", 503);
    }
  }
  if (!/^(utest1|ztestsapling1)[0-9a-z]+$/.test(to))
    return bad("please use a shielded testnet address (starts with utest1 or ztestsapling1)");

  try {
    const { txid } = await claimPot(stored.hunt.pot.pot_id, seed, to);
    if (demo) void ensureDemoPool(); // start preparing the next demo hunt
    return NextResponse.json({ txid }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = e instanceof SignerError && e.status === 503 ? 503 : 400;
    return bad(e instanceof Error ? e.message : "claim failed", status);
  }
}
