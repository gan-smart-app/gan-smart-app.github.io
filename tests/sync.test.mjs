import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStore } from '../src/core/store.mjs';
import { createAuth } from '../src/core/auth.mjs';
import { createSync } from '../src/core/sync.mjs';
import { fakeFirebase } from './helpers/fake-firebase.mjs';

const config = { apiKey: 'k', projectId: 'p', configured: true };
const timers = { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };

async function device(fb, name) {
  const store = await openStore({ name, indexedDB: new IDBFactory() });
  const auth = createAuth({ store, config, fetch: fb.fetch });
  await auth.init();
  await auth.signIn(fb.credentials.email, fb.credentials.password);
  const sync = createSync({ store, auth, fetch: fb.fetch, timers, env: {} });
  return { store, auth, sync };
}

test('offline queue then reconnect stores each record exactly once', async () => {
  const fb = fakeFirebase();
  const a = await device(fb, 'a');
  fb.setOnline(false);
  for (let i = 0; i < 3; i++) await a.store.put('solves', { id: 's' + i, rawMs: 1000 + i, valid: true });
  let st = await a.sync.syncNow();
  assert.equal(st.state, 'offline');
  assert.equal(st.pending, 3);
  fb.setOnline(true);
  st = await a.sync.syncNow();
  assert.equal(st.state, 'synced');
  assert.equal(st.pending, 0);
  assert.equal(fb.records('solves').length, 3);
  await a.sync.syncNow();
  assert.equal(fb.records('solves').length, 3);
});

test('second device sees records from the first', async () => {
  const fb = fakeFirebase();
  const a = await device(fb, 'a');
  const b = await device(fb, 'b');
  await a.store.put('solves', { id: 'x', rawMs: 41120, valid: true });
  await a.store.put('settings', { id: 'main', inspection: 15 });
  await a.sync.syncNow();
  await b.sync.syncNow();
  assert.equal((await b.store.get('solves', 'x')).rawMs, 41120);
  assert.equal((await b.store.get('settings', 'main')).inspection, 15);
});

test('lost response retry does not duplicate or conflict', async () => {
  const fb = fakeFirebase();
  const a = await device(fb, 'a');
  await a.store.put('solves', { id: 'x', rawMs: 1, valid: true });
  await a.sync.syncNow(); // establish
  await a.store.update('solves', 'x', (r) => ({ ...r, note: 'n1' }));
  // pull ok, then the commit is applied but its response is lost
  let calls = 0;
  const orig = fb.fetch;
  a.sync; // same engine
  fb.failNext(null);
  const wrapped = async (url, init) => {
    if (url.endsWith(':commit') && calls++ === 0) fb.failNext('lost-response');
    return orig(url, init);
  };
  const s2 = createSync({ store: a.store, auth: a.auth, fetch: wrapped, timers, env: {} });
  let st = await s2.syncNow();
  assert.equal(st.state, 'offline');
  assert.equal(st.pending, 1);
  // edit again before the retry: the earlier mutation already landed
  await a.store.update('solves', 'x', (r) => ({ ...r, note: 'n2' }));
  st = await s2.syncNow();
  assert.equal(st.pending, 0);
  assert.equal(st.conflicts, 0);
  assert.equal(st.state, 'synced');
  assert.equal(fb.records('solves').length, 1);
  assert.equal(fb.records('solves')[0].note, 'n2');
});

test('delete on A is not resurrected by stale B; B keeps its edit as a conflict', async () => {
  const fb = fakeFirebase();
  const a = await device(fb, 'a');
  const b = await device(fb, 'b');
  await a.store.put('solves', { id: 'x', rawMs: 5, valid: true });
  await a.sync.syncNow();
  await b.sync.syncNow();
  await a.store.remove('solves', 'x');
  await a.sync.syncNow();
  // B edits its stale copy without having pulled the delete
  await b.store.update('solves', 'x', (r) => ({ ...r, note: 'stale edit' }));
  const st = await b.sync.syncNow();
  assert.equal(fb.records('solves')[0].deleted, true);
  assert.equal((await b.store.get('solves', 'x')).deleted, true);
  assert.equal(st.conflicts, 1);
  assert.equal(st.state, 'attention');
  const [c] = await b.store.conflicts();
  assert.equal(c.local.note, 'stale edit');
  // a stale re-put is refused locally (tombstone)
  assert.equal(await b.store.put('solves', { id: 'x', rawMs: 5 }), null);
});

test('concurrent edits: server wins, local kept', async () => {
  const fb = fakeFirebase();
  const a = await device(fb, 'a');
  const b = await device(fb, 'b');
  await a.store.put('sessions', { id: 'S', name: 'one' });
  await a.sync.syncNow();
  await b.sync.syncNow();
  await a.store.update('sessions', 'S', (r) => ({ ...r, name: 'A' }));
  await b.store.update('sessions', 'S', (r) => ({ ...r, name: 'B' }));
  await a.sync.syncNow();
  await b.sync.syncNow();
  assert.equal((await b.store.get('sessions', 'S')).name, 'A');
  assert.equal((await b.store.conflicts())[0].local.name, 'B');
});

test('restore after delete propagates with a new revision', async () => {
  const fb = fakeFirebase();
  const a = await device(fb, 'a');
  const b = await device(fb, 'b');
  await a.store.put('solves', { id: 'x', rawMs: 5, valid: true });
  await a.store.remove('solves', 'x');
  await a.sync.syncNow();
  await a.store.restore('solves', 'x');
  await a.sync.syncNow();
  await b.sync.syncNow();
  assert.equal((await b.store.get('solves', 'x')).deleted, false);
});

test('signed out or unconfigured stays local with zero requests', async () => {
  const fb = fakeFirebase();
  const store = await openStore({ name: 'c', indexedDB: new IDBFactory() });
  const auth = createAuth({ store, config: { apiKey: '', projectId: '', configured: false }, fetch: fb.fetch });
  await auth.init();
  const sync = createSync({ store, auth, fetch: fb.fetch, timers, env: {} });
  await store.put('solves', { id: 'x', rawMs: 1 });
  const st = await sync.syncNow();
  assert.equal(st.state, 'local');
  assert.equal(fb.calls.length, 0);
});

test('wrong password gives a Persian error and no session', async () => {
  const fb = fakeFirebase();
  const store = await openStore({ name: 'd', indexedDB: new IDBFactory() });
  const auth = createAuth({ store, config, fetch: fb.fetch });
  await auth.init();
  await assert.rejects(auth.signIn(fb.credentials.email, 'nope'), /گذرواژه/);
  assert.equal(auth.state.status, 'signedOut');
  assert.equal(await store.getMeta('auth'), undefined);
});
