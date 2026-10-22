import test from 'node:test';
import assert from 'node:assert/strict';
import { CubeLink, bluetoothSupport } from '../src/core/connection.mjs';
import { SOLVED_FACELETS, solvedState } from '../src/core/cube.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { bluetooth: {} }, configurable: true });

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

function fakeConnection() {
  const subs = new Set();
  return {
    deviceName: 'GAN-TEST',
    disconnected: 0,
    commands: [],
    events$: { subscribe(o) { subs.add(o); return { unsubscribe: () => subs.delete(o) }; } },
    push(e) { for (const o of subs) o.next(e); },
    sendCubeCommand(c) { this.commands.push(c); return Promise.resolve(); },
    disconnect() { this.disconnected++; return Promise.resolve(); },
  };
}

const s = solvedState();
const validState = { type: 'FACELETS', facelets: SOLVED_FACELETS, state: { CP: s.cp, CO: s.co, EP: s.ep, EO: s.eo } };

function fakeModule(pending) {
  return {
    calls: 0,
    connectCube(opts) { this.calls++; this.lastOpts = opts; return pending.shift().promise; },
    validFacelets: (e) => typeof e.facelets === 'string' && e.facelets.length === 54,
    forgetLastDevice: async () => true,
  };
}

test('unsupported browser gets a Persian message and no attempt', () => {
  assert.equal(bluetoothSupport({}, { isSecureContext: true }).ok, false);
  assert.match(bluetoothSupport({}, { isSecureContext: false }).text, /HTTPS/);
});

test('ready only after a valid state; moves and battery flow through', async () => {
  const d = deferred();
  const link = new CubeLink();
  link.module = fakeModule([d]);
  const events = [];
  link.subscribe((e) => events.push(e));
  const p = link.connect();
  assert.equal(link.state.status, 'selecting');
  const conn = fakeConnection();
  d.resolve({ connection: conn, state: validState });
  assert.equal(await p, true);
  assert.equal(link.state.status, 'ready');
  assert.deepEqual(conn.commands, [{ type: 'REQUEST_BATTERY' }]);
  conn.push({ type: 'MOVE', move: 'R', timestamp: 5 });
  conn.push({ type: 'MOVE', move: "R'", timestamp: 5 });
  await Promise.resolve();
  const moves = events.filter((e) => e.type === 'move');
  assert.equal(moves.length, 2);
  assert.equal(moves[0].batchId, moves[1].batchId);
  assert.ok(events.some((e) => e.type === 'batch' && e.size === 2));
  conn.push({ type: 'BATTERY', batteryLevel: 77 });
  assert.equal(link.state.battery, 77);
});

test('invalid initial state is not reported as ready', async () => {
  const d = deferred();
  const link = new CubeLink();
  link.module = fakeModule([d]);
  const p = link.connect();
  const conn = fakeConnection();
  d.resolve({ connection: conn, state: { facelets: 'U'.repeat(54), state: {} } });
  assert.equal(await p, false);
  assert.equal(link.state.status, 'error');
  assert.equal(conn.disconnected, 1);
});

test('cancel frees immediately; late result of the cancelled attempt is discarded', async () => {
  const first = deferred(), second = deferred();
  const link = new CubeLink();
  link.module = fakeModule([first, second]);
  const p1 = link.connect();
  link.cancel();
  assert.equal(link.state.status, 'idle');
  assert.equal(link.module.lastOpts.signal.aborted, true);
  const p2 = link.connect();
  const late = fakeConnection();
  first.resolve({ connection: late, state: validState });
  assert.equal(await p1, false);
  assert.equal(late.disconnected, 1);
  assert.equal(link.state.status, 'selecting', 'new attempt untouched by the late one');
  const conn = fakeConnection();
  second.resolve({ connection: conn, state: validState });
  assert.equal(await p2, true);
  assert.equal(link.conn, conn);
});

test('late error of a cancelled attempt does not change the new attempt', async () => {
  const first = deferred(), second = deferred();
  const link = new CubeLink();
  link.module = fakeModule([first, second]);
  const p1 = link.connect();
  link.cancel();
  link.connect();
  first.reject(Object.assign(new Error('boom'), { name: 'NetworkError' }));
  await p1;
  assert.equal(link.state.status, 'selecting');
  assert.equal(link.state.error, null);
});

test('pause, sync loss and disconnect invalidate; resume does not validate an old solve', async () => {
  const d = deferred();
  const link = new CubeLink();
  link.module = fakeModule([d]);
  const reasons = [];
  link.subscribe((e) => e.type === 'invalidate' && reasons.push(e.reason));
  const p = link.connect();
  const conn = fakeConnection();
  d.resolve({ connection: conn, state: validState });
  await p;
  conn.push({ type: 'CONNECTION_PAUSED', reason: 'read-error' });
  assert.equal(link.state.status, 'recovering');
  conn.push({ type: 'CONNECTION_RESUMED' });
  assert.equal(link.state.status, 'ready');
  conn.push({ type: 'SYNC_LOST' });
  conn.push({ type: 'DISCONNECT', reason: 'recovery-exhausted' });
  assert.deepEqual(reasons, ['paused:read-error', 'sync-lost', 'recovery-exhausted']);
  assert.equal(link.state.status, 'error');
  assert.equal(link.conn, null);
});

test('connection log export has no secrets and is bounded', () => {
  const link = new CubeLink({ maxLog: 5 });
  for (let i = 0; i < 10; i++) link.record('x', i);
  const out = link.exportLog();
  assert.equal(out.events.length, 5);
  assert.ok(!JSON.stringify(out).match(/token|apiKey|password/i));
});
