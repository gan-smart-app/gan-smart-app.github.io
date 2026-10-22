// HTTP layer, kept free of Cloudflare-only imports so it runs under node --test.

import { AiError } from './service.mjs';

const MAX_BODY = 16 * 1024;

function cors(env, request) {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== env.ALLOWED_ORIGIN) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

const fail = (status, code, message, headers) => json(status, { ok: false, code, message }, headers);

// Public entry. `verify` returns token claims or null; `forward` sends the
// authenticated request to the Durable Object.
export async function handle(request, env, { verify, forward }) {
  const headers = cors(env, request);
  const origin = request.headers.get('Origin');
  if (origin && origin !== env.ALLOWED_ORIGIN) return fail(403, 'origin', 'مبدأ درخواست مجاز نیست.');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;
  if (!['GET /status', 'POST /analyze', 'POST /cancel', 'PUT /limits'].includes(route)) return fail(404, 'not_found', 'مسیر وجود ندارد.', headers);
  if (!env.FIREBASE_PROJECT_ID || !env.OWNER_UID) return fail(503, 'server_config', 'سرور تحلیل کامل پیکربندی نشده است.', headers);

  const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '')?.[1];
  let claims = null;
  try {
    claims = token ? await verify(token) : null;
  } catch {
    return fail(503, 'auth_unavailable', 'بررسی ورود موقتاً ممکن نیست.', headers);
  }
  if (!claims) return fail(401, 'unauthenticated', 'ورود نامعتبر است؛ دوباره وارد حساب شو.', headers);
  if (claims.sub !== env.OWNER_UID) return fail(403, 'not_owner', 'این حساب اجازهٔ استفاده ندارد.', headers);

  let body = null;
  if (request.method === 'POST' || request.method === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_BODY) return fail(413, 'too_large', 'درخواست بیش از حد بزرگ است.', headers);
    try {
      body = JSON.parse(text);
    } catch {
      return fail(400, 'bad_json', 'بدنهٔ درخواست JSON معتبر نیست.', headers);
    }
  }
  const inner = new Request('https://ai.internal' + url.pathname, {
    method: request.method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await forward(inner);
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

// Inside the Durable Object.
export async function serviceHandler(service, request) {
  const path = new URL(request.url).pathname;
  try {
    if (path === '/status') return json(200, { ok: true, ...(await service.status()) });
    const body = await request.json();
    if (path === '/cancel') return json(200, { ok: true, cancelled: service.cancel(String(body?.requestId || '')) });
    if (path === '/limits') return json(200, { ok: true, ...(await service.setLimits(body)) });
    if (path === '/analyze') return json(200, { ok: true, ...(await service.analyze(body)) });
    return fail(404, 'not_found', 'مسیر وجود ندارد.');
  } catch (e) {
    if (e instanceof AiError) return fail(e.status, e.code, e.message);
    service.log?.('ai_internal_error');
    return fail(500, 'internal', 'خطای داخلی سرور تحلیل.');
  }
}
