import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionSummary } from '../src/app/sessionSummary.js';

const solve = (i, extra = {}) => ({
  id: 's' + i, sessionId: 'S', createdAt: new Date(2026, 9, 22, 18, i).toISOString(), rawMs: 30000 + i * 1000, penalty: null,
  valid: true, source: 'device', kind: 'full', scramble: "R U R'", moves: [{ m: 'R', t: 0, b: 1 }, { m: 'U', t: 400, b: 2 }], movesComplete: true, ...extra,
});

test('session summary is statistical only: no moves, scrambles, notes or device data', () => {
  const data = {
    solves: [solve(0), solve(1, { penalty: 'DNF' }), solve(2, { penalty: '+2' }), solve(3), solve(4), solve(5, { valid: false }), solve(6, { note: 'private note' })],
    progress: [], sessions: [{ id: 'S', createdAt: new Date(2026, 9, 22, 17).toISOString() }],
  };
  const s = sessionSummary(data.sessions[0], data);
  const text = JSON.stringify(s);
  assert.ok(!text.includes("R U R'"));
  assert.ok(!text.includes('private note'));
  assert.ok(!/"m":/.test(text));
  assert.equal(s.solves, 7);
  assert.equal(s.validSolves, 6);
  assert.equal(s.dnf, 1);
  assert.equal(s.plus2, 1);
  assert.equal(s.bestSec, 30);
  assert.ok(s.timesSec.includes('DNF'));
});
