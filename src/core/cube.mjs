// Cube engine: cubie-level state, notation, inversion, simplification and
// facelet conversion. Conventions (URFDLB faces, corner/edge numbering,
// multiplication order) follow cubejs, which the v15 connection also uses,
// so states coming from the device and states built here are comparable.

export const FACES = 'URFDLB';
export const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

// Basic quarter turns U R F D L B as cubie permutations (identical to cubejs Cube.moves).
const BASIC = [
  { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] },
  { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] },
];

export function solvedState() {
  return { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
}

export function cloneState(s) {
  return { cp: s.cp.slice(), co: s.co.slice(), ep: s.ep.slice(), eo: s.eo.slice() };
}

// a ∘ b: apply a, then b (same as cubejs a.multiply(b)).
export function multiply(a, b) {
  const r = { cp: new Array(8), co: new Array(8), ep: new Array(12), eo: new Array(12) };
  for (let i = 0; i < 8; i++) {
    r.cp[i] = a.cp[b.cp[i]];
    r.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3;
  }
  for (let i = 0; i < 12; i++) {
    r.ep[i] = a.ep[b.ep[i]];
    r.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2;
  }
  return r;
}

export function inverseState(s) {
  const r = { cp: new Array(8), co: new Array(8), ep: new Array(12), eo: new Array(12) };
  for (let i = 0; i < 8; i++) {
    r.cp[s.cp[i]] = i;
  }
  for (let i = 0; i < 8; i++) r.co[i] = (3 - s.co[r.cp[i]]) % 3;
  for (let i = 0; i < 12; i++) r.ep[s.ep[i]] = i;
  for (let i = 0; i < 12; i++) r.eo[i] = s.eo[r.ep[i]];
  return r;
}

// 18 move states: index = face*3 + power (0: quarter, 1: half, 2: inverse).
export const MOVE_NAMES = [];
const MOVE_STATES = [];
for (let f = 0; f < 6; f++) {
  let s = solvedState();
  for (let p = 0; p < 3; p++) {
    s = multiply(s, BASIC[f]);
    MOVE_NAMES.push(FACES[f] + ['', '2', "'"][p]);
    MOVE_STATES.push(s);
  }
}

export function moveIndex(name) {
  const i = MOVE_NAMES.indexOf(normalizeToken(name));
  if (i < 0) throw new Error('حرکت نامعتبر: ' + name);
  return i;
}

function normalizeToken(t) {
  return t.replace(/’|′/g, "'").replace("2'", '2');
}

// Parses "R U R' U2" into canonical face-turn tokens. Wide moves, slices and
// rotations are not part of the device model and are rejected explicitly.
export function parseAlg(text) {
  if (Array.isArray(text)) return text.map(normalizeToken);
  const tokens = String(text || '').replace(/[()[\]]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return tokens.map((t) => {
    const n = normalizeToken(t);
    if (!MOVE_NAMES.includes(n)) throw new Error('حرکت پشتیبانی‌نشده: ' + t);
    return n;
  });
}

export function formatAlg(moves) {
  return moves.join(' ');
}

export function applyMove(state, move) {
  return multiply(state, MOVE_STATES[typeof move === 'number' ? move : moveIndex(move)]);
}

export function applyAlg(state, alg) {
  let s = state;
  for (const m of parseAlg(alg)) s = applyMove(s, m);
  return s;
}

export function stateFromAlg(alg) {
  return applyAlg(solvedState(), alg);
}

export function invertMove(m) {
  const f = m[0];
  if (m.endsWith('2')) return m;
  return m.endsWith("'") ? f : f + "'";
}

export function invertAlg(alg) {
  return parseAlg(alg).reverse().map(invertMove);
}

const OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };
const amount = (m) => (m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1);
const fromAmount = (f, a) => [null, f, f + '2', f + "'"][a % 4];

// Cancels and merges adjacent turns of the same face, also across a turn of
// the opposite face (U D U' → D).
export function simplifyAlg(alg) {
  const out = [];
  for (const m of parseAlg(alg)) {
    const f = m[0];
    let merged = false;
    for (let k = out.length - 1; k >= 0 && k >= out.length - 2; k--) {
      const g = out[k][0];
      if (g === f) {
        const a = (amount(out[k]) + amount(m)) % 4;
        if (a === 0) out.splice(k, 1);
        else out[k] = fromAmount(f, a);
        merged = true;
        break;
      }
      if (g !== OPPOSITE[f]) break;
    }
    if (!merged) out.push(m);
  }
  return out;
}

// Quarter-turn expansion used for step tracking: U2 can be performed as U U or U' U'.
export function quarterTurns(move) {
  return move.endsWith('2') ? [move[0], move[0]] : [move];
}

export function statesEqual(a, b) {
  for (let i = 0; i < 8; i++) if (a.cp[i] !== b.cp[i] || a.co[i] !== b.co[i]) return false;
  for (let i = 0; i < 12; i++) if (a.ep[i] !== b.ep[i] || a.eo[i] !== b.eo[i]) return false;
  return true;
}

export function isSolved(s) {
  return statesEqual(s, solvedState());
}

export function stateKey(s) {
  return s.cp.join('') + s.co.join('') + s.ep.map((e) => e.toString(16)).join('') + s.eo.join('');
}

// ---- Facelets (cubejs layout) ----
const CORNER_FACELET = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
const EDGE_FACELET = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];
const CORNER_COLOR = [
  ['U', 'R', 'F'], ['U', 'F', 'L'], ['U', 'L', 'B'], ['U', 'B', 'R'],
  ['D', 'F', 'R'], ['D', 'L', 'F'], ['D', 'B', 'L'], ['D', 'R', 'B'],
];
const EDGE_COLOR = [
  ['U', 'R'], ['U', 'F'], ['U', 'L'], ['U', 'B'], ['D', 'R'], ['D', 'F'],
  ['D', 'L'], ['D', 'B'], ['F', 'R'], ['F', 'L'], ['B', 'L'], ['B', 'R'],
];

export function toFacelets(s) {
  const out = SOLVED_FACELETS.split('');
  for (let i = 0; i < 8; i++) {
    const c = s.cp[i], o = s.co[i];
    for (let n = 0; n < 3; n++) out[CORNER_FACELET[i][(n + o) % 3]] = CORNER_COLOR[c][n];
  }
  for (let i = 0; i < 12; i++) {
    const e = s.ep[i], o = s.eo[i];
    for (let n = 0; n < 2; n++) out[EDGE_FACELET[i][(n + o) % 2]] = EDGE_COLOR[e][n];
  }
  return out.join('');
}

// Converts a 54-letter facelet string to cubie state. Returns null for any
// string that is not a physically reachable cube (wrong counts, unknown
// pieces, twisted corner, flipped edge or parity mismatch).
export function fromFacelets(str) {
  if (typeof str !== 'string' || str.length !== 54) return null;
  for (const f of FACES) if (str.split(f).length - 1 !== 9) return null;
  for (let i = 0; i < 6; i++) if (str[i * 9 + 4] !== FACES[i]) return null;
  const s = { cp: [], co: [], ep: [], eo: [] };
  for (let i = 0; i < 8; i++) {
    let ori = 0;
    for (; ori < 3; ori++) if (str[CORNER_FACELET[i][ori]] === 'U' || str[CORNER_FACELET[i][ori]] === 'D') break;
    if (ori === 3) return null;
    const c1 = str[CORNER_FACELET[i][(ori + 1) % 3]], c2 = str[CORNER_FACELET[i][(ori + 2) % 3]];
    const j = CORNER_COLOR.findIndex((c) => c1 === c[1] && c2 === c[2]);
    if (j < 0) return null;
    s.cp[i] = j;
    s.co[i] = ori % 3;
  }
  for (let i = 0; i < 12; i++) {
    const a = str[EDGE_FACELET[i][0]], b = str[EDGE_FACELET[i][1]];
    let j = EDGE_COLOR.findIndex((c) => c[0] === a && c[1] === b);
    if (j >= 0) { s.ep[i] = j; s.eo[i] = 0; continue; }
    j = EDGE_COLOR.findIndex((c) => c[0] === b && c[1] === a);
    if (j < 0) return null;
    s.ep[i] = j;
    s.eo[i] = 1;
  }
  return isValidState(s) ? s : null;
}

function parity(p) {
  let n = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) n++;
  return n % 2;
}

export function isValidState(s) {
  if (new Set(s.cp).size !== 8 || new Set(s.ep).size !== 12) return false;
  if (s.cp.some((c) => c < 0 || c > 7) || s.ep.some((e) => e < 0 || e > 11)) return false;
  if (s.co.reduce((a, b) => a + b, 0) % 3 !== 0) return false;
  if (s.eo.reduce((a, b) => a + b, 0) % 2 !== 0) return false;
  return parity(s.cp) === parity(s.ep);
}

// ---- Holding frame ----
// The device model is fixed to its centres: U is always the white centre.
// Turning the whole cube is not seen by the device. Guides that ask the user
// to hold yellow up (z2) translate notation between the two frames.
export const FRAMES = {
  whiteUp: { id: 'whiteUp', label: 'سفید بالا، سبز روبه‌رو', map: { U: 'U', D: 'D', R: 'R', L: 'L', F: 'F', B: 'B' } },
  yellowUp: { id: 'yellowUp', label: 'زرد بالا، سبز روبه‌رو', map: { U: 'D', D: 'U', R: 'L', L: 'R', F: 'F', B: 'B' } },
};

// Converts moves written for the user's holding frame to model moves (and back:
// both frame maps are involutions).
export function translateAlg(alg, frameId) {
  const map = FRAMES[frameId]?.map || FRAMES.whiteUp.map;
  return parseAlg(alg).map((m) => map[m[0]] + m.slice(1));
}
