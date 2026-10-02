// The public hunt file, for solvers' browsers.
import { NextResponse } from "next/server";
import { getHunt } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const stored = await getHunt(id);
  if (!stored) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(stored.hunt);
}
