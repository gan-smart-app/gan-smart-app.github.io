import { useEffect, useMemo, useState } from 'react';
import { applyMove, fromFacelets, toFacelets, SOLVED_FACELETS } from '../core/cube.mjs';

// Step-by-step playback of a move list from a start state. Timing is uniform
// (one move per beat at the chosen speed): recorded receipt times are not
// device timestamps, so pauses are not reconstructed.
export function usePlayback(startFacelets, moves, { beatMs = 450 } = {}) {
  const frames = useMemo(() => {
    let s = fromFacelets(startFacelets || SOLVED_FACELETS);
    if (!s) return null;
    const out = [toFacelets(s)];
    for (const m of moves) {
      s = applyMove(s, m);
      out.push(toFacelets(s));
    }
    return out;
  }, [startFacelets, moves]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [key, setKey] = useState(0);
  const [anim, setAnim] = useState(null);
  const total = moves.length;

  useEffect(() => { setIndex(0); setPlaying(false); }, [startFacelets, moves]);

  useEffect(() => {
    if (!playing) return undefined;
    if (index >= total) { setPlaying(false); return undefined; }
    const t = setTimeout(() => { setAnim(moves[index]); setIndex(index + 1); setKey((k) => k + 1); }, beatMs / speed);
    return () => clearTimeout(t);
  }, [playing, index, total, speed, beatMs, moves]);

  const go = (i) => { setPlaying(false); setAnim(null); setIndex(Math.max(0, Math.min(total, i))); setKey((k) => k + 1); };
  return {
    valid: !!frames,
    facelets: frames ? frames[index] : startFacelets,
    // Animate only single forward steps; jumps repaint directly.
    lastMove: anim,
    moveKey: key,
    index, total, playing, speed, setSpeed,
    toggle: () => { if (index >= total) { setAnim(null); setIndex(0); setKey((k) => k + 1); } setPlaying((p) => !p); },
    next: () => { setPlaying(false); if (index < total) { setAnim(moves[index]); setIndex(index + 1); setKey((k) => k + 1); } },
    prev: () => go(index - 1),
    seek: go,
    reset: () => go(0),
  };
}
