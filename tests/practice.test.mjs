import test from 'node:test';
import assert from 'node:assert/strict';
import { Practice, PHASES } from '../src/core/practice.mjs';
import { invertAlg, multiply, inverseState, SOLVED_FACELETS, stateFromAlg, toFacelets } from '../src/core/cube.mjs';

const scramble = "R U R' F2 D L' B2";

function make(opts = {}) {
  const results = [];
  let t = 0;
  const p = new Practice({
    now: () => t,
    findPath: async (from, to) => {
      // Test path: undo the known start alg, then apply the scramble.
      return [...invertAlg(opts.startAlg || ''), ...scramble.split(' ')];
    },
    onResult: (r) => results.push(r),
  });
  return { p, results, tick: (ms) => (t += ms), at: () => t };
}

test('guided scramble from solved → ready; preparation moves never start the timer', () => {
  const { p, results, tick, at } = make();
  p.setModel(SOLVED_FACELETS);
  p.startScramble(scramble);
  assert.equal(p.state.phase, PHASES.scrambling);
  for (const m of scramble.split(' ')) { tick(300); p.move(m, at(), 1); }
  assert.equal(p.state.phase, PHASES.ready);
  assert.equal(p.state.startAt, null);
  assert.equal(results.length, 0);
});

test('U2 performed as two quarter turns and deviation corrected', () => {
  const { p } = make();
  p.setModel(SOLVED_FACELETS);
  p.startScramble('U2 R');
  p.move("U'", 0);
  assert.equal(p.state.deviated, false);
  assert.deepEqual(p.state.remaining, ["U'", 'R']);
  p.move('F', 0);
  assert.equal(p.state.deviated, true);
  assert.deepEqual(p.state.remaining, ["F'", "U'", 'R']);
  for (const m of ["F'", "U'", 'R']) p.move(m, 0);
  assert.equal(p.state.phase, PHASES.ready);
});

test('solve: first move starts, solved stops, result carries moves and raw time', () => {
  const { p, results, tick, at } = make();
  p.setModel(SOLVED_FACELETS);
  p.startScramble(scramble);
  for (const m of scramble.split(' ')) p.move(m, at(), 1);
  tick(1000);
  const solution = invertAlg(scramble);
  for (const m of solution) { tick(500); p.move(m, at(), 2); }
  assert.equal(p.state.phase, PHASES.done);
  assert.equal(results.length, 1);
  assert.equal(results[0].rawMs, 500 * (solution.length - 1));
  assert.equal(results[0].moves.length, solution.length);
  assert.equal(results[0].timing, 'host-receipt');
  assert.equal(results[0].startFacelets, toFacelets(stateFromAlg(scramble)));
});

test('link pause during a solve → invalid, no result; resync does not continue it', () => {
  const { p, results, at } = make();
  p.setModel(SOLVED_FACELETS);
  p.startScramble(scramble);
  for (const m of scramble.split(' ')) p.move(m, at(), 1);
  p.move('R', at(), 2);
  assert.equal(p.state.phase, PHASES.solving);
  p.invalidate('paused:link-lost');
  assert.equal(p.state.phase, PHASES.invalid);
  p.setModel(SOLVED_FACELETS);
  p.move('R', at(), 3);
  assert.equal(p.state.phase, PHASES.invalid);
  assert.equal(results.length, 0);
});

test('non-solved start uses computed path', async () => {
  const startAlg = "F R'";
  const { p } = make({ startAlg });
  p.setModel(toFacelets(stateFromAlg(startAlg)));
  await p.startScramble(scramble);
  assert.equal(p.state.phase, PHASES.scrambling);
  for (const m of [...p.state.remaining]) p.move(m, 0);
  assert.equal(p.state.phase, PHASES.ready);
});

test('inspection penalties: +2 within grace, DNF after', () => {
  const { p, tick, at } = make();
  p.settings({ inspectionEnabled: true, inspectionMs: 15000 });
  p.setModel(toFacelets(stateFromAlg(scramble)));
  p.startScramble(scramble);
  assert.equal(p.state.phase, PHASES.ready);
  p.startInspection();
  tick(16000);
  p.move('R', at(), 1);
  assert.equal(p.state.penalty, '+2');
  p.cancel();
  p.setModel(toFacelets(stateFromAlg(scramble)));
  p.startScramble(scramble);
  p.startInspection();
  tick(18000);
  p.move('R', at(), 1);
  assert.equal(p.state.penalty, 'DNF');
});

test('free practice requires a scrambled cube and does not time preparation', () => {
  const { p, results, at } = make();
  p.setModel(SOLVED_FACELETS);
  p.startFree();
  assert.equal(p.armFree(), false);
  p.move('R', at(), 1); p.move('U', at(), 1);
  assert.equal(p.state.phase, PHASES.freePrep);
  assert.equal(p.armFree(), true);
  p.move("U'", at(), 2); p.move("R'", at(), 2);
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, 'free');
});

test('manual stop: physical cube solved but model drifted → timer stops, moves marked incomplete', () => {
  const { p, results, tick, at } = make();
  p.setModel(SOLVED_FACELETS);
  p.startScramble(scramble);
  for (const m of scramble.split(' ')) p.move(m, at(), 1);
  tick(1000);
  p.move('R', at(), 2);
  tick(4000);
  assert.equal(p.stop(at()), true);
  assert.equal(p.state.phase, PHASES.done);
  assert.equal(results.length, 1);
  assert.equal(results[0].rawMs, 4000);
  assert.equal(results[0].stop, 'manual');
  assert.equal(results[0].movesComplete, false);
  assert.equal(p.stop(at()), false);
});

test('solved snapshot during a solve stops the timer even if moves were missed', () => {
  const { p, results, tick, at } = make();
  p.setModel(SOLVED_FACELETS);
  p.startScramble(scramble);
  for (const m of scramble.split(' ')) p.move(m, at(), 1);
  p.move('R', at(), 2);
  tick(2500);
  p.setModel(SOLVED_FACELETS);
  assert.equal(p.state.phase, PHASES.done);
  assert.equal(results[0].rawMs, 2500);
  assert.equal(results[0].stop, 'auto');
  assert.equal(results[0].movesComplete, false);
});

test('sync loss during a fast solve keeps the timer running and follows the next snapshot', () => {
  const { p, results, tick, at } = make();
  p.setModel(SOLVED_FACELETS);
  p.startScramble(scramble);
  for (const m of scramble.split(' ')) p.move(m, at(), 1);
  p.move('R', at(), 2);
  tick(1000);
  p.invalidate('sync-lost');
  assert.equal(p.state.phase, PHASES.solving);
  p.setModel(toFacelets(stateFromAlg(scramble + " R U")));
  assert.equal(p.state.phase, PHASES.solving);
  p.move("U'", at(), 3);
  tick(2000);
  p.invalidate('sync-lost');
  p.setModel(SOLVED_FACELETS);
  assert.equal(p.state.phase, PHASES.done);
  assert.equal(results[0].rawMs, 3000);
  assert.equal(results[0].movesComplete, false);
});
