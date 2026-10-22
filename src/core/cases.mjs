// Case setups, recognition quizzes and live execution tracking for lessons.

import {
  applyAlg, applyMove, invertAlg, MOVE_NAMES, parseAlg, simplifyAlg, solvedState, stateFromAlg,
  statesEqual, toFacelets, translateAlg,
} from './cube.mjs';
import { goalReached, WHITE_EDGES, LL_CORNERS, LL_EDGES } from './stages.mjs';
import { edgeDistance, edgeSolution } from './edgeTables.mjs';
import { ALGORITHMS, FRAME } from '../data/algorithms.mjs';

export * from './stages.mjs';

const aufMoves = (k) => [[], ['U'], ['U2'], ["U'"]][((k % 4) + 4) % 4];
const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

// ---- user-frame piece description (yellow up, green front) ----
const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];
const Z2 = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'F', B: 'B' };
const toUser = (name) => [...name].map((c) => Z2[c]).join('');

// Where a model cubie sits in the user's view and which way its first
// colour (white/yellow for corners, the reference colour for edges) faces.
export function userCorner(state, piece) {
  const p = state.cp.indexOf(piece);
  return [toUser(CORNER_NAMES[p]), toUser(CORNER_NAMES[p][state.co[p]])];
}
export function userEdge(state, piece) {
  const p = state.ep.indexOf(piece);
  return [toUser(EDGE_NAMES[p]), toUser(EDGE_NAMES[p][state.eo[p]])];
}

// Top-layer (yellow) orientation in the user's view: {UFL: 'U', URF: 'F', ...}.
export function userYellow(state) {
  const out = {};
  for (const p of LL_CORNERS) out[toUser(CORNER_NAMES[p])] = toUser(CORNER_NAMES[p][state.co[p]]);
  return out;
}
export function userBadEdges(state) {
  return LL_EDGES.filter((p) => state.eo[p]).map((p) => toUser(EDGE_NAMES[p])).sort();
}

export function userMisplacedEdges(state) {
  return LL_EDGES.filter((p) => state.ep[p] !== p).map((p) => toUser(EDGE_NAMES[p])).sort();
}

const OPP = { 4: 6, 6: 4, 5: 7, 7: 5 };

// Last-layer permutation summary after the best final AUF.
export function llPermutation(state) {
  let best = null;
  let s = state;
  for (let k = 0; k < 4; k++) {
    const corners = LL_CORNERS.filter((p) => s.cp[p] !== p);
    const edges = LL_EDGES.filter((p) => s.ep[p] !== p);
    const score = corners.length + edges.length;
    if (!best || score < best.score) {
      best = {
        score, auf: k, cornersMoved: corners.length, edgesMoved: edges.length,
        cornerSwap: corners.length === 2 ? (OPP[corners[0]] === corners[1] ? 'diagonal' : 'adjacent') : null,
        edgeSwap: edges.length === 2 ? (OPP[edges[0]] === edges[1] ? 'opposite' : 'adjacent')
          : edges.length === 4 ? (edges.every((p) => OPP[s.ep[p]] === p) ? 'opposite' : 'adjacent') : null,
      };
    }
    s = applyMove(s, 'D');
  }
  return best;
}

// ---- cross ----
export const crossDistance = (state) => edgeDistance(state, WHITE_EDGES);
export const crossSolution = (state) => edgeSolution(state, WHITE_EDGES);

function randomScramble(rnd, length = 25) {
  const out = [];
  while (out.length < length) {
    const m = MOVE_NAMES[Math.floor(rnd() * 18)];
    const prev = out[out.length - 1];
    if (prev && prev[0] === m[0]) continue;
    out.push(m);
  }
  return out;
}

export function generateCrossCase(rnd = Math.random, { minMoves = 2, maxMoves = 8 } = {}) {
  for (let i = 0; i < 5000; i++) {
    const scramble = randomScramble(rnd);
    const state = stateFromAlg(scramble);
    const d = crossDistance(state);
    if (d >= minMoves && d <= maxMoves) {
      return {
        setupModel: scramble, setupUser: translateAlg(scramble, FRAME), startState: state,
        startFacelets: toFacelets(state), optimalModel: crossSolution(state), optimalLength: d, goal: 'cross',
        targetPredicate: (s) => goalReached('cross', s),
      };
    }
  }
  throw new Error('No cross case in range');
}

// ---- case setup ----
const PLL_PERMS = ALGORITHMS.filter((a) => a.category === 'pll2');
const OLL_ALGS = ALGORITHMS.filter((a) => a.category === 'oll2' && a.goal === 'oll');
const LL_CATEGORIES = new Set(['oll2', 'pll2', 'advanced']);

// Builds the start position for practising `entry`. Setup moves bring a
// solved cube to the case; the UI computes a path from the real cube state.
export function createCaseSetup(entry, { randomAuf = false, randomizeOtherPieces = false, rnd = Math.random } = {}) {
  if (entry.practice?.type === 'cross') return { entryId: entry.id, ...generateCrossCase(rnd, entry.practice) };
  if (!entry.alg) throw new Error('Entry has no algorithm: ' + entry.id);
  const isLL = LL_CATEGORIES.has(entry.category) || entry.auf;
  const pre = [];
  if (randomizeOtherPieces) {
    // Other last-layer pieces do not change how the case is solved.
    if (entry.category === 'f2l') pre.push(...invertAlg(pick(OLL_ALGS, rnd).alg), ...invertAlg(pick(PLL_PERMS, rnd).alg));
    else if (entry.goal === 'oll' || entry.goal === 'llEdgesOriented') pre.push(...invertAlg(pick(PLL_PERMS, rnd).alg));
  }
  const before = randomAuf && isLL ? aufMoves(Math.floor(rnd() * 4)) : [];
  const after = randomAuf && (isLL || entry.category === 'f2l') ? aufMoves(Math.floor(rnd() * 4)) : [];
  const setupUser = simplifyAlg([...pre, ...before, ...invertAlg(entry.alg), ...after]);
  const setupModel = translateAlg(setupUser, FRAME);
  const startState = stateFromAlg(setupModel);
  const solveUser = simplifyAlg([...invertAlg(after), ...parseAlg(entry.alg)]);
  const targetState = applyAlg(startState, translateAlg(solveUser, FRAME));
  const goal = entry.goal || null;
  return {
    entryId: entry.id, setupUser, setupModel, startState, startFacelets: toFacelets(startState),
    solveUser, targetState, goal,
    targetPredicate: (s) => statesEqual(s, targetState) || (goal ? goalReached(goal, s) : false),
  };
}

// Verifies an algorithm (or a user-supplied variant) solves an entry's case.
export function algorithmSolvesCase(entry, alg, { allowPreAuf = true } = {}) {
  const setup = stateFromAlg(translateAlg(invertAlg(entry.alg), FRAME));
  const pres = allowPreAuf ? [0, 1, 2, 3] : [0];
  for (const k of pres) {
    const s = applyAlg(setup, translateAlg([...aufMoves(k), ...parseAlg(alg)], FRAME));
    if (entry.goal && goalReached(entry.goal, s)) return true;
  }
  return false;
}

// ---- recognition quiz ----
export function caseRecognitionQuiz(entries = ALGORITHMS, rnd = Math.random, { count = 4 } = {}) {
  const pool = entries.filter((e) => e.alg && e.goal && e.kind !== 'trigger');
  if (!pool.length) throw new Error('No quiz entries');
  const correct = pick(pool, rnd);
  const setup = createCaseSetup(correct, { randomAuf: true, rnd });
  const sameCat = pool.filter((e) => e.id !== correct.id && e.category === correct.category);
  const others = pool.filter((e) => e.id !== correct.id && e.category !== correct.category);
  const distractors = [];
  for (const list of [sameCat, others]) {
    const copy = list.slice();
    while (copy.length && distractors.length < count - 1) distractors.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  }
  const options = [correct, ...distractors].map((e) => ({ id: e.id, name: e.name, alg: e.alg }));
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return {
    state: setup.startState, facelets: setup.startFacelets, category: correct.category,
    maskType: correct.caseMask?.type, options, correctId: correct.id,
  };
}

// ---- live execution tracking ----
// Follows received device moves against the expected algorithm. A half turn
// may be done as two quarter turns either way. Any deviation is reported
// with the moves that undo it; if `startState` and `goal` are given, reaching
// the goal by a different valid sequence also counts as done.
export function matchExecution(expectedUser, receivedModel, frameId = FRAME, { startState = null, goal = null, targetState = null } = {}) {
  const expected = parseAlg(expectedUser);
  const received = translateAlg(receivedModel, frameId).flatMap((m) => (m.endsWith('2') ? [m[0], m[0]] : [m]));
  let index = 0;
  let half = null;
  let deviation = [];
  for (const q of received) {
    if (deviation.length) {
      deviation = simplifyAlg([...deviation, q]);
      continue;
    }
    const exp = expected[index];
    if (!exp) { deviation = [q]; continue; }
    if (exp.endsWith('2')) {
      if (!half && q[0] === exp[0]) { half = q; continue; }
      if (half && q === half) { half = null; index++; continue; }
      deviation = simplifyAlg(half ? [half, q] : [q]);
      half = null;
      continue;
    }
    if (q === exp) index++;
    else deviation = [q];
  }
  let done = index >= expected.length && !deviation.length && !half;
  let viaState = false;
  if (startState && (goal || targetState)) {
    const s = applyAlg(startState, receivedModel);
    if ((targetState && statesEqual(s, targetState)) || (goal && goalReached(goal, s))) {
      viaState = !done;
      done = true;
    }
  }
  return {
    done, viaState, index, total: expected.length,
    deviated: !done && deviation.length > 0, deviation,
    correction: invertAlg(deviation),
    halfPending: !!half,
    nextMove: done ? null : expected[index] || null,
  };
}

export { solvedState };
