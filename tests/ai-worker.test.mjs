import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { createVerifier, JWKS_URL } from '../worker/jwt.mjs';
import { AiService } from '../worker/service.mjs';
import { handle, serviceHandler } from '../worker/routes.mjs';

const KEY = 'sk-ant-api03-SECRETSECRETSECRET-abcd';
const PROJECT = 'gan-smart-test';
const OWNER = 'owner-uid-1';
const ORIGIN = 'https://app.example';

const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

async function keyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  );
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  return { pair, jwk };
}

async function sign(pair, claims, kid = 'k1') {
  const head = enc({ alg: 'RS256', kid, typ: 'JWT' });
  const body = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(head + '.' + body));
  return head + '.' + body + '.' + Buffer.from(sig).toString('base64url');
}

function claimsFor(sub, over = {}) {
  const t = Math.floor(Date.now() / 1000);
  return { aud: PROJECT, iss: 'https://securetoken.google.com/' + PROJECT, sub, iat: t - 10, exp: t + 3600, auth_time: t - 10, ...over };
}

function mapStorage() {
  const m = new Map();
  return {
    m,
    get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : undefined),
    put: async (k, v) => void m.set(k, structuredClone(v)),
    delete: async (k) => m.delete(k),
  };
}

function anthropicReply(over = {}) {
  return {
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({ summary: 'خوب بود', points: ['ثبات'], suggestions: ['کراس'], algorithms: [{ name: 'sexy', moves: "R U R' U'", note: '' }] }) }],
    usage: { input_tokens: 400, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    ...over,
  };
}

// A fake Anthropic HTTP endpoint behind the real SDK, so SDK error classes are exercised.
function fakeAnthropic(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers });
    return responder(calls.length, init);
  };
  const createClient = (env, timeout) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout, fetch: fetchImpl });
  return { calls, createClient };
}
const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'r' } });
const err = (status, type) => new Response(JSON.stringify({ type: 'error', error: { type, message: 'x' } }), { status, headers: { 'content-type': 'application/json' } });

function env(over = {}) {
  return { ANTHROPIC_API_KEY: KEY, FIREBASE_PROJECT_ID: PROJECT, OWNER_UID: OWNER, ALLOWED_ORIGIN: ORIGIN, AI_MIN_INTERVAL_SEC: '0', ...over };
}

async function setup({ responder = () => ok(anthropicReply()), envOver = {}, logs = [] } = {}) {
  const { pair, jwk } = await keyPair();
  const verify = createVerifier({ projectId: PROJECT, fetchImpl: async (u) => { assert.equal(u, JWKS_URL); return new Response(JSON.stringify({ keys: [jwk] })); } });
  const fake = fakeAnthropic(responder);
  const e = env(envOver);
  const service = new AiService({ storage: mapStorage(), env: e, createClient: fake.createClient, log: (m) => logs.push(m) });
  const call = async (method, path, { token, body, origin = ORIGIN } = {}) => {
    const headers = { Origin: origin };
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = new Request('https://ai.example' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const res = await handle(req, e, { verify, forward: (r) => serviceHandler(service, r) });
    return { status: res.status, data: await res.json(), headers: res.headers, text: null };
  };
  const ownerToken = await sign(pair, claimsFor(OWNER));
  return { pair, call, fake, service, ownerToken, logs };
}

const sessionBody = (n = 1) => ({ type: 'session', payload: { sessionId: 's' + n, solves: 12, best: 32.4, ao5: 41.1 }, detail: 'short', promptVersion: 'p1' });

test('rejects missing, forged, expired and non-owner tokens', async () => {
  const s = await setup();
  assert.equal((await s.call('GET', '/status')).status, 401);
  const other = await keyPair();
  assert.equal((await s.call('GET', '/status', { token: await sign(other.pair, claimsFor(OWNER)) })).status, 401);
  assert.equal((await s.call('GET', '/status', { token: await sign(s.pair, claimsFor(OWNER, { exp: 1 })) })).status, 401);
  assert.equal((await s.call('GET', '/status', { token: await sign(s.pair, claimsFor(OWNER, { aud: 'other' })) })).status, 401);
  const r = await s.call('GET', '/status', { token: await sign(s.pair, claimsFor('someone-else')) });
  assert.equal(r.status, 403);
  assert.equal(r.data.code, 'not_owner');
  assert.equal(s.fake.calls.length, 0);
});

test('foreign origin rejected; status masks key and never returns it', async () => {
  const s = await setup();
  assert.equal((await s.call('GET', '/status', { token: s.ownerToken, origin: 'https://evil.example' })).status, 403);
  const r = await s.call('GET', '/status', { token: s.ownerToken });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(r.data.configured, true);
  assert.equal(r.data.maskedKey, 'sk-ant-…abcd');
  assert.ok(!JSON.stringify(r.data).includes('SECRET'));
});

test('without key: configured false and no Anthropic call', async () => {
  const s = await setup({ envOver: { ANTHROPIC_API_KEY: '' } });
  const st = await s.call('GET', '/status', { token: s.ownerToken });
  assert.equal(st.data.configured, false);
  const r = await s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody() });
  assert.equal(r.status, 503);
  assert.equal(s.fake.calls.length, 0);
});

test('request shape sent to Anthropic: model, caps, no retries, no sampling params', async () => {
  const s = await setup();
  const r = await s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody() });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(s.fake.calls.length, 1);
  const b = s.fake.calls[0].body;
  assert.equal(b.model, 'claude-sonnet-5-5');
  assert.equal(b.max_tokens, 800);
  assert.deepEqual(b.thinking, { type: 'between_tools' });
  assert.equal(b.output_config.effort, 'low');
  assert.equal(b.output_config.format.type, 'json_schema');
  assert.equal(b.temperature, undefined);
  assert.equal(r.data.result.algorithms[0].status, 'unverified');
  assert.deepEqual(r.data.usage, { input: 400, output: 200, cacheRead: 0, cacheWrite: 0 });
  assert.ok(Math.abs(r.data.estimatedCostUsd - (400 * 2 + 200 * 10) / 1e6) < 1e-12);
  const long = await s.call('POST', '/analyze', { token: s.ownerToken, body: { ...sessionBody(), detail: 'long' } });
  assert.equal(long.status, 200);
  assert.equal(s.fake.calls[1].body.max_tokens, 2000);
});

test('cache hit makes no new Anthropic call and adds no usage', async () => {
  const s = await setup();
  await s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody() });
  const again = await s.call('POST', '/analyze', { token: s.ownerToken, body: { ...sessionBody(), payload: { ao5: 41.1, best: 32.4, solves: 12, sessionId: 's1' } } });
  assert.equal(again.data.cached, true);
  assert.equal(again.data.usage, null);
  assert.equal(s.fake.calls.length, 1);
  const st = await s.call('GET', '/status', { token: s.ownerToken });
  assert.equal(st.data.usage.today.requests, 1);
});

test('concurrent identical requests merge into one call', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const s = await setup({ responder: async () => { await gate; return ok(anthropicReply()); } });
  const a = s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody() });
  const b = s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody() });
  await new Promise((r) => setTimeout(r, 20));
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
  assert.equal(s.fake.calls.length, 1);
  assert.ok(ra.data.merged || rb.data.merged);
});

test('budget and request caps refuse before calling', async () => {
  const s = await setup({ envOver: { AI_DAILY_USD: '0.001' } });
  const r = await s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody() });
  assert.equal(r.status, 402);
  assert.equal(r.data.code, 'daily_budget');
  assert.equal(s.fake.calls.length, 0);

  const c = await setup({ envOver: { AI_DAILY_REQUESTS: '1' } });
  assert.equal((await c.call('POST', '/analyze', { token: c.ownerToken, body: sessionBody(1) })).status, 200);
  const r2 = await c.call('POST', '/analyze', { token: c.ownerToken, body: sessionBody(2) });
  assert.equal(r2.data.code, 'daily_requests');
  assert.equal(c.fake.calls.length, 1);
});

test('invalid key: Persian error, reservation released, no retry, key not leaked in logs', async () => {
  const logs = [];
  const s = await setup({ responder: () => err(401, 'authentication_error'), logs });
  const r = await s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody() });
  assert.equal(r.data.code, 'invalid_key');
  assert.ok(r.data.message.includes('کلید نامعتبر'));
  assert.equal(s.fake.calls.length, 1);
  const st = await s.call('GET', '/status', { token: s.ownerToken });
  assert.equal(st.data.usage.today.usd, 0);
  assert.ok(!JSON.stringify(r.data).includes(KEY.slice(-12)));
  assert.ok(logs.every((l) => !l.includes('SECRET')));
  // nothing cached after an error: next manual try calls again
  await s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody() });
  assert.equal(s.fake.calls.length, 2);
});

test('rate limit, overload and refusal mapped', async () => {
  for (const [status, type, code] of [[429, 'rate_limit_error', 'rate_limited'], [529, 'overloaded_error', 'overloaded'], [404, 'not_found_error', 'model_unavailable']]) {
    const s = await setup({ responder: () => err(status, type) });
    const r = await s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody() });
    assert.equal(r.data.code, code, `${status}`);
    assert.equal(s.fake.calls.length, 1);
  }
  const s = await setup({ responder: () => ok(anthropicReply({ stop_reason: 'refusal', content: [] })) });
  const r = await s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody() });
  assert.equal(r.data.code, 'refusal');
});

test('payload schema and size enforced', async () => {
  const s = await setup();
  const bad = await s.call('POST', '/analyze', { token: s.ownerToken, body: { type: 'session', payload: { solves: 3 }, promptVersion: 'p1' } });
  assert.equal(bad.data.code, 'bad_payload');
  const big = await s.call('POST', '/analyze', { token: s.ownerToken, body: { type: 'lesson-question', payload: { lessonId: 'x', question: 'a'.repeat(700) }, promptVersion: 'p1' } });
  assert.equal(big.data.code, 'bad_payload');
  const ver = await s.call('POST', '/analyze', { token: s.ownerToken, body: { ...sessionBody(), promptVersion: 'p0' } });
  assert.equal(ver.data.code, 'prompt_version');
  assert.equal(s.fake.calls.length, 0);
});

test('cancel aborts the running call and keeps the reservation (unknown usage)', async () => {
  const s = await setup({
    responder: (_, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
  });
  const p = s.call('POST', '/analyze', { token: s.ownerToken, body: { ...sessionBody(), requestId: 'req-1' } });
  await new Promise((r) => setTimeout(r, 20));
  const c = await s.call('POST', '/cancel', { token: s.ownerToken, body: { requestId: 'req-1' } });
  assert.equal(c.data.cancelled, true);
  const r = await p;
  assert.equal(r.data.code, 'cancelled');
  const st = await s.call('GET', '/status', { token: s.ownerToken });
  assert.ok(st.data.usage.today.usd > 0);
});

test('owner limits: lower, clamp to ceiling, restore, validation, non-owner rejected', async () => {
  const s = await setup({ envOver: { AI_DAILY_REQUESTS: '10', AI_DAILY_USD: '0.5' } });
  const low = await s.call('PUT', '/limits', { token: s.ownerToken, body: { dailyRequests: 1, monthlyUsd: 2 } });
  assert.equal(low.status, 200);
  assert.equal(low.data.limits.dailyRequests, 1);
  assert.equal(low.data.limits.monthlyUsd, 2);
  assert.equal(low.data.ceilings.dailyRequests, 10);

  const high = await s.call('PUT', '/limits', { token: s.ownerToken, body: { dailyRequests: 500, dailyUsd: 50 } });
  assert.equal(high.data.limits.dailyRequests, 10);
  assert.equal(high.data.limits.dailyUsd, 0.5);

  await s.call('PUT', '/limits', { token: s.ownerToken, body: { dailyRequests: 1 } });
  const restored = await s.call('PUT', '/limits', { token: s.ownerToken, body: { monthlyUsd: null } });
  assert.equal(restored.data.limits.monthlyUsd, 5);
  assert.equal(restored.data.limits.dailyRequests, 1);

  for (const body of [{ dailyUsd: -1 }, { dailyRequests: 1.5 }, { dailyUsd: 'x' }, { monthlyRequests: 1e9 }, { timeoutMs: 1 }, {}]) {
    const r = await s.call('PUT', '/limits', { token: s.ownerToken, body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.data.code, 'bad_limits');
  }
  const other = await s.call('PUT', '/limits', { token: await sign(s.pair, claimsFor('intruder')), body: { dailyRequests: 0 } });
  assert.equal(other.status, 403);
  assert.equal((await s.call('PUT', '/limits', { body: { dailyRequests: 0 } })).status, 401);
});

test('effective owner limits are enforced before calling', async () => {
  const s = await setup();
  await s.call('PUT', '/limits', { token: s.ownerToken, body: { dailyRequests: 1 } });
  assert.equal((await s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody(1) })).status, 200);
  const r = await s.call('POST', '/analyze', { token: s.ownerToken, body: sessionBody(2) });
  assert.equal(r.data.code, 'daily_requests');
  assert.equal(s.fake.calls.length, 1);

  const b = await setup();
  await b.call('PUT', '/limits', { token: b.ownerToken, body: { monthlyUsd: 0 } });
  const r2 = await b.call('POST', '/analyze', { token: b.ownerToken, body: sessionBody() });
  assert.equal(r2.data.code, 'monthly_budget');
  assert.equal(b.fake.calls.length, 0);
});
