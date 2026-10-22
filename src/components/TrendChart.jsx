import { useEffect, useMemo, useRef, useState } from 'react';
import { fa, msText } from '../app/format.js';

// Solve-time trend: accent spline of counted solves (DNF leaves a gap) and a
// thin green rolling ao5 when there are at least five solves.
function spline(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export default function TrendChart({ points, ao5 = [], height = 400, compact = false }) {
  const [hover, setHover] = useState(null);
  // Match the viewBox to the real width so dots stay round.
  const box = useRef(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!box.current) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const W = width, H = height, pad = { l: compact ? 34 : 48, r: 16, t: 16, b: compact ? 28 : 40 };
  const finite = points.filter((p) => Number.isFinite(p.ms));
  const geo = useMemo(() => {
    if (!finite.length) return null;
    const vals = finite.map((p) => p.ms / 1000);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 4) { lo -= 2; hi += 2; }
    lo = Math.max(0, Math.floor(lo / 5) * 5); hi = Math.ceil(hi / 5) * 5;
    const n = points.length;
    const x = (i) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const ticks = [];
    const step = (hi - lo) / 5 > 10 ? 10 : 5;
    for (let v = lo; v <= hi + 0.001; v += step) ticks.push(v);
    return { x, y, lo, hi, ticks, n };
  }, [points, finite.length, H, W]);

  if (!geo) return null;
  // Segments break at DNF.
  const segs = [];
  let cur = [];
  points.forEach((p, i) => {
    if (Number.isFinite(p.ms)) cur.push([geo.x(i), geo.y(p.ms / 1000)]);
    else { if (cur.length) segs.push(cur); cur = []; }
  });
  if (cur.length) segs.push(cur);
  const aoPts = ao5.map((v, i) => (v != null && Number.isFinite(v) ? [geo.x(i), geo.y(v / 1000)] : null));
  const aoSegs = [];
  let a = [];
  aoPts.forEach((p) => { if (p) a.push(p); else { if (a.length) aoSegs.push(a); a = []; } });
  if (a.length) aoSegs.push(a);
  const xEvery = Math.max(1, Math.ceil(geo.n / (compact ? 6 : 10)));

  return (
    <div ref={box} className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full" role="img" aria-label={'نمودار روند ' + fa(points.length) + ' حل'}>
        {geo.ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={geo.y(t)} y2={geo.y(t)} stroke="rgb(var(--line))" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {aoSegs.map((s, i) => <path key={'a' + i} d={spline(s)} fill="none" stroke="rgb(var(--ok))" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.9" />)}
        {segs.map((s, i) => <path key={i} d={spline(s)} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />)}
        {points.map((p, i) => Number.isFinite(p.ms) && (
          <circle key={i} cx={geo.x(i)} cy={geo.y(p.ms / 1000)} r={hover === i ? 6 : compact ? 3 : 4} fill="rgb(var(--surface))" stroke="rgb(var(--accent))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ))}
        {points.map((_, i) => (
          <rect key={'h' + i} x={geo.x(i) - (W / Math.max(points.length, 1)) / 2} y={0} width={W / Math.max(points.length, 1)} height={H} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {/* Axis labels as HTML so they stay crisp and unscaled. */}
      {geo.ticks.map((t) => (
        <span key={t} className="absolute text-[10px] text-faint num" style={{ left: 0, top: `calc(${(geo.y(t) / H) * 100}% - 8px)`, width: pad.l - 8, textAlign: 'right' }} dir="ltr">{t}</span>
      ))}
      {points.map((p, i) => (i % xEvery === 0 || i === points.length - 1) && (
        <span key={i} className="absolute text-[10px] text-faint num" style={{ left: `calc(${(geo.x(i) / W) * 100}% - 12px)`, bottom: 4, width: 24, textAlign: 'center' }} dir="ltr">{i + 1}</span>
      ))}
      {hover != null && (
        <div className="absolute pointer-events-none card bg-raised shadow-lg shadow-black/40 px-2.5 py-1.5 text-xs"
          style={{ left: `calc(${(geo.x(hover) / W) * 100}% + 8px)`, top: 8 }}>
          حل {fa(hover + 1)}: <span dir="ltr" className="font-bold">{msText(points[hover].ms) ?? 'DNF'}</span>
          {ao5[hover] != null && <span className="block text-ok">ao5: <span dir="ltr">{msText(ao5[hover])}</span></span>}
        </div>
      )}
    </div>
  );
}
