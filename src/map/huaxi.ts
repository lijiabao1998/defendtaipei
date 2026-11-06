// v24.16 華西街觀光夜市, built from street photos: a steel-truss arcade with a glazed barrel roof over the real pedestrian
// stretch of 華西街, a red and gold gate at each end, shopfronts under lit fascia boards, fluorescent tubes and red
// lanterns, patterned floor tiles, and stalls you can search for food. All of it is invented signage on real geography.
// Merged into a handful of unshadowed meshes that chunkify then cuts along the street.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hallRoof, tileTex } from './temple';

type V2 = [number, number];
type Geo = THREE.BufferGeometry;
export type HuaxiCont = { id: string; p: V2; label: string; items: Record<string, number> };
export type HuaxiDeps = {
  scene: THREE.Scene;
  /** the covered stretch, in order */
  road: V2[];
  /** other roads and lanes meeting the street: the shopfront row stays open there */
  crossing: (x: number, z: number) => boolean;
  addSeg: (a: V2, b: V2) => void;
};
const BAY = 4.5,
  HW = 4.4, // half width between the shopfront walls
  COL_H = 4.3,
  ROOF_H = 7.4;
const STALLS = [
  ['海產', '#0f5f8a'],
  ['當歸鴨', '#7a2a12'],
  ['鱔魚麵', '#b33a14'],
  ['魯肉飯', '#8a4a12'],
  ['米粉湯', '#c8141a'],
  ['麵線', '#a8551a'],
  ['肉粥', '#1f6f5a'],
  ['蜜餞', '#c2337a'],
  ['青草茶', '#2c7a3a'],
  ['藥燉排骨', '#5a2f14'],
  ['甜不辣', '#c88a12'],
  ['足底按摩', '#3a3f8a'],
  ['腳底按摩', '#5a2f7a'],
  ['古早味', '#8a1f1f'],
  ['水果', '#d0641a'],
  ['金飾', '#a8831a'],
];
const FOOD: Record<string, number>[] = [
  { bento: 1, boiled: 1 },
  { hotnoodle: 1, water: 1 },
  { mantou: 2, tea: 1 },
  { rice: 2, oden: 1 },
  { egg: 2, can: 1 },
  { cookedrice: 1, driedtofu: 1 },
  { snack: 2, sport: 1 },
  { roufong: 1, coffee: 1 },
];
const tintG = (g: Geo, hex: number, jitter = 0, r = Math.random) => {
  const c = new THREE.Color(hex);
  if (jitter) c.offsetHSL(0, 0, (r() - 0.5) * jitter);
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) ((a[i * 3] = c.r), (a[i * 3 + 1] = c.g), (a[i * 3 + 2] = c.b));
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const merged = (L: Geo[], keep: string[]) =>
  mergeGeometries(
    L.map(g => {
      const q = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(q.attributes)) if (!keep.includes(k)) q.deleteAttribute(k);
      return q;
    }),
  );
/** a frame on the street: position, along (u) and across (n); local +z runs along, local +x across */
type Frame = { x: number; z: number; ux: number; uz: number; nx: number; nz: number; ry: number };
function frames(road: V2[], step: number) {
  const out: Frame[] = [];
  let carry = 0;
  for (let i = 0; i < road.length - 1; i++) {
    const [ax, az] = road[i],
      [bx, bz] = road[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.01) continue;
    const ux = (bx - ax) / L,
      uz = (bz - az) / L;
    for (let s = carry; s < L; s += step) {
      out.push({ x: ax + ux * s, z: az + uz * s, ux, uz, nx: uz, nz: -ux, ry: Math.atan2(ux, uz) });
      carry = s + step - L;
    }
  }
  return out;
}
function signAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const c = cv.getContext('2d')!;
  STALLS.forEach(([t, bg], i) => {
    const x = (i % 4) * 256,
      y = (i >> 2) * 64;
    c.fillStyle = bg;
    c.fillRect(x, y, 256, 64);
    c.fillStyle = 'rgba(255,255,255,.14)';
    c.fillRect(x, y, 256, 10);
    c.strokeStyle = 'rgba(255,235,170,.75)';
    c.lineWidth = 3;
    c.strokeRect(x + 3, y + 3, 250, 58);
    c.fillStyle = '#fff6d8';
    c.font = 'bold 42px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(t, x + 128, y + 33, 236);
  });
  // the plaque of the gate, across the lower half
  const g = c.createLinearGradient(0, 256, 0, 512);
  g.addColorStop(0, '#d82a1c');
  g.addColorStop(1, '#a01810');
  c.fillStyle = g;
  c.fillRect(0, 256, 1024, 256);
  c.strokeStyle = '#f2cf5a';
  c.lineWidth = 14;
  c.strokeRect(12, 268, 1000, 232);
  c.fillStyle = '#ffe36a';
  c.font = 'bold 120px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('華西街觀光夜市', 512, 386, 960);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function floorTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#b9ac96';
  c.fillRect(0, 0, 128, 128);
  c.fillStyle = '#6f5a4a';
  c.beginPath();
  c.moveTo(64, 26);
  c.lineTo(102, 64);
  c.lineTo(64, 102);
  c.lineTo(26, 64);
  c.fill();
  c.strokeStyle = 'rgba(40,30,20,.5)';
  c.lineWidth = 2;
  c.strokeRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    c.fillStyle = `rgba(${Math.random() < 0.5 ? '20,16,10' : '240,230,210'},${Math.random() * 0.12})`;
    c.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 9, 1 + Math.random() * 5);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildHuaxi(d: HuaxiDeps) {
  let rs = 0x48a51;
  const r = () => (rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296;
  const F = frames(d.road, BAY);
  const steel: Geo[] = [],
    glass: number[] = [],
    floor: Geo[] = [],
    sign: Geo[] = [],
    lamps: Geo[] = [],
    tiles: Geo[] = [],
    trim: Geo[] = [];
  const conts: HuaxiCont[] = [];
  const IRON = 0x56606a;
  /** local (a across, y, l along) box on frame f */
  const bx = (f: Frame, w: number, h: number, dp: number, a: number, y: number, l: number, hex: number, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, dp);
    if (rz) g.rotateZ(rz);
    g.translate(a, y, l);
    g.rotateY(f.ry);
    g.translate(f.x, 0, f.z);
    return tintG(g, hex);
  };
  const at = (f: Frame, a: number, l: number): V2 => [f.x + f.nx * a + f.ux * l, f.z + f.nz * a + f.uz * l];
  // the arch of the roof: from the column heads up to the crown
  const arc = (t: number) => {
    const ang = Math.PI * (1 - t); // t 0..1 runs from -a to +a over the crown
    return [Math.cos(ang) * HW, COL_H + Math.sin(ang) * (ROOF_H - COL_H)] as [number, number];
  };
  const NA = 8;
  F.forEach((f, i) => {
    const next = F[i + 1];
    // columns and the rafter
    for (const s of [-1, 1]) steel.push(bx(f, 0.2, COL_H, 0.2, s * HW, COL_H / 2, 0, IRON));
    for (let k = 0; k < NA; k++) {
      const [a0, y0] = arc(k / NA),
        [a1, y1] = arc((k + 1) / NA);
      const L = Math.hypot(a1 - a0, y1 - y0);
      steel.push(bx(f, L, 0.13, 0.13, (a0 + a1) / 2, (y0 + y1) / 2, 0, IRON, Math.atan2(y1 - y0, a1 - a0)));
    }
    for (const s of [-1, 1]) {
      const [p0, q0] = at(f, s * HW, 0);
      d.addSeg([p0 - 0.1, q0], [p0 + 0.1, q0]);
    }
    if (!next) return;
    const len = Math.hypot(next.x - f.x, next.z - f.z);
    // purlins and the glass between this rafter and the next
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const [a0, y0] = arc(t);
      steel.push(bx(f, 0.09, 0.09, len, a0, y0, len / 2, IRON));
    }
    for (let k = 0; k < NA; k++) {
      const [a0, y0] = arc(k / NA),
        [a1, y1] = arc((k + 1) / NA);
      const A = at(f, a0, 0),
        B = at(f, a1, 0),
        C = at(next, a1, 0),
        D = at(next, a0, 0);
      glass.push(A[0], y0, A[1], B[0], y1, B[1], C[0], y1, C[1], A[0], y0, A[1], C[0], y1, C[1], D[0], y0, D[1]);
    }
    // floor
    {
      const g = new THREE.PlaneGeometry(HW * 2, len + 0.02).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * 6, (uv.getY(q) * len) / 1.5 + i * 3);
      g.translate(0, 0.03, len / 2);
      g.rotateY(f.ry);
      g.translate(f.x, 0, f.z);
      floor.push(g);
    }
    // ---- a bay of shops on each side
    for (const s of [-1, 1]) {
      const [cx, cz] = at(f, s * (HW + 1.4), len / 2);
      const open = d.crossing(cx, cz) || i === 0 || !F[i + 2];
      if (open) continue; // a lane meets the street here
      const shop = Math.floor(r() * STALLS.length);
      const wallHex = [0x8a8074, 0x9a8f7e, 0x6f6a62, 0x7f6f5a][Math.floor(r() * 4)];
      // the shopfront: a wall with its lit window and a shutter half down, closing the row
      steel.push(bx(f, 0.24, 4.05, len, s * HW, 2.03, len / 2, wallHex));
      const A = at(f, s * HW, 0),
        B = at(f, s * HW, len);
      d.addSeg(A, B);
      lamps.push(bx(f, 0.06, 1.5, len * 0.76, s * (HW - 0.14), 1.55, len / 2, 0xffe8b8));
      steel.push(bx(f, 0.08, 0.8, len * 0.8, s * (HW - 0.17), 2.6, len / 2, 0x5a5f63));
      // the fascia board over it, facing the street
      {
        const cell = [(shop % 4) / 4, 1 - ((shop >> 2) + 1) / 8, 1 / 4, 1 / 8];
        const g = new THREE.PlaneGeometry(len * 0.96, 0.78);
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let q = 0; q < uv.count; q++) uv.setXY(q, cell[0] + uv.getX(q) * cell[2], cell[1] + uv.getY(q) * cell[3]);
        g.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
        g.translate(s * (HW - 0.26), 3.62, len / 2);
        g.rotateY(f.ry);
        g.translate(f.x, 0, f.z);
        sign.push(g);
      }
      // a blade sign sticking out over the walkway on some bays
      if (r() < 0.4) {
        const cell = [(shop % 4) / 4, 1 - ((shop >> 2) + 1) / 8, 1 / 4, 1 / 8];
        const g = new THREE.PlaneGeometry(1.5, 0.46);
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let q = 0; q < uv.count; q++) uv.setXY(q, cell[0] + uv.getX(q) * cell[2], cell[1] + uv.getY(q) * cell[3]);
        g.translate(s * (HW - 0.95), 4.12, 0.3);
        g.rotateY(f.ry);
        g.translate(f.x, 0, f.z);
        sign.push(g);
      }
      // the fluorescent tube under the eave
      lamps.push(bx(f, 0.09, 0.05, len * 0.7, s * (HW - 0.85), 3.28, len / 2, 0xf4fbff));
      // the stall out front on every other bay: counter, things on it, two stools; it can be searched
      if (i % 2 === 0) {
        const a = s * (HW - 1.15);
        const COUNTER = [0xb9bec2, 0xa8b0b6, 0xc2b48a][Math.floor(r() * 3)];
        steel.push(bx(f, 0.86, 0.88, 2.6, a, 0.44, len / 2, COUNTER));
        steel.push(bx(f, 0.96, 0.05, 2.76, a, 0.91, len / 2, 0x8e9498));
        for (let k = 0; k < 7; k++) {
          const hex = [0xc8501a, 0xd8a020, 0x8a2f1a, 0x5a8a2a, 0xe8dcc0, 0xb33a14][Math.floor(r() * 6)];
          const q = new THREE.CylinderGeometry(0.09, 0.07, 0.09, 6);
          q.translate(a + (r() - 0.5) * 0.6, 0.98, len / 2 - 1.05 + k * 0.35);
          q.rotateY(f.ry);
          q.translate(f.x, 0, f.z);
          steel.push(tintG(q, hex));
        }
        for (const l of [len / 2 - 0.7, len / 2 + 0.7]) {
          const q = new THREE.CylinderGeometry(0.16, 0.16, 0.42, 6);
          q.translate(a - s * 0.86, 0.21, l);
          q.rotateY(f.ry);
          q.translate(f.x, 0, f.z);
          steel.push(tintG(q, 0xc8281c));
        }
        const c0 = at(f, a, len / 2 - 1.3),
          c1 = at(f, a, len / 2 + 1.3);
        const ox = f.nx * 0.44,
          oz = f.nz * 0.44;
        d.addSeg([c0[0] - ox, c0[1] - oz], [c1[0] - ox, c1[1] - oz]);
        d.addSeg([c0[0] + ox, c0[1] + oz], [c1[0] + ox, c1[1] + oz]);
        const here = STALLS[shop][0];
        conts.push({
          id: `hx${i}_${s > 0 ? 1 : 0}`,
          p: at(f, a - s * 0.95, len / 2),
          label: `${here}攤`,
          items: { ...FOOD[Math.floor(r() * FOOD.length)] },
        });
      }
    }
    // red lanterns down the middle
    if (i % 2 === 1) {
      const q = new THREE.SphereGeometry(0.28, 8, 5);
      q.translate(0, 5.2, len / 2);
      q.rotateY(f.ry);
      q.translate(f.x, 0, f.z);
      lamps.push(tintG(q, 0xe0301c));
    }
  });
  // ---- the gate at each end: red pillars, gold beams, the lit plaque, a tiered roof
  const gate = (f: Frame) => {
    for (const s of [-1, 1]) {
      const q = new THREE.CylinderGeometry(0.42, 0.46, 7.2, 10);
      q.translate(s * (HW + 0.5), 3.6, 0);
      q.rotateY(f.ry);
      q.translate(f.x, 0, f.z);
      steel.push(tintG(q, 0xb3201a));
      steel.push(bx(f, 1.3, 0.7, 1.3, s * (HW + 0.5), 0.35, 0, 0x6f6c66));
      const A = at(f, s * (HW + 0.9), -0.5),
        B = at(f, s * (HW + 0.1), 0.5);
      d.addSeg(A, B);
    }
    steel.push(bx(f, HW * 2 + 2.4, 0.5, 0.6, 0, 6.05, 0, 0xc2281c));
    steel.push(bx(f, HW * 2 + 2.4, 0.13, 0.66, 0, 5.72, 0, 0xd8a93a));
    steel.push(bx(f, HW * 2 + 2.4, 0.13, 0.66, 0, 6.36, 0, 0xd8a93a));
    steel.push(bx(f, 6.4, 3.3, 0.3, 0, 8, 0, 0xc2281c));
    for (const side of [-1, 1]) {
      const g = new THREE.PlaneGeometry(6, 1.46);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q), uv.getY(q) * 0.5);
      if (side < 0) g.rotateY(Math.PI);
      g.translate(0, 7.55, side * 0.18);
      g.rotateY(f.ry);
      g.translate(f.x, 0, f.z);
      sign.push(g);
    }
    // hallRoof makes its ridge along world x: build it at the origin, then swing it across the street
    const t0: Geo[] = [],
      t1: Geo[] = [];
    for (const s of [-1, 1]) hallRoof(t0, t1, { x: s * (HW + 0.9), z: 0, W: 5.4, D: 2.8, y: 6.5, H: 0.85, lift: 0.6 });
    hallRoof(t0, t1, { x: 0, z: 0, W: 9, D: 2.4, y: 9.55, H: 1.15, lift: 0.85, rich: true });
    for (const g of t0) tiles.push(g.rotateY(f.ry).translate(f.x, 0, f.z));
    for (const g of t1) trim.push(g.rotateY(f.ry).translate(f.x, 0, f.z));
    for (const a of [-3.2, -1.1, 1.1, 3.2]) {
      const q = new THREE.SphereGeometry(0.24, 8, 5);
      q.translate(a, 5.3, 0);
      q.rotateY(f.ry);
      q.translate(f.x, 0, f.z);
      lamps.push(tintG(q, 0xe0301c));
    }
  };
  gate(F[0]);
  gate(F[F.length - 1]);
  // ---- meshes
  const steelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.15 });
  const signTex = signAtlas();
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    emissive: 0xffffff,
    emissiveMap: signTex,
    emissiveIntensity: 0.15,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  // unlit: an emissive term would ignore the vertex colours and turn every red lantern white
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x808080 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xd6e8ee,
    transparent: true,
    opacity: 0.44,
    roughness: 0.12,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  // the tubes light the floor: no real lights, the tiles just glow a little at night
  const fTex = floorTex();
  const floorMat = new THREE.MeshStandardMaterial({
    map: fTex,
    roughness: 0.82,
    emissive: 0xfff2d8,
    emissiveMap: fTex,
    emissiveIntensity: 0,
  });
  const tileMat = new THREE.MeshStandardMaterial({
    map: tileTex(),
    color: 0xf08a6a,
    roughness: 0.42,
    side: THREE.DoubleSide,
  });
  const add = (g: Geo, m: THREE.Material, receive = true) => {
    const me = new THREE.Mesh(g, m);
    me.castShadow = false;
    me.receiveShadow = receive;
    d.scene.add(me);
    return me;
  };
  add(merged([...steel, ...trim], ['position', 'normal', 'color']), steelMat);
  add(merged(sign, ['position', 'normal', 'uv']), signMat);
  add(merged(lamps, ['position', 'normal', 'color']), lampMat, false);
  add(merged(floor, ['position', 'normal', 'uv']), floorMat);
  add(merged(tiles, ['position', 'normal', 'uv']), tileMat);
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(glass, 3));
  gg.computeVertexNormals();
  add(gg, glassMat, false);
  return {
    conts,
    bays: F.length,
    /** on the covered street, or under its gates */
    covers(x: number, z: number) {
      return F.some(f => Math.hypot(f.x - x, f.z - z) < HW + 2.6);
    },
    /** lit while there is power, at night (the caller passes night × power, like the street signs) */
    update(night: number) {
      signMat.emissiveIntensity = 0.15 + night * 0.85;
      lampMat.color.setScalar(0.5 + night * 0.6);
      floorMat.emissiveIntensity = night * 0.42;
    },
    /** the street's centre line, for checks */
    frames: F.map(f => [f.x, f.z] as V2),
    across: F.map(f => [f.nx, f.nz] as V2),
  };
}
