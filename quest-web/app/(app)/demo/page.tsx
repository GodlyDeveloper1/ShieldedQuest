import type { Metadata } from "next";
import Link from "next/link";
import { huntSummaries, type HuntSummary } from "@/lib/hunts";
import { ensureDemoPool, pickDemoHunt } from "@/lib/demo";
import HuntTile from "@/app/components/HuntTile";
import { IconDevice, IconEye, IconKey, IconMap } from "@/app/components/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "One-minute hunt" };

/** A ready demo hunt from the pool, or (if the pool is off/empty) the best open regular hunt. */
async function pickDemo(): Promise<HuntSummary | null> {
  void ensureDemoPool(); // top the pool up in the background
  const id = await pickDemoHunt();
  if (id) return (await huntSummaries({ only: [id] }))[0] ?? null;
  const pinned = process.env.DEMO_HUNT_ID;
  const all = await huntSummaries();
  return all.find((h) => h.hunt_id === pinned && h.state === "open") ?? all.find((h) => h.state === "open") ?? null;
}

const STEPS = [
  { icon: <IconMap />, title: "Solve two easy clues", text: "The answers are printed in the hints. It's a practice hunt; the point is to see how it works." },
  { icon: <IconDevice />, title: "Watch your browser work", text: "Each answer is stretched with Argon2id and checked right here. Nothing you type is sent." },
  { icon: <IconKey />, title: "Claim the prize", text: "Paste a shielded testnet address, or, with no wallet, send it back to the practice pool. Either way it's a real shielded transaction." },
  { icon: <IconEye />, title: "Check it yourself", text: "See the prize through the pot's public viewing key, and see that the winner stays hidden." },
];

export default async function DemoPage() {
  const demo = await pickDemo();
  return (
    <main>
      <span className="eyebrow">About a minute · Zcash testnet</span>
      <h1>Play a one-minute hunt</h1>
      <p className="lead">
        A short hunt with a real shielded prize on the Zcash testnet. You&apos;ll solve it, claim it, and see what the site
        could and couldn&apos;t learn along the way.
      </p>

      <div className="demo-steps">
        {STEPS.map((s, i) => (
          <div key={s.title} className="demo-step">
            <div className="icon">{s.icon}</div>
            <div>
              <p className="step-num">Step {i + 1}</p>
              <h3>{s.title}</h3>
              <p className="muted small">{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      {demo ? (
        <>
          <h2>Your practice hunt</h2>
          <div className="demo-pick">
            <HuntTile h={demo} />
          </div>
          <div className="cta" style={{ marginTop: 16 }}>
            <Link className="btn primary lg" href={`/hunt/${demo.hunt_id}`}>
              Start the hunt →
            </Link>
            <Link className="btn lg" href="/docs/how-it-works">
              How it works
            </Link>
          </div>
        </>
      ) : (
        <div className="card warn">
          <strong>The practice prize is being refilled.</strong>
          <p className="small" style={{ marginBottom: 0 }}>
            Someone just claimed it. A new one is funded automatically and is ready after a few block confirmations,
            usually 5–15 minutes. Meanwhile, <Link href="/hunts">browse the other hunts</Link> or read{" "}
            <Link href="/docs/how-it-works">how it works</Link>.
          </p>
        </div>
      )}

      <p className="muted small" style={{ marginTop: 28 }}>
        What&apos;s real: the Zcash testnet, the shielded transactions and the cryptography. What&apos;s not: the money. Testnet
        coins have no value, and this hunt&apos;s answers are public on purpose.
      </p>
    </main>
  );
}
