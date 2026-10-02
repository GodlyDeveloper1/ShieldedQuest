"use client";

// Shows decrypted clue media (image, video, audio). Blobs come from a shared
// cache that fetches *every* media file of the hunt when the page opens, so the
// server can't tell from downloads how far a solver has got.
import { useEffect, useState } from "react";
import { decryptMedia, type MediaRef } from "quest-crypto";
import { recordLocal } from "@/lib/xray";

const cache = new Map<string, Promise<Uint8Array>>();

export function prefetchMedia(ids: string[]) {
  for (const id of ids) {
    if (!/^[0-9a-f]{32}$/.test(id) || cache.has(id)) continue;
    cache.set(
      id,
      fetch(`/api/media/${id}`).then(async (r) => {
        if (!r.ok) throw new Error("media missing");
        return new Uint8Array(await r.arrayBuffer());
      }),
    );
  }
}

function One({ m }: { m: MediaRef }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    prefetchMedia([m.id]);
    cache
      .get(m.id)!
      .then((blob) => decryptMedia(blob, m))
      .then((bytes) => {
        if (!live) return;
        recordLocal(`Clue ${m.mime.split("/")[0]} decrypted in your browser`, "Its key came from the clue you unlocked; the server only ever had ciphertext.");
        made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: m.mime }));
        setUrl(made);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [m]);

  if (failed) return <p className="error small">This media file couldn&apos;t be decrypted.</p>;
  if (!url) return <div className="media-loading small muted">Decrypting media…</div>;
  if (m.mime.startsWith("image/")) return <img className="media" src={url} alt="Clue image" />;
  if (m.mime.startsWith("video/")) return <video className="media" src={url} controls playsInline preload="metadata" />;
  return <audio className="media-audio" src={url} controls preload="metadata" />;
}

export default function MediaView({ media }: { media?: MediaRef[] }) {
  if (!media?.length) return null;
  return (
    <div className="media-list">
      {media.map((m) => (
        <One key={m.id} m={m} />
      ))}
    </div>
  );
}
