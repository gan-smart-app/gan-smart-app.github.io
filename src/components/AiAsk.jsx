import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';

// Optional Claude answer box. Renders nothing unless the server reports a
// configured key; requests are manual, de-duplicated and cached by the client.
export function useAiRequest() {
  const { ai, aiEnabled, refreshAi } = useApp();
  const [state, setState] = useState({ status: 'idle' });
  const run = async (type, payload, detail = 'short') => {
    if (!aiEnabled || state.status === 'running') return;
    setState({ status: 'running' });
    try {
      const res = await ai.analyze({ type, payload, detail });
      setState({ status: 'done', res });
      if (!res.cached) refreshAi();
    } catch (e) {
      setState({ status: e.code === 'cancelled' ? 'idle' : 'error', error: e });
    }
  };
  const cancel = () => ai?.cancelAll();
  return { state, run, cancel, enabled: aiEnabled };
}

const ERROR_HINT = {
  invalid_key: 'کلید روی سرور را بررسی کن (تنظیمات › هوشواره).',
  daily_requests: 'سقف درخواست امروز پر شده است.', monthly_requests: 'سقف درخواست ماه پر شده است.',
  daily_budget: 'بودجهٔ روزانه کافی نیست.', monthly_budget: 'بودجهٔ ماهانه کافی نیست.',
};

export function AiAnswer({ q, mobile }) {
  const s = q.state;
  if (s.status === 'running') {
    return (
      <div className="cyber-panel p-4 rounded-xl flex items-center justify-between" role="status">
        <div className="flex items-center gap-3"><i className="fa-solid fa-circle-notch fa-spin text-cyan-300 text-sm"></i><span className="text-xs">در حال پردازش در سرور…</span></div>
        <button className="text-[10px] text-red-400" onClick={q.cancel}>لغو</button>
      </div>
    );
  }
  if (s.status === 'error') {
    return (
      <div className="cyber-panel p-4 rounded-xl border-red-500/30 bg-red-500/5 space-y-2" role="alert">
        <div className="text-xs font-bold text-red-400">درخواست اجرا نشد</div>
        <p className="text-[11px] text-slate-300">{s.error?.message} {ERROR_HINT[s.error?.code] || ''}</p>
        <p className="text-[10px] text-slate-500">تمرین، ذخیرهٔ رکورد و همگام‌سازی ادامه دارند. تلاش دوباره فقط با انتخاب خودت انجام می‌شود.</p>
      </div>
    );
  }
  if (s.status !== 'done') return null;
  const r = s.res.result || {};
  return (
    <div className={(mobile ? 'p-4 rounded-2xl' : 'bg-slate-800/40 border border-slate-700 rounded-3xl p-8') + ' space-y-4 leading-relaxed'} style={mobile ? { background: 'rgba(34,211,238,.05)', border: '1px solid rgba(34,211,238,.2)' } : undefined}>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-accent-purple/20 rounded-lg flex items-center justify-center text-accent-purple text-[10px]"><i className="fa-solid fa-wand-magic-sparkles"></i></div>
        <span className="text-xs font-bold text-purple-300">پاسخ هوشواره</span>
        {s.res.cached && <span className="text-[9px] text-slate-500 mr-auto"><i className="fa-solid fa-database ml-1"></i>پاسخ ذخیره‌شده؛ درخواست تازه ارسال نشد</span>}
      </div>
      {r.summary && <p className="text-sm text-slate-300">{r.summary}</p>}
      {r.points?.length > 0 && (
        <div className="space-y-3">
          {r.points.map((p, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 bg-accent-cyan/10 rounded flex items-center justify-center text-accent-cyan text-[10px] font-bold mt-1 shrink-0">{(i + 1).toLocaleString('fa-IR')}</div>
              <p className="text-sm text-slate-400">{p}</p>
            </div>
          ))}
        </div>
      )}
      {r.suggestions?.length > 0 && (
        <div className="bg-accent-purple/5 border border-accent-purple/20 p-4 rounded-2xl">
          <h4 className="font-bold text-xs accent-purple mb-2">پیشنهاد تمرین:</h4>
          {r.suggestions.map((x, i) => <p key={i} className="text-xs text-slate-400">• {x}</p>)}
        </div>
      )}
      {r.algorithms?.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-[10px] text-amber-300">توالی‌های پیشنهادی مدل (بررسی‌نشده؛ فقط نمادشان معتبر است و به‌صورت تعاملی استفاده نمی‌شوند):</h4>
          {r.algorithms.map((a, i) => <p key={i} className="text-xs text-slate-400">{a.name}: <code dir="ltr" className="move-font">{a.moves}</code> {a.note}</p>)}
        </div>
      )}
      {s.res.usage && (
        <p className="text-[10px] text-slate-500">مصرف همین پاسخ: ورودی {s.res.usage.input}، خروجی {s.res.usage.output}، خواندن کش {s.res.usage.cacheRead}، نوشتن کش {s.res.usage.cacheWrite} توکن{s.res.estimatedCostUsd != null ? ' · تخمین $' + Number(s.res.estimatedCostUsd).toFixed(4) : ''} · هزینهٔ تخمینی بر اساس تعرفهٔ سرور، صورتحساب قطعی نیست.</p>
      )}
    </div>
  );
}

// Small inline question box for a lesson or a solve.
export function AiAskBox({ type, payload, title = 'پرسش از هوشواره' }) {
  const q = useAiRequest();
  const [text, setText] = useState('');
  useEffect(() => setText(''), [payload?.lessonId, payload?.solveId]);
  if (!q.enabled) return null;
  return (
    <section className="bg-slate-800/20 border border-slate-800 rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-xs text-purple-300">{title}</h3>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="سؤالت دربارهٔ همین مورد…" className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs min-h-[44px]" aria-label="پرسش" />
        <button className="px-4 rounded-xl bg-accent-purple text-white text-xs font-bold disabled:opacity-40 min-h-[44px]" disabled={!text.trim() || q.state.status === 'running'} onClick={() => q.run(type, { ...payload, question: text.trim() })}>ارسال</button>
      </div>
      <p className="text-[10px] text-slate-500">فقط اطلاعات لازم همین مورد فرستاده می‌شود.</p>
      <AiAnswer q={q} mobile />
    </section>
  );
}
