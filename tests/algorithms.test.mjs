import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlg, invertAlg, isSolved, parseAlg, solvedState, stateFromAlg, translateAlg } from '../src/core/cube.mjs';
import { ALGORITHMS, ALGORITHM_BY_ID } from '../src/data/algorithms.mjs';
import {
  algorithmSolvesCase, caseRecognitionQuiz, createCaseSetup, crossDistance, crossSolution, generateCrossCase,
  goalReached, keepHolds, llPermutation, matchExecution, userBadEdges, userMisplacedEdges, userCorner, userEdge, userYellow, SLOTS,
} from '../src/core/cases.mjs';

const setupOf = (alg) => stateFromAlg(translateAlg(invertAlg(alg), 'yellowUp'));
function rng(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test('ids unique and algorithms use face turns only', () => {
  assert.equal(new Set(ALGORITHMS.map((a) => a.id)).size, ALGORITHMS.length);
  for (const a of ALGORITHMS) {
    if (a.alg) assert.doesNotThrow(() => parseAlg(a.alg), a.id);
    for (const alt of a.alternatives) assert.doesNotThrow(() => parseAlg(alt), a.id);
    for (const p of a.prerequisites) assert.ok(ALGORITHM_BY_ID[p], `${a.id} prerequisite ${p}`);
  }
});

test('triggers return to solved after their order', () => {
  for (const a of ALGORITHMS.filter((x) => x.kind === 'trigger')) {
    const once = stateFromAlg(translateAlg(a.alg, 'yellowUp'));
    assert.ok(!isSolved(once), a.id);
    const moves = Array(a.order).fill(a.alg).join(' ');
    assert.ok(isSolved(stateFromAlg(translateAlg(moves, 'yellowUp'))), a.id);
  }
});

for (const a of ALGORITHMS.filter((x) => x.goal)) {
  test(`${a.id}: case keeps solved parts, is a real case, and the algorithm solves it`, () => {
    const setup = setupOf(a.alg);
    const slot = a.caseMask?.slot || 'FR';
    assert.ok(keepHolds(a.keep, setup, slot), 'keep');
    assert.ok(!goalReached(a.goal, setup) || a.goal === 'pll' && !isSolved(setup), 'non-trivial');
    assert.ok(goalReached(a.goal, applyAlg(setup, translateAlg(a.alg, 'yellowUp'))), 'solves');
    assert.ok(algorithmSolvesCase(a, a.alg));
    for (const alt of a.alternatives) assert.ok(algorithmSolvesCase(a, alt), `alternative ${alt}`);
  });

  if (a.pattern) {
    test(`${a.id}: declared pattern matches the engine`, () => {
      const s = setupOf(a.alg);
      const p = a.pattern;
      if (p.badEdges) assert.deepEqual(userBadEdges(s), [...p.badEdges].sort());
      if (p.yellow) assert.deepEqual(userYellow(s), p.yellow);
      if (p.corner) assert.deepEqual(userCorner(s, SLOTS[a.caseMask.slot].corner), p.corner);
      if (p.edge) assert.deepEqual(userEdge(s, SLOTS[a.caseMask.slot].edge), p.edge);
      if (p.swappedEdges) assert.deepEqual(userMisplacedEdges(s), [...p.swappedEdges].sort());
      if (p.edgeOnly) assert.ok(!SLOTS[p.slot] || userCorner(s, SLOTS[p.slot].corner)[0].startsWith('D'));
      if ('cornersMoved' in p || 'edgesMoved' in p) {
        const perm = llPermutation(s);
        if ('cornersMoved' in p) assert.equal(perm.cornersMoved, p.cornersMoved, 'corners');
        if ('edgesMoved' in p) assert.equal(perm.edgesMoved, p.edgesMoved, 'edges');
        if (p.cornerSwap) assert.equal(perm.cornerSwap, p.cornerSwap);
        if (p.edgeSwap) assert.equal(perm.edgeSwap, p.edgeSwap);
      }
    });
  }
}

test('case setups with random AUF and other pieces still solve with the shown moves', () => {
  const rnd = rng(3);
  for (const a of ALGORITHMS.filter((x) => x.goal)) {
    for (let i = 0; i < 6; i++) {
      const c = createCaseSetup(a, { randomAuf: true, randomizeOtherPieces: true, rnd });
      assert.ok(!c.targetPredicate(c.startState) || a.goal === 'pll', a.id);
      const after = applyAlg(c.startState, translateAlg(c.solveUser, 'yellowUp'));
      assert.ok(c.targetPredicate(after), `${a.id} solveUser`);
      assert.ok(goalReached(a.goal, after), `${a.id} goal`);
    }
  }
});

test('optimal cross solver and cross cases', () => {
  const rnd = rng(9);
  for (let i = 0; i < 40; i++) {
    const c = generateCrossCase(rnd, { minMoves: 2, maxMoves: 8 });
    assert.equal(c.optimalModel.length, c.optimalLength);
    const after = applyAlg(c.startState, c.optimalModel);
    assert.ok(goalReached('cross', after));
    assert.equal(crossDistance(after), 0);
  }
  for (const e of ALGORITHMS.filter((x) => x.practice)) {
    const c = createCaseSetup(e, { rnd });
    assert.ok(c.optimalLength >= e.practice.minMoves && c.optimalLength <= e.practice.maxMoves);
  }
  assert.deepEqual(crossSolution(solvedState()), []);
});

test('recognition quiz has one correct option among distinct options', () => {
  const rnd = rng(5);
  for (let i = 0; i < 30; i++) {
    const q = caseRecognitionQuiz(ALGORITHMS.filter((a) => a.category === 'oll2' || a.category === 'pll2'), rnd);
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options.map((o) => o.id)).size, 4);
    assert.ok(q.options.some((o) => o.id === q.correctId));
    assert.ok(algorithmSolvesCase(ALGORITHM_BY_ID[q.correctId], ALGORITHM_BY_ID[q.correctId].alg));
  }
});

test('execution tracker: half turns, deviations, correction and state-based success', () => {
  const sune = ALGORITHM_BY_ID['oll-sune'];
  const expected = sune.alg;
  const model = (alg) => translateAlg(alg, 'yellowUp');
  let r = matchExecution(expected, model("R U R' U R U U R'"));
  assert.ok(r.done);
  r = matchExecution(expected, model("R U R' U R U' U' R'"));
  assert.ok(r.done);
  r = matchExecution(expected, model("R U R' U R U"));
  assert.ok(r.halfPending && !r.done && r.nextMove === 'U2');
  r = matchExecution(expected, model("R U F"));
  assert.ok(r.deviated);
  assert.deepEqual(r.correction, ["F'"]);
  assert.equal(r.index, 2);
  r = matchExecution(expected, model("R U F F'"));
  assert.ok(!r.deviated && r.nextMove === "R'");
  r = matchExecution(expected, model("R U U"));
  assert.ok(r.deviated);
  assert.deepEqual(r.correction, ["U'"]);

  // A different valid algorithm for the same case is accepted by state.
  const c = createCaseSetup(sune, { rnd: rng(1) });
  const alt = sune.alternatives[0];
  for (const pre of ['', 'U', 'U2', "U'"]) {
    const moves = model(`${pre} ${alt}`.trim());
    const res = matchExecution(expected, moves, 'yellowUp', { startState: c.startState, goal: 'oll' });
    if (res.done) {
      assert.ok(res.viaState);
      return;
    }
  }
  assert.fail('alternative not accepted by state');
});
