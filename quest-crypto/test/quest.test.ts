import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHunt,
  unlockStage,
  solveHunt,
  normalizeAnswer,
  estimateAnswerBits,
  checkHuntStrength,
  WrongAnswerError,
  WrongInviteError,
  newInviteKey,
  inviteToString,
  inviteFromString,
  openIntro,
  validateHunt,
  encryptMedia,
  PRIVATE_TITLE,
  ZERO_KEY,
  DEFAULT_KDF,
  type Hunt,
  type KdfParams,
} from "../src/index.ts";

// Cheapest parameters the validator accepts, to keep tests quick.
const FAST: KdfParams = { name: "argon2id", memory_kib: 19456, iterations: 2, parallelism: 1 };
// Dummy test phrase (the standard BIP-39 test vector), never funded.
const SEED = Array(23).fill("abandon").join(" ") + " art";
const POT = { pot_id: "test", address: "utest1example", viewing_key: "uviewtest1example" };

const input = {
  title: "Test hunt",
  firstClue: "Where did it all begin?",
  stages: [
    { answer: "Genesis Block", nextClue: "Count the halvings." },
    { answer: "3", nextClue: "Say the magic words." },
    { answer: "violet otter 7719 lantern", nextClue: undefined },
  ],
  seedPhrase: SEED,
  pot: POT,
  kdf: FAST,
};

let hunt: Hunt;

test("create and solve a 3-stage hunt", async () => {
  hunt = await createHunt(input);
  assert.equal(hunt.stage_count, 3);
  const { seed_phrase } = await solveHunt(hunt, ["genesis block", "3", "Violet-Otter 7719 lantern!"]);
  assert.equal(seed_phrase, SEED);
});

test("the hunt file contains no answers or seed", () => {
  const json = JSON.stringify(hunt).toLowerCase();
  for (const secret of ["genesis", "violet", "lantern", "abandon", "halvings", "magic"]) {
    assert.ok(!json.includes(secret), `leaked: ${secret}`);
  }
});

test("every stage blob is the same size (the seed stage isn't distinguishable)", () => {
  const sizes = new Set(hunt.stages.map((s) => s.ciphertext.length));
  assert.equal(sizes.size, 1);
});

test("stage by stage reveals the next clue", async () => {
  const s1 = await unlockStage(hunt, 1, "GENESIS  block", ZERO_KEY);
  assert.deepEqual(s1.payload, { type: "clue", clue: "Count the halvings." });
  const s2 = await unlockStage(hunt, 2, "3", s1.key);
  assert.deepEqual(s2.payload, { type: "clue", clue: "Say the magic words." });
});

test("wrong answer is rejected", async () => {
  await assert.rejects(unlockStage(hunt, 1, "exodus block", ZERO_KEY), WrongAnswerError);
});

test("right answer with the wrong previous key is rejected (stages are chained)", async () => {
  await assert.rejects(unlockStage(hunt, 3, "violet otter 7719 lantern", ZERO_KEY), WrongAnswerError);
});

test("blobs can't be moved between stages or hunts", async () => {
  const swapped: Hunt = { ...hunt, stages: [{ ...hunt.stages[1], index: 1 }, hunt.stages[0], hunt.stages[2]].map((s, i) => ({ ...s, index: i + 1 })) };
  await assert.rejects(unlockStage(swapped, 1, "genesis block", ZERO_KEY), WrongAnswerError);
  const other: Hunt = { ...hunt, hunt_id: "00".repeat(16) };
  await assert.rejects(unlockStage(other, 1, "genesis block", ZERO_KEY), WrongAnswerError);
});

test("tampered ciphertext is rejected", async () => {
  const ct = hunt.stages[0].ciphertext;
  const flipped = (ct[5] === "A" ? "B" : "A");
  const bad: Hunt = { ...hunt, stages: [{ ...hunt.stages[0], ciphertext: ct.slice(0, 5) + flipped + ct.slice(6) }, ...hunt.stages.slice(1)] };
  await assert.rejects(unlockStage(bad, 1, "genesis block", ZERO_KEY), WrongAnswerError);
});

test("weakened KDF in a hunt file is refused", async () => {
  const weak: Hunt = { ...hunt, kdf: { ...hunt.kdf, memory_kib: 8 } };
  await assert.rejects(unlockStage(weak, 1, "genesis block", ZERO_KEY), /too weak/);
});

test("create refuses bad input", async () => {
  await assert.rejects(createHunt({ ...input, seedPhrase: "too short" }), /24-word/);
  await assert.rejects(
    createHunt({ ...input, stages: [{ answer: "a", nextClue: undefined }, { answer: "b" }] }),
    /needs the clue/,
  );
  await assert.rejects(createHunt({ ...input, stages: [{ answer: "  !!! " }] }), /needs an answer/);
});

test("normalisation", () => {
  assert.equal(normalizeAnswer("  The Eiffel-Tower! "), "the eiffel tower");
  assert.equal(normalizeAnswer("Café  Crème"), "cafe creme");
  assert.equal(normalizeAnswer("ＡＢＣ１２３"), "abc123");
});

test("strength estimate", () => {
  assert.ok(estimateAnswerBits("paris") <= 16);
  assert.ok(estimateAnswerBits("violet otter 7719 lantern") >= 40);
  assert.equal(checkHuntStrength(["paris", "eiffel tower"]).ok, false);
  assert.equal(checkHuntStrength(["paris", "violet otter 7719 lantern"]).ok, true);
});

test("default KDF (64 MiB, 3 passes) timing", async () => {
  const t = performance.now();
  await unlockStage(await createHunt({ ...input, stages: [{ answer: "x" }], kdf: DEFAULT_KDF }), 1, "x", ZERO_KEY);
  const perDerive = (performance.now() - t) / 3; // create + self-check + unlock
  console.log(`  one Argon2id derivation at default params ≈ ${Math.round(perDerive)} ms`);
});

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------
import { encryptMedia, decryptMedia, MAX_MEDIA_PER_CLUE } from "../src/index.ts";

test("media: encrypt then decrypt round-trips", async () => {
  const bytes = new Uint8Array(5000).map((_, i) => i % 251);
  const { ref, blob } = await encryptMedia(bytes, "image/png");
  assert.match(ref.id, /^[0-9a-f]{32}$/);
  assert.equal(ref.mime, "image/png");
  assert.ok(blob.length === bytes.length + 12 + 16);
  assert.deepEqual(await decryptMedia(blob, ref), bytes);
});

test("media: tampered blob, wrong key or swapped id is rejected", async () => {
  const { ref, blob } = await encryptMedia(new Uint8Array([1, 2, 3, 4]), "audio/mpeg");
  const t = blob.slice(); t[20] ^= 1;
  await assert.rejects(decryptMedia(t, ref));
  const other = await encryptMedia(new Uint8Array([9]), "audio/mpeg");
  await assert.rejects(decryptMedia(blob, { ...ref, key: other.ref.key }));
  await assert.rejects(decryptMedia(blob, { ...ref, id: other.ref.id }));
});

test("media: stage media is only revealed by solving the stage before it", async () => {
  const img = await encryptMedia(new Uint8Array([7, 7, 7]), "image/jpeg");
  const first = await encryptMedia(new Uint8Array([1]), "image/webp");
  const h = await createHunt({
    ...input,
    firstMedia: [first.ref],
    stages: [
      { answer: "genesis block", nextClue: "Look at the photo.", nextMedia: [img.ref] },
      { answer: "violet otter 7719 lantern" },
    ],
  });
  assert.deepEqual(h.first_media, [first.ref]);
  assert.deepEqual(h.media_ids, [first.ref.id, img.ref.id]);
  // The stage media key is nowhere in the public file.
  assert.ok(!JSON.stringify(h).includes(img.ref.key));
  const s1 = await unlockStage(h, 1, "genesis block", ZERO_KEY);
  assert.ok(s1.payload.type === "clue");
  assert.deepEqual(s1.payload.type === "clue" ? s1.payload.media : null, [img.ref]);
  assert.deepEqual(await decryptMedia(img.blob, img.ref), new Uint8Array([7, 7, 7]));
});

test("media: a full clue with the maximum attachments still fits one padded block", async () => {
  const refs = await Promise.all(Array.from({ length: MAX_MEDIA_PER_CLUE }, () => encryptMedia(new Uint8Array([1]), "video/mp4")));
  const h = await createHunt({
    ...input,
    stages: [
      { answer: "genesis block", nextClue: "x".repeat(600), nextMedia: refs.map((r) => r.ref) },
      { answer: "violet otter 7719 lantern" },
    ],
  });
  assert.equal(new Set(h.stages.map((s) => s.ciphertext.length)).size, 1);
});

test("media: malformed media references in a hunt file are refused", async () => {
  const bad = { ...hunt, first_media: [{ id: "zz", key: "x", mime: "text/html" }] } as unknown as Hunt;
  await assert.rejects(unlockStage(bad, 1, "genesis block", ZERO_KEY), /first_media/);
  const html = { ...hunt, first_media: [{ id: "a".repeat(32), key: "A".repeat(43) + "=", mime: "text/html" }] } as unknown as Hunt;
  await assert.rejects(unlockStage(html, 1, "genesis block", ZERO_KEY), /first_media/);
});

// ---------------------------------------------------------------------------
// Private (invite-only) hunts
// ---------------------------------------------------------------------------

test("private: the published file hides the title and first clue", async () => {
  const invite = newInviteKey();
  const h = await createHunt({ ...input, inviteKey: invite });
  assert.equal(h.title, PRIVATE_TITLE);
  assert.equal(h.first_clue, "");
  assert.ok(h.private);
  const file = JSON.stringify(h);
  assert.ok(!file.includes("Test hunt") && !file.includes("Where did it all begin"));
  assert.ok(!file.includes(inviteToString(invite)));
  validateHunt(JSON.parse(file));
});

test("private: the invite key opens the intro and the answers solve it", async () => {
  const invite = newInviteKey();
  const h = await createHunt({ ...input, inviteKey: invite });
  const intro = await openIntro(h, invite);
  assert.equal(intro.title, "Test hunt");
  assert.equal(intro.first_clue, "Where did it all begin?");
  const r = await solveHunt(h, input.stages.map((s) => s.answer), invite);
  assert.equal(r.seed_phrase, SEED);
});

test("private: without the invite, the intro stays shut and right answers fail", async () => {
  const invite = newInviteKey();
  const h = await createHunt({ ...input, inviteKey: invite });
  await assert.rejects(openIntro(h, null), WrongInviteError);
  await assert.rejects(openIntro(h, newInviteKey()), WrongInviteError);
  // The correct stage-1 answer, but starting from the public zero key or a wrong invite.
  await assert.rejects(unlockStage(h, 1, "Genesis Block", ZERO_KEY), WrongAnswerError);
  await assert.rejects(unlockStage(h, 1, "Genesis Block", newInviteKey()), WrongAnswerError);
  await assert.rejects(solveHunt(h, input.stages.map((s) => s.answer)), WrongInviteError);
});

test("private: first-clue media keys live inside the sealed intro", async () => {
  const invite = newInviteKey();
  const { ref } = await encryptMedia(new Uint8Array([1, 2, 3]), "image/png");
  const h = await createHunt({ ...input, firstMedia: [ref], inviteKey: invite });
  assert.equal(h.first_media, undefined);
  assert.ok(!JSON.stringify(h).includes(ref.key));
  assert.deepEqual(h.media_ids, [ref.id]);
  assert.deepEqual((await openIntro(h, invite)).first_media, [ref]);
});

test("private: invite keys round-trip through a link fragment", () => {
  const invite = newInviteKey();
  const text = inviteToString(invite);
  assert.match(text, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(inviteFromString(text), invite);
  assert.deepEqual(inviteFromString(`https://example.org/hunt/${"ab".repeat(16)}#k=${text}`), invite);
  assert.equal(inviteFromString("not a key"), null);
  assert.equal(inviteFromString(""), null);
});

test("public hunts are unchanged: openIntro just reads the file", async () => {
  const h = await createHunt(input);
  assert.equal(h.private, undefined);
  assert.deepEqual(await openIntro(h), { title: "Test hunt", first_clue: "Where did it all begin?", first_media: undefined });
});
