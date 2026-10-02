// Upload one encrypted media file. The body is ciphertext made in the creator's
// browser; the id comes from the X-Media-Id header (it's bound into the
// encryption, so a mismatched id simply won't decrypt).
import { NextResponse } from "next/server";
import { saveMedia, MAX_MEDIA_BYTES } from "@/lib/media";
import { clientKey, hit, LIMITS, spend, tooMany } from "@/lib/ratelimit";
import { BodyTooLarge, readCapped } from "@/lib/body";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const wait = hit(LIMITS.mediaPerIp, clientKey(req));
  if (wait) return tooMany(wait, "uploads");
  const id = req.headers.get("x-media-id") ?? "";
  if (!/^[0-9a-f]{32}$/.test(id)) return NextResponse.json({ error: "bad media id" }, { status: 400 });
  let bytes: Uint8Array;
  try {
    bytes = await readCapped(req, MAX_MEDIA_BYTES);
  } catch (e) {
    if (e instanceof BodyTooLarge) return NextResponse.json({ error: "file too large (25 MB max)" }, { status: 413 });
    return NextResponse.json({ error: "upload failed" }, { status: 400 });
  }
  // A byte budget per visitor per hour, so one visitor can't fill the shared media storage.
  const over = spend(LIMITS.mediaBytesPerIp, clientKey(req), bytes.length);
  if (over) return tooMany(over, "uploads");
  try {
    await saveMedia(id, bytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload failed";
    return NextResponse.json({ error: msg.includes("EEXIST") ? "that media id already exists" : msg }, { status: 400 });
  }
  return NextResponse.json({ id }, { status: 201 });
}
