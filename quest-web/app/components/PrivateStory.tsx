"use client";

// The private-hunts section, told by scrolling: the invite link splits into the
// part the server gets and the key that stays in the browser, the hunt is shown
// locked, then the key decrypts it as the reader scrolls. See lib/useScrollStory.ts.
import Link from "next/link";
import { cx } from "@/lib/cx";
import { useScrollStory } from "@/lib/useScrollStory";
import InviteAnatomy from "./InviteAnatomy";

const POINTS = ["Only people with your link can open it", "Right answers don't work without the invite", "The prize is still verifiable by anyone"];
const BEATS = ["The link has two parts", "Without the key, it's locked", "With the key, it opens"];

export default function PrivateStory() {
  const { ref, step, still, at, stageStyle } = useScrollStory(3);
  return (
    <section ref={ref} id="private" className={cx("pin-sec", still && "still")} style={{ ["--len" as string]: 3 }} aria-label="Private hunts">
      <div className="pin-in">
        <div className="shell split" style={stageStyle}>
          <div aria-hidden="true" className="pin-visual">
            <InviteAnatomy split={at(0)} open={at(2)} />
          </div>
          <div>
            <p className="kicker">Invite-only</p>
            <h2>Private hunts. Not even we can read them.</h2>
            <p className="intro">
              Tick one box and your hunt disappears from every list. Its title and first clue are encrypted with a key
              that exists only in the invite link, after the <span className="mono">#</span>. Browsers never send that
              part to a server.
            </p>
            <ul className="ticks story-ticks">
              {POINTS.map((p, i) => (
                <li key={p} className={cx((still || step > i || (step === i && at(i) >= 0.5)) && "on")}>
                  {p}
                </li>
              ))}
            </ul>
            <p className="story-hint muted tiny" aria-hidden="true">
              {BEATS[step]} · keep scrolling
            </p>
            <div className="cta" style={{ marginTop: 20 }}>
              <Link className="btn primary" href="/create">
                Create a private hunt <span className="arrow">→</span>
              </Link>
              <Link className="btn" href="/docs/creators">
                How it works
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
