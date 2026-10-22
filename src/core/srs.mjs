// Spaced repetition and practice suggestions for algorithms, without AI.
// A simplified SM-2: device-verified attempts count fully, virtual and
// self-assessed attempts are capped so they cannot "master" a case alone.

import { ALGORITHMS } from '../data/algorithms.mjs';

const DAY = 86400000;
const MAX_ATTEMPTS = 200;

export const DEFAULT_SRS_SETTINGS = {
  difficulty: 'normal', // easy | normal | hard: scales review intervals
  repetitions: 5, // correct device runs in a row needed to master
  newPerDay: 3,
};
const INTERVAL_SCALE = { easy: 1.4, normal: 1, hard: 0.6 };

export function newRecord(id) {
  return { id, attempts: [], ease: 2.5, interval: 0, due: 0, streak: 0, status: 'new', favorite: false };
}

export function qualityOf({ correct, mistakes = 0, assessment = 'device' }) {
  let q = !correct ? 1 : mistakes === 0 ? 5 : mistakes === 1 ? 4 : 3;
  if (assessment !== 'device') q = Math.min(q, 4);
  return q;
}

// Returns a new record after one attempt.
export function grade(record, outcome, settings = DEFAULT_SRS_SETTINGS, now = Date.now()) {
  const s = { ...DEFAULT_SRS_SETTINGS, ...settings };
  const r = { ...record, attempts: [...record.attempts, { at: now, correct: !!outcome.correct, mistakes: outcome.mistakes || 0, assessment: outcome.assessment || 'device', ms: outcome.ms ?? null }].slice(-MAX_ATTEMPTS) };
  const q = qualityOf(outcome);
  if (q < 3) {
    r.streak = 0;
    r.interval = 0;
    r.due = now + 10 * 60000;
  } else {
    r.streak = record.streak + 1;
    r.interval = r.streak === 1 ? 1 : r.streak === 2 ? 3 : Math.round(record.interval * record.ease);
    r.interval = Math.max(1, Math.round(r.interval * INTERVAL_SCALE[s.difficulty]));
    r.due = now + r.interval * DAY;
  }
  r.ease = Math.max(1.3, record.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  const deviceStreak = countDeviceStreak(r.attempts);
  r.status = r.streak === 0 ? 'learning' : deviceStreak >= s.repetitions && r.interval >= 7 ? 'mastered' : r.streak >= 2 ? 'review' : 'learning';
  return r;
}

function countDeviceStreak(attempts) {
  let n = 0;
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i];
    if (!a.correct) break;
    if (a.assessment === 'device' && a.mistakes === 0) n++;
  }
  return n;
}

export function errorRate(record, last = 10) {
  const recent = record.attempts.slice(-last);
  if (!recent.length) return null;
  return recent.filter((a) => !a.correct || a.mistakes > 0).length / recent.length;
}

const fa = (n) => n.toLocaleString('fa-IR');

// Suggests what to practise next: overdue reviews, weak cases, cases being
// learnt, then new cases whose prerequisites are started. Each item has a
// short Persian reason.
export function suggestNext(progress = {}, settings = DEFAULT_SRS_SETTINGS, now = Date.now(), entries = ALGORITHMS, { limit = 5 } = {}) {
  const s = { ...DEFAULT_SRS_SETTINGS, ...settings };
  const out = [];
  const seen = new Set();
  const add = (id, kind, reason, score) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, kind, reason, score });
  };
  const practiceable = entries.filter((e) => !e.later && (e.alg || e.practice));
  const recordOf = (e) => progress[e.id];

  for (const e of practiceable) {
    const r = recordOf(e);
    if (!r || !r.attempts.length) continue;
    const rate = errorRate(r, 5);
    if (rate !== null && rate >= 0.4 && r.attempts.length >= 2) {
      const recent = r.attempts.slice(-5);
      add(e.id, 'weak', `${fa(recent.filter((a) => !a.correct || a.mistakes).length)} اجرای نادرست در ${fa(recent.length)} تلاش اخیر`, 300 + rate * 100);
    }
  }
  for (const e of practiceable) {
    const r = recordOf(e);
    if (!r || !r.attempts.length || r.due > now) continue;
    const days = Math.floor((now - r.due) / DAY);
    add(e.id, 'due', days > 0 ? `موعد مرور ${fa(days)} روز گذشته است` : 'موعد مرور رسیده است', 200 + Math.min(days, 30));
  }
  for (const e of practiceable) {
    const r = recordOf(e);
    if (r?.status === 'learning') add(e.id, 'learning', 'در حال یادگیری؛ چند اجرای درست پیاپی لازم است', 100);
  }
  const startedToday = Object.values(progress).filter((r) => r.attempts[0] && now - r.attempts[0].at < DAY).length;
  let newSlots = Math.max(0, s.newPerDay - startedToday);
  for (const e of practiceable) {
    if (newSlots <= 0) break;
    const r = recordOf(e);
    if (r && r.attempts.length) continue;
    const ready = e.prerequisites.every((p) => progress[p]?.attempts.length);
    if (!ready) continue;
    add(e.id, 'new', 'مورد تازهٔ بعدی در مسیر یادگیری', 50 - e.difficulty);
    newSlots--;
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Summary for a lesson card.
export function summary(record) {
  if (!record || !record.attempts.length) return { status: 'new', attempts: 0, correct: 0, lastAt: null };
  return {
    status: record.status,
    attempts: record.attempts.length,
    correct: record.attempts.filter((a) => a.correct).length,
    lastAt: record.attempts.at(-1).at,
    due: record.due,
  };
}
