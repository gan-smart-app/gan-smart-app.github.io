import { useRef } from 'react';
import { useApp } from '../app/AppContext.jsx';
import { fa, ago } from '../app/format.js';
import { download } from '../components/ui.jsx';
import CubeView from '../components/CubeView.jsx';
import { PageFooter, MobileHeader, MobileNav, batteryIcon } from '../layout/Shell.jsx';
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
  return { app, link, device, support, live, busy, ready, log, exportLog, requestState, markSolved };
}

function StatusText({ c }) {
  const d = c.device;
  if (d.status === 'ready') return <span className="text-green-400">متصل و آماده</span>;
  if (d.status === 'recovering') return <span className="text-amber-300">در حال بازیابی خودکار</span>;
  if (c.busy) return <span className="text-cyan-300">در حال اتصال…</span>;
  if (d.status === 'error') return <span className="text-red-400">اتصال برقرار نیست</span>;
  return <span className="text-slate-300">متصل نیست</span>;
}

function EventLines({ c, cls = 'flex gap-2' }) {
  if (!c.log.length) return <p className="text-slate-500">هنوز رویدادی ثبت نشده است.</p>;
  return c.log.map((e, i) => (
    <div key={i} className={cls}>
      <span className="text-slate-500">{new Date(e.at).toLocaleTimeString('en-GB')}</span>
      <span className={e.kind === 'ready' || e.kind === 'resumed' ? 'text-green-400' : e.kind.includes('error') || e.kind === 'disconnect' || e.kind === 'sync-lost' ? 'text-red-400' : 'text-slate-300'}>
        {EVENT_TEXT[e.kind] || e.kind}{e.detail && e.kind !== 'ready' ? ' · ' + e.detail : ''}
      </span>
    </div>
  ));
}

function OrientationText() {
  return 'مرجع نمایش: سفید بالا و سبز جلو (قرمز سمت راست). مدل روبیک به مرکزها وابسته است؛ چرخاندن کل روبیک در دست یا چرخاندن نما هیچ حرکتی ثبت نمی‌کند. جهت مطلق یا ژیروسکوپ از این دستگاه دریافت نمی‌شود. راهنماهای لایهٔ آخر روبیک را «زرد بالا، سبز روبه‌رو» می‌خواهند و این را صریح می‌گویند.';
}

function Desktop() {
  const c = useConnection();
  const cube = useRef(null);
  const step = stepOf(c.device);
  const d = c.device;
  return (
    <main className="pt-8 pb-12 px-8 max-w-7xl mx-auto w-full">
      <header className="mb-12">
        <h1 className="text-3xl font-bold mb-2">اتصال و مدیریت دستگاه</h1>
        <p className="text-slate-400">مدیریت اتصال مکعب هوشمند GAN و وضعیت باتری</p>
      </header>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section id="connection-status" className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
            <div className="flex items-start justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-accent-cyan/10 rounded-full flex items-center justify-center">
                  <i className="fa-solid fa-cube text-3xl accent-cyan"></i>
                </div>
                <div>
                  <h2 className="text-xl font-bold">{d.deviceName || 'روبیک GAN'}</h2>
                  <p className="text-slate-400 text-sm">وضعیت: <StatusText c={c} /></p>
                </div>
              </div>
              {c.ready && (
                <div className="flex flex-col items-end gap-2">
                  {d.battery != null && (
                    <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-full border border-slate-700">
                      <i className={'fa-solid ' + batteryIcon(d.battery) + ' ' + (d.battery > 20 ? 'text-green-400' : 'text-amber-400') + ' text-xs'}></i>
                      <span className="text-sm font-medium">{fa(d.battery)}٪</span>
                    </div>
                  )}
                  {d.lastStateAt && <span className="text-[10px] text-slate-500">آخرین وضعیت معتبر: {ago(new Date(d.lastStateAt).toISOString())}</span>}
                </div>
              )}
            </div>

            {c.ready ? (
              <div className="flex gap-4">
                <button className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 py-3 rounded-xl transition-all font-bold" onClick={() => c.link.disconnect()}>
                  <i className="fa-solid fa-link-slash ml-2"></i> قطع دستی اتصال
                </button>
                <button className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl transition-all font-bold" onClick={c.requestState}>
                  <i className="fa-solid fa-arrows-rotate ml-2"></i> دریافت دوبارهٔ وضعیت
                </button>
              </div>
            ) : c.busy ? (
              <div className="flex gap-4">
                <button className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl transition-all font-bold" onClick={() => c.link.cancel()}>لغو تلاش اتصال</button>
              </div>
            ) : c.device.status === 'recovering' ? (
              <div className="flex gap-4">
                <button className="flex-1 bg-red-500/10 text-red-400 border border-red-500/30 py-3 rounded-xl font-bold" onClick={() => c.link.disconnect()}>توقف و قطع اتصال</button>
              </div>
            ) : (
              <div className="flex gap-4">
                <button className="flex-1 bg-cyan-400 hover:bg-cyan-300 text-slate-900 py-3 rounded-xl transition-all font-bold disabled:opacity-40" disabled={!c.support.ok} onClick={() => c.link.connect()}>
                  <i className="fa-brands fa-bluetooth-b ml-2"></i> {d.status === 'error' ? 'تلاش مجدد اتصال' : 'اتصال به روبیک'}
                </button>
              </div>
            )}

            <ol className="grid grid-cols-4 gap-2 my-6 text-xs text-slate-300" aria-label="مراحل اتصال">
              {STEPS.map((s, i) => (
                <li key={s} className={step > i ? 'text-emerald-300' : step === i + 1 ? 'text-cyan-300' : ''} aria-current={step === i + 1 ? 'step' : undefined}>
                  {fa(i + 1)}. {s}{step > i && i === 3 ? ' ✓' : ''}
                </li>
              ))}
            </ol>
            <p className="text-sm text-slate-400 mb-4" role="status">{d.message || 'فقط برقراری ارتباط کافی نیست؛ آماده‌شدن پس از تأیید وضعیت مکعب است.'}</p>
            {d.pickerHint && !c.ready && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-sm text-amber-200">
                اگر پنجرهٔ انتخاب دستگاه Chrome باز نشده یا گیر کرده است، ابتدا «لغو» را بزن؛ اگر باز هم ظاهر نشد صفحه را تازه کن.
                <button className="block mt-2 underline" onClick={() => (c.busy ? alert('ابتدا تلاش جاری را لغو کن.') : location.reload())}>تازه‌سازی صفحه</button>
              </div>
            )}
            {c.ready && (
              <div className="mt-4 text-xs text-slate-400 flex flex-wrap gap-3 items-center">
                <span>اگر نمایش با روبیک فرق دارد: ابتدا «دریافت دوبارهٔ وضعیت»؛ اگر روبیک را کامل حل کرده‌ای و هنوز فرق دارد:</span>
                <button className="underline text-slate-300" onClick={c.markSolved}>روبیک من کاملاً حل شده است</button>
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {c.busy && (
              <div className="bg-slate-800/30 border border-dashed border-slate-700 rounded-xl p-6 flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center mb-4 animate-pulse"><i className="fa-solid fa-ellipsis text-slate-400"></i></div>
                <h3 className="font-bold mb-1">{d.status === 'selecting' ? 'در انتظار انتخاب دستگاه…' : 'در انتظار وضعیت معتبر…'}</h3>
                <p className="text-xs text-slate-500 mb-4">پیش از اتصال دو سه حرکت به روبیک بده تا بیدار شود؛ پس از انتخاب، چند لحظه آن را ثابت نگه دار.</p>
                <button className="text-xs text-accent-cyan border border-accent-cyan/30 px-4 py-1 rounded-full" onClick={() => c.link.cancel()}>لغو</button>
              </div>
            )}
            {d.status === 'error' && (
              <div className="bg-slate-800/30 border border-red-900/30 rounded-xl p-6 flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 text-red-400"><i className="fa-solid fa-triangle-exclamation"></i></div>
                <h3 className="font-bold mb-1 text-red-400">اتصال قطع شد</h3>
                <p className="text-xs text-slate-500 mb-4">اگر حلی در جریان بود، معتبر ذخیره نشد؛ اتصال دوباره آن را معتبر نمی‌کند.</p>
                <button className="text-xs bg-accent-cyan text-slate-900 px-4 py-1 rounded-full font-bold" onClick={() => c.link.connect()}>تلاش مجدد</button>
              </div>
            )}
            {!c.support.ok && (
              <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-6 flex flex-col items-center text-center md:col-span-2">
                <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center mb-4 text-slate-500"><i className="fa-brands fa-chrome"></i></div>
                <h3 className="font-bold mb-1">مرورگر ناسازگار</h3>
                <p className="text-xs text-slate-500">{c.support.text}</p>
              </div>
            )}
            {d.status === 'recovering' && (
              <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-6 flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-accent-purple/10 rounded-full flex items-center justify-center mb-4 text-accent-purple"><i className="fa-solid fa-compass"></i></div>
                <h3 className="font-bold mb-1">بازیابی وضعیت</h3>
                <p className="text-xs text-slate-500">وضعیت معتبر دوباره دریافت می‌شود؛ حل قطع‌شده معتبر نمی‌شود.</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <section id="orientation-guide" className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <h3 className="font-bold mb-4 flex items-center gap-2"><i className="fa-solid fa-circle-info text-accent-cyan"></i>راهنمای جهت‌گیری</h3>
            <div className="aspect-square bg-slate-900 rounded-xl mb-4 border border-slate-800 relative overflow-hidden">
              <CubeView ref={cube} facelets={c.live.facelets || SOLVED_FACELETS} lastMove={c.live.lastMove} moveKey={c.live.moveKey} height="100%" label="مرجع نمای مکعب؛ سفید بالا و سبز جلو" />
              <button className="absolute bottom-2 left-2 w-9 h-9 rounded-lg bg-black/50 text-slate-300" aria-label="بازنشانی نمای دوربین" onClick={() => cube.current?.resetCamera()}><i className="fa-solid fa-video"></i></button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed"><OrientationText /></p>
          </section>
          <details id="logs" className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
            <summary className="cursor-pointer text-cyan-300 font-bold mb-3">رویدادهای اتصال · مشاهده / بستن</summary>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm">گزارش رویدادها</h3>
              <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300">زنده</span>
            </div>
            <div className="space-y-3 max-h-48 overflow-y-auto text-xs font-mono pr-2" dir="rtl"><EventLines c={c} /></div>
            <button className="w-full mt-4 text-[10px] text-slate-500 hover:text-white transition-colors border-t border-slate-700 pt-3" onClick={c.exportLog}>خروجی گزارش اتصال (JSON، بدون دادهٔ حساب یا کلید)</button>
            {(
              <button className="w-full mt-2 text-[10px] text-slate-500 hover:text-white" disabled={c.busy}
                onClick={async () => { try { const ok = await c.link.forgetDevice(); alert(ok ? 'مجوز این روبیک برای این سایت حذف شد.' : 'ابتدا یک بار به روبیک وصل شو.'); } catch (e) { alert(e.message); } }}>
                حذف مجوز بلوتوث این روبیک در همین مرورگر
              </button>
            )}
          </details>
        </div>
      </div>
      <PageFooter links={[['#/practice', 'تمرین'], ['#/settings/privacy', 'حریم خصوصی']]} />
    </main>
  );
}

function Mobile({ route }) {
  const c = useConnection();
  const d = c.device;
  const title = c.ready ? 'متصل و آماده' : c.busy ? (d.status === 'selecting' ? 'در انتظار انتخاب دستگاه' : 'در انتظار وضعیت معتبر') : d.status === 'recovering' ? 'بازیابی خودکار' : d.status === 'error' ? 'اتصال برقرار نیست' : 'آمادهٔ اتصال';
  return (
    <div className="mob">
      <MobileHeader title="اتصال به مکعب" back="#/practice" />
      <main className="mt-16 px-4 space-y-6">
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 border border-cyan-400/20 bg-cyan-400/10">
            <i className={'fa-brands fa-bluetooth text-cyan text-3xl' + (c.busy ? ' animate-pulse' : '')}></i>
          </div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-xs text-secondary mt-1" role="status">{d.message || 'مطمئن شوید بلوتوث دستگاه روشن است.'}</p>
        </div>

        {!c.support.ok && (
          <div id="browser-warning" className="cyber-panel p-4 rounded-xl border-yellow-500/30 bg-yellow-500/5">
            <div className="flex items-start gap-3">
              <i className="fa-solid fa-circle-exclamation text-yellow-500 mt-1"></i>
              <div className="space-y-1">
                <div className="text-xs font-bold text-yellow-500">محدودیت مرورگر</div>
                <p className="text-[11px] text-secondary leading-relaxed">{c.support.text}</p>
              </div>
            </div>
          </div>
        )}

        <div id="device-list" className="space-y-3">
          <div className="text-[10px] text-secondary tracking-widest uppercase mr-1">{c.ready ? 'دستگاه متصل' : 'دستگاه'}</div>
          {c.ready ? (
            <div className="cyber-panel p-3 rounded-lg flex items-center justify-between border-green-500/30">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-xs font-bold">{d.deviceName || 'روبیک GAN'} · آماده حل</span>
                {d.battery != null && <span className="text-[10px] text-secondary">{fa(d.battery)}٪</span>}
              </div>
              <button className="text-[10px] text-red-400" onClick={() => c.link.disconnect()}>قطع دستی</button>
            </div>
          ) : c.busy ? (
            <div className="cyber-panel p-3 rounded-lg space-y-3">
              <div className="text-xs">{d.status === 'selecting' ? 'روبیک را در پنجرهٔ بلوتوث Chrome انتخاب کن.' : 'ارتباط برقرار است؛ تا دریافت وضعیت معتبر، تمرین آماده نیست.'}</div>
              <button className="w-full py-1.5 bg-white/5 rounded text-[10px]" onClick={() => c.link.cancel()}>لغو</button>
            </div>
          ) : (
            <button className="w-full flex items-center justify-between p-4 cyber-panel rounded-xl hover:border-cyan transition-colors disabled:opacity-40" disabled={!c.support.ok} onClick={() => c.link.connect()}>
              <div className="flex items-center gap-3">
                <i className="fa-solid fa-cube text-cyan"></i>
                <div className="text-right">
                  <div className="text-sm font-bold">روبیک GAN</div>
                  <div className="text-[10px] text-secondary">انتخاب دستگاه در پنجرهٔ مرورگر</div>
                </div>
              </div>
              <div className="text-[10px] bg-cyan-400/20 text-cyan px-2 py-1 rounded">{d.status === 'error' ? 'تلاش مجدد' : 'اتصال'}</div>
            </button>
          )}
          {d.status === 'error' && (
            <div className="cyber-panel p-3 rounded-lg space-y-1 border-red-500/30">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation text-red-500 text-xs"></i>
                <span className="text-xs font-bold text-red-500">اتصال قطع شد</span>
              </div>
              <p className="text-[10px] text-secondary">این حل معتبر ذخیره نشد. اتصال مجدد نتیجهٔ ناقص را معتبر نمی‌کند.</p>
            </div>
          )}
          {d.pickerHint && !c.ready && (
            <p className="text-[11px] text-amber-200">اگر پنجرهٔ انتخاب ظاهر نشد، لغو کن و دوباره بزن؛ اگر باز هم نشد صفحه را تازه کن.</p>
          )}
          {c.ready && (
            <div className="grid grid-cols-2 gap-2">
              <button className="py-3 rounded-xl border border-white/15 bg-white/5 text-xs" onClick={c.requestState}>دریافت دوبارهٔ وضعیت</button>
              <button className="py-3 rounded-xl border border-white/15 bg-white/5 text-xs" onClick={c.markSolved}>روبیکم کامل حل است</button>
            </div>
          )}
        </div>

        <div id="orientation-guide" className="cyber-panel p-4 rounded-xl">
          <div className="flex items-center gap-3 mb-3">
            <i className="fa-solid fa-camera-rotate text-cyan"></i>
            <div className="text-xs font-bold">قرارداد جهت‌گیری</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-28 shrink-0"><CubeView facelets={c.live.facelets || SOLVED_FACELETS} lastMove={c.live.lastMove} moveKey={c.live.moveKey} height={112} /></div>
            <p className="text-[10px] text-secondary leading-relaxed italic"><OrientationText /></p>
          </div>
        </div>

        <details className="cyber-panel rounded-xl overflow-hidden group">
          <summary className="p-4 flex items-center justify-between cursor-pointer list-none">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-terminal text-secondary text-xs"></i>
              <span className="text-xs">رویدادها و خروجی خام</span>
            </div>
            <i className="fa-solid fa-chevron-down text-[10px] transition-transform group-open:rotate-180"></i>
          </summary>
          <div className="p-4 pt-0 border-t border-white/5 bg-black/40">
            <div className="font-mono text-[10px] text-cyan space-y-1 pt-3"><EventLines c={c} cls="flex gap-2 flex-wrap" /></div>
            <button className="w-full mt-3 py-3 px-4 rounded-xl border border-white/15 bg-white/5 text-sm font-medium" onClick={c.exportLog}>خروجی گزارش</button>
          </div>
        </details>
      </main>
      <MobileNav route={route.name} />
    </div>
  );
}

export default function Connection({ mobile, route }) {
  return mobile ? <Mobile route={route} /> : <Desktop />;
}
