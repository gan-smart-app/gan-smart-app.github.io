import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { applyMove, fromFacelets, isSolved, stateFromAlg, toFacelets, translateAlg } from '../core/cube.mjs';
import { planBeginner, STAGES } from '../core/beginner.mjs';
import CubeView from '../components/CubeView.jsx';
import { fa } from '../app/format.js';
import { MobileHeader, MobileNav } from '../layout/Shell.jsx';
import { navigate } from '../app/router.js';

// Guide = ordered segments with Persian explanation; "short" has one
// segment from the two-phase solver and is labelled as computational.
function teachSegments(state) {
  return planBeginner(state).map((s) => ({
    title: s.title, stage: s.stage, explanation: s.explanation, model: s.movesModel, transient: s.transient,
  }));
}

function useSolverModel(route) {
  const app = useApp();
  const { live, device, solver, onCubeEvent, settings, link, simulated } = app;
  const [mode, setMode] = useState(route.query.mode === 'short' ? 'short' : 'teach');
  const frame = mode === 'teach' ? 'yellowUp' : settings.holdFrame;
  const connected = device.status === 'ready' && !!live.facelets;
  const [virtualStart, setVirtualStart] = useState(null); // facelets for demo when no cube
  const [plan, setPlan] = useState(null); // {start, segments}
  const [pos, setPos] = useState(0); // index into flat model moves
  const [half, setHalf] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [anim, setAnim] = useState({ move: null, key: 0 });
  const token = useRef(0);

  const flat = useMemo(() => (plan ? plan.segments.flatMap((s, si) => s.model.map((m, mi) => ({ m, si, mi }))) : []), [plan]);

  const build = useCallback(async (startFacelets, why = '') => {
    const my = ++token.current;
    const st = fromFacelets(startFacelets);
    if (!st) return setPlan(null);
    setPos(0); setHalf(null); setPlaying(false);
    if (isSolved(st)) { setBusy(false); setPlan({ start: startFacelets, segments: [] }); setNote('روبیک حل‌شده است.'); return; }
    if (mode === 'teach') {
      setBusy(false);
      setPlan({ start: startFacelets, segments: teachSegments(st) });
      setNote(why);
      return;
    }
    setBusy(true);
    try {
      const moves = await solver.solve(st);
      if (my !== token.current) return;
      setPlan({ start: startFacelets, segments: [{ title: 'راه‌حل کوتاه محاسباتی', explanation: 'مسیر کوتاه حل‌گر دومرحله‌ای (Kociemba)؛ برای رسیدن سریع به حالت حل‌شده است و آموزش روش مبتدی نیست.', model: moves }] });
      setNote(why);
    } catch (e) {
      setNote('محاسبهٔ راه‌حل انجام نشد: ' + e.message);
    } finally {
      if (my === token.current) setBusy(false);
    }
  }, [mode, solver]);

  // Start from the real cube when connected; otherwise a labelled demo state.
  useEffect(() => {
    if (connected) build(live.facelets);
    else if (virtualStart) build(virtualStart);
    else setPlan(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, mode, virtualStart]);

  const demo = async () => setVirtualStart(toFacelets(stateFromAlg(await solver.scramble())));

  // Live tracking: follow the plan; any deviation re-plans from the real state.
  // Refs are updated synchronously because several MOVE events can arrive in one tick.
  const track = useRef({ plan: null, flat: [], pos: 0, half: null });
  useEffect(() => { track.current = { plan, flat, pos: 0, half: null }; }, [plan, flat]);
  useEffect(() => onCubeEvent((e) => {
    if (e.type === 'facelets') return build(e.facelets, 'وضعیت تازه دریافت شد؛ راهنما از همین وضعیت دوباره ساخته شد.');
    const t = track.current;
    if (e.type !== 'move' || !t.plan) return;
    const exp = t.flat[t.pos]?.m;
    if (exp && e.move === exp) { t.pos++; t.half = null; }
    else if (exp && exp.endsWith('2') && e.move[0] === exp[0] && !e.move.endsWith('2') && (!t.half || t.half === e.move)) {
      if (t.half) { t.pos++; t.half = null; } else t.half = e.move;
    } else {
      // Different path: accepted if valid; plan again from where the cube is now.
      t.plan = null;
      build(e.facelets, mode === 'teach' ? 'مسیر دیگری رفتی؛ مراحل از وضعیت واقعی دوباره برنامه‌ریزی شد (مسیر معتبر متفاوت پذیرفته می‌شود).' : 'حرکت متفاوت بود؛ راه‌حل از وضعیت واقعی دوباره محاسبه شد.');
      return;
    }
    setPos(t.pos); setHalf(t.half); setNote('');
  }), [onCubeEvent, build, mode]);

  // Demo playback (only without a connected cube).
  useEffect(() => {
    if (!playing || connected) return undefined;
    if (pos >= flat.length) { setPlaying(false); return undefined; }
    const t = setTimeout(() => { setAnim((a) => ({ move: flat[pos].m, key: a.key + 1 })); setPos(pos + 1); }, 600 / speed);
    return () => clearTimeout(t);
  }, [playing, pos, flat, speed, connected]);

  const shownFacelets = useMemo(() => {
    if (connected) return live.facelets;
    if (!plan) return virtualStart;
    let s = fromFacelets(plan.start);
    for (let i = 0; i < pos; i++) s = applyMove(s, flat[i].m);
    return toFacelets(s);
  }, [connected, live.facelets, plan, pos, flat, virtualStart]);

  const cur = flat[pos];
  const seg = plan && cur ? plan.segments[cur.si] : null;
  const done = plan && pos >= flat.length;
  const step = (d) => { track.current.pos = Math.max(0, Math.min(flat.length, pos + d)); setPlaying(false); setAnim((a) => ({ move: d > 0 ? flat[pos]?.m : null, key: a.key + 1 })); setPos(Math.max(0, Math.min(flat.length, pos + d))); };
  const userMoves = (model) => translateAlg(model, frame);
  return {
    app, mode, setMode, frame, connected, plan, flat, pos, cur, seg, done, busy, note, half, build, demo, virtualStart,
    shownFacelets, anim, speed, setSpeed, playing, setPlaying, step, userMoves, device, link, simulated, live,
    refresh: () => (connected ? link.requestState().catch(() => {}) : null),
  };
}

function stageProgress(s) {
  if (!s.plan || !s.plan.segments.length) return { pct: s.done ? 1 : 0, label: s.done ? 'حل شد' : '—' };
  const pct = s.flat.length ? s.pos / s.flat.length : 1;
  return { pct, label: s.seg ? s.seg.title : 'حل شد' };
}

function SegmentList({ s, compact }) {
  if (!s.plan) return null;
  return s.plan.segments.map((g, i) => {
    const active = s.cur?.si === i;
    const passed = s.cur ? i < s.cur.si : true;
    return (
      <div key={i} className={compact ? 'cyber-panel p-3 rounded-xl ' + (active ? 'border-cyan bg-cyan-400/5' : passed ? 'opacity-50' : '') : (active ? 'p-6 space-y-2 border-r-4 border-cyan-400 bg-cyan-400/5' : 'p-6 space-y-2 border-b border-slate-800 ' + (passed ? 'opacity-40' : 'opacity-70'))}>
        <div className="flex justify-between items-center">
          <span className={'text-[10px] font-bold ' + (active ? 'text-accent-cyan' : 'text-slate-500')}>گام {fa(i + 1)} از {fa(s.plan.segments.length)}{g.stage ? ' · ' + STAGES[g.stage - 1]?.title : ''}</span>
          {active ? <i className="fa-solid fa-play text-[10px] accent-cyan"></i> : passed ? <i className="fa-solid fa-check text-[10px] text-green-400"></i> : null}
        </div>
        <h4 className={'font-bold text-sm ' + (active ? '' : 'text-slate-400')}>{g.title}</h4>
        {(active || !compact) && <p className="text-xs text-slate-400 leading-relaxed">{g.explanation}</p>}
        <p className="move-font text-xs text-cyan-200" dir="ltr">{s.userMoves(g.model).join(' ')}</p>
        {g.transient && active && <p className="text-[10px] text-amber-300">در این گام لایه‌های پایین موقتاً به‌هم می‌ریزند و در پایان گام درست می‌شوند.</p>}
      </div>
    );
  });
}

function Sequence({ s, big }) {
  if (!s.plan) return null;
  const from = Math.max(0, s.pos - 2);
  const items = s.flat.slice(from, from + (big ? 10 : 8));
  return (
    <div className="flex gap-2 items-center" dir="ltr">
      {items.map((x, i) => {
        const idx = from + i;
        const um = s.userMoves([x.m])[0];
        if (idx < s.pos) return <div key={idx} className="move-font w-12 h-14 bg-slate-800 rounded-xl flex items-center justify-center text-slate-500 border border-slate-700 opacity-40">{um}</div>;
        if (idx === s.pos) return <div key={idx} className="move-font w-14 h-16 bg-accent-cyan rounded-xl flex items-center justify-center text-slate-900 text-xl font-bold border-2 border-accent-cyan shadow-lg shadow-cyan-500/20">{um}</div>;
        return <div key={idx} className="move-font w-12 h-14 bg-slate-800 rounded-xl flex items-center justify-center text-white border border-slate-700">{um}</div>;
      })}
      {s.flat.length - from > items.length && <div className="move-font w-12 h-14 bg-slate-800 rounded-xl flex items-center justify-center text-white border border-slate-700">...</div>}
    </div>
  );
}

function NoCube({ s, mobile }) {
  if (s.connected) return null;
  const invalid = s.device.status === 'ready' || s.device.status === 'recovering';
  return (
    <div className={(mobile ? 'cyber-panel p-5 rounded-2xl text-center space-y-3 ' : 'mx-8 my-6 p-5 rounded-2xl border flex items-center justify-between gap-4 ') + (invalid ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700 bg-slate-800/30')} role="status">
      <div className="flex items-center gap-4 text-right">
        {!mobile && <div className={'w-10 h-10 rounded-full flex items-center justify-center ' + (invalid ? 'bg-red-500/20 text-red-500' : 'bg-slate-700 text-slate-300')}><i className={'fa-solid ' + (invalid ? 'fa-triangle-exclamation' : 'fa-cube')}></i></div>}
        <div>
          <h4 className={'text-sm font-bold ' + (invalid ? 'text-red-400' : '')}>{invalid ? 'وضعیت نامعتبر یا در حال بازیابی' : s.virtualStart ? 'نمایش مجازی · روبیک متصل نیست' : 'روبیک متصل نیست'}</h4>
          <p className="text-[10px] text-slate-400 leading-relaxed">{invalid ? 'تا دریافت وضعیت معتبر، راهنما ادامه نمی‌یابد؛ وضعیت فیزیکی خودکار تغییر نمی‌کند.' : 'راهنمای واقعی از وضعیت معتبر روبیک ساخته می‌شود. بدون اتصال می‌توانی روی یک اسکرَمبل نمونه، مراحل را به‌صورت نمایشی ببینی.'}</p>
        </div>
      </div>
      <div className={'flex gap-2 ' + (mobile ? 'justify-center' : '')}>
        {invalid
          ? <button className="bg-red-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold" onClick={() => s.link.requestState?.().catch(() => {})}>دریافت وضعیت معتبر</button>
          : <button className="bg-cyan-400 text-slate-900 px-4 py-1.5 rounded-lg text-xs font-bold" onClick={() => s.link.connect()}>{s.simulated ? 'روشن‌کردن شبیه‌ساز' : 'اتصال به روبیک'}</button>}
        {!invalid && <button className="border border-slate-600 px-4 py-1.5 rounded-lg text-xs" onClick={s.demo}>{s.virtualStart ? 'اسکرَمبل نمونهٔ دیگر' : 'نمایش روی اسکرَمبل نمونه'}</button>}
      </div>
    </div>
  );
}

function Desktop({ route }) {
  const s = useSolverModel(route);
  const cube = useRef(null);
  const prog = stageProgress(s);
  const curUser = s.cur ? s.userMoves([s.cur.m])[0] : null;
  return (
    <div className="min-h-screen flex flex-col">
      <nav id="header" className="h-16 border-b border-slate-800 glass px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <a href="#/practice" className="flex items-center gap-2" aria-label="بازگشت به تمرین">
            <div className="w-8 h-8 bg-accent-cyan rounded flex items-center justify-center text-slate-900 font-bold text-[11px]">GAN</div>
            <span className="text-lg font-bold tracking-tight">راهنمای حل</span>
          </a>
          <div className="h-6 w-px bg-slate-700"></div>
          <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700" role="tablist">
            <button role="tab" aria-selected={s.mode === 'teach'} className={'px-4 py-1.5 rounded-md text-xs font-bold ' + (s.mode === 'teach' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white')} onClick={() => s.setMode('teach')}>حل آموزشی (مبتدی)</button>
            <button role="tab" aria-selected={s.mode === 'short'} className={'px-4 py-1.5 rounded-md text-xs font-bold ' + (s.mode === 'short' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white')} onClick={() => s.setMode('short')}>راه‌حل کوتاه محاسباتی</button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-slate-500">وضعیت فیزیکی: {s.connected ? <span className="text-green-400">هماهنگ</span> : <span className="text-slate-300">{s.virtualStart ? 'نمایش مجازی' : 'بدون اتصال'}</span>}</span>
          <button className="text-slate-400 hover:text-white disabled:opacity-30" aria-label="دریافت دوبارهٔ وضعیت" title="دریافت دوبارهٔ وضعیت" disabled={!s.connected} onClick={s.refresh}><i className="fa-solid fa-arrows-rotate"></i></button>
          <button className="text-slate-400 hover:text-white text-sm" onClick={() => navigate('practice')}>بستن</button>
        </div>
      </nav>
      <NoCube s={s} />
      <main className="flex-1 flex overflow-hidden" style={{ minHeight: 760 }}>
        <aside className="w-80 border-l border-slate-800 flex flex-col bg-slate-900/50 shrink-0">
          <div className="p-6 border-b border-slate-800">
            <h3 className="font-bold text-sm mb-1">پیشرفت راه‌حل</h3>
            <p className="text-[10px] text-slate-500">مرحله جاری: {prog.label}</p>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden"><div className="bg-accent-cyan h-full" style={{ width: prog.pct * 100 + '%' }}></div></div>
            <p className="text-[10px] text-slate-500 mt-3">{s.mode === 'teach' ? 'روش لایه‌به‌لایه با توضیح؛ نگه‌داشتن: زرد بالا، سبز روبه‌رو.' : 'فقط مسیر کوتاه؛ این آموزش روش مبتدی نیست.'}</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {s.busy && <p className="p-6 text-xs text-slate-400"><i className="fa-solid fa-spinner animate-spin ml-2"></i>محاسبهٔ راه‌حل…</p>}
            <SegmentList s={s} />
            {s.done && s.plan && <p className="p-6 text-sm text-green-400"><i className="fa-solid fa-check ml-2"></i>روبیک حل شد.</p>}
          </div>
          <div className="p-6 bg-slate-800/30">
            <button className="w-full bg-slate-700 hover:bg-slate-600 text-xs py-3 rounded-xl font-bold transition-all disabled:opacity-40" disabled={!s.connected && !s.virtualStart}
              onClick={() => s.build(s.connected ? s.live.facelets : s.shownFacelets, 'از همین نقطه دوباره برنامه‌ریزی شد.')}>درخواست حل مجدد از این نقطه</button>
          </div>
        </aside>
        <div className="flex-1 flex flex-col bg-[#0b1120] min-w-0">
          <div className="flex-1 flex items-center justify-center relative">
            {s.note && <p className="absolute top-6 right-6 left-6 text-center text-xs text-amber-200" role="status">{s.note}</p>}
            <div className="relative w-80 h-80 bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl">
              <CubeView ref={cube} facelets={s.shownFacelets || undefined} frame={s.frame} height="100%" dim={!s.shownFacelets}
                lastMove={s.connected ? s.live.lastMove : s.anim.move} moveKey={s.connected ? s.live.moveKey : s.anim.key} speed={s.speed} />
              {curUser && <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-accent-cyan text-slate-900 px-6 py-2 rounded-full font-bold text-2xl shadow-lg shadow-cyan-500/40 move-font" aria-live="polite">{curUser}{s.half ? ' ½' : ''}</div>}
            </div>
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-xl border border-slate-700 p-2 rounded-3xl flex items-center gap-2 shadow-2xl">
              {!s.connected && <>
                <button className="w-12 h-12 rounded-2xl hover:bg-slate-800 text-slate-400 hover:text-white" aria-label="حرکت قبل" onClick={() => s.step(-1)}><i className="fa-solid fa-backward-step"></i></button>
                <button className="w-14 h-14 rounded-2xl bg-accent-cyan text-slate-900 flex items-center justify-center hover:scale-105" aria-label={s.playing ? 'مکث' : 'پخش'} onClick={() => s.setPlaying(!s.playing)} disabled={!s.plan}><i className={'fa-solid ' + (s.playing ? 'fa-pause' : 'fa-play ml-1') + ' text-xl'}></i></button>
                <button className="w-12 h-12 rounded-2xl hover:bg-slate-800 text-slate-400 hover:text-white" aria-label="حرکت بعد" onClick={() => s.step(1)}><i className="fa-solid fa-forward-step"></i></button>
                <div className="w-px h-8 bg-slate-800 mx-2"></div>
              </>}
              {s.connected && <span className="text-xs text-slate-300 px-4">حرکت نمایش‌داده‌شده را روی روبیک اجرا کن؛ اجرای واقعی بررسی می‌شود.</span>}
              <div className="flex items-center gap-1 px-4">
                <span className="text-[10px] text-slate-500 ml-2">سرعت:</span>
                <button className="text-xs font-bold accent-cyan" dir="ltr" onClick={() => s.setSpeed(s.speed === 1 ? 0.5 : s.speed === 0.5 ? 2 : 1)}>{s.speed}x</button>
                <button className="text-slate-400 hover:text-white mr-3" aria-label="بازنشانی نمای دوربین" onClick={() => cube.current?.resetCamera()}><i className="fa-solid fa-camera"></i></button>
              </div>
            </div>
          </div>
          <div className="h-32 px-8 pb-8 flex items-center gap-4 overflow-x-auto">
            <div className="flex-none text-right px-4">
              <span className="text-[10px] text-slate-500 block mb-1">توالی حرکت‌ها</span>
              <span className="text-xs text-slate-300 font-bold">باقی‌مانده: {fa(Math.max(0, s.flat.length - s.pos))} حرکت</span>
            </div>
            <Sequence s={s} big />
          </div>
        </div>
      </main>
    </div>
  );
}

function Mobile({ route }) {
  const s = useSolverModel(route);
  const cube = useRef(null);
  const curUser = s.cur ? s.userMoves([s.cur.m])[0] : null;
  return (
    <div className="mob">
      <MobileHeader title="راهنمای حل" back="#/practice" end={<i className="fa-solid fa-cube text-cyan"></i>} />
      <main className="mt-16 px-4 space-y-6">
        <div className="flex gap-2" role="tablist">
          <button role="tab" aria-selected={s.mode === 'teach'} className={'flex-1 py-3 cyber-panel rounded-xl text-[10px] font-bold ' + (s.mode === 'teach' ? 'border-cyan bg-cyan-400/5' : 'text-secondary')} onClick={() => s.setMode('teach')}>حل آموزشی (روش من)</button>
          <button role="tab" aria-selected={s.mode === 'short'} className={'flex-1 py-3 cyber-panel rounded-xl text-[10px] font-bold ' + (s.mode === 'short' ? 'border-cyan bg-cyan-400/5' : 'text-secondary')} onClick={() => s.setMode('short')}>راه‌حل کوتاه محاسباتی</button>
        </div>
        <NoCube s={s} mobile />
        <section id="solver-visualization" className="cyber-panel rounded-2xl p-4 text-center">
          <CubeView ref={cube} facelets={s.shownFacelets || undefined} frame={s.frame} height={260} dim={!s.shownFacelets}
            lastMove={s.connected ? s.live.lastMove : s.anim.move} moveKey={s.connected ? s.live.moveKey : s.anim.key} speed={s.speed} />
          <div className="flex justify-between items-center px-4 mt-2">
            <span className="text-xs font-bold text-cyan">وضعیت: {s.connected ? 'معتبر' : s.virtualStart ? 'نمایشی' : 'بدون اتصال'}</span>
            <button className="text-[10px] text-secondary border border-white/10 px-2 py-1 rounded min-h-0" disabled={!s.connected && !s.virtualStart} onClick={() => s.build(s.connected ? s.live.facelets : s.shownFacelets, 'از همین نقطه دوباره محاسبه شد.')}>محاسبه مجدد</button>
          </div>
        </section>
        {s.note && <p className="text-[11px] text-amber-200" role="status">{s.note}</p>}
        {s.seg && (
          <section id="current-step" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">مرحله: {s.seg.title}</h2>
              <span className="text-[10px] text-secondary">حرکت {fa(s.pos + 1)} از {fa(s.flat.length)}</span>
            </div>
            <div className="cyber-panel p-4 rounded-xl border-cyan bg-cyan-400/5 text-center">
              <div className="formula text-3xl font-black text-white tracking-widest mb-2" dir="ltr">{curUser}</div>
              <div className="text-[11px] text-secondary">{s.seg.explanation}</div>
            </div>
          </section>
        )}
        {s.done && s.plan && <p className="text-sm text-green-400 text-center"><i className="fa-solid fa-check ml-2"></i>روبیک حل شد.</p>}
        {!s.connected && s.plan && (
          <div className="flex justify-center items-center gap-8 py-2">
            <button className="text-secondary text-lg hover:text-white" aria-label="حرکت قبل" onClick={() => s.step(-1)}><i className="fa-solid fa-backward-step"></i></button>
            <button className="w-14 h-14 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-white text-xl" aria-label={s.playing ? 'مکث' : 'پخش'} onClick={() => s.setPlaying(!s.playing)}><i className={'fa-solid ' + (s.playing ? 'fa-pause' : 'fa-play ml-1')}></i></button>
            <button className="text-secondary text-lg hover:text-white" aria-label="حرکت بعد" onClick={() => s.step(1)}><i className="fa-solid fa-forward-step"></i></button>
          </div>
        )}
        {s.plan && (
          <section id="execution-list" className="space-y-3">
            <div className="text-xs font-bold text-secondary">توالی حرکات</div>
            <div className="flex gap-2 overflow-x-auto pb-4" dir="ltr">
              {s.flat.slice(Math.max(0, s.pos - 1), s.pos + 7).map((x, i) => {
                const idx = Math.max(0, s.pos - 1) + i;
                return <div key={idx} className={'min-w-[50px] cyber-panel p-3 rounded-lg flex flex-col items-center ' + (idx < s.pos ? 'opacity-40' : idx === s.pos ? 'border-cyan bg-cyan-400/10' : '')}><span className="text-xs font-bold move-font">{s.userMoves([x.m])[0]}</span></div>;
              })}
            </div>
            {s.connected && s.pos > 0 && !s.note && <div className="flex items-center gap-2 text-[10px] text-green-400"><i className="fa-solid fa-check"></i><span>اجرای واقعی تأیید شد. حرکت بعد را انجام دهید.</span></div>}
          </section>
        )}
        {s.plan && s.mode === 'teach' && (
          <section className="space-y-2">
            <div className="text-xs font-bold text-secondary">همهٔ گام‌ها</div>
            <SegmentList s={s} compact />
          </section>
        )}
        <section className="cyber-panel rounded-xl p-4 space-y-3">
          <label className="block text-xs">سرعت نمایش
            <select className="w-full p-3 rounded-lg bg-white/5 mt-1" value={s.speed} onChange={(e) => s.setSpeed(Number(e.target.value))}><option value={1}>۱×</option><option value={0.5}>۰٫۵×</option><option value={2}>۲×</option></select>
          </label>
          <button className="w-full mt-3 py-3 px-4 rounded-xl border border-white/15 bg-white/5 text-sm font-medium" onClick={() => cube.current?.resetCamera()}>بازنشانی نمای دوربین</button>
          <p className="text-sm text-secondary">چرخش نما و محاسبهٔ دوباره، وضعیت داخلی روبیک واقعی را بازنویسی نمی‌کنند. حل آموزشی توضیح فارسی دارد؛ روش محاسباتی فقط مسیر حرکت‌ها را کوتاه می‌کند.</p>
        </section>
      </main>
      <MobileNav route="practice" />
    </div>
  );
}

export default function Solver({ mobile, route }) {
  return mobile ? <Mobile route={route} /> : <Desktop route={route} />;
}
