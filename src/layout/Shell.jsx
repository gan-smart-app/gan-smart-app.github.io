import { useApp } from '../app/AppContext.jsx';
import { fa } from '../app/format.js';

const NAV = [
  ['practice', 'تمرین', 'fa-stopwatch'],
  ['stats', 'آمار', 'fa-chart-line'],
];
const SECTION = { practice: 'practice', stats: 'stats', solve: 'stats' };
export const sectionOf = (route) => SECTION[route] || null;

export function batteryIcon(level) {
  if (level == null) return 'fa-battery-empty';
  if (level > 85) return 'fa-battery-full';
  if (level > 60) return 'fa-battery-three-quarters';
  if (level > 35) return 'fa-battery-half';
  if (level > 10) return 'fa-battery-quarter';
  return 'fa-battery-empty';
}

export function deviceSummary(device) {
  switch (device.status) {
    case 'ready': return { label: 'روبیک GAN', dot: 'bg-green-500', text: 'متصل · وضعیت معتبر' };
    case 'recovering': return { label: 'روبیک GAN', dot: 'bg-amber-400', text: 'در حال بازیابی اتصال' };
    case 'selecting': case 'connecting': return { label: 'روبیک GAN', dot: 'bg-amber-400', text: 'در حال اتصال…' };
    case 'error': return { label: 'روبیک GAN', dot: 'bg-red-500', text: 'قطع · نیازمند اتصال دوباره' };
    default: return { label: 'روبیک GAN', dot: 'bg-slate-500', text: 'متصل نیست' };
  }
}

export function DesktopHeader({ route }) {
  const { device, authState } = useApp();
  const active = sectionOf(route);
  const d = deviceSummary(device);
  return (
    <header id="header" className="h-20 border-b border-white/5 glass-panel sticky top-0 z-50 flex items-center px-8 justify-between">
      <div className="flex items-center gap-10">
        <a href="#/practice" className="flex items-center gap-3" aria-label="GAN SMART، صفحهٔ تمرین">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <i className="fa-solid fa-cube text-white text-xl"></i>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">GAN <span className="text-cyan-400">SMART</span></span>
        </a>
        <nav className="hidden lg:flex items-center gap-8" aria-label="ناوبری اصلی">
          {NAV.map(([id, label]) => (
            <a key={id} href={'#/' + id} aria-current={active === id ? 'page' : undefined}
              className={active === id ? 'text-cyan-400 border-b-2 border-cyan-400 pb-1 font-medium transition-all' : 'text-slate-400 hover:text-white transition-all'}>
              {label}
            </a>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-6">
        <a href="#/connection" className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10" title={d.text} aria-label={'اتصال: ' + d.text}>
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-400">{d.label}</span>
            <span className="text-xs font-bold text-cyan-400">{device.status === 'ready' && device.battery != null ? fa(device.battery) + '٪' : device.status === 'ready' ? 'متصل' : d.text.split(' ·')[0]}</span>
          </div>
          <div className="relative">
            <i className={(device.status === 'ready' ? 'fa-solid ' + batteryIcon(device.battery) : 'fa-brands fa-bluetooth-b') + ' text-cyan-400 text-lg'}></i>
            <span className={'absolute -top-1 -right-1 w-2 h-2 rounded-full border border-[#050508] ' + d.dot}></span>
          </div>
        </a>
        <div className="flex items-center gap-4 text-slate-400">
          <a href="#/settings" className="hover:text-white transition-all" aria-label="تنظیمات" title="تنظیمات"><i className="fa-solid fa-gear text-lg"></i></a>
          <a href="#/connection" className="hover:text-white transition-all" aria-label="مدیریت اتصال و راهنما" title="مدیریت اتصال و راهنما"><i className="fa-solid fa-circle-question text-lg"></i></a>
          <a href="#/settings/account" aria-label="حساب شخصی" title={authState.status === 'signedIn' ? 'حساب: ' + authState.email : 'حساب شخصی'}
            className={'w-9 h-9 rounded-full border flex items-center justify-center ' + (authState.status === 'signedIn' ? 'border-cyan-400/50 text-cyan-300' : 'border-white/20 text-slate-300')}>
            <i className="fa-solid fa-user"></i>
          </a>
        </div>
      </div>
    </header>
  );
}

export function MobileNav({ route }) {
  const active = sectionOf(route);
  return (
    <nav id="footer" className="fixed bottom-0 left-0 right-0 z-50 cyber-panel border-b-0 border-x-0 px-2 py-3 flex items-center justify-around pb-6" aria-label="ناوبری اصلی">
      {NAV.map(([id, label, icon]) => (
        <a key={id} href={'#/' + id} aria-current={active === id ? 'page' : undefined}
          className={'flex flex-col items-center gap-1 ' + (active === id ? 'nav-active' : 'text-secondary')} style={{ textDecoration: 'none' }}>
          <i className={'fa-solid ' + icon + ' text-xl'}></i>
          <span className="text-[10px]">{label}</span>
        </a>
      ))}
    </nav>
  );
}

// Mobile top bar: back button or custom start slot, centred title, end slot.
export function MobileHeader({ title, back, start, end, icon }) {
  return (
    <header id="header" className="fixed top-0 left-0 right-0 z-50 px-4 py-3 cyber-panel border-t-0 border-x-0 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {back ? (
          <a href={back} className="text-secondary hover:text-white inline-flex items-center justify-center w-11 h-11" aria-label="بازگشت" title="بازگشت">
            <i className="fa-solid fa-chevron-right text-lg"></i>
          </a>
        ) : start}
      </div>
      <h1 className="text-sm font-bold flex items-center gap-2">{icon}{title}</h1>
      <div className="flex items-center gap-2 min-w-10 justify-end">{end || <div className="w-10"></div>}</div>
    </header>
  );
}

// Exact sync state, as reported by the sync engine.
const SYNC_VIEW = {
  local: { text: 'ذخیرهٔ محلی', cls: 'bg-slate-500/10 border-slate-500/20 text-slate-300', dot: 'bg-slate-400', icon: 'fa-hard-drive' },
  queued: { text: 'در صف همگام‌سازی', cls: 'bg-amber-500/10 border-amber-500/20 text-amber-300', dot: 'bg-amber-400', icon: 'fa-clock' },
  syncing: { text: 'درحال همگام‌سازی', cls: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300', dot: 'bg-cyan-400 animate-pulse', icon: 'fa-arrows-rotate' },
  synced: { text: 'در ابر ذخیره شد', cls: 'bg-green-500/10 border-green-500/20 text-green-400', dot: 'bg-green-500', icon: 'fa-cloud' },
  attention: { text: 'نیازمند رسیدگی', cls: 'bg-red-500/10 border-red-500/20 text-red-300', dot: 'bg-red-500', icon: 'fa-triangle-exclamation' },
  offline: { text: 'آفلاین · ذخیرهٔ محلی', cls: 'bg-amber-500/10 border-amber-500/20 text-amber-300', dot: 'bg-amber-400', icon: 'fa-wifi' },
};
export const syncView = (st) => SYNC_VIEW[st?.state] || SYNC_VIEW.local;

export function SyncPill({ className = '' }) {
  const { syncStatus } = useApp();
  const v = syncView(syncStatus);
  const extra = syncStatus.state === 'queued' && syncStatus.pending ? ' (' + fa(syncStatus.pending) + ')' : '';
  return (
    <a href="#/settings/data" className={'flex items-center gap-2 px-3 py-1 rounded-full border ' + v.cls + ' ' + className} title="وضعیت ذخیره و همگام‌سازی" aria-live="polite">
      <div className={'w-1.5 h-1.5 rounded-full ' + v.dot}></div>
      <span className="text-[10px] font-bold">{v.text + extra}</span>
    </a>
  );
}

// Quiet page footer used by the desktop content pages (02, 03, 04, 06).
export function PageFooter({ start, links = [] }) {
  return (
    <footer id="page-footer" className="max-w-7xl w-full mx-auto px-8 py-12 border-t border-slate-800 mt-12 flex flex-col md:flex-row justify-between items-center gap-6 text-slate-500 text-sm">
      <div className="flex items-center gap-4">{start || (<><div className="w-6 h-6 bg-slate-800 rounded flex items-center justify-center text-xs">G</div><span className="text-slate-400">فضای شخصی تمرین روبیک</span></>)}</div>
      <div className="flex gap-6">{links.map(([href, label]) => <a key={href} href={href} className="hover:text-white">{label}</a>)}</div>
    </footer>
  );
}
