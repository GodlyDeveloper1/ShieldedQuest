"use client";

// "See for yourself", told by scrolling: the section pins and each stretch of
// scroll plays one guess, typed, checked on the device, then answered. The
// "bytes of guesses sent" counter never moves. See lib/useScrollStory.ts.
import { cx } from "@/lib/cx";
import { useScrollStory } from "@/lib/useScrollStory";
import GuessDemo, { type GuessPhase } from "./GuessDemo";

const GUESSES = [
  { guess: "the ocean", ok: false },
  { guess: "a lighthouse", ok: false },
  { guess: "lighthouse keeper", ok: true },
];
const POINTS = ["No guess ever reaches the server", "The server can't tell how far you got", "Bots pay 64 MiB of work for every try"];

export default function GuessStory() {
  const { ref, step, t, still, stageStyle } = useScrollStory(GUESSES.length);
  const g = GUESSES[step];
  // Within a step: type (0–.55), check (.55–.78), result (.78–1).
  const typed = g.guess.slice(0, Math.round(Math.min(1, t / 0.55) * g.guess.length));
  const phase: GuessPhase = t < 0.55 ? "typing" : t < 0.78 ? "checking" : g.ok ? "right" : "wrong";
  const checked = step + (t >= 0.78 ? 1 : 0);

  return (
    <section ref={ref} className={cx("pin-sec", still && "still")} style={{ ["--len" as string]: GUESSES.length }} aria-label="Your guesses stay yours">
      <div className="pin-in">
        <div className="shell split" style={stageStyle}>
          <div>
            <p className="kicker">See for yourself</p>
            <h2>Your guesses stay yours.</h2>
            <p className="intro">
              Every guess is stretched with Argon2id and tried against the locked stage, right on your device. Wrong or
              right, nothing is sent. Open the Privacy X-ray on any page to watch it live.
            </p>
            <ul className="ticks story-ticks">
              {POINTS.map((p, i) => (
                <li key={p} className={cx((still || checked > i) && "on")}>
                  {p}
                </li>
              ))}
            </ul>
            <p className="story-hint muted tiny" aria-hidden="true">
              Guess {step + 1} of {GUESSES.length} · keep scrolling
            </p>
          </div>
          <div aria-hidden="true">
            <GuessDemo text={typed} phase={phase} checked={checked} />
          </div>
        </div>
      </div>
    </section>
  );
}
