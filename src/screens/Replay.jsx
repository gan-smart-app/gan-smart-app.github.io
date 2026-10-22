import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { moveCount, tps } from '../core/stats.mjs';
import CubeView from '../components/CubeView.jsx';
import { usePlayback } from '../components/playback.js';
import { useToast, Empty } from '../components/ui.jsx';
import { fa, faDigits, resultText, dateFa, timeFa } from '../app/format.js';
import { KIND_LABEL } from './Stats.jsx';
import { MobileHeader, MobileNav } from '../layout/Shell.jsx';
import { navigate } from '../app/router.js';
import { AiAskBox } from '../components/AiAsk.jsx';
import { moveCount as mc } from '../core/stats.mjs';

function useReplayModel(id) {
  const app = useApp();
  const { data, actions } = app;
  const solve = data.solves.find((s) => s.id === id) || data.deleted.find((s) => s.id === id);
  const number = solve ? data.solves.indexOf(solve) + 1 : 0;
  const moves = useMemo(() => (solve?.moves || []).map((m) => m.m), [solve?.id, solve?.moves?.length]);
  const pb = usePlayback(solve?.startFacelets, moves);
  const [note, setNote] = useState(solve?.note || '');
  useEffect(() => setNote(solve?.note || ''), [solve?.id, solve?.note]);
  const [toast, show] = useToast();
  const togglePenalty = (p) => actions.updateSolve(solve.id, { penalty: solve.penalty === p ? null : p });
  const remove = async () => {
    await actions.deleteSolve(solve.id);
    show('حل حذف شد.', { label: 'بازگردانی', run: () => actions.restoreSolve(solve.id) });
  };
  const replayable = !!(solve && solve.startFacelets && moves.length && solve.movesComplete !== false && pb.valid);
  const batched = (solve?.moves || []).reduce((acc, m, i, arr) => acc + (i > 0 && m.b != null && m.b === arr[i - 1].b ? 1 : 0), 0);
  return { app, solve, number, moves, pb, note, setNote, toast, togglePenalty, remove, replayable, batched, actions };
}

function Metrics({ r, cls, labelCls, valueCls, skipRaw = false }) {
  const s = r.solve;
  const mc = moveCount(s), t = tps(s);
  return (
    <>
      {!skipRaw && <div className={cls}><p className={labelCls}>زمان خام</p><p className={valueCls}>{faDigits(resultText({ ...s, penalty: null }))}</p></div>}
      <div className={cls}><p className={labelCls}>تعداد حرکت</p><p className={valueCls}>{mc == null ? 'نامشخص' : fa(mc)}</p></div>
      <div className={cls}><p className={labelCls}>TPS</p><p className={valueCls}>{t == null ? 'نامشخص' : faDigits(t.toFixed(1))}</p></div>
      <div className={cls}><p className={labelCls}>نوع تمرین</p><p className={valueCls}>{KIND_LABEL[s.kind] || s.kind}</p></div>
    </>
  );
}

function Timeline({ pb, thin }) {
  const pct = pb.total ? (pb.index / pb.total) * 100 : 0;
  return (
    <input type="range" min={0} max={pb.total} value={pb.index} onChange={(e) => pb.seek(Number(e.target.value))}
      aria-label={'حرکت ' + fa(pb.index) + ' از ' + fa(pb.total)}
      className={'w-full appearance-none rounded-full cursor-pointer ' + (thin ? 'h-1' : 'h-2')}
      style={{ background: `linear-gradient(to left, #22d3ee ${pct}%, #334155 ${pct}%)`, accentColor: '#22d3ee' }} />
  );
}

function Desktop({ id }) {
  const r = useReplayModel(id);
  const cube = useRef(null);
  const listRef = useRef(null);
  const [big, setBig] = useState(false);
  if (!r.solve) return <main className="p-8"><Empty icon="fa-magnifying-glass" title="این حل پیدا نشد" text="ممکن است هنوز از دستگاه دیگر همگام نشده باشد." action={<a href="#/stats" className="text-cyan-300">بازگشت به آمار</a>} /></main>;
  const s = r.solve;
  const pb = r.pb;
  return (
    <>
      <nav id="header" className="h-16 border-b border-slate-800 glass px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button className="text-slate-400 hover:text-white" aria-label="بازگشت" title="بازگشت" onClick={() => (history.length > 1 ? history.back() : navigate('stats'))}><i className="fa-solid fa-arrow-right"></i></button>
          <div className="h-6 w-px bg-slate-700"></div>
          <h1 className="font-bold">جزئیات حل شماره {fa(r.number || '')}</h1>
          <span className="text-xs text-slate-500">{dateFa(s.createdAt)} · {timeFa(s.createdAt)}</span>
        </div>
        <div className="flex gap-4">
          {s.deleted
            ? <button className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-4 py-1.5 rounded-lg text-xs font-bold" onClick={() => r.actions.restoreSolve(s.id)}>بازگردانی حل</button>
            : <button className="bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-all" onClick={r.remove}>حذف حل</button>}
        </div>
      </nav>
      <main className="p-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
        <div className="lg:col-span-1 space-y-8">
          <section className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 text-center relative overflow-hidden">
            <div className={'absolute top-0 right-0 px-4 py-1 text-[10px] font-bold rounded-bl-xl ' + (s.deleted ? 'bg-slate-500/20 text-slate-300' : s.penalty === 'DNF' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400')}>
              {s.deleted ? 'حذف‌شده' : s.penalty === 'DNF' ? 'DNF' : 'معتبر'}
            </div>
            <p className="text-slate-500 text-sm mb-2 uppercase tracking-widest font-bold">زمان نهایی</p>
            <h2 className="text-6xl font-bold mb-6">{faDigits(resultText(s))}</h2>
            {!s.deleted && (
              <div className="flex gap-2 justify-center mb-8">
                <button aria-pressed={s.penalty === '+2'} className={'flex-1 bg-slate-900 border py-2 rounded-xl text-xs font-bold transition-all ' + (s.penalty === '+2' ? 'border-yellow-400 text-yellow-300' : 'border-slate-700 text-slate-400 hover:border-yellow-400')} onClick={() => r.togglePenalty('+2')}>{s.penalty === '+2' ? 'حذف جریمه +2' : '+2'}</button>
                <button aria-pressed={s.penalty === 'DNF'} className={'flex-1 bg-slate-900 border py-2 rounded-xl text-xs font-bold transition-all ' + (s.penalty === 'DNF' ? 'border-red-500 text-red-400' : 'border-slate-700 text-slate-400 hover:border-red-500')} onClick={() => r.togglePenalty('DNF')}>{s.penalty === 'DNF' ? 'لغو DNF' : 'DNF'}</button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-right">
              <Metrics r={r} cls="bg-slate-900/50 p-3 rounded-xl border border-slate-800" labelCls="text-[10px] text-slate-500 mb-1" valueCls="text-sm font-bold" />
            </div>
            {s.penalty === '+2' && <p className="text-[10px] text-slate-500 mt-4">زمان خام و جریمه جدا نگهداری می‌شوند؛ DNF صفر نیست و در میانگین بدترین حساب می‌شود.</p>}
          </section>
          <section className="bg-slate-800/50 border border-slate-700 rounded-3xl p-6">
            <h3 className="font-bold text-sm mb-4">اسکرَمبل (Scramble)</h3>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <code className="move-font text-xs text-accent-cyan leading-relaxed block text-center uppercase">{s.scramble || (s.kind === 'free' ? 'تمرین آزاد · وضعیت آغازین از روبیک ثبت شد' : '—')}</code>
            </div>
          </section>
<AiAskBox type="solve" title="پرسش دربارهٔ همین حل" payload={{ solveId: s.id, kind: s.kind, timeSec: s.penalty === 'DNF' ? 'DNF' : Math.round((s.rawMs + (s.penalty === '+2' ? 2000 : 0)) / 10) / 100, penalty: s.penalty || 'none', moves: mc(s), scramble: s.scramble || 'free', note: s.note || '' }} />
          <section className="bg-slate-800/50 border border-slate-700 rounded-3xl p-6">
            <h3 className="font-bold text-sm mb-4">یادداشت</h3>
            <textarea placeholder="یادداشتی درباره این حل بنویسید..." value={r.note} onChange={(e) => r.setNote(e.target.value)} maxLength={500}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 focus:outline-none focus:border-accent-cyan min-h-[100px] transition-all" aria-label="یادداشت درباره این حل" />
            <div className="mt-4 flex justify-between items-center">
              <span className="text-[10px] text-slate-500">زمان دریافت حرکت در مرورگر است.</span>
              <button className="text-xs text-accent-cyan font-bold disabled:opacity-40" disabled={r.note === (s.note || '')} onClick={() => r.actions.updateSolve(s.id, { note: r.note })}>ذخیره یادداشت</button>
            </div>
          </section>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <section className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 overflow-hidden flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-8">
              <h3 className="font-bold text-sm">بازپخش سه‌بعدی حل</h3>
              <div className="flex gap-2">
                <button className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white" aria-label="بازنشانی نما" title="بازنشانی نما" onClick={() => cube.current?.resetCamera()}><i className="fa-solid fa-camera"></i></button>
                <button className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-white" aria-label={big ? 'کوچک‌کردن نما' : 'بزرگ‌کردن نما'} title="بزرگ‌کردن نما" onClick={() => setBig(!big)}><i className={'fa-solid ' + (big ? 'fa-compress' : 'fa-expand')}></i></button>
              </div>
            </div>
            {r.replayable ? (
              <>
                <div className={(big ? 'w-full h-[520px]' : 'w-72 h-72') + ' bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl relative mb-12 overflow-hidden'}>
                  <CubeView ref={cube} facelets={pb.facelets} lastMove={pb.lastMove} moveKey={pb.moveKey} height="100%" speed={pb.speed} />
                </div>
                <div className="w-full space-y-6">
                  <Timeline pb={pb} />
                  <div className="flex justify-between items-center px-2">
                    <div className="flex gap-4 items-center">
                      <button className="text-slate-400 hover:text-white" aria-label="حرکت قبل" title="حرکت قبل" onClick={pb.prev}><i className="fa-solid fa-backward-step"></i></button>
                      <button className="w-12 h-12 bg-accent-cyan rounded-2xl text-slate-900 flex items-center justify-center hover:scale-105 transition-all" aria-label={pb.playing ? 'مکث' : 'پخش'} title={pb.playing ? 'مکث' : 'پخش'} onClick={pb.toggle}><i className={'fa-solid ' + (pb.playing ? 'fa-pause' : 'fa-play ml-1')}></i></button>
                      <button className="text-slate-400 hover:text-white" aria-label="حرکت بعد" title="حرکت بعد" onClick={pb.next}><i className="fa-solid fa-forward-step"></i></button>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">حرکت {fa(pb.index)} از {fa(pb.total)}</span>
                      <div className="w-px h-4 bg-slate-700"></div>
                      <select className="bg-transparent text-xs text-slate-400 focus:outline-none" aria-label="سرعت پخش" value={pb.speed} onChange={(e) => pb.setSpeed(Number(e.target.value))}>
                        <option value={0.5}>0.5x</option><option value={1}>1.0x</option><option value={2}>2.0x</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">بازپخش با ضرب‌آهنگ یکنواخت است؛ فاصلهٔ واقعی بین حرکت‌ها از زمان دریافت مرورگر دقیق قابل بازسازی نیست.</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400 py-16">برای این حل، وضعیت آغازین یا فهرست کامل حرکت‌ها ثبت نشده است؛ بازپخش ساخته نمی‌شود.</p>
            )}
          </section>
          <section className="bg-slate-800/50 border border-slate-700 rounded-3xl p-6">
            <h3 className="font-bold text-sm mb-6">حرکت‌های ثبت‌شده</h3>
            <div ref={listRef} className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-[360px] overflow-y-auto">
              {r.moves.map((m, i) => {
                const cur = i === pb.index - 1;
                return (
                  <button key={i} onClick={() => pb.seek(i + 1)}
                    className={'bg-slate-900 p-2 rounded-xl text-center ' + (cur ? 'border-2 border-accent-cyan ring-4 ring-cyan-400/10' : 'border border-slate-800') + (i < pb.index - 1 ? ' opacity-40' : '')}>
                    <p className={'text-[8px] mb-1 ' + (cur ? 'accent-cyan font-bold' : 'text-slate-500')}>حرکت {fa(i + 1)}</p>
                    <p className={'move-font font-bold text-sm ' + (cur ? 'text-white' : i >= pb.index ? 'text-slate-400' : '')}>{m}</p>
                  </button>
                );
              })}
              <div className="col-span-full py-6 text-center text-slate-600">
                <p className="text-[10px]">
                  داده‌های دقیق تشخیص مرحله (F2L/OLL) و مکث‌ها به دلیل نبود شاهد کافی در این حل نمایش داده نمی‌شود.
                  {r.batched > 0 && ` ${fa(r.batched)} حرکت به‌صورت دسته‌ای در یک خواندن دریافت شده‌اند و زمان جداگانه ندارند.`}
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
      {r.toast}
    </>
  );
}

function Mobile({ id }) {
  const r = useReplayModel(id);
  const cube = useRef(null);
  if (!r.solve) return <div className="mob"><MobileHeader title="جزئیات حل" back="#/stats" /><main className="mt-20 px-4"><Empty title="این حل پیدا نشد" /></main><MobileNav route="stats" /></div>;
  const s = r.solve, pb = r.pb;
  return (
    <div className="mob">
      <MobileHeader title={'جزئیات حل #' + fa(r.number)} back="#/stats" />
      <main className="mt-16 px-4 space-y-6">
        <section id="solve-details" className="pt-2 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="cyber-panel p-4 rounded-xl space-y-1">
              <div className="text-[9px] text-secondary">زمان خام</div>
              <div className="font-tabular text-xl">{resultText({ ...s, penalty: null })}</div>
            </div>
            <div className={'cyber-panel p-4 rounded-xl space-y-1 ' + (s.penalty ? 'border-red-500/20' : '')}>
              <div className={'text-[9px] ' + (s.penalty ? 'text-red-400' : 'text-secondary')}>{s.penalty ? 'جریمه' : 'نتیجهٔ نهایی'}</div>
              <div className={'font-tabular text-xl ' + (s.penalty ? 'text-red-400' : '')}>{s.penalty === '+2' ? '+2.00' : s.penalty === 'DNF' ? 'DNF' : resultText(s)}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metrics r={r} skipRaw cls="cyber-panel p-2 rounded-xl" labelCls="text-[9px] text-secondary" valueCls="text-xs font-bold" />
          </div>
          <div className="cyber-panel p-4 rounded-xl space-y-3">
            <div className="text-[9px] text-secondary uppercase tracking-widest">اسکرَمبل</div>
            <div className="font-mono text-[10px] leading-relaxed text-cyan" dir="ltr">{s.scramble || 'تمرین آزاد'}</div>
          </div>
          <div className="cyber-panel p-4 rounded-xl space-y-3">
            <div className="text-[9px] text-secondary uppercase tracking-widest">توالی حرکات حل</div>
            <div className="font-mono text-[10px] leading-relaxed text-white max-h-20 overflow-y-auto" dir="ltr">{r.moves.join(' ') || '—'}</div>
          </div>
          {r.replayable && (
            <div className="cyber-panel p-6 rounded-2xl space-y-4">
              <div className="text-xs font-bold text-center">بازپخش حل</div>
              <CubeView ref={cube} facelets={pb.facelets} lastMove={pb.lastMove} moveKey={pb.moveKey} height={240} speed={pb.speed} />
              <div className="space-y-4">
                <Timeline pb={pb} thin />
                <div className="flex justify-between items-center px-2">
                  <span className="text-[10px] text-secondary">حرکت {fa(pb.index)} از {fa(pb.total)}</span>
                  <div className="flex gap-4">
                    <button className="text-secondary hover:text-white" aria-label="حرکت قبل" title="حرکت قبل" onClick={pb.prev}><i className="fa-solid fa-backward-step"></i></button>
                    <button className="text-cyan" aria-label={pb.playing ? 'مکث' : 'پخش'} onClick={pb.toggle}><i className={'fa-solid ' + (pb.playing ? 'fa-pause' : 'fa-play')}></i></button>
                    <button className="text-secondary hover:text-white" aria-label="حرکت بعد" title="حرکت بعد" onClick={pb.next}><i className="fa-solid fa-forward-step"></i></button>
                  </div>
                  <button className="text-[10px] text-secondary" onClick={() => pb.setSpeed(pb.speed === 1 ? 2 : pb.speed === 2 ? 0.5 : 1)}>سرعت: {faDigits(pb.speed.toFixed(1))}</button>
                </div>
              </div>
            </div>
          )}
          {!s.deleted && (
            <div className="grid grid-cols-2 gap-3">
              <button className={'py-3 rounded-xl text-xs border ' + (s.penalty === '+2' ? 'border-yellow-400 text-yellow-300' : 'border-white/10 bg-white/5')} onClick={() => r.togglePenalty('+2')}>{s.penalty === '+2' ? 'حذف +2' : 'ثبت +2'}</button>
              <button className={'py-3 rounded-xl text-xs border ' + (s.penalty === 'DNF' ? 'border-red-400 text-red-300' : 'border-white/10 bg-white/5')} onClick={() => r.togglePenalty('DNF')}>{s.penalty === 'DNF' ? 'حذف DNF' : 'ثبت DNF'}</button>
            </div>
          )}
          <textarea aria-label="یادداشت همین حل" placeholder="یادداشت دربارهٔ حل…" className="w-full cyber-panel p-4 rounded-xl min-h-[110px]" value={r.note} onChange={(e) => r.setNote(e.target.value)} maxLength={500} />
          <div className="flex gap-3">
            {s.deleted
              ? <button className="flex-1 py-3 bg-cyan-400/10 text-cyan border border-cyan-400/30 rounded-xl text-xs" onClick={() => r.actions.restoreSolve(s.id)}>بازگردانی</button>
              : <button className="flex-1 py-3 bg-red-500/10 text-red-400 border border-red-500/30 rounded-xl text-xs" onClick={r.remove}>حذف حل</button>}
            <button className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-xs disabled:opacity-40" disabled={r.note === (s.note || '')} onClick={() => r.actions.updateSolve(s.id, { note: r.note })}>ذخیره یادداشت</button>
          </div>
<AiAskBox type="solve" title="پرسش دربارهٔ همین حل" payload={{ solveId: s.id, kind: s.kind, timeSec: s.penalty === 'DNF' ? 'DNF' : Math.round((s.rawMs + (s.penalty === '+2' ? 2000 : 0)) / 10) / 100, penalty: s.penalty || 'none', moves: mc(s), scramble: s.scramble || 'free', note: s.note || '' }} />
          <p className="text-xs text-secondary">وضعیت آغازین و حرکت‌های ثبت‌شده مبنای بازپخش‌اند. زمان دریافت مرورگر، timestamp دقیق دستگاه نیست؛ برای تشخیص مکث یا مرحله دادهٔ کافی نداریم.</p>
        </section>
      </main>
      <MobileNav route="stats" />
      {r.toast}
    </div>
  );
}

export default function Replay({ mobile, route }) {
  const id = route.params[0];
  return mobile ? <Mobile id={id} /> : <Desktop id={id} />;
}
