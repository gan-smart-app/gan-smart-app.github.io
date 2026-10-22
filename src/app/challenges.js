import { ALGORITHM_BY_ID } from '../data/algorithms.mjs';

// Personal challenges are computed only from recorded data. Nothing here
// depends on timing precision beyond whole solves.
export const CHALLENGE_TYPES = {
  streak: { label: 'اجرای درست پیاپی', icon: 'fa-trophy', color: 'yellow', needsAlg: true, describe: (c) => `${c.target} اجرای کاملاً صحیح پیاپی از «${ALGORITHM_BY_ID[c.algId]?.name || '؟'}» (با روبیک متصل)` },
  sessionSolves: { label: 'هدف جلسه', icon: 'fa-flag-checkered', color: 'cyan', describe: (c) => `${c.target} حل معتبر در جلسهٔ فعلی` },
  practiceDays: { label: 'پایداری تمرین', icon: 'fa-bolt', color: 'blue', describe: (c) => `${c.target} روز پیاپی تمرین (حل یا تمرین الگوریتم)` },
  weakReview: { label: 'مرور ضعیف‌ها', icon: 'fa-rotate', color: 'purple', describe: (c) => `${c.target} اجرای درست امروز از کیس‌هایی که خطای ثبت‌شده داشتند` },
};

const dayKey = (t) => new Date(t).toLocaleDateString('en-CA');

export function challengeProgress(c, { data, currentSessionId, now = Date.now() }) {
  const prog = Object.fromEntries(data.progress.map((p) => [p.id, p]));
  if (c.type === 'streak') {
    const attempts = prog[c.algId]?.attempts || [];
    let n = 0;
    for (let i = attempts.length - 1; i >= 0; i--) {
      const a = attempts[i];
      if (a.at < c.createdAtMs) break;
      if (a.assessment !== 'device') continue;
      if (!a.correct) break;
      n++;
    }
    return n;
  }
  if (c.type === 'sessionSolves') {
    return data.solves.filter((s) => s.sessionId === currentSessionId && s.valid && !s.deleted).length;
  }
  if (c.type === 'practiceDays') {
    const days = new Set([
      ...data.solves.filter((s) => s.valid).map((s) => dayKey(s.createdAt)),
      ...data.progress.flatMap((p) => p.attempts.map((a) => dayKey(a.at))),
    ]);
    let n = 0;
    for (let d = new Date(now); days.has(dayKey(d)); d.setDate(d.getDate() - 1)) n++;
    return n;
  }
  if (c.type === 'weakReview') {
    const today = dayKey(now);
    let n = 0;
    for (const p of data.progress) {
      const hadError = p.attempts.some((a) => !a.correct && dayKey(a.at) !== today);
      if (hadError) n += p.attempts.filter((a) => a.correct && dayKey(a.at) === today).length;
    }
    return n;
  }
  return 0;
}
