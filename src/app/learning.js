import { ALGORITHMS, ALGORITHM_BY_ID, CATEGORIES } from '../data/algorithms.mjs';
import { createCaseSetup } from '../core/cases.mjs';
import { errorRate, summary } from '../core/srs.mjs';

// Learning status shown in the UI, derived only from recorded attempts.
export function statusOf(rec, now = Date.now()) {
  if (!rec || !rec.attempts?.length) return 'new';
  if (rec.due && rec.due <= now && (rec.status === 'review' || rec.status === 'mastered')) return 'due';
  if (rec.status === 'mastered' || rec.status === 'review') return 'learned';
  return 'learning';
}
export const STATUS_VIEW = {
  learned: { text: 'آموخته شده', cls: 'bg-green-500/10 text-green-400' },
  learning: { text: 'در حال یادگیری', cls: 'bg-accent-purple/10 text-accent-purple' },
  due: { text: 'نیازمند مرور', cls: 'bg-amber-500/10 text-amber-300' },
  new: { text: 'در دسترس', cls: 'bg-slate-800 text-slate-400' },
};

export function progressMap(list) {
  return Object.fromEntries((list || []).map((p) => [p.id, p]));
}

// Static start-of-case diagram per algorithm (no random AUF), cached.
const previews = new Map();
export function casePreview(entry) {
  if (!previews.has(entry.id)) {
    let f = null;
    // Cross drills are generated per run; they have no fixed case picture.
    if (entry.category !== 'cross') {
      try { f = createCaseSetup(entry, { randomAuf: false }).startFacelets; } catch { f = null; }
    }
    previews.set(entry.id, f);
  }
  return previews.get(entry.id);
}
export const maskOf = (entry) => (entry.caseMask?.type === 'oll' ? 'oll' : entry.caseMask?.type === 'pll' ? 'll' : null);

// Path stages in teaching order. "current" stays practicable; nothing is
// marked complete unless recorded attempts say so.
export const PATH = [
  { id: 'current', title: 'روش فعلی (مبتدی)', text: 'حل لایه‌به‌لایه که الان با آن حل می‌کنی؛ تمرین الگوریتم‌ها و راهنمای قدم‌به‌قدم.', categories: ['current'] },
  { id: 'cross', title: 'کراس بهتر (Cross)', text: 'ساخت صلیب سفید در پایین با برنامه‌ریزی و حرکت‌های کمتر.', categories: ['cross'] },
  { id: 'f2l', title: 'F2L شهودی', text: 'جفت‌سازی همزمان گوشه و لبه برای حل دو لایه اول بدون فرمول حفظی.', categories: ['f2l'] },
  { id: 'oll2', title: 'OLL دو مرحله‌ای', text: 'جهت‌دهی لایه آخر با آموزش تدریجی جهت‌دهی لبه‌ها و گوشه‌ها.', categories: ['oll2'] },
  { id: 'pll2', title: 'PLL دو مرحله‌ای', text: 'جایگشت لایه آخر با آموزش تدریجی جایگشت گوشه‌ها و لبه‌ها.', categories: ['pll2'] },
  { id: 'advanced', title: 'مباحث پیشرفته‌تر', text: 'پس از تسلط بر دومرحله‌ای: PLLهای بیشتر و ادامهٔ مسیر.', categories: ['advanced'] },
];

export function pathModel(progressList, now = Date.now()) {
  const prog = progressMap(progressList);
  const stages = PATH.map((p) => {
    const entries = ALGORITHMS.filter((a) => p.categories.includes(a.category));
    const st = entries.map((e) => statusOf(prog[e.id], now));
    const learned = st.filter((s) => s === 'learned' || s === 'due').length;
    const touched = st.filter((s) => s !== 'new').length;
    return { ...p, entries, total: entries.length, learned, touched, pct: entries.length ? learned / entries.length : 0 };
  });
  const core = stages.filter((s) => s.id !== 'advanced');
  const total = core.reduce((a, s) => a + s.total, 0);
  const learned = core.reduce((a, s) => a + s.learned, 0);
  // Next focus: the first stage after "current" that is not fully learned.
  const focus = stages.find((s) => s.id !== 'current' && s.pct < 1) || stages[0];
  return { stages, pct: total ? learned / total : 0, focus };
}

export function weakCases(progressList) {
  return (progressList || [])
    .filter((p) => ALGORITHM_BY_ID[p.id] && p.attempts?.length >= 2)
    .map((p) => {
      const recent = p.attempts.slice(-5);
      return { id: p.id, entry: ALGORITHM_BY_ID[p.id], errors: recent.filter((a) => !a.correct).length, n: recent.length, rate: errorRate(p, 5) };
    })
    .filter((w) => w.errors > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 4);
}

export function lastPracticed(rec) {
  const s = summary(rec);
  return s.lastAt;
}

export function categoryName(id) {
  return CATEGORIES.find((c) => c.id === id)?.name || id;
}
