import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { PHASES, INSPECTION_GRACE_MS } from '../core/practice.mjs';
import { aoN, bestSolve, countedSolves } from '../core/stats.mjs';
import { parseAlg, stateFromAlg, toFacelets } from '../core/cube.mjs';
import CubeView from '../components/CubeView.jsx';
import { Modal, Stat, Switch, useNow } from '../components/ui.jsx';
import { ago, clock, fa, faDigits, msText, resultText } from '../app/format.js';
import { MobileHeader, MobileNav, SyncPill, syncView } from '../layout/Shell.jsx';

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
const PASSED = new Set([PHASES.ready, PHASES.inspecting, PHASES.solving, PHASES.done]);

function timerTone(p) {
  if (p.phase === PHASES.solving) return 'text-accent';
  if (p.phase === PHASES.inspecting) return 'text-warn';
  if (p.phase === PHASES.ready) return 'text-ok';
  if (p.phase === PHASES.invalid || p.phase === PHASES.noCube) return 'text-ink/25';
  return 'text-ink';
}

function statusDot(p) {
  if (p.phase === PHASES.invalid) return 'bg-bad';
  if (p.phase === PHASES.noCube) return 'bg-faint';
  if (p.phase === PHASES.ready || p.phase === PHASES.done) return 'bg-ok';
  if (p.phase === PHASES.inspecting) return 'bg-warn animate-pulse';
  if (p.phase === PHASES.solving) return 'bg-accent animate-pulse';
  return 'bg-accent';
}

function ScrambleMoves({ m, small = false }) {
  if (m.p.mode === 'free') return <p className="text-sm text-muted py-2">تمرین آزاد · بدون اسکرَمبل از پیش تعیین‌شده</p>;
  if (!m.tokens.length) return <p className="text-sm text-muted py-2">{m.busyScramble ? <><i className="fa-solid fa-circle-notch animate-spin ms-1 text-accent"></i> در حال ساخت اسکرَمبل…</> : '—'}</p>;
  const passed = PASSED.has(m.p.phase);
  return (
    <div dir="ltr" className={'flex flex-wrap ' + (small ? 'gap-1 justify-center' : 'gap-1.5')} aria-label={'اسکرَمبل: ' + m.p.scramble}>
      {m.tokens.map((t, i) => {
        const cur = m.cursor === i;
        const done = passed || (m.cursor != null && i < m.cursor);
        return (
          <span key={i} className={'move ' + (small ? 'h-8 min-w-[2.1rem] text-sm px-1.5 ' : '') + (cur ? 'bg-accent text-white' : done ? 'text-faint' : 'bg-raised text-ink')}>
            {t}
          </span>
        );
      })}
    </div>
  );
}

function ScrambleStatus({ m }) {
  const p = m.p;
  if (p.mode === 'free') return <span className="text-xs text-muted">آماده‌سازی آزاد</span>;
  if (p.phase === PHASES.ready || p.phase === PHASES.inspecting || p.phase === PHASES.solving)
    return <span className="text-xs text-ok"><i className="fa-solid fa-circle-check ms-1"></i>وضعیت هدف تأیید شد</span>;
  if (p.phase === PHASES.scrambling) return <span className="text-xs text-accent">حرکت {fa(Math.max(1, m.tokens.length - p.remaining.length + 1))} از {fa(m.tokens.length)}</span>;
  if (p.phase === PHASES.planning) return <span className="text-xs text-muted"><i className="fa-solid fa-circle-notch animate-spin ms-1"></i>محاسبهٔ مسیر</span>;
  if (p.phase === PHASES.noCube) return <span className="text-xs text-faint">بررسی هدف پس از اتصال</span>;
  return null;
}

function CorrectionStrip({ m }) {
  if (!m.offPath || !m.p.remaining.length) return null;
  const [cur, ...rest] = m.p.remaining;
  return (
    <div className={'mt-4 rounded-xl border p-3.5 ' + (m.p.deviated ? 'border-bad/30 bg-bad/5' : 'border-accent/25 bg-accent/5')} role="status">
      <p className={'text-xs mb-2 ' + (m.p.deviated ? 'text-bad' : 'text-muted')}>
        {m.p.deviated ? <><i className="fa-solid fa-circle-exclamation ms-1"></i>انحراف تشخیص داده شد؛ مسیر اصلاح از همین وضعیت:</> : 'مسیر رسیدن به اسکرَمبل از وضعیت فعلی:'}
      </p>
      <div dir="ltr" className="flex flex-wrap gap-1.5">
        <span className="move bg-accent text-white">{cur}</span>
        {rest.map((t, i) => <span key={i} className="move bg-raised text-ink">{t}</span>)}
      </div>
    </div>
  );
}

function ResultActions({ m, compact = false }) {
  const s = m.last;
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  if (m.p.phase !== PHASES.done || !s) return null;
  const setPenalty = (penalty) => m.actions.updateSolve(s.id, { penalty: s.penalty === penalty ? null : penalty });
  const sec = 'btn-secondary btn-sm';
  return (
    <div className={'flex flex-wrap gap-2 ' + (compact ? 'mt-4' : 'justify-center mt-6')}>
      <button className={sec + (s.penalty === '+2' ? ' !border-warn/50 !text-warn' : '')} aria-pressed={s.penalty === '+2'} onClick={() => setPenalty('+2')}><span className="num">+2</span></button>
      <button className={sec + (s.penalty === 'DNF' ? ' !border-bad/50 !text-bad' : '')} aria-pressed={s.penalty === 'DNF'} onClick={() => setPenalty('DNF')}>{s.penalty === 'DNF' ? 'لغو DNF' : 'DNF'}</button>
      <button className={sec} onClick={() => { setNote(s.note || ''); setNoteOpen(true); }}><i className="fa-regular fa-note-sticky"></i>یادداشت</button>
      <a className={sec} href={'#/solve/' + s.id}><i className="fa-solid fa-circle-info"></i>جزئیات</a>
      <button className="btn-primary btn-sm" onClick={m.primary}>حل بعدی{!compact && <kbd className="!bg-white/15 !border-white/20 !text-white !h-5">Space</kbd>}</button>
      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="یادداشت این حل">
        <textarea className="field min-h-[120px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="یادداشت" />
        <button className="btn-primary w-full mt-4" onClick={async () => { await m.actions.updateSolve(s.id, { note }); setNoteOpen(false); }}>ذخیره</button>
      </Modal>
    </div>
  );
}

// Optional user goal; nothing is shown until one is set in settings.
function GoalLine({ m, className = 'text-sm mt-3' }) {
  const goal = m.settings.goalMs;
  if (!goal || m.p.phase !== PHASES.done || !m.last || m.last.penalty === 'DNF') return null;
  const t = m.last.rawMs + (m.last.penalty === '+2' ? 2000 : 0);
  return <p className={className + (t <= goal ? ' text-ok' : ' text-muted')}>هدف {msText(goal, { persian: true })} ثانیه: {t <= goal ? 'رسیدی' : faDigits(((t - goal) / 1000).toFixed(2)) + ' ثانیه بیشتر'}</p>;
}

function SaveError({ m }) {
  if (!m.app.saveError || m.p.phase !== PHASES.done) return null;
  return <p className="text-sm text-bad mt-3" role="alert"><i className="fa-solid fa-triangle-exclamation ms-1"></i>{m.app.saveError}</p>;
}

function InvalidBox({ m, compact }) {
  if (m.p.phase !== PHASES.invalid) return null;
  const needsLink = m.device.status !== 'ready';
  return (
    <div className={'rounded-xl border border-bad/30 bg-bad/5 p-4 text-right ' + (compact ? '' : 'max-w-md mx-auto mt-6')} role="alert">
      <div className="flex items-start gap-3">
        <i className="fa-solid fa-triangle-exclamation text-bad mt-1"></i>
        <div>
          <div className="text-sm font-semibold text-bad">نتیجه نامعتبر{m.p.invalidReason !== 'cancel' ? ' · قطع یا ازدست‌رفتن حرکت' : ''}</div>
          <div className="text-xs text-muted mt-1 leading-6">{m.p.invalidReason === 'cancel' ? 'تلاش لغو شد و چیزی ذخیره نشد.' : 'این زمان در رکوردهای معتبر نمی‌آید. اتصال مجدد نتیجهٔ ناقص را معتبر نمی‌کند.'}</div>
        </div>
      </div>
      {needsLink
        ? <button className="btn-danger btn-sm w-full mt-4" onClick={() => (m.device.status === 'idle' || m.device.status === 'error') && m.link.connect()}>تلاش مجدد اتصال</button>
        : <button className="btn-secondary btn-sm w-full mt-4" onClick={m.primary}>شروع آماده‌سازی جدید</button>}
    </div>
  );
}

function ConnectCta({ m, className = '' }) {
  if (m.p.phase !== PHASES.noCube) return null;
  const busy = m.device.status === 'selecting' || m.device.status === 'connecting';
  if (m.device.status === 'recovering') return <p className={'text-sm text-warn ' + className}><i className="fa-solid fa-circle-notch animate-spin ms-1"></i>بازیابی خودکار اتصال…</p>;
  if (!m.app.support.ok) return <a href="#/connection" className={'text-sm text-warn underline underline-offset-4 ' + className}>{m.app.support.text}</a>;
  return busy
    ? <button className={'btn-secondary btn-lg ' + className} onClick={() => m.link.cancel()}><i className="fa-solid fa-circle-notch animate-spin"></i>لغو تلاش اتصال</button>
    : <button className={'btn-primary btn-lg ' + className} onClick={() => m.link.connect()}><i className="fa-brands fa-bluetooth-b"></i>اتصال به روبیک</button>;
}

function ModeSwitch({ m, className = '' }) {
  const free = m.p.mode === 'free';
  const off = m.p.phase === PHASES.solving;
  return (
    <div className={'seg ' + className} role="group" aria-label="نوع آماده‌سازی">
      <button aria-pressed={!free} disabled={off} onClick={() => free && m.newScramble()}>اسکرَمبل هدایت‌شده</button>
      <button aria-pressed={free} disabled={off} onClick={() => !free && m.practiceApi.startFree()}>تمرین آزاد</button>
    </div>
  );
}

function InspectionSwitch({ m, short = false }) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-muted cursor-pointer">
      <Switch on={m.settings.inspectionEnabled} label="بازرسی پیش از حل" disabled={m.p.phase === PHASES.solving || m.p.phase === PHASES.inspecting}
        onChange={(v) => m.actions.saveSettings({ inspectionEnabled: v })} />
      <span>بازرسی <span className="text-faint">{fa(m.settings.inspectionSeconds)}{short ? 'ث' : ' ثانیه'}</span></span>
    </label>
  );
}

function SessionPicker({ m, open, onClose }) {
  const [name, setName] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="جلسهٔ تمرین">
      <div className="space-y-1.5 max-h-72 overflow-y-auto mb-5">
        {m.data.sessions.length === 0 && <p className="text-sm text-muted">هنوز جلسه‌ای ساخته نشده؛ با اولین حل، جلسهٔ تازه خودکار ساخته می‌شود.</p>}
        {[...m.data.sessions].reverse().map((s) => (
          <button key={s.id} onClick={() => { m.actions.selectSession(s.id); onClose(); }}
            className={'w-full flex items-center justify-between text-right px-3.5 py-3 rounded-lg border transition-colors ' + (s.id === m.session?.id ? 'border-accent/50 bg-accent/10' : 'border-line hover:border-strong')}>
            <span className="font-medium text-sm">{s.name}</span>
            <span className="text-xs text-faint">{new Date(s.createdAt).toLocaleDateString('fa-IR')}</span>
          </button>
        ))}
      </div>
      <label className="text-xs text-muted block mb-1.5" htmlFor="new-session">جلسهٔ تازه</label>
      <div className="flex gap-2">
        <input id="new-session" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً تمرین عصر" className="field flex-1" />
        <button className="btn-primary" onClick={async () => { await m.actions.newSession(name.trim() || undefined); setName(''); onClose(); }}>ساخت</button>
      </div>
      {m.session && (
        <button className="btn-ghost btn-sm mt-3 -ms-3" onClick={async () => { const n = prompt('نام تازهٔ جلسه', m.session.name); if (n?.trim()) await m.actions.renameSession(m.session.id, n.trim()); }}>
          <i className="fa-solid fa-pen text-[10px]"></i>تغییر نام جلسهٔ فعلی
        </button>
      )}
    </Modal>
  );
}

function CubePanel({ m, cube, height, className = '' }) {
  const live = !!m.live.facelets;
  return (
    <div className={'relative ' + className}>
      <div className="absolute top-3 inset-x-3 flex items-center justify-between z-10 pointer-events-none">
        <span className={'badge pointer-events-auto ' + (live ? 'border-ok/30 bg-ok/10 text-ok' : 'border-line bg-surface text-muted')}>
          <span className={'dot w-1.5 h-1.5 ' + (live ? 'bg-ok' : 'bg-faint')}></span>{live ? 'وضعیت زنده' : m.p.scramble ? 'پیش‌نمایش اسکرَمبل' : 'مکعب'}
        </span>
        <button className="icon-btn pointer-events-auto bg-surface/80 border border-line" title="بازنشانی نمای دوربین" aria-label="بازنشانی نمای دوربین؛ بدون تغییر روبیک" onClick={() => cube.current?.resetCamera()}>
          <i className="fa-solid fa-rotate-left text-sm"></i>
        </button>
      </div>
      <CubeView ref={cube} facelets={previewFacelets(m)} lastMove={m.live.lastMove} moveKey={m.live.moveKey} dim={!live} height={height}
        label="نمای سه‌بعدی روبیک؛ چرخش نما فقط دوربین را تغییر می‌دهد" />
    </div>
  );
}

function CurrentMove({ m, className = '' }) {
  if (m.p.phase !== PHASES.scrambling || m.offPath || !m.p.remaining[0]) return null;
  return (
    <div className={'flex items-center justify-center gap-3 text-sm text-muted ' + className}>
      <span>حرکت جاری</span>
      <span className="move bg-accent text-white h-9">{m.p.remaining[0]}</span>
      {m.p.remaining[1] && <><span className="text-faint">بعدی</span><span className="move bg-raised text-ink h-9">{m.p.remaining[1]}</span></>}
    </div>
  );
}

function SolveRow({ s, n, best }) {
  return (
    <a href={'#/solve/' + s.id} className="flex items-center justify-between px-2.5 py-2 -mx-2.5 rounded-lg hover:bg-raised transition-colors group">
      <span className="flex items-center gap-3">
        <span className="num text-xs text-faint w-6">{n}</span>
        <span className={'num text-sm font-medium ' + (s.penalty === 'DNF' ? 'text-bad' : best ? 'text-ok' : 'text-ink')}>{resultText(s)}</span>
        {best && <span className="text-[10px] text-ok">بهترین</span>}
      </span>
      <span className="text-xs text-faint group-hover:text-muted">{ago(s.createdAt)}</span>
    </a>
  );
}

// ---------- desktop ----------
export function PracticeDesktop() {
  const m = usePracticeModel();
  useShortcuts(m);
  const cube = useRef(null);
  const [pick, setPick] = useState(false);
  const best = bestSolve(m.counted);
  const ao5 = aoN(m.counted, 5), ao12 = aoN(m.counted, 12);
  const valid = m.sessionSolves.filter((s) => s.valid);
  const recent = [...valid].slice(-8).reverse();
  const copy = () => m.p.scramble && navigator.clipboard?.writeText(m.p.scramble);
  const timerClick = () => (m.p.phase === PHASES.ready || m.p.phase === PHASES.freePrep) && m.primary();

  return (
    <main className="flex-grow w-full max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
      <div className="flex flex-col gap-6 min-w-0">
        <section id="scramble" className="card p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="section-title">{m.p.mode === 'free' ? 'تمرین آزاد' : 'اسکرَمبل'}</h2>
              <ScrambleStatus m={m} />
            </div>
            <div className="flex items-center gap-1">
              <button className="icon-btn" title="کپی" aria-label="کپی اسکرَمبل" onClick={copy} disabled={!m.p.scramble}><i className="fa-regular fa-copy"></i></button>
              <button className="btn-ghost btn-sm" title="اسکرَمبل جدید (N)" onClick={m.newScramble} disabled={m.busyScramble || m.p.phase === PHASES.solving}>
                <i className={'fa-solid fa-rotate-right' + (m.busyScramble ? ' animate-spin' : '')}></i>اسکرَمبل جدید
              </button>
            </div>
          </div>
          <ScrambleMoves m={m} />
          <CorrectionStrip m={m} />
        </section>

        <section id="stage" className={'card flex-grow flex flex-col overflow-hidden ' + (m.p.phase === PHASES.invalid ? 'border-bad/30' : '')}>
          <div className="flex items-center justify-between gap-4 px-5 h-14 border-b border-line">
            <ModeSwitch m={m} />
            <div className="flex items-center gap-4">
              <InspectionSwitch m={m} />
              <SyncPill />
            </div>
          </div>
          <div className="flex-grow grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="flex flex-col items-center justify-center text-center px-6 py-12 min-h-[440px]">
              <span className="badge border-line bg-bg text-muted mb-6" role="status">
                <span className={'dot w-1.5 h-1.5 ' + statusDot(m.p)}></span>
                <span className={m.p.phase === PHASES.invalid ? 'text-bad' : 'text-ink'}>{m.status}</span>
              </span>
              <button type="button" onClick={timerClick} className="block cursor-default rounded-2xl" aria-live="off" aria-label={'تایمر ' + m.display}>
                <div dir="ltr" style={{ fontSize: 'clamp(5rem, 9vw, 9.5rem)', lineHeight: 1 }}
                  className={'num font-semibold tracking-[-0.04em] transition-colors ' + timerTone(m.p)}>{m.display}</div>
              </button>
              {m.p.phase !== PHASES.invalid && m.sub && <p className="text-sm text-muted mt-6 max-w-md leading-7">{m.sub}</p>}
              <CurrentMove m={m} className="mt-5" />
              {m.p.phase === PHASES.freePrep && <button className="btn-primary btn-lg mt-6" onClick={() => m.practiceApi.armFree()}>آماده‌ام<kbd className="!bg-white/15 !border-white/20 !text-white">Space</kbd></button>}
              {m.p.phase === PHASES.solving && <p className="text-sm text-muted mt-5"><span className="num text-ink">{m.p.moves.length}</span> حرکت دریافت‌شده</p>}
              <GoalLine m={m} />
              <SaveError m={m} />
              <ResultActions m={m} />
              <InvalidBox m={m} />
              <ConnectCta m={m} className="mt-8" />
            </div>
            <div id="cube-wrapper" className="border-t xl:border-t-0 xl:border-s border-line bg-bg/40 flex flex-col justify-center">
              <CubePanel m={m} cube={cube} height={420} />
            </div>
          </div>
        </section>
      </div>

      <aside id="session-sidebar" className="flex flex-col gap-6">
        <section className="card p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="eyebrow mb-0.5">جلسهٔ فعلی</div>
              <div className="text-base font-semibold truncate">{m.session?.name || 'جلسهٔ تازه'}</div>
            </div>
            <button className="btn-ghost btn-sm -me-2" onClick={() => setPick(true)}>تغییر</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="تعداد حل" value={String(valid.length)} />
            <Stat label="بهترین" value={best ? resultText(best) : '—'} tone={best ? 'text-ok' : ''} />
            <Stat label="ao5" value={ao5 == null ? null : msText(ao5)} />
            <Stat label="ao12" value={ao12 == null ? null : msText(ao12)} />
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title">حل‌های اخیر</h3>
            <a href="#/stats" className="text-xs link">همهٔ آمار</a>
          </div>
          {recent.length === 0
            ? <p className="text-sm text-faint py-6 text-center">هنوز حلی در این جلسه ثبت نشده است.</p>
            : <div className="flex flex-col">{recent.map((s) => <SolveRow key={s.id} s={s} n={valid.indexOf(s) + 1} best={best && s.id === best.id} />)}</div>}
        </section>

        <p className="text-xs text-faint leading-6 px-1">
          <i className="fa-solid fa-circle-info ms-1"></i>
          زمان بر پایهٔ دریافت حرکت در مرورگر است؛ این یک تایمر مسابقه‌ای رسمی نیست.
        </p>
      </aside>
      <SessionPicker m={m} open={pick} onClose={() => setPick(false)} />
    </main>
  );
}

export function DesktopFooter() {
  return (
    <footer id="footer" className="w-full max-w-[1400px] mx-auto px-6 pb-6 flex flex-wrap justify-between items-center gap-4 text-xs text-faint">
      <div className="flex flex-wrap items-center gap-4" title="میان‌برها">
        <span className="flex items-center gap-1.5"><kbd>Space</kbd>بازرسی / آماده</span>
        <span className="flex items-center gap-1.5"><kbd>N</kbd>اسکرَمبل جدید</span>
        <span className="flex items-center gap-1.5"><kbd>F</kbd>تمرین آزاد</span>
        <span className="flex items-center gap-1.5"><kbd>Esc</kbd>لغو</span>
      </div>
      <a href="#/settings/privacy" className="hover:text-ink">حریم خصوصی</a>
    </footer>
  );
}

// ---------- mobile ----------
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
    <div className="mob-page">
      <MobileHeader title="تمرین" />
      <main className="px-4 pt-4 space-y-4">
        <section id="scramble-section" className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <ScrambleStatus m={m} />
            <span className="eyebrow">{m.p.mode === 'free' ? 'تمرین آزاد' : 'اسکرَمبل'}</span>
          </div>
          <ScrambleMoves m={m} small />
          <CorrectionStrip m={m} />
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-line">
            <button className="btn-ghost btn-sm -ms-2" onClick={m.newScramble} disabled={m.busyScramble || m.p.phase === PHASES.solving}>
              <i className={'fa-solid fa-rotate-right' + (m.busyScramble ? ' animate-spin' : '')}></i>اسکرَمبل جدید
            </button>
            <InspectionSwitch m={m} short />
          </div>
        </section>

        <section id="timer-section" className="text-center py-4">
          <span className="badge border-line bg-surface text-muted mb-4" role="status">
            <span className={'dot w-1.5 h-1.5 ' + statusDot(m.p)}></span>
            <span className={m.p.phase === PHASES.invalid ? 'text-bad' : 'text-ink'}>{m.status}</span>
          </span>
          <button type="button" className="w-full block" onClick={tap} aria-label={'تایمر ' + m.display}>
            <div dir="ltr" className={'num font-semibold tracking-[-0.04em] leading-none ' + timerTone(m.p)} style={{ fontSize: 'clamp(4.25rem, 22vw, 6.5rem)' }}>{m.display}</div>
          </button>
          {m.p.phase === PHASES.ready && <p className="text-sm text-muted mt-3">اولین حرکت، زمان‌گیری را شروع می‌کند</p>}
          {m.p.phase === PHASES.noCube && m.sub && <p className="text-sm text-muted mt-3 px-4 leading-7">{m.sub}</p>}
          <CurrentMove m={m} className="mt-4" />
          {m.p.phase === PHASES.freePrep && <button className="btn-primary btn-lg mt-4" onClick={() => m.practiceApi.armFree()}>آماده‌ام</button>}
          <div className="flex justify-center"><ConnectCta m={m} className="mt-5" /></div>
        </section>

        {m.p.phase === PHASES.inspecting && (
          <div className="card p-4 border-warn/30 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-warn">حالت بازرسی</div>
              <div className="text-xs text-muted mt-0.5">اولین حرکت حل زمان‌گیری را شروع می‌کند.</div>
            </div>
            <span className="num text-2xl font-semibold text-warn">{m.inspectionText}</span>
          </div>
        )}
        {m.p.phase === PHASES.solving && (
          <div className="card p-4 border-accent/30 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-accent">در حال حل</div>
              <div className="text-xs text-muted mt-0.5">وضعیت دریافت: معتبر</div>
            </div>
            <div className="text-xs text-muted"><span className="num text-base text-ink font-semibold">{m.p.moves.length}</span> حرکت</div>
          </div>
        )}
        {m.p.phase === PHASES.done && m.last && (
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">پایان معتبر</div>
                <div className={'text-xs mt-0.5 ' + sv.tone}>{sv.text}</div>
              </div>
              <div className="num text-2xl font-semibold">{resultText(m.last)}</div>
            </div>
            <GoalLine m={m} className="text-xs mt-2" />
            <SaveError m={m} />
            <ResultActions m={m} compact />
          </div>
        )}
        <InvalidBox m={m} compact />

        <section id="cube-visualization" className="card overflow-hidden">
          <CubePanel m={m} cube={cube} height={300} />
        </section>

        <ModeSwitch m={m} className="w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:h-10" />

        <section id="stats-summary" className="card p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <button className="min-w-0 text-right" onClick={() => setPick(true)}>
              <div className="eyebrow">جلسهٔ فعلی · <span className="num">{valid.length}</span> حل</div>
              <div className="text-sm font-semibold truncate flex items-center gap-1.5">{m.session?.name || 'جلسهٔ تازه'}<i className="fa-solid fa-chevron-down text-[10px] text-faint"></i></div>
            </button>
            <a href="#/stats" className="btn-ghost btn-sm -me-2">آمار<i className="fa-solid fa-chevron-left text-[10px]"></i></a>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="بهترین" value={best ? resultText(best) : '—'} tone={best ? 'text-ok' : ''} compact />
            <Stat label="ao5" value={ao5 == null ? null : msText(ao5)} compact />
            <Stat label="ao12" value={ao12 == null ? null : msText(ao12)} compact />
          </div>
        </section>
        <p className="text-xs text-faint leading-6 pb-2">زمان بر پایهٔ دریافت حرکت در مرورگر است؛ ادعای تایمر مسابقه‌ای ندارد.</p>
      </main>
      <MobileNav route={route} />
      <SessionPicker m={m} open={pick} onClose={() => setPick(false)} />
    </div>
  );
}
