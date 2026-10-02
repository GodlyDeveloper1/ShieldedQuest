import { cx } from "@/lib/cx";
import Link from "next/link";
import HuntArt from "./HuntArt";
import type { HuntState, HuntSummary } from "@/lib/hunts";

export const zec = (zat: number) => (zat / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 });

const BADGE: Record<HuntState, { label: string; cls: string }> = {
  open: { label: "Open", cls: "badge good" },
  unfunded: { label: "Waiting for prize", cls: "badge warn" },
  claimed: { label: "Claimed", cls: "badge" },
  unknown: { label: "Signer offline", cls: "badge bad" },
};

export default function HuntTile({ h }: { h: HuntSummary }) {
  return (
    <Link href={`/hunt/${h.hunt_id}`} className={cx("hunt-tile", h.state === "claimed" && "dim")} data-reveal>
      <HuntArt id={h.hunt_id} stages={h.stage_count} claimed={h.state === "claimed"} animate />
      <div className="body">
        <div className="row spread">
          <p className="title">{h.title}</p>
          <span className={BADGE[h.state].cls}>{BADGE[h.state].label}</span>
        </div>
        <div className="row spread small">
          <span className="muted">
            {h.stage_count} stage{h.stage_count > 1 ? "s" : ""} · {h.published_at}
          </span>
          <span>
            {h.state === "claimed" ? (
              <span className="muted">prize taken</span>
            ) : (
              <>
                <strong>{zec(h.prize_zatoshis)} TAZ</strong>
                {h.confirming_zatoshis > 0 && <span className="muted"> +{zec(h.confirming_zatoshis)}</span>}
              </>
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}
