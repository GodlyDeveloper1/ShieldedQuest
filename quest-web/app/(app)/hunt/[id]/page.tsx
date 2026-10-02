import Link from "next/link";
import { notFound } from "next/navigation";
import { getHunt } from "@/lib/store";
import { huntFingerprint } from "@/lib/hunts";
import { potStatusCached } from "@/lib/signer";
import { isDemoHunt } from "@/lib/demo";
import PotBalance from "./PotBalance";
import HuntSolver from "./HuntSolver";
import PrivateHunt from "./PrivateHunt";
import CreatorReclaim from "./CreatorReclaim";
import AddToPrize from "@/app/components/AddToPrize";
import PrintCards from "@/app/components/PrintCards";
import ShareHunt from "@/app/components/ShareHunt";

export const dynamic = "force-dynamic";

export default async function HuntPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) notFound();
  const stored = await getHunt(id);
  if (!stored) notFound();
  const { hunt, published_at } = stored;
  const fingerprint = huntFingerprint(hunt);
  const pot = await potStatusCached(hunt.pot.pot_id).catch(() => null);
  const claimed = pot?.claimed ?? false;
  const demo = await isDemoHunt(hunt.hunt_id);
  const birthday = pot?.birthday_height;
  const cmd = [
    `zcash-devtool wallet -w ./pot-check init-fvk --name pot \\`,
    `  --fvk ${hunt.pot.viewing_key} \\`,
    `  --birthday ${birthday ?? "<birthday height>"} -s testnet.zec.rocks:443`,
    `zcash-devtool wallet -w ./pot-check sync -s testnet.zec.rocks:443`,
    `zcash-devtool wallet -w ./pot-check balance`,
  ].join("\n");

  // Shown under the solver on every hunt: top-ups, verification, the hunt file, reclaim.
  const tail = (
    <>
      {!claimed && !demo && (
        <>
          <h2>Add to the prize</h2>
          <AddToPrize
            address={hunt.pot.address}
            intro={
              <p className="small" style={{ marginTop: 0 }}>
                Anyone can make this prize bigger. Send shielded testnet ZEC to the pot; it counts as soon as it confirms.
              </p>
            }
          />
        </>
      )}

      <h2>Verify it yourself</h2>
      <div className="card">
        <p className="small" style={{ marginTop: 0 }}>
          <strong>The prize.</strong> Import this viewing key into any Zcash wallet or tool that accepts one (for
          example zcash-devtool) and you&apos;ll see the pot&apos;s balance without trusting this site. It can see
          the pot but can&apos;t spend from it.
        </p>
        <div className="mono">{hunt.pot.viewing_key}</div>
        <p className="muted small">Pot address</p>
        <div className="mono">{hunt.pot.address}</div>
        {birthday !== undefined && (
          <>
            <p className="muted small">Birthday height (where to start scanning)</p>
            <div className="mono">{birthday}</div>
          </>
        )}
        <p className="muted small">Check it with zcash-devtool</p>
        <pre className="cmd">{cmd}</pre>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Step by step: <Link href="/docs/verify">Verify it yourself</Link>.
        </p>
      </div>
      <div className="card">
        <p className="small" style={{ marginTop: 0 }}>
          <strong>The hunt.</strong> Everything your browser needs to solve this hunt is in one public file:{" "}
          {hunt.private ? "the sealed opening (readable only with the invite link) and the locked stages." : "the first clue and the locked stages."} Save a copy. If its SHA-256 ever stops matching the fingerprint below,
          the hunt was changed after publishing.
        </p>
        <p className="muted small">Fingerprint (SHA-256)</p>
        <div className="mono">{fingerprint}</div>
        <div className="row" style={{ marginTop: 12 }}>
          <a className="btn" href={`/api/hunts/${hunt.hunt_id}`} download={`shielded-quest-${hunt.hunt_id}.json`}>
            Download the hunt file
          </a>
        </div>
      </div>

      {!claimed && !demo && <CreatorReclaim huntId={hunt.hunt_id} potId={hunt.pot.pot_id} />}
    </>
  );

  if (hunt.private) {
    return (
      <main>
        <PrivateHunt
          hunt={hunt}
          claimed={claimed}
          publishedAt={published_at}
          pot={
            <div className="card">
              <PotBalance huntId={hunt.hunt_id} />
            </div>
          }
        >
          {tail}
        </PrivateHunt>
      </main>
    );
  }

  return (
    <main>
      {demo && (
        <div className="demo-banner">
          <strong>Practice hunt.</strong> The answers are in the hints, so you can see the whole flow in about a minute. The prize
          and the transactions are real (on testnet).
        </div>
      )}
      <div className="hunt-head">
        <div>
          <h1>{hunt.title}</h1>
          <p className="muted small">
            {hunt.stage_count} stage{hunt.stage_count > 1 ? "s" : ""} · published {published_at}
          </p>
        </div>
        {!demo && <ShareHunt huntId={hunt.hunt_id} title={hunt.title} stages={hunt.stage_count} />}
      </div>

      <div className="card">
        <PotBalance huntId={hunt.hunt_id} />
      </div>

      <HuntSolver hunt={hunt} claimed={claimed} demo={demo} />

      {!demo && (
        <div className="card row spread">
          <div>
            <strong>Running it in the real world?</strong>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              Print a start card with the first clue and a QR code to this page, and put it up at your event.
            </p>
          </div>
          <PrintCards
            data={{ title: hunt.title, firstClue: hunt.first_clue, huntPath: `/hunt/${hunt.hunt_id}` }}
            label="Print start card"
          />
        </div>
      )}

      {tail}
    </main>
  );
}
