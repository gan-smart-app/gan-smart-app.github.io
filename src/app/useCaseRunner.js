import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from './AppContext.jsx';
import { fromFacelets, invertMove, isSolved, simplifyAlg, statesEqual } from '../core/cube.mjs';
import { matchExecution } from '../core/cases.mjs';

// Drives one case on the real (or simulated) cube:
//   prepare  — guide the cube from its current state to the case start
//   execute  — track the expected algorithm; equivalent sequences that reach
//              the goal count as correct
//   done     — result {correct, mistakes, ms}
// The device state is never rewritten; deviations get an undo path.
export function useCaseRunner() {
  const { onCubeEvent, live, solver, device } = useApp();
  const [st, setSt] = useState({ phase: 'idle' });
  const ref = useRef(st);
  const caseRef = useRef(null);
  const token = useRef(0);
  const set = (patch) => { ref.current = { ...ref.current, ...patch }; setSt(ref.current); };

  const plan = useCallback(async (c, from) => {
    const my = ++token.current;
    if (statesEqual(from, c.startState)) return set({ phase: 'execute', remaining: [], received: [], mistakes: 0, startAt: null, match: null, deviated: false });
    set({ phase: 'planning' });
    let path;
    try {
      path = isSolved(from) && c.setupModel ? [...c.setupModel] : await solver.path(from, c.startState);
    } catch (e) {
      if (my === token.current) set({ phase: 'error', message: 'محاسبهٔ مسیر آماده‌سازی انجام نشد: ' + e.message });
      return;
    }
    if (my !== token.current) return;
    set({ phase: 'prepare', remaining: simplifyAlg(path), deviated: false });
  }, [solver]);

  // c: {startState, setupModel?, solveUser, frame, goal, targetState}
  const start = useCallback((c) => {
    caseRef.current = c;
    ref.current = { phase: 'idle' };
    const model = live.facelets && fromFacelets(live.facelets);
    if (!model) return set({ phase: 'noCube' });
    plan(c, model);
  }, [live.facelets, plan]);

  const stop = useCallback(() => { token.current++; caseRef.current = null; set({ phase: 'idle' }); }, []);

  useEffect(() => onCubeEvent((e) => {
    const c = caseRef.current;
    if (!c) return;
    const s = ref.current;
    if (e.type === 'invalidate') {
      if (s.phase === 'done') return;
      token.current++;
      return set({ phase: 'noCube', message: 'همگامی با روبیک قطع شد؛ این اجرا ثبت نمی‌شود. پس از وضعیت معتبر دوباره آماده‌سازی کن.' });
    }
    if (e.type === 'facelets') {
      // Fresh snapshot: re-plan from the real state (an attempt in progress is dropped).
      const model = fromFacelets(e.facelets);
      if (model && s.phase !== 'done') plan(c, model);
      return;
    }
    if (e.type !== 'move') return;
    const model = fromFacelets(e.facelets);
    if (s.phase === 'planning') return plan(c, model);
    if (s.phase === 'prepare') {
      const expected = s.remaining[0];
      const remaining = simplifyAlg([invertMove(e.move), ...s.remaining]);
      const onTrack = expected && expected[0] === e.move[0] && remaining.length <= s.remaining.length;
      if (statesEqual(model, c.startState)) return set({ phase: 'execute', remaining: [], received: [], mistakes: 0, startAt: null, match: null, deviated: false });
      return set({ remaining, deviated: !onTrack });
    }
    if (s.phase === 'execute') {
      const received = [...s.received, e.move];
      const match = matchExecution(c.solveUser, received, c.frame, { startState: c.startState, goal: c.goal, targetState: c.targetState });
      const newMistake = match.deviated && !(s.match?.deviated);
      const startAt = s.startAt ?? e.at;
      const mistakes = s.mistakes + (newMistake ? 1 : 0);
      if (match.done) {
        return set({ phase: 'done', received, match, mistakes, startAt, result: { correct: mistakes === 0, mistakes, ms: Math.round(e.at - startAt), viaState: match.viaState } });
      }
      return set({ received, match, mistakes, startAt });
    }
  }), [onCubeEvent, plan]);

  useEffect(() => {
    if (device.status !== 'ready' && caseRef.current && ref.current.phase !== 'done') set({ phase: 'noCube' });
  }, [device.status]);

  return { ...st, start, stop, replan: () => { const m = live.facelets && fromFacelets(live.facelets); if (m && caseRef.current) plan(caseRef.current, m); } };
}
