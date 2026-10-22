import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openStore } from '../src/core/store.mjs';
import { applyImport, exportBackup, previewImport, validateBackup } from '../src/core/backup.mjs';

const fresh = (n) => openStore({ name: n, indexedDB: new IDBFactory() });
const solve = (id, extra = {}) => ({ id, rawMs: 40000, penalty: null, valid: true, source: 'device', createdAt: '2026-10-22T10:00:00.000Z', ...extra });

test('export excludes secrets and device-local data', async () => {
  const s = await fresh('a');
  await s.put('solves', solve('a'));
  await s.put('settings', { id: 'main', inspection: 15, aiApiKey: 'sk-x', nested: { refreshToken: 'r' } });
  await s.setMeta('auth', { refreshToken: 'secret' });
  await s.setLocal('device', 'GAN-7515b');
  const b = await exportBackup(s);
  const text = JSON.stringify(b);
  assert.ok(!text.includes('sk-x'));
  assert.ok(!text.includes('secret'));
  assert.ok(!text.includes('GAN-7515b'));
  assert.equal(b.data.solves.length, 1);
  assert.equal(b.data.settings[0].inspection, 15);
});

test('preview classifies new, duplicate, conflicting, invalid, tombstoned', async () => {
  const src = await fresh('src');
  await src.put('solves', solve('dup'));
  await src.put('solves', solve('conf', { note: 'file' }));
  await src.put('solves', solve('new'));
  await src.put('solves', solve('gone'));
  const backup = await exportBackup(src);
  backup.data.solves.push({ id: 'bad', rawMs: -5, createdAt: 'x' });

  const dst = await fresh('dst');
  await dst.put('solves', solve('dup'));
  await dst.put('solves', solve('conf', { note: 'local' }));
  await dst.put('solves', solve('gone'));
  await dst.remove('solves', 'gone');
  const p = await previewImport(dst, JSON.stringify(backup));
  assert.equal(p.ok, true);
  assert.deepEqual(
    { n: p.counts.new, d: p.counts.duplicate, c: p.counts.conflicting, i: p.counts.invalid, t: p.counts.tombstoned },
    { n: 1, d: 1, c: 1, i: 1, t: 1 },
  );
  const before = await dst.pendingCount();
  const r = await applyImport(dst, p);
  assert.equal(r.written, 1);
  assert.equal(await dst.pendingCount(), before + 1, 'import is queued for sync');
  assert.equal((await dst.get('solves', 'conf')).note, 'local');
  assert.equal((await dst.get('solves', 'gone')).deleted, true, 'tombstone not resurrected');
  await applyImport(dst, p, { conflicting: 'replace' });
  assert.equal((await dst.get('solves', 'conf')).note, 'file');
});

test('import twice does not duplicate', async () => {
  const src = await fresh('s2');
  await src.put('solves', solve('a'));
  const b = await exportBackup(src);
  const dst = await fresh('d2');
  await applyImport(dst, await previewImport(dst, b));
  const p2 = await previewImport(dst, b);
  assert.equal(p2.counts.duplicate, 1);
  assert.equal((await applyImport(dst, p2)).written, 0);
  assert.equal((await dst.all('solves')).length, 1);
});

test('rejects foreign or broken files', () => {
  assert.equal(validateBackup('{').ok, false);
  assert.equal(validateBackup({ format: 'other' }).ok, false);
  assert.equal(validateBackup({ format: 'gan-smart-backup', version: 99, data: {} }).ok, false);
});
