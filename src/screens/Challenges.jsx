import { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { ALGORITHMS, ALGORITHM_BY_ID } from '../data/algorithms.mjs';
import { caseRecognitionQuiz } from '../core/cases.mjs';
import IsoCube from '../components/IsoCube.jsx';
import { Modal } from '../components/ui.jsx';
import { fa } from '../app/format.js';
import { CHALLENGE_TYPES, challengeProgress } from '../app/challenges.js';
import { weakCases } from '../app/learning.js';
import { PageFooter, MobileHeader, MobileNav } from '../layout/Shell.jsx';
import { navigate } from '../app/router.js';

const DRILLS = [
  { id: 'cross', name: 'صلیب (Cross)', chip: 'کراس', sub: 'ساخت کراس سفید در پایین؛ مقایسه با کمترین تعداد حرکت', tags: ['بهینه‌سازی حرکت', 'برنامه‌ریزی'] },
  { id: 'f2l', name: 'F2L (لایه اول و دوم)', chip: 'F2L', sub: 'کیس‌های پایهٔ F2L شهودی، اسلات جلو-راست', tags: ['جفت‌سازی', 'درج'] },
  { id: 'oll2', name: 'OLL (جهت‌دهی)', chip: 'OLL', sub: 'OLL دومرحله‌ای: لبه‌ها سپس گوشه‌ها', tags: ['تشخیص کیس', 'الگوریتم'] },
  { id: 'pll2', name: 'PLL (جایگشت)', chip: 'PLL', sub: 'PLL دومرحله‌ای: گوشه‌ها سپس لبه‌ها', tags: ['تشخیص کیس', 'الگوریتم'] },
  { id: 'favorites', name: 'الگوریتم انتخابی', chip: 'علاقه‌مندی‌ها', sub: 'الگوریتم‌هایی که در کتابخانه ستاره زده‌ای', tags: ['انتخاب شخصی'], icon: 'fa-star' },
  { id: 'current', name: 'روش فعلی', chip: 'روش فعلی', sub: 'الگوریتم‌های روش مبتدی که الان استفاده می‌کنی', tags: ['روش فعلی'] },
];
const QUIZ_SETS = [['oll2', 'OLL'], ['pll2', 'PLL'], ['f2l', 'F2L']];

function useChallengesModel() {
  const app = useApp();
  const { data, settings, actions, currentSessionId } = app;
  const [sel, setSel] = useState('cross');
  const [accuracy, setAccuracy] = useState(false);
  const drill = DRILLS.find((d) => d.id === sel);
  const weak = weakCases(data.progress);
  const challenges = data.challenges.filter((c) => !c.archived).map((c) => {
    const progress = challengeProgress(c, { data, currentSessionId });
    return { ...c, progress, done: progress >= c.target };
  });
  const [goalSec, setGoalSec] = useState('');
  const start = () => {
    const q = new URLSearchParams();
    if (accuracy) q.set('hint', '0');
    const g = Number(String(goalSec).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    if (g > 0 && g < 600) q.set('goal', String(g));
    navigate('drill/' + sel + (q.toString() ? '?' + q : ''));
  };
  const disabled = sel === 'favorites' && data.favorites.length === 0;
  return { app, data, settings, actions, sel, setSel, drill, weak, challenges, start, disabled, accuracy, setAccuracy, goalSec, setGoalSec };
}

function useQuiz() {
  const [set, setSet] = useState('oll2');
  const [n, setN] = useState(0);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [picked, setPicked] = useState(null);
  const q = useMemo(() => caseRecognitionQuiz(ALGORITHMS.filter((a) => a.category === set), Math.random, { count: 3 }), [set, n]);
  const answer = (id) => {
    if (picked) return;
    setPicked(id);
    setScore((s) => ({ ok: s.ok + (id === q.correctId ? 1 : 0), total: s.total + 1 }));
  };
  const nextQ = () => { setPicked(null); setN(n + 1); };
  return { set, setSet: (v) => { setSet(v); setPicked(null); setN(n + 1); }, q, picked, answer, nextQ, score };
}

function QuizBody({ z, mobile }) {
  const mask = z.q.maskType === 'oll' ? 'oll' : z.q.maskType === 'pll' ? 'll' : null;
  const correct = ALGORITHM_BY_ID[z.q.correctId];
  return (
    <div className={mobile ? 'cyber-panel p-5 rounded-2xl space-y-6 text-center' : 'bg-slate-800/40 border border-slate-700 p-6 rounded-2xl space-y-5 text-center'}>
      <div className="flex justify-center gap-2">
        {QUIZ_SETS.map(([id, l]) => <button key={id} onClick={() => z.setSet(id)} aria-pressed={z.set === id} className={'px-3 py-1 rounded-full text-[10px] ' + (z.set === id ? 'bg-cyan-400 text-black font-bold' : 'bg-white/5 text-slate-400')}>{l}</button>)}
      </div>
      <div className="text-[10px] text-secondary uppercase tracking-widest">کدام الگوریتم برای این کیس است؟ (زرد بالا)</div>
      <div className="w-40 h-40 mx-auto flex justify-center"><IsoCube facelets={z.q.facelets} frame="yellowUp" mask={mask} size={160} label="کیس پرسش" /></div>
      <div className="grid grid-cols-1 gap-3">
        {z.q.options.map((o) => {
          const isRight = z.picked && o.id === z.q.correctId;
          const isWrong = z.picked === o.id && o.id !== z.q.correctId;
          return (
            <button key={o.id} onClick={() => z.answer(o.id)} disabled={!!z.picked}
              className={'w-full py-3 rounded-xl text-xs flex items-center justify-center gap-2 ' + (isRight ? 'bg-green-500/10 border border-green-500/50 text-green-400' : isWrong ? 'bg-red-500/10 border border-red-500/50 text-red-400' : 'cyber-panel hover:border-cyan-400 border-white/5')}>
              {isRight && <i className="fa-solid fa-check"></i>}{isWrong && <i className="fa-solid fa-xmark"></i>}
              {o.name}{ALGORITHM_BY_ID[o.id]?.nameEn !== o.name && <span dir="ltr">({ALGORITHM_BY_ID[o.id]?.nameEn})</span>}
            </button>
          );
        })}
      </div>
      {z.picked && (
        <div className="text-right text-xs text-slate-300 space-y-1">
          <p>{z.picked === z.q.correctId ? 'درست!' : 'پاسخ درست: ' + correct?.name}</p>
          {correct?.recognition && <p className="text-[11px] text-slate-400">نشانهٔ تشخیص: {correct.recognition}</p>}
          <p className="text-[11px]" dir="ltr"><code className="move-font text-cyan-300">{correct?.alg}</code></p>
        </div>
      )}
      <div className="flex justify-between items-center pt-2">
        <span className="text-[10px] text-secondary">امتیاز: {fa(z.score.ok)}/{fa(z.score.total)}</span>
        <button className="text-[10px] text-cyan underline min-h-0" onClick={z.nextQ}>{z.picked ? 'سؤال بعد' : 'عبور از سؤال'}</button>
      </div>
    </div>
  );
}

function ChallengeCards({ m, mobile }) {
  const [adding, setAdding] = useState(false);
  const colors = { yellow: 'bg-yellow-500/10 text-yellow-500', blue: 'bg-blue-500/10 text-blue-500', cyan: 'bg-cyan-500/10 text-cyan-400', purple: 'bg-purple-500/10 text-purple-400' };
  const bar = { yellow: 'bg-yellow-500', blue: 'bg-blue-500', cyan: 'bg-cyan-400', purple: 'bg-purple-500' };
  return (
    <>
      {m.challenges.length === 0 && <p className="text-xs text-slate-500 mb-4">هنوز چالشی تعریف نکرده‌ای. چالش‌ها فقط با داده‌های واقعی تمرین پیش می‌روند.</p>}
      <div className={mobile ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-6'}>
        {m.challenges.map((c) => {
          const t = CHALLENGE_TYPES[c.type];
          const p = Math.min(1, c.progress / c.target);
          return (
            <div key={c.id} className={mobile ? 'cyber-panel p-4 rounded-xl' : 'challenge-card bg-slate-800/40 border border-slate-700 p-6 rounded-2xl flex items-start gap-5'}>
              {!mobile && <div className={'w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 ' + colors[t.color]}><i className={'fa-solid ' + (c.done ? 'fa-check' : t.icon)}></i></div>}
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold mb-1 text-sm">{t.label}</h4>
                  <button className="text-[10px] text-slate-500 min-h-0" onClick={() => m.actions.putChallenge({ ...c, archived: true })} aria-label="بایگانی چالش">بایگانی</button>
                </div>
                <p className="text-xs text-slate-500 mb-4">{t.describe(c)}</p>
                {mobile ? (
                  <div className="flex gap-1" aria-label={'پیشرفت ' + fa(c.progress) + ' از ' + fa(c.target)}>
                    {Array.from({ length: Math.min(c.target, 20) }, (_, i) => <div key={i} className={'w-2 h-6 rounded-full ' + (i < Math.round(p * Math.min(c.target, 20)) ? 'bg-cyan' : 'bg-white/5')}></div>)}
                  </div>
                ) : (
                  <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden"><div className={'h-full ' + bar[t.color]} style={{ width: p * 100 + '%' }}></div></div>
                )}
                <div className="flex justify-between mt-2 text-[10px] text-slate-500">
                  <span>{fa(Math.min(c.progress, c.target))}/{fa(c.target)} انجام شده</span>
                  <span className={c.done ? 'text-green-400' : ''}>{c.done ? 'کامل شد' : 'در حال اجرا'}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button className="mt-4 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-sm font-medium" onClick={() => setAdding(true)}><i className="fa-solid fa-plus ml-1"></i>چالش تازه</button>
      <NewChallenge m={m} open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function NewChallenge({ m, open, onClose }) {
  const [type, setType] = useState('streak');
  const [target, setTarget] = useState(5);
  const [algId, setAlgId] = useState(m.weak[0]?.id || 'oll-sune');
  const save = async () => {
    const now = Date.now();
    await m.actions.putChallenge({ id: crypto.randomUUID(), type, target: Math.max(1, Math.min(100, Number(target) || 1)), algId: type === 'streak' ? algId : null, createdAt: new Date(now).toISOString(), createdAtMs: now, archived: false });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="چالش شخصی تازه">
      <div className="space-y-4 text-sm">
        <label className="block">نوع
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 mt-1">
            {Object.entries(CHALLENGE_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
        </label>
        {type === 'streak' && (
          <label className="block">الگوریتم
            <select value={algId} onChange={(e) => setAlgId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 mt-1">
              {ALGORITHMS.filter((a) => a.alg && !a.later).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.nameEn}</option>)}
            </select>
          </label>
        )}
        <label className="block">هدف (عدد)
          <input type="number" min={1} max={100} value={target} onChange={(e) => setTarget(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 mt-1" />
        </label>
        <p className="text-[11px] text-slate-400">{CHALLENGE_TYPES[type].describe({ target, algId, type })}. پیشرفت فقط از داده‌های ثبت‌شده محاسبه می‌شود.</p>
        <button className="w-full bg-cyan-400 text-slate-900 font-bold py-3 rounded-xl" onClick={save}>ساخت چالش</button>
      </div>
    </Modal>
  );
}

function DrillConfig({ m, mobile }) {
  const s = m.settings, set = m.actions.saveSettings;
  return (
    <>
      <div>
        <label className="block text-sm font-bold mb-3">سختی تمرین</label>
        <div className="grid grid-cols-3 gap-2">
          {[['easy', 'آسان'], ['medium', 'متوسط'], ['hard', 'حرفه‌ای']].map(([k, l]) => (
            <button key={k} onClick={() => set({ drillDifficulty: k })} aria-pressed={s.drillDifficulty === k}
              className={'py-2 rounded-lg text-xs ' + (s.drillDifficulty === k ? 'bg-accent-cyan text-slate-900 font-bold' : 'bg-slate-900 border border-slate-700 hover:border-cyan-400')}>{l}</button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 mt-2">{m.sel === 'cross' ? 'آسان: ۲ تا ۴ حرکت · متوسط: ۵ تا ۶ · حرفه‌ای: ۷ تا ۸ حرکت بهینه' : 'آسان: کیس ثابت · متوسط: چرخش تصادفی لایهٔ بالا · حرفه‌ای: قطعه‌های دیگر لایهٔ آخر هم تصادفی'}</p>
      </div>
      <div>
        <label className="block text-sm font-bold mb-3" htmlFor="reps">تعداد تکرار</label>
        <input id="reps" type="range" min={5} max={50} value={s.drillRepetitions} onChange={(e) => set({ drillRepetitions: Number(e.target.value) })} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer" style={{ accentColor: '#22d3ee' }} />
        <div className="flex justify-between mt-2 text-[10px] text-slate-500">
          <span>۵ تکرار</span><span className="text-accent-cyan font-bold">جلسه {fa(s.drillRepetitions)} تکراری</span><span>۵۰ تکرار</span>
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={m.accuracy} onChange={(e) => m.setAccuracy(e.target.checked)} />تمرین دقت: راهنمای حرکت بعد در این جلسه پنهان باشد</label>
      <label className="block text-xs">هدف زمانی دلخواه برای هر اجرا (ثانیه، اختیاری)
        <input inputMode="decimal" value={m.goalSec} onChange={(e) => m.setGoalSec(e.target.value)} placeholder="خالی: بدون هدف زمانی" className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg py-2 px-3 text-xs" />
      </label>
    </>
  );
}

function Desktop() {
  const m = useChallengesModel();
  const z = useQuiz();
  return (
    <main className="pt-8 pb-12 px-8 max-w-7xl mx-auto w-full">
      <header className="mb-12">
        <h1 className="text-3xl font-bold mb-2">تمرین هدفمند</h1>
        <p className="text-slate-400">تمرکز بر بخش‌های خاص حل برای کاهش زمان و افزایش دقت</p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <h3 className="font-bold mb-4 text-sm">انتخاب مرحله</h3>
            <div className="space-y-2">
              {DRILLS.map((d) => (
                <button key={d.id} onClick={() => m.setSel(d.id)} aria-pressed={m.sel === d.id}
                  className={'w-full flex justify-between items-center px-4 py-3 rounded-xl transition-all ' + (m.sel === d.id ? 'bg-accent-cyan text-slate-900 font-bold' : 'hover:bg-slate-700 text-slate-400')}>
                  <span>{d.name}</span><i className={'fa-solid ' + (d.icon || 'fa-chevron-left') + ' text-sm ' + (m.sel === d.id ? 'opacity-50' : 'opacity-20')}></i>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-accent-purple/10 border border-accent-purple/20 p-6 rounded-2xl">
            <h3 className="font-bold mb-4 text-sm accent-purple">مرور ضعیف‌ها</h3>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">{m.weak.length ? 'تمرین ' + fa(m.weak.length) + ' کیسی که در اجراهای اخیر بیشترین خطای ثبت‌شده را داشته‌اند.' : 'هنوز خطای ثبت‌شده‌ای نیست؛ پس از چند تمرین، کیس‌های ضعیف اینجا می‌آیند.'}</p>
            <button className="w-full bg-accent-purple text-white py-3 rounded-xl font-bold hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-40" disabled={!m.weak.length} onClick={() => navigate('drill/weak')}>شروع مرور</button>
          </div>
        </div>
        <div className="lg:col-span-3 space-y-8">
          <section className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
              <div>
                <h2 className="text-xl font-bold mb-1">تنظیمات تمرین: {m.drill.name}</h2>
                <p className="text-xs text-slate-500">{m.drill.sub}</p>
              </div>
              <div className="flex gap-2">{m.drill.tags.map((t) => <span key={t} className="bg-slate-700 px-3 py-1 rounded-full text-[10px] text-slate-300">{t}</span>)}</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              <div className="space-y-6"><DrillConfig m={m} /></div>
              <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800">
                <h4 className="text-xs font-bold text-slate-500 mb-4 uppercase">هدف جلسه</h4>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-accent-cyan"></div><span className="text-xs text-slate-300">{fa(m.settings.drillRepetitions)} اجرا؛ دقت اجرا با روبیک متصل ثبت می‌شود.</span></li>
                  {m.sel === 'cross' && <li className="flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-accent-cyan"></div><span className="text-xs text-slate-300">کاهش حرکت: تعداد حرکت تو با کمترین حرکت ممکن مقایسه می‌شود.</span></li>}
                  <li className="flex items-center gap-3 text-slate-500"><div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div><span className="text-xs">{m.settings.goalMs ? 'هدف زمانی حل کامل در تنظیمات تعیین شده است.' : 'هدف زمانی تعیین نشده است'}</span></li>
                </ul>
              </div>
            </div>
            <button className="w-full bg-accent-cyan text-slate-900 py-4 rounded-2xl font-bold text-lg hover:shadow-xl hover:shadow-cyan-500/20 transition-all disabled:opacity-40" disabled={m.disabled} onClick={m.start}>
              {m.disabled ? 'ابتدا در کتابخانه الگوریتمی را ستاره بزن' : 'شروع تمرین اختصاصی'}
            </button>
          </section>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            <section>
              <h3 className="text-xl font-bold mb-6">چالش‌های شخصی</h3>
              <ChallengeCards m={m} />
            </section>
            <section>
              <h3 className="text-xl font-bold mb-6">تشخیص کیس</h3>
              <QuizBody z={z} />
            </section>
          </div>
        </div>
      </div>
      <PageFooter start={<><span className="text-xs bg-slate-800 px-2 py-1 rounded">چالش‌های فعال: {fa(m.challenges.filter((c) => !c.done).length)}</span></>} links={[['#/stats', 'مشاهدهٔ روند تمرین'], ['#/library', 'کتابخانه']]} />
    </main>
  );
}

function Mobile() {
  const m = useChallengesModel();
  const z = useQuiz();
  const chip = (on) => 'chip' + (on ? ' chip-active' : '');
  return (
    <div className="mob">
      <MobileHeader title="چالش‌ها و تمرین هدفمند" end={<i className="fa-solid fa-trophy text-cyan"></i>} />
      <main className="mt-16 px-4 space-y-8">
        <section id="drill-selection" className="space-y-4">
          <h2 className="text-sm font-bold border-r-2 border-cyan pr-2">نوع تمرین هدفمند</h2>
          <div className="flex flex-wrap gap-2">
            {DRILLS.map((d) => <button key={d.id} className={chip(m.sel === d.id)} aria-pressed={m.sel === d.id} onClick={() => m.setSel(d.id)}>{d.chip}</button>)}
            <a href="#quiz-section" className={chip(false)}>تشخیص کیس</a>
            <button className={chip(m.accuracy)} aria-pressed={m.accuracy} onClick={() => m.setAccuracy(!m.accuracy)}>دقت حرکت</button>
            <button className={chip(false)} onClick={() => m.setSel('cross')}>کاهش تعداد حرکت</button>
          </div>
          <div className="cyber-panel p-4 rounded-2xl space-y-4">
            <p className="text-[11px] text-secondary">{m.drill.sub}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-secondary" htmlFor="m-diff">سختی</label>
                <select id="m-diff" value={m.settings.drillDifficulty} onChange={(e) => m.actions.saveSettings({ drillDifficulty: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-2 text-xs">
                  <option value="easy">آسان</option><option value="medium">متوسط</option><option value="hard">حرفه‌ای</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-secondary" htmlFor="m-reps">تعداد تکرار</label>
                <input id="m-reps" type="number" min={1} max={50} value={m.settings.drillRepetitions} onChange={(e) => m.actions.saveSettings({ drillRepetitions: Math.max(1, Math.min(50, Number(e.target.value) || 10)) })} className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-2 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-secondary" htmlFor="m-goal">هدف زمانی دلخواه برای هر اجرا (ثانیه، اختیاری)</label>
              <input id="m-goal" inputMode="decimal" value={m.goalSec} onChange={(e) => m.setGoalSec(e.target.value)} placeholder="خالی (بدون محدودیت زمانی اجباری)" className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-xs italic" />
            </div>
            <button className="w-full py-3 bg-cyan text-black font-bold rounded-xl text-sm shadow-[0_0_20px_rgba(34,211,238,0.3)] disabled:opacity-40" disabled={m.disabled} onClick={m.start}>آغاز تمرین</button>
            {m.weak.length > 0 && <button className="w-full py-3 rounded-xl border border-purple-500/40 text-purple-300 text-sm" onClick={() => navigate('drill/weak')}>مرور کیس‌های دارای خطا ({fa(m.weak.length)})</button>}
          </div>
        </section>
        <section id="quiz-section" className="space-y-4">
          <h2 className="text-sm font-bold border-r-2 border-purple-500 pr-2">پرسش تشخیص کیس (Quiz)</h2>
          <QuizBody z={z} mobile />
        </section>
        <section id="challenge-streak" className="space-y-4 pb-4">
          <h2 className="text-sm font-bold border-r-2 border-green-500 pr-2">چالش‌های شخصی</h2>
          <ChallengeCards m={m} mobile />
        </section>
      </main>
      <MobileNav route="challenges" />
    </div>
  );
}

export default function Challenges({ mobile }) {
  return mobile ? <Mobile /> : <Desktop />;
}
