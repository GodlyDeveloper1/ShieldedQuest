// Creates the pot for a new hunt.
//
// Normal path: the creator's browser made the pot's keys itself and sends only
// the viewing key and the seed's fingerprint. The seed phrase never reaches us.
//
// Fallback path (empty body): the signer makes the pot and the response carries
// the seed phrase to the creator's browser once. Used only by browsers that
// can't run the key module. Never log this response or the request.
import { NextResponse } from "next/server";
import { createPot, importPot, SignerError } from "@/lib/signer";
import { clientKey, hitAll, LIMITS, tooMany } from "@/lib/ratelimit";
import { readCappedText } from "@/lib/body";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const wait = hitAll([
    [LIMITS.potPerIp, clientKey(req)],
    [LIMITS.potGlobal, "all"],
  ]);
  if (wait) return tooMany(wait, "new hunts");

  let text: string;
  try {
    text = await readCappedText(req, 4000);
  } catch {
    return NextResponse.json({ error: "request too large" }, { status: 413, headers: noStore });
  }

  try {
    if (text.trim()) {
      let body: { viewing_key?: unknown; seed_fingerprint?: unknown };
      try {
        body = JSON.parse(text);
      } catch {
        return NextResponse.json({ error: "invalid request" }, { status: 400, headers: noStore });
      }
      const viewingKey = typeof body.viewing_key === "string" ? body.viewing_key.trim() : "";
      const fingerprint = typeof body.seed_fingerprint === "string" ? body.seed_fingerprint.trim().toLowerCase() : "";
      if (!/^uviewtest1[0-9a-z]{50,1000}$/.test(viewingKey)) {
        return NextResponse.json({ error: "expected a testnet viewing key" }, { status: 400, headers: noStore });
      }
      if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
        return NextResponse.json({ error: "expected the seed fingerprint" }, { status: 400, headers: noStore });
      }
      const pot = await importPot(viewingKey, fingerprint);
      return NextResponse.json({ ...pot, made_by: "browser" }, { headers: noStore });
    }
    const pot = await createPot();
    return NextResponse.json({ ...pot, made_by: "server" }, { headers: noStore });
  } catch (e) {
    const status = e instanceof SignerError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status, headers: noStore });
  }
}
