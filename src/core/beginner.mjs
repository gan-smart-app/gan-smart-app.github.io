// Deterministic layer-by-layer (beginner method) teaching planner.
// The learner holds yellow up and green front (yellowUp frame); the white
// cross is built at the bottom. Every step is computed from the real state,
// so a learner who takes a different valid path is simply re-planned.

import { applyAlg, isValidState, parseAlg, simplifyAlg, solvedState, translateAlg } from './cube.mjs';
import { edgeDistance, edgeSolution } from './edgeTables.mjs';
import {
  crossSolved, firstLayerSolved, f2lSolved, llEdgesOriented, llEdgesSolved, llCornersPlaced, isSolvedState,
  stageOf as stageCount, WHITE_EDGES, WHITE_CORNERS, MIDDLE_EDGES, LL_CORNERS,
} from './stages.mjs';

const FRAME = 'yellowUp';
const toModel = (alg) => translateAlg(alg, FRAME);
const toUser = (alg) => translateAlg(alg, FRAME); // the z2 map is its own inverse

export const STAGES = [
  { stage: 1, title: 'کراس سفید', goal: 'چهار لبهٔ سفید در پایین، هم‌رنگ با مرکزهای کناری.' },
  { stage: 2, title: 'گوشه‌های لایهٔ اول', goal: 'چهار گوشهٔ سفید سر جایشان؛ لایهٔ پایین کامل.' },
  { stage: 3, title: 'لبه‌های لایهٔ دوم', goal: 'چهار لبهٔ لایهٔ میانی سر جایشان.' },
  { stage: 4, title: 'صلیب زرد', goal: 'چهار لبهٔ زرد رو به بالا.' },
  { stage: 5, title: 'لبه‌های زرد', goal: 'لبه‌های زرد هم‌رنگ با مرکزهای کناری.' },
  { stage: 6, title: 'جای گوشه‌های زرد', goal: 'هر گوشهٔ زرد در جای درست، حتی اگر چرخیده باشد.' },
  { stage: 7, title: 'جهت گوشه‌های زرد', goal: 'گوشه‌ها را بچرخان تا مکعب حل شود.' },
];

export const stageOf = stageCount;

const COLORS = { U: 'سفید', D: 'زرد', F: 'سبز', B: 'آبی', R: 'قرمز', L: 'نارنجی' };
const EDGE_FACES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];
const CORNER_FACES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
const colorName = (faces) => [...faces].map((f) => COLORS[f]).join('-');
const faNum = (n) => n.toLocaleString('fa-IR');

// Whole-cube y turn as a relabelling of user-frame faces (the new front is the old right).
const Y = { F: 'R', R: 'B', B: 'L', L: 'F', U: 'U', D: 'D' };
function yConj(alg, k) {
  let moves = parseAlg(alg);
  for (let i = 0; i < k; i++) moves = moves.map((m) => Y[m[0]] + m.slice(1));
  return moves;
}

const D_TURNS = [[], ['D'], ['D2'], ["D'"]]; // user top-layer turns, in model notation
const run = (s, moves) => applyAlg(s, moves);
const homeEdge = (s, e) => s.ep[e] === e && s.eo[e] === 0;
const homeCorner = (s, c) => s.cp[c] === c && s.co[c] === 0;

function step(stage, title, explanation, model, before, extra = {}) {
  const movesModel = simplifyAlg(model);
  return {
    stage, title, explanation, movesModel, movesUser: toUser(movesModel), stateAfter: run(before, movesModel), ...extra,
  };
}

// ---- 1: cross, edge by edge ----
function planCross(state) {
  const steps = [];
  let s = state;
  let placed = WHITE_EDGES.filter((e) => homeEdge(s, e));
  while (placed.length < 4) {
    let best = null;
    for (const e of WHITE_EDGES) {
      if (placed.includes(e)) continue;
      const d = edgeDistance(s, [...placed, e]);
      if (!best || d < best.d) best = { e, d };
    }
    const moves = edgeSolution(s, [...placed, best.e]);
    const name = colorName(EDGE_FACES[best.e]);
    steps.push(step(1, `لبهٔ ${name}`, `لبهٔ ${name} را پایین، زیر مرکز ${COLORS[EDGE_FACES[best.e][1]]} بنشان؛ لبه‌های قبلی سر جایشان می‌مانند.`, moves, s));
    s = steps.at(-1).stateAfter;
    placed = WHITE_EDGES.filter((e) => homeEdge(s, e));
  }
  return steps;
}

// ---- 2: first-layer corners with the repeated trigger ----
// Moves are given for the current hold (yellow up, green front). A trigger on
// another slot is the familiar R U R' U' seen with that slot's face in front.
const USER_COLORS = { U: 'زرد', D: 'سفید', F: 'سبز', B: 'آبی', R: 'نارنجی', L: 'قرمز' };
const frontOf = (k) => yConj('F', k)[0];
const viewNote = (k, base) => (k ? ` (همان ${base} وقتی وجه ${USER_COLORS[frontOf(k)]} روبه‌روی توست)` : '');

const TRIGGER_FOR = {}; // model white-corner position -> { k, moves } touching that slot
for (let k = 0; k < 4; k++) {
  const moves = toModel(yConj("R U R' U'", k));
  const s = run(solvedState(), moves);
  TRIGGER_FOR[WHITE_CORNERS.find((p) => !homeCorner(s, p))] = { k, moves };
}
const ABOVE = { 0: 4, 1: 5, 2: 6, 3: 7 }; // model U corner -> model D corner above it for the user

function cornerPlan(s, c) {
  const plan = [];
  let t = s;
  const pos = t.cp.indexOf(c);
  if (pos < 4) {
    plan.push({ kind: 'pop', moves: TRIGGER_FOR[pos].moves, k: TRIGGER_FOR[pos].k });
    t = run(t, TRIGGER_FOR[pos].moves);
  }
  const k = [0, 1, 2, 3].find((n) => run(t, D_TURNS[n]).cp.indexOf(c) === ABOVE[c]);
  t = run(t, D_TURNS[k]);
  let reps = 0;
  while (!homeCorner(t, c) && reps < 6) {
    t = run(t, TRIGGER_FOR[c].moves);
    reps++;
  }
  if (!homeCorner(t, c)) throw new Error('corner insertion failed');
  plan.push({ kind: 'insert', turn: D_TURNS[k], reps, k: TRIGGER_FOR[c].k, moves: [...D_TURNS[k], ...Array(reps).fill(TRIGGER_FOR[c].moves).flat()] });
  return { plan, length: plan.reduce((n, p) => n + p.moves.length, 0), after: t };
}

function planCorners(state) {
  const steps = [];
  let s = state;
  for (;;) {
    const todo = WHITE_CORNERS.filter((c) => !homeCorner(s, c));
    if (!todo.length) break;
    let best = null;
    for (const c of todo) {
      const p = cornerPlan(s, c);
      if (!best || p.length < best.length) best = { ...p, c };
    }
    const name = colorName(CORNER_FACES[best.c]);
    for (const part of best.plan) {
      const trigger = yConj("R U R' U'", part.k).join(' ');
      const note = viewNote(part.k, "R U R' U'");
      if (part.kind === 'pop') {
        steps.push(step(2, `بیرون آوردن گوشهٔ ${name}`, `این گوشه پایین است ولی جایش درست نیست. یک بار ${trigger}${note} آن را به لایهٔ بالا می‌آورد.`, part.moves, s));
      } else {
        const turn = part.turn.length ? 'لایهٔ بالا را بچرخان تا گوشه بالای جایش بیاید، سپس ' : '';
        steps.push(step(2, `گوشهٔ ${name}`, `${turn}${trigger}${note} را ${faNum(part.reps)} بار تکرار کن تا سفید پایین بنشیند.`, part.moves, s, { repeat: part.reps, trigger }));
      }
      s = steps.at(-1).stateAfter;
    }
  }
  return steps;
}

// ---- 3: middle-layer edges ----
const EDGE_INSERTS = [0, 1, 2, 3].flatMap((k) => [
  { side: 'right', k, moves: toModel(yConj("U R U' R' U' F' U F", k)), base: "U R U' R' U' F' U F" },
  { side: 'left', k, moves: toModel(yConj("U' L' U L U F U' F'", k)), base: "U' L' U L U F U' F'" },
]);
const keepsMiddle = (s, done) => firstLayerSolved(s) && done.every((e) => homeEdge(s, e));

function planMiddle(state) {
  const steps = [];
  let s = state;
  for (let guard = 0; guard < 12; guard++) {
    const done = MIDDLE_EDGES.filter((e) => homeEdge(s, e));
    if (done.length === 4) break;
    let best = null;
    for (const e of MIDDLE_EDGES) {
      if (done.includes(e)) continue;
      for (let k = 0; k < 4; k++) {
        for (const ins of EDGE_INSERTS) {
          const moves = [...D_TURNS[k], ...ins.moves];
          const t = run(s, moves);
          if (homeEdge(t, e) && keepsMiddle(t, done) && (!best || moves.length < best.moves.length)) best = { e, moves, ins };
        }
      }
    }
    if (best) {
      const name = colorName(EDGE_FACES[best.e]);
      const front = USER_COLORS[frontOf(best.ins.k)];
      steps.push(step(3, `لبهٔ ${name}`, `لایهٔ بالا را بچرخان تا رنگ کنار لبه با مرکز ${front} جور شود، سپس درج به ${best.ins.side === 'right' ? 'راست' : 'چپ'} را اجرا کن${viewNote(best.ins.k, best.ins.base)}.`, best.moves, s));
    } else {
      // Every missing edge is stuck in the middle layer: take one out.
      const slot = MIDDLE_EDGES.find((p) => !done.includes(p));
      const ins = EDGE_INSERTS.find((i) => {
        const t = run(s, i.moves);
        return keepsMiddle(t, done) && t.ep.indexOf(s.ep[slot]) >= 4 && t.ep.indexOf(s.ep[slot]) < 8;
      });
      steps.push(step(3, 'بیرون آوردن لبهٔ گیرکرده', 'یک لبهٔ لایهٔ میانی جای اشتباه یا برعکس است. با یک بار الگوریتم درج، آن را به لایهٔ بالا بیاور.', ins.moves, s));
    }
    s = steps.at(-1).stateAfter;
  }
  if (!f2lSolved(s)) throw new Error('middle layer failed');
  return steps;
}

// ---- 4..6: last layer by short macro searches ----
function macroSearch(s, macros, goal, keep, maxDepth) {
  let frontier = [{ state: s, path: [] }];
  for (let depth = 0; depth <= maxDepth; depth++) {
    const hits = frontier.filter((n) => goal(n.state));
    if (hits.length) {
      hits.sort((a, b) => a.path.flat().length - b.path.flat().length);
      return hits[0].path;
    }
    const next = [];
    for (const n of frontier) {
      for (const m of macros) {
        const t = run(n.state, m.moves);
        if (keep(t)) next.push({ state: t, path: [...n.path, m] });
      }
    }
    frontier = next;
  }
  throw new Error('macro search failed');
}

const OLL_CROSS = toModel("F R U R' U' F'");
function planYellowCross(state) {
  const macros = D_TURNS.map((d, k) => ({ k, moves: [...d, ...OLL_CROSS] }));
  const path = macroSearch(state, macros, llEdgesOriented, f2lSolved, 3);
  const steps = [];
  let s = state;
  const shape = (t) => [4, 5, 6, 7].filter((p) => t.eo[p] === 0).length;
  for (const m of path) {
    const n = shape(s);
    const what = n === 0 ? 'هیچ لبهٔ زردی بالا نیست (نقطه)' : n === 2 ? 'دو لبهٔ زرد بالاست (L یا خط)' : 'شکل زرد';
    steps.push(step(4, 'صلیب زرد', `${what}. ${m.k ? 'لایهٔ بالا را بچرخان تا شکل درست قرار بگیرد، سپس ' : ''}F R U R' U' F' را اجرا کن.`, m.moves, s));
    s = steps.at(-1).stateAfter;
  }
  return steps;
}

const EDGE_SWAP = toModel("R U R' U R U2 R'");
function planYellowEdges(state) {
  const macros = [...D_TURNS.map((d, k) => ({ k, moves: [...d, ...EDGE_SWAP] })), ...D_TURNS.slice(1).map((d, k) => ({ k: k + 1, auf: true, moves: d }))];
  const path = macroSearch(state, macros, (t) => f2lSolved(t) && llEdgesSolved(t), (t) => f2lSolved(t) && llEdgesOriented(t), 4);
  const steps = [];
  let s = state;
  for (const m of path) {
    const text = m.auf
      ? 'لایهٔ بالا را بچرخان تا همهٔ لبه‌های زرد با مرکزهای کناری هم‌رنگ شوند.'
      : `${m.k ? 'لایهٔ بالا را بچرخان تا دو لبهٔ درست پشت و راست باشند، سپس ' : ''}R U R' U R U2 R' را اجرا کن تا لبه‌های جلو و چپ جابه‌جا شوند.`;
    steps.push(step(5, 'لبه‌های زرد', text, m.moves, s));
    s = steps.at(-1).stateAfter;
  }
  return steps;
}

const CORNER_CYCLES = [0, 1, 2, 3].map((k) => ({ k, moves: toModel(yConj("U R U' L' U R' U' L", k)) }));
function planCornerPlaces(state) {
  const keep = (t) => f2lSolved(t) && llEdgesSolved(t);
  const path = macroSearch(state, CORNER_CYCLES, (t) => keep(t) && llCornersPlaced(t), keep, 3);
  const steps = [];
  let s = state;
  for (const m of path) {
    steps.push(step(6, 'جای گوشه‌های زرد', `این الگوریتم سه گوشهٔ زرد را جابه‌جا می‌کند و گوشهٔ جلو-راستِ وجه ${USER_COLORS[frontOf(m.k)]} را ثابت نگه می‌دارد${viewNote(m.k, "U R U' L' U R' U' L")}. اگر هنوز همهٔ گوشه‌ها جای درست نیستند، یک بار دیگر لازم است.`, m.moves, s, { holdTurns: m.k }));
    s = steps.at(-1).stateAfter;
  }
  return steps;
}

// ---- 7: twist corners at the user's front-right-top (model DLF) ----
const TWIST = toModel("R' D' R D");
const WORK = 5;
function planCornerTwists(state) {
  const steps = [];
  let s = state;
  for (let guard = 0; guard < 4; guard++) {
    const bad = LL_CORNERS.filter((p) => s.co[p] !== 0);
    if (!bad.length) break;
    const k = [0, 1, 2, 3].find((n) => run(s, D_TURNS[n]).co[WORK] !== 0);
    let t = run(s, D_TURNS[k]);
    let reps = 0;
    // Pairs of triggers keep the same corner in place; one trigger alone would swap it out.
    while (t.co[WORK] !== 0) { t = run(run(t, TWIST), TWIST); reps += 2; }
    const moves = [...D_TURNS[k], ...Array(reps).fill(TWIST).flat()];
    steps.push(step(7, 'چرخاندن گوشهٔ زرد', `${k ? 'فقط لایهٔ بالا را بچرخان تا یک گوشهٔ نادرست جلو-راست بالا بیاید، سپس ' : ''}R' D' R D را ${faNum(reps)} بار تکرار کن تا زرد رو به بالا شود. لایه‌های پایین موقتاً به‌هم می‌ریزند؛ نگران نباش.`, moves, s, { repeat: reps, transient: true }));
    s = steps.at(-1).stateAfter;
  }
  const k = [0, 1, 2, 3].find((n) => isSolvedState(run(s, D_TURNS[n])));
  if (k === undefined) throw new Error('corner twist failed');
  if (k) {
    steps.push(step(7, 'هم‌ترازی آخر', 'لایهٔ بالا را بچرخان تا مکعب کامل حل شود.', D_TURNS[k], s));
  }
  if (steps.length) steps.at(-1).transient = false;
  return steps;
}

const PLANNERS = [planCross, planCorners, planMiddle, planYellowCross, planYellowEdges, planCornerPlaces, planCornerTwists];

// Full plan from any valid state. Steps carry user-frame and model moves and the state after each step.
export function planBeginner(state) {
  if (!isValidState(state)) throw new Error('وضعیت مکعب معتبر نیست.');
  const steps = [];
  let s = state;
  for (let i = stageCount(s); i < PLANNERS.length; i++) {
    const part = PLANNERS[i](s);
    steps.push(...part);
    if (part.length) s = part.at(-1).stateAfter;
  }
  return steps;
}

// Re-plan after the learner reached `state` by any path (a different valid path is fine).
export function replanFrom(state) {
  return { stage: stageCount(state), steps: planBeginner(state) };
}

// The next step only, with the stage the learner is in.
export function nextStep(state) {
  const steps = planBeginner(state);
  return { stage: stageCount(state), step: steps[0] || null, remaining: steps.length };
}

export { crossSolved, firstLayerSolved, f2lSolved };
