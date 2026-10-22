// Firestore REST sync. Docs: users/{uid}/items/{kind}__{id}.
// Order per run: pull, then push. Push uses update-time preconditions;
// on a precondition failure the doc is read back: if it already carries our
// mutationId the earlier request succeeded (lost response), otherwise the
// server version wins and the local version is kept as a conflict.

import { docKey, emitter, SYNCED_KINDS } from './store.mjs';

const BATCH = 50;
const PULL_LIMIT = 300;
const OVERLAP_MS = 60000;

const enc = (rec, kind, mutationId) => ({
  kind: { stringValue: kind },
  id: { stringValue: rec.id },
  rev: { integerValue: String(rec.rev || 0) },
  deleted: { booleanValue: !!rec.deleted },
  data: { stringValue: JSON.stringify(rec) },
  lastMutation: { stringValue: mutationId },
});

function dec(doc) {
  const f = doc.fields || {};
  let record = null;
  try {
    record = JSON.parse(f.data?.stringValue || 'null');
  } catch {}
  return {
    kind: f.kind?.stringValue,
    id: f.id?.stringValue,
    rev: Number(f.rev?.integerValue || 0),
    deleted: !!f.deleted?.booleanValue,
    lastMutation: f.lastMutation?.stringValue,
    updatedAt: f.updatedAt?.timestampValue,
    updateTime: doc.updateTime,
    record,
  };
}

const PRECONDITION = new Set(['FAILED_PRECONDITION', 'ALREADY_EXISTS', 'NOT_FOUND', 'ABORTED']);

class HttpError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'HTTP ' + status);
    this.status = status;
    this.code = body?.error?.status;
  }
}

export const SYNC_LABELS = {
  local: 'ذخیرهٔ محلی',
  queued: 'در صف همگام‌سازی',
  syncing: 'درحال همگام‌سازی',
  synced: 'در ابر ذخیره شد',
  attention: 'نیازمند رسیدگی',
  offline: 'آفلاین؛ تغییرها در صف می‌مانند',
};

export function createSync({
  store, auth, fetch: fetchFn = globalThis.fetch.bind(globalThis),
  timers = globalThis, env = globalThis, now = () => Date.now(),
  debounceMs = 1500, intervalMs = 30000,
}) {
  const events = emitter();
  let status = { state: 'local', pending: 0, conflicts: 0, lastSyncedAt: null, error: null };
  let running = null;
  let busy = false;
  let again = false;
  let failures = 0;
  let offline = false;
  let authError = null;
  let retryTimer = null, debounceTimer = null, intervalTimer = null;
  const cleanups = [];

  const base = () => `https://firestore.googleapis.com/v1/projects/${auth.projectId}/databases/(default)/documents`;
  const root = () => `projects/${auth.projectId}/databases/(default)/documents`;
  const docName = (uid, kind, id) => `${root()}/users/${uid}/items/${docKey(kind, id)}`;

  async function api(path, body, method = 'POST') {
    let token = await auth.getIdToken();
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await fetchFn(path, {
          method,
          headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        const err = new Error('network');
        err.network = true;
        throw err;
      }
      if (res.status === 401 && attempt === 0) {
        token = await auth.getIdToken(true);
        continue;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(res.status, json);
      return json;
    }
  }

  async function refreshStatus(patch = {}) {
    status = { ...status, ...patch };
    const pending = await store.pendingCount();
    const conflicts = (await store.conflicts()).length;
    const signedIn = auth.configured && auth.state.status === 'signedIn';
    let state;
    if (!signedIn) state = authError ? 'attention' : 'local';
    else if (busy) state = 'syncing';
    else if (authError || conflicts) state = 'attention';
    else if (offline) state = 'offline';
    else if (pending) state = 'queued';
    else state = status.lastSyncedAt ? 'synced' : 'queued';
    status = { ...status, state, pending, conflicts, error: authError || patch.error || null };
    events.emit('status', status);
    return status;
  }

  async function pull(uid) {
    const cursor = (await store.getMeta('syncCursor')) || null;
    let since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : '1970-01-01T00:00:00Z';
    let maxSeen = cursor;
    for (let page = 0; page < 50; page++) {
      const rows = await api(`${base()}/users/${uid}:runQuery`, {
        structuredQuery: {
          from: [{ collectionId: 'items' }],
          where: { fieldFilter: { field: { fieldPath: 'updatedAt' }, op: 'GREATER_THAN', value: { timestampValue: since } } },
          orderBy: [{ field: { fieldPath: 'updatedAt' }, direction: 'ASCENDING' }],
          limit: PULL_LIMIT,
        },
      });
      const docs = (rows || []).filter((r) => r.document).map((r) => dec(r.document));
      for (const d of docs) {
        if (SYNCED_KINDS.includes(d.kind) && d.record && d.id) {
          await store.applyRemote(d.kind, { ...d.record, rev: d.rev, deleted: d.deleted }, { updateTime: d.updateTime, rev: d.rev });
        }
        if (d.updatedAt && (!maxSeen || d.updatedAt > maxSeen)) maxSeen = d.updatedAt;
      }
      if (docs.length < PULL_LIMIT) break;
      since = docs[docs.length - 1].updatedAt;
    }
    if (maxSeen && maxSeen !== cursor) await store.setMeta('syncCursor', maxSeen);
  }

  function writeFor(uid, m, meta) {
    return {
      update: { name: docName(uid, m.kind, m.id), fields: enc(m.data, m.kind, m.mutationId) },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: meta?.updateTime ? { updateTime: meta.updateTime } : { exists: false },
    };
  }

  // Latest pending mutation per doc; earlier ones are superseded by it.
  async function latestPerDoc() {
    const byDoc = new Map();
    for (const m of await store.outbox()) byDoc.set(m.doc, m);
    return [...byDoc.values()];
  }

  async function resolveOne(uid, m, retried = false) {
    let server = null;
    try {
      server = dec(await api(`${base()}/users/${uid}/items/${docKey(m.kind, m.id)}`, null, 'GET'));
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    if (server && server.lastMutation === m.mutationId) {
      await store.ack(m.kind, m.id, m.seq, { updateTime: server.updateTime, rev: server.rev });
      return;
    }
    // An earlier mutation of ours landed but its response was lost: accept it
    // as the base and push the latest local version on top of it.
    const earlier = server && (await store.outbox()).find((o) => o.doc === m.doc && o.mutationId === server.lastMutation);
    if (earlier && !retried) {
      const meta = { updateTime: server.updateTime, rev: server.rev };
      await store.ack(m.kind, m.id, earlier.seq, meta);
      try {
        const r = await api(`${base()}:commit`, { writes: [writeFor(uid, m, meta)] });
        await store.ack(m.kind, m.id, m.seq, { updateTime: r.writeResults[0].updateTime, rev: m.data.rev });
      } catch (e) {
        if (!PRECONDITION.has(e.code)) throw e;
        await resolveOne(uid, m, true);
      }
      return;
    }
    if (!server) {
      // Known updateTime but the doc is gone (should not happen): recreate.
      const r = await api(`${base()}:commit`, { writes: [writeFor(uid, m, null)] });
      await store.ack(m.kind, m.id, m.seq, { updateTime: r.writeResults[0].updateTime, rev: m.data.rev });
      return;
    }
    const serverRecord = server.record ? { ...server.record, rev: server.rev, deleted: server.deleted } : null;
    const same = serverRecord && JSON.stringify(strip(serverRecord)) === JSON.stringify(strip(m.data));
    await store.resolveWithServer(m.kind, m.id, serverRecord, { updateTime: server.updateTime, rev: server.rev }, same ? null : m.data);
  }

  async function push(uid) {
    const list = await latestPerDoc();
    for (let i = 0; i < list.length; i += BATCH) {
      const chunk = list.slice(i, i + BATCH);
      const metas = await Promise.all(chunk.map((m) => store.serverMeta(m.kind, m.id)));
      try {
        const r = await api(`${base()}:commit`, { writes: chunk.map((m, k) => writeFor(uid, m, metas[k])) });
        for (let k = 0; k < chunk.length; k++) {
          await store.ack(chunk[k].kind, chunk[k].id, chunk[k].seq, { updateTime: r.writeResults[k].updateTime, rev: chunk[k].data.rev });
        }
      } catch (e) {
        if (!PRECONDITION.has(e.code)) throw e;
        // A commit is atomic: isolate the failing docs one by one.
        for (let k = 0; k < chunk.length; k++) {
          const m = chunk[k];
          try {
            const r = await api(`${base()}:commit`, { writes: [writeFor(uid, m, metas[k])] });
            await store.ack(m.kind, m.id, m.seq, { updateTime: r.writeResults[0].updateTime, rev: m.data.rev });
          } catch (e2) {
            if (!PRECONDITION.has(e2.code)) throw e2;
            await resolveOne(uid, m);
          }
        }
      }
    }
  }

  function schedule(ms) {
    timers.clearTimeout(retryTimer);
    retryTimer = timers.setTimeout(() => sync.syncNow(), ms);
  }

  async function run() {
    const uid = auth.state.uid;
    await refreshStatus();
    try {
      await pull(uid);
      await push(uid);
      failures = 0;
      offline = false;
      authError = null;
      busy = false;
      return await refreshStatus({ lastSyncedAt: new Date(now()).toISOString() });
    } catch (e) {
      busy = false;
      if (e.network) {
        offline = true;
        failures++;
        schedule(Math.min(300000, 2000 * 2 ** Math.min(failures, 8)));
        return await refreshStatus();
      }
      if (e.status === 401 || e.status === 403 || e.fatal) {
        authError = e.status === 403 ? 'دسترسی این حساب به داده‌ها رد شد؛ قوانین Firebase را بررسی کن.' : e.message;
        return await refreshStatus();
      }
      failures++;
      schedule(Math.min(300000, 5000 * 2 ** Math.min(failures, 6)));
      return await refreshStatus({ error: 'همگام‌سازی انجام نشد: ' + e.message });
    }
  }

  const sync = {
    on: events.on,
    get status() {
      return status;
    },
    refreshStatus,

    // Single flight: a call during a run causes exactly one more run.
    async syncNow() {
      if (!auth.configured || auth.state.status !== 'signedIn') return refreshStatus();
      if (env.navigator && env.navigator.onLine === false) {
        offline = true;
        return refreshStatus();
      }
      if (running) {
        again = true;
        return running;
      }
      busy = true;
      running = run();
      const result = await running;
      running = null;
      if (again) {
        again = false;
        return sync.syncNow();
      }
      return result;
    },

    start() {
      const kick = () => sync.syncNow();
      const off = store.on('change', (e) => {
        if (e.origin !== 'local') return refreshStatus();
        refreshStatus();
        timers.clearTimeout(debounceTimer);
        debounceTimer = timers.setTimeout(kick, debounceMs);
      });
      cleanups.push(off, auth.on('change', () => {
        authError = null;
        kick();
      }));
      if (env.addEventListener) {
        const online = () => {
          offline = false;
          failures = 0;
          kick();
        };
        const offlineFn = () => {
          offline = true;
          refreshStatus();
        };
        const visible = () => env.document?.visibilityState !== 'hidden' && kick();
        env.addEventListener('online', online);
        env.addEventListener('offline', offlineFn);
        env.addEventListener('focus', kick);
        env.document?.addEventListener?.('visibilitychange', visible);
        cleanups.push(() => {
          env.removeEventListener('online', online);
          env.removeEventListener('offline', offlineFn);
          env.removeEventListener('focus', kick);
          env.document?.removeEventListener?.('visibilitychange', visible);
        });
      }
      intervalTimer = timers.setInterval(() => {
        if (env.document?.visibilityState !== 'hidden') kick();
      }, intervalMs);
      kick();
    },

    stop() {
      for (const c of cleanups.splice(0)) c();
      timers.clearTimeout(retryTimer);
      timers.clearTimeout(debounceTimer);
      timers.clearInterval(intervalTimer);
    },
  };
  return sync;
}

function strip(r) {
  const { rev, updatedAt, ...rest } = r || {};
  return rest;
}
