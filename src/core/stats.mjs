// Solve result math. Times are milliseconds measured from host receipt of
// device moves (or manual key presses); they are not device timestamps.
//
// Solve record:
// { id, sessionId, createdAt, rawMs, penalty: null|'+2'|'DNF', valid,
//   source: 'device'|'manual'|'simulator', kind, scramble, startFacelets,
//   moves: [{ m, t, batch }], movesComplete, timing: 'host-receipt', note, deleted, rev }

export const DNF = Infinity;

export function effectiveMs(s) {
  if (!s || s.penalty === 'DNF') return DNF;
  return s.rawMs + (s.penalty === '+2' ? 2000 : 0);
}

// Only valid, non-deleted solves count. Invalid attempts (lost sync, disconnect)
// never enter records. Simulator solves are excluded unless asked for.
export function isCounted(s, { includeSimulator = false, kind } = {}) {
  if (!s || s.deleted || s.valid !== true) return false;
  if (!Number.isFinite(s.rawMs) || s.rawMs < 0) return false;
  if (s.source === 'simulator' && !includeSimulator) return false;
  if (kind && s.kind !== kind) return false;
  return true;
}

export function byTime(a, b) {
  return String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id));
}

export function countedSolves(solves, opts) {
  return (solves || []).filter((s) => isCounted(s, opts)).sort(byTime);
}

export function best(solves) {
  let b = null;
  for (const s of solves) {
    const v = effectiveMs(s);
    if (v !== DNF && (b === null || v < b)) b = v;
  }
  return b;
}

export function bestSolve(solves) {
  let b = null;
  for (const s of solves) {
    const v = effectiveMs(s);
    if (v !== DNF && (b === null || v < effectiveMs(b))) b = s;
  }
  return b;
}

// Mean of finished solves; DNFs are reported separately, not as zero.
export function mean(solves) {
  const v = solves.map(effectiveMs).filter((x) => x !== DNF);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// Average of a window (WCA style): drop ceil(5%) best and worst (1 each for
// ao5/ao12). DNF sorts as worst; more DNFs than trimmed → DNF.
export function averageOf(window) {
  const n = window.length;
  if (!n) return null;
  const trim = Math.ceil(n * 0.05);
  const v = window.map(effectiveMs).sort((a, b) => a - b);
  const kept = v.slice(trim, n - trim);
  if (kept.some((x) => x === DNF)) return DNF;
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

// Last n counted solves in chronological order; null when there are fewer.
export function aoN(solves, n) {
  if (solves.length < n) return null;
  return averageOf(solves.slice(-n));
}

export function rollingAo(solves, n) {
  const out = [];
  for (let i = n; i <= solves.length; i++) out.push({ index: i - 1, id: solves[i - 1].id, value: averageOf(solves.slice(i - n, i)) });
  return out;
}

export function bestAo(solves, n) {
  let b = null;
  for (const r of rollingAo(solves, n)) if (r.value !== DNF && (b === null || r.value < b)) b = r.value;
  return b;
}

// Move count / TPS only when the full move list of a device solve is known.
export function hasCompleteMoves(s) {
  return !!s && s.source === 'device' && s.valid === true && s.movesComplete !== false && Array.isArray(s.moves) && s.moves.length > 0;
}

export function moveCount(s) {
  return hasCompleteMoves(s) ? s.moves.length : null;
}

export function tps(s) {
  if (!hasCompleteMoves(s) || s.penalty === 'DNF' || !(s.rawMs > 0)) return null;
  return s.moves.length / (s.rawMs / 1000);
}

export function summary(solves) {
  return {
    count: solves.length,
    best: best(solves),
    mean: mean(solves),
    ao5: aoN(solves, 5),
    ao12: aoN(solves, 12),
    bestAo5: bestAo(solves, 5),
    bestAo12: bestAo(solves, 12),
    dnf: solves.filter((s) => s.penalty === 'DNF').length,
    plus2: solves.filter((s) => s.penalty === '+2').length,
  };
}

// Chart series: one point per solve plus rolling ao5/ao12 aligned by index.
export function series(solves) {
  const a5 = new Map(rollingAo(solves, 5).map((r) => [r.index, r.value]));
  const a12 = new Map(rollingAo(solves, 12).map((r) => [r.index, r.value]));
  return solves.map((s, i) => ({
    index: i,
    id: s.id,
    createdAt: s.createdAt,
    ms: effectiveMs(s),
    ao5: a5.get(i) ?? null,
    ao12: a12.get(i) ?? null,
  }));
}

// Per-day aggregation in the given IANA zone (default: device zone).
export function byDay(solves, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const days = new Map();
  for (const s of solves) {
    const d = fmt.format(new Date(s.createdAt));
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(s);
  }
  return [...days].map(([day, list]) => ({ day, count: list.length, best: best(list), mean: mean(list) }));
}

export function formatMs(ms, digits = 2) {
  if (ms === null || ms === undefined) return '—';
  if (ms === DNF) return 'DNF';
  const total = ms / 1000;
  if (total < 60) return total.toFixed(digits);
  const m = Math.floor(total / 60);
  const rest = (total - m * 60).toFixed(digits).padStart(digits + 3, '0');
  return m + ':' + rest;
}

export function formatSolve(s) {
  if (!s) return '—';
  if (s.penalty === 'DNF') return 'DNF';
  return formatMs(effectiveMs(s)) + (s.penalty === '+2' ? '+' : '');
}

const FA = '۰۱۲۳۴۵۶۷۸۹';
export function faDigits(text) {
  return String(text).replace(/[0-9]/g, (d) => FA[d]);
}
