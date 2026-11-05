// @lijiabao/character-rig — v17.2 procedural fabric (baseline DefendTaipei-Lab src/map/fabric.ts): shared canvas normal / roughness / colour maps for the mannequin wardrobe
// (cotton weave, denim twill, plaid, leather, gear webbing). One material per fabric, shared by every rig;
// garment colour still comes from vertex colours, so the maps only add the weave, wear and sheen.
import * as THREE from 'three';

export type Fabric = 'cotton' | 'denim' | 'plaid' | 'leather' | 'gear' | 'knit';

const N = 128;
function canvas(draw: (g: CanvasRenderingContext2D) => void, rep: number) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  draw(g);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  return t;
}
// height field -> tangent-space normal map
function normalFrom(h: (x: number, y: number) => number, rep: number, k = 2) {
  return canvas(g => {
    const im = g.createImageData(N, N);
    const H = (x: number, y: number) => h((x + N) % N, (y + N) % N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = (H(x + 1, y) - H(x - 1, y)) * k,
          dy = (H(x, y + 1) - H(x, y - 1)) * k;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * N + x) * 4;
        im.data[i] = (-dx / l) * 127 + 128;
        im.data[i + 1] = (-dy / l) * 127 + 128;
        im.data[i + 2] = (1 / l) * 127 + 128;
        im.data[i + 3] = 255;
      }
    g.putImageData(im, 0, 0);
  }, rep);
}
const rnd = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const HF: Record<Fabric, (x: number, y: number) => number> = {
  // plain weave: alternating over/under
  cotton: (x, y) => 0.5 + 0.25 * Math.sin((x / 2) * Math.PI) * Math.sin((y / 2) * Math.PI) + 0.1 * rnd(x, y),
  // 2/1 twill: diagonal ribs
  denim: (x, y) => 0.5 + 0.4 * Math.sin(((x + y) / 4) * Math.PI * 2) + 0.15 * rnd(x, y),
  plaid: (x, y) => 0.5 + 0.25 * Math.sin((x / 2) * Math.PI) * Math.sin((y / 2) * Math.PI),
  leather: (x, y) => 0.5 + 0.3 * rnd(x >> 2, y >> 2) + 0.1 * rnd(x, y),
  gear: (x, y) => 0.5 + 0.35 * Math.sin((y / 3) * Math.PI * 2) + 0.1 * rnd(x, y),
  knit: (x, y) => 0.5 + 0.4 * Math.abs(Math.sin(((x % 8) / 8) * Math.PI)) * Math.sin((y / 6) * Math.PI * 2),
};
const SPEC: Record<Fabric, { rep: number; rough: number; k: number }> = {
  cotton: { rep: 6, rough: 0.9, k: 1.5 },
  denim: { rep: 6, rough: 0.82, k: 2.5 },
  plaid: { rep: 3, rough: 0.88, k: 1.2 },
  leather: { rep: 3, rough: 0.45, k: 1.2 },
  gear: { rep: 5, rough: 0.85, k: 2 },
  knit: { rep: 4, rough: 0.95, k: 2 },
};
// light tartan multiplied over the vertex colour (stays tintable)
const plaidMap = () =>
  canvas(g => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, N, N);
    for (const [o, w, a] of [
      [0, 24, 0.38],
      [40, 10, 0.2],
      [80, 24, 0.38],
      [112, 4, 0.5],
    ] as const) {
      g.fillStyle = `rgba(20,20,40,${a})`;
      g.fillRect(o, 0, w, N);
      g.fillRect(0, o, N, w);
    }
    g.fillStyle = 'rgba(255,240,220,.6)';
    g.fillRect(60, 0, 2, N);
    g.fillRect(0, 60, N, 2);
  }, 3);
// faded wear (denim fading, scuffs) through a soft colour map
const wearMap = (rep: number) =>
  canvas(g => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`;
      g.fillRect(Math.random() * N, Math.random() * N, 1 + Math.random() * 10, 1 + Math.random() * 2);
    }
  }, rep);

const cache = new Map<Fabric, THREE.MeshStandardMaterial>();
export function fabricMat(f: Fabric) {
  let m = cache.get(f);
  if (m) return m;
  const s = SPEC[f];
  if (typeof document === 'undefined') {
    // no DOM (Node checks): plain material without the canvas maps
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: s.rough, metalness: 0 });
    cache.set(f, m);
    return m;
  }
  m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: s.rough,
    metalness: 0,
    normalMap: normalFrom(HF[f], s.rep, s.k),
    normalScale: new THREE.Vector2(0.6, 0.6),
    map: f === 'plaid' ? plaidMap() : wearMap(s.rep / 2),
  });
  if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
  cache.set(f, m);
  return m;
}
