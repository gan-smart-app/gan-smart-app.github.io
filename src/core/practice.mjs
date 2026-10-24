// Practice flow: guided scramble → ready → (inspection) → solving → result.
// Pure state machine fed by device snapshots and moves; it never writes to
// the device. Timing is host receipt time of the moves (performance.now()),
// not a device timestamp.

import {
  applyMove, fromFacelets, invertMove, isSolved, simplifyAlg, stateFromAlg, statesEqual, toFacelets,
} from './cube.mjs';

export const PHASES = {
  noCube: 'noCube',         // no valid model yet
  idle: 'idle',             // valid model, nothing planned
  planning: 'planning',     // computing a path to the scramble target
  scrambling: 'scrambling', // guided scramble in progress
  freePrep: 'freePrep',     // free practice: user scrambles any way
  ready: 'ready',           // target confirmed, waiting for first solving move
  inspecting: 'inspecting',
  solving: 'solving',
  done: 'done',
  invalid: 'invalid',
};

export const INSPECTION_GRACE_MS = 2000;

export class Practice {
  constructor({ findPath, now = () => performance.now(), onChange = () => {}, onResult = () => {} } = {}) {
    this.findPath = findPath; // async (fromState, toState) => moves[]
    this.now = now;
    this.onChange = onChange;
    this.onResult = onResult;
    this.model = null;
    this.planToken = 0;
    this.s = {
      phase: PHASES.noCube,
      mode: 'scramble', // scramble | free
      scramble: null,
      target: null,
      remaining: [],
      done: [],
      deviated: false,
      startFacelets: null,
      startAt: null,
      inspectionAt: null,
      inspectionMs: 15000,
      inspectionEnabled: false,
      penalty: null,
      moves: [],
      movesComplete: true,
      result: null,
      invalidReason: null,
      message: '',
    };
  }

  get state() { return this.s; }

  update(patch) {
    this.s = { ...this.s, ...patch };
    this.onChange(this.s);
  }

  settings({ inspectionEnabled, inspectionMs }) {
    this.update({
      inspectionEnabled: inspectionEnabled ?? this.s.inspectionEnabled,
      inspectionMs: inspectionMs ?? this.s.inspectionMs,
    });
  }

  // Valid snapshot from the device (initial, resync after SYNC_LOST, manual read).
  setModel(facelets) {
    const st = fromFacelets(facelets);
    if (!st) return;
    const tracked = this.model;
    this.model = st;
    const p = this.s.phase;
    if (p === PHASES.noCube) {
      this.update({ phase: PHASES.idle });
      if (this.s.scramble) this.startScramble(this.s.scramble);
    } else if (p === PHASES.scrambling || p === PHASES.planning) {
      this.startScramble(this.s.scramble);
    } else if (p === PHASES.solving) {
      // A snapshot that disagrees with the tracked solve means moves were not
      // seen: follow the real cube so a physically solved cube still stops the timer.
      if (tracked && statesEqual(st, tracked)) return;
      this.s.movesComplete = false;
      this.checkSolved(this.now());
    } else if (p === PHASES.ready || p === PHASES.inspecting) {
      // A fresh snapshot while waiting must still match the target.
      if (this.s.mode === 'scramble' && !statesEqual(st, this.s.target)) this.startScramble(this.s.scramble);
      else this.update({ startFacelets: toFacelets(st) });
    }
  }

  // Device lost moves or the link: the current attempt can never become a valid record.
  invalidate(reason) {
    // The model is stale until the next valid snapshot arrives.
    this.model = null;
    this.planToken++;
    const p = this.s.phase;
    if (p === PHASES.solving || p === PHASES.inspecting || p === PHASES.ready) {
      this.update({
        phase: PHASES.invalid,
        invalidReason: reason,
        startAt: null,
        message: 'این تلاش به دلیل ' + reasonText(reason) + ' معتبر نیست و ذخیره نشد. پس از وضعیت معتبر، دوباره آماده شو.',
      });
    } else if (p === PHASES.scrambling || p === PHASES.planning) {
      this.update({ phase: this.model ? PHASES.planning : PHASES.noCube, message: 'همگامی قطع شد؛ مسیر اسکرَمبل پس از وضعیت معتبر دوباره محاسبه می‌شود.' });
    } else if (!this.model) {
      this.update({ phase: PHASES.noCube });
    }
  }

  // Disconnect without a pending attempt.
  noCube() {
    this.model = null;
    this.planToken++;
    if (this.s.phase === PHASES.solving || this.s.phase === PHASES.inspecting || this.s.phase === PHASES.ready) this.invalidate('disconnect');
    else this.update({ phase: PHASES.noCube });
  }

  async startScramble(scramble) {
    const token = ++this.planToken;
    const target = stateFromAlg(scramble);
    this.update({ mode: 'scramble', scramble, target, result: null, invalidReason: null, penalty: null, moves: [], done: [], deviated: false, message: '' });
    if (!this.model) return this.update({ phase: PHASES.noCube });
    if (statesEqual(this.model, target)) return this.becomeReady();
    if (isSolved(this.model)) return this.update({ phase: PHASES.scrambling, remaining: simplifyAlg(scramble) });
    this.update({ phase: PHASES.planning });
    try {
      const path = await this.findPath(this.model, target);
      if (token !== this.planToken) return;
      this.update({ phase: PHASES.scrambling, remaining: path, message: 'روبیک از ابتدا حل نبود؛ مسیر رسیدن به همین اسکرَمبل از وضعیت فعلی محاسبه شد.' });
    } catch (e) {
      if (token !== this.planToken) return;
      this.update({ phase: PHASES.idle, message: 'محاسبهٔ مسیر انجام نشد: ' + e.message });
    }
  }

  startFree() {
    this.planToken++;
    this.update({ mode: 'free', scramble: null, target: null, remaining: [], phase: this.model ? PHASES.freePrep : PHASES.noCube, result: null, invalidReason: null, message: '' });
  }

  // Free practice: the user says the cube is scrambled.
  armFree() {
    if (this.s.phase !== PHASES.freePrep || !this.model) return false;
    if (isSolved(this.model)) {
      this.update({ message: 'روبیک هنوز حل‌شده است؛ ابتدا آن را درهم بریز.' });
      return false;
    }
    this.becomeReady();
    return true;
  }

  becomeReady() {
    this.update({ phase: PHASES.ready, remaining: [], startFacelets: toFacelets(this.model), startAt: null, moves: [], penalty: null, message: '' });
  }

  startInspection() {
    if (this.s.phase !== PHASES.ready || !this.s.inspectionEnabled) return;
    this.update({ phase: PHASES.inspecting, inspectionAt: this.now() });
  }

  // Inspection overrun: WCA-style +2 within the grace window, DNF after it.
  inspectionPenalty(at = this.now()) {
    if (this.s.inspectionAt == null) return null;
    const over = at - this.s.inspectionAt - this.s.inspectionMs;
    if (over <= 0) return null;
    return over <= INSPECTION_GRACE_MS ? '+2' : 'DNF';
  }

  cancel() {
    this.planToken++;
    const p = this.s.phase;
    if (p === PHASES.solving || p === PHASES.inspecting || p === PHASES.ready) {
      this.update({ phase: PHASES.invalid, invalidReason: 'cancel', startAt: null, message: 'تلاش لغو شد و چیزی ذخیره نشد.' });
    }
  }

  move(move, at, batchId) {
    if (!this.model) return;
    this.model = applyMove(this.model, move);
    const p = this.s.phase;
    if (p === PHASES.planning) return this.startScramble(this.s.scramble);
    if (p === PHASES.scrambling) return this.scrambleStep(move);
    if (p === PHASES.ready || p === PHASES.inspecting) {
      const penalty = p === PHASES.inspecting ? this.inspectionPenalty(at) : null;
      this.update({ phase: PHASES.solving, startAt: at, penalty, movesComplete: true, moves: [{ m: move, t: 0, b: batchId }] });
      return this.checkSolved(at);
    }
    if (p === PHASES.solving) {
      this.s.moves.push({ m: move, t: Math.max(0, at - this.s.startAt), b: batchId });
      return this.checkSolved(at);
    }
    if (p === PHASES.freePrep || p === PHASES.idle || p === PHASES.done || p === PHASES.invalid) this.onChange(this.s);
  }

  scrambleStep(move) {
    const before = this.s.remaining.length;
    const expected = this.s.remaining[0];
    const remaining = simplifyAlg([invertMove(move), ...this.s.remaining]);
    const onTrack = expected && expected[0] === move[0] && remaining.length <= before;
    const done = onTrack ? [...this.s.done, move] : this.s.done;
    if (!remaining.length && statesEqual(this.model, this.s.target)) {
      this.update({ done, remaining });
      return this.becomeReady();
    }
    this.update({
      remaining,
      done,
      deviated: !onTrack,
      message: onTrack ? '' : 'حرکت ' + move + ' با مسیر فرق داشت؛ مسیر اصلاح از همین وضعیت نمایش داده می‌شود.',
    });
  }

  checkSolved(at) {
    if (!isSolved(this.model)) return this.onChange(this.s);
    this.finish(at);
  }

  // The user stops the timer by hand: the app model missed moves or drifted
  // from the real cube, so the physical cube is solved but the model is not.
  stop(at = this.now()) {
    if (this.s.phase !== PHASES.solving) return false;
    this.finish(at, 'manual');
    return true;
  }

  finish(at, stop = 'auto') {
    const rawMs = Math.max(0, Math.round(at - this.s.startAt));
    const result = {
      rawMs,
      penalty: this.s.penalty,
      scramble: this.s.mode === 'scramble' ? this.s.scramble : null,
      kind: this.s.mode === 'scramble' ? 'full' : 'free',
      startFacelets: this.s.startFacelets,
      moves: this.s.moves.slice(),
      movesComplete: stop === 'auto' && this.s.movesComplete,
      stop,
      timing: 'host-receipt',
    };
    this.update({ phase: PHASES.done, result, startAt: null });
    this.onResult(result);
  }

  elapsed(now = this.now()) {
    if (this.s.phase === PHASES.solving && this.s.startAt != null) return now - this.s.startAt;
    if (this.s.phase === PHASES.inspecting) return now - this.s.inspectionAt;
    return null;
  }
}

function reasonText(reason = '') {
  if (reason === 'sync-lost') return 'از دست رفتن همگامی حرکت‌ها';
  if (reason === 'cancel') return 'لغو';
  if (reason === 'resync') return 'ناهمخوانی وضعیت دریافتی با حرکت‌های ثبت‌شده';
  if (reason.startsWith('paused')) return 'وقفه و بازیابی اتصال';
  return 'قطع اتصال';
}
