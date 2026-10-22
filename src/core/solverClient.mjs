// Promise wrapper around the solver worker.
let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/solver.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      e.data.ok ? p.resolve(e.data.value) : p.reject(new Error(e.data.error));
    };
  }
  return worker;
}

function call(type, args) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, type, args });
  });
}

export const solver = {
  warmup: () => call('init'),
  scramble: () => call('scramble'),
  path: (from, to) => call('path', { from, to }),
  solve: (state) => call('solve', { state }),
};
