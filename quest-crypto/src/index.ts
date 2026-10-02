// Shielded Quest — answer-locked hunt stages.
//
// A hunt has n stages. Stage i is unlocked by answer_i:
//
//   k_0 = 32 zero bytes
//   k_i = Argon2id(password = normalize(answer_i),
//                  salt     = hunt_id || u32be(i) || k_(i-1))      (64 MiB, 3 passes)
//   blob_i = AES-256-GCM(k_i, nonce_i, pad(payload_i), aad = "shielded-quest/v1" || hunt_id || u32be(i))
//
// payload_i is the next clue for i < n and the pot's seed phrase for i = n.
// Because k_i depends on k_(i-1), stage i can't be attacked without first
// solving every earlier stage. Everything runs in the browser: answers and
// keys never leave it. The published hunt file holds only ciphertext.
//
// Private (invite-only) hunts add a random 32-byte invite key that lives only
// in the share link's #fragment, which browsers never send to a server:
//
//   k_0   = invite key                     (instead of zero bytes)
//   intro = AES-256-GCM(invite key, nonce, pad({title, first_clue, first_media}),
//                       aad = "shielded-quest/v1/intro" || hunt_id)
//
// The published file then has no readable title or first clue, and stage 1
// can't even be guessed at without the invite.

import { argon2id } from "hash-wasm";

export const FORMAT_VERSION = 1;
const AAD_PREFIX = "shielded-quest/v1";
const PAD_BLOCK = 1024; // every payload is padded to a multiple of this, so blob sizes don't reveal which stage holds the seed
const MAX_PAYLOAD = PAD_BLOCK - 4; // keeps every stage in one block, so all blobs are the same size

export interface KdfParams {
  name: "argon2id";
  memory_kib: number;
  iterations: number;
  parallelism: number;
}

export const DEFAULT_KDF: KdfParams = {
  name: "argon2id",
  memory_kib: 65536, // 64 MiB
  iterations: 3,
  parallelism: 1,
};

export interface PotRef {
  pot_id: string;
  address: string;
  viewing_key: string; // lets anyone verify the pot's balance; can't spend
}

export interface StageBlob {
  index: number; // 1-based
  nonce: string; // base64
  ciphertext: string; // base64, includes the GCM tag
}

/**
 * An encrypted media file (image, video or audio) attached to a clue. The file
 * is stored on the server as ciphertext; `key` decrypts it. Keys for later
 * clues live inside the encrypted stage that reveals the clue, so nobody (the
 * server included) can see that media before solving the stage before it.
 */
export interface MediaRef {
  id: string; // 32 hex chars, also bound into the encryption
  key: string; // base64, 32 bytes
  mime: string; // image/*, video/* or audio/*
}

export const MAX_MEDIA_PER_CLUE = 3;

/** The public hunt file. Safe to publish: contains no answers, keys or seed. */
export interface Hunt {
  version: typeof FORMAT_VERSION;
  hunt_id: string; // 32 hex chars
  title: string;
  kdf: KdfParams;
  first_clue: string;
  stage_count: number;
  stages: StageBlob[];
  pot: PotRef;
  /** Media for the first clue (public, like the clue itself). */
  first_media?: MediaRef[];
  /** Every media file the hunt uses, so the server knows which uploads to keep. Ids only. */
  media_ids?: string[];
  /**
   * Present on private (invite-only) hunts: the real title, first clue and
   * first-clue media, encrypted with the invite key. `title` is then a
   * placeholder and `first_clue` is empty.
   */
  private?: SealedIntro;
}

/** The encrypted opening of a private hunt. */
export interface SealedIntro {
  nonce: string; // base64
  ciphertext: string; // base64, includes the GCM tag
}

/** What the invite key reveals. */
export interface HuntIntro {
  title: string;
  first_clue: string;
  first_media?: MediaRef[];
}

export const PRIVATE_TITLE = "Private hunt";

export type StagePayload =
  | { type: "clue"; clue: string; media?: MediaRef[] }
  | { type: "seed"; seed_phrase: string };

export interface CreateHuntInput {
  title: string;
  firstClue: string;
  /** One entry per stage. `nextClue` is required for every stage except the last. */
  stages: { answer: string; nextClue?: string; nextMedia?: MediaRef[] }[];
  /** Media shown with the first clue (public). */
  firstMedia?: MediaRef[];
  seedPhrase: string;
  pot: PotRef;
  kdf?: KdfParams;
  /** Pass a key from newInviteKey() to make the hunt private (invite-only). */
  inviteKey?: Uint8Array;
}

/** The invite link's key is missing or wrong. */
export class WrongInviteError extends Error {
  constructor() {
    super("That invite link doesn't open this hunt.");
    this.name = "WrongInviteError";
  }
}

export class WrongAnswerError extends Error {
  constructor() {
    super("That answer doesn't unlock this stage.");
    this.name = "WrongAnswerError";
  }
}

// ---------------------------------------------------------------------------
// Answer normalisation
// ---------------------------------------------------------------------------

/**
 * Makes answers forgiving about case, accents, punctuation and spacing:
 * "  The Eiffel-Tower! " and "the eiffel tower" give the same key.
 * NFKD + drop combining marks, lowercase, runs of anything that isn't a
 * letter or digit become one space, trim.
 */
export function normalizeAnswer(answer: string): string {
  return answer
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Strength estimate
// ---------------------------------------------------------------------------

const MIN_FINAL_BITS = 40;

/**
 * Rough upper bound on the guessing entropy of a normalised answer, in bits.
 * It can only overestimate: it can't know that "eiffel tower" is guessable
 * from the clue. Treat it as a floor check, not a guarantee.
 *   digits-only token : len * log2(10)
 *   letters-only token: min(len * log2(26), 16)   (a word from a ~65k vocabulary)
 *   mixed token       : len * log2(36)
 */
export function estimateAnswerBits(answer: string): number {
  const tokens = normalizeAnswer(answer).split(" ").filter(Boolean);
  let bits = 0;
  for (const t of tokens) {
    if (/^\p{N}+$/u.test(t)) bits += t.length * Math.log2(10);
    else if (/^\p{L}+$/u.test(t)) bits += Math.min(t.length * Math.log2(26), 16);
    else bits += t.length * Math.log2(36);
  }
  return Math.round(bits * 10) / 10;
}

export interface StrengthReport {
  perStage: number[];
  /** Stages are attacked one after another, so costs add: log2(sum 2^b_i). */
  totalBits: number;
  ok: boolean;
  message: string;
}

/**
 * Stage answers are verified one at a time (a wrong guess fails the GCM tag),
 * so an attacker brute-forces them in sequence and the hunt is roughly as
 * strong as its strongest stage. We require the final stage, which guards
 * the seed, to reach MIN_FINAL_BITS.
 */
export function checkHuntStrength(answers: string[]): StrengthReport {
  const perStage = answers.map(estimateAnswerBits);
  const totalBits = Math.round(Math.log2(perStage.reduce((s, b) => s + 2 ** b, 0)) * 10) / 10;
  const finalBits = perStage[perStage.length - 1] ?? 0;
  const ok = finalBits >= MIN_FINAL_BITS;
  const message = ok
    ? `Final answer ≈ ${finalBits} bits. Good.`
    : `Final answer ≈ ${finalBits} bits. Needs at least ${MIN_FINAL_BITS}: add a code word, a number, or more words that the clue doesn't give away.`;
  return { perStage, totalBits, ok, message };
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const enc = new TextEncoder();
const dec = new TextDecoder();

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto isn't available (needs a secure context: https or localhost).");
  return c.subtle;
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function fromHex(h: string): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(h)) throw new Error("bad hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toB64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 4-byte length prefix, then zero padding up to a multiple of PAD_BLOCK. */
function pad(data: Uint8Array): Uint8Array {
  const total = Math.ceil((data.length + 4) / PAD_BLOCK) * PAD_BLOCK;
  const out = new Uint8Array(total);
  out.set(u32be(data.length), 0);
  out.set(data, 4);
  return out;
}

function unpad(p: Uint8Array): Uint8Array {
  const len = new DataView(p.buffer, p.byteOffset, 4).getUint32(0, false);
  if (len > p.length - 4) throw new Error("corrupt stage payload");
  return p.slice(4, 4 + len);
}

function aad(huntId: Uint8Array, index: number): Uint8Array {
  return concat(enc.encode(AAD_PREFIX), huntId, u32be(index));
}

export const ZERO_KEY = new Uint8Array(32);

// ---------------------------------------------------------------------------
// Private hunts: invite key and sealed intro
// ---------------------------------------------------------------------------

const INTRO_AAD = AAD_PREFIX + "/intro";

/** A fresh random invite key for a private hunt. */
export function newInviteKey(): Uint8Array {
  return randomBytes(32);
}

/** Invite key as text for a link's #fragment (base64url, 43 characters). */
export function inviteToString(key: Uint8Array): string {
  return toB64(key).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Reads an invite key from a link fragment. Returns null if it isn't one. */
export function inviteFromString(text: string): Uint8Array | null {
  const m = text.trim().match(/([A-Za-z0-9_-]{43})=?$/);
  if (!m) return null;
  try {
    const key = fromB64(m[1].replace(/-/g, "+").replace(/_/g, "/") + "=");
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

async function sealIntro(key: Uint8Array, huntId: Uint8Array, intro: HuntIntro): Promise<SealedIntro> {
  const nonce = randomBytes(12);
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv: nonce as BufferSource, additionalData: concat(enc.encode(INTRO_AAD), huntId) as BufferSource },
    await importKey(key, "encrypt"),
    pad(enc.encode(JSON.stringify(intro))) as BufferSource,
  );
  return { nonce: toB64(nonce), ciphertext: toB64(new Uint8Array(ct)) };
}

/**
 * The title, first clue and first-clue media of a hunt. For a private hunt
 * this decrypts them with the invite key (WrongInviteError if it's missing or
 * wrong); for a public hunt it just reads them from the file.
 */
export async function openIntro(hunt: Hunt, inviteKey?: Uint8Array | null): Promise<HuntIntro> {
  if (!hunt.private) return { title: hunt.title, first_clue: hunt.first_clue, first_media: hunt.first_media };
  if (!inviteKey || inviteKey.length !== 32) throw new WrongInviteError();
  let pt: ArrayBuffer;
  try {
    pt = await subtle().decrypt(
      {
        name: "AES-GCM",
        iv: fromB64(hunt.private.nonce) as BufferSource,
        additionalData: concat(enc.encode(INTRO_AAD), fromHex(hunt.hunt_id)) as BufferSource,
      },
      await importKey(inviteKey, "decrypt"),
      fromB64(hunt.private.ciphertext) as BufferSource,
    );
  } catch {
    throw new WrongInviteError();
  }
  const intro = JSON.parse(dec.decode(unpad(new Uint8Array(pt)))) as HuntIntro;
  if (typeof intro.title !== "string" || typeof intro.first_clue !== "string") throw new Error("hunt file is malformed");
  if (intro.first_media !== undefined) checkMediaList(intro.first_media, "first_media");
  return intro;
}

/** k_i = Argon2id(normalize(answer), hunt_id || u32be(i) || k_(i-1)). Slow on purpose (~0.5–2 s). */
export async function deriveStageKey(
  answer: string,
  huntId: Uint8Array,
  index: number,
  prevKey: Uint8Array,
  kdf: KdfParams = DEFAULT_KDF,
): Promise<Uint8Array> {
  if (kdf.name !== "argon2id") throw new Error(`unsupported KDF ${kdf.name}`);
  return (await argon2id({
    password: enc.encode(normalizeAnswer(answer)),
    salt: concat(huntId, u32be(index), prevKey),
    iterations: kdf.iterations,
    memorySize: kdf.memory_kib,
    parallelism: kdf.parallelism,
    hashLength: 32,
    outputType: "binary",
  })) as Uint8Array;
}

async function importKey(raw: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  return subtle().importKey("raw", raw as BufferSource, "AES-GCM", false, [usage]);
}

async function seal(key: Uint8Array, huntId: Uint8Array, index: number, payload: StagePayload): Promise<StageBlob> {
  const body = enc.encode(JSON.stringify(payload));
  if (body.length > MAX_PAYLOAD) throw new Error(`stage ${index} text is too long (max ${MAX_PAYLOAD} bytes)`);
  const nonce = randomBytes(12);
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv: nonce as BufferSource, additionalData: aad(huntId, index) as BufferSource },
    await importKey(key, "encrypt"),
    pad(body) as BufferSource,
  );
  return { index, nonce: toB64(nonce), ciphertext: toB64(new Uint8Array(ct)) };
}

async function open(key: Uint8Array, huntId: Uint8Array, blob: StageBlob): Promise<StagePayload> {
  let pt: ArrayBuffer;
  try {
    pt = await subtle().decrypt(
      { name: "AES-GCM", iv: fromB64(blob.nonce) as BufferSource, additionalData: aad(huntId, blob.index) as BufferSource },
      await importKey(key, "decrypt"),
      fromB64(blob.ciphertext) as BufferSource,
    );
  } catch {
    throw new WrongAnswerError();
  }
  return JSON.parse(dec.decode(unpad(new Uint8Array(pt)))) as StagePayload;
}

// ---------------------------------------------------------------------------
// Create and solve
// ---------------------------------------------------------------------------

/**
 * Builds a hunt in the creator's browser. The seed phrase is sealed into the
 * last stage and the returned hunt contains no plaintext secrets. Every stage
 * is decrypted again before returning, so a hunt that can't be solved is
 * never published.
 */
export async function createHunt(input: CreateHuntInput, onProgress?: (stage: number, of: number) => void): Promise<Hunt> {
  const kdf = input.kdf ?? DEFAULT_KDF;
  const n = input.stages.length;
  if (n < 1) throw new Error("a hunt needs at least one stage");
  if (!input.title.trim()) throw new Error("title is required");
  if (!input.firstClue.trim()) throw new Error("first clue is required");
  if (input.seedPhrase.trim().split(/\s+/).length !== 24) throw new Error("expected a 24-word seed phrase");
  input.stages.forEach((s, i) => {
    if (!normalizeAnswer(s.answer)) throw new Error(`stage ${i + 1} needs an answer`);
    if (i < n - 1 && !s.nextClue?.trim()) throw new Error(`stage ${i + 1} needs the clue for stage ${i + 2}`);
  });

  const invite = input.inviteKey;
  if (invite && invite.length !== 32) throw new Error("invite key must be 32 bytes");

  const huntId = randomBytes(16);
  const stages: StageBlob[] = [];
  let prev: Uint8Array = invite ?? ZERO_KEY;
  for (let i = 1; i <= n; i++) {
    onProgress?.(i, n);
    const k = await deriveStageKey(input.stages[i - 1].answer, huntId, i, prev, kdf);
    const media = input.stages[i - 1].nextMedia;
    const payload: StagePayload =
      i < n
        ? { type: "clue", clue: input.stages[i - 1].nextClue!, ...(media?.length ? { media } : {}) }
        : { type: "seed", seed_phrase: input.seedPhrase.trim() };
    stages.push(await seal(k, huntId, i, payload));
    prev = k;
  }

  const hunt: Hunt = {
    version: FORMAT_VERSION,
    hunt_id: toHex(huntId),
    title: input.title.trim(),
    kdf,
    first_clue: input.firstClue.trim(),
    stage_count: n,
    stages,
    pot: input.pot,
  };
  if (invite) {
    // Private: the opening goes inside the sealed intro and out of the public fields.
    hunt.private = await sealIntro(invite, huntId, {
      title: input.title.trim(),
      first_clue: input.firstClue.trim(),
      ...(input.firstMedia?.length ? { first_media: input.firstMedia } : {}),
    });
    hunt.title = PRIVATE_TITLE;
    hunt.first_clue = "";
  } else if (input.firstMedia?.length) hunt.first_media = input.firstMedia;
  const allMedia = [...(input.firstMedia ?? []), ...input.stages.flatMap((s) => s.nextMedia ?? [])];
  if (allMedia.length) hunt.media_ids = allMedia.map((m) => m.id);

  // Self-check: the hunt must be solvable with the given answers.
  const solved = await solveHunt(hunt, input.stages.map((s) => s.answer), invite);
  if (solved.seed_phrase !== input.seedPhrase.trim()) throw new Error("self-check failed: hunt doesn't decrypt");
  if (invite && (await openIntro(hunt, invite)).first_clue !== input.firstClue.trim()) throw new Error("self-check failed: intro doesn't decrypt");
  return hunt;
}

export interface StageResult {
  /** Keep in memory (or sessionStorage) to continue to the next stage. Never send it anywhere. */
  key: Uint8Array;
  payload: StagePayload;
}

/**
 * Tries an answer for one stage. `prevKey` is the key from the previous
 * stage; for stage 1 it's ZERO_KEY, or the invite key on a private hunt.
 * Throws WrongAnswerError on a wrong answer.
 */
export async function unlockStage(hunt: Hunt, index: number, answer: string, prevKey: Uint8Array): Promise<StageResult> {
  validateHunt(hunt);
  const blob = hunt.stages.find((s) => s.index === index);
  if (!blob) throw new Error(`no stage ${index}`);
  const huntId = fromHex(hunt.hunt_id);
  const key = await deriveStageKey(answer, huntId, index, prevKey, hunt.kdf);
  const payload = await open(key, huntId, blob);
  const expected = index < hunt.stage_count ? "clue" : "seed";
  if (payload.type !== expected) throw new Error("hunt file is malformed");
  if (payload.type === "clue" && payload.media !== undefined) checkMediaList(payload.media, "stage media");
  return { key, payload };
}

/** Solves every stage in order. Used by the creator self-check and tests. */
export async function solveHunt(hunt: Hunt, answers: string[], inviteKey?: Uint8Array): Promise<{ seed_phrase: string }> {
  if (hunt.private && !inviteKey) throw new WrongInviteError();
  let prev: Uint8Array = hunt.private ? inviteKey! : ZERO_KEY;
  for (let i = 1; i <= hunt.stage_count; i++) {
    const r = await unlockStage(hunt, i, answers[i - 1] ?? "", prev);
    if (r.payload.type === "seed") return { seed_phrase: r.payload.seed_phrase };
    prev = r.key;
  }
  throw new Error("hunt has no seed stage");
}

/** Checks the shape of a hunt file loaded from the network before using it. */
export function validateHunt(h: Hunt): void {
  const fail = (m: string) => {
    throw new Error(`invalid hunt file: ${m}`);
  };
  if (h.version !== FORMAT_VERSION) fail(`unsupported version ${h.version}`);
  if (!/^[0-9a-f]{32}$/.test(h.hunt_id)) fail("hunt_id");
  if (h.kdf?.name !== "argon2id") fail("kdf");
  // Floor on KDF cost, so a tampered file can't make brute force cheap for everyone else's answers.
  if (h.kdf.memory_kib < 19456 || h.kdf.iterations < 2) fail("kdf parameters too weak");
  if (h.kdf.memory_kib > 1048576 || h.kdf.iterations > 10 || h.kdf.parallelism < 1 || h.kdf.parallelism > 4)
    fail("kdf parameters out of range");
  if (!Number.isInteger(h.stage_count) || h.stage_count < 1 || h.stage_count > 20) fail("stage_count");
  if (!Array.isArray(h.stages) || h.stages.length !== h.stage_count) fail("stages");
  h.stages.forEach((s, i) => {
    if (s.index !== i + 1) fail("stage order");
  });
  if (!h.pot?.address || !h.pot?.viewing_key) fail("pot");
  if (h.first_media !== undefined) checkMediaList(h.first_media, "first_media");
  if (h.private !== undefined) {
    const p = h.private;
    if (!p || typeof p.nonce !== "string" || typeof p.ciphertext !== "string") fail("private");
    if (!/^[A-Za-z0-9+/]{16}$/.test(p.nonce) || !/^[A-Za-z0-9+/]+={0,2}$/.test(p.ciphertext)) fail("private");
    if (h.first_media !== undefined) fail("a private hunt keeps its first-clue media inside the sealed intro");
  }
  if (h.media_ids !== undefined) {
    if (!Array.isArray(h.media_ids) || h.media_ids.length > MAX_MEDIA_PER_CLUE * (h.stage_count + 1)) fail("media_ids");
    if (h.media_ids.some((id) => typeof id !== "string" || !/^[0-9a-f]{32}$/.test(id))) fail("media_ids");
  }
}

function checkMediaList(list: unknown, what: string): asserts list is MediaRef[] {
  const bad = () => {
    throw new Error(`invalid hunt file: ${what}`);
  };
  if (!Array.isArray(list) || list.length > MAX_MEDIA_PER_CLUE) bad();
  for (const m of list as MediaRef[]) {
    if (!m || typeof m !== "object") bad();
    if (typeof m.id !== "string" || !/^[0-9a-f]{32}$/.test(m.id)) bad();
    if (typeof m.key !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(m.key)) bad();
    if (typeof m.mime !== "string" || !/^(image|video|audio)\/[a-z0-9.+-]{1,60}$/i.test(m.mime)) bad();
  }
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

const MEDIA_AAD = "shielded-quest/media/v1";

/**
 * Encrypts one media file in the browser before upload. Returns its reference
 * (id, fresh random key, type) and the blob to upload: 12-byte nonce, then
 * AES-256-GCM ciphertext. The id is bound into the encryption, so a stored blob
 * can't be passed off under another id.
 */
export async function encryptMedia(bytes: Uint8Array, mime: string): Promise<{ ref: MediaRef; blob: Uint8Array }> {
  const id = randomBytes(16);
  const key = randomBytes(32);
  const nonce = randomBytes(12);
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv: nonce as BufferSource, additionalData: concat(enc.encode(MEDIA_AAD), id) as BufferSource },
    await importKey(key, "encrypt"),
    bytes as BufferSource,
  );
  return { ref: { id: toHex(id), key: toB64(key), mime }, blob: concat(nonce, new Uint8Array(ct)) };
}

/** Decrypts a downloaded media blob. Throws if it was tampered with or doesn't match the reference. */
export async function decryptMedia(blob: Uint8Array, ref: MediaRef): Promise<Uint8Array> {
  if (blob.length < 12 + 16) throw new Error("media file is truncated");
  const pt = await subtle().decrypt(
    { name: "AES-GCM", iv: blob.slice(0, 12) as BufferSource, additionalData: concat(enc.encode(MEDIA_AAD), fromHex(ref.id)) as BufferSource },
    await importKey(fromB64(ref.key), "decrypt"),
    blob.slice(12) as BufferSource,
  );
  return new Uint8Array(pt);
}
