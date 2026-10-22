import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { exportBackup, backupFileName, previewImport, applyImport } from '../core/backup.mjs';
import { FRAMES } from '../core/cube.mjs';
import { download, Modal } from '../components/ui.jsx';
import { ago, fa, faDigits, msText, resultText, dateFa } from '../app/format.js';
import { MobileHeader, MobileNav, syncView } from '../layout/Shell.jsx';

function Toggle({ on, onChange, label, disabled }) {
  // The pill keeps the design size; the button around it is a full touch target.
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className="relative inline-flex items-center justify-center w-12 h-11 shrink-0 disabled:opacity-40">
      <span className={'w-12 h-6 rounded-full relative block transition-colors ' + (on ? 'bg-accent-cyan' : 'bg-slate-800 border border-slate-700')}>
        <span className={'w-4 h-4 rounded-full absolute top-1 transition-all ' + (on ? 'bg-slate-900 left-1' : 'bg-slate-500 right-1')}></span>
      </span>
    </button>
  );
}

function parseGoal(text) {
  const t = faToEn(text.trim());
  if (!t) return null;
  const m = t.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!m) return undefined;
  const ms = Math.round(((Number(m[1] || 0) * 60) + Number(m[2])) * 1000);
  return ms > 0 && ms < 3600000 ? ms : undefined;
}
const faToEn = (s) => s.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٫٬]/g, '.');

function useSettingsModel() {
  const app = useApp();
  const { settings, actions, auth, authState, sync, syncStatus, store, data } = app;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [goalText, setGoalText] = useState(settings.goalMs ? msText(settings.goalMs) : '');
  const [goalError, setGoalError] = useState('');
  const [preview, setPreview] = useState(null);
  const [importError, setImportError] = useState('');
  const [importDone, setImportDone] = useState('');
  const [conflictMode, setConflictMode] = useState('skip');
  const [conflictView, setConflictView] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => setGoalText(settings.goalMs ? msText(settings.goalMs) : ''), [settings.goalMs]);

  const signIn = async (e) => {
    e.preventDefault();
    try {
      await auth.signIn(email.trim(), password);
      setPassword('');
      sync.syncNow?.();
    } catch {
      /* message is in authState.error */
    }
  };
  const saveGoal = () => {
    const v = parseGoal(goalText);
    if (v === undefined) return setGoalError('قالب درست نیست؛ مثلاً 35 یا 1:05.5');
    setGoalError('');
    actions.saveSettings({ goalMs: v });
  };
  const doExport = async () => download(backupFileName(), await exportBackup(store));
  const pickFile = async (file) => {
    setImportError(''); setImportDone(''); setPreview(null);
    try {
      const json = JSON.parse(await file.text());
      setPreview(await previewImport(store, json));
    } catch (e) {
      setImportError(e instanceof SyntaxError ? 'این فایل JSON معتبر نیست؛ داده‌های فعلی شما تغییر نکرده‌اند.' : e.message || 'ساختار این فایل قابل ورود نیست؛ داده‌های فعلی شما تغییر نکرده‌اند.');
    }
  };
  const confirmImport = async () => {
    const res = await applyImport(store, preview, { conflicting: conflictMode });
    setPreview(null);
    setImportDone('ورود انجام شد: ' + fa(res?.written ?? res?.imported ?? 0) + ' مورد در صف همگام‌سازی قرار گرفت.');
  };
  return { app, settings, actions, auth, authState, sync, syncStatus, store, data, email, setEmail, password, setPassword, signIn, goalText, setGoalText, goalError, saveGoal, preview, setPreview, importError, importDone, pickFile, confirmImport, conflictMode, setConflictMode, fileRef, doExport, conflictView, setConflictView };
}

function previewCounts(p) {
  const n = (k) => (Array.isArray(p?.[k]) ? p[k].length : p?.counts?.[k] ?? p?.[k] ?? 0);
  return { fresh: n('new'), duplicate: n('duplicate'), conflicting: n('conflicting'), invalid: n('invalid'), tombstoned: n('tombstoned') };
}

// ---------- sections shared by both layouts ----------
function AccountBody({ m, mobile }) {
  const a = m.authState;
  const sv = syncView(m.syncStatus);
  if (a.status === 'unconfigured') {
    return (
      <div className={mobile ? 'cyber-panel p-4 rounded-2xl space-y-2' : 'p-6 bg-slate-800/50 border border-slate-700 rounded-3xl space-y-2'}>
        <h3 className="font-bold">ذخیرهٔ محلی · حساب ابری هنوز پیکربندی نشده</h3>
        <p className="text-xs text-slate-400 leading-6">همهٔ تمرین‌ها در همین مرورگر ذخیره می‌شوند. برای همگام‌سازی بین مک و اندروید، پروژهٔ Firebase شخصی باید ساخته و نشانی آن در نسخهٔ منتشرشده تنظیم شود (راهنما: docs/FIREBASE_SETUP_FA.md). ثبت‌نام عمومی وجود ندارد.</p>
      </div>
    );
  }
  if (a.status === 'signedIn') {
    return mobile ? (
      <div className="cyber-panel p-4 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="w-10 h-10 rounded-full border border-white/15 bg-white/5 inline-flex items-center justify-center" aria-hidden="true"><i className="fa-solid fa-user"></i></span>
          <div>
            <div className="text-sm font-bold">حساب شخصی</div>
            <div className="text-[10px] text-secondary" dir="ltr">{a.email}</div>
            <div className={'text-[10px] ' + (m.syncStatus.state === 'synced' ? 'text-green-400' : 'text-amber-300')}>{sv.text}</div>
          </div>
        </div>
        <button className="text-xs text-red-400" onClick={() => m.auth.signOut()}>خروج</button>
      </div>
    ) : (
      <div className="flex items-center gap-6 p-6 bg-slate-800/50 border border-slate-700 rounded-3xl">
        <span aria-hidden="true" className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 border border-slate-700"><i className="fa-solid fa-user"></i></span>
        <div className="flex-1">
          <h3 className="font-bold text-lg">کاربر خصوصی</h3>
          <p className="text-xs text-slate-500" dir="ltr">{a.email}</p>
          <p className="text-xs text-slate-500">{m.syncStatus.lastSyncedAt ? 'آخرین همگام‌سازی: ' + ago(m.syncStatus.lastSyncedAt) : sv.text}</p>
        </div>
        <button className="bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-all" onClick={() => m.auth.signOut()}>خروج از حساب</button>
      </div>
    );
  }
  const busy = a.status === 'signingIn';
  return (
    <form onSubmit={m.signIn} className={mobile ? 'cyber-panel p-4 rounded-2xl space-y-4' : 'p-6 bg-slate-800/50 border border-slate-700 rounded-3xl space-y-4 max-w-md'}>
      <div className="text-xs text-slate-400">ورود به حساب شخصی · فقط حساب مالک؛ ثبت‌نام عمومی وجود ندارد.</div>
      <input type="email" required autoComplete="username" placeholder="ایمیل" value={m.email} onChange={(e) => m.setEmail(e.target.value)} dir="ltr"
        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:border-accent-purple" aria-label="ایمیل" disabled={busy} />
      <input type="password" required autoComplete="current-password" placeholder="گذرواژه" value={m.password} onChange={(e) => m.setPassword(e.target.value)} dir="ltr"
        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm focus:outline-none focus:border-accent-purple" aria-label="گذرواژهٔ حساب شخصی" disabled={busy} />
      <button className={'w-full py-3 rounded-xl font-bold text-sm ' + (mobile ? 'bg-cyan-400 text-black' : 'bg-accent-purple text-white')} disabled={busy}>
        {busy ? <><i className="fa-solid fa-spinner animate-spin ml-2"></i>در حال بررسی حساب…</> : 'ورود امن'}
      </button>
      {a.error && <p className="text-center text-xs text-red-400" role="alert">{a.error}</p>}
      <p className="text-[10px] text-slate-500">تا ورود، داده‌ها فقط در همین مرورگر ذخیره می‌شوند و پس از ورود همگام می‌شوند.</p>
    </form>
  );
}

function PracticeRows({ m, rowCls, mobile }) {
  const s = m.settings, set = m.actions.saveSettings;
  const label = (t, d) => <div><p className={mobile ? 'text-xs' : 'text-sm font-bold'}>{t}</p>{d && <p className="text-[10px] text-slate-500">{d}</p>}</div>;
  return (
    <>
      <div className={rowCls}>{label('بازرسی (Inspection)', 'زمان آماده‌سازی پیش از شروع تایمر؛ تا ۲ ثانیه دیرتر +2 و پس از آن DNF')}<Toggle on={s.inspectionEnabled} onChange={(v) => set({ inspectionEnabled: v })} label="بازرسی" /></div>
      <div className={rowCls}>{label('مدت بازرسی', 'مدت دلخواه پیش از حل')}
        <div className="flex items-center gap-3">
          <input type="number" min={3} max={60} value={s.inspectionSeconds} onChange={(e) => set({ inspectionSeconds: Math.max(3, Math.min(60, Number(e.target.value) || 15)) })}
            className="w-16 input-dark bg-slate-900 border border-slate-700 rounded-lg py-1 px-3 text-center text-sm" aria-label="مدت بازرسی به ثانیه" />
          <span className="text-xs text-slate-500">ثانیه</span>
        </div>
      </div>
      <div className={rowCls}>{label('هدف زمانی (اختیاری)', s.goalMs ? 'هدف فعلی: ' + msText(s.goalMs, { persian: true }) + ' ثانیه' : 'تا زمانی تعیین نکنید، هدف زمانی فعال نیست')}
        <div className="flex items-center gap-2">
          <input type="text" placeholder="--:--" value={m.goalText} onChange={(e) => m.setGoalText(e.target.value)} onBlur={m.saveGoal} dir="ltr"
            className="w-20 bg-slate-900 border border-slate-700 rounded-lg py-1 px-3 text-center text-sm" aria-label="هدف زمانی؛ خالی یعنی بدون هدف" />
          {s.goalMs && <button className="text-[10px] text-slate-400 underline" onClick={() => { m.setGoalText(''); set({ goalMs: null }); }}>حذف</button>}
        </div>
      </div>
      {m.goalError && <p className="text-xs text-red-400" role="alert">{m.goalError}</p>}
      <div className={rowCls}>{label('راهنمای حرکت بعدی', 'در درس‌ها و تمرین الگوریتم؛ انتخاب شما ذخیره می‌شود')}<Toggle on={s.nextMoveHint} onChange={(v) => set({ nextMoveHint: v })} label="راهنمای حرکت بعدی" /></div>
      <div className={rowCls}>{label('جهت نگه‌داشتن در آموزش', 'الگوریتم‌های لایهٔ آخر برای زرد بالا نوشته شده‌اند')}
        <select value={s.holdFrame} onChange={(e) => set({ holdFrame: e.target.value })} className="bg-slate-900 border border-slate-700 rounded-lg py-1 px-2 text-sm" aria-label="جهت نگه‌داشتن">
          {Object.values(FRAMES).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>
      <div className={rowCls}>{label('سختی و تکرار تمرین هدفمند', 'پیش‌فرض تمرین‌های چالش')}
        <div className="flex items-center gap-2">
          <select value={s.drillDifficulty} onChange={(e) => set({ drillDifficulty: e.target.value })} className="bg-slate-900 border border-slate-700 rounded-lg py-1 px-2 text-sm" aria-label="سختی">
            <option value="easy">آسان</option><option value="medium">متوسط</option><option value="hard">سخت</option>
          </select>
          <input type="number" min={1} max={50} value={s.drillRepetitions} onChange={(e) => set({ drillRepetitions: Math.max(1, Math.min(50, Number(e.target.value) || 10)) })}
            className="w-16 bg-slate-900 border border-slate-700 rounded-lg py-1 px-2 text-center text-sm" aria-label="تعداد تکرار" />
        </div>
      </div>
    </>
  );
}

function DataBody({ m, mobile }) {
  const st = m.syncStatus;
  const sv = syncView(st);
  const c = m.preview && previewCounts(m.preview);
  const box = mobile ? 'cyber-panel p-4 rounded-2xl space-y-4' : 'p-6 bg-slate-800/30 rounded-2xl border border-slate-700';
  return (
    <div className="space-y-4">
      <div className={box}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-bold"><i className={'fa-solid ' + sv.icon + ' ml-2'}></i>{sv.text}{st.pending ? ' · ' + fa(st.pending) + ' تغییر در صف' : ''}</p>
            <p className="text-[10px] text-slate-500 mt-1">
              {m.authState.status !== 'signedIn' ? 'بدون ورود، داده فقط در همین مرورگر است.' : st.lastSyncedAt ? 'آخرین همگام‌سازی موفق: ' + ago(st.lastSyncedAt) : 'هنوز همگام‌سازی کامل نشده است.'}
              {st.error ? ' · ' + st.error : ''}
            </p>
          </div>
          {m.authState.status === 'signedIn' && <button className="text-xs text-cyan-300 underline" onClick={() => m.sync.syncNow()}>همگام‌سازی اکنون</button>}
        </div>
        <p className="text-[10px] text-slate-500 mt-3">رکورد، جلسه، پیشرفت آموزش، علاقه‌مندی‌ها و تنظیمات بین مک و اندروید همگام‌اند. اتصال بلوتوث و دستگاه انتخاب‌شده فقط متعلق به همین مرورگر است.</p>
      </div>

      {m.data.conflicts.length > 0 && (
        <div className={box + ' border-red-500/30'}>
          <h4 className="font-bold text-sm text-red-300 mb-2">تعارض نسخه‌ها · نیازمند رسیدگی</h4>
          <p className="text-[10px] text-slate-400 mb-3">نسخهٔ پذیرفته‌شدهٔ سرور مبنا ماند و نسخهٔ محلی متفاوت اینجا نگه داشته شد. چیزی بدون انتخاب شما حذف نمی‌شود؛ حذف‌شده‌ها خودکار بازنمی‌گردند.</p>
          <div className="space-y-2">
            {m.data.conflicts.map((cf) => (
              <div key={cf.id} className="flex items-center justify-between bg-slate-900 rounded-xl p-3 text-xs">
                <span>{kindFa(cf.kind)} · {dateFa(cf.at || cf.createdAt || new Date().toISOString())}</span>
                <button className="text-cyan-300 underline" onClick={() => m.setConflictView(cf)}>مقایسهٔ نسخه‌ها</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={mobile ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
        <div className={mobile ? '' : 'p-6 bg-slate-800/30 rounded-2xl border border-slate-700 flex flex-col justify-between'}>
          {!mobile && <div><h4 className="font-bold text-sm mb-2">خروجی JSON</h4><p className="text-[10px] text-slate-500 leading-relaxed">دریافت تاریخچهٔ حل‌ها، جلسه‌ها، پیشرفت و تنظیمات؛ بدون رمز، توکن، کلید یا شناسهٔ بلوتوث.</p></div>}
          <button className={mobile ? 'w-full py-2 bg-white/5 border border-white/10 rounded-lg text-[10px]' : 'mt-6 w-full bg-slate-700 hover:bg-slate-600 py-2 rounded-xl text-xs font-bold'} onClick={m.doExport}>
            {mobile && <i className="fa-solid fa-file-export ml-1"></i>}{mobile ? 'خروجی JSON' : 'دانلود فایل'}
          </button>
        </div>
        <div className={mobile ? '' : 'p-6 bg-slate-800/30 rounded-2xl border border-slate-700 flex flex-col justify-between'}>
          {!mobile && <div><h4 className="font-bold text-sm mb-2">ورودی JSON</h4><p className="text-[10px] text-slate-500 leading-relaxed">بازیابی داده‌ها از فایل پشتیبان قبلی، با پیش‌نمایش پیش از اعمال.</p></div>}
          <button className={mobile ? 'w-full py-2 bg-white/5 border border-white/10 rounded-lg text-[10px]' : 'mt-6 w-full border border-slate-600 hover:border-slate-500 py-2 rounded-xl text-xs font-bold'} onClick={() => m.fileRef.current?.click()}>
            {mobile && <i className="fa-solid fa-file-import ml-1"></i>}{mobile ? 'ورود داده' : 'انتخاب فایل'}
          </button>
          <input ref={m.fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) m.pickFile(f); }} />
        </div>
      </div>
      {m.importError && (
        <div className="p-6 border-2 border-dashed border-orange-500/30 rounded-2xl text-center" role="alert">
          <i className="fa-solid fa-file-circle-xmark text-3xl text-orange-400 mb-4"></i>
          <h4 className="font-bold text-xs mb-2">ساختار فایل نامعتبر است</h4>
          <p className="text-[10px] text-slate-500 mb-4">{m.importError}</p>
          <button className="text-[10px] text-accent-cyan font-bold" onClick={() => m.fileRef.current?.click()}>انتخاب فایل دیگر</button>
        </div>
      )}
      {m.importDone && <p className="text-xs text-green-400" role="status">{m.importDone}</p>}
      {c && (
        <div className={box}>
          <h4 className="font-bold text-sm mb-2">پیش‌نمایش ورود</h4>
          <p className="text-xs text-cyan-300">{fa(c.fresh)} مورد جدید · {fa(c.duplicate)} تکراری · {fa(c.conflicting)} ناسازگار · {fa(c.invalid)} نامعتبر{c.tombstoned ? ' · ' + fa(c.tombstoned) + ' حذف‌شده در این مرورگر' : ''}</p>
          <p className="text-[10px] text-slate-500 mt-2">موارد تکراری دوباره ثبت نمی‌شوند؛ مواردی که اینجا حذف کرده‌اید با ورود فایل زنده نمی‌شوند؛ موارد نامعتبر وارد نمی‌شوند.</p>
          {c.conflicting > 0 && (
            <label className="flex items-center gap-2 text-xs mt-3">
              <span>موارد ناسازگار:</span>
              <select value={m.conflictMode} onChange={(e) => m.setConflictMode(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg p-1">
                <option value="skip">نسخهٔ فعلی حفظ شود</option>
                <option value="replace">نسخهٔ فایل جایگزین شود</option>
              </select>
            </label>
          )}
          <div className="flex gap-2 mt-4">
            <button className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-900 text-sm font-bold disabled:opacity-40" disabled={!c.fresh && !(c.conflicting && m.conflictMode === 'replace')} onClick={m.confirmImport}>تأیید ورود موارد معتبر</button>
            <button className="px-4 py-2 rounded-xl border border-slate-700 text-sm" onClick={() => m.setPreview(null)}>انصراف</button>
          </div>
        </div>
      )}
      {m.data.deleted.length > 0 && (
        <details className={box}>
          <summary className="cursor-pointer text-sm font-bold">حل‌های حذف‌شده ({fa(m.data.deleted.length)}) · قابل بازگردانی</summary>
          <div className="space-y-2 mt-3 max-h-64 overflow-y-auto">
            {[...m.data.deleted].reverse().map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-slate-900 rounded-xl p-3 text-xs">
                <span><span dir="ltr" className="font-bold ml-2">{resultText(s)}</span>{dateFa(s.createdAt)}</span>
                <button className="text-cyan-300 underline" onClick={() => m.actions.restoreSolve(s.id)}>بازگردانی</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const kindFa = (k) => ({ solves: 'حل', sessions: 'جلسه', progress: 'پیشرفت آموزش', favorites: 'علاقه‌مندی', settings: 'تنظیمات', challenges: 'چالش' }[k] || k);

function ConflictModal({ m }) {
  const cf = m.conflictView;
  return (
    <Modal open={!!cf} onClose={() => m.setConflictView(null)} title="مقایسهٔ نسخه‌ها" wide>
      {cf && (
        <>
          <div className="grid grid-cols-2 gap-3 text-[11px]">
            <div><p className="font-bold mb-1">نسخهٔ نگه‌داشته‌شدهٔ این مرورگر</p><pre className="bg-slate-900 rounded-xl p-3 max-h-72 overflow-auto" dir="ltr">{JSON.stringify(strip(cf.local ?? cf.record ?? cf), null, 1)}</pre></div>
            <div><p className="font-bold mb-1">نسخهٔ پذیرفته‌شدهٔ سرور (فعال)</p><pre className="bg-slate-900 rounded-xl p-3 max-h-72 overflow-auto" dir="ltr">{JSON.stringify(strip(cf.server ?? null), null, 1)}</pre></div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            {(cf.local ?? cf.record) && !(cf.local ?? cf.record).deleted && (
              <button className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-900 text-sm font-bold" onClick={async () => {
                const rec = cf.local ?? cf.record;
                const existing = await m.store.get(cf.kind, rec.id);
                if (existing && !existing.deleted) await m.store.update(cf.kind, rec.id, () => ({ ...strip(rec) }));
                else if (!existing) await m.store.put(cf.kind, strip(rec));
                await m.store.dismissConflict(cf.id);
                m.setConflictView(null);
              }}>جایگزینی با نسخهٔ این مرورگر</button>
            )}
            <button className="px-4 py-2 rounded-xl border border-slate-700 text-sm" onClick={async () => { await m.store.dismissConflict(cf.id); m.setConflictView(null); }}>نسخهٔ سرور بماند</button>
          </div>
          <p className="text-[10px] text-slate-500 mt-3">رکورد حذف‌شده با این انتخاب خودکار بازنمی‌گردد؛ برای بازگرداندن از فهرست حذف‌شده‌ها استفاده کنید.</p>
        </>
      )}
    </Modal>
  );
}
const strip = (r) => { if (!r) return r; const { rev, updatedAt, ...rest } = r; return rest; };

function AiBody({ m, mobile }) {
  const { ai, aiStatus, authState, refreshAi, settings, actions } = m.app;
  const box = mobile ? 'cyber-panel p-5 rounded-2xl space-y-4' : 'bg-purple-500/5 border border-purple-500/20 rounded-3xl p-8 space-y-6';
  const [limits, setLimits] = useState({});
  const [saving, setSaving] = useState('');
  const available = ai?.aiAvailable();
  useEffect(() => { setLimits(aiStatus.limits || {}); }, [aiStatus.limits]);
  if (!available) {
    return (
      <div className={box}>
        <h3 className="font-bold">بدون کلید: غیرفعال</h3>
        <p className="text-sm text-slate-300 leading-7">تمام تمرین‌ها و آموزش‌ها فعال‌اند. هیچ درخواست یا عنصر هوشواره خارج از همین بخش نمایش داده نمی‌شود و صفر درخواست به Anthropic فرستاده می‌شود.</p>
        <p className="text-xs text-slate-400 leading-6">کلید فقط سمت سرور نگه‌داری می‌شود، نه در مرورگر. برای فعال‌سازی: سرویس کوچک Cloudflare Worker همراه پروژه مستقر و کلید با <code dir="ltr">wrangler secret put ANTHROPIC_API_KEY</code> روی سرور ذخیره شود؛ سپس نشانی آن در تنظیم ساخت (VITE_AI_ENDPOINT) قرار گیرد. راهنما: docs/AI_FA.md</p>
      </div>
    );
  }
  if (authState.status !== 'signedIn') return <div className={box}><p className="text-sm text-slate-300">برای بررسی وضعیت هوشواره ابتدا وارد حساب شخصی شو؛ درخواست‌ها فقط از سرور احراز هویت‌شده انجام می‌شوند.</p></div>;
  const st = aiStatus;
  const canSet = typeof ai.setLimits === 'function';
  const saveLimits = async () => {
    setSaving('…');
    try { await ai.setLimits(limits); await refreshAi(); setSaving('ذخیره شد'); } catch (e) { setSaving(e.message); }
  };
  return (
    <div className={box}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={'w-2 h-2 rounded-full ' + (st.configured ? 'bg-green-500' : 'bg-slate-500')}></div>
          <span className={'text-xs font-bold ' + (st.configured ? 'text-green-400' : 'text-slate-300')}>{st.configured ? 'کلید ذخیره‌شده در سرور · پوشانده' : 'کلید روی سرور تنظیم نشده یا در دسترس نیست'}</span>
        </div>
        <button className="text-[10px] text-cyan-300 underline" onClick={refreshAi}>بررسی دوباره</button>
      </div>
      {st.maskedKey && <div className="text-[10px] font-mono text-slate-400 bg-black/40 p-2 rounded" dir="ltr">{st.maskedKey}</div>}
      {st.message && !st.configured && <p className="text-xs text-amber-300">{st.message}</p>}
      {st.configured && (
        <>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div><p className="text-[10px] text-slate-500">مدل (تنظیم سرور)</p><p className="font-bold" dir="ltr">{st.model}</p></div>
            <div><p className="text-[10px] text-slate-500">مصرف امروز / این ماه</p><p className="font-bold">{fa(st.usage?.today?.requests ?? 0)} / {fa(st.usage?.month?.requests ?? 0)} درخواست</p></div>
            <div><p className="text-[10px] text-slate-500">توکن ماه (ورودی/خروجی/کش)</p><p className="font-bold" dir="ltr">{st.usage?.month?.input ?? 0} / {st.usage?.month?.output ?? 0} / {(st.usage?.month?.cacheRead ?? 0) + (st.usage?.month?.cacheWrite ?? 0)}</p></div>
            <div><p className="text-[10px] text-slate-500">هزینهٔ تخمینی ماه</p><p className="font-bold text-green-400">{st.usage?.month?.usd != null ? '$' + Number(st.usage.month.usd).toFixed(4) : 'پس از ثبت مصرف'}</p></div>
          </div>
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold">تحلیل خودکار پایان جلسه</p><p className="text-[10px] text-slate-500">خاموش: فقط درخواست دستی. روشن: حداکثر یک درخواست برای هر نسخهٔ نهایی جلسه.</p></div>
            <Toggle on={settings.aiAutoSession} onChange={(v) => actions.saveSettings({ aiAutoSession: v })} label="تحلیل خودکار پایان جلسه" />
          </div>
          <div className="pt-4 border-t border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-500">بودجه و سقف (اعمال در سرور)</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[['dailyUsd', 'بودجهٔ روزانه ($)'], ['monthlyUsd', 'بودجهٔ ماهانه ($)'], ['dailyRequests', 'سقف درخواست روزانه'], ['monthlyRequests', 'سقف درخواست ماهانه']].map(([k, l]) => (
                <label key={k}>{l}
                  <input type="number" min={0} step="any" value={limits[k] ?? ''} disabled={!canSet} onChange={(e) => setLimits({ ...limits, [k]: e.target.value === '' ? null : Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 p-2 rounded-lg mt-1" dir="ltr" />
                  {st.ceilings?.[k] != null && <span className="text-[10px] text-slate-500">حداکثر سرور: {st.ceilings[k]}</span>}
                </label>
              ))}
            </div>
            {canSet && <button className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-sm" onClick={saveLimits}>ذخیرهٔ سقف‌ها</button>}
            {saving && <span className="text-xs text-slate-400 mr-2">{saving}</span>}
          </div>
        </>
      )}
      <div className="p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-start gap-4">
        <i className="fa-solid fa-circle-info text-slate-500 mt-1"></i>
        <p className="text-[10px] text-slate-500 leading-relaxed">فعال‌سازی هوشواره کاملاً اختیاری است. هیچ داده‌ای بدون درخواست صریح شما ارسال نمی‌شود و فقط خلاصهٔ آماری لازم فرستاده می‌شود. مصرف واقعی از پاسخ سرور ثبت می‌شود و هزینهٔ تخمینی صورتحساب قطعی نیست. تغییر خودکار به مدل گران‌تر انجام نمی‌شود.</p>
      </div>
    </div>
  );
}

function InterfaceBody({ m, mobile }) {
  const { simulated, actions } = m.app;
  return (
    <div className={mobile ? 'cyber-panel rounded-2xl divide-y divide-white/5' : 'p-5 bg-slate-800/30 rounded-2xl border border-slate-700 space-y-4'}>
      <div className={'flex items-center justify-between gap-4 ' + (mobile ? 'p-4' : '')}>
        <div><p className="text-sm">کاهش حرکت رابط</p><p className="text-[10px] text-slate-500">چرخش‌های نمایشی مکعب و جلوه‌ها حذف می‌شوند (تنظیم سیستم هم رعایت می‌شود).</p></div>
        <Toggle on={m.settings.reduceMotion} onChange={(v) => m.actions.saveSettings({ reduceMotion: v })} label="کاهش حرکت" />
      </div>
      <div className={'flex items-center justify-between gap-4 ' + (mobile ? 'p-4' : '')}>
        <div><p className="text-sm text-amber-200">حالت شبیه‌ساز</p><p className="text-[10px] text-slate-500">مکعب مجازی با کیبورد/دکمه برای آزمایش بدون روبیک؛ همیشه با برچسب نمایش داده می‌شود، اتصال واقعی نیست و حل‌هایش ذخیره نمی‌شود.</p></div>
        <Toggle on={simulated} onChange={(v) => actions.setSimulated(v)} label="حالت شبیه‌ساز" />
      </div>
      {!mobile && <p className="text-sm text-slate-300">میان‌برهای صفحهٔ تمرین: <kbd dir="ltr">Space</kbd> بازرسی/آماده، <kbd dir="ltr">N</kbd> اسکرَمبل جدید، <kbd dir="ltr">F</kbd> تمرین آزاد، <kbd dir="ltr">Esc</kbd> لغو تلاش. {simulated && <>شبیه‌ساز: <kbd dir="ltr">i k</kbd> R/R′، <kbd dir="ltr">d e</kbd> L/L′، <kbd dir="ltr">j f</kbd> U/U′، <kbd dir="ltr">s l</kbd> D/D′، <kbd dir="ltr">h g</kbd> F/F′، <kbd dir="ltr">w o</kbd> B/B′.</>}</p>}
      <p className={'text-sm text-slate-300 ' + (mobile ? 'p-4' : '')}>فارسی · راست‌به‌چپ؛ حرکت‌ها مستقل و چپ‌به‌راست.</p>
    </div>
  );
}

function Privacy() {
  return (
    <div className="p-5 bg-slate-800/30 rounded-2xl border border-slate-700 space-y-2 text-sm text-slate-300 leading-7">
      <p>داده‌ها متعلق به حساب شخصی شماست و فقط با قواعد دسترسی مالک خوانده و نوشته می‌شوند. بدون ورود، همه‌چیز فقط در همین مرورگر می‌ماند.</p>
      <p>خروجی پشتیبان و گزارش اتصال، رمز، توکن، کلید یا شناسهٔ بلوتوث ندارند. هوشواره فقط با پیکربندی و درخواست شما، خلاصهٔ لازم را می‌فرستد.</p>
    </div>
  );
}

// ---------- layouts ----------
const SECTIONS = [['account', 'حساب کاربری', 'fa-user'], ['practice', 'تنظیمات تمرین', 'fa-stopwatch'], ['interface', 'رابط کاربری', 'fa-desktop'], ['data', 'داده و پشتیبان', 'fa-database'], ['ai', 'پیکربندی هوشواره', 'fa-microchip']];

function Desktop({ section }) {
  const m = useSettingsModel();
  const [active, setActive] = useState(section || 'account');
  useEffect(() => {
    if (section) document.getElementById('set-' + section)?.scrollIntoView({ block: 'start' });
  }, [section]);
  const row = 'flex items-center justify-between gap-6 p-4 bg-slate-800/30 rounded-2xl border border-slate-700';
  return (
    <main className="pt-8 pb-12 px-8 max-w-5xl mx-auto flex gap-12 w-full">
      <aside className="w-64 shrink-0 space-y-2 hidden md:block sticky top-28 self-start">
        {SECTIONS.map(([id, label, icon]) => (
          <a key={id} href={'#/settings/' + id} onClick={() => setActive(id)}
            className={'flex items-center gap-3 px-4 py-3 rounded-xl transition-all ' + (active === id ? 'bg-accent-cyan text-slate-900 font-bold' : 'hover:bg-slate-800 text-slate-400')}>
            <i className={'fa-solid ' + icon}></i> {label}
          </a>
        ))}
      </aside>
      <div className="flex-1 space-y-12 pb-24">
        <section id="set-account" className="space-y-6 scroll-mt-28">
          <h2 className="text-xl font-bold border-b border-slate-800 pb-4">حساب کاربری</h2>
          <AccountBody m={m} />
        </section>
        <section id="set-practice" className="space-y-6 scroll-mt-28">
          <h2 className="text-xl font-bold border-b border-slate-800 pb-4 text-white">تنظیمات تمرین</h2>
          <div className="space-y-4"><PracticeRows m={m} rowCls={row} /></div>
        </section>
        <section id="set-data" className="space-y-6 scroll-mt-28">
          <h2 className="text-xl font-bold border-b border-slate-800 pb-4">داده و پشتیبان</h2>
          <DataBody m={m} />
        </section>
        <section id="set-ai" className="space-y-6 scroll-mt-28">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <h2 className="text-xl font-bold accent-purple">پیکربندی هوشواره (اختیاری)</h2>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">اختیاری</span>
          </div>
          <AiBody m={m} />
        </section>
        <section id="set-interface" className="space-y-5 scroll-mt-28">
          <h2 className="text-xl font-bold">رابط و دسترس‌پذیری</h2>
          <InterfaceBody m={m} />
        </section>
        <section id="set-privacy" className="space-y-5 scroll-mt-28">
          <h2 className="text-xl font-bold">حریم خصوصی</h2>
          <Privacy />
        </section>
      </div>
      <ConflictModal m={m} />
    </main>
  );
}

function Mobile() {
  const m = useSettingsModel();
  const row = 'p-4 flex items-center justify-between gap-3';
  return (
    <div className="mob">
      <MobileHeader title="تنظیمات و حساب" start={<i className="fa-solid fa-gear text-lg"></i>} />
      <main className="mt-16 px-4 space-y-8 pb-10">
        <section id="account-section" className="space-y-4">
          <h2 className="text-sm font-bold border-r-2 border-cyan pr-2">حساب شخصی</h2>
          <AccountBody m={m} mobile />
        </section>
        <section id="solve-settings" className="space-y-4">
          <h2 className="text-sm font-bold border-r-2 border-purple-500 pr-2">تنظیمات حل</h2>
          <div className="cyber-panel rounded-2xl divide-y divide-white/5"><PracticeRows m={m} rowCls={row} mobile /></div>
        </section>
        <section className="space-y-4">
          <h2 className="text-sm font-bold border-r-2 border-slate-500 pr-2">رابط</h2>
          <InterfaceBody m={m} mobile />
        </section>
        <section id="data-management" className="space-y-4">
          <h2 className="text-sm font-bold border-r-2 border-yellow-500 pr-2">داده و همگام‌سازی</h2>
          <DataBody m={m} mobile />
        </section>
        <section id="ai-config" className="space-y-4">
          <h2 className="text-sm font-bold border-r-2 border-cyan pr-2">پیکربندی هوشواره</h2>
          <AiBody m={m} mobile />
        </section>
        <section className="cyber-panel rounded-2xl p-4 space-y-3">
          <h3 className="font-bold text-sm text-cyan-300">بلوتوث این مرورگر</h3>
          <p className="text-sm text-secondary leading-7">داده‌های تمرین و تنظیمات بین مک و اندروید همگام می‌شوند؛ اتصال روبیک و دستگاه انتخاب‌شده فقط متعلق به همین مرورگر است.</p>
          <a href="#/connection" className="block text-center w-full mt-3 py-3 px-4 rounded-xl border border-white/15 bg-white/5 text-sm font-medium">مدیریت اتصال</a>
        </section>
      </main>
      <MobileNav route="settings" />
      <ConflictModal m={m} />
    </div>
  );
}

export default function Settings({ mobile, route }) {
  return mobile ? <Mobile /> : <Desktop section={route.params[0]} />;
}
