import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { aoN, bestSolve, countedSolves, effectiveMs, isCounted, rollingAo } from '../core/stats.mjs';
import TrendChart from '../components/TrendChart.jsx';
import { Empty } from '../components/ui.jsx';
import { dateFa, fa, faDigits, msText, resultText, timeFa } from '../app/format.js';
import { MobileHeader, MobileNav } from '../layout/Shell.jsx';

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
  if (!s.valid) return ['نامعتبر', 'text-slate-500'];
  if (s.penalty === 'DNF') return ['DNF', 'text-red-400'];
  if (s.penalty === '+2') return ['جریمه', 'text-yellow-400'];
  return ['معتبر', 'text-green-400'];
}

function Desktop() {
  const m = useStatsModel();
  const rows = [...m.list].reverse().slice(0, 50);
  const empty = m.data.solves.length === 0;
  return (
    <main className="pt-8 pb-12 px-8 max-w-7xl mx-auto w-full">
      <header className="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">آمار و عملکرد</h1>
          <p className="text-slate-400">روند حل‌ها، میانگین‌ها و پیشرفت در طول زمان</p>
        </div>
        <div className="flex gap-4">
          <select className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent-cyan" aria-label="بازهٔ زمانی" value={m.range} onChange={(e) => m.setRange(e.target.value)}>
            {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent-cyan" aria-label="نوع تمرین" value={m.kind} onChange={(e) => m.setKind(e.target.value)}>
            <option value="all">همه تمرین‌ها</option>
            {m.kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] || k}</option>)}
          </select>
          {m.sessions.length > 1 && (
            <select className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm" aria-label="جلسه" value={m.session} onChange={(e) => m.setSession(e.target.value)}>
              <option value="all">همهٔ جلسه‌ها</option>
              {m.sessions.map((s) => <option key={s.id} value={s.id}>{s.name} · {dateFa(s.createdAt)}</option>)}
            </select>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
          <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider font-bold">بهترین حل</p>
          <p className="text-3xl font-bold accent-cyan">{m.best ? resultText(m.best, { persian: true }) : '—'} {m.best && <span className="text-sm font-normal text-slate-500">ثانیه</span>}</p>
          {m.improvement != null
            ? <p className="text-[10px] text-green-400 mt-2"><i className="fa-solid fa-caret-down ml-1"></i> {faDigits(m.improvement.toFixed(1))}٪ بهبود نسبت به بهترین پیش از این بازه</p>
            : <p className="text-[10px] text-slate-500 mt-2">{m.best ? 'در بازهٔ انتخابی' : 'هنوز حل معتبری نیست'}</p>}
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
          <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider font-bold">Ao5</p>
          <p className="text-3xl font-bold">{m.ao5 == null ? <span className="text-base text-slate-500">داده کافی نیست</span> : <>{msText(m.ao5, { persian: true })} {m.ao5 !== Infinity && <span className="text-sm font-normal text-slate-500">ثانیه</span>}</>}</p>
          <p className="text-[10px] text-slate-500 mt-2">بر اساس ۵ حل آخر</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
          <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider font-bold">Ao12</p>
          <p className="text-3xl font-bold">{m.ao12 == null ? <span className="text-base text-slate-500">داده کافی نیست</span> : <>{msText(m.ao12, { persian: true })} {m.ao12 !== Infinity && <span className="text-sm font-normal text-slate-500">ثانیه</span>}</>}</p>
          <p className="text-[10px] text-slate-500 mt-2">بر اساس ۱۲ حل آخر</p>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
          <p className="text-slate-500 text-xs mb-1 uppercase tracking-wider font-bold">تعداد حل</p>
          <p className="text-3xl font-bold">{fa(m.list.length)} <span className="text-sm font-normal text-slate-500">مورد</span></p>
          <p className="text-[10px] text-slate-500 mt-2">در بازه انتخابی</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <h3 className="font-bold mb-6 text-sm flex items-center justify-between">
              نمودار پیشرفت زمانی
              <span className="text-[10px] text-slate-500 font-normal">محور عمودی: ثانیه / محور افقی: شماره حل{m.points.length >= 5 ? ' · خط‌چین بنفش: ao5' : ''}</span>
            </h3>
            {m.points.length >= 2
              ? <TrendChart points={m.points} ao5={m.ao5Series} height={400} />
              : <div className="h-[400px] flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-700 rounded-xl">{m.points.length ? 'برای نمودار دست‌کم دو حل معتبر لازم است.' : 'در این بازه حل معتبری ثبت نشده است.'}</div>}
          </section>
          <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <h3 className="font-bold mb-6 text-sm">تاریخچه حل‌ها</h3>
            {rows.length === 0 ? <p className="text-xs text-slate-500">حلی برای نمایش نیست.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs data-table">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-500">
                      <th className="pb-4 font-bold">#</th><th className="pb-4 font-bold">زمان</th><th className="pb-4 font-bold">نوع</th>
                      <th className="pb-4 font-bold">اسکرَمبل</th><th className="pb-4 font-bold">تاریخ</th><th className="pb-4 font-bold">وضعیت</th><th className="pb-4"></th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {rows.map((s) => {
                      const [st, cls] = statusOf(s);
                      return (
                        <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/50">
                          <td className="py-4">{fa(m.numberOf(s))}</td>
                          <td className={'py-4 font-bold ' + (s.penalty === 'DNF' ? 'text-red-400' : s.penalty === '+2' ? 'text-yellow-400' : '')}>
                            {s.penalty === 'DNF' ? 'DNF' : faDigits(resultText({ ...s, penalty: null }))} {s.penalty === '+2' && <span className="text-[8px]">+2</span>}
                          </td>
                          <td className="py-4">{KIND_LABEL[s.kind] || s.kind}</td>
                          <td className="py-4 font-mono text-[10px] text-left" dir="ltr">{s.scramble ? s.scramble.split(' ').slice(0, 4).join(' ') + ' …' : '—'}</td>
                          <td className="py-4">{dateFa(s.createdAt)}</td>
                          <td className={'py-4 ' + cls}>{st}{s.note ? <i className="fa-regular fa-note-sticky mr-1 text-slate-500" title="یادداشت دارد"></i> : null}</td>
                          <td className="py-4"><a href={'#/solve/' + s.id} className="text-slate-600 hover:text-white" aria-label="جزئیات و بازپخش" title="جزئیات و بازپخش"><i className="fa-solid fa-ellipsis"></i></a></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <div className="space-y-8">
          <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <h3 className="font-bold mb-6 text-sm">جلسات تمرینی</h3>
            {m.sessions.length === 0 ? <p className="text-xs text-slate-500">هنوز جلسه‌ای با حل ثبت نشده است.</p> : (
              <div className="space-y-3">
                {m.sessions.slice(0, 8).map((s) => {
                  const c = countedSolves(s.solves);
                  const a5 = aoN(s.solves.filter((x) => isCounted(x)), 5);
                  return (
                    <button key={s.id} onClick={() => m.setSession(m.session === s.id ? 'all' : s.id)}
                      className={'w-full text-right p-3 bg-slate-900 rounded-xl border hover:border-accent-cyan transition-all ' + (m.session === s.id ? 'border-cyan-400' : 'border-slate-800')}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold">{s.name}</span>
                        <span className="text-[10px] text-slate-500">{dateFa(s.createdAt)}</span>
                      </div>
                      <p className="text-[10px] text-slate-400">{fa(s.solves.length)} حل{a5 != null ? ' - Ao5: ' + msText(a5, { persian: true }) : ''}{c.length && a5 == null ? ' - بهترین: ' + resultText(bestSolve(c), { persian: true }) : ''}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
          {empty && (
            <div className="bg-slate-800/20 border border-dashed border-slate-700 rounded-2xl p-8 text-center">
              <i className="fa-solid fa-chart-pie text-4xl text-slate-700 mb-4"></i>
              <h4 className="font-bold text-sm mb-2">داده‌ای برای نمایش نیست</h4>
              <p className="text-xs text-slate-500 mb-6">اولین جلسه تمرین خود را شروع کنید تا آمار شما اینجا ظاهر شود.</p>
              <a href="#/practice" className="bg-accent-cyan text-slate-900 px-6 py-2 rounded-xl text-xs font-bold">شروع تمرین</a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Mobile({ route }) {
  const m = useStatsModel();
  const rows = [...m.list].reverse().slice(0, 60);
  const sessionName = m.session === 'all' ? 'همهٔ جلسه‌ها' : m.sessions.find((s) => s.id === m.session)?.name;
  const cycle = (vals, cur, set) => set(vals[(vals.indexOf(cur) + 1) % vals.length]);
  const chip = (on) => (on ? 'bg-cyan-400/10 text-cyan border border-cyan-400/30' : 'cyber-panel text-secondary') + ' px-4 py-1.5 rounded-full text-[10px] whitespace-nowrap';
  return (
    <div className="mob">
      <MobileHeader title="آمار و تاریخچه" start={<i className="fa-solid fa-chart-line text-cyan text-lg"></i>} end={<i className="fa-solid fa-calendar-days text-secondary text-sm"></i>} />
      <main className="mt-16 px-4 space-y-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button className={chip(true)} onClick={() => cycle(RANGES.map((r) => r[0]), m.range, m.setRange)}>{RANGES.find((r) => r[0] === m.range)[1]}</button>
          <button className={chip(m.session !== 'all')} onClick={() => cycle(['all', ...m.sessions.map((s) => s.id)], m.session, m.setSession)}>جلسه: {sessionName}</button>
          <button className={chip(m.kind !== 'all')} onClick={() => cycle(['all', ...m.kinds], m.kind, m.setKind)}>نوع: {m.kind === 'all' ? 'همه' : KIND_LABEL[m.kind] || m.kind}</button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="cyber-panel p-3 rounded-xl text-center">
            <div className="text-[9px] text-secondary mb-1">بهترین</div>
            <div className="font-tabular font-bold text-white">{m.best ? resultText(m.best) : '—'}</div>
          </div>
          <div className="cyber-panel p-3 rounded-xl text-center border-cyan-400/30">
            <div className="text-[9px] text-cyan mb-1">ao5</div>
            {m.ao5 == null ? <div className="text-xs text-secondary">داده کافی نیست</div> : <div className="font-tabular font-bold text-cyan">{msText(m.ao5)}</div>}
          </div>
          <div className="cyber-panel p-3 rounded-xl text-center">
            <div className="text-[9px] text-secondary mb-1">ao12</div>
            {m.ao12 == null ? <div className="text-xs text-secondary">داده کافی نیست</div> : <div className="font-tabular font-bold">{msText(m.ao12)}</div>}
          </div>
        </div>
        <section id="stats-chart" className="cyber-panel rounded-2xl p-4">
          <h3 className="text-xs font-bold mb-4">روند پیشرفت زمان‌ها</h3>
          {m.points.length >= 2 ? <TrendChart points={m.points} ao5={m.ao5Series} height={200} compact /> : <div className="h-[120px] flex items-center justify-center text-xs text-secondary">{m.points.length ? 'برای نمودار دست‌کم دو حل معتبر لازم است.' : 'هنوز داده‌ای نیست.'}</div>}
        </section>
        <section id="history" className="space-y-3">
          <h3 className="text-xs font-bold border-r-2 border-purple-500 pr-2">تاریخچه حل‌ها</h3>
          {rows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-secondary">
              <i className="fa-solid fa-box-open text-3xl mb-2"></i>
              <p className="text-[10px] mb-3">هنوز داده‌ای نیست؛ با اولین حل، تاریخچه و نمودار ساخته می‌شود.</p>
              <a href="#/practice" className="w-full text-center py-3 px-4 rounded-xl border border-white/15 bg-white/5 text-sm font-medium">شروع تمرین</a>
            </div>
          )}
          {rows.map((s) => (
            <a key={s.id} href={'#/solve/' + s.id} className={'cyber-panel p-4 rounded-xl flex items-center justify-between hover:border-white/20 transition-colors' + (s.penalty === 'DNF' ? ' opacity-80' : '')}>
              <div className="flex items-center gap-4">
                <span className="text-[10px] text-secondary">#{fa(m.numberOf(s))}</span>
                {s.penalty === 'DNF' ? <div className="text-red-400 font-bold text-xs">DNF</div> : (
                  <div>
                    <div className="font-tabular font-bold">{resultText({ ...s, penalty: s.penalty === '+2' ? '+2' : null }).replace('+', '')}</div>
                    <div className="text-[8px] text-secondary">{dateFa(s.createdAt)}، {timeFa(s.createdAt)} · {KIND_LABEL[s.kind] || s.kind}</div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {s.penalty === '+2' && <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-secondary">+2</span>}
                {s.note && <i className="fa-regular fa-note-sticky text-secondary text-[10px]"></i>}
                <i className="fa-solid fa-chevron-left text-secondary text-[10px]"></i>
              </div>
            </a>
          ))}
        </section>
        <p className="text-xs text-secondary">زمان‌ها بر پایهٔ دریافت حرکت در مرورگرند؛ تفکیک مرحله یا مکث بدون شواهد کافی نمایش داده نمی‌شود.</p>
      </main>
      <MobileNav route="stats" />
    </div>
  );
}

export default function Stats({ mobile, route }) {
  return mobile ? <Mobile route={route} /> : <Desktop />;
}
