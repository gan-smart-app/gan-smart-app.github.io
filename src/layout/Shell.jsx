import { useApp } from '../app/AppContext.jsx';
import { fa } from '../app/format.js';

const NAV = [
  ['practice', 'تمرین', 'fa-stopwatch'],
  ['stats', 'آمار', 'fa-chart-simple'],
];
const MOBILE_NAV = [...NAV, ['settings', 'تنظیمات', 'fa-gear']];
const SECTION = { practice: 'practice', stats: 'stats', solve: 'stats', settings: 'settings' };
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
    case 'ready': return { label: 'روبیک GAN', dot: 'bg-ok', tone: 'text-ok', short: 'متصل', text: 'متصل · وضعیت معتبر' };
    case 'recovering': return { label: 'روبیک GAN', dot: 'bg-warn animate-pulse', tone: 'text-warn', short: 'بازیابی', text: 'در حال بازیابی اتصال' };
    case 'selecting': case 'connecting': return { label: 'روبیک GAN', dot: 'bg-warn animate-pulse', tone: 'text-warn', short: 'در حال اتصال', text: 'در حال اتصال…' };
    case 'error': return { label: 'روبیک GAN', dot: 'bg-bad', tone: 'text-bad', short: 'قطع', text: 'قطع · نیازمند اتصال دوباره' };
    default: return { label: 'روبیک GAN', dot: 'bg-faint', tone: 'text-muted', short: 'متصل نیست', text: 'متصل نیست' };
  }
}

// 3×3 mark: a quiet nod to the cube without a stock icon.
export function Logo({ size = 28 }) {
  const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="rgb(var(--accent))" />
      {cells.map((i) => (
        <rect key={i} x={5 + (i % 3) * 6.33} y={5 + Math.floor(i / 3) * 6.33} width="5.2" height="5.2" rx="1.3"
          fill="#fff" fillOpacity={i === 4 ? 1 : 0.55} />
      ))}
    </svg>
  );
}

export function DeviceChip({ compact = false }) {
  const { device } = useApp();
  const d = deviceSummary(device);
  const ready = device.status === 'ready';
  return (
    <a href="#/connection" title={d.text} aria-label={'اتصال روبیک: ' + d.text}
      className={'inline-flex items-center gap-2 rounded-full border border-line bg-surface hover:border-strong transition-colors ' + (compact ? 'h-9 px-3' : 'h-9 px-3.5')}>
      <span className={'dot ' + d.dot}></span>
      <span className="text-xs font-medium text-ink">{compact ? d.short : ready ? 'روبیک متصل' : d.text}</span>
      {ready && device.battery != null && (
        <span className="flex items-center gap-1 text-xs text-muted border-s border-line ps-2">
          <i className={'fa-solid ' + batteryIcon(device.battery) + (device.battery <= 20 ? ' text-warn' : '')}></i>
          <span className="num">{device.battery}%</span>
        </span>
      )}
    </a>
  );
}

export function DesktopHeader({ route }) {
  const { authState } = useApp();
  const active = sectionOf(route);
  return (
    <header id="header" className="sticky top-0 z-50 h-14 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="h-full max-w-[1400px] mx-auto px-6 flex items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <a href="#/practice" className="flex items-center gap-2.5" aria-label="GAN SMART، صفحهٔ تمرین">
            <Logo />
            <span className="font-num text-[15px] font-semibold tracking-tight text-ink ltr">GAN Smart</span>
          </a>
          <nav className="seg" aria-label="ناوبری اصلی">
            {NAV.map(([id, label, icon]) => (
              <a key={id} href={'#/' + id} aria-current={active === id ? 'page' : undefined}>
                <i className={'fa-solid ' + icon + ' text-[11px]'}></i>{label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <SyncIndicator />
          <DeviceChip />
          <span className="w-px h-5 bg-line mx-1"></span>
          <a href="#/settings" className={'icon-btn' + (active === 'settings' ? ' text-ink bg-raised' : '')} aria-label="تنظیمات" title="تنظیمات"><i className="fa-solid fa-gear"></i></a>
          <a href="#/settings/account" aria-label="حساب شخصی" title={authState.status === 'signedIn' ? 'حساب: ' + authState.email : 'حساب شخصی'}
            className={'w-8 h-8 rounded-full flex items-center justify-center text-xs border transition-colors ' + (authState.status === 'signedIn' ? 'bg-accent/15 border-accent/40 text-accent font-semibold' : 'bg-raised border-line text-muted hover:text-ink')}>
            {authState.status === 'signedIn' && authState.email ? <span className="num uppercase">{authState.email[0]}</span> : <i className="fa-solid fa-user"></i>}
          </a>
        </div>
      </div>
    </header>
  );
}

export function MobileNav({ route }) {
  const active = sectionOf(route);
  return (
    <nav id="footer" className="fixed bottom-0 inset-x-0 z-50 border-t border-line bg-bg/95 backdrop-blur-md" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="ناوبری اصلی">
      <div className="grid grid-cols-3 h-16">
        {MOBILE_NAV.map(([id, label, icon]) => (
          <a key={id} href={'#/' + id} aria-current={active === id ? 'page' : undefined}
            className={'flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ' + (active === id ? 'text-ink' : 'text-faint')}>
            <span className={'flex items-center justify-center w-12 h-7 rounded-full ' + (active === id ? 'bg-accent/15 text-accent' : '')}>
              <i className={'fa-solid ' + icon + ' text-base'}></i>
            </span>
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

// Mobile top bar: optional back link, title, end slot (device chip by default).
export function MobileHeader({ title, back, end }) {
  return (
    <header id="header" className="fixed top-0 inset-x-0 z-50 border-b border-line bg-bg/90 backdrop-blur-md" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="h-14 px-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          {back ? (
            <a href={back} className="icon-btn" aria-label="بازگشت" title="بازگشت"><i className="fa-solid fa-arrow-right"></i></a>
          ) : <span className="w-2"></span>}
          <h1 className="text-base font-semibold truncate">{title}</h1>
        </div>
        <div className="flex items-center gap-1 pe-1">{end === undefined ? <DeviceChip compact /> : end}</div>
      </div>
    </header>
  );
}

// Exact sync state, as reported by the sync engine.
const SYNC_VIEW = {
  local: { text: 'ذخیرهٔ محلی', tone: 'text-muted', dot: 'bg-faint', icon: 'fa-hard-drive' },
  queued: { text: 'در صف همگام‌سازی', tone: 'text-warn', dot: 'bg-warn', icon: 'fa-clock' },
  syncing: { text: 'در حال همگام‌سازی', tone: 'text-accent', dot: 'bg-accent animate-pulse', icon: 'fa-arrows-rotate' },
  synced: { text: 'در ابر ذخیره شد', tone: 'text-ok', dot: 'bg-ok', icon: 'fa-cloud' },
  attention: { text: 'نیازمند رسیدگی', tone: 'text-bad', dot: 'bg-bad', icon: 'fa-triangle-exclamation' },
  offline: { text: 'آفلاین · ذخیرهٔ محلی', tone: 'text-warn', dot: 'bg-warn', icon: 'fa-wifi' },
};
export const syncView = (st) => SYNC_VIEW[st?.state] || SYNC_VIEW.local;

function syncLabel(st) {
  const v = syncView(st);
  return v.text + (st.state === 'queued' && st.pending ? ' (' + fa(st.pending) + ')' : '');
}

// Icon-only status for the header; full text in the tooltip.
export function SyncIndicator() {
  const { syncStatus } = useApp();
  const v = syncView(syncStatus);
  const text = syncLabel(syncStatus);
  return (
    <a href="#/settings/data" className={'icon-btn ' + v.tone} title={text} aria-label={'وضعیت ذخیره: ' + text} aria-live="polite">
      <i className={'fa-solid ' + v.icon + (syncStatus.state === 'syncing' ? ' animate-spin' : '')}></i>
    </a>
  );
}

export function SyncPill({ className = '' }) {
  const { syncStatus } = useApp();
  const v = syncView(syncStatus);
  return (
    <a href="#/settings/data" className={'badge border-line bg-surface text-muted hover:text-ink ' + className} title="وضعیت ذخیره و همگام‌سازی" aria-live="polite">
      <span className={'dot w-1.5 h-1.5 ' + v.dot}></span>{syncLabel(syncStatus)}
    </a>
  );
}

// Page title block used by the desktop content pages.
export function PageHeader({ title, text, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {text && <p className="text-sm text-muted mt-1">{text}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageFooter({ links = [] }) {
  return (
    <footer id="page-footer" className="mt-16 pt-6 border-t border-line flex flex-wrap justify-between items-center gap-4 text-xs text-faint">
      <span>فضای شخصی تمرین روبیک</span>
      <div className="flex gap-5">{links.map(([href, label]) => <a key={href} href={href} className="hover:text-ink">{label}</a>)}</div>
    </footer>
  );
}
