// Kociemba two-phase solver (cubejs) off the main thread. Used for random-state
// scrambles, paths between two states and the short computational solution.
// It is never presented as the beginner method.
import Cube from 'cubejs';
import { inverseState, invertAlg, multiply, parseAlg, simplifyAlg, toFacelets } from '../core/cube.mjs';

let ready = false;
function init() {
  if (!ready) {
    Cube.initSolver();
    ready = true;
  }
}

function solveState(state) {
  const text = Cube.fromString(toFacelets(state)).solve();
  return text ? parseAlg(text) : [];
}

const handlers = {
  init() { init(); return true; },
  scramble() {
    init();
    return simplifyAlg(Cube.scramble()).join(' ');
  },
  // Moves m with from ∘ m = to.
  path({ from, to }) {
    init();
    return invertAlg(solveState(multiply(inverseState(from), to)));
  },
  solve({ state }) {
    init();
    return solveState(state);
  },
};

self.onmessage = (e) => {
  const { id, type, args } = e.data;
  try {
    self.postMessage({ id, ok: true, value: handlers[type](args || {}) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};
