// The "your browser" mock on the landing page: a clue, an answer box and two
// counters. It only draws what it's told; GuessStory drives it from the scroll.
import { cx } from "@/lib/cx";

export type GuessPhase = "typing" | "checking" | "wrong" | "right";

export default function GuessDemo({ text, phase, checked }: { text: string; phase: GuessPhase; checked: number }) {
  return (
    <div className="gdemo">
      <div className="gdemo-bar">
        <i />
        <i />
        <i />
        <span>your browser</span>
      </div>
      <div className="gdemo-body">
        <p className="muted tiny" style={{ margin: "0 0 6px" }}>
          Clue 3 · Who keeps the light burning when the coast is dark?
        </p>
        <div className={cx("gdemo-input", phase)}>
          <span>{text}</span>
          {phase === "typing" && <b className="gdemo-caret" />}
          <em>
            {phase === "checking" ? (
              <>
                <span className="spinner" /> Argon2id…
              </>
            ) : phase === "wrong" ? (
              "Not it"
            ) : phase === "right" ? (
              "Unlocked ✓"
            ) : (
              "Try it"
            )}
          </em>
        </div>
        <div className="gdemo-meters">
          <div>
            <b key={checked} className="tick-pop">
              {checked}
            </b>
            <span>checked on this device</span>
          </div>
          <div className="zero">
            <b>0</b>
            <span>bytes of guesses sent</span>
          </div>
        </div>
      </div>
    </div>
  );
}
