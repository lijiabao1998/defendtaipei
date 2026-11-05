// 華西街-style night alley dressing for the detailed spawn blocks (procedural, invented shop names, instanced clutter).
import * as THREE from 'three';
type V2 = [number, number];
export type ACtx = {
  scene: THREE.Scene;
  rnd: () => number;
  pip: (p: V2, pts: V2[]) => boolean;
  bldAt: (x: number, z: number) => any;
  addSeg: (s: { a: V2; b: V2 }, low?: boolean) => void;
  merge: (g: THREE.BufferGeometry[]) => THREE.BufferGeometry;
  roads: { p: V2[]; t: string; n?: string }[];
  blds: any[];
  RW: Record<string, number>;
  center: V2;
  R: number;
  doors: V2[];
  poles?: V2[];
};
// ---------- lightbox / sign atlas (2048x1024, 8x4 cells of 256x256) ----------
type SignDef = { t: string; bg: string; fg: string; v?: boolean; glow: number; neon?: boolean };
const SIGNS: SignDef[] = [
  { t: '金爺', bg: '#c8141a', fg: '#ffe680', v: true, glow: 0xff3020 },
  { t: '夜香妃', bg: '#f04a9a', fg: '#ffffff', v: true, glow: 0xff4aa8 },
  { t: '雙福餐廳', bg: '#6a2a9a', fg: '#ffe0ff', v: true, glow: 0xa040ff },
  { t: 'OPEN', bg: '#050505', fg: '#ff3a5a', neon: true, glow: 0xff3050 },
  { t: 'DVD光碟片', bg: '#f2f2f2', fg: '#1a3aa8', v: true, glow: 0xe8f0ff },
  { t: '福', bg: '#c8141a', fg: '#1a1a1a', glow: 0xff2010 },
  { t: '卡拉OK', bg: '#1a2a8a', fg: '#40f0ff', v: true, glow: 0x3060ff },
  { t: '小吃部', bg: '#e8a818', fg: '#8a1010', v: true, glow: 0xffb030 },
  { t: '鱉湯', bg: '#2a6a2a', fg: '#ffffff', v: true, glow: 0x40ff60 },
  { t: '藥燉排骨', bg: '#8a1a1a', fg: '#ffe680', v: true, glow: 0xff3a20 },
  { t: '茶室', bg: '#2a1a4a', fg: '#ff80d0', v: true, glow: 0xff60c0 },
  { t: '萬興旅社', bg: '#f2f2f2', fg: '#c8141a', v: true, glow: 0xfff0e0 },
  { t: '腳底按摩', bg: '#1a6a8a', fg: '#ffffff', v: true, glow: 0x40c0ff },
  { t: '當舖', bg: '#101010', fg: '#ff2a2a', v: true, glow: 0xff2020 },
  { t: '麵線', bg: '#f0d020', fg: '#c8141a', v: true, glow: 0xffd040 },
  { t: '理容院', bg: '#e8e8e8', fg: '#1a6a3a', v: true, glow: 0xf0fff0 },
  { t: '龍興神桌佛具', bg: '#8a1a2a', fg: '#ffd060', glow: 0xff5030 },
  { t: '華興街觀光夜市', bg: '#b01418', fg: '#ffd040', glow: 0xff4020 },
  { t: '肉粥', bg: '#f2e8d0', fg: '#b01418', glow: 0xfff0d0 },
  { t: '現打果汁', bg: '#30b040', fg: '#ffffff', glow: 0x60ff80 },
  { t: '春聯', bg: '#c8141a', fg: '#ffd040', v: true, glow: 0xff2010 },
  { t: '老牌魯肉飯', bg: '#f2c020', fg: '#8a1010', v: true, glow: 0xffc030 },
  { t: '彩券行', bg: '#c8141a', fg: '#ffffff', v: true, glow: 0xff3020 },
  { t: '刻印鐘錶', bg: '#20344f', fg: '#ffffff', v: true, glow: 0x6080ff },
];
function atlas() {
  const cv = document.createElement('canvas');
  cv.width = 2048;
  cv.height = 1024;
  const c = cv.getContext('2d')!;
  SIGNS.forEach((s, i) => {
    const x = (i % 8) * 256,
      y = Math.floor(i / 8) * 256;
    c.fillStyle = s.bg;
    c.fillRect(x, y, 256, 256);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (s.neon) {
      c.shadowColor = s.fg;
      c.shadowBlur = 24;
      c.strokeStyle = s.fg;
      c.lineWidth = 8;
      c.font = 'bold 84px sans-serif';
      c.strokeText(s.t, x + 128, y + 128);
      c.shadowBlur = 0;
      c.strokeStyle = '#fff0f4';
      c.lineWidth = 2;
      c.strokeText(s.t, x + 128, y + 128);
      return;
    }
    if (s.t === '福') {
      c.fillStyle = s.bg;
      c.fillRect(x, y, 256, 256);
      c.fillStyle = '#1a1a1a';
      c.font = 'bold 200px serif';
      c.fillText('福', x + 128, y + 140);
      c.strokeStyle = '#ffd040';
      c.lineWidth = 6;
      c.strokeRect(x + 10, y + 10, 236, 236);
      return;
    }
    c.strokeStyle = 'rgba(255,255,255,.55)';
    c.lineWidth = 6;
    c.strokeRect(x + 8, y + 8, 240, 240);
    c.fillStyle = s.fg;
    const ch = [...s.t];
    if (s.v) {
      const fs = Math.min(110, 230 / ch.length);
      c.font = `bold ${fs}px sans-serif`;
      ch.forEach((k, j) => {
        c.save();
        c.translate(x + 128, y + 128 + (j - (ch.length - 1) / 2) * fs);
        c.scale(2.2, 1);
        c.fillText(k, 0, 0);
        c.restore();
      });
    } // drawn squashed; stretched back by tall box UV
    else {
      const fs = Math.min(140, (236 / ch.length) * 1.0);
      c.font = `bold ${fs}px sans-serif`;
      c.save();
      c.translate(x + 128, y + 128);
      c.scale(1, 2.4);
      c.fillText(s.t, 0, 0);
      c.restore();
    }
    for (let k = 0; k < 60; k++) {
      c.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
      c.fillRect(x + Math.random() * 256, y + Math.random() * 256, 3 + Math.random() * 8, 2 + Math.random() * 5);
    }
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const cell = (i: number) => [(i % 8) / 8, 1 - (Math.floor(i / 8) + 1) / 4, 1 / 8, 1 / 4];
function uvBox(g: THREE.BufferGeometry, c: number[], faces: number[]) {
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (faces.includes(f)) uv.setXY(i, c[0] + uv.getX(i) * c[2], c[1] + uv.getY(i) * c[3]);
      else uv.setXY(i, c[0] + 0.01, c[1] + 0.01);
    }
  return g;
}
function corrugated(base: string, line: string, horiz = true) {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = base;
  c.fillRect(0, 0, 64, 64);
  c.fillStyle = line;
  for (let i = 0; i < 64; i += 4) horiz ? c.fillRect(0, i, 64, 1.5) : c.fillRect(i, 0, 1.5, 64);
  for (let i = 0; i < 40; i++) {
    c.fillStyle = `rgba(90,50,20,${Math.random() * 0.3})`;
    c.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 3, 3 + Math.random() * 12);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function grateTex() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 32;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#2a2a2a';
  c.fillRect(0, 0, 64, 32);
  c.fillStyle = '#060606';
  for (let i = 4; i < 62; i += 5) c.fillRect(i, 4, 2.5, 24);
  return new THREE.CanvasTexture(cv);
}
// ---------- instancing helper ----------
class Inst {
  m = new Map<string, { g: THREE.BufferGeometry; mat: THREE.Material; L: [THREE.Matrix4, number][] }>();
  q = new THREE.Quaternion();
  Y = new THREE.Vector3(0, 1, 0);
  def(k: string, g: THREE.BufferGeometry, mat?: THREE.Material) {
    this.m.set(k, { g, mat: mat || new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), L: [] });
  }
  add(k: string, x: number, y: number, z: number, ry: number, col = 0xffffff, s = 1, tilt = 0) {
    const e = this.m.get(k)!;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, ry, 0));
    e.L.push([new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)), col]);
  }
  build(scene: THREE.Scene) {
    let n = 0;
    const col = new THREE.Color();
    this.m.forEach(e => {
      if (!e.L.length) return;
      const im = new THREE.InstancedMesh(e.g, e.mat, e.L.length);
      e.L.forEach(([m, c], i) => {
        im.setMatrixAt(i, m);
        im.setColorAt(i, col.setHex(c));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      scene.add(im);
      n += e.L.length;
    });
    return n;
  }
}
const B = (x: number, y: number, z: number, tx = 0, ty = 0, tz = 0) =>
  new THREE.BoxGeometry(x, y, z).translate(tx, ty, tz);
const Cy = (r0: number, r1: number, h: number, ty = 0, seg = 10) =>
  new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, ty, 0);
const strip = (g: THREE.BufferGeometry) => {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
};

export function buildAlley(c: ACtx) {
  const { rnd, center, R, merge } = c;
  const M = (g: THREE.BufferGeometry[]) => merge(g.map(strip));
  const I = new Inst();
  const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  I.def(
    'stool',
    M([
      Cy(0.17, 0.15, 0.04, 0.45, 12),
      ...[
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([a, b]) => Cy(0.03, 0.02, 0.45, 0.22, 5).translate(a * 0.1, 0, b * 0.1)),
    ]),
    wm,
  );
  I.def('crate', M([B(0.48, 0.28, 0.34, 0, 0.14, 0), B(0.5, 0.03, 0.36, 0, 0.27, 0)]), wm);
  I.def(
    'bag',
    new THREE.SphereGeometry(0.3, 8, 6).scale(1, 0.85, 0.9).translate(0, 0.22, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
  );
  I.def('bin', M([Cy(0.26, 0.3, 0.85, 0.42, 12), Cy(0.31, 0.31, 0.06, 0.88, 12)]), wm);
  I.def('box', B(0.55, 0.4, 0.45, 0, 0.2, 0), wm);
  I.def('flat', B(0.9, 0.02, 0.6, 0, 0.02, 0), wm);
  I.def('cone', M([new THREE.ConeGeometry(0.16, 0.6, 10).translate(0, 0.34, 0), B(0.36, 0.04, 0.36, 0, 0.02, 0)]), wm);
  I.def('pot', Cy(0.16, 0.22, 0.32, 0.16, 10), wm);
  I.def('leaf', new THREE.SphereGeometry(0.32, 8, 6).scale(1, 1.2, 1).translate(0, 0.62, 0), wm);
  I.def(
    'chair',
    M([
      B(0.42, 0.03, 0.4, 0, 0.45, 0),
      B(0.42, 0.45, 0.03, 0, 0.72, -0.2),
      ...[-0.19, 0.19].map(x => B(0.025, 0.95, 0.025, x, 0.47, -0.18).rotateX(0.0)),
      ...[-0.19, 0.19].map(x => B(0.025, 0.47, 0.025, x, 0.23, 0.17)),
    ]),
    wm,
  );
  I.def(
    'scBody',
    M([B(0.34, 0.3, 0.95, 0, 0.42, 0), B(0.3, 0.55, 0.22, 0, 0.65, 0.44), B(0.36, 0.06, 0.32, 0, 0.26, 0.1)]),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.3 }),
  );
  I.def(
    'scDark',
    M([
      B(0.36, 0.12, 0.55, 0, 0.64, -0.18),
      B(0.62, 0.05, 0.05, 0, 0.98, 0.5),
      ...[-0.42, 0.5].map(z =>
        Cy(0.2, 0.2, 0.1, 0, 14)
          .rotateZ(Math.PI / 2)
          .translate(0, 0.2, z),
      ),
      B(0.12, 0.08, 0.06, 0, 0.92, 0.56),
    ]),
    new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.8 }),
  );
  I.def('dBox', B(0.42, 0.4, 0.42, 0, 0.92, -0.3), wm);
  I.def(
    'bike',
    M([
      ...[-0.48, 0.48].map(z => new THREE.TorusGeometry(0.32, 0.02, 4, 16).rotateY(Math.PI / 2).translate(0, 0.33, z)),
      B(0.03, 0.03, 0.8, 0, 0.6, 0).rotateX(0.15),
      B(0.03, 0.5, 0.03, 0, 0.55, -0.12),
      B(0.03, 0.55, 0.03, 0, 0.6, 0.4).rotateX(-0.25),
      B(0.5, 0.03, 0.03, 0, 0.95, 0.42),
      B(0.12, 0.04, 0.22, 0, 0.84, -0.15),
      B(0.35, 0.2, 0.3, 0, 0.98, 0.62),
    ]),
    wm,
  );
  // 傳統台式電錶: grey cast base, glass dome over a white dial with a spinning-disc window
  const dialT = (() => {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const x = cv.getContext('2d')!;
    x.fillStyle = '#f2f0ea';
    x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#111';
    x.fillRect(14, 18, 36, 9);
    x.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) x.fillRect(16 + i * 7, 20, 5, 5);
    x.fillStyle = '#222';
    x.fillRect(10, 36, 44, 4);
    x.fillStyle = '#c22';
    x.fillRect(30, 36, 4, 4);
    x.font = '8px sans-serif';
    x.fillStyle = '#333';
    x.fillText('kWh 220V', 12, 52);
    return new THREE.CanvasTexture(cv);
  })();
  I.def(
    'mBody',
    M([
      B(0.2, 0.3, 0.07, 0, 0, 0.035),
      Cy(0.085, 0.085, 0.02, 0, 16)
        .rotateX(Math.PI / 2)
        .translate(0, 0.03, 0.075),
      B(0.14, 0.06, 0.05, 0, -0.12, 0.09),
    ]),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2 }),
  );
  I.def(
    'mDial',
    new THREE.CircleGeometry(0.072, 16).translate(0, 0.03, 0.09),
    new THREE.MeshStandardMaterial({ map: dialT, roughness: 0.5 }),
  );
  I.def(
    'mDome',
    new THREE.SphereGeometry(0.08, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)
      .rotateX(Math.PI / 2)
      .scale(1, 1, 0.9)
      .translate(0, 0.03, 0.085),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      roughness: 0.05,
      metalness: 0.1,
    }),
  );
  I.def(
    'line',
    B(0.07, 0.012, 1.9, 0, 0.012, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  let nMeters = 0;
  const meter = (x: number, y: number, z: number, ry: number) => {
    const g = 0x8a8e8c + Math.floor(rnd() * 3) * 0x040404;
    I.add('mBody', x, y, z, ry, g);
    I.add('mDial', x, y, z, ry);
    I.add('mDome', x, y, z, ry);
    nMeters++;
  };
  const meterBank = (
    x: number,
    z: number,
    ux: number,
    uz: number,
    nx: number,
    nz: number,
    ry: number,
    y0: number,
    cols: number,
    rows: number,
  ) => {
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        if (rnd() < 0.12) continue;
        meter(
          x + ux * (i - (cols - 1) / 2) * 0.26 + nx * 0.02,
          y0 + j * 0.38,
          z + uz * (i - (cols - 1) / 2) * 0.26 + nz * 0.02,
          ry,
        );
      }
    for (let i = 0; i < cols; i++) {
      const px = x + ux * (i - (cols - 1) / 2) * 0.26 + nx * 0.06,
        pz = z + uz * (i - (cols - 1) / 2) * 0.26 + nz * 0.06;
      V.push({
        g: new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(px, y0 - 0.2, pz),
            new THREE.Vector3(px + nx * 0.06, y0 - 0.5, pz + nz * 0.06),
            new THREE.Vector3(px + ux * 0.1, y0 - 1.0 - rnd() * 0.5, pz + uz * 0.1),
          ]),
          5,
          0.012,
          3,
        ),
        col: 0x111111,
      });
      V.push({
        g: new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(px, y0 + rows * 0.38 - 0.1, pz),
            new THREE.Vector3(px + nx * 0.04, y0 + rows * 0.38 + 0.6, pz + nz * 0.04),
            new THREE.Vector3(px - ux * 0.2, y0 + rows * 0.38 + 2.2, pz - uz * 0.2),
          ]),
          6,
          0.012,
          3,
        ),
        col: 0x111111,
      });
    }
    V.push({
      g: place(B(cols * 0.26 + 0.1, rows * 0.38 + 0.1, 0.02, 0, rows * 0.19 - 0.2, 0), x, y0, z, ry),
      col: 0x6a6e6a,
    });
  };
  // merged static sets
  const V: { g: THREE.BufferGeometry; col: number }[] = [];
  const vadd = (g: THREE.BufferGeometry, col: number) => V.push({ g, col });
  const SIGN: THREE.BufferGeometry[] = [],
    AWN: THREE.BufferGeometry[] = [],
    AWN2: THREE.BufferGeometry[] = [],
    AWN3: THREE.BufferGeometry[] = [],
    SHUT: THREE.BufferGeometry[] = [],
    TUBE: THREE.BufferGeometry[] = [],
    SHOP: THREE.BufferGeometry[] = [],
    CAB: THREE.BufferGeometry[] = [],
    GRATE: THREE.BufferGeometry[] = [];
  const neon: { p: THREE.Vector3; col: number }[] = [],
    fluo: THREE.Vector3[] = [];
  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry: number, rx = 0, rz = 0) =>
    g.rotateZ(rz).rotateX(rx).rotateY(ry).translate(x, y, z);
  const near = (x: number, z: number, r = R) => Math.hypot(x - center[0], z - center[1]) < r;
  const freeAt = (x: number, z: number) => !c.bldAt(x, z) && !c.doors.some(d => Math.hypot(d[0] - x, d[1] - z) < 1.6);
  // street-facing facade edges
  type Edge = {
    a: V2;
    e: V2;
    L: number;
    ux: number;
    uz: number;
    nx: number;
    nz: number;
    fy: number;
    b: any;
    open: number;
  };
  const edges: Edge[] = [];
  for (const b of c.blds) {
    if (!near(b.c[0], b.c[1]) || b.h < 3) continue;
    const pts: V2[] = b.pts;
    for (let i = 0; i < pts.length; i++) {
      // v23.9 infill row houses open onto the street front only (edge 0)
      if (b.fill && i !== 0) continue;
      const a = pts[i],
        e = pts[(i + 1) % pts.length];
      const L = Math.hypot(e[0] - a[0], e[1] - a[1]);
      if (L < 2.2) continue;
      const ux = (e[0] - a[0]) / L,
        uz = (e[1] - a[1]) / L;
      let nx = -uz,
        nz = ux;
      const m: V2 = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2];
      if (c.pip([m[0] + nx * 0.5, m[1] + nz * 0.5], pts)) {
        nx = -nx;
        nz = -nz;
      }
      let open = 0;
      for (const d of [1.5, 2.5, 3.5, 5, 7]) {
        if (c.bldAt(m[0] + nx * d, m[1] + nz * d)) break;
        open = d;
      }
      if (open < 1.5) continue;
      edges.push({ a, e, L, ux, uz, nx, nz, fy: Math.atan2(nx, nz), b, open });
    }
  }
  const P = (E: Edge, d: number, off: number): V2 => [E.a[0] + E.ux * d + E.nx * off, E.a[1] + E.uz * d + E.nz * off];
  const SC = [0xe8e8e8, 0xc83a30, 0x2a5aa8, 0x8fc8c0, 0x222222, 0xe8b0c0, 0x9aa0a8, 0x4a6a3a];
  let shrine = false;
  let shrineP: number[] | null = null;
  for (const E of edges) {
    const narrow = E.open < 5;
    // ground floor: awning + shop front (lit) or rolling shutter
    for (let d = 0.2; d < E.L - 0.3; d += 2.4 + rnd() * 1.2) {
      const w = Math.min(2.6 + rnd(), E.L - d - 0.1);
      if (w < 1.2) break;
      const mid = d + w / 2;
      const [sx, sz] = P(E, mid, 0.05);
      const openShop = rnd() < 0.55;
      if (openShop) {
        const g = new THREE.PlaneGeometry(w - 0.1, 2.5).translate(0, 1.25, 0);
        SHOP.push(place(g, sx, 0, sz, E.fy));
        const sh = new THREE.PlaneGeometry(w - 0.1, 0.5 + rnd() * 0.3).translate(0, 2.55, 0.01);
        SHUT.push(place(sh, sx, 0, sz, E.fy));
        // shelves / goods inside the lit opening
        for (let k = 0; k < 2; k++) {
          const [gx, gz] = P(E, mid + (k - 0.5) * w * 0.5, -0.3);
          CAB.push(place(B(w * 0.38, 1.4 + rnd() * 0.6, 0.35, 0, 0.8, 0), gx, 0, gz, E.fy));
        }
        if (rnd() < 0.5) {
          const [cx, cz] = P(E, mid, 0.5);
          I.add('flat', cx, 0, cz, E.fy, 0xb01418, 1);
        } // red carpet / step
        const [tx, tz] = P(E, mid, 0.9);
        TUBE.push(place(B(1.2, 0.04, 0.05), tx, 2.62, tz, E.fy));
        fluo.push(new THREE.Vector3(tx, 2.5, tz));
      } else {
        const g = new THREE.PlaneGeometry(w - 0.1, 2.9).translate(0, 1.45, 0);
        SHUT.push(place(g, sx, 0, sz, E.fy));
      }
      // metal awning
      if (rnd() < 0.85) {
        const dep = Math.min(E.open - 0.6, 1.0 + rnd() * 0.8);
        const g = B(w + 0.1, 0.03, dep, 0, 0, dep / 2);
        g.rotateX(0.18 + rnd() * 0.1);
        {
          const hq = Math.abs(Math.sin(sx * 12.9898 + sz * 78.233) * 43758.5453) % 1;
          (hq < 0.55 ? AWN : hq < 0.95 ? AWN2 : AWN3).push(
            place(
              g,
              ...(P(E, mid, 0.02).flatMap((v, i) => (i === 0 ? [v, 2.95 + rnd() * 0.25] : [v])) as [
                number,
                number,
                number,
              ]),
              E.fy,
              0,
              (rnd() - 0.5) * 0.05,
            ),
          );
        }
      }
      // 春聯 / 福 by doors
      if (rnd() < 0.25) {
        for (const s of [-1, 1]) {
          const [px, pz] = P(E, mid + s * (w / 2 - 0.15), 0.07);
          SIGN.push(place(uvBox(B(0.02, 1.1, 0.22), cell(20), [0, 1, 4, 5]), px, 1.4, pz, E.fy + Math.PI / 2));
        }
        const [fx, fz] = P(E, mid, 0.07);
        SIGN.push(place(uvBox(B(0.42, 0.42, 0.02), cell(5), [4, 5]), fx, 2.1, fz, E.fy, 0, Math.PI / 4));
      }
    }
    // projecting vertical lightboxes, stacked down the facade
    for (let d = 0.6 + rnd(); d < E.L - 0.4; d += 1.8 + rnd() * 2.6) {
      if (rnd() < 0.35) continue;
      const si = [0, 1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 21, 22, 23][Math.floor(rnd() * 17)];
      const tall = si === 4 ? 3.6 : 1.4 + rnd() * 1.2;
      const w = 0.55 + rnd() * 0.2;
      const off = 0.25 + w / 2;
      const y = 3.3 + tall / 2 + rnd() * Math.max(0, Math.min(E.b.h, 12) - 4 - tall);
      const [x, z] = P(E, d, off);
      SIGN.push(
        place(uvBox(B(0.14, tall, w), cell(si), [0, 1]), x, y, z, E.fy + (rnd() - 0.5) * 0.06, 0, (rnd() - 0.5) * 0.04),
      );
      neon.push({ p: new THREE.Vector3(x + E.nx * 0.5, y - tall * 0.3, z + E.nz * 0.5), col: SIGNS[si].glow });
    }
    if (rnd() < 0.18) {
      const [x, z] = P(E, 0.5 + rnd() * (E.L - 1), 0.08);
      SIGN.push(place(uvBox(B(0.9, 0.9, 0.04), cell(3), [4, 5]), x, 2.2, z, E.fy));
      neon.push({ p: new THREE.Vector3(x + E.nx, 2, z + E.nz), col: 0xff3050 });
    }
    // 電錶 bank on the facade near the ground-floor entrance
    if (rnd() < 0.7) {
      const d = 0.4 + rnd() * Math.max(0.1, E.L - 1.2);
      const [x, z] = P(E, d, 0.13);
      meterBank(
        x,
        z,
        E.ux,
        E.uz,
        E.nx,
        E.nz,
        E.fy,
        1.7 + rnd() * 0.3,
        1 + Math.floor(rnd() * 4),
        1 + Math.floor(rnd() * 3),
      );
    }
    // cables down the wall, meter boxes, pipes
    for (let d = 0.3; d < E.L; d += 3 + rnd() * 5) {
      const [x, z] = P(E, d, 0.12);
      const n = 2 + Math.floor(rnd() * 5);
      for (let k = 0; k < n; k++) {
        const pts = [
          new THREE.Vector3(x + E.ux * k * 0.06, Math.min(E.b.h, 9) - rnd(), z + E.uz * k * 0.06),
          new THREE.Vector3(
            x + E.ux * (k * 0.06 + (rnd() - 0.5) * 0.3) + E.nx * 0.1,
            3.5,
            z + E.uz * k * 0.06 + E.nz * 0.1,
          ),
          new THREE.Vector3(x + E.ux * (k * 0.07 + 0.2), 1.6 + rnd() * 0.3, z + E.uz * (k * 0.07 + 0.2)),
        ];
        vadd(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.016, 3), 0x121212);
      }
      vadd(
        place(
          B(0.34, 0.45, 0.16, 0, 0, 0),
          ...(P(E, d + 0.3, 0.14).flatMap((v, i) => (i === 0 ? [v, 1.6] : [v])) as [number, number, number]),
          E.fy,
        ),
        0x8a8e90,
      );
      vadd(
        place(
          B(0.3, 0.06, 0.18),
          ...(P(E, d + 0.3, 0.15).flatMap((v, i) => (i === 0 ? [v, 1.86] : [v])) as [number, number, number]),
          E.fy,
        ),
        0x5a5e60,
      );
      if (rnd() < 0.5) {
        const [px, pz] = P(E, d + 0.8, 0.1);
        vadd(
          place(Cy(0.05, 0.05, Math.min(E.b.h, 10), Math.min(E.b.h, 10) / 2, 6), px, 0, pz, 0),
          rnd() < 0.5 ? 0xd8d8d0 : 0x6a7a8a,
        );
      }
    }
    // ground clutter along the facade (inside the 2-4m alley)
    for (let d = 0.5; d < E.L - 0.4; d += 0.7 + rnd() * 1.4) {
      const off = 0.5 + rnd() * Math.min(1.6, E.open * 0.35);
      const [x, z] = P(E, d, off);
      if (!freeAt(x, z)) continue;
      const r0 = rnd(),
        ry = E.fy + (rnd() - 0.5) * 0.6;
      if (r0 < 0.22 && E.open > 2.5) {
        const ang = E.fy + (Math.PI / 2) * (rnd() < 0.7 ? 1 : 0) + (rnd() - 0.5) * 0.3;
        const [qx, qz] = P(E, d, Math.min(E.open - 1, 1.1));
        for (const sgn of [-1, 1]) I.add('line', qx + E.ux * 0.48 * sgn, 0, qz + E.uz * 0.48 * sgn, E.fy);
        I.add('scBody', qx, 0, qz, ang + Math.PI / 2, SC[Math.floor(rnd() * SC.length)]);
        I.add('scDark', qx, 0, qz, ang + Math.PI / 2);
        if (rnd() < 0.35) I.add('dBox', qx, 0, qz, ang + Math.PI / 2, 0x2aa84a);
      } else if (r0 < 0.3)
        I.add(
          'bike',
          x,
          0,
          z,
          E.fy + Math.PI / 2 + (rnd() - 0.5) * 0.4,
          [0x2a2a2a, 0x8a2020, 0x2a4a8a, 0xc8c8c8][Math.floor(rnd() * 4)],
        );
      else if (r0 < 0.42) {
        const n = 1 + Math.floor(rnd() * 4);
        for (let k = 0; k < n; k++)
          I.add(
            'stool',
            x + (rnd() - 0.5) * 0.5,
            k * 0.06,
            z + (rnd() - 0.5) * 0.5,
            rnd() * 6,
            rnd() < 0.6 ? 0xd81c1c : 0x1c4ad8,
          );
      } else if (r0 < 0.5) {
        for (let k = 0; k < 2 + rnd() * 4; k++)
          I.add('crate', x + (k % 2) * 0.5 * E.ux, Math.floor(k / 2) * 0.3, z + (k % 2) * 0.5 * E.uz, E.fy, 0xf0c020);
      } else if (r0 < 0.6) {
        for (let k = 0; k < 2 + rnd() * 4; k++)
          I.add(
            'bag',
            x + (rnd() - 0.5) * 0.8,
            0,
            z + (rnd() - 0.5) * 0.8,
            rnd() * 6,
            rnd() < 0.8 ? 0x101010 : 0x2a3a7a,
            0.8 + rnd() * 0.4,
          );
      } else if (r0 < 0.65) I.add('bin', x, 0, z, ry, [0xe86a1a, 0x2a8a3a, 0x2a5ab8][Math.floor(rnd() * 3)]);
      else if (r0 < 0.72) {
        I.add('box', x, 0, z, ry, 0xa8804a);
        if (rnd() < 0.5) I.add('box', x, 0.4, z, ry + 0.3, 0xb89060, 0.8);
        if (rnd() < 0.6) I.add('flat', x + 0.4, 0, z, ry, 0xa8804a);
      } else if (r0 < 0.78) {
        I.add('pot', x, 0, z, 0, 0xa0583a);
        I.add('leaf', x, 0, z, rnd() * 6, 0x2a6a2a, 0.7 + rnd() * 0.5);
      } else if (r0 < 0.82) I.add('chair', x, 0, z, ry, [0x2a5a8a, 0x888888, 0xc8a050][Math.floor(rnd() * 3)]);
      else if (r0 < 0.84) I.add('cone', x, 0, z, ry, 0xff6a10);
    }
    // drain grates on the street edge
    if (E.open >= 3) {
      const off = Math.min(E.open - 0.3, 2.2);
      for (let d = 0.3; d < E.L - 0.6; d += 1.2) {
        const [x, z] = P(E, d + 0.5, off);
        if (c.bldAt(x, z)) continue;
        rnd();
        /* red curb now drawn continuously per-road in facade.ts */ if (rnd() < 0.12)
          GRATE.push(
            place(
              new THREE.PlaneGeometry(0.9, 0.35).rotateX(-Math.PI / 2),
              x - E.nx * 0.25,
              0.05,
              z - E.nz * 0.25,
              E.fy + Math.PI / 2,
            ),
          );
      }
    }
    // one 神桌佛具 shop with a wooden statue display
    if (!shrine && E.L > 5 && E.open >= 3 && near(E.b.c[0], E.b.c[1], R * 0.5)) {
      shrine = true;
      const mid = E.L / 2;
      const [x, z] = P(E, mid, 0.1);
      shrineP = P(E, mid, 2);
      SIGN.push(place(uvBox(B(Math.min(E.L - 0.5, 4.5), 0.75, 0.12), cell(16), [4, 5]), x, 3.25, z, E.fy));
      neon.push({ p: new THREE.Vector3(x + E.nx * 1.5, 2.5, z + E.nz * 1.5), col: 0xffa040 });
      const [sx, sz] = P(E, mid, 0.55);
      const body = new THREE.LatheGeometry(
        [
          [0.0, 0],
          [0.32, 0.02],
          [0.34, 0.2],
          [0.26, 0.5],
          [0.3, 0.9],
          [0.22, 1.3],
          [0.12, 1.45],
          [0.13, 1.6],
          [0.0, 1.72],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        14,
      );
      vadd(place(B(1.0, 0.5, 0.8, 0, 0.25, 0), sx, 0, sz, E.fy), 0x6a3418);
      vadd(place(body.translate(0, 0.5, 0), sx, 0, sz, E.fy), 0xa8743a);
      vadd(place(new THREE.TorusGeometry(0.3, 0.03, 6, 20).translate(0, 2.0, -0.12), sx, 0, sz, E.fy), 0xd8a030);
      for (const k of [-1, 1]) {
        const [tx, tz] = P(E, mid + k * 1.4, 0.45);
        vadd(place(B(1.0, 0.85, 0.6, 0, 0.42, 0), tx, 0, tz, E.fy), 0x7a2a14);
        vadd(place(B(1.1, 0.06, 0.66, 0, 0.88, 0), tx, 0, tz, E.fy), 0x5a1a0a);
        vadd(place(Cy(0.08, 0.1, 0.4, 1.1, 8), tx, 0, tz, E.fy), 0xc89040);
      }
    }
  }
  // ---------- night-market carts, 金爐, temple arch ----------
  const segs: { a: V2; b: V2; w: number; ux: number; uz: number; L: number; n?: string }[] = [];
  for (const r of c.roads) {
    const w = c.RW[r.t.replace('_link', '')] ?? 3;
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i],
        b = r.p[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 6 || !near((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, R * 0.6)) continue;
      segs.push({ a, b, w, ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, L, n: r.n });
    }
  }
  segs.sort(
    (p, q) =>
      Math.hypot((p.a[0] + p.b[0]) / 2 - center[0], (p.a[1] + p.b[1]) / 2 - center[1]) -
      Math.hypot((q.a[0] + q.b[0]) / 2 - center[0], (q.a[1] + q.b[1]) / 2 - center[1]),
  );
  const fires: THREE.Vector3[] = [];
  let carts = 0,
    arch = false;
  let archP: number[] | null = null;
  for (const s of segs) {
    const nx = -s.uz,
      nz = s.ux;
    const ang = Math.atan2(s.ux, s.uz);
    if (carts < 3) {
      const t = 0.3 + rnd() * 0.4;
      let x = 0,
        z = 0,
        ok = false,
        so = 1; /* stalls stand on the sidewalk / inside the 騎樓, never in the carriageway */
      for (const sd of [1, -1])
        for (const o of [0.9, 1.5, 2.2, 3.0]) {
          if (ok) break;
          const ox = s.a[0] + (s.b[0] - s.a[0]) * t + nx * sd * (s.w / 2 + o),
            oz = s.a[1] + (s.b[1] - s.a[1]) * t + nz * sd * (s.w / 2 + o);
          if (
            freeAt(ox, oz) &&
            freeAt(ox + s.ux * 0.9, oz + s.uz * 0.9) &&
            freeAt(ox - s.ux * 0.9, oz - s.uz * 0.9) &&
            freeAt(ox + nx * sd * 0.9, oz + nz * sd * 0.9)
          ) {
            x = ox;
            z = oz;
            ok = true;
            so = sd;
          }
        }
      if (ok) {
        const juice = carts % 2 === 0;
        carts++;
        for (const k of [-0.5, 0.5])
          I.add(
            'stool',
            x + s.ux * k + nx * so * 0.75,
            0,
            z + s.uz * k + nz * so * 0.75,
            0,
            [0x2a5aa8, 0xc83a30][Math.floor(rnd() * 2)],
          );
        vadd(place(B(1.6, 0.85, 0.75, 0, 0.6, 0), x, 0, z, ang + Math.PI / 2), juice ? 0xd8d8d0 : 0xb8b0a0);
        for (const k of [-0.6, 0.6])
          vadd(
            place(
              Cy(0.16, 0.16, 0.06, 0, 10)
                .rotateZ(Math.PI / 2)
                .translate(k, 0.16, 0.3),
              x,
              0,
              z,
              ang + Math.PI / 2,
            ),
            0x1a1a1a,
          );
        vadd(place(B(1.6, 0.5, 0.05, 0, 1.3, 0.35), x, 0, z, ang + Math.PI / 2), 0xb0d8e8);
        SIGN.push(
          place(uvBox(B(1.4, 0.35, 0.04, 0, 1.75, 0), cell(juice ? 19 : 18), [4, 5]), x, 0, z, ang + Math.PI / 2),
        );
        neon.push({ p: new THREE.Vector3(x, 2, z), col: juice ? 0x80ff90 : 0xfff0d0 });
        if (juice)
          for (let k = 0; k < 18; k++)
            vadd(
              place(
                new THREE.SphereGeometry(0.06 + rnd() * 0.04, 6, 5).translate(
                  ((k % 6) - 2.5) * 0.24,
                  1.1,
                  (Math.floor(k / 6) - 1) * 0.18,
                ),
                x,
                0,
                z,
                ang + Math.PI / 2,
              ),
              [0xff8a10, 0xf0d020, 0x40a030, 0xd02040, 0xffd080][k % 5],
            );
        else {
          vadd(place(Cy(0.28, 0.3, 0.38, 1.2, 14).translate(-0.35, 0, 0), x, 0, z, ang + Math.PI / 2), 0xb8b8b8);
          vadd(place(Cy(0.28, 0.3, 0.38, 1.2, 14).translate(0.4, 0, 0), x, 0, z, ang + Math.PI / 2), 0xb8b8b8);
        }
        const um = new THREE.ConeGeometry(1.0, 0.35, 10).translate(0, 2.3, 0);
        vadd(place(um, x, 0, z, 0), juice ? 0xe83a2a : 0x2a6ac8);
        vadd(place(Cy(0.02, 0.02, 2.3, 1.15, 5), x, 0, z, 0), 0x888888);
        for (let k = 0; k < 3; k++)
          I.add(
            'stool',
            x + nx * -1 + s.ux * (k - 1) * 0.6,
            0,
            z + nz * -1 + s.uz * (k - 1) * 0.6,
            rnd() * 6,
            rnd() < 0.5 ? 0xd81c1c : 0x1c4ad8,
          );
        const hl = 0.8,
          hw = 0.4;
        const cs: V2[] = [
          [-hl, -hw],
          [hl, -hw],
          [hl, hw],
          [-hl, hw],
        ].map(([p, q]) => [x + p * s.ux + q * nx, z + p * s.uz + q * nz] as V2);
        for (let k = 0; k < 4; k++) c.addSeg({ a: cs[k], b: cs[(k + 1) % 4] });
      }
    }
    if (fires.length < 2 && rnd() < 0.4) {
      const x = s.a[0] + (s.b[0] - s.a[0]) * 0.6 + nx * (s.w / 2 - 0.6),
        z = s.a[1] + (s.b[1] - s.a[1]) * 0.6 + nz * (s.w / 2 - 0.6);
      if (freeAt(x, z)) {
        vadd(place(Cy(0.38, 0.42, 0.9, 0.45, 12), x, 0, z, 0), 0x8a1a14);
        vadd(place(Cy(0.43, 0.43, 0.08, 0.92, 12), x, 0, z, 0), 0xc8a030);
        vadd(place(Cy(0.12, 0.14, 0.9, 1.4, 8), x, 0, z, 0), 0x3a2a20);
        vadd(place(new THREE.ConeGeometry(0.22, 0.2, 8).translate(0, 1.95, 0), x, 0, z, 0), 0x8a1a14);
        vadd(place(B(0.3, 0.25, 0.04, 0, 0.5, 0.42), x, 0, z, ang), 0x1a0a04);
        fires.push(new THREE.Vector3(x, 0.55, z));
        c.addSeg({ a: [x - 0.4, z], b: [x + 0.4, z] }, true);
      }
    }
    if (
      !arch &&
      s.w <= 12 &&
      s.w >= 3 &&
      Math.hypot((s.a[0] + s.b[0]) / 2 - center[0], (s.a[1] + s.b[1]) / 2 - center[1]) > 12
    ) {
      arch = true;
      const x = s.b[0] - s.ux * 1.5,
        z = s.b[1] - s.uz * 1.5;
      archP = [x - s.ux * 4, z - s.uz * 4];
      const W2 = s.w / 2 + 0.6;
      const ry = ang + Math.PI / 2;
      for (const k of [-1, 1]) {
        const px = x + nx * W2 * k,
          pz = z + nz * W2 * k;
        vadd(place(Cy(0.3, 0.3, 6.5, 3.25, 12), px, 0, pz, 0), 0xb01418);
        vadd(place(B(0.9, 0.5, 0.9, 0, 0.25, 0), px, 0, pz, ry), 0x8a8478);
        c.addSeg({ a: [px - 0.35, pz - 0.35], b: [px + 0.35, pz + 0.35] });
        c.addSeg({ a: [px - 0.35, pz + 0.35], b: [px + 0.35, pz - 0.35] });
      }
      for (const [y, ww, h, col] of [
        [5.6, W2 * 2 + 1.2, 0.35, 0xb01418],
        [6.4, W2 * 2 + 2.4, 0.18, 0x2a7a4a],
        [6.55, W2 * 2 + 2.0, 0.5, 0xd8a028],
        [7.0, W2 * 2 + 2.8, 0.16, 0x2a7a4a],
        [7.15, W2 * 1.2, 0.5, 0xb01418],
        [7.55, W2 * 1.6, 0.14, 0x2a7a4a],
      ] as const)
        vadd(place(B(ww, h, 0.7, 0, y, 0), x, 0, z, ry), col);
      for (const k of [-1, 1])
        vadd(
          place(
            B(0.8, 0.12, 0.12, 0, 7.05, 0)
              .rotateZ(-0.35 * k)
              .translate(k * (W2 + 1.4), 0.15, 0),
            x,
            0,
            z,
            ry,
          ),
          0x2a7a4a,
        );
      SIGN.push(place(uvBox(B(Math.min(W2 * 1.6, 6), 0.75, 0.75, 0, 6.0, 0), cell(17), [4, 5]), x, 0, z, ry));
      neon.push({ p: new THREE.Vector3(x, 5, z), col: 0xff6030 });
    }
  }
  // meters strapped around utility poles
  for (const [px, pz] of c.poles || []) {
    if (!near(px, pz) || rnd() < 0.35) continue;
    const n = 2 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      meter(px + Math.sin(a) * 0.2, 2.0 + Math.floor(k / 3) * 0.4 + rnd() * 0.1, pz + Math.cos(a) * 0.2, a);
    }
  }
  // ---------- meshes ----------
  const add = (g: THREE.BufferGeometry[], m: THREE.Material, shadow = true) => {
    if (!g.length) return;
    const me = new THREE.Mesh(M(g), m);
    me.castShadow = shadow;
    me.receiveShadow = true;
    c.scene.add(me);
  };
  const tex = atlas();
  const signMat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.3,
    roughness: 0.5,
  });
  add(SIGN, signMat);
  const shutT = corrugated('#9aa0a2', '#6a6e70');
  shutT.repeat.set(1, 6);
  add(
    SHUT,
    new THREE.MeshStandardMaterial({ map: shutT, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }),
    false,
  );
  for (const [arr, b0, l0] of [
    [AWN, '#6f8f86', '#4e6a62'],
    [AWN2, '#9a4a3a', '#6e3226'],
    [AWN3, '#8a9a9c', '#5e6a6c'],
  ] as [THREE.BufferGeometry[], string, string][]) {
    const t = corrugated(b0, l0, false);
    t.repeat.set(4, 1);
    add(arr, new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.35, side: THREE.DoubleSide }));
  } // 鐵皮雨遮：灰綠為主、褪色鐵紅次之、少數鍍鋅灰
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe0f4ff, emissiveIntensity: 0.4 });
  add(TUBE, tubeMat, false);
  const shopMat = new THREE.MeshStandardMaterial({
    color: 0x3a3226,
    emissive: 0xffd8a0,
    emissiveIntensity: 0.15,
    roughness: 0.9,
  });
  add(SHOP, shopMat, false);
  add(CAB, new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.9 }), false);
  const gt = grateTex();
  add(
    GRATE,
    new THREE.MeshStandardMaterial({
      map: gt,
      roughness: 0.6,
      metalness: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    }),
    false,
  );
  if (V.length) {
    const gs = V.map(({ g, col }) => {
      const s = strip(g);
      const n = s.attributes.position.count;
      const cc = new THREE.Color(col);
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        a[i * 3] = cc.r;
        a[i * 3 + 1] = cc.g;
        a[i * 3 + 2] = cc.b;
      }
      s.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return s;
    });
    const me = new THREE.Mesh(merge(gs), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    me.castShadow = true;
    me.receiveShadow = true;
    c.scene.add(me);
  }
  const nInst = I.build(c.scene);
  // pooled lights: neon spill (coloured), fluorescent (cool), fire (flicker)
  const NL: THREE.PointLight[] = [];
  for (let i = 0; i < 6; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 9, 1.8);
    c.scene.add(l);
    NL.push(l);
  }
  const FL: THREE.PointLight[] = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(0xd8f0ff, 0, 7, 1.8);
    c.scene.add(l);
    FL.push(l);
  }
  const fireL = new THREE.PointLight(0xff7a20, 0, 8, 1.6);
  c.scene.add(fireL);
  const NP = 60;
  const pg = new THREE.BufferGeometry();
  const pp = new Float32Array(NP * 3),
    life = new Float32Array(NP);
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const pts = new THREE.Points(
    pg,
    new THREE.PointsMaterial({
      color: 0xffa040,
      size: 0.09,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pts.frustumCulled = false;
  c.scene.add(pts);
  let T = 0,
    t = 0;
  return {
    spots: { fire: fires[0] && [fires[0].x, fires[0].z], arch: archP, shrine: shrineP },
    stats: {
      meters: nMeters,
      edges: edges.length,
      signs: SIGN.length,
      inst: nInst,
      fires: fires.length,
      carts,
      arch,
      shrine,
    },
    update(dt: number, night: number, px: number, pz: number, pw = 1) {
      t += dt;
      signMat.emissiveIntensity = pw * (0.3 + night * 1.6 * (0.97 + 0.03 * Math.sin(t * 40)));
      tubeMat.emissiveIntensity = pw * (0.4 + night * 1.8);
      shopMat.emissiveIntensity = pw * (0.15 + night * 0.7);
      T -= dt;
      if (T <= 0) {
        T = 0.5;
        const byD = <X extends { x: number; z: number }>(a: X[]) =>
          a.map(v => [v, (v.x - px) ** 2 + (v.z - pz) ** 2] as const).sort((a, b) => a[1] - b[1]);
        const ns = byD(neon.map(n => Object.assign(n.p, { col: n.col }) as THREE.Vector3 & { col: number }));
        NL.forEach((l, i) => {
          const e = ns[i];
          if (!e || e[1] > 900) {
            l.intensity = 0;
            return;
          }
          l.position.copy(e[0]);
          l.color.setHex(e[0].col);
          l.intensity = night * 9;
        });
        const fs = byD(fluo);
        FL.forEach((l, i) => {
          const e = fs[i];
          if (!e || e[1] > 900) {
            l.intensity = 0;
            return;
          }
          l.position.copy(e[0]);
          l.intensity = night * 6;
        });
      }
      const f = fires.map(v => [v, (v.x - px) ** 2 + (v.z - pz) ** 2] as const).sort((a, b) => a[1] - b[1])[0];
      if (f && f[1] < 1600) {
        const s = f[0];
        fireL.position.set(s.x, 1.2, s.z);
        fireL.intensity = (2 + night * 6) * (0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 7.3));
        for (let i = 0; i < NP; i++) {
          life[i] -= dt;
          if (life[i] <= 0) {
            life[i] = 0.6 + Math.random() * 0.9;
            pp[i * 3] = s.x + (Math.random() - 0.5) * 0.4;
            pp[i * 3 + 1] = s.y + 0.3;
            pp[i * 3 + 2] = s.z + (Math.random() - 0.5) * 0.4;
          } else {
            pp[i * 3 + 1] += dt * (0.8 + Math.random() * 0.6);
            pp[i * 3] += (Math.random() - 0.5) * dt * 0.6;
            pp[i * 3 + 2] += (Math.random() - 0.5) * dt * 0.6;
          }
        }
        pg.attributes.position.needsUpdate = true;
        pts.visible = true;
      } else {
        fireL.intensity = 0;
        pts.visible = false;
      }
    },
  };
}
