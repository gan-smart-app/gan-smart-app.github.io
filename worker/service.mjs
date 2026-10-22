// Analysis service run inside one Durable Object instance, so budget
// accounting, the result cache and in-flight merging see every request.
// `storage` needs async get/put/delete (Durable Object storage or a Map adapter).

import Anthropic from '@anthropic-ai/sdk';
import { DETAIL, OUTPUT_SCHEMA, PROMPT_VERSION, SYSTEM_PROMPT, TASKS, canonicalJson, userMessage, validatePayload } from './prompt.mjs';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));

export function readConfig(env) {
  return {
    model: env.MODEL || DEFAULT_MODEL,
    limits: {
      dailyRequests: num(env.AI_DAILY_REQUESTS, 10),
      monthlyRequests: num(env.AI_MONTHLY_REQUESTS, 100),
      dailyUsd: num(env.AI_DAILY_USD, 0.5),
      monthlyUsd: num(env.AI_MONTHLY_USD, 5),
      maxInputChars: num(env.AI_MAX_INPUT_CHARS, 6000),
      minIntervalSec: num(env.AI_MIN_INTERVAL_SEC, 3),
      timeoutMs: num(env.AI_TIMEOUT_MS, 45000),
    },
    // USD per million tokens; update when Anthropic's price list changes.
    pricing: {
      input: num(env.PRICE_INPUT_PER_MTOK, 2),
      output: num(env.PRICE_OUTPUT_PER_MTOK, 10),
      cacheWrite: num(env.PRICE_CACHE_WRITE_PER_MTOK, 2.5),
      cacheRead: num(env.PRICE_CACHE_READ_PER_MTOK, 0.1),
    },
  };
}

export function maskKey(key) {
  if (!key || key.length < 12) return null;
  return 'sk-ant-…' + key.slice(-4);
}

export function costOf(usage, pricing) {
  return (
    (usage.input * pricing.input + usage.output * pricing.output + usage.cacheWrite * pricing.cacheWrite + usage.cacheRead * pricing.cacheRead) /
    1e6
  );
}

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class AiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Maps SDK errors to Persian messages. `charged` says whether the request may
// have been billed (unknown outcome keeps the reservation).
export function mapError(e) {
  if (e instanceof AiError) return { error: e, charged: false };
  if (e instanceof Anthropic.APIUserAbortError) return { error: new AiError(499, 'cancelled', 'درخواست لغو شد.'), charged: true };
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { error: new AiError(504, 'timeout', 'پاسخ مدل در زمان مقرر نرسید. اگر لازم است دستی دوباره تلاش کن.'), charged: true };
  if (e instanceof Anthropic.APIConnectionError) return { error: new AiError(502, 'network', 'ارتباط سرور با Anthropic برقرار نشد.'), charged: true };
  if (e instanceof Anthropic.AuthenticationError) return { error: new AiError(502, 'invalid_key', 'کلید نامعتبر است؛ کلید API سرور را بررسی کن.'), charged: false };
  if (e instanceof Anthropic.PermissionDeniedError) return { error: new AiError(502, 'permission', 'حساب Anthropic به این مدل یا قابلیت دسترسی ندارد.'), charged: false };
  if (e instanceof Anthropic.NotFoundError) return { error: new AiError(502, 'model_unavailable', 'مدل تنظیم‌شده برای این حساب در دسترس نیست.'), charged: false };
  if (e instanceof Anthropic.RateLimitError) return { error: new AiError(429, 'rate_limited', 'محدودیت نرخ Anthropic؛ کمی بعد دستی دوباره تلاش کن.'), charged: false };
  if (e instanceof Anthropic.BadRequestError) return { error: new AiError(502, 'bad_request', 'Anthropic درخواست را نپذیرفت (ممکن است اعتبار حساب یا پارامترها مشکل داشته باشد).'), charged: false };
  if (e instanceof Anthropic.APIError && e.status === 529) return { error: new AiError(503, 'overloaded', 'سرویس Anthropic موقتاً شلوغ است؛ بعداً دستی تلاش کن.'), charged: false };
  if (e instanceof Anthropic.APIError && e.status === 402) return { error: new AiError(402, 'billing', 'اعتبار یا صورتحساب حساب Anthropic مشکل دارد.'), charged: false };
  if (e instanceof Anthropic.APIError) return { error: new AiError(502, 'upstream', 'خطای سرویس Anthropic.'), charged: true };
  return { error: new AiError(500, 'internal', 'خطای داخلی سرور تحلیل.'), charged: true };
}

// Owner-adjustable limits; env values are the hard ceilings.
export const ADJUSTABLE = { dailyRequests: 10000, monthlyRequests: 100000, dailyUsd: 1000, monthlyUsd: 10000 };

export function validateLimitsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return 'دادهٔ سقف‌ها باید یک شیء باشد.';
  const keys = Object.keys(patch);
  if (!keys.length) return 'هیچ سقفی ارسال نشده است.';
  for (const k of keys) {
    if (!(k in ADJUSTABLE)) return `سقف «${k}» قابل تنظیم نیست.`;
    const v = patch[k];
    if (v === null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > ADJUSTABLE[k]) return `مقدار «${k}» نامعتبر است.`;
    if (k.endsWith('Requests') && !Number.isInteger(v)) return `مقدار «${k}» باید عدد صحیح باشد.`;
  }
  return null;
}

const utcDay = (t) => new Date(t).toISOString().slice(0, 10);
const utcMonth = (t) => new Date(t).toISOString().slice(0, 7);
const emptyUsage = () => ({ requests: 0, usd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export class AiService {
  constructor({ storage, env, createClient, now = () => Date.now(), log = () => {} }) {
    this.storage = storage;
    this.env = env;
    this.config = readConfig(env);
    this.now = now;
    this.log = log;
    this.createClient =
      createClient ||
      ((e, timeout) => new Anthropic({ apiKey: e.ANTHROPIC_API_KEY, maxRetries: 0, timeout }));
    this.inflight = new Map(); // cacheKey -> promise
    this.controllers = new Map(); // requestId -> {controller, cacheKey}
    this.lock = Promise.resolve();
  }

  configured() {
    return Boolean(this.env.ANTHROPIC_API_KEY);
  }

  // Serialises read-modify-write of the usage counters.
  withLock(fn) {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => {});
    return run;
  }

  async usage(period) {
    return (await this.storage.get('usage:' + period)) || emptyUsage();
  }

  // Effective limit = min(owner value, env ceiling); a missing owner value means the ceiling.
  async limits() {
    const owner = (await this.storage.get('limits')) || {};
    const out = { ...this.config.limits };
    for (const k of Object.keys(ADJUSTABLE)) {
      if (typeof owner[k] === 'number') out[k] = Math.min(owner[k], this.config.limits[k]);
    }
    return out;
  }

  async setLimits(patch) {
    const invalid = validateLimitsPatch(patch);
    if (invalid) throw new AiError(400, 'bad_limits', invalid);
    await this.withLock(async () => {
      const owner = (await this.storage.get('limits')) || {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete owner[k];
        else owner[k] = v;
      }
      await this.storage.put('limits', owner);
    });
    return this.status();
  }

  async status() {
    const t = this.now();
    const [today, month, limits] = await Promise.all([this.usage(utcDay(t)), this.usage(utcMonth(t)), this.limits()]);
    const c = this.config.limits;
    return {
      configured: this.configured(),
      model: this.config.model,
      maskedKey: maskKey(this.env.ANTHROPIC_API_KEY),
      promptVersion: PROMPT_VERSION,
      limits,
      ceilings: { dailyRequests: c.dailyRequests, monthlyRequests: c.monthlyRequests, dailyUsd: c.dailyUsd, monthlyUsd: c.monthlyUsd },
      pricing: this.config.pricing,
      usage: { today, month },
      estimatedCostUsd: { today: today.usd, month: month.usd },
      costNote: 'هزینه تخمینی بر اساس تعرفهٔ تنظیم‌شده است و صورتحساب قطعی Anthropic نیست.',
    };
  }

  async cacheKey(type, payload, detail) {
    return sha256([type, canonicalJson(payload), this.config.model, PROMPT_VERSION, detail].join('\u0000'));
  }

  async analyze(body) {
    const { type, payload, detail = 'short', promptVersion = PROMPT_VERSION } = body || {};
    if (!TASKS[type]) throw new AiError(400, 'bad_type', 'نوع درخواست پشتیبانی نمی‌شود.');
    if (!DETAIL[detail]) throw new AiError(400, 'bad_detail', 'سطح جزئیات نامعتبر است.');
    if (promptVersion !== PROMPT_VERSION) throw new AiError(409, 'prompt_version', 'نسخهٔ دستور برنامه با سرور هم‌خوان نیست؛ صفحه را تازه کن.');
    const invalid = validatePayload(type, payload, this.config.limits.maxInputChars);
    if (invalid) throw new AiError(400, 'bad_payload', invalid);
    if (!this.configured()) throw new AiError(503, 'not_configured', 'هوشواره روی سرور پیکربندی نشده است.');

    const key = await this.cacheKey(type, payload, detail);
    const cached = await this.storage.get('cache:' + key);
    if (cached) return { ...cached, cached: true, usage: null, estimatedCostUsd: 0 };

    const running = this.inflight.get(key);
    if (running) return { ...(await running), merged: true, usage: null, estimatedCostUsd: 0 };

    const requestId = typeof body.requestId === 'string' && body.requestId.length <= 64 ? body.requestId : crypto.randomUUID();
    const promise = this.call(key, requestId, type, payload, detail);
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  async call(key, requestId, type, payload, detail) {
    const { pricing, model } = this.config;
    const timeoutMs = this.config.limits.timeoutMs;
    const maxTokens = DETAIL[detail].maxTokens;
    const text = userMessage(type, payload, detail);
    // Pessimistic: UTF-8 bytes bound the token count of Persian/ASCII text.
    const inputBound = new TextEncoder().encode(SYSTEM_PROMPT + text).length + 200;
    const reservation = costOf({ input: inputBound, output: maxTokens, cacheRead: 0, cacheWrite: 0 }, pricing);
    const t = this.now();
    const day = utcDay(t), month = utcMonth(t);

    await this.withLock(async () => {
      const limits = await this.limits();
      const [d, m] = [await this.usage(day), await this.usage(month)];
      const last = (await this.storage.get('lastRequestAt')) || 0;
      if (t - last < limits.minIntervalSec * 1000) throw new AiError(429, 'too_fast', 'درخواست‌ها پشت‌سرهم بودند؛ چند ثانیه بعد دوباره تلاش کن.');
      if (d.requests >= limits.dailyRequests) throw new AiError(429, 'daily_requests', 'سقف تعداد درخواست امروز پر شده است.');
      if (m.requests >= limits.monthlyRequests) throw new AiError(429, 'monthly_requests', 'سقف تعداد درخواست این ماه پر شده است.');
      if (d.usd + reservation > limits.dailyUsd) throw new AiError(402, 'daily_budget', 'بودجهٔ روزانهٔ هوشواره کافی نیست.');
      if (m.usd + reservation > limits.monthlyUsd) throw new AiError(402, 'monthly_budget', 'بودجهٔ ماهانهٔ هوشواره کافی نیست.');
      d.requests++; m.requests++;
      d.usd += reservation; m.usd += reservation;
      await this.storage.put('usage:' + day, d);
      await this.storage.put('usage:' + month, m);
      await this.storage.put('lastRequestAt', t);
    });

    const settle = (actual, tokens) =>
      this.withLock(async () => {
        for (const p of [day, month]) {
          const u = await this.usage(p);
          u.usd = Math.max(0, u.usd - reservation + actual);
          if (tokens) for (const k of ['input', 'output', 'cacheRead', 'cacheWrite']) u[k] += tokens[k];
          await this.storage.put('usage:' + p, u);
        }
      });

    const controller = new AbortController();
    this.controllers.set(requestId, { controller, key });
    let message;
    try {
      const client = this.createClient(this.env, timeoutMs);
      message = await client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          system: SYSTEM_PROMPT,
          thinking: { type: 'between_tools' },
          output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
          messages: [{ role: 'user', content: text }],
        },
        { signal: controller.signal },
      );
    } catch (e) {
      const { error, charged } = mapError(e);
      this.log(`ai_error status=${e?.status ?? '-'} code=${error.code}`);
      if (!charged) await settle(0, null);
      throw error;
    } finally {
      this.controllers.delete(requestId);
    }

    const u = message.usage || {};
    const tokens = {
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      cacheWrite: u.cache_creation_input_tokens || 0,
    };
    const actual = costOf(tokens, pricing);
    await settle(actual, tokens);

    if (message.stop_reason === 'refusal') throw new AiError(422, 'refusal', 'مدل به این درخواست پاسخ نداد.');
    if (message.stop_reason === 'max_tokens') throw new AiError(502, 'truncated', 'پاسخ مدل ناقص ماند؛ در صورت نیاز «توضیح مفصل‌تر» را دستی بخواه.');
    let parsed;
    try {
      const block = message.content.find((b) => b.type === 'text');
      parsed = JSON.parse(block.text);
    } catch {
      throw new AiError(502, 'bad_output', 'پاسخ مدل قالب معتبری نداشت.');
    }
    const result = {
      summary: String(parsed.summary || ''),
      points: Array.isArray(parsed.points) ? parsed.points.map(String) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
      // Sequences from the model are never trusted; the client verifies them with the cube engine.
      algorithms: (Array.isArray(parsed.algorithms) ? parsed.algorithms : []).map((a) => ({
        name: String(a?.name || ''), moves: String(a?.moves || ''), note: String(a?.note || ''), status: 'unverified',
      })),
    };
    const record = { result, model: message.model || model, promptVersion: PROMPT_VERSION, type, detail, createdAt: this.now() };
    await this.storage.put('cache:' + key, record);
    return { ...record, cached: false, requestId, usage: tokens, estimatedCostUsd: actual };
  }

  cancel(requestId) {
    const entry = this.controllers.get(requestId);
    if (!entry) return false;
    entry.controller.abort();
    return true;
  }
}
