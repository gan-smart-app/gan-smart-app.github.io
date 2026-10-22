import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { openStore } from '../core/store.mjs';
import { createAuth } from '../core/auth.mjs';
import { createSync } from '../core/sync.mjs';
import { CubeLink, bluetoothSupport } from '../core/connection.mjs';
import { Practice } from '../core/practice.mjs';
import { applyMove, fromFacelets, toFacelets } from '../core/cube.mjs';
import { solver } from '../core/solverClient.mjs';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const DEFAULT_SETTINGS = {
  id: 'main',
  inspectionEnabled: false,
  inspectionSeconds: 15,
  goalMs: null, // no target until the user sets one
  reduceMotion: false,
};

const uuid = () => crypto.randomUUID();

function sessionName(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'تمرین شب';
  if (h < 12) return 'تمرین صبح';
  if (h < 15) return 'تمرین ظهر';
  if (h < 19) return 'تمرین عصر';
  return 'تمرین شب';
}

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState(null);
  const storeRef = useRef(null);
  const authRef = useRef(null);
  const syncRef = useRef(null);
  const [data, setData] = useState({ solves: [], deleted: [], sessions: [], conflicts: [] });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [authState, setAuthState] = useState({ status: 'loading' });
  const [syncStatus, setSyncStatus] = useState({ state: 'local', pending: 0 });
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // ---- connection ----
  const link = useMemo(() => new CubeLink(), []);
  const [device, setDevice] = useState(link.state);
  const [live, setLive] = useState({ facelets: null, lastMove: null, moveKey: 0 });
  const liveModel = useRef(null);
  const [lastSolveId, setLastSolveId] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const practiceRef = useRef(null);
  const [practice, setPractice] = useState(null);

  const reload = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    const [all, sessions, conflicts, s] = await Promise.all([
      store.all('solves', { includeDeleted: true }), store.all('sessions'), store.conflicts(), store.get('settings', 'main'),
    ]);
    const byDate = (a, b) => (a.createdAt < b.createdAt ? -1 : 1);
    setData({
      solves: all.filter((x) => !x.deleted).sort(byDate),
      deleted: all.filter((x) => x.deleted).sort(byDate),
      sessions: sessions.sort(byDate), conflicts,
    });
    if (s && !s.deleted) setSettings({ ...DEFAULT_SETTINGS, ...s });
  }, []);

  useEffect(() => {
    const off = [];
    (async () => {
      try {
        const store = await openStore();
        storeRef.current = store;
        const auth = createAuth({ store });
        authRef.current = auth;
        const sync = createSync({ store, auth });
        syncRef.current = sync;
        off.push(store.on('change', () => reload()));
        off.push(auth.on('change', (st) => setAuthState({ ...st })));
        off.push(sync.on('status', (st) => setSyncStatus({ ...st })));
        await auth.init();
        setAuthState({ ...auth.state });
        setCurrentSessionId((await store.getLocal('currentSession')) || null);
        await reload();
        sync.start();
        await sync.refreshStatus?.();
        setSyncStatus({ ...sync.status });
        setReady(true);
      } catch (e) {
        setFatal('ذخیره‌سازی محلی مرورگر در دسترس نیست: ' + e.message);
      }
    })();
    link.preload().catch(() => {});
    solver.warmup().catch(() => {});
    return () => { off.forEach((f) => typeof f === 'function' && f()); syncRef.current?.stop(); };
  }, [link, reload]);

  // ---- practice machine ----
  const saveResult = useRef(null);
  if (!practiceRef.current) {
    practiceRef.current = new Practice({
      findPath: (from, to) => solver.path(from, to),
      onChange: (s) => setPractice({ ...s }),
      onResult: (r) => saveResult.current?.(r),
    });
  }

  useEffect(() => {
    practiceRef.current.settings({ inspectionEnabled: settings.inspectionEnabled, inspectionMs: settings.inspectionSeconds * 1000 });
  }, [settings.inspectionEnabled, settings.inspectionSeconds]);

  // Live cube model shared by the practice screen and the connection page.
  useEffect(() => {
    const p = practiceRef.current;
    p.noCube();
    return link.subscribe((e) => {
      if (e.type === 'state') setDevice(e.state);
      else if (e.type === 'facelets') {
        liveModel.current = fromFacelets(e.facelets);
        setLive((l) => ({ facelets: e.facelets, lastMove: null, moveKey: l.moveKey + 1 }));
        p.setModel(e.facelets);
      } else if (e.type === 'move') {
        if (!liveModel.current) return;
        liveModel.current = applyMove(liveModel.current, e.move);
        const f = toFacelets(liveModel.current);
        setLive((l) => ({ facelets: f, lastMove: e.move, moveKey: l.moveKey + 1 }));
        p.move(e.move, e.at, e.batchId);
      } else if (e.type === 'invalidate') {
        liveModel.current = null;
        setLive((l) => ({ facelets: null, lastMove: null, moveKey: l.moveKey + 1 }));
        p.invalidate(e.reason);
      }
    });
  }, [link]);

  // ---- data actions ----
  const ensureSession = useCallback(async () => {
    const store = storeRef.current;
    if (currentSessionId) {
      const s = await store.get('sessions', currentSessionId);
      if (s && !s.deleted) return s.id;
    }
    const s = { id: uuid(), name: sessionName(), createdAt: new Date().toISOString(), kind: 'mixed' };
    await store.put('sessions', s);
    await store.setLocal('currentSession', s.id);
    setCurrentSessionId(s.id);
    return s.id;
  }, [currentSessionId]);

  saveResult.current = async (r) => {
    const solve = {
      id: uuid(), createdAt: new Date().toISOString(), rawMs: r.rawMs, penalty: r.penalty || null, valid: true,
      source: 'device', kind: r.kind, scramble: r.scramble, startFacelets: r.startFacelets,
      moves: r.moves.map((x) => ({ m: x.m, t: Math.round(x.t), b: x.b })), movesComplete: true, timing: 'host-receipt', note: '',
    };
    setLastSolveId(solve.id);
    try {
      solve.sessionId = await ensureSession();
      await storeRef.current.put('solves', solve);
      setSaveError(null);
    } catch (e) {
      setSaveError('این حل در حافظهٔ مرورگر ذخیره نشد: ' + (e?.message || 'خطای ذخیره‌سازی'));
    }
  };

  const actions = useMemo(() => ({
    async updateSolve(id, patch) { return storeRef.current.update('solves', id, (s) => ({ ...s, ...patch })); },
    async deleteSolve(id) { return storeRef.current.remove('solves', id); },
    async restoreSolve(id) { return storeRef.current.restore('solves', id); },
    async saveSettings(patch) {
      const next = { ...settings, ...patch, id: 'main' };
      setSettings(next);
      const store = storeRef.current;
      const existing = await store.get('settings', 'main');
      if (existing && !existing.deleted) await store.update('settings', 'main', () => next);
      else await store.put('settings', next);
    },
    async newSession(name) {
      const s = { id: uuid(), name: name || sessionName(), createdAt: new Date().toISOString(), kind: 'mixed' };
      await storeRef.current.put('sessions', s);
      await storeRef.current.setLocal('currentSession', s.id);
      setCurrentSessionId(s.id);
      return s;
    },
    async selectSession(id) {
      await storeRef.current.setLocal('currentSession', id);
      setCurrentSessionId(id);
    },
    async renameSession(id, name) { return storeRef.current.update('sessions', id, (s) => ({ ...s, name })); },
  }), [settings]);

  const value = {
    ready, fatal,
    store: storeRef.current, auth: authRef.current, sync: syncRef.current,
    authState, syncStatus, data, settings, actions, currentSessionId,
    link, device, live, support: bluetoothSupport(),
    practice: practice || practiceRef.current.state, practiceApi: practiceRef.current,
    lastSolveId, saveError, solver,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
