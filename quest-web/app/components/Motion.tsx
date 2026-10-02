"use client";

// Page motion, in one place:
// - [data-reveal]: fades and rises in when it enters the screen and fades out when it
//   leaves, in both directions (stagger with style --i; data-reveal="fade" only fades).
// - [data-count]: counts up to its number when it comes into view.
// Works after client navigations too. Everything is skipped for people who ask
// for reduced motion (the CSS shows elements immediately).
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const reduce = () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count);
  const decimals = Number(el.dataset.decimals ?? 0);
  if (!Number.isFinite(target)) return;
  if (reduce()) return;
  const start = performance.now();
  const dur = 1100;
  const suffix = el.dataset.suffix ?? "";
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = (target * e).toFixed(decimals) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default function Motion() {
  const path = usePathname();
  useEffect(() => {
    // Elements fade in as they enter the screen and out as they leave it, in both directions.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (e.isIntersecting) {
            el.classList.add("is-in");
            el.classList.remove("out-up");
            if (el.dataset.count !== undefined && !el.dataset.counted) {
              el.dataset.counted = "1";
              countUp(el);
            }
          } else if (el.dataset.reveal !== undefined) {
            el.classList.remove("is-in");
            // Left through the top of the screen: drift up; otherwise it waits below.
            el.classList.toggle("out-up", e.boundingClientRect.top < 0);
          }
        }
      },
      { rootMargin: "-7% 0px -7% 0px", threshold: 0 },
    );
    const seen = new WeakSet<Element>();
    const scan = () =>
      document.querySelectorAll<HTMLElement>("[data-reveal], [data-count]:not([data-counted])").forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        io.observe(el);
      });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [path]);
  return null;
}
