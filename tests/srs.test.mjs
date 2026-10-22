import test from 'node:test';
import assert from 'node:assert/strict';
import { grade, newRecord, qualityOf, suggestNext, summary, errorRate } from '../src/core/srs.mjs';
import { ALGORITHMS } from '../src/data/algorithms.mjs';

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 1);

test('quality: device is full credit, virtual/self capped, failure low', () => {
  assert.equal(qualityOf({ correct: true, mistakes: 0 }), 5);
  assert.equal(qualityOf({ correct: true, mistakes: 0, assessment: 'self' }), 4);
  assert.equal(qualityOf({ correct: true, mistakes: 2 }), 3);
  assert.equal(qualityOf({ correct: false }), 1);
});

test('intervals grow with correct runs, reset on failure, scale with difficulty', () => {
  let r = newRecord('oll-sune');
  r = grade(r, { correct: true }, {}, T0);
  assert.equal(r.interval, 1);
  r = grade(r, { correct: true }, {}, T0 + DAY);
  assert.equal(r.interval, 3);
  r = grade(r, { correct: true }, {}, T0 + 4 * DAY);
  assert.ok(r.interval > 3);
  const hard = grade(grade(grade(newRecord('x'), { correct: true }, { difficulty: 'hard' }, T0), { correct: true }, { difficulty: 'hard' }, T0), { correct: true }, { difficulty: 'hard' }, T0);
  assert.ok(hard.interval < r.interval);
  r = grade(r, { correct: false }, {}, T0 + 10 * DAY);
  assert.equal(r.streak, 0);
  assert.equal(r.status, 'learning');
  assert.ok(r.due < T0 + 10 * DAY + DAY);
});

test('mastery needs device-verified runs and the configured repetition count', () => {
  let r = newRecord('pll-ua');
  for (let i = 0; i < 8; i++) r = grade(r, { correct: true, assessment: 'self' }, { repetitions: 3 }, T0 + i * 20 * DAY);
  assert.notEqual(r.status, 'mastered');
  for (let i = 0; i < 4; i++) r = grade(r, { correct: true }, { repetitions: 3 }, T0 + (10 + i) * 20 * DAY);
  assert.equal(r.status, 'mastered');
  assert.equal(summary(r).attempts, 12);
  assert.equal(errorRate(r), 0);
});

test('suggestions: weak first, then due, learning and new with prerequisites', () => {
  const progress = {};
  let weak = newRecord('oll-sune');
  weak = grade(weak, { correct: false }, {}, T0);
  weak = grade(weak, { correct: true, mistakes: 2 }, {}, T0);
  progress['oll-sune'] = weak;
  let due = newRecord('pll-ua');
  due = grade(due, { correct: true }, {}, T0 - 5 * DAY);
  progress['pll-ua'] = due;
  const list = suggestNext(progress, { newPerDay: 2 }, T0 + DAY, ALGORITHMS);
  assert.equal(list[0].id, 'oll-sune');
  assert.equal(list[0].kind, 'weak');
  assert.ok(list.some((x) => x.id === 'pll-ua' && x.kind === 'due'));
  for (const item of list) assert.ok(item.reason.length > 5);
  const news = list.filter((x) => x.kind === 'new');
  assert.ok(news.length <= 2);
  for (const n of news) {
    const e = ALGORITHMS.find((a) => a.id === n.id);
    assert.ok(e.prerequisites.every((p) => progress[p]));
    assert.ok(!e.later);
  }
  assert.deepEqual(suggestNext({}, { newPerDay: 0 }, T0), []);
});
