// Landing-page visual for private hunts: the invite link, split into the part
// the server receives and the part that stays in the browser, and the same hunt
// seen without and with that key. It only draws what it's told; PrivateStory
// drives it from the scroll.
import { cx } from "@/lib/cx";
import { decrypt } from "@/lib/useScrollStory";
import { IconKey, IconLock } from "./Icons";

export default function InviteAnatomy({
  split,
  open,
}: {
  /** 0 → 1: the key part of the link lights up. */
  split: number;
  /** 0 → 1: the hunt decrypts as the key is applied. */
  open: number;
}) {
  const withKey = open > 0;
  const done = open >= 1;
  return (
    <div className="invite">
      <div className="invite-link" aria-label="An invite link: the part after the # sign stays in your browser">
        <span className={cx("il-sent", split > 0 && split < 1 && !withKey && "dim")}>
          <span className="mono">shieldedquest/hunt/ac01…6dab</span>
          <em>sent to the server</em>
        </span>
        <span className={cx("il-kept", split >= 0.5 && "on")}>
          <span className="mono">#k=gSrD8kr48ec17p7R…</span>
          <em>stays in your browser</em>
        </span>
      </div>

      <div className="invite-tabs" aria-hidden="true">
        <span className={cx(!withKey && "on")}>
          <IconLock /> Without the link
        </span>
        <span className={cx(withKey && "on")}>
          <IconKey /> With the link
        </span>
      </div>

      <div className={cx("invite-view", done && "open")}>
        <p className="tiny muted" style={{ margin: 0 }}>
          {withKey ? "What your guests see" : "What the server and everyone else see"}
        </p>
        <h3>{withKey ? decrypt("Ada's surprise party", open / 0.6) : "Private hunt"}</h3>
        <div className="invite-clue">
          {withKey ? decrypt("Clue 1 · Where did we first meet?", (open - 0.25) / 0.75) : <span className="mono">8f2a 91c4 0b7e d35a 66f1 c0a4 7e19 b3d2</span>}
        </div>
        <div className="invite-meta">
          <span>
            <i className={cx("idot", open >= 0.6 && "good")} /> title {open >= 0.6 ? "readable" : "encrypted"}
          </span>
          <span>
            <i className={cx("idot", done && "good")} /> first clue {done ? "readable" : "encrypted"}
          </span>
          <span>
            <i className="idot good" /> prize verifiable
          </span>
        </div>
      </div>
    </div>
  );
}
