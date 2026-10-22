// Static isometric view (U, F, R faces) of a facelet string, used for case
// diagrams and small previews. In the yellow-up frame the view is the cube
// turned z2: top = model D, front = F, right = model L (each rotated 180°).
const COLORS = { U: '#f8fafc', R: '#cf163c', F: '#009b48', D: '#ffdf00', L: '#ff7a12', B: '#125bc0', X: '#3a3f52' };

function faces(f, frame) {
  const part = (i) => f.slice(i * 9, i * 9 + 9);
  const rev = (s) => s.split('').reverse().join('');
  if (frame === 'yellowUp') return { top: rev(part(3)), front: rev(part(2)), right: rev(part(4)) };
  return { top: part(0), front: part(2), right: part(1) };
}

// mask: 'oll' greys every top-layer sticker that is not the top colour and all
// lower layers; 'll' keeps only the top layer in colour; null shows everything.
export default function IsoCube({ facelets, frame = 'whiteUp', size = 120, mask = null, label }) {
  if (!facelets) return null;
  const { top, front, right } = faces(facelets, frame);
  const topColor = top[4];
  const s = 22, cx = 80, cy = 22; // sticker edge and apex
  const ax = s * Math.cos(Math.PI / 6), ay = s * Math.sin(Math.PI / 6);
  const polys = [];
  const quad = (pts, color, key) => polys.push(<polygon key={key} points={pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ')} fill={color} stroke="#080a10" strokeWidth="2" strokeLinejoin="round" />);
  const shade = (c, layerTop, onTop) => {
    if (!mask) return COLORS[c];
    if (mask === 'oll') return onTop && c === topColor ? COLORS[c] : COLORS.X;
    if (mask === 'll') return layerTop ? COLORS[c] : COLORS.X;
    return COLORS[c];
  };
  // Top face: row r from back to front, column c from left to right.
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const o = [cx + (c - r) * ax, cy + (c + r) * ay];
    quad([o, [o[0] + ax, o[1] + ay], [o[0], o[1] + 2 * ay], [o[0] - ax, o[1] + ay]], shade(top[r * 3 + c], true, true), 't' + r + c);
  }
  // Front face (left side of the drawing).
  const fo = [cx - 3 * ax, cy + 3 * ay];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const o = [fo[0] + c * ax, fo[1] + c * ay + r * s];
    quad([o, [o[0] + ax, o[1] + ay], [o[0] + ax, o[1] + ay + s], [o[0], o[1] + s]], shade(front[r * 3 + c], r === 0, false), 'f' + r + c);
  }
  // Right face.
  const ro = [cx, cy + 6 * ay];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const o = [ro[0] + c * ax, ro[1] - c * ay + r * s];
    quad([o, [o[0] + ax, o[1] - ay], [o[0] + ax, o[1] - ay + s], [o[0], o[1] + s]], shade(right[r * 3 + c], r === 0, false), 'r' + r + c);
  }
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={label || 'نمای حالت مکعب'} className="rubik-art" style={{ maxWidth: '100%', height: 'auto', filter: size > 100 ? 'drop-shadow(0 10px 14px #0006)' : undefined }}>
      {polys}
    </svg>
  );
}
