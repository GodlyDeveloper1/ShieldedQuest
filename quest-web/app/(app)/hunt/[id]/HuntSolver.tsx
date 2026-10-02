"use client";

// Solving happens entirely in this browser: each answer is run through
// Argon2id here and tried against the stage's ciphertext. Wrong guesses never
// reach the server, so nobody learns what you tried or how far you got.
//
// Progress (the current stage's key and the clues seen so far) is kept in
// sessionStorage for this tab only, so a reload doesn't lose it. The prize
// seed phrase is held in memory only.

import { cx } from "@/lib/cx";
import { useEffect, useRef, useState } from "react";
import { confetti } from "@/lib/confetti";
import { unlockStage, ZERO_KEY, toHex, fromHex, type Hunt, type HuntIntro, type MediaRef } from "quest-crypto";
import MediaView, { prefetchMedia } from "@/app/components/MediaView";
import ClueText from "@/app/components/ClueText";
import { postClaim, SLOW_AFTER_MS, SLOW_MESSAGE } from "@/lib/claim-client";
import TxLink from "@/app/components/TxLink";
import { recordGuess } from "@/lib/xray";
import { setGuideContext } from "@/lib/guide";

type RevealedClue = { clue: string; media?: MediaRef[] };

interface Progress {
  stage: number; // next stage to solve (1-based)
  key: string; // hex key from the previous stage ("" for stage 1)
  clues: (RevealedClue | string)[]; // clues revealed so far, after the first (strings from older saves)
}

const storeKey = (id: string) => `sq-progress-${id}`;

function loadProgress(id: string): Progress | null {
  try {
    const raw = sessionStorage.getItem(storeKey(id));
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null;
  }
}

function saveProgress(id: string, p: Progress | null) {
  try {
    if (p) sessionStorage.setItem(storeKey(id), JSON.stringify(p));
    else sessionStorage.removeItem(storeKey(id));
  } catch {
    // Private mode etc.: progress just won't survive a reload.
  }
}

export default function HuntSolver({
  hunt,
  claimed,
  demo = false,
  intro,
  startKey,
}: {
  hunt: Hunt;
  claimed: boolean;
  demo?: boolean;
  /** Private hunts: the title and first clue, decrypted with the invite key. */
  intro?: HuntIntro;
  /** Private hunts: the invite key, which stage 1 is chained to. */
  startKey?: Uint8Array;
}) {
  const opening: HuntIntro = intro ?? { title: hunt.title, first_clue: hunt.first_clue, first_media: hunt.first_media };
  const fresh: Progress = { stage: 1, key: "", clues: [] };
  const [progress, setProgress] = useState<Progress>(fresh);
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [miss, setMiss] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [unlocked, setUnlocked] = useState<number | null>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [showSeed, setShowSeed] = useState(false);

  const [to, setTo] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimSlow, setClaimSlow] = useState(false);
  const [sentToPool, setSentToPool] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [txid, setTxid] = useState<string | null>(null);
  const answerRef = useRef<HTMLInputElement>(null);
  const tryRef = useRef<HTMLButtonElement>(null);

  function shake() {
    const el = answerRef.current;
    if (!el) return;
    el.classList.remove("shake");
    void el.offsetWidth; // restart the animation
    el.classList.add("shake");
    window.setTimeout(() => el.classList.remove("shake"), 450);
  }

  // Download every media file of the hunt up front (all ciphertext), so the
  // server can't infer a solver's progress from which files they fetch.
  useEffect(() => {
    if (hunt.media_ids?.length) prefetchMedia(hunt.media_ids);
  }, [hunt.media_ids]);

  useEffect(() => {
    const p = loadProgress(hunt.hunt_id);
    if (p && p.stage >= 1 && p.stage <= hunt.stage_count) setProgress(p);
  }, [hunt.hunt_id, hunt.stage_count]);

  async function tryAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || checking) return;
    setChecking(true);
    setMiss(null);
    setUnlocked(null);
    const started = performance.now();
    let took = 0; // the real check time, without the spinner's minimum
    try {
      const prev = progress.key ? fromHex(progress.key) : (startKey ?? ZERO_KEY);
      // Keep the spinner up long enough to be seen, even when the check is fast.
      const [r] = await Promise.all([
        unlockStage(hunt, progress.stage, answer, prev).finally(() => (took = performance.now() - started)),
        new Promise((ok) => setTimeout(ok, 700)),
      ]);
      recordGuess(progress.stage, answer, true, took);
      setAnswer("");
      setTries(0);
      setUnlocked(progress.stage);
      confetti(tryRef.current, r.payload.type === "seed");
      if (r.payload.type === "seed") {
        setSeed(r.payload.seed_phrase);
        saveProgress(hunt.hunt_id, null); // nothing left to resume; the seed is never stored
      } else {
        const next: Progress = { stage: progress.stage + 1, key: toHex(r.key), clues: [...progress.clues, { clue: r.payload.clue, media: r.payload.media }] };
        setProgress(next);
        saveProgress(hunt.hunt_id, next);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "WrongAnswerError") recordGuess(progress.stage, answer, false, took);
      await new Promise((ok) => setTimeout(ok, Math.max(0, 700 - (performance.now() - started))));
      const name = err instanceof Error ? err.name : "";
      if (name === "WrongAnswerError") {
        const n = tries + 1;
        setTries(n);
        setMiss(`Not it. Try again. (${n} ${n === 1 ? "try" : "tries"} on this clue)`);
        shake();
      } else {
        setMiss(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setChecking(false);
    }
  }

  async function claim(e: React.FormEvent, dest?: string) {
    e.preventDefault();
    const target = dest ?? to.trim();
    if (!seed || claiming || !target) return;
    setClaiming(true);
    setClaimError(null);
    setClaimSlow(false);
    const slowTimer = setTimeout(() => setClaimSlow(true), SLOW_AFTER_MS);
    try {
      setTxid(await postClaim(hunt.hunt_id, seed, target));
      confetti(null, true);
      setSentToPool(dest === "demo-pool");
      setSeed(null); // the pot is empty now; drop the phrase
      window.dispatchEvent(new Event("sq-pot-refresh"));
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(slowTimer);
      setClaiming(false);
      setClaimSlow(false);
    }
  }

  function restart() {
    saveProgress(hunt.hunt_id, null);
    setProgress(fresh);
    setMiss(null);
    setTries(0);
    setUnlocked(null);
    setAnswer("");
  }

  const clues: RevealedClue[] = [
    { clue: opening.first_clue, media: opening.first_media },
    ...progress.clues.map((c) => (typeof c === "string" ? { clue: c } : c)),
  ];
  const solved = seed !== null || txid !== null;
  const current = clues[clues.length - 1];

  // Tell the Quest Guide which clue is on screen (it stays in this browser).
  useEffect(() => {
    setGuideContext({
      page: "hunt",
      title: opening.title,
      stage: progress.stage,
      stageCount: hunt.stage_count,
      clue: current.clue,
      clueHasMedia: !!current.media?.length,
      solved,
      demo,
      claimed,
    });
  }, [opening.title, hunt.stage_count, progress.stage, current.clue, current.media, solved, demo, claimed]);
  useEffect(() => () => setGuideContext(null), []);

  return (
    <>
      <div className="steps">
        {Array.from({ length: hunt.stage_count }, (_, i) => {
          const n = i + 1;
          const done = solved || n < progress.stage;
          return (
            <span key={n} className={done ? "on" : ""}>
              {done ? "✓ " : ""}Stage {n}
            </span>
          );
        })}
      </div>

      {clues.map((c, i) => (
        <div key={i}>
          <h2>Clue {i + 1}</h2>
          <div className={cx("card stage", unlocked !== null && i === clues.length - 1 && i > 0 && "fresh")}>
            <div style={{ whiteSpace: "pre-wrap" }}>
              <ClueText text={c.clue} />
            </div>
            <MediaView media={c.media} />
          </div>
        </div>
      ))}

      {!solved && (
        <form onSubmit={tryAnswer} className="card">
          <label htmlFor="answer" style={{ marginTop: 0 }}>
            Answer to clue {progress.stage}
            {progress.stage === hunt.stage_count ? " (unlocks the prize)" : ""}
          </label>
          <div className="row">
            <input
              ref={answerRef}
              id="answer"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                setMiss(null); // editing clears the last result
                setUnlocked(null);
              }}
              style={{ flex: "1 1 240px" }}
            />
            <button ref={tryRef} className="primary" disabled={checking || !answer.trim()} aria-busy={checking}>
              {checking ? (
                <>
                  <span className="spinner" aria-hidden="true" /> Checking…
                </>
              ) : (
                "Try it"
              )}
            </button>
          </div>
          {miss && <p className="error small">{miss}</p>}
          {unlocked !== null && !miss && (
            <p className="small" style={{ color: "var(--good)" }}>
              Correct! Stage {unlocked} unlocked. Clue {unlocked + 1} is above.
            </p>
          )}
          <p className="muted small">
            Checked here in your browser. Your guesses are never sent anywhere. Case, accents and punctuation don&apos;t
            matter.
          </p>
          {progress.stage > 1 && (
            <button type="button" className="link small" onClick={restart}>
              Start over
            </button>
          )}
        </form>
      )}

      {seed && claimed && (
        <div className="card">
          <strong>You solved it!</strong> The prize was already taken before you got here, but the answers were right.
        </div>
      )}

      {seed && !claimed && (
        <>
          <div className="card ok">
            <strong>You solved it.</strong> The prize is yours if you claim it first. Anyone else who solves it can
            claim it too, so don&apos;t wait.
          </div>

          <h2>Claim the prize</h2>
          <form onSubmit={claim} className="card">
            <label htmlFor="to" style={{ marginTop: 0 }}>
              Your shielded testnet address (a fresh one from your wallet)
            </label>
            <input
              id="to"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="utest1…"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            {claimError && <p className="error small">{claimError}</p>}
            <div className="row" style={{ marginTop: 12 }}>
              <button className="primary" disabled={claiming || !to.trim()} aria-busy={claiming}>
                {claiming ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> Sending the prize…
                  </>
                ) : (
                  "Claim the prize"
                )}
              </button>
            </div>
            {claimSlow && <p className="muted small">{SLOW_MESSAGE}</p>}
            {demo && (
              <div className="pool-option">
                <p className="small" style={{ margin: "0 0 8px" }}>
                  <strong>No testnet wallet?</strong> Send the prize back to the practice pool. It&apos;s the same real
                  shielded transaction, and the coins fund the next player&apos;s hunt.
                </p>
                <button type="button" disabled={claiming} onClick={(e) => claim(e, "demo-pool")}>
                  Send it back to the practice pool
                </button>
              </div>
            )}
            <p className="muted small">
              This sends the unlocked key to this site&apos;s signer, which moves the whole pot to your address in one
              shielded transaction. The site sees your address and the key while it does this. If you&apos;d rather it
              didn&apos;t, use the option below instead.
            </p>
          </form>

          <h2>Or sweep it yourself</h2>
          <div className="card">
            <p className="small" style={{ marginTop: 0 }}>
              Restore this seed phrase in any Zcash testnet wallet and send the balance to yourself. Nothing is sent to
              this site. Anyone who sees these words can take the prize.
            </p>
            {showSeed ? (
              <div className="seed">
                {seed.split(" ").map((w, i) => (
                  <span key={i}>
                    <b>{i + 1}.</b>
                    {w}
                  </span>
                ))}
              </div>
            ) : (
              <button type="button" onClick={() => setShowSeed(true)}>
                Show the seed phrase
              </button>
            )}
          </div>
        </>
      )}

      {txid && (
        <div className="card ok">
          {sentToPool ? (
            <>
              <strong>Prize sent back to the practice pool.</strong> That was a real shielded transaction on the Zcash testnet. Open
              the pot&apos;s viewing key below in any wallet: you&apos;ll see the pot emptied, but not where the coins went.
            </>
          ) : (
            <>
              <strong>Prize sent.</strong> It arrives in your wallet after a few confirmations (5–15 minutes).
            </>
          )}
          <TxLink txid={txid} />
        </div>
      )}
    </>
  );
}
