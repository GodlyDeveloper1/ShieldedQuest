import type { Metadata } from "next";
import Link from "next/link";
import { huntSummaries } from "@/lib/hunts";
import HuntTile from "@/app/components/HuntTile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hunts" };

export default async function HuntsPage() {
  const hunts = await huntSummaries();
  const open = hunts.filter((h) => h.state === "open").length;
  return (
    <main className="wide">
      <div className="shell">
        <div className="row spread" style={{ alignItems: "end", marginBottom: 20 }}>
          <div>
            <h1>Hunts</h1>
            <p className="muted" style={{ margin: 0 }}>
              {open} open · {hunts.length} total. Prizes are verified with each pot&apos;s viewing key.
            </p>
          </div>
          <Link className="btn primary" href="/create">
            Create a hunt
          </Link>
        </div>
        {hunts.length === 0 ? (
          <p className="muted">No hunts yet. Be the first to hide some treasure.</p>
        ) : (
          <div className="hunt-grid">
            {hunts.map((h) => (
              <HuntTile key={h.hunt_id} h={h} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
