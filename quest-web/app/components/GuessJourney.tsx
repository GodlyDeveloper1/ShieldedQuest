"use client";

// Scrollytelling: "Follow one guess". The section pins to the screen and the
// reader's scrolling plays the story of a single guess, from the keyboard to
// the shielded payout, showing at every step what the server gets to see.
//
// No animation library: the scroll position is turned into a step (0–5) and a
// progress within that step (0–1), and the scene is drawn from those two numbers.
// With reduced motion the section isn't pinned and every step is shown finished.
import { cx } from "@/lib/cx";
import { useScrollStory } from "@/lib/useScrollStory";
import { IconDevice, IconGhost, IconKey, IconLock, IconServer, IconShield } from "./Icons";

const GUESS = "lighthouse keeper";
const CIPHER = "8f2a91c40b7ed35a66f1c0";
const PLAIN = "PRIZE KEY UNLOCKED";

const STEPS = [
  {
    icon: <IconDevice />,
    title: "You type a guess",
    body: "It appears in your browser. That is the only place it will ever exist.",
  },
  {
    icon: <IconKey />,
    title: "Your browser does the hard work",
    body: "Argon2id stretches the guess through 64 MiB of memory into a key. A bot pays that same price for every single try.",
  },
  {
    icon: <IconLock />,
    title: "The key tries the lock",
    body: "Wrong guess: the lock stays shut and nothing happens. Right guess: the stage decrypts, right here on your device.",
  },
  {
    icon: <IconServer />,
    title: "The server saw none of it",
    body: "No guess, no result, no progress. It served the locked hunt file, and that's all it knows.",
  },
  {
    icon: <IconShield />,
    title: "One request, one shielded payment",
    body: "The final answer unlocks the prize key. One claim request carries it with your payout address, and the prize leaves in a shielded Zcash transaction. Prefer not to tell the site your address? Sweep the pot yourself with the unlocked key.",
  },
  {
    icon: <IconGhost />,
    title: "The chain doesn't show who won",
    body: "Anyone can check the pot was emptied. Nobody reading the blockchain can see where the prize went or how much. Sweep the pot yourself and this site never learns your address either.",
  },
];
const N = STEPS.length;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export default function GuessJourney() {
  const { ref, step, t, still, at, stageStyle } = useScrollStory(N);

  // What the scene shows at this point of the story.
  const typed = GUESS.slice(0, Math.round(at(0) * GUESS.length));
  const cells = Math.round(at(1) * 64);
  const keyReady = at(1) >= 0.95;
  const opened = at(2);
  const lockText = opened <= 0 ? CIPHER : [...PLAIN].map((ch, i) => (i / PLAIN.length < opened ? ch : CIPHER[i % CIPHER.length])).join("");
  const serverLit = Math.round(at(3) * 3); // how many "0" rows have been checked off
  const claim = at(4);
  const toServer = clamp(claim / 0.5);
  const toChain = clamp((claim - 0.5) / 0.5);
  const done = at(5);

  return (
    <section ref={ref} className={cx("journey", still && "still")} aria-label="Follow one guess">
      <div className="journey-pin">
        <div className="shell journey-grid" style={stageStyle}>
          <div className="journey-text">
            <p className="kicker">Follow one guess</p>
            <h2>Scroll to see where your guess goes.</h2>
            <ol className="journey-steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className={i === step ? "on" : i < step ? "past" : undefined}>
                  <span className="j-dot">{i < step ? "✓" : i + 1}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="journey-bar" aria-hidden="true">
              <i style={{ transform: `scaleX(${(step + t) / N})` }} />
            </div>
          </div>

          <div className={cx("journey-stage", step <= 2 ? "pa" : "pb")} aria-hidden="true">
            {/* Your browser */}
            <div className={cx("j-box j-browser", step <= 2 && "focus")}>
              <p className="j-label">
                <IconDevice /> Your browser
              </p>
              <div className={cx("j-input", step === 0 && "live")}>
                <span>{typed || <em>type a guess…</em>}</span>
                {step === 0 && <b className="gdemo-caret" />}
              </div>

              <div className={cx("j-argon", step === 1 && "live")}>
                <div className="j-row">
                  <span>Argon2id</span>
                  <span className="mono">{cells} / 64 MiB</span>
                </div>
                <div className="j-cells">
                  {Array.from({ length: 64 }, (_, i) => (
                    <i key={i} className={i < cells ? "on" : undefined} />
                  ))}
                </div>
                <div className={cx("j-key", keyReady && "on")}>
                  <IconKey /> <span className="mono">key 9f3a c41e 7b02 55d8</span>
                </div>
              </div>

              <div className={cx("j-lock", opened >= 1 ? "open" : step === 2 && "live")}>
                <IconLock />
                <span className="mono">{lockText}</span>
              </div>
            </div>

            {/* Wire: browser → server */}
            <div className={cx("j-wire a", claim > 0 && "used", step === 3 && "proof")}>
              <i className="j-line" />
              {claim > 0 && claim < 1 && toServer < 1 && <b className="j-packet" style={{ ["--k" as string]: toServer }} />}
              <span className="j-wire-label">{claim > 0 ? "1 request: the claim" : "nothing sent"}</span>
            </div>

            <div className="j-right">
              {/* The server */}
              <div className={cx("j-box j-server", (step === 3 || step === 4) && "focus")}>
                <p className="j-label">
                  <IconServer /> The server
                </p>
                {["guesses received", "answers it can read", "knows how far you got"].map((label, i) => (
                  <div key={label} className={cx("j-zero", serverLit > i && "on")}>
                    <span>{label}</span>
                    <b>{i === 2 ? "no" : "0"}</b>
                  </div>
                ))}
                <div className={cx("j-log", toServer >= 1 && "on")}>
                  <span className="mono">{toServer >= 1 ? "claim → shielded tx" : "holding ciphertext…"}</span>
                </div>
              </div>

              {/* Wire: server → Zcash */}
              <div className={cx("j-wire b", toChain > 0 && "used")}>
                <i className="j-line" />
                {toChain > 0 && toChain < 1 && <b className="j-packet" style={{ ["--k" as string]: toChain }} />}
              </div>

              {/* Zcash */}
              <div className={cx("j-box j-chain", step >= 4 && "focus")}>
                <p className="j-label">
                  <IconShield /> Zcash shielded pool
                </p>
                <div className="j-zero on">
                  <span>the pot</span>
                  <b className={toChain >= 1 ? undefined : "gold"}>{toChain >= 1 ? "emptied ✓" : "0.05 TAZ"}</b>
                </div>
                <div className={cx("j-zero", done > 0.2 && "on")}>
                  <span>sent to</span>
                  <b className="redact">████████</b>
                </div>
                <div className={cx("j-zero", done > 0.5 && "on")}>
                  <span>amount</span>
                  <b className="redact">█████</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
