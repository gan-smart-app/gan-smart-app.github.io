import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SOLVED_FACELETS } from '../core/cube.mjs';

// Standard sticker colours (same as the design): U white, R red, F green, D yellow, L orange, B blue.
export const STICKER = { U: 0xffffff, R: 0xb71234, F: 0x009b48, D: 0xffd500, L: 0xff5800, B: 0x0046ad };
const CAMERA_HOME = new THREE.Vector3(5, 5, 5);

// Facelet index → sticker position and outward normal (cubejs layout).
function faceletGeometry() {
  const list = [];
  const add = (face, fn, normal) => {
    for (let i = 0; i < 9; i++) {
      const r = Math.floor(i / 3), c = i % 3;
      list.push({ face, pos: new THREE.Vector3(...fn(r, c)), normal: new THREE.Vector3(...normal) });
    }
  };
  add('U', (r, c) => [c - 1, 1, r - 1], [0, 1, 0]);
  add('R', (r, c) => [1, 1 - r, 1 - c], [1, 0, 0]);
  add('F', (r, c) => [c - 1, 1 - r, 1], [0, 0, 1]);
  add('D', (r, c) => [c - 1, -1, 1 - r], [0, -1, 0]);
  add('L', (r, c) => [-1, 1 - r, c - 1], [-1, 0, 0]);
  add('B', (r, c) => [1 - c, 1 - r, -1], [0, 0, -1]);
  return list;
}
const GEOMETRY = faceletGeometry();
const AXIS = { U: ['y', 1, -1], D: ['y', -1, 1], R: ['x', 1, -1], L: ['x', -1, 1], F: ['z', 1, -1], B: ['z', -1, 1] };

const CubeView = forwardRef(function CubeView(
  { facelets = SOLVED_FACELETS, lastMove = null, moveKey = 0, frame = 'whiteUp', height = 400, dim = false, label, className = '', speed = 1 },
  ref,
) {
  const host = useRef(null);
  const api = useRef(null);

  useImperativeHandle(ref, () => ({ resetCamera: () => api.current?.resetCamera() }), []);

  useEffect(() => {
    const el = host.current;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      el.dataset.nogl = '1';
      return undefined;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.copy(CAMERA_HOME);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reduce;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 14;
    scene.add(new THREE.AmbientLight(0xffffff, 0.8 * Math.PI));
    const light = new THREE.DirectionalLight(0xffffff, 0.5 * Math.PI);
    light.position.set(10, 10, 10);
    scene.add(light);

    const root = new THREE.Group();
    scene.add(root);
    const body = new THREE.Group();
    root.add(body);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const boxGeo = new THREE.BoxGeometry(0.95, 0.95, 0.95);
    const cubies = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const m = new THREE.Mesh(boxGeo, bodyMat);
      m.position.set(x, y, z);
      m.userData.home = m.position.clone();
      body.add(m);
      cubies.push(m);
    }
    const stickerGeo = new THREE.PlaneGeometry(0.82, 0.82);
    const stickers = GEOMETRY.map((g) => {
      const mat = new THREE.MeshLambertMaterial({ color: STICKER[g.face], side: THREE.DoubleSide });
      const s = new THREE.Mesh(stickerGeo, mat);
      s.position.copy(g.pos).addScaledVector(g.normal, 0.48);
      s.lookAt(s.position.clone().add(g.normal));
      s.userData.home = { p: s.position.clone(), q: s.quaternion.clone() };
      body.add(s);
      return s;
    });

    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let anim = null;
    let pendingColors = null;
    const paint = (str) => {
      for (let i = 0; i < 54; i++) stickers[i].material.color.setHex(STICKER[str[i]] ?? 0x333333);
    };
    const restore = () => {
      for (const s of stickers) { s.position.copy(s.userData.home.p); s.quaternion.copy(s.userData.home.q); }
      for (const c of cubies) { c.position.copy(c.userData.home); c.quaternion.identity(); }
    };
    const finish = () => {
      if (!anim) return;
      anim.pivot.children.slice().forEach((o) => body.attach(o));
      body.remove(anim.pivot);
      anim = null;
      restore();
      if (pendingColors) { paint(pendingColors); pendingColors = null; }
    };

    let raf = 0;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      if (anim) {
        const k = Math.min(1, (t - anim.start) / anim.duration);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        anim.pivot.quaternion.setFromAxisAngle(anim.axis, anim.angle * e);
        if (k >= 1) finish();
      }
      controls.update();
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    api.current = {
      setFrame(f) { root.rotation.set(0, 0, f === 'yellowUp' ? Math.PI : 0); },
      paint(str) { finish(); paint(str); },
      animate(move, str) {
        finish();
        const spec = AXIS[move?.[0]];
        if (!spec || reduce || document.documentElement.classList.contains('reduce-motion')) { paint(str); return; }
        const [axisName, layer, sign] = spec;
        const turns = move.endsWith('2') ? 2 : move.endsWith("'") ? -1 : 1;
        const pivot = new THREE.Group();
        body.add(pivot);
        for (const o of [...cubies, ...stickers]) if (Math.round(o.position[axisName]) === layer) pivot.attach(o);
        const axis = new THREE.Vector3(axisName === 'x' ? 1 : 0, axisName === 'y' ? 1 : 0, axisName === 'z' ? 1 : 0);
        anim = { pivot, axis, angle: sign * turns * Math.PI / 2, start: performance.now(), duration: (turns === 2 ? 220 : 150) / speedRef.current };
        pendingColors = str;
      },
      resetCamera() { camera.position.copy(CAMERA_HOME); controls.target.set(0, 0, 0); controls.update(); },
    };
    api.current.setFrame(frame);
    paint(facelets);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      stickerGeo.dispose();
      boxGeo.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
    // The scene is created once; later props are pushed through api.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => { api.current?.setFrame(frame); }, [frame]);

  const shown = useRef({ facelets: null, moveKey: null });
  useEffect(() => {
    if (!api.current) return;
    const prev = shown.current;
    // Animate a single new move only; moves batched in one render are painted directly.
    if (lastMove && moveKey === prev.moveKey + 1 && prev.facelets) api.current.animate(lastMove, facelets);
    else if (facelets !== prev.facelets) api.current.paint(facelets);
    shown.current = { facelets, moveKey };
  }, [facelets, lastMove, moveKey]);

  return (
    <div
      ref={host}
      className={'cube-stage relative ' + className}
      style={{ height, opacity: dim ? 0.45 : 1 }}
      role="img"
      aria-label={label || 'نمای سه‌بعدی مکعب؛ چرخاندن نما فقط دوربین را تغییر می‌دهد'}
    />
  );
});

export default CubeView;
