// Verifies Firebase Auth ID tokens (RS256) with Web Crypto, as documented for
// third-party backends: signature against Google's securetoken keys, aud =
// project id, iss = https://securetoken.google.com/<project>, valid times,
// non-empty sub. The caller additionally requires sub === OWNER_UID.

export const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const b64urlBytes = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

export function createVerifier({ projectId, fetchImpl = fetch, now = () => Date.now() }) {
  let cache = { keys: null, until: 0 };

  async function keyFor(kid) {
    if (!cache.keys || now() > cache.until || !cache.keys[kid]) {
      const res = await fetchImpl(JWKS_URL);
      if (!res.ok) throw new Error('jwks');
      const body = await res.json();
      const maxAge = Number(/max-age=(\d+)/.exec(res.headers?.get?.('cache-control') || '')?.[1] || 3600);
      const keys = {};
      for (const jwk of body.keys || []) keys[jwk.kid] = jwk;
      cache = { keys, until: now() + maxAge * 1000 };
    }
    const jwk = cache.keys[kid];
    if (!jwk) return null;
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }

  // Returns the token claims, or null for any invalid token.
  return async function verify(token) {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    let header, claims;
    try {
      header = b64urlJson(parts[0]);
      claims = b64urlJson(parts[1]);
    } catch {
      return null;
    }
    if (header.alg !== 'RS256' || !header.kid) return null;
    const key = await keyFor(header.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]),
    );
    if (!ok) return null;
    const t = Math.floor(now() / 1000);
    if (claims.aud !== projectId) return null;
    if (claims.iss !== 'https://securetoken.google.com/' + projectId) return null;
    if (!(claims.exp > t) || !(claims.iat <= t + 60)) return null;
    if (claims.auth_time !== undefined && !(claims.auth_time <= t + 60)) return null;
    if (typeof claims.sub !== 'string' || !claims.sub) return null;
    return claims;
  };
}
