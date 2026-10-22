import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aoN, averageOf, best, countedSolves, DNF, effectiveMs, formatMs, mean, moveCount, rollingAo, summary, tps,
} from '../src/core/stats.mjs';

let n = 0;
const solve = (rawMs, extra = {}) => ({
  id: 's' + ++n, createdAt: new Date(Date.UTC(2026, 9, 22, 10, 0, n)).toISOString(),
  rawMs, penalty: null, valid: true, source: 'device', kind: 'full', ...extra,
});

test('effective time with penalties', () => {
  assert.equal(effectiveMs(solve(30000)), 30000);
  assert.equal(effectiveMs(solve(30000, { penalty: '+2' })), 32000);
  assert.equal(effectiveMs(solve(30000, { penalty: 'DNF' })), DNF);
});

test('ao5 trims best and worst', () => {
  const s = [40000, 38000, 45000, 41000, 39000].map((t) => solve(t));
  assert.equal(aoN(s, 5), (40000 + 41000 + 39000) / 3);
});

test('one DNF is the worst; two DNFs make the average DNF', () => {
  const one = [40000, 38000, 45000, 41000].map((t) => solve(t));
  one.push(solve(1000, { penalty: 'DNF' }));
  assert.equal(aoN(one, 5), (40000 + 41000 + 45000) / 3);
  const two = [40000, 38000, 45000].map((t) => solve(t));
  two.push(solve(1000, { penalty: 'DNF' }), solve(2000, { penalty: 'DNF' }));
  assert.equal(aoN(two, 5), DNF);
});

test('+2 applies before trimming', () => {
  const s = [40000, 40000, 40000, 40000, 39000].map((t) => solve(t));
  s[4].penalty = '+2';
  assert.equal(aoN(s, 5), 40000);
});

test('insufficient data returns null, not zero', () => {
  assert.equal(aoN([solve(1), solve(2)], 5), null);
  assert.equal(aoN([], 12), null);
  assert.equal(best([solve(5, { penalty: 'DNF' })]), null);
  assert.equal(mean([]), null);
});

test('ao12 trims one each side', () => {
  const s = Array.from({ length: 12 }, (_, i) => solve(30000 + i * 1000));
  assert.equal(aoN(s, 12), (31000 + 40000) / 2);
});

test('invalid, deleted and simulator solves are not counted', () => {
  const list = [solve(1), solve(2, { valid: false }), solve(3, { deleted: true }), solve(4, { source: 'simulator' })];
  assert.deepEqual(countedSolves(list).map((s) => s.rawMs), [1]);
  assert.equal(countedSolves(list, { includeSimulator: true }).length, 2);
});

test('mean excludes DNF; DNF is not zero', () => {
  assert.equal(mean([solve(10000), solve(20000), solve(1, { penalty: 'DNF' })]), 15000);
  const sum = summary([solve(10000), solve(1, { penalty: 'DNF' })]);
  assert.equal(sum.best, 10000);
  assert.equal(sum.dnf, 1);
});

test('move metrics need a complete device move list', () => {
  const d = solve(10000, { moves: Array.from({ length: 50 }, (_, i) => ({ m: 'R', t: i * 200, batch: 1 })) });
  assert.equal(moveCount(d), 50);
  assert.equal(tps(d), 5);
  assert.equal(moveCount(solve(10000, { source: 'manual' })), null);
  assert.equal(tps({ ...d, movesComplete: false }), null);
});

test('rolling ao and formatting', () => {
  const s = Array.from({ length: 6 }, (_, i) => solve(40000 + i));
  assert.equal(rollingAo(s, 5).length, 2);
  assert.equal(averageOf([]), null);
  assert.equal(formatMs(41120), '41.12');
  assert.equal(formatMs(65432), '1:05.43');
  assert.equal(formatMs(DNF), 'DNF');
  assert.equal(formatMs(null), '—');
});
