import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { PHASES, INSPECTION_GRACE_MS } from '../core/practice.mjs';
import { aoN, bestSolve, countedSolves, effectiveMs } from '../core/stats.mjs';
import { parseAlg, stateFromAlg, toFacelets } from '../core/cube.mjs';
import CubeView from '../components/CubeView.jsx';
import { Alg, Modal, useNow, useToast } from '../components/ui.jsx';
import { ago, clock, fa, faDigits, msText, resultText } from '../app/format.js';
import { batteryIcon, MobileHeader, MobileNav, SyncPill, syncView } from '../layout/Shell.jsx';

// ---------- shared practice logic ----------
function usePracticeModel() {
  const app = useApp();
  const { practice: p, practiceApi, solver, link, device, live, settings, data, currentSessionId, lastSolveId, actions } = app;
  const [busyScramble, setBusyScramble] = useState(false);

  const newScramble = useCallback(async () => {
    setBusyScramble(true);
    try {
      const s = await solver.scramble();
      practiceApi.startScramble(s);
    } finally {
      setBusyScramble(false);
    }
  }, [solver, practiceApi]);

  useEffect(() => {
    if (!practiceApi.state.scramble && practiceApi.state.mode === 'scramble') newScramble();
  }, [practiceApi, newScramble]);

  const sessionSolves = useMemo(() => {
    return data.solves.filter((s) => s.sessionId === currentSessionId);
  }, [data.solves, currentSessionId]);
  const counted = countedSolves(sessionSolves);
  const session = data.sessions.find((s) => s.id === currentSessionId);
  const last = data.solves.find((s) => s.id === lastSolveId);

  const active = p.phase === PHASES.solving || p.phase === PHASES.inspecting;
  useNow(active);
  const now = performance.now();

  let display = '00.00';
  let inspectionText = null;
  if (p.phase === PHASES.solving) display = clock(practiceApi.elapsed(now));
  else if (p.phase === PHASES.inspecting) {
    const left = p.inspectionMs - (now - p.inspectionAt);
    inspectionText = left > 0 ? String(Math.ceil(left / 1000)) : left > -INSPECTION_GRACE_MS ? '+2' : 'DNF';
    display = inspectionText;
  } else if (p.phase === PHASES.done) display = last ? resultText(last).replace(/^(\d)\./, '0$1.') : clock(p.result?.rawMs);

  const tokens = p.scramble ? parseAlg(p.scramble) : [];
  let cursor = null;
  if (p.phase === PHASES.scrambling) {
    const idx = tokens.length - p.remaining.length;
    if (idx >= 0 && p.remaining.length && p.remaining[0][0] === tokens[idx]?.[0] && p.remaining.slice(1).join(' ') === tokens.slice(idx + 1).join(' ')) cursor = idx;
  }
  const offPath = p.phase === PHASES.scrambling && cursor == null;

  const status = {
    [PHASES.noCube]: device.status === 'recovering' ? 'در حال بازیابی اتصال' : device.status === 'selecting' || device.status === 'connecting' ? 'در حال اتصال' : 'روبیک متصل نیست',
    [PHASES.idle]: 'آماده‌سازی اسکرَمبل',
    [PHASES.planning]: 'محاسبهٔ مسیر اسکرَمبل',
    [PHASES.scrambling]: 'در حال اسکرَمبل',
    [PHASES.freePrep]: 'تمرین آزاد',
    [PHASES.ready]: 'آمادهٔ حل',
    [PHASES.inspecting]: 'بازرسی',
    [PHASES.solving]: 'در حال حل',
    [PHASES.done]: 'پایان معتبر',
    [PHASES.invalid]: 'نتیجه نامعتبر',
  }[p.phase];

  const sub = {
    [PHASES.noCube]: 'برای شروع، روبیک را وصل کن تا وضعیت معتبرش دریافت شود؛ تا آن زمان تایمر آماده نیست.',
    [PHASES.idle]: '',
    [PHASES.planning]: 'روبیک حل‌شده نیست؛ مسیر رسیدن به اسکرَمبل از وضعیت فعلی محاسبه می‌شود.',
    [PHASES.scrambling]: 'حرکت‌های آماده‌سازی زمان‌گیری نمی‌شوند.',
    [PHASES.freePrep]: 'روبیک را هر طور می‌خواهی درهم بریز، سپس «آماده‌ام» را بزن. حرکت‌های آماده‌سازی زمان‌گیری نمی‌شوند.',
    [PHASES.ready]: settings.inspectionEnabled ? 'برای بازرسی Space را بزن یا تایمر را لمس کن؛ اولین حرکت حل، زمان‌گیری را آغاز می‌کند.' : 'با اولین حرکت حل، زمان‌گیری آغاز می‌شود',
    [PHASES.inspecting]: 'اولین حرکت تایمر را شروع می‌کند',
    [PHASES.solving]: 'حل کامل، تایمر را متوقف و نتیجه را ذخیره می‌کند.',
    [PHASES.done]: '',
    [PHASES.invalid]: p.message,
  }[p.phase];

  const primary = () => {
    if (p.phase === PHASES.ready && settings.inspectionEnabled) return practiceApi.startInspection();
    if (p.phase === PHASES.freePrep) return practiceApi.armFree();
    if (p.phase === PHASES.done || p.phase === PHASES.invalid) return p.mode === 'free' ? practiceApi.startFree() : newScramble();
    return undefined;
  };

  return {
    app, p, practiceApi, link, device, live, settings, actions, data, session, counted, sessionSolves, last,
    display, inspectionText, status, sub, tokens, cursor, offPath, busyScramble, newScramble, primary,
  };
}

function useShortcuts(m) {
  useEffect(() => {
    const on = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable], dialog')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') { e.preventDefault(); m.primary(); }
      else if (e.key === 'Escape') m.practiceApi.cancel();
      else if (e.key === 'n' || e.key === 'N') m.newScramble();
      else if (e.key === 'f' || e.key === 'F') { if (m.practiceApi.state.mode === 'free') m.newScramble(); else m.practiceApi.startFree(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [m]);
}

function previewFacelets(m) {
  if (m.live.facelets) return m.live.facelets;
  if (m.p.scramble) return toFacelets(stateFromAlg(m.p.scramble));
  return undefined;
}

// ---------- pieces ----------
function ScrambleLine({ m, className }) {
  if (m.p.mode === 'free') return <p className={className}>تمرین آزاد · بدون اسکرَمبل از پیش تعیین‌شده</p>;
  if (!m.tokens.length) return <p className={className}>{m.busyScramble ? 'در حال ساخت اسکرَمبل…' : '—'}</p>;
  return (
    <p className={className} dir="ltr" aria-label={'اسکرَمبل: ' + m.p.scramble}>
      {m.tokens.map((t, i) => {
        const done = m.cursor != null && i < m.cursor;
        const cur = m.cursor === i;
        const passed = m.p.phase === PHASES.ready || m.p.phase === PHASES.inspecting || m.p.phase === PHASES.solving || m.p.phase === PHASES.done;
        return (
          <span key={i} className={cur ? 'text-cyan-300 bg-cyan-400/15 rounded px-1' : done || passed ? 'text-slate-500' : ''}>
            {t}{i < m.tokens.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </p>
  );
}

function ScrambleStatus({ m }) {
  const p = m.p;
  if (p.mode === 'free') return <span className="text-xs text-slate-400"><i className="fa-solid fa-shuffle ml-1"></i>آماده‌سازی آزاد</span>;
  if (p.phase === PHASES.ready || p.phase === PHASES.inspecting || p.phase === PHASES.solving)
    return <span className="text-xs text-emerald-300"><i className="fa-solid fa-check-circle ml-1"></i>وضعیت هدف تأیید شد</span>;
  if (p.phase === PHASES.scrambling) return <span className="text-xs text-cyan-300">حرکت {fa(Math.max(0, m.tokens.length - p.remaining.length + 1))} از {fa(m.tokens.length)}</span>;
  if (p.phase === PHASES.planning) return <span className="text-xs text-slate-400"><i className="fa-solid fa-spinner animate-spin ml-1"></i>محاسبهٔ مسیر</span>;
  if (p.phase === PHASES.noCube) return <span className="text-xs text-slate-400">بررسی هدف پس از اتصال</span>;
  return <span className="text-xs text-slate-400"></span>;
}

function CorrectionStrip({ m }) {
  if (!m.offPath || !m.p.remaining.length) return null;
  const [cur, ...rest] = m.p.remaining;
  return (
    <div className={'mt-4 rounded-xl p-3 text-sm ' + (m.p.deviated ? 'bg-red-500/10 text-red-300' : 'bg-cyan-400/5 text-slate-300')} role="status">
      <span className="text-xs block mb-1">{m.p.deviated ? <><i className="fa-solid fa-circle-exclamation ml-1"></i>انحراف تشخیص داده شد؛ مسیر اصلاح از همین وضعیت:</> : 'مسیر رسیدن به اسکرَمبل از وضعیت فعلی:'}</span>
      <span dir="ltr" className="move-font block text-center text-base">
        <span className="text-slate-900 bg-cyan-400 rounded px-1.5 font-bold">{cur}</span> {rest.join(' ')}
      </span>
    </div>
  );
}

function ResultActions({ m, compact = false }) {
  const s = m.last;
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  if (m.p.phase !== PHASES.done || !s) return null;
  const setPenalty = (penalty) => m.actions.updateSolve(s.id, { penalty: s.penalty === penalty ? null : penalty });
  const btn = compact ? 'flex-1 py-2 bg-white/5 rounded-lg text-xs hover:bg-white/10 transition-colors' : 'px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-sm hover:bg-white/10 transition-all';
  return (
    <div className={compact ? 'flex gap-2 mt-3 flex-wrap' : 'flex gap-3 justify-center flex-wrap mt-6'}>
      <button className={btn + (s.penalty === '+2' ? ' text-amber-300 border-amber-400/40' : '')} aria-pressed={s.penalty === '+2'} onClick={() => setPenalty('+2')}>+2</button>
      <button className={btn + ' text-red-400' + (s.penalty === 'DNF' ? ' border-red-400/40' : '')} aria-pressed={s.penalty === 'DNF'} onClick={() => setPenalty('DNF')}>{s.penalty === 'DNF' ? 'لغو DNF' : 'ثبت DNF'}</button>
      <button className={btn} onClick={() => { setNote(s.note || ''); setNoteOpen(true); }}><i className="fa-regular fa-note-sticky ml-1"></i>یادداشت</button>
      <a className={btn + ' text-center'} href={'#/solve/' + s.id}><i className="fa-solid fa-circle-info ml-1"></i>جزئیات</a>
      <button className={btn + ' text-cyan-300'} onClick={m.primary}>حل بعدی</button>
      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="یادداشت این حل">
        <textarea className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm min-h-[120px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="یادداشت" />
        <button className="mt-4 w-full bg-cyan-400 text-slate-900 font-bold py-3 rounded-xl" onClick={async () => { await m.actions.updateSolve(s.id, { note }); setNoteOpen(false); }}>ذخیره</button>
      </Modal>
    </div>
  );
}

// Optional user goal; nothing is shown until one is set in settings.
function GoalLine({ m, className = 'text-xs mt-3' }) {
  const goal = m.settings.goalMs;
  if (!goal || m.p.phase !== PHASES.done || !m.last || m.last.penalty === 'DNF') return null;
  const t = m.last.rawMs + (m.last.penalty === '+2' ? 2000 : 0);
  return <p className={className + (t <= goal ? ' text-green-300' : ' text-slate-400')}>هدف {msText(goal, { persian: true })} ثانیه: {t <= goal ? 'رسیدی' : faDigits(((t - goal) / 1000).toFixed(2)) + ' ثانیه بیشتر'}</p>;
}

function SaveError({ m }) {
  if (!m.app.saveError || m.p.phase !== PHASES.done) return null;
  return <p className="text-xs text-red-300 mt-3" role="alert"><i className="fa-solid fa-triangle-exclamation ml-1"></i>{m.app.saveError}</p>;
}

function InvalidBox({ m, compact }) {
  if (m.p.phase !== PHASES.invalid) return null;
  const needsLink = m.device.status !== 'ready';
  return (
    <div className={'cyber-panel p-4 rounded-xl border-red-500/50 bg-red-500/5 text-right ' + (compact ? '' : 'max-w-md mx-auto mt-6')} role="alert">
      <div className="flex items-center gap-3">
        <i className="fa-solid fa-triangle-exclamation text-red-400"></i>
        <div>
          <div className="text-xs font-bold text-red-400">نتیجه نامعتبر{m.p.invalidReason !== 'cancel' ? ' / قطع یا ازدست‌رفتن حرکت' : ''}</div>
          <div className="text-[10px] text-secondary">{m.p.invalidReason === 'cancel' ? 'تلاش لغو شد و چیزی ذخیره نشد.' : 'این زمان در رکوردهای معتبر نمی‌آید. اتصال مجدد نتیجهٔ ناقص را معتبر نمی‌کند.'}</div>
        </div>
      </div>
      {needsLink
        ? <button className="w-full mt-3 py-2 border border-red-500/30 rounded-lg text-xs text-red-400" onClick={() => (m.device.status === 'idle' || m.device.status === 'error') && m.link.connect()}>تلاش مجدد اتصال</button>
        : <button className="w-full mt-3 py-2 border border-red-500/30 rounded-lg text-xs text-red-300" onClick={m.primary}>شروع آماده‌سازی جدید</button>}
    </div>
  );
}

function ConnectCta({ m, className = '' }) {
  if (m.p.phase !== PHASES.noCube) return null;
  const busy = m.device.status === 'selecting' || m.device.status === 'connecting';
  if (m.device.status === 'recovering') return <p className={'text-xs text-amber-300 ' + className}><i className="fa-solid fa-spinner animate-spin ml-1"></i>بازیابی خودکار اتصال…</p>;
  if (!m.app.support.ok) return <a href="#/connection" className={'text-xs text-amber-300 underline ' + className}>{m.app.support.text}</a>;
  return busy
    ? <button className={'px-6 py-3 rounded-xl border border-white/15 bg-white/5 text-sm ' + className} onClick={() => m.link.cancel()}>لغو تلاش اتصال</button>
    : <button className={'px-6 py-3 rounded-xl bg-cyan-400 text-slate-900 font-bold text-sm ' + className} onClick={() => m.link.connect()}><i className="fa-brands fa-bluetooth-b ml-2"></i>اتصال به روبیک</button>;
}

function SessionPicker({ m, open, onClose }) {
  const [name, setName] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="جلسهٔ تمرین">
      <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
        {m.data.sessions.length === 0 && <p className="text-sm text-slate-400">هنوز جلسه‌ای ساخته نشده؛ با اولین حل، جلسهٔ تازه خودکار ساخته می‌شود.</p>}
        {[...m.data.sessions].reverse().map((s) => (
          <button key={s.id} onClick={() => { m.actions.selectSession(s.id); onClose(); }}
            className={'w-full text-right p-3 rounded-xl border ' + (s.id === m.session?.id ? 'border-cyan-400/50 bg-cyan-400/5' : 'border-white/10 bg-white/5')}>
            <span className="font-bold text-sm">{s.name}</span>
            <span className="text-xs text-slate-400 mr-2">{new Date(s.createdAt).toLocaleDateString('fa-IR')}</span>
          </button>
        ))}
      </div>
      <label className="text-xs text-slate-400 block mb-1" htmlFor="new-session">جلسهٔ تازه</label>
      <div className="flex gap-2">
        <input id="new-session" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً تمرین عصر" className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 text-sm min-h-[44px]" />
        <button className="px-4 rounded-xl bg-cyan-400 text-slate-900 font-bold text-sm min-h-[44px]" onClick={async () => { await m.actions.newSession(name.trim() || undefined); setName(''); onClose(); }}>ساخت</button>
      </div>
      {m.session && (
        <button className="mt-3 text-xs text-slate-400 underline" onClick={async () => { const n = prompt('نام تازهٔ جلسه', m.session.name); if (n?.trim()) await m.actions.renameSession(m.session.id, n.trim()); }}>تغییر نام جلسهٔ فعلی</button>
      )}
    </Modal>
  );
}

// ---------- desktop (design 01) ----------
export function PracticeDesktop() {
  const m = usePracticeModel();
  useShortcuts(m);
  const cube = useRef(null);
  const [pick, setPick] = useState(false);
  const best = bestSolve(m.counted);
  const ao5 = aoN(m.counted, 5), ao12 = aoN(m.counted, 12);
  const recent = [...m.sessionSolves].filter((s) => s.valid).slice(-3).reverse();
  const copy = () => m.p.scramble && navigator.clipboard?.writeText(m.p.scramble);
  const timerClick = () => (m.p.phase === PHASES.ready || m.p.phase === PHASES.freePrep) && m.primary();

  return (
    <main className="flex-grow flex flex-col lg:flex-row p-6 gap-6 max-w-[1600px] mx-auto w-full">
      <aside id="session-sidebar" className="w-full lg:w-80 flex flex-col gap-6 order-2 lg:order-1">
        <div className="glass-panel rounded-2xl p-6 flex flex-col gap-6">
          <div>
            <h2 className="text-slate-400 text-sm mb-1">جلسه فعلی</h2>
            <div className="flex justify-between items-center">
              <span className="text-xl font-bold">{m.session?.name || 'جلسهٔ تازه'}</span>
              {<button className="text-cyan-400 text-sm hover:underline" onClick={() => setPick(true)}>تغییر</button>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
              <span className="text-xs text-slate-500 block mb-1">تعداد حل</span>
              <span className="text-2xl font-bold timer-font">{fa(m.sessionSolves.filter((s) => s.valid).length)}</span>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/5">
              <span className="text-xs text-slate-500 block mb-1">بهترین</span>
              <span className="text-2xl font-bold timer-font">{best ? resultText(best, { persian: true }) : '—'}</span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-slate-400 text-sm">میانگین ۵ (ao5)</span>
              {ao5 == null ? <span className="text-xs text-slate-500 italic">داده کافی نیست</span> : <span className="font-bold timer-font text-purple-400">{msText(ao5, { persian: true })}</span>}
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-slate-400 text-sm">میانگین ۱۲ (ao12)</span>
              {ao12 == null ? <span className="text-xs text-slate-500 italic">داده کافی نیست</span> : <span className="font-bold timer-font text-purple-400">{msText(ao12, { persian: true })}</span>}
            </div>
          </div>
          <div>
            <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-4">تاریخچه اخیر</h3>
            <div className="space-y-3">
              {recent.length === 0 && <p className="text-xs text-slate-500">هنوز حلی در این جلسه ثبت نشده است.</p>}
              {recent.map((s) => {
                const n = m.sessionSolves.filter((x) => x.valid).indexOf(s) + 1;
                const isBest = best && s.id === best.id;
                return (
                  <a key={s.id} href={'#/solve/' + s.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-all group">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-600">#{fa(n)}</span>
                      <span className={'font-medium timer-font text-sm' + (isBest ? ' text-green-400' : '')}>{resultText(s, { persian: true })}</span>
                    </div>
                    <span className="text-[10px] text-slate-600 group-hover:text-slate-400">{ago(s.createdAt)}</span>
                  </a>
                );
              })}
            </div>
            <a href="#/stats" className="block text-center w-full mt-4 py-2 text-sm text-slate-500 hover:text-white transition-all border border-dashed border-white/10 rounded-lg">مشاهده همه آمار</a>
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5 border-l-2 border-l-cyan-500">
          <p className="text-xs text-slate-400 leading-relaxed italic">
            <i className="fa-solid fa-info-circle ml-1 text-cyan-500"></i>
            زمان بر پایه دریافت حرکت در مرورگر است؛ این یک تایمر مسابقه‌ای رسمی نیست.
          </p>
        </div>
      </aside>

      <div id="timer-container" className="flex-grow flex flex-col gap-6 order-1 lg:order-2">
        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl rounded-full"></div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs font-bold text-cyan-400 bg-cyan-400/10 px-2 py-1 rounded">{m.p.mode === 'free' ? 'تمرین آزاد' : 'اسکرمبل فعلی'}</span>
            <ScrambleStatus m={m} />
            <div className="flex gap-2">
              <button className="p-2 hover:bg-white/10 rounded-lg transition-all text-slate-400" title="کپی" aria-label="کپی اسکرمبل" onClick={copy} disabled={!m.p.scramble}><i className="fa-solid fa-copy"></i></button>
              <button className="p-2 hover:bg-white/10 rounded-lg transition-all text-slate-400" title="اسکرمبل جدید (N)" aria-label="اسکرمبل جدید" onClick={m.newScramble} disabled={m.busyScramble || m.p.phase === PHASES.solving}><i className={'fa-solid fa-rotate-right' + (m.busyScramble ? ' animate-spin' : '')}></i></button>
            </div>
          </div>
          <div className="ltr-dir w-full text-center py-2">
            <ScrambleLine m={m} className="text-xl md:text-2xl font-mono tracking-widest text-slate-200" />
          </div>
          <CorrectionStrip m={m} />
        </div>

        <div className={'glass-panel rounded-2xl flex-grow flex flex-col items-center justify-start relative min-h-[600px] pt-16 pb-8 ' + (m.p.phase === PHASES.invalid ? 'border border-red-500/30' : 'cyber-glow')}>
          <div className="absolute top-6 left-6"><SyncPill /></div>
          <label className="absolute top-6 right-6 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" className="accent-cyan-400 w-4 h-4" checked={m.settings.inspectionEnabled} disabled={m.p.phase === PHASES.solving || m.p.phase === PHASES.inspecting}
              onChange={(e) => m.actions.saveSettings({ inspectionEnabled: e.target.checked })} />
            بازرسی پیش از حل<span className="text-slate-400">{fa(m.settings.inspectionSeconds)} ثانیه</span>
          </label>
          <div className="text-center z-10 mb-8">
            <button type="button" onClick={timerClick} className="block mx-auto cursor-default" aria-live="off" aria-label={'تایمر ' + m.display}>
              <div dir="ltr" style={{ fontSize: 'clamp(4.5rem, 10vw, 10rem)', lineHeight: 1.05, textShadow: '0 0 30px rgba(255,255,255,0.2)' }} className={'timer-font font-black ' + (m.p.phase === PHASES.solving ? 'text-cyan-300' : m.p.phase === PHASES.inspecting ? 'text-yellow-300' : m.p.phase === PHASES.invalid ? 'text-slate-600' : 'text-white')}>{m.display}</div>
            </button>
            {m.p.phase === PHASES.inspecting && <span className="inline-block bg-yellow-500 text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded">بازرسی فعال</span>}
            <p className={'font-medium tracking-widest mt-4 flex items-center justify-center gap-3 ' + (m.p.phase === PHASES.invalid ? 'text-red-400' : 'text-cyan-400')} role="status">
              <span className="w-12 h-[1px] bg-cyan-400/30"></span>
              {m.status}
              <span className="w-12 h-[1px] bg-cyan-400/30"></span>
            </p>
            {m.p.phase !== PHASES.invalid && m.sub && <p className="text-slate-500 text-sm mt-2 max-w-xl mx-auto">{m.sub}</p>}
            {m.p.phase === PHASES.scrambling && !m.offPath && m.p.remaining[0] && (
              <p className="text-slate-300 text-sm mt-3">حرکت جاری <Alg moves={m.p.remaining[0]} className="text-cyan-300 font-bold text-lg mx-1" />{m.p.remaining[1] && <> · بعدی <Alg moves={m.p.remaining[1]} /></>}</p>
            )}
            {m.p.phase === PHASES.freePrep && <button className="mt-4 px-6 py-2 rounded-xl bg-cyan-400 text-slate-900 font-bold" onClick={() => m.practiceApi.armFree()}>آماده‌ام <kbd className="text-[10px] opacity-70 mr-1">Space</kbd></button>}
            {m.p.phase === PHASES.solving && <p className="text-xs text-slate-400 mt-2">{fa(m.p.moves.length)} حرکت دریافت‌شده</p>}
            <GoalLine m={m} />
            <SaveError m={m} />
            <ResultActions m={m} />
            <InvalidBox m={m} />
            <ConnectCta m={m} className="mt-6" />
          </div>

          <div id="cube-wrapper" className="relative w-full max-w-lg">
            <CubeView ref={cube} facelets={previewFacelets(m)} lastMove={m.live.lastMove} moveKey={m.live.moveKey} dim={!m.live.facelets} height={400}
              label="نمای سه‌بعدی روبیک؛ چرخش نما فقط دوربین را تغییر می‌دهد" />
            {!m.live.facelets && m.p.scramble && <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 bg-black/40 px-2 py-0.5 rounded">پیش‌نمایش اسکرمبل</span>}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 p-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl">
              <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 transition-all text-slate-300" title="بازنشانی دوربین" aria-label="بازنشانی نمای دوربین؛ بدون تغییر روبیک" onClick={() => cube.current?.resetCamera()}>
                <i className="fa-solid fa-video"></i>
              </button>
              <div className="w-[1px] h-6 bg-white/10"></div>
              <button className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-all" title="کلید F"
                disabled={m.p.phase === PHASES.solving} onClick={() => (m.p.mode === 'free' ? m.newScramble() : m.practiceApi.startFree())}>
                {m.p.mode === 'free' ? 'اسکرمبل هدایت‌شده' : 'تمرین آزاد'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <SessionPicker m={m} open={pick} onClose={() => setPick(false)} />
    </main>
  );
}

export function DesktopFooter() {
  const { device } = useApp();
  const ok = device.status === 'ready';
  return (
    <footer id="footer" className="p-6 flex justify-between items-center text-slate-500 text-xs">
      <div className="flex items-center gap-4">
        <span className="px-2 py-1 bg-white/5 rounded border border-white/10" title="میان‌برها">Space: بازرسی/آماده · N: اسکرمبل · F: آزاد · Esc: لغو</span>
      </div>
      <div className="flex items-center gap-6">
        <a href="#/settings/privacy" className="hover:text-white transition-all">حریم خصوصی</a>
        <a href="#/connection" className={'flex items-center gap-2 ' + (ok ? 'text-cyan-500/70' : 'text-slate-500')}>
          <i className="fa-solid fa-bolt-lightning"></i>
          <span>{ok ? 'متصل · وضعیت معتبر' : 'روبیک متصل نیست'}</span>
        </a>
      </div>
    </footer>
  );
}

// ---------- mobile (design mobile 01) ----------
export function PracticeMobile({ route }) {
  const m = usePracticeModel();
  const cube = useRef(null);
  const [pick, setPick] = useState(false);
  const best = bestSolve(m.counted);
  const ao5 = aoN(m.counted, 5), ao12 = aoN(m.counted, 12);
  const sv = syncView(m.app.syncStatus);
  const valid = m.sessionSolves.filter((s) => s.valid);
  const tap = () => (m.p.phase === PHASES.ready || m.p.phase === PHASES.freePrep) && m.primary();

  return (
    <div className="mob">
      <MobileHeader title="تمرین"
        start={<>
          <a href="#/settings" aria-label="تنظیمات" className="inline-flex items-center justify-center w-11 h-11"><i className="fa-solid fa-gear"></i></a>
          {m.device.status === 'ready' && m.device.battery != null && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-secondary">{fa(m.device.battery)}٪</span>
              <i className={'fa-solid ' + batteryIcon(m.device.battery) + ' text-cyan text-xs'}></i>
            </div>
          )}
        </>}
        end={<>
          <a href="#/settings/data" aria-label={'ذخیره: ' + sv.text} title={sv.text}><i className={'fa-solid ' + sv.icon + ' text-xs ' + (m.app.syncStatus.state === 'synced' ? 'text-cyan' : m.app.syncStatus.state === 'attention' ? 'text-red-400' : 'text-secondary')}></i></a>
          <a href="#/connection" aria-label="مدیریت اتصال" className={'inline-flex items-center justify-center w-11 h-11 ' + (m.device.status === 'ready' ? 'text-cyan' : 'text-secondary')}>
            <i className="fa-brands fa-bluetooth-b"></i>
          </a>
        </>} />
      <main className="mt-16 px-4 space-y-4">
        <div id="scramble-section" className="text-center space-y-2">
          <div className="text-[10px] text-secondary tracking-widest uppercase">
            {m.p.mode === 'free' ? 'تمرین آزاد' : m.p.phase === PHASES.ready || m.p.phase === PHASES.solving || m.p.phase === PHASES.inspecting ? 'اسکرَمبل تایید شده' : m.p.phase === PHASES.scrambling ? 'اسکرَمبل هدایت‌شده · حرکت ' + fa(Math.max(1, m.tokens.length - m.p.remaining.length + 1)) + ' از ' + fa(m.tokens.length) : 'اسکرَمبل'}
          </div>
          <div className="scramble-box text-sm text-cyan leading-relaxed px-4 py-2 bg-white/5 rounded-lg border border-white/10">
            <ScrambleLine m={m} className="" />
          </div>
          <CorrectionStrip m={m} />
          <div className="flex justify-center gap-4 pt-1">
            <button className="text-xs text-secondary hover:text-white transition-colors" onClick={m.newScramble} disabled={m.busyScramble || m.p.phase === PHASES.solving}>
              <i className={'fa-solid fa-rotate-right ml-1' + (m.busyScramble ? ' animate-spin' : '')}></i> اسکرَمبل جدید
            </button>
            <label className="flex items-center gap-2 min-h-[44px] text-xs text-secondary">
              <input type="checkbox" aria-label="بازرسی پیش از حل" checked={m.settings.inspectionEnabled} onChange={(e) => m.actions.saveSettings({ inspectionEnabled: e.target.checked })} /> بازرسی {fa(m.settings.inspectionSeconds)}ث
            </label>
          </div>
        </div>

        <div id="timer-section" className="text-center py-2">
          <button type="button" className="w-full" onClick={tap} aria-label={'تایمر ' + m.display}>
            <div className={'font-tabular text-6xl font-black tracking-tighter ' + (m.p.phase === PHASES.solving ? 'text-cyan-300' : m.p.phase === PHASES.inspecting ? 'text-yellow-300' : m.p.phase === PHASES.invalid ? 'text-slate-500' : 'text-white')}>{m.display}</div>
          </button>
          <div className={'text-xs mt-2 ' + (m.p.phase === PHASES.invalid ? 'text-red-400' : 'text-secondary')} role="status">
            {m.status}{m.p.phase === PHASES.ready ? '... اولین حرکت شروع می‌کند' : ''}
          </div>
          {m.p.phase === PHASES.scrambling && !m.offPath && m.p.remaining[0] && (
            <p className="text-sm text-secondary mt-1">حرکت جاری <Alg moves={m.p.remaining[0]} className="text-cyan font-bold" />{m.p.remaining[1] && <> · بعدی <Alg moves={m.p.remaining[1]} /></>}</p>
          )}
          {m.p.phase === PHASES.freePrep && <button className="mt-3 px-6 py-3 rounded-xl bg-cyan-400 text-slate-900 font-bold" onClick={() => m.practiceApi.armFree()}>آماده‌ام</button>}
          <div className="flex justify-center"><ConnectCta m={m} className="mt-3" /></div>
        </div>

        <div id="cube-visualization" className="relative py-2">
          <CubeView ref={cube} facelets={previewFacelets(m)} lastMove={m.live.lastMove} moveKey={m.live.moveKey} dim={!m.live.facelets} height={280} />
          {!m.live.facelets && m.p.scramble && (
            <div className="absolute bottom-0 left-0 right-0 flex justify-center">
              <span className="text-[9px] bg-black/40 px-2 py-0.5 rounded border border-white/5 text-secondary">پیش‌نمایش اسکرَمبل</span>
            </div>
          )}
          <button className="absolute top-2 right-0 w-11 h-11 rounded-xl border border-white/15 bg-white/5 flex justify-center items-center text-secondary" aria-label="بازنشانی نما؛ بدون تغییر مکعب" title="بازنشانی نمای دوربین" onClick={() => cube.current?.resetCamera()}>
            <i className="fa-solid fa-camera-rotate"></i>
          </button>
        </div>

        <div>
          <button className="w-full mt-3 py-3 px-4 rounded-xl border border-white/15 bg-white/5 text-sm font-medium" disabled={m.p.phase === PHASES.solving}
            onClick={() => (m.p.mode === 'free' ? m.newScramble() : m.practiceApi.startFree())}>{m.p.mode === 'free' ? 'اسکرَمبل هدایت‌شده' : 'تمرین آزاد'}</button>
        </div>

        {m.p.phase === PHASES.inspecting && (
          <div className="cyber-panel p-4 rounded-xl border-dashed">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-cyan">حالت بازرسی</span>
              <span className="text-xs font-tabular">{m.inspectionText}</span>
            </div>
            <div className="text-[10px] text-secondary">اولین حرکت حل زمان‌گیری را شروع می‌کند.</div>
          </div>
        )}
        {m.p.phase === PHASES.solving && (
          <div className="cyber-panel p-4 rounded-xl border-cyan">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-green-400">در حال حل</span>
              <span className="text-xs font-tabular text-green-400">{m.display}</span>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-secondary">حرکت دریافت‌شده: {fa(m.p.moves.length)}</span>
              <span className="text-[10px] text-secondary">وضعیت دریافت: معتبر</span>
            </div>
          </div>
        )}
        {m.p.phase === PHASES.done && m.last && (
          <div className="cyber-panel p-4 rounded-xl border-white/20">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-xs font-bold">پایان معتبر</div>
                <div className="text-[10px] text-secondary">{sv.text}</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-tabular font-bold text-white">{resultText(m.last)}</div>
                <div className="text-[10px] text-secondary">حل همین جلسه</div>
              </div>
            </div>
            <GoalLine m={m} className="text-[11px] mt-2" />
            <SaveError m={m} />
            <ResultActions m={m} compact />
          </div>
        )}
        <InvalidBox m={m} compact />

        <div id="stats-summary" className="cyber-panel rounded-2xl p-4 grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-[10px] text-secondary">جلسه فعلی</div>
            <button className="text-sm font-bold flex items-center gap-1 min-h-0 min-w-0" onClick={() => setPick(true)}>
              <i className="fa-solid fa-moon text-purple-400 text-xs"></i>
              {m.session?.name || 'جلسهٔ تازه'}
            </button>
          </div>
          <div className="space-y-1 text-left" dir="ltr">
            <div className="text-[10px] text-secondary text-right">خلاصه ({fa(valid.length)} حل)</div>
            <div className="flex justify-end gap-3 text-xs">
              <div className="text-secondary">بهترین <span className="text-white font-tabular">{best ? resultText(best) : '—'}</span></div>
              <div className="text-secondary">ao5 <span className="text-cyan font-tabular">{ao5 == null ? '—' : msText(ao5)}</span></div>
            </div>
          </div>
          <div className="col-span-2 pt-2 border-t border-white/5 flex justify-between items-center">
            <div className="text-xs text-secondary">ao12: {ao12 == null ? <span className="text-white/40 italic text-[10px]">داده کافی نیست</span> : <span className="text-white font-tabular">{msText(ao12)}</span>}</div>
            <a href="#/stats" className="text-xs text-cyan hover:underline">تاریخچه و آمار <i className="fa-solid fa-chevron-left text-[10px] mr-1"></i></a>
          </div>
        </div>
        <p className="text-xs text-secondary py-2">زمان بر پایهٔ دریافت حرکت در مرورگر است؛ ادعای تایمر مسابقه‌ای ندارد.</p>
      </main>
      <MobileNav route={route} />
      <SessionPicker m={m} open={pick} onClose={() => setPick(false)} />
    </div>
  );
}
