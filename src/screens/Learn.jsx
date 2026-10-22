import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { ALGORITHMS, CATEGORIES } from '../data/algorithms.mjs';
import { suggestNext } from '../core/srs.mjs';
import IsoCube from '../components/IsoCube.jsx';
import { Alg } from '../components/ui.jsx';
import { ago, fa, faDigits } from '../app/format.js';
import { casePreview, categoryName, maskOf, pathModel, progressMap, statusOf, STATUS_VIEW, weakCases } from '../app/learning.js';
import { PageFooter, MobileHeader, MobileNav } from '../layout/Shell.jsx';

const SHORT = { f2l: 'F2L', oll2: 'OLL', pll2: 'PLL', current: 'LBL', cross: 'X', advanced: 'ADV' };
const pct = (x) => faDigits(Math.round(x * 100)) + '٪';

function useLearnModel() {
  const app = useApp();
  const { data, settings, actions } = app;
  const now = Date.now();
  const prog = useMemo(() => progressMap(data.progress), [data.progress]);
  const path = useMemo(() => pathModel(data.progress, now), [data.progress]);
  const favorites = new Set(data.favorites.map((f) => f.id));
  const suggestions = useMemo(() => suggestNext(prog, { difficulty: settings.drillDifficulty, repetitions: settings.drillRepetitions }, now, ALGORITHMS, { limit: 4 }), [prog, settings.drillDifficulty, settings.drillRepetitions]);
  const due = suggestions.filter((s) => s.kind === 'due' || s.kind === 'weak');
  const weak = weakCases(data.progress);
  return { app, prog, path, favorites, suggestions, due, weak, actions, now };
}

function useLibraryFilters(m) {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [statuses, setStatuses] = useState({ learned: true, learning: true, due: true, new: true });
  const [favOnly, setFavOnly] = useState(false);
  const list = ALGORITHMS.filter((e) => {
    if (cat !== 'all' && e.category !== cat) return false;
    if (favOnly && !m.favorites.has(e.id)) return false;
    if (!statuses[statusOf(m.prog[e.id], m.now)]) return false;
    if (q.trim()) {
      const t = q.trim().toLowerCase().replace(/’/g, "'");
      return [e.name, e.nameEn, e.alg, ...(e.alternatives || []), categoryName(e.category)].some((x) => x && x.toLowerCase().includes(t));
    }
    return true;
  });
  const clear = () => { setCat('all'); setQ(''); setFavOnly(false); setStatuses({ learned: true, learning: true, due: true, new: true }); };
  return { cat, setCat, q, setQ, statuses, setStatuses, favOnly, setFavOnly, list, clear };
}

function stageLink(stage) {
  if (stage.id === 'current') return '#/solver?mode=teach';
  if (stage.id === 'cross') return '#/drill/cross';
  const first = stage.entries.find((e) => !e.later) || stage.entries[0];
  return first ? '#/lesson/' + first.id : '#/library';
}

// ---------- desktop 03 ----------
function PathDesktop() {
  const m = useLearnModel();
  const { stages, focus } = m.path;
  const done = (s) => s.total > 0 && s.pct >= 1;
  return (
    <main className="pt-8 pb-12 px-8 max-w-5xl mx-auto w-full">
      <header className="mb-12 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold mb-2">مسیر یادگیری</h1>
          <p className="text-slate-400">پیشرفت تدریجی در حل سرعتی با روش مبتدی و CFOP پایه</p>
        </div>
        <div className="bg-slate-800/50 px-6 py-3 rounded-2xl border border-slate-700 flex items-center gap-6">
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase mb-1">پیشرفت کل</p>
            <p className="text-xl font-bold accent-cyan">{pct(m.path.pct)}</p>
          </div>
          <div className="w-px h-8 bg-slate-700"></div>
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase mb-1">سطح فعلی</p>
            <p className="text-xl font-bold">روش مبتدی</p>
          </div>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 relative">
          <div className="absolute top-8 bottom-8 right-10 w-0.5 z-0" style={{ background: `linear-gradient(to bottom, #22d3ee ${Math.round((stages.indexOf(focus) / (stages.length - 1)) * 100)}%, #334155 0)` }}></div>
          <div className="space-y-12">
            {stages.map((s) => {
              const isFocus = s.id === focus.id;
              const isDone = done(s);
              if (isFocus) {
                return (
                  <div key={s.id} className="relative flex items-start gap-8">
                    <div className="w-20 h-20 shrink-0 rounded-full bg-slate-800 border-4 border-accent-cyan flex items-center justify-center text-accent-cyan text-2xl font-bold z-10 shadow-[0_0_20px_rgba(34,211,238,0.1)]"><i className="fa-solid fa-play"></i></div>
                    <div className="flex-1 bg-slate-800/50 border border-cyan-400/50 rounded-2xl p-6 shadow-xl shadow-cyan-500/5">
                      <div className="flex justify-between items-start mb-4">
                        <h2 className="text-xl font-bold text-white">{s.title}</h2>
                        <span className="text-xs bg-white/10 text-white px-3 py-1 rounded-full">{s.touched ? 'در حال یادگیری' : 'گام بعدی پیشنهادی'}</span>
                      </div>
                      <p className="text-sm text-slate-300 mb-6 leading-relaxed">{s.text}</p>
                      <div className="w-full bg-slate-900 rounded-full h-1.5 mb-2"><div className="bg-accent-cyan h-1.5 rounded-full" style={{ width: Math.round(s.pct * 100) + '%' }}></div></div>
                      <p className="text-[10px] text-slate-500 mb-6">{fa(s.learned)} از {fa(s.total)} کیس آموخته شده (بر پایهٔ اجراهای ثبت‌شده)</p>
                      <a href={stageLink(s)} className="block text-center w-full bg-accent-cyan text-slate-900 py-3 rounded-xl font-bold hover:shadow-lg hover:shadow-cyan-500/20 transition-all">{s.touched ? 'ادامه آموزش' : 'شروع آموزش'}</a>
                    </div>
                  </div>
                );
              }
              return (
                <a key={s.id} href={stageLink(s)} className={'relative flex items-start gap-8 ' + (!isDone && s.id !== 'current' ? 'opacity-70' : '')}>
                  <div className={'w-20 h-20 shrink-0 rounded-full flex items-center justify-center text-2xl font-bold z-10 ' + (isDone ? 'bg-accent-cyan text-slate-900 shadow-[0_0_20px_rgba(34,211,238,0.3)]' : 'bg-slate-800 border-2 border-slate-700 text-slate-600')}>
                    <i className={'fa-solid ' + (isDone ? 'fa-check' : s.id === 'current' ? 'fa-cube' : 'fa-arrow-left')}></i>
                  </div>
                  <div className={'flex-1 rounded-2xl p-6 group transition-all ' + (isDone || s.id === 'current' ? 'bg-slate-800/50 border border-slate-700 hover:border-cyan-400/50' : 'bg-slate-900/50 border border-slate-800')}>
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-xl font-bold">{s.title}</h3>
                      <span className={'text-xs px-3 py-1 rounded-full ' + (s.id === 'current' ? 'bg-accent-cyan/20 text-accent-cyan' : isDone ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-500')}>
                        {s.id === 'current' ? 'تمرین روش فعلی' : isDone ? 'آموخته شده' : s.id === 'advanced' ? 'بعداً' : 'در دسترس'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">{s.text}</p>
                    {s.id === 'current' && (
                      <div className="flex gap-2 mt-4">
                        <span className="text-[10px] bg-slate-700 px-2 py-1 rounded">راهنمای آموزشی قدم‌به‌قدم</span>
                        <span className="text-[10px] bg-slate-700 px-2 py-1 rounded">{fa(s.learned)} از {fa(s.total)} الگوریتم آموخته</span>
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        <div className="space-y-8">
          <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <h3 className="font-bold mb-4 flex items-center gap-2"><i className="fa-solid fa-calendar-day text-accent-purple"></i>مرور فاصله‌دار امروز</h3>
            <div className="space-y-4">
              {m.suggestions.length === 0 && <p className="text-xs text-slate-500">هنوز کیسی تمرین نشده؛ با اولین تمرین، برنامهٔ مرور ساخته می‌شود.</p>}
              {m.suggestions.map((s) => {
                const e = ALGORITHMS.find((a) => a.id === s.id);
                return (
                  <a key={s.id} href={'#/lesson/' + s.id} className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 bg-accent-purple/10 rounded-lg flex items-center justify-center text-accent-purple font-mono text-[10px] text-center leading-tight" dir="ltr">{SHORT[e?.category] || '•'}</div>
                    <div className="flex-1">
                      <p className="text-xs font-bold">{e?.name}</p>
                      <p className="text-[10px] text-slate-500">{s.reason}</p>
                    </div>
                    {s.kind === 'due' ? <i className="fa-solid fa-circle text-accent-purple text-[6px]"></i> : <i className="fa-solid fa-chevron-left text-slate-600 text-xs"></i>}
                  </a>
                );
              })}
            </div>
            <a href="#/library" className="block text-center w-full mt-6 text-xs text-slate-400 hover:text-white transition-colors">مشاهده کتابخانه</a>
          </section>
          <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <h3 className="font-bold mb-4 flex items-center gap-2"><i className="fa-solid fa-chart-line text-red-400"></i>کیس‌های ضعیف (بر اساس تمرین)</h3>
            {m.weak.length === 0 ? <p className="text-xs text-slate-500">هنوز خطای ثبت‌شده‌ای برای پیشنهاد مرور نیست.</p> : (
              <>
                <div className="space-y-3">
                  {m.weak.map((w) => (
                    <a key={w.id} href={'#/lesson/' + w.id} className="flex items-center justify-between">
                      <span className="text-xs text-slate-300">{categoryName(w.entry.category)}: {w.entry.name}</span>
                      <span className={'text-[10px] ' + (w.errors >= 2 ? 'text-red-400' : 'text-yellow-400')}>{fa(w.errors)} خطا از {fa(w.n)} اجرا</span>
                    </a>
                  ))}
                </div>
                <div className="mt-6 p-4 bg-red-400/5 rounded-xl border border-red-400/20">
                  <p className="text-[10px] text-red-400">علت پیشنهاد مرور: خطای ثبت‌شده در اجرای همین کیس؛ دربارهٔ مکث و تشخیص مرحله دادهٔ کافی نداریم.</p>
                </div>
              </>
            )}
          </section>
          <a href="#/library" className="block bg-accent-purple/10 border border-accent-purple/30 p-6 rounded-2xl hover:bg-accent-purple/20 transition-all text-center">
            <i className="fa-solid fa-book-open text-2xl accent-purple mb-2"></i>
            <h4 className="font-bold text-accent-purple">کتابخانه الگوریتم‌ها</h4>
            <p className="text-[10px] text-slate-400">دسترسی به تمام کیس‌ها و فرمول‌ها</p>
          </a>
          <a href="#/solver?mode=teach" className="block bg-slate-800/50 border border-slate-700 p-5 rounded-2xl text-center text-sm">
            <i className="fa-solid fa-person-chalkboard ml-2 text-cyan-300"></i>آموزش پایهٔ روش مبتدی
          </a>
        </div>
      </div>
      <PageFooter links={[['#/library', 'کتابخانه'], ['#/solver?mode=teach', 'آموزش پایه']]} />
    </main>
  );
}

// ---------- desktop 04 ----------
const PAGE = 9;
function LibraryDesktop() {
  const m = useLearnModel();
  const f = useLibraryFilters(m);
  const [page, setPage] = useState(0);
  const [view, setView] = useState('grid');
  const pages = Math.max(1, Math.ceil(f.list.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = f.list.slice(cur * PAGE, cur * PAGE + PAGE);
  const dueCount = m.due.length;
  return (
    <main className="pt-8 pb-12 px-8 max-w-7xl mx-auto w-full">
      <div className="flex flex-col md:flex-row gap-8 items-start">
        <aside className="w-full md:w-64 space-y-6 shrink-0 sticky top-24">
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <h3 className="font-bold mb-4 text-sm">دسته‌بندی</h3>
            <div className="space-y-2">
              {[['all', 'همه کیس‌ها'], ...CATEGORIES.map((c) => [c.id, c.name])].map(([id, name]) => (
                <button key={id} onClick={() => { f.setCat(id); setPage(0); }} aria-pressed={f.cat === id}
                  className={'w-full text-right px-3 py-2 rounded-lg text-sm ' + (f.cat === id ? 'bg-accent-cyan text-slate-900 font-bold' : 'hover:bg-slate-700 text-slate-400')}>{name}</button>
              ))}
            </div>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <h3 className="font-bold mb-4 text-sm">وضعیت یادگیری</h3>
            <div className="space-y-3">
              {[['learned', 'آموخته شده'], ['learning', 'در حال یادگیری'], ['due', 'نیازمند مرور'], ['new', 'تمرین‌نشده']].map(([k, l]) => (
                <label key={k} className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" className="w-4 h-4" checked={f.statuses[k]} onChange={(e) => { f.setStatuses({ ...f.statuses, [k]: e.target.checked }); setPage(0); }} />
                  <span className="text-xs text-slate-300 group-hover:text-white transition-colors">{l}</span>
                </label>
              ))}
              <label className="flex items-center gap-3 cursor-pointer group pt-2 border-t border-slate-700">
                <input type="checkbox" className="w-4 h-4" checked={f.favOnly} onChange={(e) => { f.setFavOnly(e.target.checked); setPage(0); }} />
                <span className="text-xs text-slate-300">فقط علاقه‌مندی‌ها</span>
              </label>
            </div>
          </div>
          <div className="bg-accent-purple/10 border border-accent-purple/20 p-4 rounded-xl">
            <p className="text-[10px] text-accent-purple font-bold mb-2 uppercase">مرور فاصله‌دار</p>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">{dueCount ? fa(dueCount) + ' کیس برای مرور یا رفع خطا آماده است.' : 'فعلاً کیسی برای مرور موعد ندارد.'}</p>
            {dueCount > 0 && <a href={'#/drill/review'} className="block text-center text-xs text-white bg-accent-purple px-4 py-2 rounded-lg w-full font-bold">شروع مرور</a>}
          </div>
        </aside>

        <div className="flex-1 space-y-8 min-w-0">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <i className="fa-solid fa-magnifying-glass absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
              <input type="search" placeholder="جست‌وجوی الگوریتم یا نام کیس..." value={f.q} onChange={(e) => { f.setQ(e.target.value); setPage(0); }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pr-12 pl-4 text-sm focus:border-accent-cyan focus:outline-none transition-all" aria-label="جست‌وجوی الگوریتم یا نام کیس" />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">{fa(f.list.length)} کیس در این نما</span>
              <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                <button className={'p-2 rounded-md ' + (view === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-500')} aria-label="نمای شبکه‌ای" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><i className="fa-solid fa-grip"></i></button>
                <button className={'p-2 rounded-md ' + (view === 'list' ? 'bg-slate-700 text-white' : 'text-slate-500')} aria-label="نمای فهرستی" aria-pressed={view === 'list'} onClick={() => setView('list')}><i className="fa-solid fa-list"></i></button>
              </div>
            </div>
          </div>

          {f.list.length === 0 ? (
            <div className="bg-slate-800/30 border border-dashed border-slate-700 rounded-2xl p-20 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6"><i className="fa-solid fa-magnifying-glass text-slate-600 text-3xl"></i></div>
              <h3 className="text-xl font-bold mb-2">نتیجه‌ای یافت نشد</h3>
              <p className="text-slate-500 max-w-sm">الگوریتمی با این نام یا فرمول در کتابخانه شما وجود ندارد. فیلترها را بررسی کنید یا دسته را تغییر دهید.</p>
              <button className="mt-8 text-accent-cyan border border-cyan-400/30 px-6 py-2 rounded-xl font-bold" onClick={f.clear}>پاک کردن فیلترها</button>
            </div>
          ) : (
            <div className={view === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6' : 'space-y-3'}>
              {shown.map((e) => <AlgCard key={e.id} e={e} m={m} list={view === 'list'} />)}
            </div>
          )}

          {pages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-8">
              <button className="w-10 h-10 rounded-lg border border-slate-700 flex items-center justify-center text-slate-500 hover:text-white" aria-label="صفحهٔ قبل" disabled={cur === 0} onClick={() => setPage(cur - 1)}><i className="fa-solid fa-chevron-right"></i></button>
              {Array.from({ length: pages }, (_, i) => (
                <button key={i} onClick={() => setPage(i)} aria-current={i === cur ? 'page' : undefined}
                  className={'w-10 h-10 rounded-lg font-bold ' + (i === cur ? 'bg-accent-cyan text-slate-900' : 'border border-slate-700 text-slate-400 hover:text-white')}>{fa(i + 1)}</button>
              ))}
              <button className="w-10 h-10 rounded-lg border border-slate-700 flex items-center justify-center text-slate-500 hover:text-white" aria-label="صفحهٔ بعد" disabled={cur === pages - 1} onClick={() => setPage(cur + 1)}><i className="fa-solid fa-chevron-left"></i></button>
            </div>
          )}
        </div>
      </div>
      <PageFooter start={<><span className="accent-cyan">کتابخانهٔ تمرین</span><span className="w-px h-4 bg-slate-800"></span><span>مرور و تمرین الگوریتم‌ها</span></>} links={[['#/learn', 'مسیر یادگیری'], ['#/challenges', 'تمرین هدفمند']]} />
    </main>
  );
}

function AlgCard({ e, m, list }) {
  const rec = m.prog[e.id];
  const st = statusOf(rec, m.now);
  const sv = STATUS_VIEW[st];
  const fav = m.favorites.has(e.id);
  const okMs = rec?.attempts?.filter((a) => a.correct && a.ms).map((a) => a.ms) || [];
  const avgMs = okMs.length ? okMs.reduce((a, b) => a + b, 0) / okMs.length : null;
  const preview = casePreview(e);
  const isCross = e.category === 'cross';
  return (
    <div className={'bg-slate-800/40 border border-slate-700 rounded-2xl p-5 hover:border-cyan-400 transition-all group ' + (list ? 'flex items-center gap-6' : '')}>
      <div className={'flex gap-4 ' + (list ? 'flex-1' : 'mb-4')}>
        <a href={(isCross ? '#/drill/' : '#/lesson/') + e.id} className="w-20 h-20 shrink-0 bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-center overflow-hidden" aria-label={'باز کردن ' + e.name}>
          {preview ? <IsoCube facelets={preview} frame="yellowUp" mask={maskOf(e)} size={76} label={'شکل کیس ' + e.name} /> : <i className="fa-solid fa-cube text-slate-600"></i>}
        </a>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <a href={(isCross ? '#/drill/' : '#/lesson/') + e.id} title={e.nameEn} className={'font-bold text-sm truncate ' + (st === 'new' ? 'text-slate-400' : '')}>{e.name}</a>
            <button className="inline-flex items-center justify-center shrink-0 rounded-lg hover:bg-white/5 w-9 h-9" aria-label={fav ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'} aria-pressed={fav} onClick={() => m.actions.toggleFavorite(e.id)}>
              <i className={fav ? 'fa-solid fa-star text-yellow-400' : 'fa-regular fa-star text-slate-500 hover:text-yellow-400'}></i>
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mb-2">دسته: {categoryName(e.category)}</p>
          <span className={'text-[10px] px-2 py-0.5 rounded ' + sv.cls}>{e.later ? 'بعداً' : sv.text}</span>
        </div>
      </div>
      {!isCross && (
        <div className={'bg-slate-900/80 p-3 rounded-xl ' + (list ? 'w-80' : 'mb-4')}>
          <code className={'move-font block text-xs font-bold ' + (st === 'new' ? 'text-slate-400' : 'text-accent-cyan')} dir="ltr">{e.alg}</code>
        </div>
      )}
      <div className={'flex justify-between items-center text-[10px] text-slate-500 ' + (list ? 'w-48 flex-col items-end gap-1' : '')}>
        <span>{rec?.attempts?.length ? 'آخرین تمرین: ' + ago(new Date(rec.attempts.at(-1).at).toISOString()) : 'بدون داده تمرین'}</span>
        <span>{avgMs ? 'میانگین اجرا: ' + faDigits((avgMs / 1000).toFixed(1)) + ' ثانیه' : '-'}</span>
      </div>
    </div>
  );
}

// ---------- mobile 03 ----------
function Mobile() {
  const m = useLearnModel();
  const f = useLibraryFilters(m);
  const [filters, setFilters] = useState(false);
  const { stages, focus } = m.path;
  const chips = [['all', 'همه'], ['f2l', 'F2L'], ['oll2', 'OLL'], ['pll2', 'PLL'], ['current', 'الگوریتم‌های کاربردی'], ['cross', 'کراس'], ['advanced', 'پیشرفته']];
  return (
    <div className="mob">
      <MobileHeader title="یادگیری و کتابخانه" start={<i className="fa-solid fa-graduation-cap text-cyan text-lg"></i>} end={<a href="#library" onClick={(e) => { e.preventDefault(); document.getElementById('library')?.scrollIntoView(); }} aria-label="جست‌وجو در کتابخانه" className="inline-flex w-11 h-11 items-center justify-center"><i className="fa-solid fa-magnifying-glass text-secondary"></i></a>} />
      <main className="mt-16 px-4 space-y-8">
        <section id="learning-path" className="space-y-4">
          <div className="flex justify-between items-end">
            <h2 className="text-sm font-bold border-r-2 border-cyan pr-2">مسیر یادگیری (روش مبتدی)</h2>
            <span className="text-[10px] text-secondary">{pct(m.path.pct)} کامل شده</span>
          </div>
          <div className="relative space-y-6 pr-4">
            <div className="absolute right-1.5 top-2 bottom-2 w-0.5 bg-white/5"></div>
            {stages.map((s, i) => {
              const done = s.total > 0 && s.pct >= 1;
              const isFocus = s.id === focus.id;
              const weak = m.weak.find((w) => s.categories.includes(w.entry.category));
              return (
                <a key={s.id} href={stageLink(s)} className="relative flex items-center gap-4">
                  <div className={'absolute -right-[1.4rem] w-3 h-3 rounded-full ' + (done ? 'bg-cyan shadow-[0_0_8px_rgba(34,211,238,0.5)]' : isFocus ? 'bg-cyan-400/50 border border-cyan-400/50' : 'bg-white/10')}></div>
                  <div className={'flex-1 cyber-panel p-3 rounded-xl ' + (done ? 'border-cyan bg-cyan-400/5' : isFocus ? 'border-cyan-400/30' : '')}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold">{fa(i + 1)}. {s.title}</span>
                      {done ? <i className="fa-solid fa-circle-check text-cyan text-xs"></i> : isFocus ? <span className="text-[9px] bg-cyan-400/10 text-cyan px-1.5 py-0.5 rounded">درس بعدی</span> : <span className="text-[9px] text-secondary">{fa(s.learned)}/{fa(s.total)}</span>}
                    </div>
                    <p className="text-[10px] text-secondary mt-1">{s.text}</p>
                    {weak && <div className="mt-2 text-[9px] text-purple-400 italic">پیشنهاد مرور: بر اساس {fa(weak.errors)} خطا از {fa(weak.n)} اجرای ثبت‌شدهٔ «{weak.entry.name}».</div>}
                  </div>
                </a>
              );
            })}
          </div>
        </section>

        {m.suggestions.length > 0 && (
          <section className="cyber-panel rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-sm text-purple-300">مرور فاصله‌دار امروز</h3>
            {m.suggestions.map((s) => {
              const e = ALGORITHMS.find((a) => a.id === s.id);
              return <a key={s.id} href={'#/lesson/' + s.id} className="flex justify-between text-xs py-1"><span>{e?.name}</span><span className="text-secondary text-[10px]">{s.reason}</span></a>;
            })}
          </section>
        )}

        <section id="library" className="space-y-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold border-r-2 border-purple-500 pr-2">کتابخانه فرمول‌ها</h2>
            <div className="flex gap-2">
              <button className={'w-11 h-11 flex items-center justify-center rounded-lg cyber-panel ' + (filters ? 'text-cyan border-cyan-400/30' : 'text-secondary')} aria-label="فیلتر کتابخانه" aria-expanded={filters} onClick={() => setFilters(!filters)}><i className="fa-solid fa-filter text-xs"></i></button>
              <button className={'w-11 h-11 flex items-center justify-center rounded-lg cyber-panel ' + (f.favOnly ? 'text-cyan border-cyan-400/30' : 'text-secondary')} aria-label="فقط علاقه‌مندی‌ها" aria-pressed={f.favOnly} onClick={() => f.setFavOnly(!f.favOnly)}><i className="fa-solid fa-heart text-xs"></i></button>
            </div>
          </div>
          {filters && (
            <div className="cyber-panel rounded-2xl p-4 grid grid-cols-2 gap-2 text-xs">
              {[['learned', 'آموخته شده'], ['learning', 'در حال یادگیری'], ['due', 'نیازمند مرور'], ['new', 'تمرین‌نشده']].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 min-h-[44px]"><input type="checkbox" checked={f.statuses[k]} onChange={(e) => f.setStatuses({ ...f.statuses, [k]: e.target.checked })} />{l}</label>
              ))}
            </div>
          )}
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute right-3 top-1/2 -translate-y-1/2 text-secondary text-xs"></i>
            <input type="search" placeholder="جستجوی کیس یا فرمول..." value={f.q} onChange={(e) => f.setQ(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pr-9 pl-4 text-xs focus:outline-none focus:border-cyan-400/50" aria-label="جستجوی کیس یا فرمول" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {chips.map(([id, l]) => (
              <button key={id} onClick={() => f.setCat(id)} aria-pressed={f.cat === id} className={'px-4 py-1.5 rounded-full text-[10px] whitespace-nowrap ' + (f.cat === id ? 'bg-cyan text-black font-bold' : 'cyber-panel text-secondary')}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3">
            {f.list.map((e) => <MobileAlgCard key={e.id} e={e} m={m} />)}
            {f.list.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 cyber-panel rounded-xl mt-4 text-secondary">
                <i className="fa-solid fa-folder-open text-4xl mb-4"></i>
                <p className="text-xs">نتیجه‌ای یافت نشد.</p>
                <button className="text-[10px] text-cyan mt-2" onClick={f.clear}>پاک کردن فیلترها</button>
              </div>
            )}
          </div>
        </section>
        <section className="cyber-panel rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-sm text-cyan-300">روش فعلی شما</h3>
          <p className="text-sm text-secondary leading-7">تمرین روش مبتدی همچنان در دسترس است؛ آموزش پایه نیز در صورت نیاز باز می‌شود.</p>
          <a href="#/solver?mode=teach" className="block text-center w-full mt-3 py-3 px-4 rounded-xl border border-white/15 bg-white/5 text-sm font-medium">آموزش پایه و تمرین روش فعلی</a>
        </section>
      </main>
      <MobileNav route="learn" />
    </div>
  );
}

function MobileAlgCard({ e, m }) {
  const rec = m.prog[e.id];
  const st = statusOf(rec, m.now);
  const fav = m.favorites.has(e.id);
  const preview = casePreview(e);
  const errors = rec?.attempts?.slice(-5).filter((a) => !a.correct).length;
  const href = (e.category === 'cross' ? '#/drill/' : '#/lesson/') + e.id;
  return (
    <div className="cyber-panel p-4 rounded-xl space-y-3">
      <div className="flex justify-between items-start">
        <a href={href} className="flex gap-3">
          <div className="w-14 h-14 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center">{preview && <IsoCube facelets={preview} frame="yellowUp" mask={maskOf(e)} size={52} />}</div>
          <div>
            <div className="text-xs font-bold">{e.name}{e.nameEn !== e.name && <span dir="ltr"> ({e.nameEn})</span>}</div>
            <div className="text-[9px] text-secondary">{categoryName(e.category)}</div>
            <div className="mt-1 flex gap-1">
              {st !== 'new' && <span className={'text-[8px] px-1 rounded ' + STATUS_VIEW[st].cls}>{STATUS_VIEW[st].text}</span>}
              {rec?.due && st !== 'new' && <span className="text-[8px] bg-purple-500/10 text-purple-400 px-1 rounded">مرور فاصله‌دار</span>}
            </div>
          </div>
        </a>
        <button className="inline-flex items-center justify-center shrink-0 rounded-lg hover:bg-white/5 w-11 h-11" aria-label={fav ? 'حذف از علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'} aria-pressed={fav} onClick={() => m.actions.toggleFavorite(e.id)}>
          <i className={(fav ? 'fa-solid text-cyan' : 'fa-regular text-secondary') + ' fa-heart text-xs'}></i>
        </button>
      </div>
      {e.alg && <div className={'formula text-[11px] bg-black/40 p-2 rounded border border-white/5 ' + (st === 'new' ? 'text-secondary' : 'text-cyan')} dir="ltr">{e.alg}</div>}
      {rec?.attempts?.length > 0 && (
        <div className="flex justify-between text-[9px] text-secondary">
          <span>دفعات تمرین: {fa(rec.attempts.length)}</span>
          <span>{errors ? 'خطای اخیر: ' + fa(errors) + ' از ۵' : 'آخرین خطا: ندارد'}</span>
        </div>
      )}
    </div>
  );
}

export default function Learn({ mobile, route }) {
  if (mobile) return <Mobile />;
  return route.name === 'library' ? <LibraryDesktop /> : <PathDesktop />;
}
