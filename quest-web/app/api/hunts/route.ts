// Publishes a hunt. The body is the public hunt file built in the creator's
// browser: ciphertext only. We check it's well formed and points at a fresh
// pot from our signer, then store it.
import { NextResponse } from "next/server";
import { validateHunt, FORMAT_VERSION, PRIVATE_TITLE, type Hunt } from "quest-crypto";
import { potStatus, SignerError } from "@/lib/signer";
import { potInUse, saveHunt } from "@/lib/store";
import { mediaExists } from "@/lib/media";
import { clientKey, hit, LIMITS, tooMany } from "@/lib/ratelimit";
import { readCappedText } from "@/lib/body";

export const dynamic = "force-dynamic";

const MAX_BODY = 100_000;
const MAX_TITLE = 120;
const MAX_CLUE = 1000;
// 1024-byte padded payload + 16-byte GCM tag, base64 encoded.
const CIPHERTEXT_B64_LEN = 4 * Math.ceil((1024 + 16) / 3);
const NONCE_B64_LEN = 16;
// A private hunt's sealed intro (title, first clue, first-clue media keys): a few padded blocks at most.
const MAX_INTRO_B64_LEN = 4 * Math.ceil((4 * 1024 + 16) / 3);

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const wait = hit(LIMITS.huntPerIp, clientKey(req));
  if (wait) return tooMany(wait, "published hunts");
  let text: string;
  try {
    text = await readCappedText(req, MAX_BODY);
  } catch {
    return bad("hunt file too large", 413);
  }

  let raw: Hunt;
  try {
    raw = JSON.parse(text);
    validateHunt(raw);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "invalid hunt file");
  }

  const isPrivate = raw.private !== undefined;
  if (isPrivate) {
    // Private (invite-only): the title and first clue are inside the sealed intro, which we can't read.
    if (raw.title !== PRIVATE_TITLE || raw.first_clue !== "") return bad("a private hunt can't publish its title or first clue");
    if (raw.private!.ciphertext.length > MAX_INTRO_B64_LEN) return bad("private intro too large");
  } else {
    if (typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > MAX_TITLE) return bad("title");
    if (typeof raw.first_clue !== "string" || !raw.first_clue.trim() || raw.first_clue.length > MAX_CLUE)
      return bad("first clue");
  }
  for (const s of raw.stages) {
    if (typeof s.nonce !== "string" || s.nonce.length !== NONCE_B64_LEN) return bad("stage nonce");
    if (typeof s.ciphertext !== "string" || s.ciphertext.length !== CIPHERTEXT_B64_LEN) return bad("stage size");
  }

  // Rebuild from known fields only, so nothing extra rides along into the public file.
  const hunt: Hunt = {
    version: FORMAT_VERSION,
    hunt_id: raw.hunt_id,
    title: raw.title.trim(),
    kdf: {
      name: "argon2id",
      memory_kib: raw.kdf.memory_kib,
      iterations: raw.kdf.iterations,
      parallelism: raw.kdf.parallelism,
    },
    first_clue: raw.first_clue.trim(),
    stage_count: raw.stage_count,
    stages: raw.stages.map((s) => ({ index: s.index, nonce: s.nonce, ciphertext: s.ciphertext })),
    pot: { pot_id: raw.pot.pot_id, address: raw.pot.address, viewing_key: raw.pot.viewing_key },
  };
  if (isPrivate) hunt.private = { nonce: raw.private!.nonce, ciphertext: raw.private!.ciphertext };
  // Media: first-clue references (public) and the full list of ids the hunt uses.
  if (raw.first_media?.length) hunt.first_media = raw.first_media.map((m) => ({ id: m.id, key: m.key, mime: m.mime }));
  if (raw.media_ids?.length) {
    const ids = [...new Set(raw.media_ids)];
    for (const mid of ids) if (!(await mediaExists(mid))) return bad("a media file for this hunt wasn't uploaded");
    if (hunt.first_media?.some((m) => !ids.includes(m.id))) return bad("media_ids is missing a first-clue file");
    hunt.media_ids = ids;
  } else if (hunt.first_media?.length) return bad("media_ids is missing");

  // The pot must be one of ours, match what the file claims, and not be reused.
  try {
    const pot = await potStatus(hunt.pot.pot_id);
    if (pot.address !== hunt.pot.address || pot.viewing_key !== hunt.pot.viewing_key)
      return bad("pot details don't match the signer's record");
    if (pot.claimed) return bad("that pot has already been claimed");
  } catch (e) {
    if (e instanceof SignerError && e.status === 404) return bad("unknown pot");
    return bad(e instanceof Error ? e.message : "signer error", 502);
  }
  if (await potInUse(hunt.pot.pot_id)) return bad("that pot already belongs to another hunt");

  try {
    await saveHunt(hunt);
  } catch {
    return bad("a hunt with this id already exists", 409);
  }
  return NextResponse.json({ hunt_id: hunt.hunt_id }, { status: 201 });
}
