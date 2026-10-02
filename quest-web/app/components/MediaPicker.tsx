"use client";

// Attach images, video or audio to a clue. Files stay in this browser until the
// hunt is locked; then each one is encrypted here and only ciphertext is uploaded.
import { useEffect, useMemo } from "react";
import { MAX_MEDIA_PER_CLUE } from "quest-crypto";

const IMAGE_MAX = 5 * 1024 * 1024;
const AV_MAX = 25 * 1024 * 1024;

export function checkFile(f: File): string | null {
  if (!/^(image|video|audio)\//.test(f.type)) return `${f.name}: only images, video or audio`;
  const max = f.type.startsWith("image/") ? IMAGE_MAX : AV_MAX;
  if (f.size > max) return `${f.name}: too large (max ${max / 1024 / 1024} MB)`;
  return null;
}

export default function MediaPicker({
  files,
  onChange,
  onError,
  locked,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  onError: (msg: string | null) => void;
  locked?: boolean; // e.g. "these stay locked until the previous stage is solved"
}) {
  const previews = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  function add(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const err = checkFile(f);
      if (err) return onError(err);
      if (next.length >= MAX_MEDIA_PER_CLUE) return onError(`Up to ${MAX_MEDIA_PER_CLUE} files per clue.`);
      next.push(f);
    }
    onError(null);
    onChange(next);
  }

  return (
    <div className="picker">
      {files.length > 0 && (
        <div className="picker-list">
          {files.map((f, i) => (
            <div key={i} className="picker-item">
              {previews[i] ? <img src={previews[i]!} alt="" /> : <span className="picker-kind">{f.type.split("/")[0]}</span>}
              <span className="tiny">{f.name.length > 22 ? f.name.slice(0, 20) + "…" : f.name}</span>
              <button type="button" className="link tiny" onClick={() => onChange(files.filter((_, j) => j !== i))}>
                remove
              </button>
            </div>
          ))}
        </div>
      )}
      {files.length < MAX_MEDIA_PER_CLUE && (
        <label className="picker-add">
          <input
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
          + Add image, video or audio
          <span className="muted tiny">
            {" "}
            (images up to 5 MB, video/audio up to 25 MB{locked ? "; encrypted until the previous stage is solved" : ""})
          </span>
        </label>
      )}
    </div>
  );
}
