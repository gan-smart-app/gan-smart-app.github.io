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
      className={'bg-[#101019] text-slate-200 border border-[#292c3b] rounded-2xl p-0 backdrop:bg-black/70 w-[calc(100%-32px)] ' + (wide ? 'max-w-2xl' : 'max-w-md')}>
      {open && (
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">{title}</h2>
            <button onClick={onClose} className="w-11 h-11 rounded-xl hover:bg-white/5 text-slate-400" aria-label="بستن"><i className="fa-solid fa-xmark"></i></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
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
    <div key={toast.key} role="status" className="fixed bottom-28 lg:bottom-8 right-1/2 translate-x-1/2 z-[70] bg-slate-800 border border-slate-700 p-3 rounded-xl flex items-center justify-between gap-4 shadow-xl min-w-[260px]">
      <div className="flex items-center gap-3">
        <i className="fa-solid fa-circle-check text-green-400"></i>
        <span className="text-xs">{toast.text}</span>
      </div>
      {toast.action && (
        <button className="text-xs font-bold accent-cyan ml-2 min-h-[36px]" onClick={() => { toast.action.run(); setToast(null); }}>{toast.action.label}</button>
      )}
    </div>
  );
  return [view, show];
}

export function Spinner({ text }) {
  return (
    <div className="flex items-center gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800" role="status">
      <i className="fa-solid fa-spinner animate-spin text-cyan-400"></i>
      <span className="text-xs text-slate-400">{text}</span>
    </div>
  );
}

export function Empty({ icon = 'fa-plus', title, text, action }) {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/20">
      <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-6">
        <i className={'fa-solid ' + icon + ' text-slate-500 text-2xl'}></i>
      </div>
      <h4 className="font-bold text-sm mb-2">{title}</h4>
      {text && <p className="text-xs text-slate-400 leading-relaxed mb-6 max-w-sm">{text}</p>}
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
