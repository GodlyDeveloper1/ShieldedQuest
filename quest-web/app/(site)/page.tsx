import Link from "next/link";
import { huntSummaries } from "@/lib/hunts";
import HuntArt from "@/app/components/HuntArt";
import HuntTile from "@/app/components/HuntTile";
import Scramble from "@/app/components/Scramble";
import Tilt from "@/app/components/Tilt";
import Marquee from "@/app/components/Marquee";
import GuessStory from "@/app/components/GuessStory";
import GuessJourney from "@/app/components/GuessJourney";
import PrivateStory from "@/app/components/PrivateStory";
import GuideBot from "@/app/components/GuideBot";
import {
  IconDevice,
  IconEye,
  IconFlag,
  IconGhost,
  IconGraduation,
  IconKey,
  IconLock,
  IconMap,
  IconServer,
  IconShield,
  IconUsers,
} from "@/app/components/Icons";

export const dynamic = "force-dynamic";

const STRIP = [
  "Guesses never leave your browser",
  "Prizes verified by viewing key",
  "Winners stay invisible",
  "Argon2id behind every guess",
  "One shielded transaction to claim",
  "Invite-only hunts the server can't read",
  "No accounts. No emails. No tracking.",
];

export default async function Home() {
  const hunts = await huntSummaries();
  const live = hunts.filter((h) => h.state !== "claimed").slice(0, 3);
  const shown = live.length ? live : hunts.slice(0, 3);

  return (
    <main className="wide landing">
      {/* Hero */}
      <section className="hero">
        <div className="shell hero-grid">
          <div>
            <span className="eyebrow" data-reveal style={{ ["--i" as string]: 0 }}>
              <i className="live-dot" /> Built on Zcash shielded payments
            </span>
            <h1 data-reveal style={{ ["--i" as string]: 1 }}>
              Puzzle-gated prizes,
              <br />
              <em>
                <Scramble text="private by design." delay={500} />
              </em>
            </h1>
            <p className="sub" data-reveal style={{ ["--i" as string]: 2 }}>
              Hide shielded ZEC behind a riddle. Guesses never leave the solver&apos;s browser, anyone can verify the
              prize is real, and nobody can see who won.
            </p>
            <div className="cta" data-reveal style={{ ["--i" as string]: 3 }}>
              <Link className="btn primary lg" href="/hunts">
                Explore hunts <span className="arrow">→</span>
              </Link>
              <Link className="btn lg" href="/create">
                Create a hunt
              </Link>
            </div>
            <p className="muted small" data-reveal style={{ marginTop: 16, ["--i" as string]: 4 }}>
              No account, no email, no tracking. New here?{" "}
              <Link href="/demo">Play a one-minute hunt</Link>.
            </p>
          </div>

          <div className="hero-stage" data-reveal style={{ ["--i" as string]: 2 }} aria-hidden="true">
            <Tilt className="hero-art">
              <HuntArt id="5e15f4a1d6e8880c9a3b77c2e41d08f6" stages={3} height={170} animate />
              <div style={{ padding: "16px 4px 2px" }}>
                <div className="row spread">
                  <strong>The Lighthouse Keeper</strong>
                  <span className="badge good">Open</span>
                </div>
                <div className="steps" style={{ margin: "12px 0" }}>
                  <span className="on">✓ Stage 1</span>
                  <span className="on">✓ Stage 2</span>
                  <span className="pulse">Stage 3</span>
                </div>
                <div className="row spread">
                  <span className="muted small">verified prize</span>
                  <strong style={{ fontSize: 24 }}>0.05 TAZ</strong>
                </div>
              </div>
            </Tilt>
            <span className="chip float-a">
              <i className="ok">✓</i> guess checked locally
            </span>
            <span className="chip float-b">
              <IconEye /> prize verified
            </span>
            <span className="chip float-c">
              <IconGhost /> winner: hidden
            </span>
            <div className="hero-bot">
              <GuideBot size={64} mood="idle" />
            </div>
          </div>
        </div>
      </section>

      <Marquee items={STRIP} />

      {/* Numbers */}
      <section className="shell">
        <div className="stats">
          <div data-reveal style={{ ["--i" as string]: 0 }}>
            <strong>
              <span data-count="0">0</span>
            </strong>
            <span>guesses or answers sent to the server</span>
          </div>
          <div data-reveal style={{ ["--i" as string]: 1 }}>
            <strong>
              <span data-count="64">64</span> MiB
            </strong>
            <span>of Argon2id work behind every guess</span>
          </div>
          <div data-reveal style={{ ["--i" as string]: 2 }}>
            <strong>
              <span data-count="1">1</span>
            </strong>
            <span>shielded transaction to claim the prize</span>
          </div>
        </div>
      </section>

      {/* Scrollytelling: one guess, start to finish */}
      <GuessJourney />

      {/* How it works */}
      <section className="band" id="how">
        <div className="shell">
          <p className="kicker" data-reveal>
            How it works
          </p>
          <h2 data-reveal>Three steps. Zero trust required.</h2>
          <p className="intro" data-reveal>
            The cryptography happens in your browser; the prize lives in Zcash&apos;s shielded pool.
          </p>
          <div className="steps3">
            {[
              { n: "01", icon: <IconMap />, t: "Hide", h: "Write the riddle", p: "Clues and answers, stage by stage. Your browser locks each stage with its answer and seals the prize key inside the last one." },
              { n: "02", icon: <IconEye />, t: "Prove", h: "Fund it in the open", p: "Send shielded ZEC to the hunt's pot. Its viewing key is public, so anyone can check the prize is really there." },
              { n: "03", icon: <IconKey />, t: "Solve", h: "Unlock and claim", p: "Each right answer opens the next clue. The last one unlocks the prize, claimed in a single shielded transaction." },
            ].map((s, i) => (
              <div key={s.n} className="feature step-card" data-reveal style={{ ["--i" as string]: i }}>
                <span className="big-num">{s.n}</span>
                <div className="icon">{s.icon}</div>
                <p className="step-num">{s.t}</p>
                <h3>{s.h}</h3>
                <p>{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* See for yourself: scroll-driven */}
      <GuessStory />

      {/* Privacy */}
      <section className="band" id="privacy">
        <div className="shell">
          <p className="kicker" data-reveal>
            Privacy
          </p>
          <h2 data-reveal>Private by design. Provable by anyone.</h2>
          <p className="intro" data-reveal>
            Most &quot;prize&quot; apps ask you to trust them with your answers, your identity and the payout. Here the trust
            is replaced by math, and what can&apos;t be removed is written down.
          </p>
          <div className="grid4">
            {[
              { icon: <IconDevice />, h: "Guesses stay on your device", p: "Every guess is checked by trying to decrypt the stage locally. Wrong or right, nothing is sent." },
              { icon: <IconServer />, h: "The server holds ciphertext", p: "Hunts are stored locked and padded to equal sizes. The site can't read answers or the prize key." },
              { icon: <IconShield />, h: "The prize is verifiable", p: "The pot's viewing key is published. Check the balance in any Zcash wallet, without trusting us." },
              { icon: <IconGhost />, h: "The winner stays invisible", p: "The claim is built so even the public viewing key can't see where the prize went or how much was sent." },
            ].map((f, i) => (
              <div key={f.h} className="feature" data-reveal style={{ ["--i" as string]: i }}>
                <div className="icon">{f.icon}</div>
                <h3>{f.h}</h3>
                <p>{f.p}</p>
              </div>
            ))}
          </div>
          <p className="small" style={{ marginTop: 18 }} data-reveal>
            <Link href="/docs/privacy">Read the full threat model →</Link>
          </p>
        </div>
      </section>

      {/* Private hunts: scroll-driven */}
      <PrivateStory />

      <Marquee items={["Meetups", "CTFs", "Classrooms", "Giveaways", "Onboarding quests", "Conference hunts", "Bounties", "Surprise parties", "Team offsites"]} tone="dark" />

      {/* Use cases */}
      <section className="band" id="uses">
        <div className="shell">
          <p className="kicker" data-reveal>
            Use cases
          </p>
          <h2 data-reveal>What people use it for</h2>
          <p className="intro" data-reveal>
            Anywhere you want to reward people for figuring something out, without collecting who they are.
          </p>
          <div className="grid2">
            {[
              { icon: <IconGraduation />, h: "Zcash onboarding quests", p: "Teach newcomers shielded wallets by making them use one. Each clue is a lesson; the prize is their first shielded ZEC." },
              { icon: <IconUsers />, h: "Meetups and conferences", p: "Print clue cards with QR codes and hide them around the venue. Whoever finishes first takes the pot." },
              { icon: <IconFlag />, h: "CTFs and puzzle prizes", p: "Gate a bounty behind a challenge. The answer itself is the key, so there's no judge to trust and no payout delay." },
              { icon: <IconLock />, h: "Giveaways without data grabs", p: "Run a community campaign without asking for emails, wallets or sign-ups. Winners stay anonymous." },
              { icon: <IconGhost />, h: "Surprises for people you know", p: "A birthday, a proposal, a family game. Make it private and only the people with your invite link can even see what it's about." },
              { icon: <IconShield />, h: "Team offsites and classrooms", p: "Hand out the invite as a QR code. Your group plays; the rest of the internet sees a locked page." },
            ].map((f, i) => (
              <div key={f.h} className="feature" data-reveal style={{ ["--i" as string]: i }}>
                <div className="icon">{f.icon}</div>
                <h3>{f.h}</h3>
                <p>{f.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live hunts */}
      <section className="band" id="live">
        <div className="shell">
          <div className="row spread" style={{ alignItems: "end" }}>
            <div>
              <p className="kicker" data-reveal>
                Live now
              </p>
              <h2 data-reveal>Live hunts</h2>
              <p className="intro" style={{ marginBottom: 20 }} data-reveal>
                Every prize below is verified with its pot&apos;s viewing key.
              </p>
            </div>
            <Link href="/hunts" className="small" style={{ marginBottom: 20 }} data-reveal>
              See all hunts →
            </Link>
          </div>
          {shown.length === 0 ? (
            <p className="muted" data-reveal>No hunts yet. Be the first to hide some treasure.</p>
          ) : (
            <div className="hunt-grid">
              {shown.map((h) => (
                <HuntTile key={h.hunt_id} h={h} />
              ))}
            </div>
          )}

          <div className="cta-band" data-reveal>
            <div className="cta-bot" aria-hidden="true">
              <GuideBot size={70} mood="happy" track={false} />
            </div>
            <div>
              <h2>Hide your first treasure</h2>
              <p style={{ margin: 0 }}>A two-stage hunt takes about three minutes to write. Public or invite-only.</p>
            </div>
            <div className="cta">
              <Link className="btn dark lg" href="/create">
                Create a hunt <span className="arrow">→</span>
              </Link>
              <Link className="btn ghost-dark lg" href="/docs">
                Read the docs
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
