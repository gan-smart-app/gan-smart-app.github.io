import { useRef } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { fa, ago } from '../app/format.js';
import { download } from '../components/ui.jsx';
import CubeView from '../components/CubeView.jsx';
import { PageFooter, PageHeader, MobileHeader, MobileNav, batteryIcon } from '../layout/Shell.jsx';
import { SOLVED_FACELETS } from '../core/cube.mjs';

const STEPS = ['انتخاب دستگاه', 'برقراری ارتباط', 'دریافت وضعیت معتبر', 'آمادهٔ تمرین'];
function stepOf(device) {
  if (device.status === 'ready') return 4;
  if (device.status === 'selecting') return 1;
  if (device.stage === 'verify' || device.stage === 'legacy' || device.stage === 'protocol') return 3;
  if (device.status === 'connecting') return 2;
  return 0;
}

const EVENT_TEXT = {
  'connect-start': 'انتخاب دستگاه آغاز شد', stage: 'مرحله', ready: 'وضعیت معتبر دریافت شد · آمادهٔ تمرین', 'connect-cancel': 'تلاش اتصال لغو شد',
  'stale-result': 'پاسخ دیررس تلاش لغوشده کنار گذاشته شد', 'connect-error': 'خطای اتصال', facelets: 'وضعیت مکعب', paused: 'وقفه و بازیابی خودکار',
  resumed: 'ارتباط دوباره برقرار شد', 'sync-lost': 'همگامی حرکت‌ها از دست رفت', disconnect: 'قطع اتصال', diagnostic: 'گزارش تشخیصی',
  'request-state': 'درخواست خواندن وضعیت', 'mark-solved': 'علامت‌گذاری روبیک حل‌شده', 'stream-error': 'توقف دریافت داده',
};

function useConnection() {
  const app = useApp();
  const { link, device, support, live } = app;
  const busy = device.status === 'selecting' || device.status === 'connecting';
  const ready = device.status === 'ready';
  const log = (link.log || []).slice(-40).reverse();
  const exportLog = () => download('gan-connection-log-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json', link.exportLog());
  const requestState = () => link.requestState().catch(() => {});
  const markSolved = () => {
    if (confirm('آیا هر شش وجه روبیک واقعی کاملاً حل شده است؟ این فرمان فقط برای همگام‌کردن مدل با روبیک حل‌شده است.')) link.markSolved().catch((e) => alert(e.message));
  };
  const forget = async () => {
    try { const ok = await link.forgetDevice(); alert(ok ? 'مجوز این روبیک برای این سایت حذف شد.' : 'ابتدا یک بار به روبیک وصل شو.'); } catch (e) { alert(e.message); }
  };
  return { app, link, device, support, live, busy, ready, log, exportLog, requestState, markSolved, forget };
}

function statusOf(c) {
  const d = c.device;
  if (d.status === 'ready') return ['متصل و آماده', 'text-ok', 'bg-ok'];
  if (d.status === 'recovering') return ['در حال بازیابی خودکار', 'text-warn', 'bg-warn animate-pulse'];
  if (c.busy) return [d.status === 'selecting' ? 'در انتظار انتخاب دستگاه' : 'در انتظار وضعیت معتبر', 'text-accent', 'bg-accent animate-pulse'];
  if (d.status === 'error') return ['اتصال برقرار نیست', 'text-bad', 'bg-bad'];
  return ['متصل نیست', 'text-muted', 'bg-faint'];
}

function EventLines({ c }) {
  if (!c.log.length) return <p className="text-faint">هنوز رویدادی ثبت نشده است.</p>;
  return c.log.map((e, i) => (
    <div key={i} className="flex gap-3">
      <span className="num text-faint shrink-0">{new Date(e.at).toLocaleTimeString('en-GB')}</span>
      <span className={e.kind === 'ready' || e.kind === 'resumed' ? 'text-ok' : e.kind.includes('error') || e.kind === 'disconnect' || e.kind === 'sync-lost' ? 'text-bad' : 'text-muted'}>
        {EVENT_TEXT[e.kind] || e.kind}{e.detail && e.kind !== 'ready' ? ' · ' + e.detail : ''}
      </span>
    </div>
  ));
}

const ORIENTATION = 'مرجع نمایش: سفید بالا و سبز جلو (قرمز سمت راست). مدل روبیک به مرکزها وابسته است؛ چرخاندن کل روبیک در دست یا چرخاندن نما هیچ حرکتی ثبت نمی‌کند. جهت مطلق یا ژیروسکوپ از این دستگاه دریافت نمی‌شود. راهنماهای لایهٔ آخر روبیک را «زرد بالا، سبز روبه‌رو» می‌خواهند و این را صریح می‌گویند.';

function Stepper({ step }) {
  return (
    <ol className="flex items-start" aria-label="مراحل اتصال">
      {STEPS.map((s, i) => {
        const done = step > i + 1 || (step === 4 && i === 3);
        const cur = step === i + 1 && step < 4;
        return (
          <li key={s} className="flex-1 flex flex-col items-center text-center relative" aria-current={cur ? 'step' : undefined}>
            {i > 0 && <span className={'absolute top-3.5 h-px ' + (step > i ? 'bg-ok/50' : 'bg-line')} style={{ left: '50%', right: '-50%' }}></span>}
            <span className={'relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold border ' + (done ? 'bg-ok/15 border-ok/40 text-ok' : cur ? 'bg-accent/15 border-accent text-accent' : 'bg-bg border-line text-faint')}>
              {done ? <i className="fa-solid fa-check text-[10px]"></i> : fa(i + 1)}
            </span>
            <span className={'text-xs mt-2 ' + (done ? 'text-ink' : cur ? 'text-accent' : 'text-faint')}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

// Context notice for the non-ready states.
function Notice({ c }) {
  const d = c.device;
  const box = (tone, icon, title, text, action) => (
    <div className={'rounded-xl border p-4 flex items-start gap-3 ' + tone}>
      <i className={'fa-solid ' + icon + ' mt-1'}></i>
      <div className="flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <p className="text-xs text-muted leading-6 mt-0.5">{text}</p>
        {action}
      </div>
    </div>
  );
  return (
    <>
      {!c.support.ok && box('border-warn/30 bg-warn/5 text-warn', 'fa-circle-exclamation', 'مرورگر ناسازگار', c.support.text)}
      {c.busy && box('border-line bg-bg text-ink', 'fa-circle-notch animate-spin text-accent', d.status === 'selecting' ? 'در انتظار انتخاب دستگاه…' : 'در انتظار وضعیت معتبر…', 'پیش از اتصال دو سه حرکت به روبیک بده تا بیدار شود؛ پس از انتخاب، چند لحظه آن را ثابت نگه دار.')}
      {d.status === 'error' && box('border-bad/30 bg-bad/5 text-bad', 'fa-triangle-exclamation', 'اتصال قطع شد', 'اگر حلی در جریان بود، معتبر ذخیره نشد؛ اتصال دوباره آن را معتبر نمی‌کند.')}
      {d.status === 'recovering' && box('border-warn/30 bg-warn/5 text-warn', 'fa-compass', 'بازیابی وضعیت', 'وضعیت معتبر دوباره دریافت می‌شود؛ حل قطع‌شده معتبر نمی‌شود.')}
      {d.pickerHint && !c.ready && box('border-warn/30 bg-warn/5 text-warn', 'fa-lightbulb', 'پنجرهٔ انتخاب ظاهر نشد؟', 'اگر پنجرهٔ انتخاب دستگاه Chrome باز نشده یا گیر کرده است، ابتدا «لغو» را بزن؛ اگر باز هم ظاهر نشد صفحه را تازه کن.',
        <button className="btn-secondary btn-sm mt-3" onClick={() => (c.busy ? alert('ابتدا تلاش جاری را لغو کن.') : location.reload())}>تازه‌سازی صفحه</button>)}
    </>
  );
}

function Actions({ c, mobile }) {
  const d = c.device;
  const wide = mobile ? 'w-full' : '';
  if (c.ready) return (
    <div className={'flex flex-wrap gap-2 ' + (mobile ? 'flex-col' : '')}>
      <button className={'btn-secondary ' + wide} onClick={c.requestState}><i className="fa-solid fa-arrows-rotate"></i>دریافت دوبارهٔ وضعیت</button>
      <button className={'btn-danger ' + wide} onClick={() => c.link.disconnect()}><i className="fa-solid fa-link-slash"></i>قطع اتصال</button>
    </div>
  );
  if (c.busy) return <button className={'btn-secondary ' + wide} onClick={() => c.link.cancel()}>لغو تلاش اتصال</button>;
  if (d.status === 'recovering') return <button className={'btn-danger ' + wide} onClick={() => c.link.disconnect()}>توقف و قطع اتصال</button>;
  return (
    <button className={'btn-primary btn-lg ' + wide} disabled={!c.support.ok} onClick={() => c.link.connect()}>
      <i className="fa-brands fa-bluetooth-b"></i>{d.status === 'error' ? 'تلاش مجدد اتصال' : 'اتصال به روبیک'}
    </button>
  );
}

function DeviceCard({ c, mobile }) {
  const d = c.device;
  const [label, tone, dot] = statusOf(c);
  return (
    <section id="connection-status" className={'card ' + (mobile ? 'p-4' : 'p-6')}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={'w-12 h-12 rounded-xl flex items-center justify-center border ' + (c.ready ? 'bg-ok/10 border-ok/30 text-ok' : 'bg-raised border-line text-muted')}>
            <i className="fa-solid fa-cube text-xl"></i>
          </div>
          <div>
            <h2 className="text-base font-semibold">{d.deviceName || 'روبیک GAN'}</h2>
            <p className={'text-sm flex items-center gap-2 ' + tone}><span className={'dot ' + dot}></span>{label}</p>
          </div>
        </div>
        {c.ready && d.battery != null && (
          <span className="badge border-line bg-bg text-ink">
            <i className={'fa-solid ' + batteryIcon(d.battery) + (d.battery > 20 ? ' text-ok' : ' text-warn')}></i><span className="num">{d.battery}%</span>
          </span>
        )}
      </div>
      <div className={'my-6 ' + (mobile ? 'my-5' : '')}><Stepper step={stepOf(d)} /></div>
      <p className="text-sm text-muted leading-7 mb-5" role="status">{d.message || 'فقط برقراری ارتباط کافی نیست؛ آماده‌شدن پس از تأیید وضعیت مکعب است.'}</p>
      <Actions c={c} mobile={mobile} />
      {c.ready && (
        <div className="mt-5 pt-4 border-t border-line text-xs text-muted leading-6 flex flex-wrap items-center gap-x-3 gap-y-2">
          {d.lastStateAt && <span className="text-faint">آخرین وضعیت معتبر: {ago(new Date(d.lastStateAt).toISOString())}</span>}
          <span>اگر نمایش با روبیک فرق دارد، ابتدا «دریافت دوبارهٔ وضعیت»؛ اگر روبیک کاملاً حل است و هنوز فرق دارد:</span>
          <button className="btn-ghost btn-sm" onClick={c.markSolved}>روبیک من کاملاً حل شده است</button>
        </div>
      )}
    </section>
  );
}

function LogCard({ c }) {
  return (
    <details id="logs" className="card group">
      <summary className="p-5 cursor-pointer list-none flex items-center justify-between">
        <span className="section-title flex items-center gap-2"><i className="fa-solid fa-terminal text-xs text-faint"></i>رویدادهای اتصال</span>
        <i className="fa-solid fa-chevron-down text-xs text-faint transition-transform group-open:rotate-180"></i>
      </summary>
      <div className="px-5 pb-5">
        <div className="space-y-2 max-h-56 overflow-y-auto text-xs bg-bg border border-line rounded-lg p-3 leading-6"><EventLines c={c} /></div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button className="btn-secondary btn-sm" onClick={c.exportLog}><i className="fa-solid fa-download"></i>خروجی گزارش (JSON)</button>
          <button className="btn-ghost btn-sm" disabled={c.busy} onClick={c.forget}>حذف مجوز بلوتوث این روبیک</button>
        </div>
        <p className="text-[11px] text-faint mt-2">گزارش بدون دادهٔ حساب یا کلید است.</p>
      </div>
    </details>
  );
}

function Desktop() {
  const c = useConnection();
  const cube = useRef(null);
  return (
    <main className="w-full max-w-[1100px] mx-auto px-6 py-10">
      <PageHeader title="اتصال روبیک" text="اتصال مکعب هوشمند GAN، وضعیت باتری و دریافت وضعیت معتبر" />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="space-y-4">
          <DeviceCard c={c} />
          <Notice c={c} />
          <LogCard c={c} />
        </div>
        <section id="orientation-guide" className="card p-5">
          <h3 className="section-title mb-4">راهنمای جهت‌گیری</h3>
          <div className="relative aspect-square rounded-xl bg-bg border border-line overflow-hidden mb-4">
            <CubeView ref={cube} facelets={c.live.facelets || SOLVED_FACELETS} lastMove={c.live.lastMove} moveKey={c.live.moveKey} height="100%" label="مرجع نمای مکعب؛ سفید بالا و سبز جلو" />
            <button className="icon-btn absolute bottom-2 left-2 bg-surface/80 border border-line" aria-label="بازنشانی نمای دوربین" onClick={() => cube.current?.resetCamera()}><i className="fa-solid fa-rotate-left text-sm"></i></button>
          </div>
          <p className="text-xs text-muted leading-6">{ORIENTATION}</p>
        </section>
      </div>
      <PageFooter links={[['#/practice', 'تمرین'], ['#/settings/privacy', 'حریم خصوصی']]} />
    </main>
  );
}

function Mobile({ route }) {
  const c = useConnection();
  return (
    <div className="mob-page">
      <MobileHeader title="اتصال روبیک" back="#/practice" end={null} />
      <main className="px-4 pt-4 space-y-4">
        <DeviceCard c={c} mobile />
        <Notice c={c} />
        <section id="orientation-guide" className="card p-4 flex items-start gap-4">
          <div className="w-28 shrink-0 rounded-lg bg-bg border border-line overflow-hidden">
            <CubeView facelets={c.live.facelets || SOLVED_FACELETS} lastMove={c.live.lastMove} moveKey={c.live.moveKey} height={112} />
          </div>
          <div>
            <h3 className="section-title mb-1">قرارداد جهت‌گیری</h3>
            <p className="text-xs text-muted leading-6">{ORIENTATION}</p>
          </div>
        </section>
        <LogCard c={c} />
      </main>
      <MobileNav route={route.name} />
    </div>
  );
}

export default function Connection({ mobile, route }) {
  return mobile ? <Mobile route={route} /> : <Desktop />;
}
