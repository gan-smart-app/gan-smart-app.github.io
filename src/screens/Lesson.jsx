import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { ALGORITHMS, ALGORITHM_BY_ID, FRAME } from '../data/algorithms.mjs';
import { createCaseSetup } from '../core/cases.mjs';
import { grade, newRecord, suggestNext } from '../core/srs.mjs';
import { translateAlg } from '../core/cube.mjs';
import { useCaseRunner } from '../app/useCaseRunner.js';
import { usePlayback } from '../components/playback.js';
import CubeView from '../components/CubeView.jsx';
import { Alg } from '../components/ui.jsx';
import { fa, faDigits } from '../app/format.js';
import { categoryName, progressMap } from '../app/learning.js';
import { MobileHeader, MobileNav } from '../layout/Shell.jsx';
import { navigate } from '../app/router.js';
import { AiAskBox } from '../components/AiAsk.jsx';

const DRILL_TITLE = { cross: 'تمرین کراس', f2l: 'تمرین F2L', oll2: 'تمرین OLL دومرحله‌ای', pll2: 'تمرین PLL دومرحله‌ای', current: 'تمرین الگوریتم‌های روش فعلی', review: 'مرور فاصله‌دار', weak: 'مرور کیس‌های ضعیف', favorites: 'تمرین علاقه‌مندی‌ها' };

// Entries for the route: a single lesson or a drill set.
function useQueue(route, app) {
  const { data, settings } = app;
  return useMemo(() => {
    const id = route.params[0];
    if (route.name === 'lesson') return { title: 'درس: ' + (ALGORITHM_BY_ID[id]?.name || ''), entries: ALGORITHM_BY_ID[id] ? [ALGORITHM_BY_ID[id]] : [] };
    if (ALGORITHM_BY_ID[id]) return { title: 'تمرین: ' + ALGORITHM_BY_ID[id].name, entries: [ALGORITHM_BY_ID[id]] };
    const prog = progressMap(data.progress);
    if (id === 'review' || id === 'weak') {
      const s = suggestNext(prog, { difficulty: settings.drillDifficulty, repetitions: settings.drillRepetitions }, Date.now(), ALGORITHMS, { limit: 8 })
        .filter((x) => (id === 'weak' ? x.kind === 'weak' : x.kind !== 'new'));
      return { title: DRILL_TITLE[id], entries: s.map((x) => ALGORITHM_BY_ID[x.id]).filter(Boolean) };
    }
    if (id === 'favorites') return { title: DRILL_TITLE.favorites, entries: data.favorites.map((f) => ALGORITHM_BY_ID[f.id]).filter(Boolean) };
    if (id === 'cross') {
      const level = { easy: 'cross-short', medium: 'cross-mid', hard: 'cross-full' }[settings.drillDifficulty] || 'cross-mid';
      return { title: DRILL_TITLE.cross, entries: [ALGORITHM_BY_ID[level]] };
    }
    return { title: DRILL_TITLE[id] || 'تمرین', entries: ALGORITHMS.filter((a) => a.category === id && !a.later) };
  }, [route.name, route.params[0], data.favorites.length, settings.drillDifficulty]);
}

function makeCase(entry, difficulty) {
  const setup = createCaseSetup(entry, { randomAuf: difficulty !== 'easy', randomizeOtherPieces: difficulty === 'hard' });
  const solveUser = setup.solveUser || translateAlg(setup.optimalModel || [], FRAME);
  return { ...setup, solveUser, entry, frame: FRAME };
}

function useLesson(route) {
  const app = useApp();
  const { settings, actions, data, device, simulated } = app;
  const queue = useQueue(route, app);
  const reps = route.name === 'lesson' ? settings.drillRepetitions : Math.max(settings.drillRepetitions, queue.entries.length);
  const [rep, setRep] = useState(0);
  const [mode, setMode] = useState('watch'); // watch | practice
  const [log, setLog] = useState([]); // attempts this session
  const [kase, setKase] = useState(null);
  const runner = useCaseRunner();
  const savedFor = useRef(null);

  const next = (i = rep) => {
    const entries = queue.entries;
    if (!entries.length) return;
    const entry = entries[i % entries.length];
    setKase(makeCase(entry, settings.drillDifficulty));
  };
  useEffect(() => { setRep(0); setLog([]); next(0); }, [queue]);
  useEffect(() => { if (mode === 'practice' && kase) runner.start(kase); }, [mode, kase]);
  useEffect(() => () => runner.stop(), []);

  // Record each finished device run exactly once.
  useEffect(() => {
    if (runner.phase !== 'done' || !kase || savedFor.current === kase) return;
    savedFor.current = kase;
    const r = runner.result;
    const assessment = simulated ? 'virtual' : 'device';
    record(kase.entry, { ...r, assessment });
  }, [runner.phase]);

  const record = (entry, outcome) => {
    // Simulator runs stay in this screen only; they never enter saved progress.
    if (simulated) { setLog((l) => [...l, { id: entry.id, ...outcome }]); return; }
    const prog = progressMap(data.progress);
    const rec = grade(prog[entry.id] || newRecord(entry.id), outcome, { difficulty: settings.drillDifficulty, repetitions: settings.drillRepetitions }, Date.now());
    actions.putProgress(rec);
    setLog((l) => [...l, { id: entry.id, ...outcome }]);
  };
  const advance = () => { const i = rep + 1; setRep(i); next(i); };
  const selfAssess = (correct) => { record(kase.entry, { correct, mistakes: correct ? 0 : 1, assessment: 'self', ms: null }); advance(); };

  const modelMoves = useMemo(() => (kase ? translateAlg(kase.solveUser, FRAME) : []), [kase]);
  const pb = usePlayback(kase?.startFacelets, modelMoves, { beatMs: 600 });
  const ok = log.filter((l) => l.correct).length;
  const times = log.filter((l) => l.correct && l.ms).map((l) => l.ms);
  const hint = route.query.hint === '0' ? false : settings.nextMoveHint;
  return { app, queue, reps, rep, mode, setMode, kase, runner, pb, log, ok, times, advance, selfAssess, settings, actions, device, simulated, next, hint, accuracyOnly: route.query.hint === '0', goalMs: Number(route.query.goal) > 0 ? Number(route.query.goal) * 1000 : null };
}

function stepState(l) {
  const p = l.runner.phase;
  if (l.mode === 'watch') return 0;
  if (p === 'prepare' || p === 'planning' || p === 'noCube') return 1;
  if (p === 'execute') return l.runner.received?.length ? 3 : 2;
  if (p === 'done') return 4;
  return 1;
}

function Steps({ l, compact }) {
  const e = l.kase?.entry;
  if (!e) return null;
  const s = stepState(l);
  const items = [
    { t: 'آماده‌سازی کیس', d: 'روبیک را زرد بالا و سبز روبه‌رو نگه دار و حرکت‌های آماده‌سازی را اجرا کن؛ رسیدن به وضعیت آغازین با مدل روبیک تأیید می‌شود.' },
    { t: 'تشخیص کیس', d: e.recognition || 'شکل کیس را با نمای سه‌بعدی مقایسه کن.' },
    { t: 'اجرای الگوریتم', d: e.description },
  ];
  return items.map((it, i) => {
    const active = s === i + 1 || (s === 0 && i === 1) || (s >= 2 && i === 2 && s < 4) || (i === 1 && s === 2);
    return (
      <div key={i} className={compact ? 'cyber-panel rounded-xl p-3' : active ? 'bg-accent-cyan/10 border border-cyan-400/20 p-4 rounded-xl' : 'bg-slate-800/40 border border-slate-700 p-4 rounded-xl opacity-60'}>
        <h3 className={'font-bold text-sm mb-2 ' + (active ? 'accent-cyan' : 'text-slate-400')}>مرحله {fa(i + 1)}: {it.t}</h3>
        <p className="text-xs text-slate-300 leading-relaxed">{it.d}</p>
      </div>
    );
  });
}

function MovePills({ l }) {
  const moves = l.kase ? l.kase.solveUser : [];
  const m = l.runner.match;
  const idx = l.mode === 'practice' ? (m?.index ?? 0) : l.pb.index;
  const hint = l.hint || l.mode === 'watch';
  return (
    <div className="flex-1 flex gap-2 flex-wrap" dir="ltr" aria-label="حرکت‌های الگوریتم">
      {moves.map((mv, i) => (
        <div key={i} className={'min-w-8 px-1.5 h-10 rounded flex items-center justify-center font-bold move-font ' + (i < idx ? 'bg-slate-700 text-white opacity-40' : i === idx && hint ? 'bg-accent-cyan text-slate-900' : 'bg-slate-700 text-white opacity-30')}>
          {i === idx && !hint ? '?' : mv}
        </div>
      ))}
    </div>
  );
}

function Feedback({ l, mobile }) {
  const r = l.runner;
  if (l.mode !== 'practice') return null;
  if (r.phase === 'execute' && r.match?.deviated) {
    return (
      <div className={mobile ? 'cyber-panel p-4 rounded-xl border-red-500/30 bg-red-500/5' : 'absolute top-8 left-8 bg-red-500/10 border border-red-500/20 p-4 rounded-2xl max-w-xs'} role="alert">
        <div className="flex items-center gap-3 mb-2"><i className="fa-solid fa-circle-xmark text-red-400"></i><h4 className="font-bold text-sm text-red-400">حرکت اشتباه</h4></div>
        <p className="text-[10px] text-slate-300 leading-relaxed mb-2">
          اجرا: <Alg moves={r.match.deviation} className="text-white" />{r.match.nextMove && <> · لازم بود: <Alg moves={r.match.nextMove} className="text-cyan-300" /></>}
        </p>
        <p className="text-[10px] text-cyan-300">برای خنثی‌کردن، ابتدا <Alg moves={r.match.correction} className="font-bold" /> را بزن؛ سپس حرکت مورد انتظار را اجرا کن. وضعیت واقعی خودکار بازنویسی نمی‌شود.</p>
      </div>
    );
  }
  return null;
}

function PracticePanel({ l, mobile }) {
  const r = l.runner;
  const userFrame = (mv) => translateAlg(mv, FRAME);
  if (l.mode !== 'practice') return null;
  const box = mobile ? 'cyber-panel p-4 rounded-xl' : 'bg-slate-800/50 border border-slate-700 rounded-2xl p-4';
  if (l.device.status !== 'ready' || r.phase === 'noCube') {
    return (
      <div className={box + ' space-y-3'}>
        <p className="text-xs">{r.message || 'برای تمرین واقعی، روبیک باید متصل و وضعیتش معتبر باشد.'}</p>
        <div className="flex gap-2 flex-wrap">
          <button className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-900 text-xs font-bold" onClick={() => l.app.link.connect()}>{l.simulated ? 'روشن‌کردن شبیه‌ساز' : 'اتصال به روبیک'}</button>
          <span className="text-[10px] text-slate-400 self-center">یا بدون روبیک متصل، خودارزیابی کن:</span>
          <button className="px-3 py-2 rounded-xl border border-green-500/30 text-green-300 text-xs" onClick={() => l.selfAssess(true)}>درست اجرا کردم</button>
          <button className="px-3 py-2 rounded-xl border border-red-500/30 text-red-300 text-xs" onClick={() => l.selfAssess(false)}>اشتباه داشتم</button>
        </div>
        <p className="text-[10px] text-slate-500">خودارزیابی جدا برچسب می‌خورد و به‌تنهایی کیس را «آموخته» نمی‌کند.</p>
      </div>
    );
  }
  if (r.phase === 'planning') return <div className={box}><p className="text-xs"><i className="fa-solid fa-circle-notch fa-spin ml-2 text-cyan-300"></i>محاسبهٔ مسیر آماده‌سازی از وضعیت فعلی روبیک…</p></div>;
  if (r.phase === 'error') return <div className={box}><p className="text-xs text-red-300">{r.message}</p></div>;
  if (r.phase === 'prepare') {
    const [cur, ...rest] = userFrame(r.remaining);
    return (
      <div className={box + ' border-dashed border-cyan-400/40 space-y-2'}>
        <div className="flex justify-between items-center"><span className="text-xs font-bold">کیس آغازین را بساز (زرد بالا، سبز روبه‌رو)</span><i className="fa-solid fa-circle-notch fa-spin text-cyan text-xs"></i></div>
        {r.deviated && <p className="text-[10px] text-red-300">حرکت با مسیر فرق داشت؛ مسیر از همین وضعیت اصلاح شد.</p>}
        <p className="text-sm" dir="ltr"><span className="bg-cyan-400 text-slate-900 rounded px-1.5 font-bold move-font">{cur}</span> <span className="move-font text-slate-300">{rest.join(' ')}</span></p>
        <p className="text-[10px] text-slate-500">این حرکت‌ها جزو تمرین شمرده نمی‌شوند. رسیدن به کیس با مدل روبیک تأیید می‌شود.</p>
      </div>
    );
  }
  if (r.phase === 'execute') {
    return (
      <div className={box + ' space-y-1'}>
        <p className="text-xs font-bold text-emerald-300"><i className="fa-solid fa-check-circle ml-1"></i>وضعیت آغازین تأیید شد؛ الگوریتم را اجرا کن.</p>
        {!l.hint && <p className="text-[10px] text-slate-400">راهنمای حرکت بعد {l.accuracyOnly ? 'در این تمرین دقت' : ''} خاموش است.</p>}
        <p className="text-[10px] text-slate-500">هر توالی معادل که به همان وضعیت هدف برسد درست پذیرفته می‌شود.</p>
      </div>
    );
  }
  if (r.phase === 'done') {
    const res = r.result;
    return (
      <div className={box + ' text-center space-y-2 ' + (res.correct ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5')}>
        <div className="text-cyan text-xl">{res.correct ? '✓' : '!'}</div>
        <div className="text-xs font-bold">{res.correct ? 'اجرا درست بود' : 'به هدف رسیدی، با ' + fa(res.mistakes) + ' خطا'}{res.viaState ? ' · با توالی معادل' : ''}</div>
        <div className="text-[10px] text-secondary">زمان اجرا (دریافت مرورگر): {faDigits((res.ms / 1000).toFixed(1))} ثانیه</div>
        {l.goalMs && <div className={'text-[10px] ' + (res.ms <= l.goalMs ? 'text-green-300' : 'text-slate-400')}>هدف دلخواه {faDigits(l.goalMs / 1000)} ثانیه: {res.ms <= l.goalMs ? 'رسیدی' : 'هنوز نه'} (زمان دریافت مرورگر)</div>}
        {l.kase?.optimalLength != null && <div className="text-[10px] text-secondary">کاهش حرکت: تو {fa(l.runner.received.length)} حرکت · کمترین ممکن {fa(l.kase.optimalLength)} حرکت (<span dir="ltr" className="move-font">{l.kase.solveUser.join(' ')}</span>)</div>}
        <div className="flex gap-2 pt-2">
          <button className="flex-1 py-2 bg-white/10 rounded text-[11px]" onClick={() => l.runner.start(l.kase)}>تکرار همین کیس</button>
          <button className="flex-1 py-2 bg-cyan-400/20 text-cyan rounded text-[11px]" onClick={l.advance}>{l.rep + 1 >= l.reps ? 'پایان دوره' : 'کیس بعد'}</button>
        </div>
      </div>
    );
  }
  return null;
}

function Desktop({ route }) {
  const l = useLesson(route);
  const cube = useRef(null);
  const e = l.kase?.entry;
  const app = l.app;
  const live = l.mode === 'practice' && app.live.facelets;
  if (!l.queue.entries.length) return <main className="p-8 text-slate-400">موردی برای این تمرین پیدا نشد. <a href="#/library" className="text-cyan-300">کتابخانه</a></main>;
  const finished = l.rep >= l.reps;
  const avg = l.times.length ? l.times.reduce((a, b) => a + b, 0) / l.times.length : null;
  return (
    <div className="min-h-screen flex flex-col">
      <nav id="header" className="h-16 border-b border-slate-800 glass px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <a href={route.name === 'lesson' ? '#/library' : '#/challenges'} className="text-slate-400 hover:text-white" aria-label="بازگشت"><i className="fa-solid fa-arrow-right"></i></a>
          <div className="h-6 w-px bg-slate-700"></div>
          <h1 className="font-bold">{l.queue.title}{e && route.name !== 'lesson' ? ' · ' + e.name : ''}</h1>
          {e && <span className="text-xs text-slate-500">{categoryName(e.category)}</span>}
        </div>
        <div className="flex items-center gap-6">
          <div className={'flex items-center gap-2 px-3 py-1 rounded-full border ' + (l.device.status === 'ready' ? 'bg-green-500/10 border-green-500/20' : 'bg-slate-500/10 border-slate-500/20')}>
            <div className={'w-2 h-2 rounded-full ' + (l.device.status === 'ready' ? 'bg-green-400 animate-pulse' : 'bg-slate-400')}></div>
            <span className={'text-[10px] font-bold ' + (l.device.status === 'ready' ? 'text-green-400' : 'text-slate-300')}>{l.simulated ? 'شبیه‌ساز' : l.device.status === 'ready' ? 'روبیک متصل · وضعیت معتبر' : 'روبیک متصل نیست'}</span>
          </div>
          <button className="text-slate-400 hover:text-white text-sm" onClick={() => navigate(route.name === 'lesson' ? 'learn' : 'challenges')}>خروج از درس</button>
        </div>
      </nav>
      <main className="flex-1 flex overflow-hidden" style={{ minHeight: 820 }}>
        <aside className="w-80 border-l border-slate-800 p-6 overflow-y-auto space-y-6 shrink-0">
          <div className="space-y-4"><Steps l={l} /></div>
          <div className="pt-6 border-t border-slate-800">
            <h4 className="text-xs font-bold text-slate-500 mb-4 uppercase">نکات کلیدی</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-xs text-slate-400"><i className="fa-solid fa-circle-check text-green-500 mt-0.5"></i><span>جهت نگه‌داشتن: زرد بالا، سبز روبه‌رو. چرخاندن نمای سه‌بعدی فقط دوربین است.</span></li>
              {e?.alternatives?.length > 0 && <li className="flex items-start gap-2 text-xs text-slate-400"><i className="fa-solid fa-circle-check text-green-500 mt-0.5"></i><span>معادل‌های معتبر: {e.alternatives.map((a, i) => <Alg key={i} moves={a} className="block text-cyan-200 mt-1" />)}</span></li>}
              <li className="flex items-start gap-2 text-xs text-slate-400"><i className="fa-solid fa-circle-check text-green-500 mt-0.5"></i><span>درستی کیس و الگوریتم با موتور مکعب بررسی شده است.</span></li>
            </ul>
          </div>
        </aside>
        <div className="flex-1 relative flex flex-col min-w-0">
          <div className="flex-1 m-6 relative flex items-center justify-center border border-slate-800/50 shadow-inner rounded-[2rem]" style={{ minHeight: 550, background: 'radial-gradient(circle, #1e293b 0%, #0f172a 100%)' }}>
            <div className="relative w-72 h-72 bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl">
              <CubeView ref={cube} facelets={live ? app.live.facelets : l.pb.facelets} lastMove={live ? app.live.lastMove : l.pb.lastMove} moveKey={live ? app.live.moveKey : l.pb.moveKey} frame="yellowUp" height="100%" speed={l.pb.speed} />
              {l.mode === 'watch' ? (
                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex gap-4 items-center whitespace-nowrap bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-full border border-slate-700">
                  <button className="text-slate-400 hover:text-white" aria-label="حرکت قبل" title="حرکت قبل" onClick={l.pb.prev}><i className="fa-solid fa-backward-step"></i></button>
                  <button className="w-10 h-10 bg-accent-cyan rounded-full text-slate-900 flex items-center justify-center hover:scale-105 transition-transform" aria-label={l.pb.playing ? 'مکث' : 'پخش'} onClick={l.pb.toggle}><i className={'fa-solid ' + (l.pb.playing ? 'fa-pause' : 'fa-play ml-0.5')}></i></button>
                  <button className="text-slate-400 hover:text-white" aria-label="حرکت بعد" title="حرکت بعد" onClick={l.pb.next}><i className="fa-solid fa-forward-step"></i></button>
                  <div className="w-px h-6 bg-slate-700 mx-2"></div>
                  <select className="bg-transparent text-xs text-slate-400 focus:outline-none cursor-pointer" aria-label="سرعت پخش" value={l.pb.speed} onChange={(ev) => l.pb.setSpeed(Number(ev.target.value))}>
                    <option value={1}>سرعت ۱×</option><option value={0.5}>سرعت ۰٫۵×</option><option value={0.25}>سرعت ۰٫۲۵×</option><option value={2}>سرعت ۲×</option>
                  </select>
                  <button className="text-slate-400 hover:text-white text-xs" aria-label="بازنشانی دوربین" onClick={() => cube.current?.resetCamera()}><i className="fa-solid fa-camera"></i></button>
                </div>
              ) : (
                <button className="absolute bottom-2 left-2 w-9 h-9 rounded-lg bg-black/50 text-slate-300" aria-label="بازنشانی دوربین" onClick={() => cube.current?.resetCamera()}><i className="fa-solid fa-camera"></i></button>
              )}
            </div>
            <Feedback l={l} />
          </div>
          <div className="px-8 pb-8 flex items-end gap-12">
            <div className="flex-1 min-h-[8rem] bg-slate-800/50 border border-slate-700 rounded-2xl p-4 flex items-center gap-6">
              <div className="flex flex-col gap-1 shrink-0">
                <span className="text-[10px] text-slate-500 uppercase">{l.mode === 'watch' ? 'فرمول کیس' : 'فرمول جاری'}</span>
                <code className="move-pill text-xl font-bold accent-cyan" dir="ltr">{l.kase?.solveUser.join(' ')}</code>
              </div>
              <MovePills l={l} />
              <div className="h-10 w-px bg-slate-700"></div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[10px] text-slate-500">دقت اجرا</p>
                  <p className="text-sm font-bold">{l.log.length ? fa(l.ok) + ' از ' + fa(l.log.length) + ' درست' : '—'}</p>
                </div>
                <div className="w-12 h-12 rounded-full border-2 border-slate-700 flex items-center justify-center"><i className="fa-solid fa-bolt text-yellow-400"></i></div>
              </div>
            </div>
          </div>
        </div>
        <aside className="w-72 border-r border-slate-800 p-6 flex flex-col gap-6 shrink-0 overflow-y-auto">
          <section className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700">
            <h4 className="text-xs font-bold mb-4 flex items-center justify-between"><span>وضعیت تمرین</span><span className="text-accent-cyan">تکرار {fa(Math.min(l.rep + 1, l.reps))}/{fa(l.reps)}</span></h4>
            <div className="flex justify-between items-center mb-6">
              <div className="text-center"><p className="text-[10px] text-slate-500">میانگین</p><p className="font-bold">{avg ? faDigits((avg / 1000).toFixed(1)) + ' ثانیه' : '—'}</p></div>
              <div className="w-px h-6 bg-slate-700"></div>
              <div className="text-center"><p className="text-[10px] text-slate-500">بهترین</p><p className="font-bold">{l.times.length ? faDigits((Math.min(...l.times) / 1000).toFixed(1)) + ' ثانیه' : '—'}</p></div>
            </div>
            <label className="block text-xs text-slate-400 mb-1">سختی</label>
            <select className="w-full bg-slate-700 rounded-xl p-2 text-xs" value={l.settings.drillDifficulty} onChange={(ev) => l.actions.saveSettings({ drillDifficulty: ev.target.value })} aria-label="سختی">
              <option value="easy">آسان · بدون چرخش لایهٔ بالا</option><option value="medium">متوسط · چرخش تصادفی بالا</option><option value="hard">سخت · قطعه‌های دیگر هم تصادفی</option>
            </select>
          </section>
          <section className="flex-1 flex flex-col justify-end gap-4">
            <PracticePanel l={l} />
            {l.log.length > 0 && (
              <div className="bg-accent-purple/10 border border-accent-purple/20 p-4 rounded-xl">
                <h5 className="text-[10px] font-bold accent-purple mb-2">بازخورد تمرین</h5>
                <p className="text-[10px] text-slate-400 leading-relaxed">{feedbackText(l.log)}</p>
              </div>
            )}
            {finished && <p className="text-xs text-green-300">دورهٔ {fa(l.reps)} تکراری تمام شد. برنامهٔ مرور بعدی ذخیره شد.</p>}
            {l.mode === 'watch'
              ? <button className="w-full bg-accent-cyan text-slate-900 py-3 rounded-xl font-bold shadow-lg shadow-cyan-500/20" onClick={() => l.setMode('practice')}>تمرین با روبیک واقعی</button>
              : <button className="w-full border border-slate-700 py-3 rounded-xl text-sm" onClick={() => { l.runner.stop(); l.setMode('watch'); }}>بازگشت به مشاهدهٔ درس</button>}
          </section>
          <label className="flex items-center justify-between text-sm p-4 bg-slate-800 rounded-xl"><span>راهنمای حرکت بعد</span><input type="checkbox" checked={l.settings.nextMoveHint} onChange={(ev) => l.actions.saveSettings({ nextMoveHint: ev.target.checked })} aria-label="راهنمای حرکت بعد؛ انتخاب ذخیره می‌شود" /></label>
{e && <AiAskBox type="lesson-question" title="پرسش دربارهٔ همین درس" payload={{ lessonId: e.id, name: e.nameEn, category: e.category, alg: e.alg, recentRuns: l.log.length, recentErrors: l.log.filter((x) => !x.correct).length }} />}
          <div className="text-xs text-slate-400">{l.mode === 'watch' ? 'حالت آموزش' : 'حالت تمرین واقعی'}</div>
          {l.mode === 'practice' && <button className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-sm font-medium" onClick={() => l.runner.replan()}>آماده‌سازی دوبارهٔ کیس</button>}
          <button className="px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-400" onClick={() => l.next(l.rep)}>کیس تازه (چرخش دیگر)</button>
        </aside>
      </main>
    </div>
  );
}

function feedbackText(log) {
  const recent = log.slice(-5);
  const bad = recent.filter((x) => !x.correct).length;
  if (!bad) return 'اجراهای اخیر بدون خطا بودند؛ کمی سریع‌تر و روان‌تر امتحان کن.';
  return `در ${fa(bad)} اجرا از ${fa(recent.length)} اجرای اخیر حرکتی با مسیر کیس هماهنگ نبود. اجرای آرام همراه راهنمای حرکت بعد را امتحان کن.`;
}

function Mobile({ route }) {
  const l = useLesson(route);
  const cube = useRef(null);
  const app = l.app;
  const e = l.kase?.entry;
  const live = l.mode === 'practice' && app.live.facelets;
  if (!l.queue.entries.length) return <div className="mob"><MobileHeader title="تمرین" back="#/learn" /><main className="mt-20 px-4 text-secondary">موردی برای این تمرین پیدا نشد.</main><MobileNav route="learn" /></div>;
  return (
    <div className="mob">
      <MobileHeader title={l.queue.title} back={route.name === 'lesson' ? '#/learn' : '#/challenges'} end={<a href="#/connection" aria-label="اتصال" className="inline-flex w-11 h-11 items-center justify-center"><i className={'fa-brands fa-bluetooth-b text-sm ' + (l.device.status === 'ready' ? 'text-cyan' : 'text-secondary')}></i></a>} />
      <main className="mt-16 px-4 space-y-6">
        <div id="tabs" className="flex border-b border-white/5" role="tablist">
          <button role="tab" aria-selected={l.mode === 'watch'} className={'flex-1 py-3 text-xs font-bold ' + (l.mode === 'watch' ? 'nav-active border-b-2 border-cyan-400' : 'text-secondary')} onClick={() => { l.runner.stop(); l.setMode('watch'); }}>مشاهده درس</button>
          <button role="tab" aria-selected={l.mode === 'practice'} className={'flex-1 py-3 text-xs font-bold ' + (l.mode === 'practice' ? 'nav-active border-b-2 border-cyan-400' : 'text-secondary')} onClick={() => l.setMode('practice')}>تمرین واقعی</button>
        </div>
        <section id="visualization" className="cyber-panel rounded-2xl p-4 relative">
          <CubeView ref={cube} facelets={live ? app.live.facelets : l.pb.facelets} lastMove={live ? app.live.lastMove : l.pb.lastMove} moveKey={live ? app.live.moveKey : l.pb.moveKey} frame="yellowUp" height={260} speed={l.pb.speed} />
          {l.mode === 'watch' && (
            <div className="flex justify-center items-center gap-6 mt-2">
              <button className="text-secondary hover:text-white" aria-label="حرکت قبل" onClick={l.pb.prev}><i className="fa-solid fa-backward-step"></i></button>
              <button className="w-12 h-12 bg-cyan rounded-full flex items-center justify-center text-black text-xl shadow-[0_0_15px_rgba(34,211,238,0.4)]" aria-label={l.pb.playing ? 'مکث' : 'پخش'} onClick={l.pb.toggle}><i className={'fa-solid ' + (l.pb.playing ? 'fa-pause' : 'fa-play ml-1')}></i></button>
              <button className="text-secondary hover:text-white" aria-label="حرکت بعد" onClick={l.pb.next}><i className="fa-solid fa-forward-step"></i></button>
            </div>
          )}
          <div className="flex justify-between items-center mt-3">
            <button className="text-[10px] text-secondary min-h-0 min-w-0" onClick={() => l.pb.setSpeed(l.pb.speed === 1 ? 0.5 : l.pb.speed === 0.5 ? 2 : 1)}>سرعت: <span className="text-cyan" dir="ltr">{l.pb.speed}x</span></button>
            <button className="flex gap-2 items-center min-h-0" onClick={() => cube.current?.resetCamera()}><i className="fa-solid fa-camera text-secondary text-[10px]"></i><span className="text-[9px] text-secondary italic">بازنشانی نما؛ فقط دوربین</span></button>
          </div>
        </section>
        <Feedback l={l} mobile />
        <PracticePanel l={l} mobile />
        <section id="lesson-details" className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 bg-cyan-400/20 text-cyan rounded-full flex items-center justify-center text-[10px] font-bold">{fa(Math.min(l.rep + 1, l.reps))}/{fa(l.reps)}</span>
            <h2 className="text-sm font-bold">{e?.name} · {categoryName(e?.category)}</h2>
          </div>
          <p className="text-[11px] text-secondary leading-relaxed">{e?.recognition}</p>
          <p className="text-[11px] text-secondary leading-relaxed">{e?.description}</p>
          <div className="cyber-panel rounded-xl p-4">
            <p className="text-secondary text-xs mb-2">توالی همین کیس</p>
            <code dir="ltr" className="block text-cyan text-2xl text-center move-font">{l.kase?.solveUser.join(' ')}</code>
            <div className="mt-3"><MovePills l={l} /></div>
            <label className="flex min-h-[44px] items-center justify-between mt-3">راهنمای حرکت بعد<input type="checkbox" checked={l.settings.nextMoveHint} onChange={(ev) => l.actions.saveSettings({ nextMoveHint: ev.target.checked })} aria-label="راهنمای حرکت بعد" /></label>
          </div>
          {e?.alternatives?.length > 0 && (
            <section className="cyber-panel rounded-2xl p-4 space-y-2">
              <h3 className="font-bold text-sm text-cyan-300">اجرای معادل معتبر</h3>
              {e.alternatives.map((a, i) => <code key={i} dir="ltr" className="block text-xs move-font text-slate-300">{a}</code>)}
              <p className="text-[10px] text-secondary">اگر به وضعیت هدف معتبر برسید، توالی معادل به‌اشتباه خطا محسوب نمی‌شود.</p>
            </section>
          )}
          <div className="space-y-2"><Steps l={l} compact /></div>
          {e && <AiAskBox type="lesson-question" title="پرسش دربارهٔ همین درس" payload={{ lessonId: e.id, name: e.nameEn, category: e.category, alg: e.alg, recentRuns: l.log.length, recentErrors: l.log.filter((x) => !x.correct).length }} />}
        </section>
        <section className="cyber-panel p-4 rounded-xl space-y-3">
          <label className="block text-xs">تعداد تکرار<input type="number" min={1} max={50} value={l.settings.drillRepetitions} onChange={(ev) => l.actions.saveSettings({ drillRepetitions: Math.max(1, Math.min(50, Number(ev.target.value) || 10)) })} className="block w-full rounded-lg p-3 bg-white/5 border border-white/15 mt-1" /></label>
          <label className="block text-xs">سختی<select className="w-full rounded-lg p-3 bg-white/5 mt-1" value={l.settings.drillDifficulty} onChange={(ev) => l.actions.saveSettings({ drillDifficulty: ev.target.value })}><option value="easy">آسان</option><option value="medium">متوسط</option><option value="hard">سخت</option></select></label>
          {l.log.length > 0 && <p className="text-[11px] text-secondary">دقت این دوره: {fa(l.ok)} از {fa(l.log.length)} · {feedbackText(l.log)}</p>}
        </section>
      </main>
      <MobileNav route="learn" />
    </div>
  );
}

export default function Lesson({ mobile, route }) {
  return mobile ? <Mobile route={route} /> : <Desktop route={route} />;
}
