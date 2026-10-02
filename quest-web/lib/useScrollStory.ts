"use client";

// Scroll-driven storytelling without a library. A tall section holds a sticky,
// screen-high stage; as the reader scrolls through the section, this hook turns
// the scroll position into:
//   step – which part of the story we're in (0 … steps-1)
//   t    – progress within that step (0 → 1; reaches 1 at `hold` of the step,
//          then rests, so each beat can be read before the next begins)
//   vis  – 0 → 1 as the stage scrolls into view, 1 → 0 as it leaves (fade in/out)
// With reduced motion, `still` is true: nothing is pinned and the story is shown finished.
import { useEffect, useRef, useState } from "react";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export interface StoryState {
  step: number;
  t: number;
  vis: number;
  still: boolean;
}

export function useScrollStory<T extends HTMLElement = HTMLElement>(steps: number, hold = 0.7) {
  const ref = useRef<T>(null);
  const [state, setState] = useState<StoryState>({ step: 0, t: 0, vis: 1, still: false });

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState({ step: steps - 1, t: 1, vis: 1, still: true });
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = clamp(-r.top / Math.max(1, r.height - vh));
      const pos = p * steps;
      const step = Math.min(steps - 1, Math.floor(pos));
      const t = Math.round(clamp((pos - step) / hold) * 50) / 50;
      const fadeIn = clamp((vh - r.top) / (vh * 0.75));
      const fadeOut = clamp(r.bottom / (vh * 0.75));
      const vis = Math.round(Math.min(fadeIn, fadeOut) * 25) / 25;
      setState((s) => (s.step === step && s.t === t && s.vis === vis ? s : { step, t, vis, still: false }));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [steps, hold]);

  /** Progress of step `s`: 0 before it, `t` during it, 1 after it. */
  const at = (s: number) => (state.step > s ? 1 : state.step === s ? state.t : 0);
  /** Inline style for the pinned stage: fades and settles as it enters and leaves. */
  const stageStyle = state.still
    ? undefined
    : ({ opacity: state.vis, transform: `translateY(${((1 - state.vis) * 28).toFixed(1)}px) scale(${(0.97 + state.vis * 0.03).toFixed(3)})` } as const);
  return { ref, ...state, at, stageStyle };
}

/** Text that "decrypts" as `k` goes 0 → 1: characters lock in from left to right. */
export function decrypt(plain: string, k: number, cipher = "8f2a91c40b7ed35a66f1c0a47e19b3d2"): string {
  if (k >= 1) return plain;
  const chars = [...plain];
  return chars.map((ch, i) => (ch === " " || i / chars.length < k ? ch : cipher[(i * 7) % cipher.length])).join("");
}
