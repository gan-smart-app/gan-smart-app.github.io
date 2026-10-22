import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { openStore } from '../core/store.mjs';
import { createAuth } from '../core/auth.mjs';
import { createSync } from '../core/sync.mjs';
import { CubeLink, bluetoothSupport } from '../core/connection.mjs';
import { Practice } from '../core/practice.mjs';
import { applyMove, fromFacelets, toFacelets, SOLVED_FACELETS } from '../core/cube.mjs';
import { solver } from '../core/solverClient.mjs';
import { SimLink } from './sim.js';
import { createAiClient } from '../core/ai.mjs';
import { sessionSummary } from './sessionSummary.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const DEFAULT_SETTINGS = {
  id: 'main',
  inspectionEnabled: false,
  inspectionSeconds: 15,
  goalMs: null,           // no target until the user sets one
  nextMoveHint: true,
  holdFrame: 'yellowUp',  // guides: yellow up, green front
  drillDifficulty: 'medium',
  drillRepetitions: 10,
  playbackSpeed: 1,
  reduceMotion: false,
  aiAutoSession: false,
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
  const [data, setData] = useState({ solves: [], deleted: [], sessions: [], progress: [], favorites: [], challenges: [], conflicts: [] });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [authState, setAuthState] = useState({ status: 'loading' });
  const [syncStatus, setSyncStatus] = useState({ state: 'local', pending: 0 });
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const aiRef = useRef(null);
  const [aiStatus, setAiStatus] = useState({ configured: false, reason: 'no_endpoint' });

  // ---- connection (real or simulator) ----
  const real = useMemo(() => new CubeLink(), []);
  const sim = useMemo(() => new SimLink(), []);
  const [simulated, setSimulated] = useState(false);
  const link = simulated ? sim : real;
  const [device, setDevice] = useState(real.state);
  const [live, setLive] = useState({ facelets: null, lastMove: null, moveKey: 0 });
  const liveModel = useRef(null);
  const moveListeners = useRef(new Set());
  const [simSolves, setSimSolves] = useState([]);
  const [lastSolveId, setLastSolveId] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const practiceRef = useRef(null);
  const [practice, setPractice] = useState(null);

  const reload = useCallback(async () => {
    const store = storeRef.current;
    if (!store) return;
    const [all, sessions, progress, favorites, challenges, conflicts, s] = await Promise.all([
      store.all('solves', { includeDeleted: true }), store.all('sessions'), store.all('progress'),
      store.all('favorites'), store.all('challenges'), store.conflicts(), store.get('settings', 'main'),
    ]);
    const byDate = (a, b) => (a.createdAt < b.createdAt ? -1 : 1);
    setData({
      solves: all.filter((x) => !x.deleted).sort(byDate),
      deleted: all.filter((x) => x.deleted).sort(byDate),
      sessions: sessions.sort(byDate), progress, favorites, challenges, conflicts,
    });
    if (s && !s.deleted) setSettings({ ...DEFAULT_SETTINGS, ...s });
  }, []);

  useEffect(() => {
    let off = [];
    (async () => {
      try {
        const store = await openStore();
        storeRef.current = store;
        const auth = createAuth({ store });
        authRef.current = auth;
        const sync = createSync({ store, auth });
        syncRef.current = sync;
        // Optional Claude proxy; without an endpoint this client never touches the network.
        aiRef.current = createAiClient({
          getToken: () => auth.getIdToken(),
          storage: { get: async (k) => (await store.getCache(k))?.value, set: (k, v) => store.putCache({ id: k, value: v }) },
        });
        off.push(store.on('change', () => reload()));
        off.push(auth.on('change', (st) => setAuthState({ ...st })));
        off.push(sync.on('status', (st) => setSyncStatus({ ...st })));
        await auth.init();
        setAuthState({ ...auth.state });
        setCurrentSessionId((await store.getLocal('currentSession')) || null);
        const sim = await store.getLocal('simulator');
        if (sim) setSimulated(true);
        await reload();
        sync.start();
        await sync.refreshStatus?.();
        setSyncStatus({ ...sync.status });
        setReady(true);
      } catch (e) {
        setFatal('ذخیره‌سازی محلی مرورگر در دسترس نیست: ' + e.message);
      }
    })();
    real.preload().catch(() => {});
    solver.warmup().catch(() => {});
    return () => { off.forEach((f) => typeof f === 'function' && f()); syncRef.current?.stop(); };
  }, [real, reload]);

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

  // Live cube model shared by practice, lessons and the solve guide.
  useEffect(() => {
    setDevice(link.state);
    const p = practiceRef.current;
    if (link === real && link.state.status === 'ready') {
      // The stored snapshot may be older than the cube; wait for a fresh one.
      liveModel.current = null;
      setLive({ facelets: null, lastMove: null, moveKey: 0 });
      p.noCube();
      link.requestState().catch(() => {});
    } else if (link.state.facelets) {
      liveModel.current = fromFacelets(link.state.facelets);
      setLive({ facelets: link.state.facelets, lastMove: null, moveKey: 0 });
      p.setModel(link.state.facelets);
    } else {
      liveModel.current = null;
      setLive({ facelets: null, lastMove: null, moveKey: 0 });
      p.noCube();
    }
    return link.subscribe((e) => {
      if (e.type === 'state') setDevice(e.state);
      else if (e.type === 'facelets') {
        liveModel.current = fromFacelets(e.facelets);
        setLive((l) => ({ facelets: e.facelets, lastMove: null, moveKey: l.moveKey + 1 }));
        p.setModel(e.facelets);
        for (const fn of moveListeners.current) fn({ type: 'facelets', facelets: e.facelets });
      } else if (e.type === 'move') {
        if (!liveModel.current) return;
        liveModel.current = applyMove(liveModel.current, e.move);
        const f = toFacelets(liveModel.current);
        setLive((l) => ({ facelets: f, lastMove: e.move, moveKey: l.moveKey + 1 }));
        p.move(e.move, e.at, e.batchId);
        for (const fn of moveListeners.current) fn({ type: 'move', move: e.move, at: e.at, batchId: e.batchId, facelets: f });
      } else if (e.type === 'invalidate') {
        liveModel.current = null;
        setLive((l) => ({ facelets: null, lastMove: null, moveKey: l.moveKey + 1 }));
        p.invalidate(e.reason);
        for (const fn of moveListeners.current) fn({ type: 'invalidate', reason: e.reason });
      }
    });
  }, [link, real]);

  const refreshAi = useCallback(async () => {
    const ai = aiRef.current;
    if (!ai || !ai.aiAvailable() || authState.status !== 'signedIn') {
      setAiStatus({ configured: false, reason: ai?.aiAvailable() ? 'signed_out' : 'no_endpoint' });
      return;
    }
    setAiStatus(await ai.status());
  }, [authState.status]);
  useEffect(() => { if (ready) refreshAi(); }, [ready, refreshAi]);

  const onCubeEvent = useCallback((fn) => {
    moveListeners.current.add(fn);
    return () => moveListeners.current.delete(fn);
  }, []);

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
      source: simulated ? 'simulator' : 'device', kind: r.kind, scramble: r.scramble, startFacelets: r.startFacelets,
      moves: r.moves.map((x) => ({ m: x.m, t: Math.round(x.t), b: x.b })), movesComplete: true, timing: 'host-receipt', note: '',
    };
    setLastSolveId(solve.id);
    if (simulated) {
      setSimSolves((l) => [...l, solve]);
      return;
    }
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
    // Explicit opt-in only: one request per finalized session version.
    async finalizeSession(id) {
      if (!settings.aiAutoSession || !aiRef.current?.aiAvailable() || !aiStatus.configured || !id) return;
      const s = data.sessions.find((x) => x.id === id);
      const summary = sessionSummary(s, data);
      if (summary?.solves) aiRef.current.autoAnalyzeSession(summary, { enabled: true }).catch(() => {});
    },
    async newSession(name) {
      this.finalizeSession(currentSessionId);
      const s = { id: uuid(), name: name || sessionName(), createdAt: new Date().toISOString(), kind: 'mixed' };
      await storeRef.current.put('sessions', s);
      await storeRef.current.setLocal('currentSession', s.id);
      setCurrentSessionId(s.id);
      return s;
    },
    async selectSession(id) {
      if (id !== currentSessionId) this.finalizeSession(currentSessionId);
      await storeRef.current.setLocal('currentSession', id);
      setCurrentSessionId(id);
    },
    async renameSession(id, name) { return storeRef.current.update('sessions', id, (s) => ({ ...s, name })); },
    async putProgress(rec) {
      const store = storeRef.current;
      const existing = await store.get('progress', rec.id);
      if (existing && !existing.deleted) return store.update('progress', rec.id, (p) => ({ ...p, ...rec }));
      return store.put('progress', rec);
    },
    async toggleFavorite(algId) {
      const store = storeRef.current;
      const existing = await store.get('favorites', algId);
      if (existing && !existing.deleted) return store.remove('favorites', algId);
      if (existing?.deleted) return store.restore('favorites', algId);
      return store.put('favorites', { id: algId, createdAt: new Date().toISOString() });
    },
    async putChallenge(rec) {
      const store = storeRef.current;
      const existing = await store.get('challenges', rec.id);
      if (existing && !existing.deleted) return store.update('challenges', rec.id, (c) => ({ ...c, ...rec }));
      return store.put('challenges', rec);
    },
    async setSimulated(on) {
      if (!on) sim.disconnect();
      await storeRef.current.setLocal('simulator', !!on);
      setSimulated(!!on);
    },
  }), [settings, sim, data, currentSessionId, aiStatus.configured]);

  const value = {
    ready, fatal,
    store: storeRef.current, auth: authRef.current, sync: syncRef.current,
    authState, syncStatus, data, settings, actions,
    currentSessionId,
    link, real, sim, simulated, device, live, onCubeEvent, support: bluetoothSupport(),
    practice: practice || practiceRef.current.state, practiceApi: practiceRef.current,
    simSolves, lastSolveId, saveError, solver,
    ai: aiRef.current, aiStatus, aiEnabled: !!(aiRef.current?.aiAvailable() && aiStatus.configured), refreshAi,
    solvedFacelets: SOLVED_FACELETS,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
