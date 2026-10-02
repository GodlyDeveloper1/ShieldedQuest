"use client";

// "Kee", the Quest Guide's little shield character. It floats, blinks at random,
// follows the pointer with its eyes, and changes face with its mood:
//   idle  – looking around
//   happy – eyes curved up (panel open, a stage solved)
//   think – eyes up and to the side, while a reply is "typing"
//   talk  – mouth moving while the reply types out
// All motion stops for people who ask for reduced motion.
import { useEffect, useRef, useState } from "react";

export type BotMood = "idle" | "happy" | "think" | "talk";

export default function GuideBot({ mood = "idle", size = 40, track = true }: { mood?: BotMood; size?: number; track?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);

  // Random blinks, sometimes a double blink.
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 130);
        if (Math.random() < 0.25) {
          window.setTimeout(() => setBlink(true), 260);
          window.setTimeout(() => setBlink(false), 390);
        }
        loop();
      }, 2200 + Math.random() * 3800);
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  // Eyes follow the pointer; when it's still for a while, glance around.
  useEffect(() => {
    if (!track || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let idle: number;
    const glance = () => {
      idle = window.setTimeout(() => {
        setLook({ x: Math.round((Math.random() * 2 - 1) * 3), y: Math.round((Math.random() * 2 - 1) * 2) });
        glance();
      }, 2500 + Math.random() * 2500);
    };
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.max(1, Math.hypot(dx, dy));
        const k = Math.min(1, d / 260);
        setLook({ x: (dx / d) * 3.2 * k, y: (dy / d) * 2.4 * k });
      });
      clearTimeout(idle);
      glance();
    };
    glance();
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
      clearTimeout(idle);
    };
  }, [track]);

  const eye = mood === "think" ? { x: 2.6, y: -2.6 } : look;
  const closed = blink && mood !== "happy";

  return (
    <svg ref={ref} className={`gbot mood-${mood}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <g className="gbot-body">
        {/* antenna with a little spark */}
        <path d="M24 8.5V4.5" stroke="#f4b728" strokeWidth="2" strokeLinecap="round" />
        <circle className="gbot-spark" cx="24" cy="3.6" r="2.4" fill="#fff6d6" />
        {/* shield body */}
        <path d="M24 8 9.5 13v10.6c0 9.1 6 15.6 14.5 18.4 8.5-2.8 14.5-9.3 14.5-18.4V13L24 8Z" fill="#f4b728" />
        <path d="M24 8 9.5 13v10.6c0 9.1 6 15.6 14.5 18.4" fill="none" stroke="#ffd768" strokeWidth="1.4" strokeLinecap="round" opacity=".9" />
        {/* face plate */}
        <rect x="13.5" y="16" width="21" height="14" rx="7" fill="#161b22" />
        {/* eyes */}
        {mood === "happy" ? (
          <g stroke="#f4b728" strokeWidth="2.2" strokeLinecap="round" fill="none">
            <path d="M17.6 24.2q2.2-2.8 4.4 0" />
            <path d="M26 24.2q2.2-2.8 4.4 0" />
          </g>
        ) : (
          <g transform={`translate(${eye.x.toFixed(2)} ${eye.y.toFixed(2)})`} style={{ transition: "transform .18s ease-out" }}>
            <ellipse cx="19.8" cy="23" rx="2.3" ry={closed ? 0.35 : 2.8} fill="#f4b728" />
            <ellipse cx="28.2" cy="23" rx="2.3" ry={closed ? 0.35 : 2.8} fill="#f4b728" />
            {!closed && (
              <>
                <circle cx="20.6" cy="22" r=".8" fill="#fff6d6" />
                <circle cx="29" cy="22" r=".8" fill="#fff6d6" />
              </>
            )}
          </g>
        )}
        {/* mouth */}
        <path className="gbot-mouth" d="M21.5 34.2q2.5 2 5 0" stroke="#1a1400" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        {/* cheeks */}
        <circle cx="14.8" cy="32" r="1.6" fill="#ff9d5c" opacity=".55" />
        <circle cx="33.2" cy="32" r="1.6" fill="#ff9d5c" opacity=".55" />
      </g>
    </svg>
  );
}
