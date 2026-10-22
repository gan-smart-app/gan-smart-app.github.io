import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { aoN, bestSolve, countedSolves, effectiveMs, isCounted, rollingAo } from '../core/stats.mjs';
import TrendChart from '../components/TrendChart.jsx';
import { Empty } from '../components/ui.jsx';
import { dateFa, fa, faDigits, msText, resultText, timeFa } from '../app/format.js';
import { MobileHeader, MobileNav, PageHeader } from '../layout/Shell.jsx';

export const KIND_LABEL = { full: 'حل کامل', free: 'تمرین آزاد', cross: 'کراس', f2l: 'F2L', oll: 'OLL', pll: 'PLL' };
const RANGES = [['30', '۳۰ روز اخیر'], ['7', '۷ روز اخیر'], ['1', 'امروز'], ['all', 'همهٔ زمان‌ها']];

function inRange(s, range) {
  if (range === 'all') return true;
  const d = new Date(s.createdAt);
  if (range === '1') return d.toDateString() === new Date().toDateString();
  return Date.now() - d.getTime() <= Number(range) * 86400000;
}

export function useStatsModel() {
  const app = useApp();
  const { data } = app;
  const [range, setRange] = useState('30');
  const [kind, setKind] = useState('all');
  const [session, setSession] = useState('all');
  const list = useMemo(() => data.solves.filter((s) => inRange(s, range) && (kind === 'all' || s.kind === kind) && (session === 'all' || s.sessionId === session)), [data.solves, range, kind, session]);
  const counted = countedSolves(list);
  const chrono = list.filter((s) => isCounted(s));
  const points = chrono.map((s) => ({ ms: effectiveMs(s), id: s.id }));
  const ao5Series = rollingAo(chrono, 5);
  const best = bestSolve(counted);
  // Previous best before the range, to show real improvement only when it exists.
  const before = countedSolves(data.solves.filter((s) => !inRange(s, range)));
  const prevBest = bestSolve(before);
  const improvement = best && prevBest && effectiveMs(best) < effectiveMs(prevBest) ? (1 - effectiveMs(best) / effectiveMs(prevBest)) * 100 : null;
  const kinds = [...new Set(data.solves.map((s) => s.kind))];
  const sessions = data.sessions.map((s) => ({ ...s, solves: data.solves.filter((x) => x.sessionId === s.id) })).filter((s) => s.solves.length).reverse();
  const numberOf = (s) => data.solves.indexOf(s) + 1;
  return { app, data, range, setRange, kind, setKind, session, setSession, list, counted, points, ao5Series, best, improvement, ao5: aoN(chrono, 5), ao12: aoN(chrono, 12), kinds, sessions, numberOf };
}



function statusOf(s) {
  if (!s.valid) return ['نامعتبر', 'border-line text-faint'];
  if (s.penalty === 'DNF') return ['DNF', 'border-bad/30 bg-bad/10 text-bad'];
  if (s.penalty === '+2') return ['جریمه', 'border-warn/30 bg-warn/10 text-warn'];
  return ['معتبر', 'border-ok/30 bg-ok/10 text-ok'];
}

function TimeCell({ s }) {
  if (s.penalty === 'DNF') return <span className="num font-semibold text-bad">DNF</span>;
  return (
    <span className={'num font-semibold ' + (s.penalty === '+2' ? 'text-warn' : 'text-ink')}>
      {resultText({ ...s, penalty: s.penalty === '+2' ? '+2' : null })}
    </span>
  );
}

function Filters({ m, className = '' }) {
  const sel = 'field h-9 w-auto text-sm';
  return (
    <div className={'flex flex-wrap gap-2 ' + className}>
      <select className={sel} aria-label="بازهٔ زمانی" value={m.range} onChange={(e) => m.setRange(e.target.value)}>
        {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select className={sel} aria-label="نوع تمرین" value={m.kind} onChange={(e) => m.setKind(e.target.value)}>
        <option value="all">همهٔ تمرین‌ها</option>
        {m.kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] || k}</option>)}
      </select>
      {m.sessions.length > 1 && (
        <select className={sel} aria-label="جلسه" value={m.session} onChange={(e) => m.setSession(e.target.value)}>
          <option value="all">همهٔ جلسه‌ها</option>
          {m.sessions.map((s) => <option key={s.id} value={s.id}>{s.name} · {dateFa(s.createdAt)}</option>)}
        </select>
      )}
    </div>
  );
}

function Kpi({ label, value, unit, hint, tone = '' }) {
  return (
    <div className="card p-5">
      <div className="stat-label mb-2">{label}</div>
      {value == null
        ? <div className="text-sm text-faint h-9 flex items-center">داده کافی نیست</div>
        : <div className="flex items-baseline gap-1.5"><span className={'num text-3xl font-semibold tracking-tight ' + tone}>{value}</span>{unit && <span className="text-xs text-faint">{unit}</span>}</div>}
      {hint && <div className="text-xs text-faint mt-2">{hint}</div>}
    </div>
  );
}

function ChartCard({ m, height, compact }) {
  return (
    <section id="stats-chart" className={'card ' + (compact ? 'p-4' : 'p-5')}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">روند زمان‌ها</h3>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-accent"></span>هر حل</span>
          {m.points.length >= 5 && <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-ok"></span>ao5</span>}
        </div>
      </div>
      {m.points.length >= 2
        ? <TrendChart points={m.points} ao5={m.ao5Series} height={height} compact={compact} />
        : <div className="flex items-center justify-center text-sm text-faint border border-dashed border-line rounded-xl" style={{ height: compact ? 140 : height }}>{m.points.length ? 'برای نمودار دست‌کم دو حل معتبر لازم است.' : 'در این بازه حل معتبری ثبت نشده است.'}</div>}
    </section>
  );
}

function Desktop() {
  const m = useStatsModel();
  const rows = [...m.list].reverse().slice(0, 50);
  const empty = m.data.solves.length === 0;
  return (
    <main className="w-full max-w-[1200px] mx-auto px-6 py-10">
      <PageHeader title="آمار" text="روند حل‌ها، میانگین‌ها و پیشرفت در طول زمان" actions={<Filters m={m} />} />

      {empty ? (
        <Empty icon="fa-chart-simple" title="داده‌ای برای نمایش نیست" text="اولین جلسهٔ تمرین را شروع کن تا آمار اینجا ظاهر شود."
          action={<a href="#/practice" className="btn-primary">شروع تمرین</a>} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Kpi label="بهترین حل" value={m.best ? resultText(m.best) : '—'} unit={m.best ? 'ثانیه' : null} tone="text-ok"
              hint={m.improvement != null ? <span className="text-ok"><i className="fa-solid fa-arrow-trend-down ms-1"></i>{faDigits(m.improvement.toFixed(1))}٪ بهتر از پیش از این بازه</span> : m.best ? 'در بازهٔ انتخابی' : 'هنوز حل معتبری نیست'} />
            <Kpi label="ao5" value={m.ao5 == null ? null : msText(m.ao5)} unit={m.ao5 != null && m.ao5 !== Infinity ? 'ثانیه' : null} hint="بر اساس ۵ حل آخر" />
            <Kpi label="ao12" value={m.ao12 == null ? null : msText(m.ao12)} unit={m.ao12 != null && m.ao12 !== Infinity ? 'ثانیه' : null} hint="بر اساس ۱۲ حل آخر" />
            <Kpi label="تعداد حل" value={String(m.list.length)} hint="در بازهٔ انتخابی" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 mb-6">
            <ChartCard m={m} height={320} />
            <section className="card p-5">
              <h3 className="section-title mb-4">جلسه‌ها</h3>
              {m.sessions.length === 0 ? <p className="text-sm text-faint">هنوز جلسه‌ای با حل ثبت نشده است.</p> : (
                <div className="space-y-2">
                  {m.sessions.slice(0, 8).map((s) => {
                    const c = countedSolves(s.solves);
                    const a5 = aoN(s.solves.filter((x) => isCounted(x)), 5);
                    const on = m.session === s.id;
                    return (
                      <button key={s.id} onClick={() => m.setSession(on ? 'all' : s.id)} aria-pressed={on}
                        className={'w-full text-right px-3.5 py-3 rounded-lg border transition-colors ' + (on ? 'border-accent/50 bg-accent/10' : 'border-line hover:border-strong')}>
                        <div className="flex justify-between items-center gap-2">
                          <span className="text-sm font-medium truncate">{s.name}</span>
                          <span className="text-xs text-faint shrink-0">{dateFa(s.createdAt)}</span>
                        </div>
                        <div className="text-xs text-muted mt-1 flex gap-3">
                          <span>{fa(s.solves.length)} حل</span>
                          {a5 != null && <span>ao5 <span className="num text-ink">{msText(a5)}</span></span>}
                          {c.length > 0 && a5 == null && <span>بهترین <span className="num text-ink">{resultText(bestSolve(c))}</span></span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <section className="card overflow-hidden">
            <div className="px-5 h-14 flex items-center justify-between border-b border-line">
              <h3 className="section-title">تاریخچهٔ حل‌ها</h3>
              <span className="text-xs text-faint">{fa(rows.length)} مورد اخیر</span>
            </div>
            {rows.length === 0 ? <p className="text-sm text-faint p-5">حلی برای نمایش نیست.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="text-xs text-faint border-b border-line">
                      <th className="px-5 py-3 font-medium w-14">#</th><th className="px-3 py-3 font-medium">زمان</th><th className="px-3 py-3 font-medium">نوع</th>
                      <th className="px-3 py-3 font-medium">اسکرَمبل</th><th className="px-3 py-3 font-medium">تاریخ</th><th className="px-3 py-3 font-medium">وضعیت</th><th className="px-5 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => {
                      const [st, cls] = statusOf(s);
                      return (
                        <tr key={s.id} className="border-b border-line/60 last:border-0 hover:bg-raised/50 transition-colors">
                          <td className="px-5 py-3 num text-faint text-xs">{m.numberOf(s)}</td>
                          <td className="px-3 py-3"><TimeCell s={s} /></td>
                          <td className="px-3 py-3 text-muted">{KIND_LABEL[s.kind] || s.kind}</td>
                          <td className="px-3 py-3 font-mono text-xs text-muted" dir="ltr">{s.scramble ? s.scramble.split(' ').slice(0, 5).join(' ') + ' …' : '—'}</td>
                          <td className="px-3 py-3 text-muted">{dateFa(s.createdAt)} <span className="text-faint">{timeFa(s.createdAt)}</span></td>
                          <td className="px-3 py-3">
                            <span className={'badge ' + cls}>{st}</span>
                            {s.note ? <i className="fa-regular fa-note-sticky me-2 text-faint" title="یادداشت دارد"></i> : null}
                          </td>
                          <td className="px-5 py-3"><a href={'#/solve/' + s.id} className="icon-btn w-8 h-8" aria-label="جزئیات" title="جزئیات"><i className="fa-solid fa-chevron-left text-xs"></i></a></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Mobile({ route }) {
  const m = useStatsModel();
  const rows = [...m.list].reverse().slice(0, 60);
  return (
    <div className="mob-page">
      <MobileHeader title="آمار" />
      <main className="px-4 pt-4 space-y-4">
        <Filters m={m} className="[&>select]:flex-1" />
        <div className="grid grid-cols-3 gap-2">
          <div className="card p-3"><div className="stat-label mb-1">بهترین</div><div className="stat-value !text-base text-ok">{m.best ? resultText(m.best) : '—'}</div></div>
          <div className="card p-3"><div className="stat-label mb-1">ao5</div><div className="stat-value !text-base">{m.ao5 == null ? '—' : msText(m.ao5)}</div></div>
          <div className="card p-3"><div className="stat-label mb-1">ao12</div><div className="stat-value !text-base">{m.ao12 == null ? '—' : msText(m.ao12)}</div></div>
        </div>
        <ChartCard m={m} height={200} compact />
        <section id="history">
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="section-title">تاریخچهٔ حل‌ها</h3>
            <span className="text-xs text-faint">{fa(m.list.length)} حل</span>
          </div>
          {rows.length === 0 ? (
            <Empty icon="fa-box-open" title="هنوز داده‌ای نیست" text="با اولین حل، تاریخچه و نمودار ساخته می‌شود." action={<a href="#/practice" className="btn-primary">شروع تمرین</a>} />
          ) : (
            <div className="card divide-y divide-line overflow-hidden">
              {rows.map((s) => (
                <a key={s.id} href={'#/solve/' + s.id} className="flex items-center justify-between px-4 py-3 active:bg-raised">
                  <div className="flex items-center gap-3">
                    <span className="num text-xs text-faint w-6">{m.numberOf(s)}</span>
                    <div>
                      <TimeCell s={s} />
                      <div className="text-[11px] text-faint">{dateFa(s.createdAt)}، {timeFa(s.createdAt)} · {KIND_LABEL[s.kind] || s.kind}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-faint">
                    {!s.valid && <span className="badge border-line text-faint">نامعتبر</span>}
                    {s.note && <i className="fa-regular fa-note-sticky text-xs"></i>}
                    <i className="fa-solid fa-chevron-left text-xs"></i>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
        <p className="text-xs text-faint leading-6 pb-2">زمان‌ها بر پایهٔ دریافت حرکت در مرورگرند؛ تفکیک مرحله یا مکث بدون شواهد کافی نمایش داده نمی‌شود.</p>
      </main>
      <MobileNav route="stats" />
    </div>
  );
}

export default function Stats({ mobile, route }) {
  return mobile ? <Mobile route={route} /> : <Desktop />;
}
