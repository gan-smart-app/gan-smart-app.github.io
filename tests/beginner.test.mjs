import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlg, isSolved, MOVE_NAMES, solvedState, stateFromAlg, statesEqual, translateAlg } from '../src/core/cube.mjs';
import { planBeginner, replanFrom, nextStep, stageOf, STAGES } from '../src/core/beginner.mjs';
import { STAGE_CHECKS } from '../src/core/stages.mjs';

function rng(seed) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}
function randomState(rnd, n = 30) {
  return stateFromAlg(Array.from({ length: n }, () => MOVE_NAMES[Math.floor(rnd() * 18)]));
}

test('plans solve 200 random states and keep completed stages', () => {
  const rnd = rng(2024);
  let total = 0;
  for (let i = 0; i < 200; i++) {
    const start = randomState(rnd);
    const t0 = performance.now();
    const steps = planBeginner(start);
    total += performance.now() - t0;
    let s = start;
    let maxStage = stageOf(start);
    for (const step of steps) {
      assert.ok(step.stage >= 1 && step.stage <= 7);
      assert.ok(step.title && step.explanation);
      assert.deepEqual(translateAlg(step.movesUser, 'yellowUp'), step.movesModel);
      s = applyAlg(s, step.movesModel);
      assert.ok(statesEqual(s, step.stateAfter));
      if (!step.transient) {
        // Every stage finished before this step is still intact after it.
        for (let k = 0; k < step.stage - 1; k++) assert.ok(STAGE_CHECKS[k](s), `stage ${k + 1} broken at step ${step.title}`);
        maxStage = Math.max(maxStage, stageOf(s));
        assert.ok(stageOf(s) >= step.stage - 1);
      }
    }
    assert.ok(isSolved(s), 'solved');
    // The last step of each stage completes it.
    for (const st of STAGES) {
      const last = steps.filter((x) => x.stage === st.stage).at(-1);
      if (last) assert.ok(STAGE_CHECKS[st.stage - 1](last.stateAfter), `stage ${st.stage} complete`);
    }
  }
  assert.ok(total / 200 < 300, `average ${total / 200}ms`);
});

test('solved cube needs no steps; stage detection; replanning after a detour', () => {
  assert.equal(planBeginner(solvedState()).length, 0);
  assert.equal(stageOf(solvedState()), 7);
  const rnd = rng(77);
  const start = randomState(rnd);
  const plan = planBeginner(start);
  const mid = plan[Math.floor(plan.length / 2)].stateAfter;
  // Learner does an extra U-layer turn (user frame), then continues from the real state.
  const detour = applyAlg(mid, translateAlg('U', 'yellowUp'));
  const re = replanFrom(detour);
  const end = re.steps.reduce((s, st) => applyAlg(s, st.movesModel), detour);
  assert.ok(isSolved(end));
  assert.equal(nextStep(detour).step?.stage, re.steps[0]?.stage);
});

test('rejects invalid states', () => {
  const bad = solvedState();
  bad.co[0] = 1;
  assert.throws(() => planBeginner(bad));
});
