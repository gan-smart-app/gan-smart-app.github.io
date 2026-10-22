import { lazy, Suspense, useEffect } from 'react';
import { AppProvider, useApp } from './app/AppContext.jsx';
import { useMedia, useRoute } from './app/router.js';
import { DesktopHeader, SimBadge } from './layout/Shell.jsx';
import { PracticeDesktop, PracticeMobile, DesktopFooter } from './screens/Practice.jsx';
import { Spinner } from './components/ui.jsx';

const Connection = lazy(() => import('./screens/Connection.jsx'));
const Learn = lazy(() => import('./screens/Learn.jsx'));
const Lesson = lazy(() => import('./screens/Lesson.jsx'));
const Challenges = lazy(() => import('./screens/Challenges.jsx'));
const Solver = lazy(() => import('./screens/Solver.jsx'));
const Stats = lazy(() => import('./screens/Stats.jsx'));
const Replay = lazy(() => import('./screens/Replay.jsx'));
const Settings = lazy(() => import('./screens/Settings.jsx'));
const Analysis = lazy(() => import('./screens/Analysis.jsx'));

// Screens with their own focused header in the design (05, 07, 09, 12).
const FOCUSED = new Set(['lesson', 'solver', 'solve', 'analysis', 'drill']);

function Routes({ route, mobile }) {
  const props = { route, mobile };
  switch (route.name) {
    case 'connection': return <Connection {...props} />;
    case 'learn': case 'library': return <Learn {...props} />;
    case 'lesson': case 'drill': return <Lesson {...props} />;
    case 'challenges': return <Challenges {...props} />;
    case 'solver': return <Solver {...props} />;
    case 'stats': return <Stats {...props} />;
    case 'solve': return <Replay {...props} />;
    case 'settings': return <Settings {...props} />;
    case 'analysis': return <Analysis {...props} />;
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
  if (mobile) return <>{body}<SimBadge /></>;
  return (
    <div className="desk min-h-screen flex flex-col">
      {!FOCUSED.has(name) && <DesktopHeader route={name} />}
      {body}
      {name === 'practice' || !name ? <DesktopFooter /> : null}
      <SimBadge />
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
