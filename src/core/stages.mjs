// Stage predicates in the device (model) frame. The model's U centre is
// white; learners hold yellow up (yellowUp frame), so the white layer is
// the model U layer and the last layer is the model D layer.
//
// Model cubies: corners URF UFL ULB UBR DFR DLF DBL DRB (0..7),
// edges UR UF UL UB DR DF DL DB FR FL BL BR (0..11).

import { applyMove } from './cube.mjs';

export const WHITE_EDGES = [0, 1, 2, 3];
export const WHITE_CORNERS = [0, 1, 2, 3];
export const MIDDLE_EDGES = [8, 9, 10, 11];
export const LL_EDGES = [4, 5, 6, 7];
export const LL_CORNERS = [4, 5, 6, 7];

const edgeHome = (s, i) => s.ep[i] === i && s.eo[i] === 0;
const cornerHome = (s, i) => s.cp[i] === i && s.co[i] === 0;

export const crossSolved = (s) => WHITE_EDGES.every((i) => edgeHome(s, i));
export const firstLayerSolved = (s) => crossSolved(s) && WHITE_CORNERS.every((i) => cornerHome(s, i));
export const f2lSolved = (s) => firstLayerSolved(s) && MIDDLE_EDGES.every((i) => edgeHome(s, i));
export const llEdgesOriented = (s) => LL_EDGES.every((i) => s.eo[i] === 0);
export const llCornersOriented = (s) => LL_CORNERS.every((i) => s.co[i] === 0);
export const llOriented = (s) => llEdgesOriented(s) && llCornersOriented(s);
export const llEdgesSolved = (s) => LL_EDGES.every((i) => edgeHome(s, i));
export const llCornersPlaced = (s) => LL_CORNERS.every((i) => s.cp[i] === i);
export const isSolvedState = (s) => f2lSolved(s) && llEdgesSolved(s) && LL_CORNERS.every((i) => cornerHome(s, i));

// A user-frame F2L slot is a (model) white corner plus a middle edge.
// User FR = model UFL corner + FL edge, FL = URF + FR, BR = ULB + BL, BL = UBR + BR.
export const SLOTS = {
  FR: { corner: 1, edge: 9 },
  FL: { corner: 0, edge: 8 },
  BR: { corner: 2, edge: 10 },
  BL: { corner: 3, edge: 11 },
};
export const slotSolved = (s, slot) => cornerHome(s, SLOTS[slot].corner) && edgeHome(s, SLOTS[slot].edge);

// Number of user top-layer turns (model D) after which the cube is solved, or -1.
export function aufToSolve(s) {
  let t = s;
  for (let k = 0; k < 4; k++) {
    if (isSolvedState(t)) return k;
    t = applyMove(t, 'D');
  }
  return -1;
}
export const solvedUpToAuf = (s) => aufToSolve(s) >= 0;

export const STAGE_CHECKS = [
  crossSolved,
  firstLayerSolved,
  f2lSolved,
  (s) => f2lSolved(s) && llEdgesOriented(s),
  (s) => f2lSolved(s) && llEdgesSolved(s),
  (s) => f2lSolved(s) && llEdgesSolved(s) && llCornersPlaced(s),
  isSolvedState,
];

// Consecutive beginner stages already complete (0..7).
export function stageOf(s) {
  let n = 0;
  while (n < STAGE_CHECKS.length && STAGE_CHECKS[n](s)) n++;
  return n;
}

export const GOALS = {
  cross: crossSolved,
  firstLayer: firstLayerSolved,
  f2l: f2lSolved,
  llEdgesOriented: (s) => f2lSolved(s) && llEdgesOriented(s),
  oll: (s) => f2lSolved(s) && llOriented(s),
  llEdges: (s) => f2lSolved(s) && llEdgesSolved(s),
  cornersPlaced: (s) => f2lSolved(s) && llEdgesSolved(s) && llCornersPlaced(s),
  pll: solvedUpToAuf,
  solved: isSolvedState,
};

// What a case setup must leave intact ('otherSlots' = cross and every slot but `slot`).
export function keepHolds(keep, s, slot = 'FR') {
  if (!keep) return true;
  if (keep === 'otherSlots') return crossSolved(s) && Object.keys(SLOTS).every((k) => k === slot || slotSolved(s, k));
  if (keep === 'oll') return f2lSolved(s) && llOriented(s);
  return goalReached(keep, s);
}

export function goalReached(goal, s) {
  const check = GOALS[goal];
  if (!check) throw new Error('Unknown goal: ' + goal);
  return check(s);
}
