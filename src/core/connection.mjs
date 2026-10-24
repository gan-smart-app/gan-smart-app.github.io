// Product adapter around the unchanged GAN v15 connection layer
// (public/gan-v15/*). It only manages product state, attempts and the
// event log; the BLE protocol, polling, recovery and timeouts stay in v15.
// Attempt/cancel handling mirrors v15 app.js: a counter isolates late
// results, cancel frees the UI immediately, and requestDevice is reached
// synchronously from the user's click.

import { fromFacelets } from './cube.mjs';

export const V15_URL = 'gan-v15/connection.js?v=15';

const STAGE_TEXT = {
  select: 'دو سه حرکت معمولی به روبیک بده، سپس آن را در پنجرهٔ بلوتوث Chrome انتخاب کن.',
  prepare: 'در حال تشخیص سرویس بلوتوث روبیک…',
  services: 'سرویس‌های بلوتوث خوانده شد…',
  reconnect: 'سرویس دریافت نشد؛ یک بار اتصال دوباره برقرار می‌شود…',
  gatt: 'در حال برقراری ارتباط بلوتوث؛ روبیک را نزدیک نگه دار…',
  protocol: 'پروتکل شناسایی شد؛ آماده دریافت حرکت‌ها…',
  legacy: 'مدل روبیک شناسایی شد؛ چند لحظه آن را ثابت نگه دار.',
  verify: 'در حال تأیید وضعیت واقعی روبیک…',
  advertisement: 'در حال خواندن اطلاعات بلوتوث؛ چند حرکت به روبیک بده…',
  turns: 'برای شناسایی، یک وجه روبیک را آهسته بچرخان.',
  search: 'در حال بازیابی اتصال روی همین دستگاه…',
};

export function bluetoothSupport(nav = globalThis.navigator, ctx = globalThis) {
  if (!nav?.bluetooth) {
    return {
      ok: false,
      reason: ctx.isSecureContext === false ? 'insecure' : 'no-api',
      text: ctx.isSecureContext === false
        ? 'اتصال بلوتوث فقط روی HTTPS یا همین مک (localhost) کار می‌کند. نشانی امن برنامه را باز کن.'
        : 'این مرورگر بلوتوث وب ندارد. برنامه را مستقیماً در Chrome مک یا Chrome اندروید باز کن؛ مرورگرهای دیگر آزموده نشده‌اند.',
    };
  }
  return { ok: true };
}

export class CubeLink {
  constructor({ load = () => import(/* @vite-ignore */ new URL(V15_URL, document.baseURI).href), now = () => performance.now(), maxLog = 300 } = {}) {
    this.load = load;
    this.now = now;
    this.maxLog = maxLog;
    this.module = null;
    this.listeners = new Set();
    this.attempt = 0;
    this.abort = null;
    this.conn = null;
    this.subscription = null;
    this.hintTimer = null;
    this.batch = null;
    this.log = [];
    this.state = {
      status: 'idle', // idle | selecting | connecting | ready | recovering | error
      stage: null,
      message: '',
      error: null,
      deviceName: null,
      battery: null,
      facelets: null,
      pickerHint: false,
      diagnostic: null,
      lastStateAt: null,
    };
  }

  // Loads v15 ahead of time so connect() can reach requestDevice inside the click.
  async preload() {
    if (!this.module) this.module = await this.load();
    return this.module;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, detail = {}) {
    for (const fn of this.listeners) fn({ type, ...detail });
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.emit('state', { state: this.state });
  }

  record(kind, detail = '') {
    this.log.push({ at: new Date().toISOString(), kind, detail: String(detail).slice(0, 300) });
    if (this.log.length > this.maxLog) this.log.splice(0, this.log.length - this.maxLog);
  }

  get busy() {
    return this.state.status === 'selecting' || this.state.status === 'connecting';
  }

  // Must be called directly from a click/tap handler.
  connect() {
    if (this.busy || this.conn) return Promise.resolve(false);
    const support = bluetoothSupport();
    if (!support.ok) {
      this.set({ status: 'error', error: support.reason, message: support.text });
      return Promise.resolve(false);
    }
    if (!this.module) {
      this.set({ status: 'error', error: 'not-loaded', message: 'لایهٔ اتصال هنوز بارگذاری نشده است؛ چند لحظه بعد دوباره بزن.' });
      return Promise.resolve(false);
    }
    const attempt = ++this.attempt;
    const controller = new AbortController();
    this.abort = controller;
    this.record('connect-start', 'attempt ' + attempt);
    this.set({ status: 'selecting', stage: 'select', message: STAGE_TEXT.select, error: null, pickerHint: false });
    const promise = this.module.connectCube({
      signal: controller.signal,
      onProgress: (stage, data = {}) => {
        if (attempt !== this.attempt) return;
        clearTimeout(this.hintTimer);
        if (stage === 'select') {
          this.hintTimer = setTimeout(() => {
            if (attempt === this.attempt && this.state.stage === 'select') this.set({ pickerHint: true });
          }, 8000);
        }
        this.record('stage', stage + (data.name ? ' ' + data.name : '') + (data.operation ? ' ' + data.operation : ''));
        this.set({
          status: stage === 'select' ? 'selecting' : 'connecting',
          stage,
          deviceName: data.name || this.state.deviceName,
          message: STAGE_TEXT[stage] || this.state.message,
        });
      },
    });
    return promise.then(
      async (result) => {
        if (attempt !== this.attempt) {
          // A cancelled attempt finished late: release it without touching state.
          this.record('stale-result', 'attempt ' + attempt);
          await result.connection.disconnect().catch(() => {});
          return false;
        }
        clearTimeout(this.hintTimer);
        this.abort = null;
        if (!this.module.validFacelets(result.state) || !fromFacelets(result.state.facelets)) {
          await result.connection.disconnect().catch(() => {});
          this.set({ status: 'error', stage: null, error: 'invalid-state', message: 'وضعیت دریافتی روبیک معتبر نبود؛ اتصال برقرار نشد.' });
          return false;
        }
        this.conn = result.connection;
        this.subscription = this.conn.events$.subscribe({
          next: (e) => this.onEvent(e),
          error: (e) => {
            this.record('stream-error', e?.message);
            this.dropConnection('stream-error', 'دریافت داده متوقف شد. دوباره وصل شو.');
          },
        });
        this.record('ready', this.conn.deviceName);
        this.set({ status: 'ready', stage: null, deviceName: this.conn.deviceName, message: 'وضعیت معتبر روبیک دریافت شد.' });
        this.onEvent(result.state);
        this.conn.sendCubeCommand({ type: 'REQUEST_BATTERY' }).catch(() => {});
        return true;
      },
      (e) => {
        if (attempt !== this.attempt) return false;
        clearTimeout(this.hintTimer);
        this.abort = null;
        const cancelled = e?.name === 'NotFoundError' || e?.name === 'AbortError';
        this.record('connect-error', (e?.name || 'Error') + ': ' + (e?.message || ''));
        this.set({
          status: cancelled ? 'idle' : 'error',
          stage: null,
          error: cancelled ? null : e?.name || 'Error',
          pickerHint: e?.name === 'PickerPendingError' || e?.operation === 'select',
          message: cancelled ? 'اتصال لغو شد.' : e?.name === 'PickerPendingError'
            ? 'پنجرهٔ انتخاب قبلی Chrome هنوز باز است؛ آن را ببند یا صفحه را تازه کن.'
            : 'اتصال کامل نشد: ' + (e?.message || 'خطای نامشخص'),
        });
        return false;
      },
    );
  }

  // Frees the UI at once; the native chooser may still need closing by the user.
  cancel() {
    if (!this.busy) return;
    const selecting = this.state.stage === 'select';
    this.attempt++;
    clearTimeout(this.hintTimer);
    const controller = this.abort;
    this.abort = null;
    controller?.abort();
    this.record('connect-cancel', selecting ? 'during select' : 'during connect');
    this.set({
      status: 'idle',
      stage: null,
      pickerHint: selecting,
      message: selecting
        ? 'تلاش اتصال لغو شد. اگر پنجرهٔ بلوتوث Chrome باز مانده، آن را هم ببند.'
        : 'تلاش اتصال لغو شد.',
    });
  }

  async disconnect() {
    if (this.busy) return this.cancel();
    const conn = this.conn;
    this.dropConnection('manual', 'اتصال به‌صورت دستی قطع شد.');
    if (conn) await conn.disconnect().catch(() => {});
  }

  dropConnection(reason, message) {
    this.subscription?.unsubscribe?.();
    this.subscription = null;
    const had = !!this.conn;
    this.conn = null;
    this.flushBatch();
    if (had) this.emit('invalidate', { reason });
    this.set({ status: reason === 'manual' ? 'idle' : 'error', stage: null, facelets: null, battery: null, error: reason === 'manual' ? null : reason, message });
  }

  onEvent(e) {
    switch (e.type) {
      case 'MOVE': {
        if (!this.batch) {
          this.batch = { id: this.now(), moves: [] };
          queueMicrotask(() => this.flushBatch());
        }
        this.batch.moves.push(e.move);
        this.emit('move', { move: e.move, at: e.timestamp ?? this.now(), batchId: this.batch.id });
        break;
      }
      case 'FACELETS':
        this.flushBatch();
        if (this.module.validFacelets(e) && fromFacelets(e.facelets)) {
          this.record('facelets', 'valid');
          this.set({ facelets: e.facelets, lastStateAt: Date.now() });
          this.emit('facelets', { facelets: e.facelets });
        } else {
          this.record('facelets', 'invalid');
        }
        break;
      case 'BATTERY':
        this.set({ battery: e.batteryLevel });
        break;
      case 'CONNECTION_PAUSED':
        this.flushBatch();
        this.record('paused', e.reason);
        this.emit('invalidate', { reason: 'paused:' + (e.reason || '') });
        this.set({ status: 'recovering', message: 'ارتباط در حال بازیابی خودکار است؛ حل جاری معتبر نیست.' });
        break;
      case 'CONNECTION_RESUMED':
        this.record('resumed');
        this.set({ status: 'ready', message: 'ارتباط دوباره برقرار شد و وضعیت مکعب خوانده شد. برای حل تازه دوباره آماده شو.' });
        break;
      case 'SYNC_LOST':
        this.flushBatch();
        this.record('sync-lost');
        this.emit('invalidate', { reason: 'sync-lost' });
        this.set({ message: 'بیش از شش حرکت بین دو خواندن رسید؛ وضعیت روبیک دوباره خوانده شد. تایمر حل جاری ادامه دارد، ولی فهرست حرکت‌هایش کامل نیست.' });
        break;
      case 'CONNECTION_DIAGNOSTIC':
        this.record('diagnostic', e.reason);
        this.set({ diagnostic: sanitizeDiagnostic(e) });
        break;
      case 'DISCONNECT':
        this.record('disconnect', e.reason);
        this.dropConnection(e.reason || 'link-lost', e.reason === 'recovery-exhausted'
          ? 'بازیابی پس از ۵ تلاش کامل نشد. روبیک را با چند حرکت بیدار کن و دوباره وصل شو.'
          : 'اتصال روبیک قطع شد. دوباره وصل شو.');
        break;
      default:
        break;
    }
  }

  flushBatch() {
    if (!this.batch) return;
    const b = this.batch;
    this.batch = null;
    if (b.moves.length > 1) this.emit('batch', { batchId: b.id, size: b.moves.length });
  }

  async requestState() {
    if (!this.conn) throw new Error('روبیک متصل نیست.');
    this.record('request-state');
    await this.conn.sendCubeCommand({ type: 'REQUEST_FACELETS' });
  }

  // Only after the user confirmed the physical cube is fully solved.
  async markSolved() {
    if (!this.conn) throw new Error('روبیک متصل نیست.');
    this.record('mark-solved');
    await this.conn.sendCubeCommand({ type: 'REQUEST_RESET' });
  }

  async forgetDevice() {
    if (!this.module) return false;
    return this.module.forgetLastDevice();
  }

  // Troubleshooting export: no account data, tokens or keys are ever part of it.
  exportLog() {
    return {
      kind: 'gan-smart-connection-log',
      connectionVersion: 15,
      exportedAt: new Date().toISOString(),
      userAgent: globalThis.navigator?.userAgent || '',
      state: { status: this.state.status, deviceName: this.state.deviceName, battery: this.state.battery },
      diagnostic: this.state.diagnostic,
      events: this.log,
    };
  }
}

function sanitizeDiagnostic(e) {
  const pick = ['reason', 'mode', 'recoveryStage', 'reconnectAttempts', 'timeouts', 'linkLosses', 'readErrors', 'reconnections', 'lastSessionMs', 'lastError', 'readLengths', 'trace'];
  const out = {};
  for (const k of pick) if (e[k] !== undefined) out[k] = e[k];
  return out;
}
