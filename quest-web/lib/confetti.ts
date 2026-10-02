// A small confetti burst drawn on a temporary canvas (no library, no network).
// Used when a stage unlocks; a bigger burst when the whole hunt is solved.

const COLORS = ["#f4b728", "#ffd768", "#fff6d6", "#3fb950", "#e6e8ee"];

export function confetti(from?: HTMLElement | null, big = false) {
  if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.className = "confetti";
  document.body.appendChild(canvas);
  const g = canvas.getContext("2d")!;
  g.scale(dpr, dpr);

  const r = from?.getBoundingClientRect();
  const ox = r ? r.left + r.width / 2 : innerWidth / 2;
  const oy = r ? r.top + r.height / 2 : innerHeight / 3;
  const n = big ? 170 : 70;
  const parts = Array.from({ length: n }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (big ? Math.PI * 1.4 : Math.PI);
    const v = (big ? 9 : 7) + Math.random() * (big ? 9 : 6);
    return {
      x: ox,
      y: oy,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      w: 5 + Math.random() * 6,
      h: 3 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      c: COLORS[(Math.random() * COLORS.length) | 0],
      round: Math.random() < 0.3,
    };
  });
  const start = performance.now();
  const life = big ? 2600 : 1700;
  const frame = (t: number) => {
    const k = (t - start) / life;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - k * k);
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.c;
      if (p.round) {
        g.beginPath();
        g.arc(0, 0, p.w / 2.4, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 1);
      g.restore();
    }
    if (k < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
