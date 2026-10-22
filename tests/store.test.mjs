import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStore } from '../src/core/store.mjs';

const fresh = () => openStore({ name: 't', indexedDB: new IDBFactory() });

test('put writes record and outbox together', async () => {
  const s = await fresh();
  const rec = await s.put('solves', { id: 'a', rawMs: 1000 });
  assert.equal(rec.rev, 1);
  const out = await s.outbox();
  assert.equal(out.length, 1);
  assert.equal(out[0].op, 'put');
  assert.equal(out[0].doc, 'solves__a');
  assert.ok(out[0].mutationId);
  await s.update('solves', 'a', (r) => ({ ...r, note: 'x' }));
  assert.equal((await s.get('solves', 'a')).rev, 2);
  assert.equal(await s.pendingCount(), 2);
});

test('delete is a restorable tombstone', async () => {
  const s = await fresh();
  await s.put('solves', { id: 'a', rawMs: 1 });
  await s.remove('solves', 'a');
  assert.equal((await s.all('solves')).length, 0);
  assert.equal((await s.all('solves', { includeDeleted: true }))[0].deleted, true);
  assert.equal(await s.put('solves', { id: 'a', rawMs: 2 }), null, 'put cannot resurrect');
  const r = await s.restore('solves', 'a');
  assert.equal(r.deleted, false);
  assert.equal(r.rev, 3);
  assert.equal((await s.outbox()).map((m) => m.op).join(), 'put,delete,put');
});

test('applyRemote waits while local changes are pending', async () => {
  const s = await fresh();
  await s.put('solves', { id: 'a', rawMs: 1 });
  assert.equal(await s.applyRemote('solves', { id: 'a', rawMs: 9, rev: 5 }, { updateTime: 't1', rev: 5 }), 'pending');
  const [m] = await s.outbox();
  await s.ack('solves', 'a', m.seq, { updateTime: 't0', rev: 1 });
  assert.equal(await s.pendingCount(), 0);
  assert.equal(await s.applyRemote('solves', { id: 'a', rawMs: 9, rev: 5 }, { updateTime: 't1', rev: 5 }), 'applied');
  assert.equal(await s.applyRemote('solves', { id: 'a', rawMs: 9, rev: 5 }, { updateTime: 't1', rev: 5 }), 'same');
  assert.equal((await s.get('solves', 'a')).rawMs, 9);
});

test('local, meta and cache stores are separate from the outbox', async () => {
  const s = await fresh();
  await s.setLocal('frame', 'yellowUp');
  await s.setMeta('auth', { refreshToken: 'r' });
  await s.putCache({ id: 'k', text: 'x' });
  assert.equal(await s.getLocal('frame'), 'yellowUp');
  assert.equal((await s.getMeta('auth')).refreshToken, 'r');
  assert.equal(await s.pendingCount(), 0);
  let seen = null;
  s.on('change', (e) => (seen = e));
  await s.put('settings', { id: 'main', inspection: 15 });
  assert.equal(seen.kind, 'settings');
});
