import { lazy, Suspense, useEffect } from 'react';
import { AppProvider, useApp } from './app/AppContext.jsx';
import { useMedia, useRoute } from './app/router.js';
import { DesktopHeader } from './layout/Shell.jsx';
import { PracticeDesktop, PracticeMobile, DesktopFooter } from './screens/Practice.jsx';
import { Spinner } from './components/ui.jsx';

const Connection = lazy(() => import('./screens/Connection.jsx'));
const Stats = lazy(() => import('./screens/Stats.jsx'));
const SolveDetail = lazy(() => import('./screens/SolveDetail.jsx'));
const Settings = lazy(() => import('./screens/Settings.jsx'));

// The solve detail page has its own focused header in the design (09).
const FOCUSED = new Set(['solve']);

function Routes({ route, mobile }) {
  const props = { route, mobile };
  switch (route.name) {
    case 'connection': return <Connection {...props} />;
    case 'stats': return <Stats {...props} />;
    case 'solve': return <SolveDetail {...props} />;
    case 'settings': return <Settings {...props} />;
    default: return mobile ? <PracticeMobile route="practice" /> : <PracticeDesktop />;
  }
}

function Frame() {
  const { ready, fatal, settings } = useApp();
  // The saved preference adds to the system "reduce motion" setting.
  useEffect(() => { document.documentElement.classList.toggle('reduce-motion', !!settings.reduceMotion); }, [settings.reduceMotion]);
  const route = useRoute();
  const mobile = !useMedia('(min-width: 1024px)');
  if (fatal) return <div className="p-8 text-red-300" role="alert">{fatal}</div>;
  const name = route.name;
  const body = (
    <Suspense fallback={<div className="p-8"><Spinner text="در حال بارگذاری…" /></div>}>
      {!ready ? <div className="p-8"><Spinner text="در حال بارگذاری دادهٔ محلی…" /></div> : <Routes route={route} mobile={mobile} />}
    </Suspense>
  );
  if (mobile) return body;
  return (
    <div className="desk min-h-screen flex flex-col">
      {!FOCUSED.has(name) && <DesktopHeader route={name} />}
      {body}
      {name === 'practice' || !name ? <DesktopFooter /> : null}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Frame />
    </AppProvider>
  );
}
