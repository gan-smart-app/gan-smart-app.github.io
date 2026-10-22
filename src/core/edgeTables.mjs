// Exact distance tables for a subset of edge pieces (positions + flips),
// built by breadth-first search over the 18 face turns. Used for optimal
// cross solutions and for the edge-by-edge beginner cross.

import { applyMove, MOVE_NAMES, solvedState } from './cube.mjs';

// EDGE_MOVE[m][p*2+o] = new p*2+o of the edge sitting at position p with flip o.
const EDGE_MOVE = MOVE_NAMES.map((m) => {
  const M = applyMove(solvedState(), m);
  const t = new Int8Array(24);
  for (let i = 0; i < 12; i++) {
    const p = M.ep[i];
    for (let o = 0; o < 2; o++) t[p * 2 + o] = i * 2 + ((o + M.eo[i]) % 2);
  }
  return t;
});

const tables = new Map();

function encode(codes) {
  let idx = 0;
  for (let k = codes.length - 1; k >= 0; k--) idx = idx * 24 + codes[k];
  return idx;
}

function pieceCodes(state, pieces) {
  return pieces.map((piece) => {
    const p = state.ep.indexOf(piece);
    return p * 2 + state.eo[p];
  });
}

function tableFor(pieces) {
  const key = pieces.join(',');
  if (tables.has(key)) return tables.get(key);
  const n = pieces.length;
  const size = 24 ** n;
  const dist = new Int8Array(size).fill(-1);
  const start = encode(pieces.map((piece) => piece * 2));
  dist[start] = 0;
  let frontier = new Int32Array([start]);
  const codes = new Array(n);
  for (let d = 0; frontier.length; d++) {
    const next = [];
    for (const idx of frontier) {
      let v = idx;
      for (let k = 0; k < n; k++) { codes[k] = v % 24; v = (v - codes[k]) / 24; }
      for (let m = 0; m < 18; m++) {
        const t = EDGE_MOVE[m];
        let j = 0;
        for (let k = n - 1; k >= 0; k--) j = j * 24 + t[codes[k]];
        if (dist[j] < 0) { dist[j] = d + 1; next.push(j); }
      }
    }
    frontier = next;
  }
  tables.set(key, dist);
  return dist;
}

// Optimal number of moves to bring every listed edge home.
export function edgeDistance(state, pieces) {
  const sorted = [...pieces].sort((a, b) => a - b);
  return tableFor(sorted)[encode(pieceCodes(state, sorted))];
}

// One optimal move sequence (deterministic: lowest move index first).
export function edgeSolution(state, pieces) {
  const sorted = [...pieces].sort((a, b) => a - b);
  const dist = tableFor(sorted);
  let codes = pieceCodes(state, sorted);
  let d = dist[encode(codes)];
  const moves = [];
  while (d > 0) {
    for (let m = 0; m < 18; m++) {
      const next = codes.map((c) => EDGE_MOVE[m][c]);
      if (dist[encode(next)] === d - 1) {
        moves.push(MOVE_NAMES[m]);
        codes = next;
        d--;
        break;
      }
    }
  }
  return moves;
}
