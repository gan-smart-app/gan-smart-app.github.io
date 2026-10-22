import { useEffect, useRef, useState } from 'react';

// Move sequence rendered left-to-right inside RTL text.
export function Alg({ moves, className = '' }) {
  const text = Array.isArray(moves) ? moves.join(' ') : moves;
  return <bdi dir="ltr" className={'move-font ' + className}>{text}</bdi>;
}

export function Modal({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}
      className={'card text-ink p-0 shadow-2xl shadow-black/50 w-[calc(100%-32px)] ' + (wide ? 'max-w-2xl' : 'max-w-md')}>
      {open && (
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-base">{title}</h2>
            <button onClick={onClose} className="icon-btn" aria-label="بستن"><i className="fa-solid fa-xmark"></i></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// Accessible on/off switch with a full-size touch target.
export function Switch({ on, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className="group inline-flex items-center justify-center h-9 shrink-0 disabled:opacity-40">
      <span className={'relative block w-10 h-6 rounded-full transition-colors ' + (on ? 'bg-accent' : 'bg-raised border border-strong')}>
        <span className={'absolute top-1/2 -translate-y-1/2 w-[18px] h-[18px] rounded-full shadow transition-all ' + (on ? 'left-[3px] bg-white' : 'left-[19px] bg-muted')}></span>
      </span>
    </button>
  );
}

export function Stat({ label, value, hint, tone = '', className = '', compact = false }) {
  return (
    <div className={'rounded-xl bg-bg border border-line ' + (compact ? 'p-3 ' : 'p-3.5 ') + className}>
      <div className="stat-label mb-1">{label}</div>
      {value == null
        ? <div className={'text-faint flex items-center ' + (compact ? 'text-base h-6' : 'text-xs h-7')} title="داده کافی نیست">{compact ? '—' : 'داده کافی نیست'}</div>
        : <div className={'stat-value ' + (compact ? '!text-base ' : '') + tone}>{value}</div>}
      {hint && <div className="text-[11px] text-faint mt-1">{hint}</div>}
    </div>
  );
}

// Short-lived notice with an optional undo action.
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = (text, action, ms = 6000) => {
    clearTimeout(timer.current);
    setToast({ text, action, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), ms);
  };
  const view = toast && (
    <div key={toast.key} role="status" className="fixed bottom-24 lg:bottom-8 right-1/2 translate-x-1/2 z-[70] card bg-raised shadow-xl shadow-black/40 ps-4 pe-2 py-2 flex items-center justify-between gap-4 min-w-[280px]">
      <div className="flex items-center gap-2.5">
        <i className="fa-solid fa-circle-check text-ok"></i>
        <span className="text-sm">{toast.text}</span>
      </div>
      {toast.action && (
        <button className="btn-ghost btn-sm text-accent" onClick={() => { toast.action.run(); setToast(null); }}>{toast.action.label}</button>
      )}
    </div>
  );
  return [view, show];
}

export function Spinner({ text }) {
  return (
    <div className="inline-flex items-center gap-3 text-sm text-muted" role="status">
      <i className="fa-solid fa-circle-notch animate-spin text-accent"></i>
      <span>{text}</span>
    </div>
  );
}

export function Empty({ icon = 'fa-plus', title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center rounded-card border border-dashed border-line">
      <div className="w-12 h-12 rounded-xl bg-raised flex items-center justify-center mb-4">
        <i className={'fa-solid ' + icon + ' text-muted text-lg'}></i>
      </div>
      <h4 className="font-semibold text-sm mb-1">{title}</h4>
      {text && <p className="text-sm text-muted leading-7 mb-5 max-w-sm">{text}</p>}
      {action}
    </div>
  );
}

export function download(name, data, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useNow(active, ms = 0) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    let raf, t;
    const tick = () => { set((n) => n + 1); raf = ms ? (t = setTimeout(tick, ms)) : requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [active, ms]);
}
