import { shrink } from './texq';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// 頂樓加蓋 鐵皮屋: real small-house shapes (gable / arched / mono-pitch), corrugated ribs via normal map, aluminium 鐵窗 windows, gutters, tanks.
const cv = (w: number, h: number, f: (c: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  f(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(shrink(c));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
};
// normal map: sinusoidal ribs along U (5 ribs per metre since UVs are in metres)
const ribN = cv(64, 8, c => {
  const d = c.createImageData(64, 8);
  for (let x = 0; x < 64; x++) {
    const s = Math.cos((x / 64) * Math.PI * 2 * 5);
    const nx = s * 0.75;
    for (let y = 0; y < 8; y++) {
      const i = (y * 64 + x) * 4;
      d.data[i] = (nx * 0.5 + 0.5) * 255;
      d.data[i + 1] = 128;
      d.data[i + 2] = Math.sqrt(1 - nx * nx) * 255;
      d.data[i + 3] = 255;
    }
  }
  c.putImageData(d, 0, 0);
});
ribN.colorSpace = THREE.NoColorSpace;
// palettes: mostly teal/grey-green and oxide red; some faded/rusty; few white/blue
const PAL: [string, number][] = [
  ['#5f8c84', 30],
  ['#6f9488', 18],
  ['#4f7a78', 10],
  ['#9a4436', 18],
  ['#a85a46', 8],
  ['#8a6a58', 6],
  ['#d8d8d0', 4],
  ['#5a7ea0', 4],
  ['#7a5a40', 2],
];
const mkTex = (base: string, seed: number) =>
  cv(128, 128, c => {
    c.fillStyle = base;
    c.fillRect(0, 0, 128, 128);
    let s = seed;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let x = 0; x < 128; x += 128 / 10) {
      c.fillStyle = 'rgba(255,255,255,.08)';
      c.fillRect(x, 0, 3, 128);
      c.fillStyle = 'rgba(0,0,0,.12)';
      c.fillRect(x + 6, 0, 3, 128);
    } // rib shading
    for (let y = 0; y < 128; y += 64) {
      c.fillStyle = 'rgba(0,0,0,.18)';
      c.fillRect(0, y, 128, 1);
    } // panel laps
    for (let i = 0; i < 9; i++) {
      const x = r() * 128,
        w = 2 + r() * 6,
        L = 30 + r() * 98;
      const g = c.createLinearGradient(0, 0, 0, L);
      g.addColorStop(0, 'rgba(110,52,22,.75)');
      g.addColorStop(1, 'rgba(110,52,22,0)');
      c.fillStyle = g;
      c.fillRect(x, 0, w, L);
    } // rust streaks
    for (let i = 0; i < 14; i++) {
      c.fillStyle = `rgba(${90 + r() * 40},${40 + r() * 20},20,${0.25 + r() * 0.4})`;
      c.beginPath();
      c.arc(r() * 128, r() * 128, 1 + r() * 4, 0, 7);
      c.fill();
    }
    const fade = c.createLinearGradient(0, 0, 0, 128);
    fade.addColorStop(0, 'rgba(240,240,230,.18)');
    fade.addColorStop(1, 'rgba(0,0,0,.1)');
    c.fillStyle = fade;
    c.fillRect(0, 0, 128, 128);
  });
const MATS = PAL.map(
  ([b], i) =>
    new THREE.MeshStandardMaterial({
      map: mkTex(b, 1234 + i * 77),
      normalMap: ribN,
      normalScale: new THREE.Vector2(1.2, 1.2),
      metalness: 0.55,
      roughness: 0.42,
      side: THREE.DoubleSide,
    }),
);
const pickMat = (q: number) => {
  const tot = PAL.reduce((a, p) => a + p[1], 0);
  let acc = 0;
  for (let i = 0; i < PAL.length; i++) {
    acc += PAL[i][1] / tot;
    if (q < acc) return i;
  }
  return 0;
};
const detMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.45 });
export const shackGlass = new THREE.MeshStandardMaterial({
  color: 0x1c2630,
  roughness: 0.15,
  metalness: 0.6,
  emissive: 0xffc070,
  emissiveIntensity: 0,
});
export function setShackNight(k: number) {
  shackGlass.emissiveIntensity = k * 0.9;
}
// geometry helpers. UVs in metres so ribs are to scale.
function uvMeters(g: THREE.BufferGeometry, ax: 'xy' | 'zy' | 'xz') {
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    uv[i * 2] = ax === 'zy' ? z : x;
    uv[i * 2 + 1] = ax === 'xz' ? z : y;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const col = (g: THREE.BufferGeometry, c: number) => {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  const cc = new THREE.Color(c);
  for (let i = 0; i < n; i++) {
    a[i * 3] = cc.r;
    a[i * 3 + 1] = cc.g;
    a[i * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const B = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  return col(g, c);
};
const strip = (g: THREE.BufferGeometry) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes))
    if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k);
  return n;
};

export type ShackOpt = { H?: number; open?: boolean; kind?: number; mat?: number; roofMat?: number };
export function makeShack(W: number, D: number, rnd: () => number, o: ShackOpt = {}) {
  const g = new THREE.Group();
  g.userData = { w: W, d: D };
  const H = o.H ?? 2.5 + rnd() * 0.4;
  const wallI = o.mat ?? pickMat(rnd()),
    roofI = o.roofMat ?? (rnd() < 0.6 ? wallI : pickMat(rnd()));
  const walls: THREE.BufferGeometry[] = [],
    roofs: THREE.BufferGeometry[] = [],
    det: THREE.BufferGeometry[] = [],
    glass: THREE.BufferGeometry[] = [];
  // walls: 4 planes with ribs vertical (u along wall, v up) -> ribs run vertically
  const wall = (len: number, ry: number, ox: number, oz: number) => {
    const p = new THREE.PlaneGeometry(len, H);
    uvMeters(p, 'xy');
    p.translate(0, H / 2, 0);
    p.rotateY(ry);
    p.translate(ox, 0, oz);
    walls.push(p);
  };
  if (!o.open) {
    wall(W, 0, 0, D / 2);
    wall(W, Math.PI, 0, -D / 2);
    wall(D, Math.PI / 2, W / 2, 0);
    wall(D, -Math.PI / 2, -W / 2, 0);
  }
  const kind = o.kind ?? rnd();
  const ov = 0.35;
  const long = W >= D;
  const L = (long ? W : D) + ov * 2,
    S = (long ? D : W) + ov * 2;
  const rot = (geo: THREE.BufferGeometry) => {
    if (!long) geo.rotateY(Math.PI / 2);
    return geo;
  };
  let ridge = 0;
  if (kind < 0.45) {
    // gable (雙斜)
    const pitch = 0.18 + rnd() * 0.12;
    ridge = (S / 2) * pitch;
    for (const sd of [-1, 1]) {
      const half = Math.hypot(S / 2, ridge);
      const p = new THREE.PlaneGeometry(L, half);
      uvMeters(p, 'xy');
      p.rotateX(-Math.PI / 2 + sd * Math.atan2(ridge, S / 2));
      p.translate(0, H + ridge / 2, (sd * S) / 4);
      rot(p);
      roofs.push(p);
    }
    for (const e of [-1, 1]) {
      const sh = new THREE.Shape([
        new THREE.Vector2(-(S - ov * 2) / 2, 0),
        new THREE.Vector2((S - ov * 2) / 2, 0),
        new THREE.Vector2(0, (ridge * (S - ov * 2)) / S),
      ]);
      const t = new THREE.ShapeGeometry(sh);
      uvMeters(t, 'xy');
      t.rotateY(Math.PI / 2);
      t.translate((e * (L - ov * 2)) / 2, H, 0);
      rot(t);
      walls.push(t);
    }
    det.push(rot(B(L, 0.12, 0.14, 0, H + ridge + 0.03, 0, 0x8a8e8c))); // ridge cap
  } else if (kind < 0.75) {
    // shallow arch (圓弧浪板)
    const rise = 0.35 + rnd() * 0.3;
    const R = ((S * S) / 4 + rise * rise) / (2 * rise);
    const th = 2 * Math.asin(S / 2 / R);
    ridge = rise;
    const c = new THREE.CylinderGeometry(R, R, L, 18, 1, true, -th / 2, th);
    const p = c.attributes.position as THREE.BufferAttribute;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = p.getY(i);
      uv[i * 2 + 1] = Math.atan2(p.getX(i), p.getZ(i)) * R;
    }
    c.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    c.rotateZ(Math.PI / 2);
    c.rotateX(-Math.PI / 2);
    c.translate(0, H + rise - R, 0); // axis along x, arc across z
    c.rotateY(0);
    rot(c);
    roofs.push(c);
    for (const e of [-1, 1]) {
      const sh = new THREE.Shape();
      const s2 = (S - ov * 2) / 2;
      sh.moveTo(-s2, 0);
      sh.lineTo(s2, 0);
      for (let k = 0; k <= 8; k++) {
        const z = s2 - (k / 8) * 2 * s2;
        sh.lineTo(z, Math.max(0, Math.sqrt(Math.max(0, R * R - z * z)) - (R - rise)));
      }
      const t = new THREE.ShapeGeometry(sh);
      uvMeters(t, 'xy');
      t.rotateY(Math.PI / 2);
      t.translate((e * (L - ov * 2)) / 2, H, 0);
      rot(t);
      walls.push(t);
    }
  } else {
    // mono-pitch (單斜) slightly sloped
    const drop = 0.35 + rnd() * 0.25;
    ridge = drop;
    const p = new THREE.PlaneGeometry(L, Math.hypot(S, drop));
    uvMeters(p, 'xy');
    p.rotateX(-Math.PI / 2 - Math.atan2(drop, S));
    p.translate(0, H + drop / 2, 0);
    rot(p);
    roofs.push(p);
    const hi = new THREE.PlaneGeometry(L - ov * 2, drop);
    uvMeters(hi, 'xy');
    hi.translate(0, H + drop / 2, (S - ov * 2) / 2);
    rot(hi);
    walls.push(hi);
  }
  // eave gutters + downpipe
  det.push(
    rot(B(L, 0.1, 0.12, 0, H - 0.02, S / 2 - 0.06, 0x9a9e9a)),
    rot(B(L, 0.1, 0.12, 0, H - 0.02, -S / 2 + 0.06, 0x9a9e9a)),
  );
  det.push(B(0.08, H, 0.08, W / 2 + 0.06, H / 2, D / 2 + 0.06, 0x8a8e8a));
  // corner trims
  if (!o.open)
    for (const [x, z] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ])
      det.push(B(0.07, H, 0.07, (x * W) / 2, H / 2, (z * D) / 2, 0xb8bab4));
  if (o.open) {
    for (const [x, z] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
      [0, 1],
      [0, -1],
    ])
      det.push(B(0.09, H, 0.09, x * (W / 2 - 0.1), H / 2, z * (D / 2 - 0.1), 0x6a6e6a));
  } else {
    // door on front (+z) + aluminium windows w/ 鐵窗 bars
    const dx = (rnd() - 0.5) * (W - 1.4);
    det.push(
      B(0.85, 2.0, 0.05, dx, 1.0, D / 2 + 0.03, [0x6a5040, 0x8a8a84, 0x3a5a6a][Math.floor(rnd() * 3)]),
      B(0.06, 0.06, 0.06, dx + 0.32, 1.0, D / 2 + 0.07, 0xd0c080),
    );
    const win = (cx: number, face: number, ww: number) => {
      const z = face * (D / 2 + 0.04),
        sx = face;
      glass.push(B(ww, 0.9, 0.02, cx, 1.55, z, 0));
      det.push(
        B(ww + 0.08, 0.05, 0.05, cx, 2.02, z, 0xd8dcdc),
        B(ww + 0.08, 0.05, 0.05, cx, 1.08, z, 0xd8dcdc),
        B(0.05, 0.95, 0.05, cx - ww / 2, 1.55, z, 0xd8dcdc),
        B(0.05, 0.95, 0.05, cx + ww / 2, 1.55, z, 0xd8dcdc),
        B(0.03, 0.9, 0.03, cx, 1.55, z, 0xd8dcdc),
      );
      const bz = z + sx * 0.14;
      for (let k = 0; k <= Math.round(ww / 0.14); k++)
        det.push(B(0.02, 1.1, 0.02, cx - ww / 2 + k * 0.14, 1.55, bz, 0x3a3e3e));
      det.push(
        B(ww + 0.1, 0.03, 0.2, cx, 2.1, z + sx * 0.08, 0x3a3e3e),
        B(ww + 0.1, 0.03, 0.2, cx, 1.0, z + sx * 0.08, 0x3a3e3e),
      );
    };
    const nw = Math.max(1, Math.floor((W - 1.6) / 1.8));
    for (let i = 0; i < nw; i++) {
      const x = -W / 2 + 0.9 + ((i + 0.5) * (W - 1.8)) / nw;
      if (Math.abs(x - dx) > 1.0) win(x, 1, 1.0);
    }
    if (rnd() < 0.7) win((rnd() - 0.5) * (W - 1.6), -1, 1.1);
    // patched panels (different colour)
    for (let i = 0; i < 2; i++)
      if (rnd() < 0.6)
        det.push(
          B(
            0.6 + rnd() * 0.8,
            0.6 + rnd() * 0.9,
            0.03,
            (rnd() - 0.5) * (W - 1),
            0.5 + rnd() * 1.4,
            -D / 2 - 0.03,
            [0x8a5038, 0xb0aaa0, 0x5a7a74][Math.floor(rnd() * 3)],
          ),
        );
  }
  // AC unit on wall, stainless tank on stand, laundry poles, pots, antenna
  if (rnd() < 0.7) det.push(B(0.8, 0.55, 0.3, W / 2 + 0.2, 1.9, (rnd() - 0.5) * (D - 1), 0xe0ddd2, Math.PI / 2));
  if (rnd() < 0.6) {
    const tx = (rnd() - 0.5) * W * 0.5,
      tz = (rnd() - 0.5) * D * 0.4,
      ty = H + ridge + 0.1;
    const t = new THREE.CylinderGeometry(0.5, 0.5, 1.1, 12);
    t.rotateZ(Math.PI / 2);
    t.translate(tx, ty + 0.9, tz);
    t.deleteAttribute('uv');
    det.push(col(t, 0xd4d8da));
    for (const [a, b] of [
      [-0.4, -0.3],
      [0.4, -0.3],
      [-0.4, 0.3],
      [0.4, 0.3],
    ])
      det.push(B(0.05, 0.4, 0.05, tx + a, ty + 0.2, tz + b, 0x707470));
  }
  if (rnd() < 0.5) {
    const lz = D / 2 + 0.9;
    det.push(
      B(0.05, 1.8, 0.05, -W / 2 + 0.4, 0.9, lz, 0x9aa0a0),
      B(0.05, 1.8, 0.05, W / 2 - 0.4, 0.9, lz, 0x9aa0a0),
      B(W - 0.8, 0.03, 0.03, 0, 1.75, lz, 0x9aa0a0),
    );
    for (let k = 0; k < 4; k++)
      det.push(
        B(0.4, 0.6, 0.02, -W / 2 + 1 + (k * (W - 2)) / 4, 1.42, lz, [0xd84a4a, 0xe8e0c8, 0x3a6aa8, 0xe8c040][k]),
      );
  }
  for (let i = 0; i < 3; i++)
    if (rnd() < 0.5) {
      const px = -W / 2 + 0.3 + rnd() * (W - 0.6);
      det.push(B(0.35, 0.35, 0.35, px, 0.18, D / 2 + 0.35, 0x8a5a3a));
      const s = new THREE.SphereGeometry(0.3, 6, 4);
      s.translate(px, 0.55, D / 2 + 0.35);
      s.deleteAttribute('uv');
      det.push(col(s, 0x3a7a3a));
    }
  if (rnd() < 0.5) {
    const ax = (rnd() - 0.5) * W * 0.6;
    det.push(
      B(0.04, 1.6, 0.04, ax, H + ridge + 0.8, 0, 0x777777),
      B(1.0, 0.03, 0.03, ax, H + ridge + 1.4, 0, 0x777777),
      B(0.7, 0.03, 0.03, ax, H + ridge + 1.15, 0, 0x777777),
    );
  }
  const add = (arr: THREE.BufferGeometry[], m: THREE.Material, cast = true) => {
    if (!arr.length) return;
    const me = new THREE.Mesh(mergeGeometries(arr.map(strip)), m);
    me.castShadow = cast;
    me.receiveShadow = true;
    g.add(me);
  };
  for (const a of walls) col(a, 0xffffff);
  for (const a of roofs) col(a, 0xffffff);
  add(walls, MATS[wallI]);
  add(roofs, MATS[roofI]);
  for (const a of det)
    if (!a.attributes.uv)
      a.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.attributes.position.count * 2), 2));
  for (const a of glass)
    a.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.attributes.position.count * 2), 2));
  add(det, detMat);
  add(glass, shackGlass, false);
  return g;
}

// ---- irregular rooftop placement (v14) ----
// Rules derived from real Taipei aerial photos (Wikimedia Commons "Taipei-rooftop-additions.jpg" etc.):
// each row-house lot (4-7 m frontage) is a separate owner -> separate treatment, colour, height & age;
// many lots carry a full-roof gable/arch tin canopy, others a partial shack hugging front or rear parapet,
// some stacked 2-storey, stair towers with lean-tos, and open lots with tanks/plants/laundry; ridges mostly
// run along lot depth; occasional skew. Adjacent lots sometimes merge (one owner bought both).
export type RoofClass = 'row' | 'walkup' | 'big' | 'none';
const NONRES =
  /school|college|universit|kindergarten|temple|shrine|church|relig|market|hospital|clinic|public|civic|government|station|train|transport|industrial|warehouse|commercial|retail|office|hotel|parking|garage|landmark|sport|stadium|museum|library|police|fire/i;
/** Classify a footprint for rooftop additions: floors, footprint area and lot shape (oriented bbox). */
export function roofClass(pts: [number, number][], lv: number, kind = ''): RoofClass {
  if (NONRES.test(kind)) return 'none';
  let A = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      c = pts[(i + 1) % pts.length];
    A += a[0] * c[1] - c[0] * a[1];
  }
  A = Math.abs(A / 2);
  if (lv >= 6 || A > 600) return 'big';
  let best = 0,
    th = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > best) ((best = L), (th = Math.atan2(b[1] - a[1], b[0] - a[0])));
  }
  const cu = Math.cos(th),
    su = Math.sin(th);
  let v0 = 1e9,
    v1 = -1e9;
  for (const p of pts) {
    const v = -p[0] * su + p[1] * cu;
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  }
  const D = v1 - v0;
  if (lv <= 5 && D >= 6 && D <= 22 && A <= 450) return 'row';
  return lv <= 5 ? 'walkup' : 'big';
}
export const roofStats: Record<RoofClass, { n: number; with: number; roofA: number; coverA: number }> = {
  row: { n: 0, with: 0, roofA: 0, coverA: 0 },
  walkup: { n: 0, with: 0, roofA: 0, coverA: 0 },
  big: { n: 0, with: 0, roofA: 0, coverA: 0 },
  none: { n: 0, with: 0, roofA: 0, coverA: 0 },
};
const conc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
type PIP = (p: [number, number], pts: [number, number][]) => boolean;
export function placeRooftop(
  root: THREE.Object3D,
  pts: [number, number][],
  h: number,
  rnd: () => number,
  pip: PIP,
  cls: RoofClass = 'row',
) {
  // principal axis = longest edge
  let best = 0,
    th = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > best) {
      best = L;
      th = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  const cu = Math.cos(th),
    su = Math.sin(th);
  const toL = (p: [number, number]) => [p[0] * cu + p[1] * su, -p[0] * su + p[1] * cu];
  let u0 = 1e9,
    u1 = -1e9,
    v0 = 1e9,
    v1 = -1e9;
  for (const p of pts) {
    const [u, v] = toL(p);
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  }
  const W = u1 - u0,
    D = v1 - v0;
  const st = roofStats[cls];
  st.n++;
  st.roofA += W * D;
  if (cls === 'none' || W < 3.5 || D < 3.5) return;
  const grp = new THREE.Group();
  const extra: THREE.BufferGeometry[] = [],
    cg: THREE.BufferGeometry[] = [];
  const world = (u: number, v: number): [number, number] => [u * cu - v * su, u * su + v * cu];
  const inside = (u: number, v: number, w: number, d: number, r: number) => {
    const c = Math.cos(r),
      s = Math.sin(r);
    return [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].every(([a, b]) => {
      const du = a * (w / 2 + 0.35),
        dv = b * (d / 2 + 0.35);
      return pip(world(u + du * c - dv * s, v + du * s + dv * c), pts);
    });
  };
  const put = (u: number, v: number, w: number, d: number, y: number, r: number, o: ShackOpt = {}) => {
    for (let k = 0; k < 4; k++) {
      if (inside(u, v, w, d, r)) {
        const sh = makeShack(w, d, rnd, o);
        const [x, z] = world(u, v);
        sh.position.set(x, y, z);
        sh.rotation.y = -(th + r);
        grp.add(sh);
        // v24.30 a body on this roof walks round the house: its footprint, for whoever climbs up here
        {
          const ca = Math.cos(th + r),
            sa = Math.sin(th + r);
          const obs = ((root.userData.obs as [number, number][][] | undefined) ??= []);
          obs.push(
            [
              [-w / 2, -d / 2],
              [w / 2, -d / 2],
              [w / 2, d / 2],
              [-w / 2, d / 2],
            ].map(([lx, lz]) => [x + lx * ca - lz * sa, z + lx * sa + lz * ca] as [number, number]),
          );
        }
        return true;
      }
      w *= 0.82;
      d *= 0.82;
      if (w < 2.2 || d < 2.2) return false;
    }
    return false;
  };
  const ext = (g: THREE.BufferGeometry, u: number, v: number, y: number, r = 0) => {
    const [x, z] = world(u, v);
    g.rotateY(-(th + r));
    g.translate(x, y, z);
    return g;
  };
  const tank = (u: number, v: number, y: number) => {
    const t = new THREE.CylinderGeometry(0.45, 0.45, 1.0, 10);
    if (rnd() < 0.5) t.rotateZ(Math.PI / 2);
    t.translate(0, 1.3, 0);
    t.deleteAttribute('uv');
    extra.push(ext(col(t, rnd() < 0.7 ? 0xd4d8da : 0x3a6ab0), u, v, y));
    for (const [a, b] of [
      [-0.35, -0.35],
      [0.35, -0.35],
      [-0.35, 0.35],
      [0.35, 0.35],
    ])
      extra.push(ext(B(0.05, 0.8, 0.05, a, 0.4, b, 0x707470), u, v, y));
  };
  const plants = (u: number, v: number, y: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = (rnd() - 0.5) * 2.4,
        b = (rnd() - 0.5) * 1.2;
      extra.push(ext(B(0.4, 0.35, 0.4, a, 0.18, b, [0x8a5a3a, 0x5a5a5a, 0xb07040][i % 3]), u, v, y));
      const s = new THREE.SphereGeometry(0.3 + rnd() * 0.2, 6, 4);
      s.translate(a, 0.6, b);
      s.deleteAttribute('uv');
      extra.push(ext(col(s, rnd() < 0.5 ? 0x3a7a3a : 0x507a30), u, v, y));
    }
  };
  const laundry = (u: number, v: number, y: number, L: number) => {
    extra.push(
      ext(B(0.05, 1.8, 0.05, -L / 2, 0.9, 0, 0x9aa0a0), u, v, y),
      ext(B(0.05, 1.8, 0.05, L / 2, 0.9, 0, 0x9aa0a0), u, v, y),
      ext(B(L, 0.03, 0.03, 0, 1.75, 0, 0x9aa0a0), u, v, y),
    );
    for (let k = 0; k < Math.floor(L / 0.6); k++)
      extra.push(
        ext(
          B(
            0.4,
            0.55 + rnd() * 0.3,
            0.02,
            -L / 2 + 0.4 + k * 0.6,
            1.4,
            0,
            [0xd84a4a, 0xe8e0c8, 0x3a6aa8, 0xe8c040, 0x404040][Math.floor(rnd() * 5)],
          ),
          u,
          v,
          y,
        ),
      );
  };
  // v21.1 class-aware coverage (real Taipei): 連棟透天 rows → per-lot additions 60–90 % of each lot, aligned along
  // the row, some lots open; 4–5F walk-ups → one partial shack at one end; big / tall → none or a small set-back
  // stair/tank room (< ~20 %); non-residential → none (handled above).
  let cover = 0;
  const putC = (u: number, v: number, w: number, d: number, o: ShackOpt) => {
    const before = grp.children.length;
    const ok = put(u, v, w, d, h, 0, o);
    if (ok && grp.children.length > before) {
      const sh = grp.children[grp.children.length - 1] as any;
      cover += (sh.userData.w ?? w) * (sh.userData.d ?? d);
    }
    return ok;
  };
  const vm = (v0 + v1) / 2;
  const set = 0.5 + rnd() * 0.3;
  const Du = D - set * 2;
  if (cls === 'row') {
    const lots: [number, number][] = [];
    let a = u0 + 0.4;
    const lotW = 4 + rnd() * 2;
    while (a < u1 - 0.4 - 2.5) {
      let w = lotW;
      if (u1 - 0.4 - (a + w) < 3) w = u1 - 0.4 - a;
      lots.push([a, w]);
      a += w;
      if (lots.length > 14) break;
    }
    const kind = rnd() < 0.65 ? 0.2 : rnd() < 0.6 ? 0.6 : 0.9;
    const baseMat = pickMat(rnd());
    const H0 = 2.6 + rnd() * 0.3;
    const side = rnd() < 0.5 ? -1 : 1; // additions hug the same parapet along the whole row
    const frac = 0.6 + rnd() * 0.3;
    const uniform = rnd() < 0.5;
    for (const [la, lw] of lots) {
      const um = la + lw / 2;
      if (rnd() < 0.2) {
        if (rnd() < 0.8) tank(um, vm, h);
        if (rnd() < 0.5) laundry(um, vm + side * -1, h, Math.min(lw - 1, 3));
        continue;
      }
      const m = uniform || rnd() < 0.6 ? baseMat : pickMat(rnd());
      const f = uniform ? frac : Math.min(0.9, Math.max(0.6, frac + (rnd() - 0.5) * 0.15));
      const d = Du * f;
      const dH = uniform ? 0 : Math.round((rnd() - 0.5) * 2) * 0.25;
      putC(um, vm + (side * (Du - d)) / 2, lw - 0.06, d, { H: H0 + dH, kind, mat: m, roofMat: m, open: false });
      if (d < Du - 2 && rnd() < 0.5) tank(um, vm - (side * (Du - d / 2)) / 2, h);
    }
  } else if (cls === 'walkup') {
    if (rnd() < 0.4) {
      tank(u0 + W * (0.2 + rnd() * 0.6), vm, h);
    } else {
      const m = pickMat(rnd());
      const w = Math.min(W - 1.6, W * (0.3 + rnd() * 0.25)),
        d = Math.min(Du - 1, D * (0.4 + rnd() * 0.3));
      const end = rnd() < 0.5 ? -1 : 1;
      const um = (u0 + u1) / 2 + end * (W / 2 - 0.8 - w / 2);
      putC(um, vm + (rnd() - 0.5) * (Du - d), w, d, {
        H: 2.6,
        kind: rnd() < 0.6 ? 0.2 : 0.6,
        mat: m,
        roofMat: m,
        open: false,
      });
      tank(um - end * (w / 2 + 1.5), vm, h);
    }
  } else {
    // big / tall: concrete roof, parapet, tanks; sometimes a small set-back stair / tank room
    const nT = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < nT; i++) tank(u0 + 2 + rnd() * (W - 4), v0 + 2 + rnd() * (D - 4), h);
    if (rnd() < 0.45) {
      const cap = 0.18 * W * D;
      let w = Math.min(3 + rnd() * 3, W - 4),
        d = Math.min(3 + rnd() * 2.5, D - 4);
      if (w * d > cap) {
        const k = Math.sqrt(cap / (w * d));
        w *= k;
        d *= k;
      }
      if (w > 2.3 && d > 2.3) {
        const m = pickMat(rnd());
        putC(
          u0 + 1.5 + w / 2 + rnd() * Math.max(0, W - 3 - w),
          v0 + 1.5 + d / 2 + rnd() * Math.max(0, D - 3 - d),
          w,
          d,
          {
            H: 2.5,
            kind: 0.2,
            mat: m,
            roofMat: m,
            open: false,
          },
        );
      }
    }
  }
  if (cover > 0) st.with++;
  st.coverA += cover;
  // merge everything by material to keep draw calls low
  grp.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const push = (m: THREE.Material, g: THREE.BufferGeometry) => {
    if (!g.attributes.uv)
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.color) col(g, 0xffffff);
    (buckets.get(m) || buckets.set(m, []).get(m)!).push(strip(g));
  };
  grp.traverse(o => {
    const me = o as THREE.Mesh;
    if (me.isMesh) {
      const g = me.geometry.clone();
      g.applyMatrix4(me.matrixWorld);
      push(me.material as THREE.Material, g);
    }
  });
  for (const g of extra) push(detMat, g);
  for (const g of cg) push(conc, g);
  for (const [m, arr] of buckets) {
    const me = new THREE.Mesh(mergeGeometries(arr), m);
    me.castShadow = m !== shackGlass;
    me.receiveShadow = true;
    root.add(me);
  }
}

// ---- roof finishes (防水漆 / concrete / bitumen / tile) + parapets & clutter ----
const roofTex = (kind: number, seed: number) =>
  cv(256, 256, c => {
    let s = seed;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const base = [
      ['#6f8f6a', '#5e8060'],
      ['#8a8e8a', '#7c807e'],
      ['#9a968c', '#86827a'],
      ['#5a5a58', '#4a4a48'],
      ['#a2584a', '#8e4c40'],
      ['#7a9a7a', '#91a88e'],
    ][kind];
    c.fillStyle = base[0];
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
      c.fillStyle = r() < 0.5 ? base[1] : 'rgba(150,150,140,.35)';
      c.globalAlpha = 0.25 + r() * 0.4;
      c.beginPath();
      c.ellipse(r() * 256, r() * 256, 10 + r() * 50, 6 + r() * 30, r() * 3, 0, 7);
      c.fill();
    } // patchy fade / bare concrete showing
    c.globalAlpha = 1;
    if (kind === 4) {
      c.strokeStyle = 'rgba(50,20,10,.5)';
      for (let y = 0; y < 256; y += 16) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(256, y);
        c.stroke();
      }
      for (let y = 0; y < 256; y += 16)
        for (let x = ((y / 16) % 2) * 12; x < 256; x += 24) {
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x, y + 16);
          c.stroke();
        }
    }
    for (let i = 0; i < 2 + (kind % 3); i++) {
      c.fillStyle = `rgba(28,28,26,${0.35 + r() * 0.25})`;
      c.save();
      c.translate(r() * 256, r() * 256);
      c.rotate(r() * 3);
      c.beginPath();
      c.roundRect(-10 - r() * 18, -6 - r() * 10, 20 + r() * 36, 12 + r() * 20, 5);
      c.fill();
      c.restore();
    } // bitumen patches
    for (let i = 0; i < 6; i++) {
      const g = c.createRadialGradient(0, 0, 2, 0, 0, 30 + r() * 30);
      g.addColorStop(0, 'rgba(40,40,30,.35)');
      g.addColorStop(1, 'rgba(40,40,30,0)');
      c.save();
      c.translate(r() * 256, r() * 256);
      c.scale(1, 0.6 + r());
      c.fillStyle = g;
      c.fillRect(-60, -60, 120, 120);
      c.restore();
    } // water / puddle stains
    for (let i = 0; i < 10; i++) {
      c.fillStyle = `rgba(${50 + r() * 30},${80 + r() * 40},40,${0.3 + r() * 0.3})`;
      c.beginPath();
      c.arc(r() * 256, r() < 0.6 ? (r() < 0.5 ? r() * 14 : 256 - r() * 14) : r() * 256, 2 + r() * 8, 0, 7);
      c.fill();
    } // moss, mostly along edges
    for (let i = 0; i < 4; i++) {
      const x = r() * 256;
      const g = c.createLinearGradient(0, 0, 0, 90);
      g.addColorStop(0, 'rgba(15,15,15,.6)');
      g.addColorStop(1, 'rgba(15,15,15,0)');
      c.fillStyle = g;
      c.fillRect(x, 0, 4 + r() * 6, 90);
    } // black streaks from drains
    c.strokeStyle = 'rgba(30,30,30,.55)';
    c.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      let x = r() * 256,
        y = r() * 256;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (r() - 0.5) * 22;
        y += (r() - 0.5) * 22;
        c.lineTo(x, y);
      }
      c.stroke();
    } // cracks
  });
const ROOF_KINDS = [0, 0, 5, 1, 1, 2, 2, 3, 4, 0, 5, 2, 1, 0];
export const ROOF_MATS = ROOF_KINDS.map((k, i) => {
  const t = roofTex(k, 999 + i * 131);
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1 / 9, 1 / 9);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide });
});
let lastRoof = -1;
export function pickRoofMat(rnd: () => number) {
  let i = Math.floor(rnd() * ROOF_MATS.length);
  if (ROOF_KINDS[i] === ROOF_KINDS[Math.max(0, lastRoof)]) i = (i + 3) % ROOF_MATS.length;
  lastRoof = i;
  return ROOF_MATS[i];
}
export function dressRoof(
  root: THREE.Object3D,
  pts: [number, number][],
  h: number,
  rnd: () => number,
  pip: PIP,
  clutter: boolean,
  out?: { det: THREE.BufferGeometry[]; conc: THREE.BufferGeometry[] },
) {
  const g: THREE.BufferGeometry[] = [];
  const cg: THREE.BufferGeometry[] = []; // matte concrete / membrane pieces
  const pc = [0xb4b0a6, 0x9c9a92, 0xc8c4b8, 0x8a8e84][Math.floor(rnd() * 4)];
  let cx = 0,
    cz = 0;
  for (const p of pts) {
    cx += p[0];
    cz += p[1];
  }
  cx /= pts.length;
  cz /= pts.length;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.5) continue;
    const ang = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    const mx = (a[0] + b[0]) / 2,
      mz = (a[1] + b[1]) / 2;
    const ph = 0.8 + rnd() * 0.4;
    const box = (w: number, hh: number, d: number, y: number, c: number, off = 0) => {
      const q = new THREE.BoxGeometry(w, hh, d);
      q.translate(0, y, off);
      q.rotateY(ang);
      q.translate(mx, h, mz);
      q.deleteAttribute('uv');
      g.push(col(q, c));
    };
    const nx = -(b[1] - a[1]) / L,
      nz = (b[0] - a[0]) / L;
    const inw = pip([mx + nx * 0.3, mz + nz * 0.3], pts) ? 1 : -1; // inward side offset (in rotated frame z ~ normal)
    box(L, ph, 0.16, ph / 2, pc, 0.08 * inw);
    box(L + 0.1, 0.07, 0.28, ph + 0.035, 0xd0ccc2, 0.08 * inw); // parapet + coping
    for (let k = 0; k < L / 4; k++)
      if (rnd() < 0.5) {
        const q = new THREE.BoxGeometry(0.12 + rnd() * 0.1, 0.5 + rnd() * 1.5, 0.02);
        const off = (rnd() - 0.5) * L;
        q.translate(off, -0.4, -0.05 * inw);
        q.rotateY(ang);
        q.translate(mx, h, mz);
        q.deleteAttribute('uv');
        g.push(col(q, 0x6a3a1e));
      } // rust/black drips outside below coping
  }
  if (clutter) {
    const rp = (): [number, number] | null => {
      for (let k = 0; k < 6; k++) {
        const p: [number, number] = [cx + (rnd() - 0.5) * 12, cz + (rnd() - 0.5) * 12];
        if (pip(p, pts) && pip([p[0] + 1, p[1] + 1], pts) && pip([p[0] - 1, p[1] - 1], pts)) return p;
      }
      return null;
    };
    const at = (q: THREE.BufferGeometry, p: [number, number], y = 0, r = rnd() * 6.28) => {
      q.rotateY(r);
      q.translate(p[0], h + y, p[1]);
      if (q.attributes.uv) q.deleteAttribute('uv');
      return q;
    };
    let p = rp();
    if (p && rnd() < 0.45) {
      g.push(
        at(col(new THREE.BoxGeometry(2.0, 0.06, 1.2).rotateX(-0.5).translate(0, 1.0, 0), 0x1c2a44), p),
        at(
          col(new THREE.CylinderGeometry(0.25, 0.25, 2.0, 8).rotateZ(Math.PI / 2).translate(0, 1.55, -0.55), 0xd8d8d8),
          p,
        ),
      );
      g.push(at(col(new THREE.BoxGeometry(1.9, 0.8, 0.05).translate(0, 0.4, 0.4), 0x7a7a7a), p));
    } // solar water heater
    p = rp();
    if (p && rnd() < 0.6)
      g.push(
        at(
          col(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 10).translate(0, 0.6, 0), rnd() < 0.5 ? 0x3a6ab0 : 0xe8e8e0),
          p,
        ),
      ); // old plastic tank
    for (let i = 0; i < 2; i++) {
      p = rp();
      if (p && rnd() < 0.6) g.push(at(col(new THREE.BoxGeometry(0.85, 0.6, 0.32).translate(0, 0.3, 0), 0xe4e2da), p));
    } // AC compressors
    p = rp();
    if (p && rnd() < 0.5) {
      const e = rnd() * 6.28;
      for (let i = 0; i < 2; i++)
        g.push(
          at(
            col(
              new THREE.CylinderGeometry(0.04, 0.04, 6, 5).rotateZ(Math.PI / 2).translate(0, 0.15, i * 0.2),
              i ? 0x9a9a9a : 0x4a6a8a,
            ),
            p,
            0,
            e,
          ),
        );
    } // pipes across
    p = rp();
    if (p && rnd() < 0.5)
      for (let i = 0; i < 5; i++)
        g.push(
          at(
            col(
              new THREE.BoxGeometry(0.3 + rnd() * 0.7, 0.2 + rnd() * 0.5, 0.3 + rnd() * 0.6).translate(
                (rnd() - 0.5) * 1.2,
                0.2,
                (rnd() - 0.5) * 1.2,
              ),
              [0x6a5a48, 0x8a8a84, 0x4a4a48, 0x9a7a50][i % 4],
            ),
            p,
          ),
        ); // junk pile
    p = rp();
    if (p && rnd() < 0.55)
      for (let i = 0; i < 4; i++) {
        g.push(at(col(new THREE.BoxGeometry(0.55, 0.3, 0.4).translate(i * 0.6, 0.15, 0), 0xf0f0ec), p, 0, 0.3));
        g.push(at(col(new THREE.SphereGeometry(0.28, 6, 4).translate(i * 0.6, 0.45, 0), 0x3f7a35), p, 0, 0.3));
      } // 保麗龍 foam boxes of plants
    p = rp();
    if (p && rnd() < 0.5)
      g.push(
        at(col(new THREE.CylinderGeometry(0.025, 0.025, 2.5, 4).translate(0, 1.25, 0), 0x777777), p),
        at(col(new THREE.BoxGeometry(1.2, 0.03, 0.03).translate(0, 2.2, 0), 0x777777), p),
      ); // antenna
  }
  bigRoof(g, cg, pts, h, rnd, pip);
  for (const q of [...g, ...cg]) {
    if (q.index) {
      const n = q.toNonIndexed();
      q.copy(n);
    }
    q.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
  }
  if (out) {
    out.det.push(...g.map(strip));
    out.conc.push(...cg.map(strip));
    return;
  }
  for (const [arr, m] of [
    [g, detMat],
    [cg, roofConc],
  ] as const)
    if (arr.length) {
      const me = new THREE.Mesh(mergeGeometries(arr.map(strip)), m);
      me.castShadow = true;
      me.receiveShadow = true;
      root.add(me);
    }
}
export const roofDetMat = detMat;
export const roofConc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
/** v22.9.1 Taipei flat-roof kit, scaled by roof area and spread over the whole footprint (not just the centre):
 * 樓梯間 stair housing with door, worn waterproofing patches + drains, stainless / blue plastic tanks on steel
 * stands, rows of AC condensers, a small 鐵皮 lean-to, antennas + a dish, satellite clutter. Deterministic via rnd. */
function bigRoof(
  g: THREE.BufferGeometry[],
  cg: THREE.BufferGeometry[],
  pts: [number, number][],
  h: number,
  rnd: () => number,
  pip: PIP,
) {
  let A = 0,
    x0 = 1e9,
    x1 = -1e9,
    z0 = 1e9,
    z1 = -1e9,
    best = 0,
    th = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      c = pts[(i + 1) % pts.length];
    A += a[0] * c[1] - c[0] * a[1];
    x0 = Math.min(x0, a[0]);
    x1 = Math.max(x1, a[0]);
    z0 = Math.min(z0, a[1]);
    z1 = Math.max(z1, a[1]);
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (L > best) ((best = L), (th = -Math.atan2(c[1] - a[1], c[0] - a[0])));
  }
  A = Math.abs(A / 2);
  if (A < 60) return;
  const inside = (x: number, z: number, r: number) =>
    pip([x, z], pts) &&
    pip([x + r, z + r], pts) &&
    pip([x - r, z - r], pts) &&
    pip([x + r, z - r], pts) &&
    pip([x - r, z + r], pts);
  const taken: [number, number, number][] = [];
  const spot = (r: number): [number, number] | null => {
    for (let k = 0; k < 14; k++) {
      const x = x0 + rnd() * (x1 - x0),
        z = z0 + rnd() * (z1 - z0);
      if (!inside(x, z, r + 0.6)) continue;
      if (taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r + 0.4)) continue;
      taken.push([x, z, r]);
      return [x, z];
    }
    return null;
  };
  const put = (arr: THREE.BufferGeometry[], q: THREE.BufferGeometry, c: number, p: [number, number], y = 0, r = th) => {
    q.rotateY(r);
    q.translate(p[0], h + y, p[1]);
    if (q.attributes.uv) q.deleteAttribute('uv');
    arr.push(col(q, c));
  };
  const B = (w: number, hh: number, d: number, ox = 0, oy = 0, oz = 0) =>
    new THREE.BoxGeometry(w, hh, d).translate(ox, oy + hh / 2, oz);
  const n = Math.min(1, A / 400);
  // waterproofing: 2-6 patched membrane sheets (grey-green / tar black / faded silver) + drain stains
  for (let i = 0; i < 2 + Math.floor(n * 4); i++) {
    const w = 3 + rnd() * 6,
      d = 2 + rnd() * 5,
      p = spot(Math.max(w, d) * 0.35);
    if (!p) continue;
    const c = [0x5f6a5c, 0x2c2c2a, 0x8e9290, 0x6e665a][Math.floor(rnd() * 4)];
    put(cg, new THREE.BoxGeometry(w, 0.02, d).translate(0, 0.02 + i * 0.003, 0), c, p, 0, th + (rnd() - 0.5) * 0.2);
  }
  // 樓梯間 stair housing (one per ~350 m²) with a rusty steel door and a small tank on top
  for (let i = 0; i < Math.max(1, Math.round(A / 350)) && i < 3; i++) {
    const w = 2.6 + rnd() * 0.8,
      d = 3.2 + rnd() * 1.4,
      hh = 2.6;
    const p = spot(Math.max(w, d) * 0.6);
    if (!p) continue;
    const wc = [0xb8b2a4, 0xa8a69c, 0xc4bca8][Math.floor(rnd() * 3)];
    put(cg, B(w, hh, d), wc, p);
    put(cg, B(w + 0.3, 0.12, d + 0.3, 0, hh), 0x8a867c, p); // slab overhang
    put(g, B(0.95, 2.05, 0.06, 0, 0, d / 2 + 0.02), 0x6a4a34, p); // door
    for (let k = 0; k < 3; k++)
      put(cg, B(0.06, 0.3 + rnd() * 1.4, 0.02, (rnd() - 0.5) * w, hh - 1.6, d / 2 + 0.01), 0x5a5048, p); // stains
    if (rnd() < 0.7)
      put(
        g,
        new THREE.CylinderGeometry(0.5, 0.5, 1.1, 10).translate(0, hh + 0.12 + 0.55, 0),
        rnd() < 0.5 ? 0x3a6ab0 : 0xd8dcdc,
        p,
      );
  }
  // water tanks on steel stands: stainless horizontal / vertical, or blue plastic
  for (let i = 0; i < 1 + Math.floor(n * 3); i++) {
    const p = spot(1.3);
    if (!p) continue;
    const st = 0.6 + rnd() * 1.2,
      kind = rnd();
    for (const [ox, oz] of [
      [-0.6, -0.6],
      [0.6, -0.6],
      [0.6, 0.6],
      [-0.6, 0.6],
    ])
      put(g, B(0.08, st, 0.08, ox, 0, oz), 0x4a4440, p);
    put(g, B(1.5, 0.08, 1.5, 0, st), 0x4a4440, p);
    if (kind < 0.4)
      put(
        g,
        new THREE.CylinderGeometry(0.65, 0.65, 1.9, 12).rotateZ(Math.PI / 2).translate(0, st + 0.73, 0),
        0xdfe3e6,
        p,
      );
    else
      put(
        g,
        new THREE.CylinderGeometry(0.7, 0.7, 1.5, 12).translate(0, st + 0.83, 0),
        kind < 0.7 ? 0xd4d8da : 0x2f5fa6,
        p,
      );
  }
  // AC condenser rows
  for (let r = 0; r < 1 + Math.floor(n * 3); r++) {
    const k = 2 + Math.floor(rnd() * 4),
      p = spot(k * 0.5);
    if (!p) continue;
    for (let i = 0; i < k; i++) {
      put(g, B(0.85, 0.62, 0.34, (i - k / 2) * 0.95, 0.1), 0xe2e0d8, p);
      put(g, B(0.06, 0.1, 0.4, (i - k / 2) * 0.95, 0), 0x55504a, p);
    }
    put(
      g,
      new THREE.CylinderGeometry(0.03, 0.03, k * 0.95, 4).rotateZ(Math.PI / 2).translate(0, 0.8, 0.3),
      0x9a9a96,
      p,
    ); // pipe run
  }
  // 鐵皮 lean-to / storage shed on larger roofs
  if (A > 160 && rnd() < 0.7) {
    const w = 3 + rnd() * 3,
      d = 2.5 + rnd() * 2,
      p = spot(Math.max(w, d) * 0.6);
    if (p) {
      const c = [0x5a7a8a, 0x8a5a3a, 0x9a9a92, 0x3f6a5a][Math.floor(rnd() * 4)];
      put(g, B(w, 2.2, d), c, p);
      put(g, new THREE.BoxGeometry(w + 0.4, 0.05, d + 0.5).rotateX(0.12).translate(0, 2.35, 0), 0x7a7a74, p);
    }
  }
  // antennas + a satellite dish
  for (let i = 0; i < 1 + Math.floor(n * 2); i++) {
    const p = spot(0.4);
    if (!p) continue;
    const L = 2 + rnd() * 3;
    put(g, new THREE.CylinderGeometry(0.03, 0.04, L, 4).translate(0, L / 2, 0), 0x8a8a8a, p);
    for (let k = 0; k < 3; k++) put(g, B(0.9 - k * 0.2, 0.02, 0.02, 0, L - 0.3 - k * 0.35), 0x8a8a8a, p);
  }
  if (rnd() < 0.6) {
    const p = spot(0.6);
    if (p) put(g, new THREE.SphereGeometry(0.45, 8, 4, 0, 6.28, 0, 1.1).rotateX(1.1).translate(0, 0.9, 0), 0xdedcd6, p);
  }
}
