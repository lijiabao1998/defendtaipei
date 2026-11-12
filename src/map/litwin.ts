// v24.32 lit windows at night. From the street an occupied city is not black: while the power is on, a window here and
// there is lit (the yellow of a bulb, the cold white of a fluorescent tube, now and then the blue of a television),
// half of them behind a curtain. The walls are tiled with one window per tile of their texture, so the light is an
// emissive map laid over the same tiles but repeating only every N of them: which windows are lit differs from tile to
// tile, at no cost in geometry or draw calls. Its strength follows the night and the power (setLitWindows).
import * as THREE from 'three';

const N = 8;
const mats: THREE.MeshStandardMaterial[] = [];
function hash(n: number) {
  let x = n >>> 0 || 1;
  return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
}
/** the glass of one tile, as fractions of the tile from its top-left: x, y, w, h; panes side by side */
function litTexture(rect: [number, number, number, number], panes: number, seed: number) {
  const S = 512,
    T = S / N;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  const r = hash(seed);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      if (r() > 0.2) continue;
      const k = r();
      const col = k < 0.5 ? '#ffd9a0' : k < 0.88 ? '#e6f4ee' : '#9ab8e8';
      const x = i * T + rect[0] * T,
        y = j * T + rect[1] * T,
        w = rect[2] * T,
        h = rect[3] * T;
      g.fillStyle = col;
      g.globalAlpha = 0.55 + r() * 0.45;
      g.fillRect(x, y, w, h);
      // a curtain drawn half across, or a blind half down
      g.globalAlpha = 0.6;
      g.fillStyle = '#000';
      const cur = r();
      if (cur < 0.35) g.fillRect(x, y, w * (0.3 + r() * 0.3), h);
      else if (cur < 0.55) g.fillRect(x, y, w, h * (0.3 + r() * 0.3));
      g.globalAlpha = 1;
      // the frame between the panes, and the bars
      for (let p = 1; p < Math.max(2, panes * 2); p++) g.fillRect(x + (w * p) / Math.max(2, panes * 2) - 0.5, y, 1, h);
      g.fillRect(x, y + h * 0.45, w, 1);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** light the windows of this wall material (its texture has one window per tile, at rect) */
export function addLit(
  m: THREE.MeshStandardMaterial,
  rect: [number, number, number, number],
  panes: number,
  seed: number,
  share?: THREE.Texture,
) {
  const t = share ?? litTexture(rect, panes, seed);
  if (!share && m.map) t.repeat.copy(m.map.repeat).multiplyScalar(1 / N);
  else if (!share) t.repeat.set(1 / N, 1 / N);
  m.emissiveMap = t;
  m.emissive = new THREE.Color(0xffffff);
  m.emissiveIntensity = 0;
  m.needsUpdate = true;
  mats.push(m);
  return t;
}
/** k: 0 (day, or no power) … 1 (night with the power on) */
export function setLitWindows(k: number) {
  for (const m of mats) m.emissiveIntensity = k * 0.9;
}
export const litStats = () => ({ mats: mats.length, k: mats[0]?.emissiveIntensity ?? 0 });
