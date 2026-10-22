// Local IndexedDB store. Every synced write updates the record and appends an
// outbox mutation in the same transaction, so a crash can never leave a saved
// record without its pending sync (or the reverse). Deletes are tombstones.

export const SYNCED_KINDS = ['solves', 'sessions', 'progress', 'favorites', 'settings', 'challenges'];
const DB_VERSION = 1;

export function emitter() {
  const subs = new Map();
  return {
    on(type, fn) {
      if (!subs.has(type)) subs.set(type, new Set());
      subs.get(type).add(fn);
      return () => subs.get(type).delete(fn);
    },
    emit(type, payload) {
      for (const fn of subs.get(type) || []) {
        try { fn(payload); } catch (e) { console.error(e); }
      }
    },
  };
}

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('تراکنش ذخیره لغو شد.'));
});

export const docKey = (kind, id) => kind + '__' + id;
const uuid = () => globalThis.crypto.randomUUID();

function openDb(factory, name) {
  return new Promise((resolve, reject) => {
    const r = factory.open(name, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const k of SYNCED_KINDS) db.createObjectStore(k, { keyPath: 'id' });
      db.createObjectStore('aiCache', { keyPath: 'id' });
      db.createObjectStore('meta');
      db.createObjectStore('local');
      db.createObjectStore('serverMeta');
      const out = db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      out.createIndex('doc', 'doc');
      db.createObjectStore('conflicts', { keyPath: 'conflictId' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('پایگاه دادهٔ محلی در تب دیگری باز است.'));
  });
}

function checkKind(kind) {
  if (!SYNCED_KINDS.includes(kind)) throw new Error('نوع داده ناشناخته: ' + kind);
}

export async function openStore({ name = 'gan-smart', indexedDB = globalThis.indexedDB, now = () => new Date() } = {}) {
  if (!indexedDB) throw new Error('این مرورگر ذخیرهٔ محلی IndexedDB ندارد.');
  const db = await openDb(indexedDB, name);
  const events = emitter();
  const iso = () => now().toISOString();

  async function write(kind, id, build, op) {
    checkKind(kind);
    const tx = db.transaction([kind, 'outbox'], 'readwrite');
    const existing = await req(tx.objectStore(kind).get(id));
    const rec = build(existing);
    if (!rec) {
      tx.abort();
      await done(tx).catch(() => {});
      return null;
    }
    tx.objectStore(kind).put(rec);
    tx.objectStore('outbox').add({
      mutationId: uuid(), doc: docKey(kind, id), kind, id, op, baseRev: existing?.rev || 0, data: rec, queuedAt: iso(),
    });
    await done(tx);
    events.emit('change', { kind, id, record: rec, origin: 'local' });
    return rec;
  }

  const api = {
    events,
    on: events.on,
    db,

    async get(kind, id) {
      return req(db.transaction(kind).objectStore(kind).get(id));
    },

    async all(kind, { includeDeleted = false } = {}) {
      const list = await req(db.transaction(kind).objectStore(kind).getAll());
      return includeDeleted ? list : list.filter((r) => !r.deleted);
    },

    // Saves a record. A tombstoned record is not overwritten (use restore).
    async put(kind, record) {
      if (!record || typeof record.id !== 'string' || !record.id) throw new Error('شناسهٔ رکورد لازم است.');
      return write(kind, record.id, (existing) => {
        if (existing?.deleted) return null;
        return { ...record, rev: (existing?.rev || 0) + 1, deleted: false, updatedAt: iso() };
      }, 'put');
    },

    // Read-modify-write of one record.
    async update(kind, id, fn) {
      return write(kind, id, (existing) => {
        if (!existing || existing.deleted) return null;
        return { ...fn(existing), id, rev: existing.rev + 1, deleted: false, updatedAt: iso() };
      }, 'put');
    },

    async remove(kind, id) {
      return write(kind, id, (existing) => {
        if (!existing || existing.deleted) return null;
        return { ...existing, deleted: true, deletedAt: iso(), rev: existing.rev + 1, updatedAt: iso() };
      }, 'delete');
    },

    async restore(kind, id) {
      return write(kind, id, (existing) => {
        if (!existing || !existing.deleted) return null;
        return { ...existing, deleted: false, deletedAt: null, rev: existing.rev + 1, updatedAt: iso() };
      }, 'put');
    },

    // ---- outbox / sync support ----
    async outbox() {
      return req(db.transaction('outbox').objectStore('outbox').getAll());
    },

    async pendingCount() {
      return req(db.transaction('outbox').objectStore('outbox').count());
    },

    async serverMeta(kind, id) {
      return req(db.transaction('serverMeta').objectStore('serverMeta').get(docKey(kind, id)));
    },

    // Removes acknowledged mutations (up to seq) for one doc and records the
    // server version that now matches the local one.
    async ack(kind, id, upToSeq, meta) {
      const tx = db.transaction(['outbox', 'serverMeta'], 'readwrite');
      const out = tx.objectStore('outbox');
      const keys = await req(out.index('doc').getAllKeys(docKey(kind, id)));
      for (const k of keys) if (k <= upToSeq) out.delete(k);
      tx.objectStore('serverMeta').put(meta, docKey(kind, id));
      await done(tx);
    },

    // Applies a server document. Skipped while the doc has local pending
    // mutations: the push will meet the newer server version and resolve it.
    async applyRemote(kind, record, meta) {
      checkKind(kind);
      const key = docKey(kind, record.id);
      const tx = db.transaction([kind, 'outbox', 'serverMeta'], 'readwrite');
      const pending = await req(tx.objectStore('outbox').index('doc').count(key));
      const known = await req(tx.objectStore('serverMeta').get(key));
      if (pending > 0 || known?.updateTime === meta.updateTime) {
        tx.abort();
        await done(tx).catch(() => {});
        return pending > 0 ? 'pending' : 'same';
      }
      tx.objectStore(kind).put(record);
      tx.objectStore('serverMeta').put(meta, key);
      await done(tx);
      events.emit('change', { kind, id: record.id, record, origin: 'remote' });
      return 'applied';
    },

    // Server version wins; the local version is kept as a conflict for review.
    async resolveWithServer(kind, id, serverRecord, meta, localRecord) {
      const key = docKey(kind, id);
      const tx = db.transaction([kind, 'outbox', 'serverMeta', 'conflicts'], 'readwrite');
      const out = tx.objectStore('outbox');
      for (const k of await req(out.index('doc').getAllKeys(key))) out.delete(k);
      if (localRecord) {
        tx.objectStore('conflicts').put({ conflictId: uuid(), kind, id, local: localRecord, server: serverRecord || null, at: iso() });
      }
      if (serverRecord) tx.objectStore(kind).put(serverRecord);
      if (meta) tx.objectStore('serverMeta').put(meta, key);
      await done(tx);
      events.emit('change', { kind, id, record: serverRecord, origin: 'conflict' });
    },

    async conflicts() {
      return req(db.transaction('conflicts').objectStore('conflicts').getAll());
    },

    async dismissConflict(conflictId) {
      const tx = db.transaction('conflicts', 'readwrite');
      tx.objectStore('conflicts').delete(conflictId);
      await done(tx);
      events.emit('change', { kind: 'conflicts', id: conflictId, origin: 'local' });
    },

    // ---- unsynced stores ----
    async getMeta(key) {
      return req(db.transaction('meta').objectStore('meta').get(key));
    },
    async setMeta(key, value) {
      const tx = db.transaction('meta', 'readwrite');
      if (value === undefined) tx.objectStore('meta').delete(key);
      else tx.objectStore('meta').put(value, key);
      await done(tx);
    },
    // Device-only preferences (bluetooth device, holding frame, …).
    async getLocal(key) {
      return req(db.transaction('local').objectStore('local').get(key));
    },
    async setLocal(key, value) {
      const tx = db.transaction('local', 'readwrite');
      tx.objectStore('local').put(value, key);
      await done(tx);
      events.emit('local', { key, value });
    },
    async getCache(id) {
      return req(db.transaction('aiCache').objectStore('aiCache').get(id));
    },
    async putCache(entry) {
      const tx = db.transaction('aiCache', 'readwrite');
      tx.objectStore('aiCache').put(entry);
      await done(tx);
    },

    close() {
      db.close();
    },
  };
  return api;
}
