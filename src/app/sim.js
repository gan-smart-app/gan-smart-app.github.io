// Clearly labelled simulator: a virtual cube driven by keyboard or on-screen
// buttons, with the same event shape as CubeLink. It is never presented as a
// real connection and its solves are not stored.
import { SOLVED_FACELETS, applyMove, fromFacelets, toFacelets } from '../core/cube.mjs';

export class SimLink {
  constructor() {
    this.listeners = new Set();
    this.model = fromFacelets(SOLVED_FACELETS);
    this.state = { status: 'idle', simulated: true, deviceName: 'شبیه‌ساز', battery: null, facelets: null, message: '' };
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, d = {}) { for (const fn of this.listeners) fn({ type, ...d }); }
  set(p) { this.state = { ...this.state, ...p }; this.emit('state', { state: this.state }); }
  connect() {
    this.model = fromFacelets(SOLVED_FACELETS);
    this.set({ status: 'ready', facelets: SOLVED_FACELETS, message: 'شبیه‌ساز فعال است؛ این اتصال واقعی نیست.' });
    this.emit('facelets', { facelets: SOLVED_FACELETS });
    return Promise.resolve(true);
  }
  disconnect() {
    if (this.state.status !== 'ready') return;
    this.emit('invalidate', { reason: 'manual' });
    this.set({ status: 'idle', facelets: null, message: 'شبیه‌ساز خاموش شد.' });
  }
  cancel() {}
  turn(move) {
    if (this.state.status !== 'ready') return;
    this.model = applyMove(this.model, move);
    this.emit('move', { move, at: performance.now(), batchId: performance.now() });
    this.state = { ...this.state, facelets: toFacelets(this.model) };
  }
  requestState() {
    this.emit('facelets', { facelets: toFacelets(this.model) });
    return Promise.resolve();
  }
  markSolved() {
    this.model = fromFacelets(SOLVED_FACELETS);
    return this.requestState();
  }
  exportLog() { return { kind: 'gan-smart-simulator', events: [] }; }
}

// Keyboard layout for the simulator (US positions): i/k R, e/d L, j/f U, s/l D, h/g F, w/o B.
export const SIM_KEYS = { i: 'R', k: "R'", d: 'L', e: "L'", j: 'U', f: "U'", s: 'D', l: "D'", h: 'F', g: "F'", w: 'B', o: "B'" };
