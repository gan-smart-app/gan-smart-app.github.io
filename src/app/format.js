const FA = new Intl.NumberFormat('fa-IR', { useGrouping: false });
export const fa = (n) => (n == null ? '' : FA.format(n));
export const faDigits = (s) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

// 00.00 style used by the timer; minutes appear only past 60 s.
export function clock(ms) {
  if (ms == null || !Number.isFinite(ms)) return '00.00';
  const cs = Math.floor(ms / 10);
  const s = Math.floor(cs / 100), c = cs % 100;
  if (s < 60) return String(s).padStart(2, '0') + '.' + String(c).padStart(2, '0');
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '.' + String(c).padStart(2, '0');
}

// Result display: DNF, +2 marker, otherwise seconds with two decimals.
export function resultText(solve, { persian = false } = {}) {
  if (!solve) return '—';
  if (solve.penalty === 'DNF') return 'DNF';
  const ms = solve.rawMs + (solve.penalty === '+2' ? 2000 : 0);
  const t = clock(ms).replace(/^0(\d\.)/, '$1');
  const out = t + (solve.penalty === '+2' ? '+' : '');
  return persian ? faDigits(out) : out;
}

export function msText(ms, { persian = false } = {}) {
  if (ms == null) return null;
  if (ms === Infinity) return 'DNF';
  const t = clock(ms).replace(/^0(\d\.)/, '$1');
  return persian ? faDigits(t) : t;
}

const RTF = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });
export function ago(iso, now = Date.now()) {
  const d = (new Date(iso).getTime() - now) / 1000;
  const a = Math.abs(d);
  if (a < 45) return 'همین الان';
  if (a < 3600) return RTF.format(Math.round(d / 60), 'minute');
  if (a < 86400) return RTF.format(Math.round(d / 3600), 'hour');
  return RTF.format(Math.round(d / 86400), 'day');
}

export const dateFa = (iso) => new Date(iso).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
export const timeFa = (iso) => new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
