import { aoN, bestSolve, countedSolves, effectiveMs, isCounted, mean, moveCount, tps } from '../core/stats.mjs';
import { ALGORITHM_BY_ID } from '../data/algorithms.mjs';

const r2 = (ms) => (ms == null || !Number.isFinite(ms) ? null : Math.round(ms / 10) / 100);

// Compact statistical summary computed in the app. This is all the optional
// analysis ever receives for a session: no move lists, history or device data.
export function sessionSummary(session, data) {
  if (!session) return null;
  const solves = data.solves.filter((s) => s.sessionId === session.id);
  const chrono = solves.filter((s) => isCounted(s));
  const counted = countedSolves(solves);
  const withMoves = chrono.filter((s) => moveCount(s) != null && s.penalty !== 'DNF');
  const start = solves[0]?.createdAt, end = solves.at(-1)?.createdAt;
  const day0 = new Date(session.createdAt).getTime();
  const errors = data.progress
    .map((p) => ({ p, recent: p.attempts.filter((a) => a.at >= day0 && (!end || a.at <= new Date(end).getTime() + 3600000)) }))
    .filter((x) => x.recent.length && ALGORITHM_BY_ID[x.p.id])
    .map((x) => ({ case: ALGORITHM_BY_ID[x.p.id].nameEn, runs: x.recent.length, errors: x.recent.filter((a) => !a.correct).length }))
    .slice(0, 12);
  return {
    sessionId: session.id,
    method: 'beginner layer-by-layer; learning 2-look OLL/PLL and intuitive F2L',
    solves: solves.length,
    validSolves: chrono.length,
    dnf: solves.filter((s) => s.penalty === 'DNF').length,
    plus2: solves.filter((s) => s.penalty === '+2').length,
    bestSec: r2(counted.length ? effectiveMs(bestSolve(counted)) : null),
    meanSec: r2(mean(chrono)),
    ao5Sec: r2(aoN(chrono, 5)),
    ao12Sec: r2(aoN(chrono, 12)),
    timesSec: chrono.slice(-30).map((s) => (s.penalty === 'DNF' ? 'DNF' : r2(effectiveMs(s)))),
    avgMoves: withMoves.length ? Math.round(withMoves.reduce((a, s) => a + moveCount(s), 0) / withMoves.length) : null,
    avgTps: withMoves.length ? Math.round((withMoves.reduce((a, s) => a + tps(s), 0) / withMoves.length) * 10) / 10 : null,
    durationMin: start && end ? Math.round((new Date(end) - new Date(start)) / 60000) : null,
    caseErrors: errors,
    timing: 'host receipt time, ~0.5 s polling; not competition precision',
  };
}
