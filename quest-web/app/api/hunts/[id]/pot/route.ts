// A hunt's pot: verified balance and whether it has been claimed.
import { NextResponse } from "next/server";
import { getHunt } from "@/lib/store";
import { potStatusCached } from "@/lib/signer";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const stored = await getHunt(id);
  if (!stored) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const p = await potStatusCached(stored.hunt.pot.pot_id);
    return NextResponse.json(
      {
        balance_total_zatoshis: p.balance_total_zatoshis,
        balance_spendable_zatoshis: p.balance_spendable_zatoshis,
        scanned_height: p.scanned_height,
        birthday_height: p.birthday_height ?? null,
        claimed: p.claimed,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "signer error" }, { status: 502 });
  }
}
