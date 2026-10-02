// A small "treasure map" generated from the hunt id, so every hunt has its own
// recognisable artwork without anyone uploading images. Deterministic: the same
// hunt always gets the same map.

function bytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out.length ? out : [0];
}

export default function HuntArt({
  id,
  stages,
  claimed = false,
  height = 120,
  animate = false,
}: {
  id: string;
  stages: number;
  claimed?: boolean;
  height?: number;
  /** Draw the route, pop the stops and pulse the X when shown. */
  animate?: boolean;
}) {
  const b = bytes(id);
  const at = (i: number) => b[i % b.length];
  const hueA = Math.round((at(0) / 255) * 360);
  const hueB = (hueA + 40 + Math.round((at(1) / 255) * 80)) % 360;
  const W = 320;
  const H = 120;
  const n = Math.max(2, Math.min(stages + 1, 8)); // start point + one per stage
  const pts = Array.from({ length: n }, (_, i) => {
    const x = 28 + (i * (W - 56)) / (n - 1);
    const y = 24 + (at(2 + i) / 255) * (H - 48);
    return [Math.round(x), Math.round(y)] as const;
  });
  const path = pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x} ${y}`;
      const [px, py] = pts[i - 1];
      const cx = Math.round((px + x) / 2);
      return `C${cx} ${py} ${cx} ${y} ${x} ${y}`;
    })
    .join(" ");
  const gid = `g${id.slice(0, 8)}`;
  const [ex, ey] = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`Map of a ${stages}-stage hunt`}
      className={animate ? "ha-anim" : undefined}
      style={{ display: "block", opacity: claimed ? 0.55 : 1 }}
    >
      <defs>
        {/* reveals the dashed route as if it were being drawn */}
        <mask id={`${gid}m`}>
          <path className="ha-draw" d={path} fill="none" stroke="#fff" strokeWidth="8" pathLength={1} strokeLinecap="round" />
        </mask>
      </defs>
      <rect width={W} height={H} fill={`hsl(${hueA} 38% 14%)`} />
      <circle cx={W * 0.82} cy={H * 0.15} r="70" fill={`hsl(${hueB} 45% 18%)`} />
      {/* contour lines */}
      {[0, 1, 2].map((k) => (
        <ellipse
          key={k}
          cx={60 + (at(10 + k) / 255) * 200}
          cy={30 + (at(13 + k) / 255) * 60}
          rx={40 + k * 18}
          ry={18 + k * 9}
          fill="none"
          stroke={`hsl(${hueB} 40% 40% / .18)`}
        />
      ))}
      <path d={path} fill="none" stroke="#f4b728" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" mask={animate ? `url(#${gid}m)` : undefined} />
      {pts.slice(0, -1).map(([x, y], i) => (
        <circle
          key={i}
          className="ha-stop"
          style={{ ["--i" as string]: i, transformOrigin: `${x}px ${y}px` }}
          cx={x}
          cy={y}
          r={i === 0 ? 4 : 5}
          fill={i === 0 ? "#e6e8ee" : "#161b22"}
          stroke="#f4b728"
          strokeWidth="2"
        />
      ))}
      {claimed ? (
        <circle cx={ex} cy={ey} r="9" fill="none" stroke="#9aa3b2" strokeWidth="2" />
      ) : (
        <g className="ha-x" style={{ transformOrigin: `${ex}px ${ey}px` }} stroke="#f4b728" strokeWidth="3.5" strokeLinecap="round">
          <line x1={ex - 8} y1={ey - 8} x2={ex + 8} y2={ey + 8} />
          <line x1={ex + 8} y1={ey - 8} x2={ex - 8} y2={ey + 8} />
        </g>
      )}
    </svg>
  );
}
