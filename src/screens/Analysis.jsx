import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { sessionSummary } from '../app/sessionSummary.js';
import { AiAnswer, useAiRequest } from '../components/AiAsk.jsx';
import { fa, faDigits, dateFa } from '../app/format.js';
import { MobileHeader, MobileNav } from '../layout/Shell.jsx';
import { navigate } from '../app/router.js';

// Optional AI session analysis (design 12). Reachable only when the server
// reports a configured key; otherwise it sends the user back to stats.
function useAnalysis(route) {
  const app = useApp();
  const { data, aiEnabled, aiStatus } = app;
  const session = data.sessions.find((s) => s.id === route.params[0]) || data.sessions.at(-1);
  const summary = useMemo(() => sessionSummary(session, data), [session, data]);
  const q = useAiRequest();
  const ask = useAiRequest();
  const [question, setQuestion] = useState('');
  useEffect(() => { if (!aiEnabled) navigate('stats'); }, [aiEnabled]);
  const n = session ? data.sessions.indexOf(session) + 1 : 0;
  return { app, session, summary, q, ask, question, setQuestion, n, aiStatus };
}

const sec = (v) => (v == null ? '—' : v === 'DNF' ? 'DNF' : faDigits(v.toFixed(2)) + 'ث');

function Desktop({ route }) {
  const a = useAnalysis(route);
  if (!a.session) return <main className="p-8 text-slate-400">جلسه‌ای برای تحلیل پیدا نشد.</main>;
  const s = a.summary;
  const suggestions = ['برای کیس‌هایی که خطا داشتم چه تمرینی انجام بدهم؟', 'روی کدام مرحله تمرکز کنم؟'];
  return (
    <>
      <nav id="header" className="fixed top-0 left-0 right-0 h-16 border-b border-slate-800 glass z-50 px-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent-purple rounded flex items-center justify-center text-white font-bold"><i className="fa-solid fa-wand-magic-sparkles"></i></div>
          <span className="text-lg font-bold tracking-tight">تحلیل هوشمند جلسه</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-left hidden md:block">
            <p className="text-[10px] text-slate-500 uppercase">هزینه تخمینی درخواست</p>
            <p className="text-xs font-bold text-green-400">بر اساس تعرفهٔ فعال سرور</p>
          </div>
          <button className="bg-slate-800 hover:bg-slate-700 px-4 py-1.5 rounded-lg text-xs font-bold transition-all border border-slate-700" onClick={() => navigate('stats')}>بازگشت</button>
        </div>
      </nav>
      <main className="pt-24 pb-12 px-8 max-w-5xl mx-auto space-y-8 w-full">
        <section className="ai-card p-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
            <div>
              <h2 className="text-2xl font-bold mb-2">تحلیل خلاصه جلسه شماره {fa(a.n)} · {a.session.name}</h2>
              <p className="text-slate-400 text-sm">{dateFa(a.session.createdAt)} · شامل {fa(s.solves)} حل{s.ao5Sec != null ? ' - میانگین Ao5: ' + sec(s.ao5Sec) : ''}</p>
            </div>
            <button className="bg-accent-purple text-white px-8 py-3 rounded-2xl font-bold shadow-lg shadow-purple-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-3 disabled:opacity-40"
              disabled={a.q.state.status === 'running' || !s.solves} onClick={() => a.q.run('session', s)}>
              <i className="fa-solid fa-brain"></i>درخواست تحلیل هوشمند
            </button>
          </div>
          <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-4 tracking-widest">خلاصه داده‌های ارسالی</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1"><span className="text-[10px] text-slate-600">زمان کل تمرین</span><p className="text-xs font-bold">{s.durationMin != null ? fa(s.durationMin) + ' دقیقه' : '—'}</p></div>
              <div className="space-y-1"><span className="text-[10px] text-slate-600">بهترین حل</span><p className="text-xs font-bold">{sec(s.bestSec)}</p></div>
              <div className="space-y-1"><span className="text-[10px] text-slate-600">میانگین TPS</span><p className="text-xs font-bold">{s.avgTps != null ? faDigits(s.avgTps) + ' حرکت/ثانیه' : 'دادهٔ کافی نیست'}</p></div>
              <div className="space-y-1"><span className="text-[10px] text-slate-600">فیلتر تحلیل</span><p className="text-xs font-bold">آمار جلسه + خطاهای ثبت‌شدهٔ کیس ({fa(s.caseErrors.length)})</p></div>
            </div>
            <details className="mt-4"><summary className="text-[10px] text-slate-400 cursor-pointer">مشاهدهٔ دقیق دادهٔ ارسالی</summary><pre className="text-[10px] text-slate-400 mt-2 bg-black/30 p-3 rounded-xl overflow-auto max-h-60" dir="ltr">{JSON.stringify(s, null, 1)}</pre></details>
            <p className="mt-6 text-[10px] text-slate-500 italic">توجه: تاریخچه کامل و تمام حرکت‌های زنده ارسال نمی‌شود؛ فقط خلاصه عملکردی برای تحلیل آماده است.</p>
          </div>
        </section>
        <AiAnswer q={a.q} />
        <section className="bg-slate-800/20 border border-slate-800 rounded-3xl p-8 space-y-6">
          <h3 className="font-bold text-sm">پرسش درباره این جلسه</h3>
          <div className="relative">
            <input type="text" value={a.question} onChange={(e) => a.setQuestion(e.target.value)} maxLength={300} placeholder="مثلاً: برای کیس‌هایی که خطا داشتم چه تمرینی انجام بدهم؟"
              className="w-full bg-slate-900 border border-slate-700 rounded-2xl py-4 pr-6 pl-16 text-sm focus:outline-none focus:border-accent-purple transition-all" aria-label="پرسش درباره این جلسه" />
            <button className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-accent-purple rounded-xl text-white flex items-center justify-center hover:scale-105 transition-all disabled:opacity-40" aria-label="ارسال پرسش"
              disabled={!a.question.trim() || a.ask.state.status === 'running'} onClick={() => a.ask.run('session', { ...s, question: a.question.trim() })}><i className="fa-solid fa-paper-plane"></i></button>
          </div>
          <div className="flex gap-2">{suggestions.map((t) => <button key={t} className="text-[10px] bg-slate-800 px-3 py-1.5 rounded-lg text-slate-400 hover:text-white border border-slate-700" onClick={() => a.setQuestion(t)}>{t}</button>)}</div>
          <AiAnswer q={a.ask} />
        </section>
        <footer className="flex flex-col md:flex-row justify-between items-center gap-6 pt-12 border-t border-slate-800 opacity-70">
          <div className="flex gap-6 text-[10px] text-slate-500 font-bold">
            <div className="flex items-center gap-2"><span>مدل:</span><span className="text-slate-300" dir="ltr">{a.aiStatus.model}</span></div>
            <div className="flex items-center gap-2"><span>بودجه ماهانه:</span><span className="text-slate-300" dir="ltr">${a.aiStatus.limits?.monthlyUsd}</span></div>
          </div>
          <p className="text-[10px] text-slate-600">درخواست از سرور احراز هویت‌شده ارسال می‌شود؛ کلید در مرورگر قرار ندارد.</p>
        </footer>
      </main>
    </>
  );
}

function Mobile({ route }) {
  const a = useAnalysis(route);
  if (!a.session) return <div className="mob"><MobileHeader title="تحلیل هوشمند جلسه" back="#/stats" /><main className="mt-20 px-4 text-secondary">جلسه‌ای برای تحلیل پیدا نشد.</main><MobileNav route="stats" /></div>;
  const s = a.summary;
  const box = (l, v) => <div className="flex justify-between cyber-panel p-2 rounded-lg bg-black/20"><span className="text-secondary">{l}:</span><span className="text-white">{v}</span></div>;
  return (
    <div className="mob">
      <MobileHeader title="تحلیل هوشمند جلسه" back="#/stats" icon={<i className="fa-solid fa-wand-magic-sparkles text-cyan"></i>} />
      <main className="mt-16 px-4 space-y-6 pb-10">
        <section id="data-summary" className="cyber-panel p-4 rounded-xl space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="text-[10px] text-secondary uppercase tracking-widest">خلاصه داده‌های ارسالی</h3>
            <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-secondary italic">فقط خلاصهٔ مرتبط ارسال می‌شود</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {box('تعداد حل', fa(s.solves) + ' مورد')}
            {box('خطاهای تمرین', fa(s.caseErrors.reduce((x, c) => x + c.errors, 0)) + ' مورد')}
            {box('بهترین زمان', sec(s.bestSec))}
            {box('جلسه', a.session.name)}
          </div>
          <p className="text-[9px] text-secondary italic mt-1 pr-1">حرکات زنده یا تاریخچه کامل ارسال نمی‌شود.</p>
        </section>
        <button className="w-full py-3 px-4 rounded-xl bg-accent-purple text-white text-sm font-bold disabled:opacity-40" disabled={a.q.state.status === 'running' || !s.solves} onClick={() => a.q.run('session', s)}>درخواست تحلیل خلاصه</button>
        <section id="ai-chat" className="space-y-4">
          <AiAnswer q={a.q} mobile />
          <div className="space-y-2">
            <div className="text-[10px] text-secondary pr-1">سوالات پیشنهادی:</div>
            <div className="flex flex-wrap gap-2">
              {['چگونه زمان Cross را کم کنم؟', 'برای خطاهای همین کیس چه تمرینی مناسب است؟'].map((t) => <button key={t} className="px-3 py-1.5 rounded-full cyber-panel text-[10px] text-secondary" onClick={() => a.setQuestion(t)}>{t}</button>)}
            </div>
          </div>
          <div className="relative">
            <textarea value={a.question} onChange={(e) => a.setQuestion(e.target.value)} maxLength={300} placeholder="سوال زمینه‌ای خود را بپرسید..." className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-xs h-24 focus:outline-none resize-none" aria-label="سوال زمینه‌ای" />
            <button className="absolute bottom-3 left-3 bg-cyan text-black px-4 py-1.5 rounded-xl text-[10px] font-bold disabled:opacity-40" disabled={!a.question.trim() || a.ask.state.status === 'running'} onClick={() => a.ask.run('session', { ...s, question: a.question.trim() })}>ارسال</button>
          </div>
          <AiAnswer q={a.ask} mobile />
        </section>
      </main>
      <MobileNav route="stats" />
    </div>
  );
}

export default function Analysis({ mobile, route }) {
  return mobile ? <Mobile route={route} /> : <Desktop route={route} />;
}
