import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { moveCount, tps } from '../core/stats.mjs';
import { useToast, Empty } from '../components/ui.jsx';
import { fa, faDigits, resultText, dateFa, timeFa } from '../app/format.js';
import { KIND_LABEL } from './Stats.jsx';
import { MobileHeader, MobileNav } from '../layout/Shell.jsx';
import { navigate } from '../app/router.js';

// Solve details (design 09, without replay): penalties, note, delete/restore.
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

function Metrics({ s, cls, labelCls, valueCls, skipRaw = false }) {
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

function Desktop({ id }) {
  const r = useSolveModel(id);
  if (!r.solve) return <main className="p-8"><Empty icon="fa-magnifying-glass" title="این حل پیدا نشد" text="ممکن است هنوز از دستگاه دیگر همگام نشده باشد." action={<a href="#/stats" className="text-cyan-300">بازگشت به آمار</a>} /></main>;
  const s = r.solve;
  return (
    <>
      <nav id="header" className="h-16 border-b border-slate-800 glass px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button className="text-slate-400 hover:text-white" aria-label="بازگشت" title="بازگشت" onClick={() => (history.length > 1 ? history.back() : navigate('stats'))}><i className="fa-solid fa-arrow-right"></i></button>
          <div className="h-6 w-px bg-slate-700"></div>
          <h1 className="font-bold">جزئیات حل شماره {fa(r.number || '')}</h1>
          <span className="text-xs text-slate-500">{dateFa(s.createdAt)} · {timeFa(s.createdAt)}</span>
        </div>
        {s.deleted
          ? <button className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-4 py-1.5 rounded-lg text-xs font-bold" onClick={() => r.actions.restoreSolve(s.id)}>بازگردانی حل</button>
          : <button className="bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-all" onClick={r.remove}>حذف حل</button>}
      </nav>
      <main className="p-8 max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
        <section className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8 text-center relative overflow-hidden">
          <div className={'absolute top-0 right-0 px-4 py-1 text-[10px] font-bold rounded-bl-xl ' + (s.deleted ? 'bg-slate-500/20 text-slate-300' : s.penalty === 'DNF' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400')}>
            {s.deleted ? 'حذف‌شده' : s.penalty === 'DNF' ? 'DNF' : 'معتبر'}
          </div>
          <p className="text-slate-500 text-sm mb-2 font-bold">زمان نهایی</p>
          <h2 className="text-6xl font-bold mb-6">{faDigits(resultText(s))}</h2>
          {!s.deleted && (
            <div className="flex gap-2 justify-center mb-8">
              <button aria-pressed={s.penalty === '+2'} className={'flex-1 bg-slate-900 border py-2 rounded-xl text-xs font-bold transition-all ' + (s.penalty === '+2' ? 'border-yellow-400 text-yellow-300' : 'border-slate-700 text-slate-400 hover:border-yellow-400')} onClick={() => r.togglePenalty('+2')}>{s.penalty === '+2' ? 'حذف جریمه +2' : '+2'}</button>
              <button aria-pressed={s.penalty === 'DNF'} className={'flex-1 bg-slate-900 border py-2 rounded-xl text-xs font-bold transition-all ' + (s.penalty === 'DNF' ? 'border-red-500 text-red-400' : 'border-slate-700 text-slate-400 hover:border-red-500')} onClick={() => r.togglePenalty('DNF')}>{s.penalty === 'DNF' ? 'لغو DNF' : 'DNF'}</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 text-right">
            <Metrics s={s} cls="bg-slate-900/50 p-3 rounded-xl border border-slate-800" labelCls="text-[10px] text-slate-500 mb-1" valueCls="text-sm font-bold" />
          </div>
          <p className="text-[10px] text-slate-500 mt-4">زمان خام و جریمه جدا نگهداری می‌شوند؛ DNF صفر نیست و در میانگین بدترین حساب می‌شود.</p>
        </section>
        <div className="space-y-8">
          <section className="bg-slate-800/50 border border-slate-700 rounded-3xl p-6">
            <h3 className="font-bold text-sm mb-4">اسکرَمبل (Scramble)</h3>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <code className="move-font text-xs text-accent-cyan leading-relaxed block text-center">{s.scramble || 'تمرین آزاد'}</code>
            </div>
          </section>
          <section className="bg-slate-800/50 border border-slate-700 rounded-3xl p-6">
            <h3 className="font-bold text-sm mb-4">یادداشت</h3>
            <textarea placeholder="یادداشتی درباره این حل بنویسید..." value={r.note} onChange={(e) => r.setNote(e.target.value)} maxLength={500}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 focus:outline-none focus:border-accent-cyan min-h-[100px]" aria-label="یادداشت درباره این حل" />
            <div className="mt-4 flex justify-between items-center">
              <span className="text-[10px] text-slate-500">زمان بر پایهٔ دریافت حرکت در مرورگر است.</span>
              <button className="text-xs text-accent-cyan font-bold disabled:opacity-40" disabled={r.note === (s.note || '')} onClick={() => r.actions.updateSolve(s.id, { note: r.note })}>ذخیره یادداشت</button>
            </div>
          </section>
        </div>
      </main>
      {r.toast}
    </>
  );
}

function Mobile({ id }) {
  const r = useSolveModel(id);
  if (!r.solve) return <div className="mob"><MobileHeader title="جزئیات حل" back="#/stats" /><main className="mt-20 px-4"><Empty title="این حل پیدا نشد" /></main><MobileNav route="stats" /></div>;
  const s = r.solve;
  return (
    <div className="mob">
      <MobileHeader title={'جزئیات حل #' + fa(r.number)} back="#/stats" />
      <main className="mt-16 px-4 space-y-6 pt-2">
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
          <Metrics s={s} skipRaw cls="cyber-panel p-2 rounded-xl" labelCls="text-[9px] text-secondary" valueCls="text-xs font-bold" />
        </div>
        <div className="cyber-panel p-4 rounded-xl space-y-3">
          <div className="text-[9px] text-secondary">اسکرَمبل</div>
          <div className="font-mono text-[11px] leading-relaxed text-cyan" dir="ltr">{s.scramble || 'تمرین آزاد'}</div>
        </div>
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
      </main>
      <MobileNav route="stats" />
      {r.toast}
    </div>
  );
}

export default function SolveDetail({ mobile, route }) {
  const id = route.params[0];
  return mobile ? <Mobile id={id} /> : <Desktop id={id} />;
}
