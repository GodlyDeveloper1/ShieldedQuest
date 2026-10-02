"use client";

// Quest Guide chat panel. Scripted, runs in the browser, sends nothing.
// See lib/guide.ts for the questions, the clue reader and the puzzle tools.
import { cx } from "@/lib/cx";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  getGuideContext,
  greeting,
  match,
  questionText,
  replyFor,
  runTool,
  subscribeGuideContext,
  suggestions,
  type GuideContext,
  type Reply,
} from "@/lib/guide";
import GuideBot, { type BotMood } from "./GuideBot";

type Msg = { id: number; from: "me" | "guide"; text: string; block?: string; actions?: Reply["actions"]; next?: string[]; done: boolean };

const SERVER_CTX: GuideContext = { page: "other" };

export default function QuestGuide() {
  const path = usePathname();
  const hunt = useSyncExternalStore(subscribeGuideContext, getGuideContext, () => SERVER_CTX);
  const ctx: GuideContext = hunt.page === "hunt" ? hunt : { page: path.startsWith("/create") ? "create" : "other" };

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [awaiting, setAwaiting] = useState<Reply["awaiting"]>(undefined);
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const greetedFor = useRef<string>("");
  const [cheer, setCheer] = useState(false); // a happy hop when a stage is solved
  const [peek, setPeek] = useState<string | null>(null); // the little speech bubble by the button
  const lastStage = useRef<number | undefined>(undefined);

  // Celebrate when the solver moves to the next clue (or solves the hunt).
  useEffect(() => {
    if (ctx.page !== "hunt") return;
    const key = ctx.solved ? 99 : ctx.stage;
    if (lastStage.current !== undefined && key !== undefined && key > lastStage.current) {
      setCheer(true);
      const t = window.setTimeout(() => setCheer(false), 1600);
      if (!open) setPeek(ctx.solved ? "You did it! Claim your prize." : "Nice one! On to the next clue.");
      lastStage.current = key;
      return () => clearTimeout(t);
    }
    lastStage.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.page, ctx.stage, ctx.solved]);

  // Offer help once per visit, after the solver has been looking at a clue for a while.
  useEffect(() => {
    if (ctx.page !== "hunt" || ctx.solved || open) return;
    let shown = false;
    try {
      shown = sessionStorage.getItem("sq-guide-peeked") === "1";
    } catch {}
    if (shown) return;
    const t = window.setTimeout(() => {
      setPeek("Stuck? I can read the clue with you.");
      try {
        sessionStorage.setItem("sq-guide-peeked", "1");
      } catch {}
    }, 9000);
    return () => clearTimeout(t);
  }, [ctx.page, ctx.solved, ctx.stage, open]);

  useEffect(() => {
    if (!peek) return;
    const t = window.setTimeout(() => setPeek(null), 7000);
    return () => clearTimeout(t);
  }, [peek]);
  useEffect(() => {
    if (open) setPeek(null);
  }, [open]);

  // One panel at a time: close when another corner panel opens.
  useEffect(() => {
    const onOther = (e: Event) => (e as CustomEvent).detail !== "guide" && setOpen(false);
    window.addEventListener("sq-panel", onOther);
    return () => window.removeEventListener("sq-panel", onOther);
  }, []);
  useEffect(() => {
    if (open) window.dispatchEvent(new CustomEvent("sq-panel", { detail: "guide" }));
  }, [open]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Greet when opened, and again when the page (or the clue) changes.
  const where = `${ctx.page}:${ctx.title ?? ""}:${ctx.stage ?? ""}:${ctx.solved ? 1 : 0}`;
  useEffect(() => {
    if (!open || greetedFor.current === where) return;
    greetedFor.current = where;
    if (!msgs.length) say(greeting(ctx), true);
    else if (ctx.page === "hunt" && ctx.solved) say({ text: "You solved it! The prize goes to whoever claims first.", next: ["claim", "race", "wallet"] }, true);
    else if (ctx.page === "hunt" && ctx.stage) say({ text: `Nice, you're on clue ${ctx.stage} of ${ctx.stageCount} now. Want me to read it with you?`, next: ["analyse", "stuck", "tools"] }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, where]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  /** Show a guide reply with a short "typing" pause, then type it out. */
  function say(r: Reply, quick = false) {
    const id = nextId.current++;
    setAwaiting(r.awaiting);
    setTyping(true);
    const pause = quick ? 250 : 450 + Math.min(500, r.text.length * 2);
    const t0 = window.setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { id, from: "guide", text: "", block: r.block, actions: r.actions, next: r.next, done: false }]);
      const full = r.text;
      const step = Math.max(2, Math.ceil(full.length / 60)); // about a second for long replies
      let i = 0;
      const tick = () => {
        i = Math.min(full.length, i + step);
        setMsgs((m) => m.map((x) => (x.id === id ? { ...x, text: full.slice(0, i), done: i >= full.length } : x)));
        if (i < full.length) timers.current.push(window.setTimeout(tick, 16));
      };
      tick();
    }, pause);
    timers.current.push(t0);
  }

  function ask(text: string, reply: Reply) {
    setMsgs((m) => [...m, { id: nextId.current++, from: "me", text, done: true }]);
    say(reply);
  }

  function pick(id: string) {
    if (typing) return;
    ask(questionText(id), replyFor(id, getCtx()));
  }

  function getCtx(): GuideContext {
    const h = getGuideContext();
    return h.page === "hunt" ? h : { page: path.startsWith("/create") ? "create" : "other" };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || typing) return;
    setInput("");
    ask(text, awaiting ? runTool(awaiting, text) : match(text, getCtx()));
  }

  const last = [...msgs].reverse().find((m) => m.from === "guide");
  const talking = !!last && !last.done;
  const mood: BotMood = typing ? "think" : talking ? "talk" : cheer || (open && msgs.length <= 1) ? "happy" : "idle";
  const chips = last?.done && last.next?.length ? last.next : msgs.length <= 1 ? suggestions(ctx).map((s) => s.id) : suggestions(ctx, 3).map((s) => s.id);

  return (
    <>
      <div className="guide-anchor">
        {peek && !open && (
          <button type="button" className="g-peek" onClick={() => setOpen(true)}>
            {peek}
          </button>
        )}
        <button
          type="button"
          className={cx("xr-fab guide-fab", open && "on", cheer && "cheer")}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="guide"
          aria-label="Quest Guide"
        >
          <GuideBot mood={mood} size={58} />
          <span className="g-tip">Quest Guide</span>
        </button>

      {open && (
        <aside id="guide" className="xr-panel guide" aria-label="Quest Guide">
          <div className="xr-top">
            <div className="g-head">
              <GuideBot mood={mood} size={44} />
              <div>
              <h3>Quest Guide</h3>
              <p className="muted small">Questions, clue reading and puzzle tools. Runs in your browser; nothing you type is sent.</p>
              </div>
            </div>
            <button type="button" className="link" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="g-list" ref={listRef} aria-live="polite">
            {msgs.map((m) => (
              <div key={m.id} className={`g-msg ${m.from}`}>
                <div className="g-bubble">
                  {m.text}
                  {m.from === "guide" && !m.done && <span className="g-caret" aria-hidden="true" />}
                  {m.done && m.block && <pre className="g-block">{m.block}</pre>}
                  {m.done && m.actions?.map((a) => (
                    <button key={a.event} type="button" className="g-action" onClick={() => window.dispatchEvent(new Event(a.event))}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {typing && (
              <div className="g-msg guide">
                <div className="g-bubble g-typing" aria-label="Typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
          </div>

          {!typing && (
            <div className="g-chips">
              {chips.map((id) => (
                <button key={id} type="button" onClick={() => pick(id)}>
                  {questionText(id)}
                </button>
              ))}
            </div>
          )}

          <form className="g-input" onSubmit={submit}>
            {awaiting ? (
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste the text here…"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) submit(e);
                }}
                autoFocus
                aria-label="Text for the tool"
              />
            ) : (
              <input type="text" autoComplete="off" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" aria-label="Ask the Quest Guide" />
            )}
            <button className="primary" disabled={!input.trim() || typing}>
              {awaiting ? "Run" : "Ask"}
            </button>
          </form>
        </aside>
      )}
      </div>
    </>
  );
}
