// Private account over Firebase Auth REST. There is deliberately no sign-up:
// the single owner account is created by hand in the Firebase console.
// The refresh token lives only in IndexedDB meta (never localStorage,
// backups or diagnostics); the ID token only in memory.

import { emitter } from './store.mjs';

export function firebaseConfig(env = import.meta.env || {}) {
  const apiKey = env.VITE_FIREBASE_API_KEY || '';
  const projectId = env.VITE_FIREBASE_PROJECT_ID || '';
  return { apiKey, projectId, configured: !!(apiKey && projectId) };
}

const MESSAGES = {
  INVALID_LOGIN_CREDENTIALS: 'ایمیل یا گذرواژه درست نیست.',
  INVALID_PASSWORD: 'ایمیل یا گذرواژه درست نیست.',
  EMAIL_NOT_FOUND: 'ایمیل یا گذرواژه درست نیست.',
  INVALID_EMAIL: 'قالب ایمیل درست نیست.',
  MISSING_PASSWORD: 'گذرواژه را وارد کن.',
  USER_DISABLED: 'این حساب غیرفعال شده است.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'تلاش‌های زیادی انجام شد؛ چند دقیقه بعد دوباره امتحان کن.',
  TOKEN_EXPIRED: 'نشست منقضی شد؛ دوباره وارد شو.',
  INVALID_REFRESH_TOKEN: 'نشست منقضی شد؛ دوباره وارد شو.',
  USER_NOT_FOUND: 'حساب پیدا نشد؛ دوباره وارد شو.',
  OPERATION_NOT_ALLOWED: 'ورود با ایمیل در Firebase فعال نشده است.',
  API_KEY_INVALID: 'تنظیم Firebase این نسخه نادرست است.',
};

export class AuthError extends Error {
  constructor(code, network = false) {
    super(network ? 'ارتباط با سرور برقرار نشد؛ اینترنت را بررسی کن.' : MESSAGES[code] || 'ورود انجام نشد. (' + code + ')');
    this.code = code;
    this.network = network;
    // Credential problems end the session; network problems do not.
    this.fatal = !network && code !== 'TOO_MANY_ATTEMPTS_TRY_LATER';
  }
}

async function call(fetchFn, url, init) {
  let res;
  try {
    res = await fetchFn(url, init);
  } catch {
    throw new AuthError('NETWORK', true);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = body?.error?.message || 'HTTP_' + res.status;
    throw new AuthError(String(raw).split(' ')[0].split(':')[0]);
  }
  return body;
}

export function createAuth({ store, config = firebaseConfig(), fetch: fetchFn = globalThis.fetch.bind(globalThis), now = () => Date.now() }) {
  const events = emitter();
  let state = { status: config.configured ? 'loading' : 'unconfigured', email: null, uid: null, error: null };
  let session = null; // { refreshToken, uid, email }
  let idToken = null;
  let expiresAt = 0;
  let refreshing = null;

  const set = (patch) => {
    state = { ...state, ...patch };
    events.emit('change', state);
  };

  async function persist(s) {
    session = s;
    await store.setMeta('auth', s || undefined);
  }

  async function refresh() {
    if (!session) throw new AuthError('TOKEN_EXPIRED');
    const body = await call(fetchFn, 'https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(config.apiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refreshToken),
    });
    idToken = body.id_token;
    expiresAt = now() + (Number(body.expires_in) || 3600) * 1000;
    if (body.refresh_token && body.refresh_token !== session.refreshToken) await persist({ ...session, refreshToken: body.refresh_token });
    return idToken;
  }

  return {
    on: events.on,
    get state() {
      return state;
    },
    get configured() {
      return config.configured;
    },
    get projectId() {
      return config.projectId;
    },

    async init() {
      if (!config.configured) return state;
      const saved = await store.getMeta('auth');
      if (saved?.refreshToken && saved.uid) {
        session = saved;
        set({ status: 'signedIn', email: saved.email, uid: saved.uid, error: null });
      } else set({ status: 'signedOut' });
      return state;
    },

    async signIn(email, password) {
      if (!config.configured) throw new AuthError('API_KEY_INVALID');
      set({ status: 'signingIn', error: null });
      try {
        const body = await call(fetchFn, 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(config.apiKey), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: String(email).trim(), password, returnSecureToken: true }),
        });
        idToken = body.idToken;
        expiresAt = now() + (Number(body.expiresIn) || 3600) * 1000;
        await persist({ refreshToken: body.refreshToken, uid: body.localId, email: body.email });
        set({ status: 'signedIn', email: body.email, uid: body.localId, error: null });
        return state;
      } catch (e) {
        set({ status: 'signedOut', error: e.message });
        throw e;
      }
    },

    // Local sign-out: forgets tokens on this device. Local data stays.
    async signOut() {
      idToken = null;
      expiresAt = 0;
      await persist(null);
      set({ status: config.configured ? 'signedOut' : 'unconfigured', email: null, uid: null, error: null });
    },

    // Fresh ID token for API calls; concurrent callers share one refresh.
    async getIdToken(force = false) {
      if (!session) return null;
      if (!force && idToken && now() < expiresAt - 60000) return idToken;
      refreshing ||= refresh().finally(() => (refreshing = null));
      try {
        return await refreshing;
      } catch (e) {
        if (e.fatal) {
          await persist(null);
          idToken = null;
          set({ status: 'signedOut', email: null, uid: null, error: e.message });
        }
        throw e;
      }
    },
  };
}
