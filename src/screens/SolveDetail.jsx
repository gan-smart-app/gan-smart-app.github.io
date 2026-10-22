import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { moveCount, tps } from '../core/stats.mjs';
import { useToast, Empty } from '../components/ui.jsx';
import { fa, resultText, dateFa, timeFa } from '../app/format.js';
import { KIND_LABEL } from './Stats.jsx';
import { MobileHeader, MobileNav } from '../layout/Shell.jsx';
import { navigate } from '../app/router.js';

// Solve details (without replay): penalties, note, delete/restore.
function useSolveModel(id) {
  const { data, actions } = useApp();
  const solve = data.solves.find((s) => s.id === id) || data.deleted.find((s) => s.id === id);
  const number = solve ? data.solves.indexOf(solve) + 1 : 0;
  const [note, setNote] = useState(solve?.note || '');
  useEffect(() => setNote(solve?.note || ''), [solve?.id, solve?.note]);
  const [toast, show] = useToast();
  const togglePenalty = (p) => actions.updateSolve(solve.id, { penalty: solve.penalty === p ? null : p });
  const remove = async () => {
    await actions.deleteSolve(solve.id);
    show('حل حذف شد.', { label: 'بازگردانی', run: () => actions.restoreSolve(solve.id) });
  };
  return { solve, number, note, setNote, toast, togglePenalty, remove, actions };
}

function badgeOf(s) {
  if (s.deleted) return ['حذف‌شده', 'border-line text-muted'];
  if (s.penalty === 'DNF') return ['DNF', 'border-bad/30 bg-bad/10 text-bad'];
  if (s.penalty === '+2') return ['جریمهٔ +2', 'border-warn/30 bg-warn/10 text-warn'];
  return ['معتبر', 'border-ok/30 bg-ok/10 text-ok'];
}

function Metrics({ s }) {
  const mc = moveCount(s), t = tps(s);
  const items = [
    ['زمان خام', resultText({ ...s, penalty: null }), true],
    ['تعداد حرکت', mc == null ? 'نامشخص' : String(mc), mc != null],
    ['TPS', t == null ? 'نامشخص' : t.toFixed(1), t != null],
    ['نوع تمرین', KIND_LABEL[s.kind] || s.kind, false],
  ];
  return items.map(([label, value, num]) => (
    <div key={label} className="rounded-xl bg-bg border border-line p-3.5">
      <div className="stat-label mb-1">{label}</div>
      <div className={num ? 'stat-value !text-base' : 'text-sm font-semibold'}>{value}</div>
    </div>
  ));
}

function Penalties({ r, s }) {
  if (s.deleted) return null;
  const on = (p, cls) => (s.penalty === p ? cls : '');
  return (
    <div className="grid grid-cols-2 gap-2">
      <button aria-pressed={s.penalty === '+2'} className={'btn-secondary ' + on('+2', '!border-warn/50 !text-warn')} onClick={() => r.togglePenalty('+2')}>{s.penalty === '+2' ? 'حذف جریمهٔ +2' : 'ثبت +2'}</button>
      <button aria-pressed={s.penalty === 'DNF'} className={'btn-secondary ' + on('DNF', '!border-bad/50 !text-bad')} onClick={() => r.togglePenalty('DNF')}>{s.penalty === 'DNF' ? 'لغو DNF' : 'ثبت DNF'}</button>
    </div>
  );
}

function Body({ r, mobile }) {
  const s = r.solve;
  const [label, cls] = badgeOf(s);
  return (
    <div className={mobile ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 gap-6 items-start'}>
      <section className="card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">زمان نهایی</span>
          <span className={'badge ' + cls}>{label}</span>
        </div>
        <div className={'num font-semibold tracking-tight leading-none ' + (s.penalty === 'DNF' ? 'text-bad' : 'text-ink') + (mobile ? ' text-5xl' : ' text-6xl')}>{resultText(s)}</div>
        <Penalties r={r} s={s} />
        <div className="grid grid-cols-2 gap-2"><Metrics s={s} /></div>
        <p className="text-xs text-faint leading-6">زمان خام و جریمه جدا نگهداری می‌شوند؛ DNF صفر نیست و در میانگین بدترین حساب می‌شود.</p>
      </section>
      <div className="space-y-4">
        <section className="card p-5">
          <h3 className="section-title mb-3">اسکرَمبل</h3>
          {s.scramble
            ? <div dir="ltr" className="flex flex-wrap gap-1.5">{s.scramble.split(' ').map((t, i) => <span key={i} className="move h-8 min-w-[2.1rem] text-sm bg-raised text-ink">{t}</span>)}</div>
            : <p className="text-sm text-muted">تمرین آزاد</p>}
        </section>
        <section className="card p-5">
          <h3 className="section-title mb-3">یادداشت</h3>
          <textarea placeholder="یادداشتی دربارهٔ این حل بنویس…" value={r.note} onChange={(e) => r.setNote(e.target.value)} maxLength={500}
            className="field min-h-[110px]" aria-label="یادداشت دربارهٔ این حل" />
          <div className="mt-3 flex justify-between items-center gap-3">
            <span className="text-xs text-faint">زمان بر پایهٔ دریافت حرکت در مرورگر است.</span>
            <button className="btn-secondary btn-sm" disabled={r.note === (s.note || '')} onClick={() => r.actions.updateSolve(s.id, { note: r.note })}>ذخیرهٔ یادداشت</button>
          </div>
        </section>
        {mobile && (s.deleted
          ? <button className="btn-secondary w-full" onClick={() => r.actions.restoreSolve(s.id)}>بازگردانی حل</button>
          : <button className="btn-danger w-full" onClick={r.remove}><i className="fa-regular fa-trash-can"></i>حذف حل</button>)}
      </div>
    </div>
  );
}

function Desktop({ id }) {
  const r = useSolveModel(id);
  const back = () => (history.length > 1 ? history.back() : navigate('stats'));
  if (!r.solve) return <main className="w-full max-w-4xl mx-auto px-6 py-10"><Empty icon="fa-magnifying-glass" title="این حل پیدا نشد" text="ممکن است هنوز از دستگاه دیگر همگام نشده باشد." action={<a href="#/stats" className="btn-secondary">بازگشت به آمار</a>} /></main>;
  const s = r.solve;
  return (
    <>
      <nav id="header" className="sticky top-0 z-50 h-14 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="h-full max-w-4xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="icon-btn" aria-label="بازگشت" title="بازگشت" onClick={back}><i className="fa-solid fa-arrow-right"></i></button>
            <h1 className="font-semibold">حل شمارهٔ {fa(r.number || '')}</h1>
            <span className="text-xs text-faint">{dateFa(s.createdAt)} · {timeFa(s.createdAt)}</span>
          </div>
          {s.deleted
            ? <button className="btn-secondary btn-sm" onClick={() => r.actions.restoreSolve(s.id)}>بازگردانی حل</button>
            : <button className="btn-danger btn-sm" onClick={r.remove}><i className="fa-regular fa-trash-can"></i>حذف حل</button>}
        </div>
      </nav>
      <main className="w-full max-w-4xl mx-auto px-6 py-8"><Body r={r} /></main>
      {r.toast}
    </>
  );
}

function Mobile({ id }) {
  const r = useSolveModel(id);
  if (!r.solve) return <div className="mob-page"><MobileHeader title="جزئیات حل" back="#/stats" end={null} /><main className="px-4 pt-4"><Empty title="این حل پیدا نشد" /></main><MobileNav route="stats" /></div>;
  return (
    <div className="mob-page">
      <MobileHeader title={'حل #' + fa(r.number)} back="#/stats" end={<span className="text-xs text-faint pe-2">{dateFa(r.solve.createdAt)} · {timeFa(r.solve.createdAt)}</span>} />
      <main className="px-4 pt-4 pb-2"><Body r={r} mobile /></main>
      <MobileNav route="stats" />
      {r.toast}
    </div>
  );
}

export default function SolveDetail({ mobile, route }) {
  const id = route.params[0];
  return mobile ? <Mobile id={id} /> : <Desktop id={id} />;
}
