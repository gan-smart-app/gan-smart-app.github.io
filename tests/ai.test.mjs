import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAlgorithms, createAiClient } from '../src/core/ai.mjs';

function countingFetch(handler = () => ({ ok: true })) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const data = await handler(url, init, calls.length);
    return new Response(JSON.stringify(data), { status: data.ok === false ? data.status || 400 : 200 });
  };
  return { calls, fetchImpl };
}

const reply = { ok: true, model: 'claude-sonnet-5-5', promptVersion: 'p1', createdAt: 1, result: { summary: 's', points: [], suggestions: [], algorithms: [{ name: 'a', moves: "R U R' U'", note: '', status: 'unverified' }, { name: 'b', moves: 'Rw x', note: '' }] } };

test('no endpoint: inert, zero network calls from every entry point', async () => {
  const original = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => { n++; throw new Error('should not be called'); };
  try {
    const ai = createAiClient({ endpoint: '', getToken: async () => 't' });
    assert.equal(ai.aiAvailable(), false);
    assert.equal(ai.isEnabled(), false);
    assert.deepEqual(await ai.status(), { configured: false, reason: 'no_endpoint' });
    await assert.rejects(ai.analyze({ type: 'session', payload: { sessionId: 'x' } }));
    assert.equal(await ai.autoAnalyzeSession({ sessionId: 'x' }, { enabled: true }), null);
    await ai.cancelAll();
    assert.equal(n, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('UI gate opens only after configured:true', async () => {
  const off = countingFetch(() => ({ ok: true, configured: false }));
  const a = createAiClient({ endpoint: 'https://ai.example', getToken: async () => 't', fetchImpl: off.fetchImpl });
  await a.status();
  assert.equal(a.isEnabled(), false);
  const on = countingFetch(() => ({ ok: true, configured: true }));
  const b = createAiClient({ endpoint: 'https://ai.example/', getToken: async () => 't', fetchImpl: on.fetchImpl });
  await b.status();
  assert.equal(b.isEnabled(), true);
  assert.equal(on.calls[0].url, 'https://ai.example/status');
  assert.equal(on.calls[0].init.headers.Authorization, 'Bearer t');
});

test('double click shares one request; reopening uses the local mirror', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const f = countingFetch(async () => { await gate; return reply; });
  const ai = createAiClient({ endpoint: 'https://ai.example', getToken: async () => 't', fetchImpl: f.fetchImpl });
  const req = { type: 'solve', payload: { solveId: 'a1', time: 40.2 } };
  const p1 = ai.analyze(req);
  const p2 = ai.analyze(req);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(ai.isRunning(), true);
  release();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(f.calls.length, 1);
  assert.equal(r1, r2);
  assert.equal(r1.result.algorithms[0].notationValid, true);
  assert.equal(r1.result.algorithms[0].verified, false);
  assert.equal(r1.result.algorithms[1].notationValid, false);
  const r3 = await ai.analyze({ type: 'solve', payload: { time: 40.2, solveId: 'a1' } });
  assert.equal(r3.local, true);
  assert.equal(f.calls.length, 1);
});

test('server errors surface as messages, no automatic retry', async () => {
  const f = countingFetch(() => ({ ok: false, status: 502, code: 'invalid_key', message: 'کلید نامعتبر است' }));
  const ai = createAiClient({ endpoint: 'https://ai.example', getToken: async () => 't', fetchImpl: f.fetchImpl });
  await assert.rejects(ai.analyze({ type: 'session', payload: { sessionId: 's' } }), (e) => e.code === 'invalid_key' && e.message.includes('کلید نامعتبر'));
  assert.equal(f.calls.length, 1);
});

test('auto analysis needs explicit opt-in and runs once per session version', async () => {
  const f = countingFetch((url) => (url.endsWith('/status') ? { ok: true, configured: true } : reply));
  const ai = createAiClient({ endpoint: 'https://ai.example', getToken: async () => 't', fetchImpl: f.fetchImpl });
  await ai.status();
  const summary = { sessionId: 's9', solves: 5, best: 30 };
  assert.equal(await ai.autoAnalyzeSession(summary, { enabled: false }), null);
  assert.equal(f.calls.length, 1);
  await ai.autoAnalyzeSession(summary, { enabled: true });
  assert.equal(await ai.autoAnalyzeSession({ ...summary }, { enabled: true }), null);
  assert.equal(f.calls.length, 2);
  await ai.autoAnalyzeSession({ ...summary, solves: 6 }, { enabled: true });
  assert.equal(f.calls.length, 3);
});

test('checkAlgorithms never marks model output as verified', () => {
  const [a] = checkAlgorithms([{ moves: "F R U R' U' F'" }]);
  assert.equal(a.verified, false);
  assert.equal(a.notationValid, true);
});

test('setLimits: no network without endpoint; PUT with patch otherwise', async () => {
  const original = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => { n++; throw new Error('no'); };
  try {
    await assert.rejects(createAiClient({ endpoint: '', getToken: async () => 't' }).setLimits({ dailyUsd: 0.1 }));
    assert.equal(n, 0);
  } finally {
    globalThis.fetch = original;
  }
  const f = countingFetch(() => ({ ok: true, configured: true, limits: { dailyUsd: 0.1 }, ceilings: { dailyUsd: 0.5 } }));
  const ai = createAiClient({ endpoint: 'https://ai.example', getToken: async () => 't', fetchImpl: f.fetchImpl });
  const st = await ai.setLimits({ dailyUsd: 0.1, monthlyUsd: null });
  assert.equal(f.calls[0].url, 'https://ai.example/limits');
  assert.equal(f.calls[0].init.method, 'PUT');
  assert.deepEqual(f.calls[0].body, { dailyUsd: 0.1, monthlyUsd: null });
  assert.equal(st.limits.dailyUsd, 0.1);
  assert.equal(ai.lastStatus().ceilings.dailyUsd, 0.5);
});
