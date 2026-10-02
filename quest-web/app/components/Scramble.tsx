"use client";

// Text that "decrypts" into place: each letter cycles through random glyphs,
// then locks in, left to right. The real text is in the HTML from the start,
// so screen readers and search engines read it normally.
import { useEffect, useRef } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=?<>/\\";

export default function Scramble({ text, delay = 300, speed = 28 }: { text: string; delay?: number; speed?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let raf = 0;
    const chars = [...text];
    const lockAt = chars.map((_, i) => 6 + i * 1.6 + Math.random() * 6);
    let last = 0;
    const tick = (t: number) => {
      if (t - last >= speed) {
        last = t;
        frame++;
        el.textContent = chars
          .map((c, i) => (c === " " || frame >= lockAt[i] ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
          .join("");
      }
      if (frame < lockAt[lockAt.length - 1] + 1) raf = requestAnimationFrame(tick);
      else el.textContent = text;
    };
    const t0 = window.setTimeout(() => (raf = requestAnimationFrame(tick)), delay);
    return () => {
      clearTimeout(t0);
      cancelAnimationFrame(raf);
      el.textContent = text;
    };
  }, [text, delay, speed]);
  return (
    <span ref={ref} aria-label={text}>
      {text}
    </span>
  );
}
