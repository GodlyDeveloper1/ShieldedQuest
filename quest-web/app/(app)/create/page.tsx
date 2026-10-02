"use client";

// Create a hunt. Everything secret stays in this browser tab:
//   - answers are typed here and only ever fed to Argon2id here;
//   - the pot's seed phrase arrives from the signer, is shown once for backup,
//     sealed into the last stage here, then dropped from memory.
// The server receives only the public hunt file (ciphertext).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createHunt,
  estimateAnswerBits,
  inviteFromString,
  inviteToString,
  newInviteKey,
  normalizeAnswer,
  type PotRef,
} from "quest-crypto";
import ShareHunt from "@/app/components/ShareHunt";
import AddToPrize from "@/app/components/AddToPrize";
import MediaPicker from "@/app/components/MediaPicker";
import { useConfirm } from "@/app/components/ConfirmDialog";
import { encryptMedia, type MediaRef } from "quest-crypto";
import { recordLocal } from "@/lib/xray";
import PrintCards, { type PrintData } from "@/app/components/PrintCards";

type Stage = { answer: string; nextClue: string; media?: File[] };
type Step = "write" | "backup" | "lock" | "done";

interface PotWithSeed extends PotRef {
  seed_phrase: string;
}

const MAX_STAGES = 10;

// Starting points. Answers left empty are for the creator to fill in: the final
// one in particular must be something the clues don't give away.
const TEMPLATES: { id: string; name: string; blurb: string; title: string; firstClue: string; stages: Stage[] }[] = [
  {
    id: "learn",
    name: "Learn Zcash",
    blurb: "Three questions that teach shielded basics. Add your own secret code word to the final answer.",
    title: "Learn Zcash: your first shielded steps",
    firstClue:
      "Zcash can encrypt the sender, the receiver and the amount of a payment. Payments like that live in a part of the chain with a two-word name. What is it?",
    stages: [
      {
        answer: "shielded pool",
        nextClue:
          "You can let someone see the payments you receive without letting them spend anything, by sharing a special key. What is it called? (two words)",
      },
      {
        answer: "viewing key",
        nextClue:
          "Every shielded payment can carry an encrypted note of up to 512 bytes. Type its name, followed by the secret code word your host shows on screen.",
      },
      { answer: "", nextClue: "" },
    ],
  },
  {
    id: "meetup",
    name: "Meetup scavenger hunt",
    blurb: "Hide printed code cards around the venue. Each code unlocks the next location clue.",
    title: "Meetup Scavenger Hunt",
    firstClue: "Your first card is hidden where everyone picks up their badge. Its code is your first answer.",
    stages: [
      { answer: "", nextClue: "Nice. The next card is taped under the table where the coffee lives." },
      { answer: "", nextClue: "Last one: it's somewhere the speakers can see, but the audience can't." },
      { answer: "", nextClue: "" },
    ],
  },
  {
    id: "ctf",
    name: "CTF / puzzle prize",
    blurb: "One stage: whoever cracks the challenge takes the bounty. The answer is the flag.",
    title: "Crack the Flag",
    firstClue: "Describe your challenge here: a cipher, a file to analyse, a riddle. The flag is the answer.",
    stages: [{ answer: "", nextClue: "" }],
  },
];
const MIN_FINAL_BITS = 40;

// How long a well-equipped attacker would need to guess an answer offline.
// Assumes ~10,000 Argon2id guesses per second (a strong multi-GPU rig at our
// 64 MiB / 3-pass settings) and that the right answer is found halfway through.
const GUESSES_PER_SECOND = 10_000;

function crackTime(bits: number): string {
  const seconds = Math.pow(2, Math.max(bits, 1) - 1) / GUESSES_PER_SECOND;
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [365, "day"],
    [1000, "year"],
    [1000, "thousand years"],
  ];
  let v = seconds;
  let unit = "second";
  for (const [step, name] of units) {
    unit = name;
    if (v < step) break;
    v /= step;
  }
  if (unit === "thousand years" && v >= 1000) return "more than a million years";
  if (v < 1 && unit === "second") return "under a second";
  const n = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return `about ${n.toLocaleString()} ${unit}${n === 1 || unit.endsWith("years") ? "" : "s"}`;
}

function Strength({ answer, isFinal }: { answer: string; isFinal: boolean }) {
  if (!normalizeAnswer(answer)) return null;
  const bits = estimateAnswerBits(answer);
  const pct = Math.min(100, (bits / 60) * 100);
  const weak = bits < MIN_FINAL_BITS;
  const color = !isFinal ? "var(--muted)" : weak ? "var(--warn)" : "var(--good)";
  return (
    <>
      <div className="meter">
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="strength muted">
        A powerful computer could guess this in {crackTime(bits)}.
        {!isFinal && " That's fine here: earlier stages only guard the next clue."}
        {isFinal && !weak && " Strong enough to guard the prize."}
      </div>
    </>
  );
}

function inviteFromText(text: string): Uint8Array {
  const key = inviteFromString(text);
  if (!key) throw new Error("invite key is malformed");
  return key;
}

function inviteLink(huntId: string, invite: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/hunt/${huntId}#k=${invite}`;
}

export default function CreatePage() {
  const [step, setStep] = useState<Step>("write");
  const [title, setTitle] = useState("");
  const [firstClue, setFirstClue] = useState("");
  const [firstMedia, setFirstMedia] = useState<File[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([{ answer: "", nextClue: "" }]);
  const [pot, setPot] = useState<PotWithSeed | null>(null);
  const [savedBackup, setSavedBackup] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [huntId, setHuntId] = useState<string | null>(null);
  // Kept only for printing code cards on the last screen; gone when you leave the page.
  const [printable, setPrintable] = useState<PrintData | null>(null);
  const [template, setTemplate] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  // Private (invite-only): the invite key is made here and only ever leaves inside the link's #fragment.
  const [isPrivate, setIsPrivate] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Simple final answers are allowed, but the creator has to confirm they understand the risk.
  const finalAnswer = stages[stages.length - 1]?.answer ?? "";
  const finalWeak = !!normalizeAnswer(finalAnswer) && estimateAnswerBits(finalAnswer) < MIN_FINAL_BITS;
  const [acceptWeak, setAcceptWeak] = useState(false);
  useEffect(() => setAcceptWeak(false), [finalAnswer]);

  const problems = useMemo(() => {
    const p: string[] = [];
    if (!title.trim()) p.push("Give the hunt a title.");
    if (!firstClue.trim()) p.push("Write the first clue.");
    const clues = [firstClue, ...stages.slice(0, -1).map((s) => s.nextClue)];
    stages.forEach((s, i) => {
      const a = normalizeAnswer(s.answer);
      if (!a) p.push(`Stage ${i + 1} needs an answer.`);
      if (i < stages.length - 1 && !s.nextClue.trim()) p.push(`Write the clue for stage ${i + 2}.`);
      if (a && normalizeAnswer(clues.join(" ")).includes(a))
        p.push(`Stage ${i + 1}'s answer appears in a clue: that gives it away.`);
    });
    if (finalWeak && !acceptWeak) p.push("Your final answer is simple. Tick the box under it to confirm, or make it harder to guess.");
    return p;
  }, [title, firstClue, stages, finalWeak, acceptWeak]);

  function updateStage(i: number, patch: Partial<Stage>) {
    setStages((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  async function makePot() {
    setError(null);
    setBusy("Creating the prize pot…");
    try {
      const res = await fetch("/api/pots", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "couldn't create a pot");
      setPot({ pot_id: body.pot_id, address: body.address, viewing_key: body.viewing_key, seed_phrase: body.seed_phrase });
      setInvite(isPrivate ? inviteToString(newInviteKey()) : null);
      setStep("backup");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function downloadBackup() {
    if (!pot) return;
    const text = [
      "SHIELDED QUEST — PRIZE POT BACKUP (Zcash testnet)",
      "Keep this private. Anyone with these words can take the prize.",
      "",
      `Hunt: ${title.trim()}`,
      `Pot id: ${pot.pot_id}`,
      `Pot address: ${pot.address}`,
      "",
      "Seed phrase:",
      pot.seed_phrase,
      "",
      "Answers (in case you forget them):",
      ...stages.map((s, i) => `  Stage ${i + 1}: ${s.answer.trim()}`),
      "",
      ...(invite
        ? [
            "Private hunt invite key (the part after #k= in the invite link):",
            invite,
            "Invite link: <this site>/hunt/<hunt id>#k=" + invite,
            "Without this key nobody can read the title or the first clue, not even this site.",
            "",
          ]
        : []),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `shielded-quest-pot-${pot.pot_id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function lockAndPublish() {
    if (!pot) return;
    setError(null);
    setStep("lock");
    try {
      const n = stages.length;
      // Encrypt each attached file here and upload only ciphertext.
      const files = [firstMedia, ...stages.slice(0, n - 1).map((s) => s.media ?? [])];
      const total = files.reduce((a, f) => a + f.length, 0);
      let done = 0;
      const refs: MediaRef[][] = [];
      for (const group of files) {
        const out: MediaRef[] = [];
        for (const f of group) {
          setBusy(`Encrypting and uploading media ${++done} of ${total}…`);
          const { ref, blob } = await encryptMedia(new Uint8Array(await f.arrayBuffer()), f.type);
          const up = await fetch("/api/media", {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream", "X-Media-Id": ref.id },
            body: blob as BodyInit,
          });
          if (!up.ok) throw new Error((await up.json().catch(() => ({}))).error ?? `upload of ${f.name} failed`);
          out.push(ref);
        }
        refs.push(out);
      }
      const hunt = await createHunt(
        {
          title,
          firstClue,
          firstMedia: refs[0],
          stages: stages.map((s, i) => ({
            answer: s.answer,
            nextClue: i < n - 1 ? s.nextClue : undefined,
            nextMedia: i < n - 1 ? refs[i + 1] : undefined,
          })),
          seedPhrase: pot.seed_phrase,
          pot: { pot_id: pot.pot_id, address: pot.address, viewing_key: pot.viewing_key },
          ...(invite ? { inviteKey: inviteFromText(invite) } : {}),
        },
        (i, of) => setBusy(`Locking stage ${i} of ${of}…`),
      );
      recordLocal(
        `Hunt sealed in your browser: ${n} stage${n === 1 ? "" : "s"} encrypted`,
        "Each answer was stretched with Argon2id and used to lock the next clue (and finally the prize key). Then every stage was test-opened here before publishing.",
        total ? [{ k: "media", v: `${total} file${total === 1 ? "" : "s"} encrypted before upload` }] : undefined,
      );
      setBusy("Checking every stage opens, then publishing…");
      const res = await fetch("/api/hunts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hunt),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "publish failed");
      setHuntId(body.hunt_id);
      setPrintable({
        title: title.trim(),
        firstClue: firstClue.trim(),
        huntPath: `/hunt/${body.hunt_id}${invite ? `#k=${invite}` : ""}`,
        answers: stages.map((s) => s.answer.trim()),
      });
      // Drop every secret from memory now that the hunt is sealed (except the printable answers above).
      setPot({ ...pot, seed_phrase: "" });
      setStages((all) => all.map(() => ({ answer: "", nextClue: "", media: [] })));
      setFirstMedia([]);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("backup");
    } finally {
      setBusy(null);
    }
  }

  const stepNames: [Step, string][] = [
    ["write", "1 · Clues & answers"],
    ["backup", "2 · Back up the pot"],
    ["lock", "3 · Lock & publish"],
    ["done", "4 · Fund it"],
  ];

  return (
    <main>
      {confirmDialog}
      <h1>Create a hunt</h1>
      <div className="steps">
        {stepNames.map(([k, label]) => (
          <span key={k} className={step === k ? "on" : ""}>
            {label}
          </span>
        ))}
      </div>

      {step === "write" && (
        <>
          <p className="lead">
            Solvers see the first clue. Each answer unlocks the next clue, and the last answer unlocks the prize.
            Answers are locked in your browser and never sent anywhere.
          </p>
          <label htmlFor="tpl">Start from a template (optional)</label>
          <select
            id="tpl"
            value={template}
            onChange={async (e) => {
              const id = e.target.value;
              const t = TEMPLATES.find((x) => x.id === id);
              const dirty =
                title || firstClue || firstMedia.length || stages.some((st) => st.answer || st.nextClue || st.media?.length);
              // Cancel keeps both the text and the dropdown as they were.
              if (
                dirty &&
                !(await confirm(
                  t
                    ? {
                        title: `Use the “${t.name}” template?`,
                        body: "This replaces the title, clues, answers and attached media you've added so far.",
                        confirmLabel: "Use template",
                      }
                    : {
                        title: "Start with a blank hunt?",
                        body: "This clears the title, clues, answers and attached media you've added so far.",
                        confirmLabel: "Clear everything",
                        danger: true,
                      },
                ))
              )
                return;
              setTemplate(id);
              setTitle(t?.title ?? "");
              setFirstClue(t?.firstClue ?? "");
              setFirstMedia([]);
              setStages(t ? t.stages.map((st) => ({ ...st, media: [] })) : [{ answer: "", nextClue: "", media: [] }]);
              setMediaError(null);
            }}
          >
            <option value="">Blank hunt</option>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {template && (
            <p className="muted small" style={{ margin: "6px 0 0" }}>
              {TEMPLATES.find((t) => t.id === template)?.blurb}
            </p>
          )}

          <label htmlFor="title">Title</label>
          <input id="title" type="text" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />

          <label className="private-toggle">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            <span>
              <strong>Private hunt (invite-only)</strong>
              <span className="muted small">
                Not listed anywhere. The title and first clue are encrypted with a key that exists only in the invite
                link you share, so even this site can&apos;t read them.
              </span>
            </span>
          </label>

          <label htmlFor="clue1">First clue {isPrivate ? "(only people with the invite link can read it)" : "(public)"}</label>
          <textarea id="clue1" value={firstClue} maxLength={900} onChange={(e) => setFirstClue(e.target.value)} />
          <MediaPicker files={firstMedia} onChange={setFirstMedia} onError={setMediaError} />
          {mediaError && <p className="error small">{mediaError}</p>}

          {stages.map((s, i) => {
            const last = i === stages.length - 1;
            return (
              <div key={i} className="card stage">
                <div className="row spread">
                  <strong>Stage {i + 1}{last ? " · final" : ""}</strong>
                  {stages.length > 1 && (
                    <button className="link" onClick={() => setStages((all) => all.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  )}
                </div>
                <label htmlFor={`a${i}`}>Answer {last ? "(unlocks the prize)" : `(unlocks clue ${i + 2})`}</label>
                <input
                  id={`a${i}`}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={s.answer}
                  onChange={(e) => updateStage(i, { answer: e.target.value })}
                />
                <Strength answer={s.answer} isFinal={last} />
                {last && finalWeak && (
                  <div className="weak-note">
                    <p className="small" style={{ margin: 0 }}>
                      <strong>Heads up: this answer is simple.</strong> Anyone can download a hunt and let a computer try
                      common words, so someone could take the prize without solving your clues. That&apos;s fine for a
                      fun, low-value hunt. For a real prize, add a code word or number that only solvers can find.
                    </p>
                    <label className="row" style={{ color: "var(--text)", marginTop: 8 }}>
                      <input type="checkbox" checked={acceptWeak} onChange={(e) => setAcceptWeak(e.target.checked)} />
                      I understand someone could guess this and take the prize.
                    </label>
                  </div>
                )}
                {!last && (
                  <>
                    <label htmlFor={`c${i}`}>Clue for stage {i + 2} (revealed by this answer)</label>
                    <textarea
                      id={`c${i}`}
                      value={s.nextClue}
                      maxLength={600}
                      onChange={(e) => updateStage(i, { nextClue: e.target.value })}
                    />
                    <MediaPicker
                      files={s.media ?? []}
                      onChange={(f) => updateStage(i, { media: f })}
                      onError={setMediaError}
                      locked
                    />
                  </>
                )}
              </div>
            );
          })}

          <div className="row">
            <button
              disabled={stages.length >= MAX_STAGES}
              onClick={() => setStages((all) => [...all, { answer: "", nextClue: "" }])}
            >
              Add a stage
            </button>
          </div>

          <p className="muted small">
            Case, accents, punctuation and spacing don&apos;t matter: &ldquo;The Eiffel-Tower!&rdquo; and &ldquo;the eiffel
            tower&rdquo; are the same answer. The guessing times are estimates and can&apos;t tell whether your clue makes
            the answer obvious, so the safest final answers combine what the clue points to with something only a
            solver can find, like a code word at the last location.
          </p>

          {problems.length > 0 && (
            <div className="card warn">
              <ul className="plain">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={problems.length > 0 || !!busy} onClick={makePot}>
            {busy ?? "Continue: create the prize pot"}
          </button>
        </>
      )}

      {step === "backup" && pot && (
        <>
          <p className="lead">
            This is the prize pot&apos;s seed phrase. It will be locked inside your hunt&apos;s last stage. Save a
            backup (it also lists your answers): it&apos;s the only way to take the prize back if nobody solves the hunt.
            Neither this site nor the signer keeps a copy.
          </p>
          <div className="card danger">
            <strong>Anyone who sees these words can take the prize.</strong> Don&apos;t screenshot or paste them into
            chats.
          </div>
          <div className="seed">
            {pot.seed_phrase.split(" ").map((w, i) => (
              <span key={i}>
                <b>{i + 1}.</b>
                {w}
              </span>
            ))}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button onClick={downloadBackup}>Download backup (.txt)</button>
          </div>
          <label className="row" style={{ color: "var(--text)" }}>
            <input type="checkbox" checked={savedBackup} onChange={(e) => setSavedBackup(e.target.checked)} />
            I&apos;ve saved this backup somewhere private.
          </label>
          {error && <p className="error">{error}</p>}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="primary" disabled={!savedBackup} onClick={lockAndPublish}>
              Lock the hunt and publish
            </button>
          </div>
        </>
      )}

      {step === "lock" && (
        <div className="card">
          <strong>{busy ?? "Working…"}</strong>
          <p className="muted small">
            Each stage takes a second or two: the slow key derivation is what makes guessing answers expensive.
          </p>
        </div>
      )}

      {step === "done" && pot && huntId && (
        <>
          <div className="card ok">
            <strong>Your hunt is live.</strong> Now put the prize in the pot.
          </div>
          {invite && (
            <>
              <h2>Your invite link</h2>
              <div className="card warn">
                <p className="small" style={{ marginTop: 0 }}>
                  <strong>Save this link now.</strong> It&apos;s the only way into your private hunt, and it can&apos;t be
                  recovered: the key after <span className="mono">#</span> never reaches our server. Anyone you send it to
                  can play.
                </p>
                <div className="mono addr share-url">{inviteLink(huntId, invite)}</div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="primary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteLink(huntId, invite));
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 1500);
                      } catch {
                        // clipboard blocked: the link is selectable above
                      }
                    }}
                  >
                    {linkCopied ? "Copied" : "Copy invite link"}
                  </button>
                  <ShareHunt huntId={huntId} title={title.trim() || "a private hunt"} stages={stages.length} fragment={`k=${invite}`} />
                </div>
              </div>
            </>
          )}
          <h2>Fund the prize</h2>
          <AddToPrize
            address={pot.address}
            intro={
              <p className="small" style={{ marginTop: 0 }}>
                Scan with a Zcash testnet wallet or copy the address. The prize shows on the hunt page after about 3
                confirmations (5–15 minutes).
              </p>
            }
          />
          {printable && (
            <div className="card row spread">
              <div>
                <strong>Hiding codes in the real world?</strong>
                <p className="muted small" style={{ margin: "4px 0 0" }}>
                  Print a start card (QR + first clue) and one code card per stage, with that stage&apos;s answer, to hide
                  at each location. Only available now, while the answers are still in this page.
                </p>
              </div>
              <PrintCards data={printable} label="Print clue cards" />
            </div>
          )}
          <h2>Anyone can verify it</h2>
          <p className="muted small">
            The hunt page publishes this viewing key. It shows the pot&apos;s balance but can&apos;t spend it.
          </p>
          <div className="card mono">{pot.viewing_key}</div>
          <div className="row">
            <Link className="btn primary" href={`/hunt/${huntId}${invite ? `#k=${invite}` : ""}`}>
              Open the hunt page
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
