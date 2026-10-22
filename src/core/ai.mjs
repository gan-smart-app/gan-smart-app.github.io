// Client for the optional Claude analysis proxy (worker/). Without
// VITE_AI_ENDPOINT the module is inert: aiAvailable() is false and no
// function performs any network request. AI elements in the UI are shown
// only after status() reports configured:true for the signed-in owner.

import { parseAlg } from './cube.mjs';

export const PROMPT_VERSION = 'p1';

const ENV_ENDPOINT = (() => {
  try {
    return import.meta.env?.VITE_AI_ENDPOINT || '';
  } catch {
    return '';
  }
})();

export function canonicalJson(v) {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

export async function hashOf(value) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Model suggestions are only notation-checked here; whether a sequence does what
// it claims must be checked against a concrete case before it becomes interactive.
export function checkAlgorithms(algorithms = []) {
  return algorithms.map((a) => {
    try {
      const moves = parseAlg(a.moves);
      return { ...a, moves: moves.join(' '), notationValid: moves.length > 0, verified: false };
    } catch {
      return { ...a, notationValid: false, verified: false };
    }
  });
}

export class AiRequestError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// `storage`: optional async {get(key), set(key, value)} for the local mirror of
// answers and auto-analysis bookkeeping (IndexedDB in the app, a Map in tests).
export function createAiClient({ endpoint = ENV_ENDPOINT, getToken, fetchImpl, storage } = {}) {
  const base = (endpoint || '').replace(/\/+$/, '');
  const memory = new Map();
  const store = storage || { get: async (k) => memory.get(k), set: async (k, v) => void memory.set(k, v) };
  const pending = new Map(); // local key -> {promise, requestId, controller}
  let lastStatus = null;

  const doFetch = (...args) => (fetchImpl || globalThis.fetch)(...args);

  async function request(path, { method = 'GET', body, signal } = {}) {
    const token = await getToken?.();
    if (!token) throw new AiRequestError('signed_out', 'برای استفاده از هوشواره وارد حساب شو.');
    let res;
    try {
      res = await doFetch(base + path, {
        method,
        signal,
        headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw new AiRequestError('cancelled', 'درخواست لغو شد.');
      throw new AiRequestError('network', 'ارتباط با سرور هوشواره برقرار نشد.');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* handled below */
    }
    if (!res.ok || !data?.ok) {
      throw new AiRequestError(data?.code || 'http_' + res.status, data?.message || 'خطای سرور هوشواره.', res.status);
    }
    return data;
  }

  const client = {
    aiAvailable: () => Boolean(base),

    // Only true after the server confirmed a configured key for this owner.
    isEnabled: () => Boolean(base && lastStatus?.configured),

    lastStatus: () => lastStatus,

    async status() {
      if (!base) return (lastStatus = { configured: false, reason: 'no_endpoint' });
      try {
        lastStatus = await request('/status');
      } catch (e) {
        lastStatus = { configured: false, reason: e.code, message: e.message };
      }
      return lastStatus;
    },

    // Manual request. Identical requests while one is running share it, and a
    // previously received answer is returned from the local mirror without a call.
    async analyze({ type, payload, detail = 'short' }) {
      if (!base) throw new AiRequestError('unavailable', 'هوشواره پیکربندی نشده است.');
      const key = 'ai:' + (await hashOf({ type, payload, detail, promptVersion: PROMPT_VERSION }));
      const saved = await store.get(key);
      if (saved) return { ...saved, cached: true, local: true };
      if (pending.has(key)) return pending.get(key).promise;
      const controller = new AbortController();
      const requestId = crypto.randomUUID();
      const promise = request('/analyze', {
        method: 'POST',
        signal: controller.signal,
        body: { type, payload, detail, promptVersion: PROMPT_VERSION, requestId },
      })
        .then(async (data) => {
          const out = { ...data, result: { ...data.result, algorithms: checkAlgorithms(data.result?.algorithms) } };
          await store.set(key, { result: out.result, model: out.model, promptVersion: out.promptVersion, createdAt: out.createdAt });
          return out;
        })
        .finally(() => pending.delete(key));
      pending.set(key, { promise, requestId, controller });
      return promise;
    },

    // Owner-adjustable caps; the server clamps them to its own ceilings.
    // `patch` values: number, or null to restore the server default.
    async setLimits(patch) {
      if (!base) throw new AiRequestError('unavailable', 'هوشواره پیکربندی نشده است.');
      lastStatus = await request('/limits', { method: 'PUT', body: patch });
      return lastStatus;
    },

    isRunning: () => pending.size > 0,

    async cancelAll() {
      const entries = [...pending.values()];
      for (const p of entries) p.controller.abort();
      if (!base || !entries.length) return;
      await Promise.all(
        entries.map((p) => request('/cancel', { method: 'POST', body: { requestId: p.requestId } }).catch(() => {})),
      );
    },

    // Explicit opt-in only; at most one request per finalized session version.
    async autoAnalyzeSession(summary, { enabled } = {}) {
      if (!enabled || !base || !lastStatus?.configured) return null;
      if (!summary?.sessionId) return null;
      const version = await hashOf(summary);
      const mark = `auto:${summary.sessionId}:${version}`;
      if (await store.get(mark)) return null;
      await store.set(mark, true);
      return client.analyze({ type: 'session', payload: summary, detail: 'short' });
    },
  };
  return client;
}
