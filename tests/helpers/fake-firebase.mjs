// In-memory stand-in for Firebase Auth REST and the Firestore REST endpoints
// the sync engine uses (commit, runQuery, get). Preconditions and the
// REQUEST_TIME transform behave like Firestore; commits are atomic.

export function fakeFirebase({ uid = 'owner', email = 'me@example.com', password = 'secret-pass' } = {}) {
  const docs = new Map();
  let clock = Date.UTC(2026, 9, 22, 8, 0, 0);
  const tick = () => new Date((clock += 7)).toISOString().replace('Z', '123Z');
  const calls = [];
  let fail = null; // 'network' | 'lost-response'
  let online = true;

  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const err = (status, code) => json(status, { error: { status: code, message: code } });

  async function handler(url, init = {}) {
    calls.push({ url, method: init.method || 'GET' });
    if (!online) throw new TypeError('Failed to fetch');
    if (url.includes('accounts:signInWithPassword')) {
      const b = JSON.parse(init.body);
      if (b.email !== email || b.password !== password) return json(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } });
      return json(200, { idToken: 'token-' + uid, refreshToken: 'refresh-' + uid, expiresIn: '3600', localId: uid, email });
    }
    if (url.includes('securetoken.googleapis.com')) return json(200, { id_token: 'token-' + uid, refresh_token: 'refresh-' + uid, expires_in: '3600', user_id: uid });
    if (init.headers?.Authorization !== 'Bearer token-' + uid) return err(401, 'UNAUTHENTICATED');

    const mode = fail;
    if (mode === 'network') {
      fail = null;
      throw new TypeError('Failed to fetch');
    }
    let res;
    if (url.endsWith(':commit')) {
      const { writes } = JSON.parse(init.body);
      for (const w of writes) {
        const cur = docs.get(w.update.name);
        const pre = w.currentDocument || {};
        if (pre.exists === false && cur) return err(409, 'ALREADY_EXISTS');
        if (pre.updateTime && (!cur || cur.updateTime !== pre.updateTime)) return err(400, 'FAILED_PRECONDITION');
      }
      const t = tick();
      for (const w of writes) {
        const fields = { ...w.update.fields };
        for (const tr of w.updateTransforms || []) fields[tr.fieldPath] = { timestampValue: t };
        docs.set(w.update.name, { name: w.update.name, fields, updateTime: t });
      }
      res = json(200, { writeResults: writes.map(() => ({ updateTime: t })), commitTime: t });
    } else if (url.endsWith(':runQuery')) {
      const q = JSON.parse(init.body).structuredQuery;
      const since = q.where.fieldFilter.value.timestampValue;
      const prefix = url.slice(url.indexOf('projects/'), url.lastIndexOf(':runQuery')) + '/items/';
      const rows = [...docs.values()]
        .filter((d) => d.name.startsWith(prefix) && d.fields.updatedAt.timestampValue > since)
        .sort((a, b) => a.fields.updatedAt.timestampValue.localeCompare(b.fields.updatedAt.timestampValue))
        .slice(0, q.limit)
        .map((d) => ({ document: structuredClone(d) }));
      res = json(200, rows.length ? rows : [{ readTime: tick() }]);
    } else if ((init.method || 'GET') === 'GET') {
      const name = url.slice(url.indexOf('projects/'));
      const d = docs.get(name);
      res = d ? json(200, structuredClone(d)) : err(404, 'NOT_FOUND');
    } else res = err(400, 'UNKNOWN');
    if (mode === 'lost-response') {
      fail = null;
      throw new TypeError('Failed to fetch');
    }
    return res;
  }

  return {
    fetch: handler,
    docs,
    calls,
    failNext(mode) {
      fail = mode;
    },
    setOnline(v) {
      online = v;
    },
    credentials: { email, password },
    records(kind) {
      return [...docs.values()]
        .filter((d) => d.fields.kind.stringValue === kind)
        .map((d) => ({ ...JSON.parse(d.fields.data.stringValue), deleted: d.fields.deleted.booleanValue }));
    },
  };
}
