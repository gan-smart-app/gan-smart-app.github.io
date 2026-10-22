import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { exportBackup, backupFileName, previewImport, applyImport } from '../core/backup.mjs';
import { download, Modal, Switch } from '../components/ui.jsx';
import { ago, fa, msText, resultText, dateFa } from '../app/format.js';
import { MobileHeader, MobileNav, PageHeader, syncView } from '../layout/Shell.jsx';

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

// ---------- building blocks ----------
function Row({ title, text, children }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {text && <p className="text-xs text-muted leading-6 mt-0.5">{text}</p>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

function Section({ id, title, children, className = '' }) {
  return (
    <section id={id} className={'scroll-mt-24 ' + className}>
      <h2 className="text-sm font-semibold text-muted mb-3 px-1">{title}</h2>
      {children}
    </section>
  );
}

// ---------- sections shared by both layouts ----------
function AccountBody({ m }) {
  const a = m.authState;
  const sv = syncView(m.syncStatus);
  if (a.status === 'unconfigured') {
    return (
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <i className="fa-solid fa-hard-drive text-muted mt-1"></i>
          <div>
            <h3 className="text-sm font-semibold">ذخیرهٔ محلی · حساب ابری هنوز پیکربندی نشده</h3>
            <p className="text-xs text-muted leading-6 mt-1">همهٔ تمرین‌ها در همین مرورگر ذخیره می‌شوند. برای همگام‌سازی بین مک و اندروید، پروژهٔ Firebase شخصی باید ساخته و نشانی آن در نسخهٔ منتشرشده تنظیم شود (راهنما: docs/FIREBASE_SETUP_FA.md). ثبت‌نام عمومی وجود ندارد.</p>
          </div>
        </div>
      </div>
    );
  }
  if (a.status === 'signedIn') {
    return (
      <div className="card p-5 flex items-center gap-4">
        <span aria-hidden="true" className="w-11 h-11 rounded-full bg-accent/15 border border-accent/40 text-accent font-semibold flex items-center justify-center num uppercase">{a.email?.[0] || '·'}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">حساب شخصی</h3>
          <p className="text-xs text-muted truncate" dir="ltr">{a.email}</p>
          <p className={'text-xs mt-0.5 ' + sv.tone}>{m.syncStatus.lastSyncedAt ? 'آخرین همگام‌سازی: ' + ago(m.syncStatus.lastSyncedAt) : sv.text}</p>
        </div>
        <button className="btn-danger btn-sm" onClick={() => m.auth.signOut()}>خروج</button>
      </div>
    );
  }
  const busy = a.status === 'signingIn';
  return (
    <form onSubmit={m.signIn} className="card p-5 space-y-3">
      <p className="text-xs text-muted">ورود به حساب شخصی · فقط حساب مالک؛ ثبت‌نام عمومی وجود ندارد.</p>
      <input type="email" required autoComplete="username" placeholder="ایمیل" value={m.email} onChange={(e) => m.setEmail(e.target.value)} dir="ltr"
        className="field" aria-label="ایمیل" disabled={busy} />
      <input type="password" required autoComplete="current-password" placeholder="گذرواژه" value={m.password} onChange={(e) => m.setPassword(e.target.value)} dir="ltr"
        className="field" aria-label="گذرواژهٔ حساب شخصی" disabled={busy} />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? <><i className="fa-solid fa-circle-notch animate-spin"></i>در حال بررسی حساب…</> : 'ورود'}
      </button>
      {a.error && <p className="text-center text-xs text-bad" role="alert">{a.error}</p>}
      <p className="text-xs text-faint">تا ورود، داده‌ها فقط در همین مرورگر ذخیره می‌شوند و پس از ورود همگام می‌شوند.</p>
    </form>
  );
}

function PracticeRows({ m }) {
  const s = m.settings, set = m.actions.saveSettings;
  return (
    <div className="card divide-y divide-line">
      <Row title="بازرسی (Inspection)" text="زمان آماده‌سازی پیش از شروع تایمر؛ تا ۲ ثانیه دیرتر +2 و پس از آن DNF">
        <Switch on={s.inspectionEnabled} onChange={(v) => set({ inspectionEnabled: v })} label="بازرسی" />
      </Row>
      <Row title="مدت بازرسی" text="مدت دلخواه پیش از حل">
        <input type="number" min={3} max={60} value={s.inspectionSeconds} onChange={(e) => set({ inspectionSeconds: Math.max(3, Math.min(60, Number(e.target.value) || 15)) })}
          className="field w-20 text-center num" aria-label="مدت بازرسی به ثانیه" />
        <span className="text-xs text-faint">ثانیه</span>
      </Row>
      <Row title="هدف زمانی (اختیاری)" text={s.goalMs ? 'هدف فعلی: ' + msText(s.goalMs, { persian: true }) + ' ثانیه' : 'تا زمانی تعیین نکنی، هدف زمانی فعال نیست'}>
        {s.goalMs && <button className="btn-ghost btn-sm" onClick={() => { m.setGoalText(''); set({ goalMs: null }); }}>حذف</button>}
        <input type="text" placeholder="--:--" value={m.goalText} onChange={(e) => m.setGoalText(e.target.value)} onBlur={m.saveGoal} dir="ltr"
          className="field w-24 text-center num" aria-label="هدف زمانی؛ خالی یعنی بدون هدف" />
      </Row>
      {m.goalError && <p className="text-xs text-bad px-5 py-3" role="alert">{m.goalError}</p>}
    </div>
  );
}

function DataBody({ m, mobile }) {
  const st = m.syncStatus;
  const sv = syncView(st);
  const c = m.preview && previewCounts(m.preview);
  return (
    <div className="space-y-3">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className={'w-9 h-9 rounded-lg bg-raised flex items-center justify-center ' + sv.tone}><i className={'fa-solid ' + sv.icon}></i></span>
            <div>
              <p className="text-sm font-medium">{sv.text}{st.pending ? ' · ' + fa(st.pending) + ' تغییر در صف' : ''}</p>
              <p className="text-xs text-muted">
                {m.authState.status !== 'signedIn' ? 'بدون ورود، داده فقط در همین مرورگر است.' : st.lastSyncedAt ? 'آخرین همگام‌سازی موفق: ' + ago(st.lastSyncedAt) : 'هنوز همگام‌سازی کامل نشده است.'}
                {st.error ? ' · ' + st.error : ''}
              </p>
            </div>
          </div>
          {m.authState.status === 'signedIn' && <button className="btn-secondary btn-sm" onClick={() => m.sync.syncNow()}><i className="fa-solid fa-arrows-rotate"></i>همگام‌سازی اکنون</button>}
        </div>
        <p className="text-xs text-faint leading-6 mt-4 pt-4 border-t border-line">رکورد، جلسه، پیشرفت آموزش، علاقه‌مندی‌ها و تنظیمات بین مک و اندروید همگام‌اند. اتصال بلوتوث و دستگاه انتخاب‌شده فقط متعلق به همین مرورگر است.</p>
      </div>

      {m.data.conflicts.length > 0 && (
        <div className="card p-5 border-bad/30">
          <h4 className="text-sm font-semibold text-bad mb-1">تعارض نسخه‌ها · نیازمند رسیدگی</h4>
          <p className="text-xs text-muted leading-6 mb-3">نسخهٔ پذیرفته‌شدهٔ سرور مبنا ماند و نسخهٔ محلی متفاوت اینجا نگه داشته شد. چیزی بدون انتخاب تو حذف نمی‌شود؛ حذف‌شده‌ها خودکار بازنمی‌گردند.</p>
          <div className="space-y-2">
            {m.data.conflicts.map((cf) => (
              <div key={cf.id} className="flex items-center justify-between bg-bg border border-line rounded-lg px-3.5 py-2.5 text-sm">
                <span>{kindFa(cf.kind)} · {dateFa(cf.at || cf.createdAt || new Date().toISOString())}</span>
                <button className="btn-ghost btn-sm text-accent" onClick={() => m.setConflictView(cf)}>مقایسهٔ نسخه‌ها</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card divide-y divide-line">
        <Row title="خروجی JSON" text={mobile ? null : 'تاریخچهٔ حل‌ها، جلسه‌ها، پیشرفت و تنظیمات؛ بدون رمز، توکن، کلید یا شناسهٔ بلوتوث.'}>
          <button className="btn-secondary btn-sm" onClick={m.doExport}><i className="fa-solid fa-download"></i>دانلود</button>
        </Row>
        <Row title="ورودی JSON" text={mobile ? null : 'بازیابی داده‌ها از فایل پشتیبان قبلی، با پیش‌نمایش پیش از اعمال.'}>
          <button className="btn-secondary btn-sm" onClick={() => m.fileRef.current?.click()}><i className="fa-solid fa-upload"></i>انتخاب فایل</button>
          <input ref={m.fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) m.pickFile(f); }} />
        </Row>
      </div>

      {m.importError && (
        <div className="card p-5 border-warn/30 flex items-start gap-3" role="alert">
          <i className="fa-solid fa-file-circle-xmark text-warn mt-1"></i>
          <div className="flex-1">
            <h4 className="text-sm font-semibold">ساختار فایل نامعتبر است</h4>
            <p className="text-xs text-muted mt-1">{m.importError}</p>
            <button className="btn-ghost btn-sm mt-2 -ms-3 text-accent" onClick={() => m.fileRef.current?.click()}>انتخاب فایل دیگر</button>
          </div>
        </div>
      )}
      {m.importDone && <p className="text-sm text-ok px-1" role="status"><i className="fa-solid fa-circle-check ms-1"></i>{m.importDone}</p>}
      {c && (
        <div className="card p-5 border-accent/30">
          <h4 className="text-sm font-semibold mb-2">پیش‌نمایش ورود</h4>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="badge border-ok/30 bg-ok/10 text-ok">{fa(c.fresh)} جدید</span>
            <span className="badge border-line text-muted">{fa(c.duplicate)} تکراری</span>
            <span className="badge border-warn/30 bg-warn/10 text-warn">{fa(c.conflicting)} ناسازگار</span>
            <span className="badge border-bad/30 bg-bad/10 text-bad">{fa(c.invalid)} نامعتبر</span>
            {c.tombstoned ? <span className="badge border-line text-muted">{fa(c.tombstoned)} حذف‌شده در این مرورگر</span> : null}
          </div>
          <p className="text-xs text-faint leading-6 mt-3">موارد تکراری دوباره ثبت نمی‌شوند؛ مواردی که اینجا حذف کرده‌ای با ورود فایل زنده نمی‌شوند؛ موارد نامعتبر وارد نمی‌شوند.</p>
          {c.conflicting > 0 && (
            <label className="flex items-center gap-3 text-sm mt-3">
              <span className="text-muted">موارد ناسازگار:</span>
              <select value={m.conflictMode} onChange={(e) => m.setConflictMode(e.target.value)} className="field h-9 w-auto">
                <option value="skip">نسخهٔ فعلی حفظ شود</option>
                <option value="replace">نسخهٔ فایل جایگزین شود</option>
              </select>
            </label>
          )}
          <div className="flex gap-2 mt-4">
            <button className="btn-primary" disabled={!c.fresh && !(c.conflicting && m.conflictMode === 'replace')} onClick={m.confirmImport}>تأیید ورود موارد معتبر</button>
            <button className="btn-ghost" onClick={() => m.setPreview(null)}>انصراف</button>
          </div>
        </div>
      )}
      {m.data.deleted.length > 0 && (
        <details className="card group">
          <summary className="px-5 py-4 cursor-pointer list-none flex items-center justify-between text-sm font-medium">
            حل‌های حذف‌شده ({fa(m.data.deleted.length)}) · قابل بازگردانی
            <i className="fa-solid fa-chevron-down text-xs text-faint transition-transform group-open:rotate-180"></i>
          </summary>
          <div className="space-y-1.5 px-5 pb-5 max-h-64 overflow-y-auto">
            {[...m.data.deleted].reverse().map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-bg border border-line rounded-lg px-3.5 py-2 text-sm">
                <span className="flex items-center gap-3"><span className="num font-semibold">{resultText(s)}</span><span className="text-xs text-faint">{dateFa(s.createdAt)}</span></span>
                <button className="btn-ghost btn-sm text-accent" onClick={() => m.actions.restoreSolve(s.id)}>بازگردانی</button>
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
            <div><p className="text-xs font-semibold mb-1.5">نسخهٔ نگه‌داشته‌شدهٔ این مرورگر</p><pre className="bg-bg border border-line rounded-lg p-3 max-h-72 overflow-auto font-mono" dir="ltr">{JSON.stringify(strip(cf.local ?? cf.record ?? cf), null, 1)}</pre></div>
            <div><p className="text-xs font-semibold mb-1.5">نسخهٔ پذیرفته‌شدهٔ سرور (فعال)</p><pre className="bg-bg border border-line rounded-lg p-3 max-h-72 overflow-auto font-mono" dir="ltr">{JSON.stringify(strip(cf.server ?? null), null, 1)}</pre></div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            {(cf.local ?? cf.record) && !(cf.local ?? cf.record).deleted && (
              <button className="btn-primary" onClick={async () => {
                const rec = cf.local ?? cf.record;
                const existing = await m.store.get(cf.kind, rec.id);
                if (existing && !existing.deleted) await m.store.update(cf.kind, rec.id, () => ({ ...strip(rec) }));
                else if (!existing) await m.store.put(cf.kind, strip(rec));
                await m.store.dismissConflict(cf.id);
                m.setConflictView(null);
              }}>جایگزینی با نسخهٔ این مرورگر</button>
            )}
            <button className="btn-secondary" onClick={async () => { await m.store.dismissConflict(cf.id); m.setConflictView(null); }}>نسخهٔ سرور بماند</button>
          </div>
          <p className="text-xs text-faint mt-3">رکورد حذف‌شده با این انتخاب خودکار بازنمی‌گردد؛ برای بازگرداندن از فهرست حذف‌شده‌ها استفاده کن.</p>
        </>
      )}
    </Modal>
  );
}
const strip = (r) => { if (!r) return r; const { rev, updatedAt, ...rest } = r; return rest; };

function InterfaceBody({ m, mobile }) {
  return (
    <div className="card divide-y divide-line">
      <Row title="کاهش حرکت رابط" text="چرخش‌های نمایشی مکعب و جلوه‌ها حذف می‌شوند (تنظیم سیستم هم رعایت می‌شود).">
        <Switch on={m.settings.reduceMotion} onChange={(v) => m.actions.saveSettings({ reduceMotion: v })} label="کاهش حرکت" />
      </Row>
      {!mobile && (
        <Row title="میان‌برهای صفحهٔ تمرین">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span><kbd>Space</kbd> بازرسی/آماده</span><span><kbd>N</kbd> اسکرَمبل</span><span><kbd>F</kbd> آزاد</span><span><kbd>Esc</kbd> لغو</span>
          </span>
        </Row>
      )}
      <Row title="زبان" text="فارسی · راست‌به‌چپ؛ حرکت‌ها مستقل و چپ‌به‌راست." />
    </div>
  );
}

function Privacy() {
  return (
    <div className="card p-5 space-y-2 text-sm text-muted leading-7">
      <p>داده‌ها متعلق به حساب شخصی توست و فقط با قواعد دسترسی مالک خوانده و نوشته می‌شوند. بدون ورود، همه‌چیز فقط در همین مرورگر می‌ماند.</p>
      <p>خروجی پشتیبان و گزارش اتصال، رمز، توکن، کلید یا شناسهٔ بلوتوث ندارند.</p>
    </div>
  );
}

// ---------- layouts ----------
const SECTIONS = [['account', 'حساب کاربری', 'fa-user'], ['practice', 'تمرین', 'fa-stopwatch'], ['data', 'داده و پشتیبان', 'fa-database'], ['interface', 'رابط کاربری', 'fa-display'], ['privacy', 'حریم خصوصی', 'fa-shield-halved']];

function Desktop({ section }) {
  const m = useSettingsModel();
  const [active, setActive] = useState(section || 'account');
  useEffect(() => {
    if (section) { setActive(section); document.getElementById('set-' + section)?.scrollIntoView({ block: 'start' }); }
  }, [section]);
  return (
    <main className="w-full max-w-5xl mx-auto px-6 py-10">
      <PageHeader title="تنظیمات" text="حساب، تمرین، داده و رابط کاربری" />
      <div className="flex gap-10">
        <aside className="w-52 shrink-0 hidden md:block sticky top-24 self-start">
          <nav className="flex flex-col gap-0.5" aria-label="بخش‌های تنظیمات">
            {SECTIONS.map(([id, label, icon]) => (
              <a key={id} href={'#/settings/' + id} onClick={() => setActive(id)} aria-current={active === id ? 'true' : undefined}
                className={'flex items-center gap-3 h-9 px-3 rounded-lg text-sm transition-colors ' + (active === id ? 'bg-raised text-ink font-medium' : 'text-muted hover:text-ink hover:bg-raised/60')}>
                <i className={'fa-solid ' + icon + ' w-4 text-center text-xs ' + (active === id ? 'text-accent' : '')}></i>{label}
              </a>
            ))}
          </nav>
        </aside>
        <div className="flex-1 min-w-0 space-y-10 pb-24">
          <Section id="set-account" title="حساب کاربری"><AccountBody m={m} /></Section>
          <Section id="set-practice" title="تمرین"><PracticeRows m={m} /></Section>
          <Section id="set-data" title="داده و پشتیبان"><DataBody m={m} /></Section>
          <Section id="set-interface" title="رابط و دسترس‌پذیری"><InterfaceBody m={m} /></Section>
          <Section id="set-privacy" title="حریم خصوصی"><Privacy /></Section>
        </div>
      </div>
      <ConflictModal m={m} />
    </main>
  );
}

function Mobile() {
  const m = useSettingsModel();
  return (
    <div className="mob-page">
      <MobileHeader title="تنظیمات" />
      <main className="px-4 pt-5 space-y-8 pb-6">
        <Section id="account-section" title="حساب شخصی"><AccountBody m={m} /></Section>
        <Section id="solve-settings" title="تمرین"><PracticeRows m={m} /></Section>
        <Section id="data-management" title="داده و همگام‌سازی"><DataBody m={m} mobile /></Section>
        <Section title="رابط"><InterfaceBody m={m} mobile /></Section>
        <Section title="بلوتوث این مرورگر">
          <div className="card p-5">
            <p className="text-sm text-muted leading-7">داده‌های تمرین و تنظیمات بین مک و اندروید همگام می‌شوند؛ اتصال روبیک و دستگاه انتخاب‌شده فقط متعلق به همین مرورگر است.</p>
            <a href="#/connection" className="btn-secondary w-full mt-4"><i className="fa-brands fa-bluetooth-b"></i>مدیریت اتصال</a>
          </div>
        </Section>
        <Section title="حریم خصوصی"><Privacy /></Section>
      </main>
      <MobileNav route="settings" />
      <ConflictModal m={m} />
    </div>
  );
}

export default function Settings({ mobile, route }) {
  return mobile ? <Mobile /> : <Desktop section={route.params[0]} />;
}
