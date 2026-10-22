import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  applyAlg, fromFacelets, invertAlg, isSolved, MOVE_NAMES, simplifyAlg, solvedState,
  stateFromAlg, statesEqual, toFacelets, translateAlg, SOLVED_FACELETS, multiply, inverseState,
} from '../src/core/cube.mjs';

const Cube = createRequire(import.meta.url)('cubejs');

function randomAlg(n, rnd) {
  return Array.from({ length: n }, () => MOVE_NAMES[Math.floor(rnd() * 18)]).join(' ');
}
function rng(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test('engine matches cubejs facelets for 300 random sequences', () => {
  const rnd = rng(7);
  for (let i = 0; i < 300; i++) {
    const alg = randomAlg(1 + (i % 30), rnd);
    const ours = toFacelets(stateFromAlg(alg));
    const theirs = new Cube().move(alg).asString();
    assert.equal(ours, theirs, alg);
    assert.ok(statesEqual(fromFacelets(ours), stateFromAlg(alg)));
  }
});

test('solved and inverse', () => {
  assert.equal(toFacelets(solvedState()), SOLVED_FACELETS);
  const rnd = rng(11);
  for (let i = 0; i < 50; i++) {
    const alg = randomAlg(20, rnd);
    assert.ok(isSolved(applyAlg(stateFromAlg(alg), invertAlg(alg))));
    const s = stateFromAlg(alg);
    assert.ok(isSolved(multiply(s, inverseState(s))));
  }
});

test('invalid facelets rejected', () => {
  const twisted = toFacelets(solvedState()).split('');
  [twisted[8], twisted[9], twisted[20]] = [twisted[9], twisted[20], twisted[8]];
  assert.equal(fromFacelets(twisted.join('')), null);
  assert.equal(fromFacelets('U'.repeat(54)), null);
  const swapped = SOLVED_FACELETS.split('');
  [swapped[5], swapped[10]] = [swapped[10], swapped[5]];
  assert.equal(fromFacelets(swapped.join('')), null);
});

test('simplify cancels and merges', () => {
  assert.deepEqual(simplifyAlg("R R'"), []);
  assert.deepEqual(simplifyAlg('U U'), ['U2']);
  assert.deepEqual(simplifyAlg("U D U'"), ['D']);
  assert.deepEqual(simplifyAlg("R U U' R'"), []);
});

test('yellow-up translation is a whole-cube z2', () => {
  // Same physical algorithm in both frames gives the same state up to the frame,
  // so applying translated + inverse translated returns to solved.
  const alg = "R U R' U' F2";
  const model = translateAlg(alg, 'yellowUp');
  assert.deepEqual(model, ['L', 'D', "L'", "D'", 'F2']);
  assert.ok(isSolved(applyAlg(stateFromAlg(model), translateAlg(invertAlg(alg), 'yellowUp'))));
});
