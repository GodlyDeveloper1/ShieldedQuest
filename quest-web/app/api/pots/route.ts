// Creates a pot for a new hunt. The response carries the pot's seed phrase to
// the creator's browser, where it is sealed into the hunt's last stage.
// Never log this response or the request.
import { NextResponse } from "next/server";
import { createPot, SignerError } from "@/lib/signer";
import { clientKey, hitAll, LIMITS, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const wait = hitAll([
    [LIMITS.potPerIp, clientKey(req)],
    [LIMITS.potGlobal, "all"],
  ]);
  if (wait) return tooMany(wait, "new hunts");
  try {
    const pot = await createPot();
    return NextResponse.json(pot, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = e instanceof SignerError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status });
  }
}
