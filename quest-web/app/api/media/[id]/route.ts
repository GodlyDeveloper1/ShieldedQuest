// Serve one encrypted media file. It's ciphertext: only browsers holding the
// key (from the hunt file or an unlocked stage) can turn it back into media.
import { readMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response("not found", { status: 404 });
  const bytes = await readMedia(id);
  if (!bytes) return new Response("not found", { status: 404 });
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
