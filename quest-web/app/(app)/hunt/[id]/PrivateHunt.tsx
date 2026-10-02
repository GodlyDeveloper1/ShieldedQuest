"use client";

// A private (invite-only) hunt. Its title and first clue are encrypted with an
// invite key that lives only in the link's #fragment, which browsers never send
// to a server. This component reads the key from the address bar, decrypts the
// opening here, and hands it to the solver. Without the key it shows a locked
// card instead; the prize and its verification stay visible either way.
import { useEffect, useState } from "react";
import { inviteFromString, inviteToString, openIntro, type Hunt, type HuntIntro } from "quest-crypto";
import HuntSolver from "./HuntSolver";
import ShareHunt from "@/app/components/ShareHunt";
import PrintCards from "@/app/components/PrintCards";
import { IconLock } from "@/app/components/Icons";
import { recordLocal } from "@/lib/xray";

type State = { status: "checking" } | { status: "locked"; error?: string } | { status: "open"; intro: HuntIntro; key: Uint8Array };

const storeKey = (id: string) => `sq-invite-${id}`;

export default function PrivateHunt({
  hunt,
  claimed,
  publishedAt,
  pot,
  children,
}: {
  hunt: Hunt;
  claimed: boolean;
  publishedAt: string;
  /** The prize box (public for every hunt). */
  pot: React.ReactNode;
  /** Everything below the solver: top-ups, verification, reclaim. */
  children: React.ReactNode;
}) {
  const [state, setState] = useState<State>({ status: "checking" });
  const [pasted, setPasted] = useState("");

  async function tryKey(text: string, fromUser: boolean) {
    const key = inviteFromString(text);
    if (!key) return setState({ status: "locked", error: fromUser ? "That doesn't look like an invite link." : undefined });
    try {
      const intro = await openIntro(hunt, key);
      try {
        sessionStorage.setItem(storeKey(hunt.hunt_id), inviteToString(key)); // this tab only, so a reload keeps you in
      } catch {}
      recordLocal("Private hunt opened in your browser", "The invite key from your link decrypted the title and first clue here. The key was never sent to the server.");
      setState({ status: "open", intro, key });
    } catch {
      setState({ status: "locked", error: "That invite link doesn't open this hunt." });
    }
  }

  useEffect(() => {
    const read = () => {
      const fromHash = window.location.hash.replace(/^#/, "");
      let saved = "";
      try {
        saved = sessionStorage.getItem(storeKey(hunt.hunt_id)) ?? "";
      } catch {}
      const text = fromHash.startsWith("k=") ? fromHash : saved;
      if (text) void tryKey(text, false);
      else setState({ status: "locked" });
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hunt.hunt_id]);

  const stagesLine = (
    <p className="muted small">
      {hunt.stage_count} stage{hunt.stage_count > 1 ? "s" : ""} · published {publishedAt}
    </p>
  );

  if (state.status !== "open") {
    return (
      <>
        <div className="hunt-head">
          <div>
            <h1>
              Private hunt <span className="badge private">Invite-only</span>
            </h1>
            {stagesLine}
          </div>
        </div>
        {pot}
        <div className="card locked-card">
          <div className="locked-icon">
            <IconLock />
          </div>
          {state.status === "checking" ? (
            <p className="muted">Opening your invite…</p>
          ) : (
            <>
              <h2 style={{ margin: "0 0 6px" }}>You need the invite link</h2>
              <p className="muted small" style={{ marginTop: 0 }}>
                This hunt&apos;s title and clues are encrypted with a key that exists only in its invite link. This site
                doesn&apos;t have it and can&apos;t show them. Open the link you were sent, or paste it here.
              </p>
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void tryKey(pasted, true);
                }}
              >
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste the invite link"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  style={{ flex: "1 1 240px" }}
                  aria-label="Invite link"
                />
                <button className="primary" disabled={!pasted.trim()}>
                  Open
                </button>
              </form>
              {state.error && <p className="error small">{state.error}</p>}
              <p className="muted tiny" style={{ marginBottom: 0 }}>
                The link is checked in your browser. It isn&apos;t sent anywhere.
              </p>
            </>
          )}
        </div>
        {children}
      </>
    );
  }

  const fragment = `k=${inviteToString(state.key)}`;
  return (
    <>
      <div className="hunt-head">
        <div>
          <h1>
            {state.intro.title} <span className="badge private">Invite-only</span>
          </h1>
          {stagesLine}
        </div>
        <ShareHunt huntId={hunt.hunt_id} title={state.intro.title} stages={hunt.stage_count} fragment={fragment} />
      </div>
      {pot}
      <HuntSolver hunt={hunt} claimed={claimed} intro={state.intro} startKey={state.key} />
      <div className="card row spread">
        <div>
          <strong>Running it in the real world?</strong>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            Print a start card with the first clue and a QR code. The code carries the invite key, so only hand it to
            people you want in.
          </p>
        </div>
        <PrintCards
          data={{ title: state.intro.title, firstClue: state.intro.first_clue, huntPath: `/hunt/${hunt.hunt_id}#${fragment}` }}
          label="Print start card"
        />
      </div>
      {children}
    </>
  );
}
