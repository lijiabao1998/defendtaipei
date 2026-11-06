// v21.4 Taipei / 萬華 street and park trees, low-poly but recognisable by silhouette (fictional, feel over specs):
// 台灣欒樹 (round crown, autumn yellow flowers / red capsules), 樟樹 (broad lumpy yellow-green dome), 榕樹 (fat
// trunk, huge flat canopy, hanging aerial roots — parks and temple squares), 茄苳 (dense dark crown, reddish bark),
// 黑板樹 (tall straight trunk, whorled pagoda tiers), 小葉欖仁 (thin trunk, flat horizontal tiers), 大王椰子 (tall grey
// column, green crownshaft, drooping fronds), heavily pruned street trees, shrubs, park benches and lamps, and
// cast-iron tree-pit guard grates. Every kind is one merged vertex-coloured geometry drawn as an InstancedMesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Kind =
  | 'luan'
  | 'luanY'
  | 'luanR'
  | 'flame'
  | 'banana'
  | 'papaya'
  | 'camphor'
  | 'banyan'
  | 'bishop'
  | 'board'
  | 'termin'
  | 'palm'
  | 'pruned'
  | 'shrub'
  | 'grate'
  | 'bench'
  | 'plamp';

const P: { g: THREE.BufferGeometry; c: number }[] = [];
const pt = (g: THREE.BufferGeometry, c: number) => P.push({ g, c });
const cyl = (r0: number, r1: number, h: number, y: number, seg = 6) =>
  new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, y + h / 2, 0);
const blob = (r: number, x: number, y: number, z: number, sy = 0.75, d = 0) =>
  new THREE.IcosahedronGeometry(r, d).scale(1, sy, 1).translate(x, y, z);
const box = (x: number, y: number, z: number, tx: number, ty: number, tz: number) =>
  new THREE.BoxGeometry(x, y, z).translate(tx, ty, tz);
const hash3 = (a: number, b: number, c: number) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
/**
 * v24.25 a clump of leaves: a lumpy ball, lit on top and dark beneath, every facet a little different, so that a crown reads
 * as foliage and not as a green ball. d = how finely it is cut (0: 20 facets, 1: 80).
 */
function leaves(r: number, x: number, y: number, z: number, sy: number, col: number, d = 1, lump = 0.24) {
  const g = new THREE.IcosahedronGeometry(r, d);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i),
      vy = p.getY(i),
      vz = p.getZ(i);
    // the same corner of every facet moves the same way, whatever the seed of the clump
    const k = hash3(Math.round(vx * 40 + x * 3), Math.round(vy * 40 + y * 3), Math.round(vz * 40 + z * 3));
    const m = 1 + (k - 0.5) * 2 * lump;
    p.setXYZ(i, vx * m, vy * m * sy, vz * m);
  }
  const a = new Float32Array(p.count * 3);
  const cc = new THREE.Color(col);
  for (let i = 0; i < p.count; i += 3) {
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 / (r * sy);
    const f = (0.66 + 0.42 * Math.max(0, Math.min(1, (cy + 1) / 2))) * (0.93 + 0.14 * hash3(i, x * 7 + 1, y * 7 + 2));
    for (let k = 0; k < 3; k++) a.set([cc.r * f, cc.g * f, cc.b * f], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.translate(x, y, z);
}
const lv = (r: number, x: number, y: number, z: number, sy: number, col: number, d = 1, lump = 0.24) =>
  P.push({ g: leaves(r, x, y, z, sy, col, d, lump), c: -1 });
/**
 * a whole crown: a dark heart and many small clumps spread over it, lighter towards the top. A crown is read by its broken
 * outline and the shadow between the clumps, so many small ones look finer than a few big ones, at the same triangle count.
 */
function crown(x: number, y: number, z: number, R: number, sy: number, n: number, col: number) {
  const dark = new THREE.Color(col).multiplyScalar(0.62).getHex();
  lv(R * 0.74, x, y - R * sy * 0.08, z, sy, dark, 0, 0.18);
  const base = new THREE.Color(col);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n,
      h = 1 - 1.55 * t;
    const rr = Math.sqrt(Math.max(0, 1 - h * h)),
      a = k * 2.39996 + x;
    const r = R * (0.34 + 0.15 * hash3(k, x + 1, y + 2));
    const c = base.clone().multiplyScalar(0.9 + 0.22 * hash3(k, z + 3, 5) + 0.06 * h);
    lv(
      r,
      x + Math.cos(a) * rr * R * 0.74,
      y + h * R * sy * 0.74,
      z + Math.sin(a) * rr * R * 0.74,
      0.8,
      c.getHex(),
      0,
      0.3,
    );
  }
}
/** a limb: open-ended, because nobody sees the ends */
const limb = (r0: number, r1: number, h: number, seg = 5) => new THREE.CylinderGeometry(r1, r0, h, seg, 1, true);
/** a long leaf as a pair of quads bending at the middle: the shape of a palm frond, or a banana leaf */
function frond(L: number, w: number, a: number, y: number, rise: number, droop: number, c: number) {
  const mx = Math.cos(a) * L * 0.5,
    mz = Math.sin(a) * L * 0.5;
  const nx = -Math.sin(a) * w * 0.5,
    nz = Math.cos(a) * w * 0.5;
  const q = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, s0: number, s1: number) => {
    const g = new THREE.BufferGeometry();
    const v = [
      [x0 - nx * s0, y0, z0 - nz * s0],
      [x1 - nx * s1, y1, z1 - nz * s1],
      [x0 + nx * s0, y0, z0 + nz * s0],
      [x0 + nx * s0, y0, z0 + nz * s0],
      [x1 - nx * s1, y1, z1 - nz * s1],
      [x1 + nx * s1, y1, z1 + nz * s1],
    ].flat();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
    g.computeVertexNormals();
    P.push({ g, c });
  };
  q(0, y, 0, mx, y + rise, mz, 0.5, 1);
  q(mx, y + rise, mz, mx * 2, y + rise - droop, mz * 2, 1, 0.12);
}
function bake() {
  const gs = P.splice(0).map(({ g, c }) => {
    const s = (g.index ? g.toNonIndexed() : g) as THREE.BufferGeometry;
    for (const k of Object.keys(s.attributes)) if (!['position', 'normal', 'color'].includes(k)) s.deleteAttribute(k);
    // c < 0: it has its colours already (a clump of leaves)
    if (c < 0) return s;
    const n = s.attributes.position.count,
      cc = new THREE.Color(c),
      a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([cc.r, cc.g, cc.b], i * 3);
    s.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return s;
  });
  const m = mergeGeometries(gs)!;
  m.computeVertexNormals();
  (m as any).shared = true;
  return m;
}
const BARK = 0x5e5040,
  GREY = 0x77706a;
function luan(fl: number) {
  pt(limb(0.21, 0.14, 3).translate(0, 1.5, 0), BARK);
  pt(limb(0.11, 0.06, 1.8).rotateZ(0.5).translate(0.45, 3.4, 0), BARK);
  pt(limb(0.1, 0.06, 1.7).rotateZ(-0.55).translate(-0.45, 3.5, 0.1), BARK);
  crown(0, 4.75, 0, 2.3, 0.8, 12, 0x4f8034);
  if (fl)
    for (let k = 0; k < 8; k++) {
      const a = k * 2.4;
      lv(0.55, Math.cos(a) * 1.35, 5.3 + (k % 3) * 0.3, Math.sin(a) * 1.35, 0.55, fl, 0, 0.3);
    }
  return bake();
}
const GEO: Record<Kind, () => THREE.BufferGeometry> = {
  luan: () => luan(0),
  luanY: () => luan(0xd9b52e),
  luanR: () => luan(0xa9503a),
  // 鳳凰木: a wide flat umbrella, the flowers burning orange-red on top of it
  flame: () => {
    pt(limb(0.3, 0.18, 3.1).translate(0, 1.55, 0), 0x7a7264);
    for (const a of [0.4, 2.5, 4.5]) pt(limb(0.14, 0.07, 2.6).rotateZ(1).rotateY(a).translate(0, 3.5, 0), 0x7a7264);
    crown(0, 4.6, 0, 3.8, 0.36, 13, 0x568a34);
    for (let k = 0; k < 11; k++) {
      const a = k * 2.399,
        r = 0.5 + (k % 4) * 0.85;
      lv(0.72, Math.cos(a) * r, 5.3 + (k % 2) * 0.2, Math.sin(a) * r, 0.5, k % 3 ? 0xd8401e : 0xe8642a, 0, 0.3);
    }
    return bake();
  },
  camphor: () => {
    pt(limb(0.32, 0.22, 2.6).translate(0, 1.3, 0), 0x4e4236);
    pt(limb(0.18, 0.1, 2.2).rotateZ(0.42).translate(0.45, 3.2, 0), 0x4e4236);
    pt(limb(0.18, 0.1, 2.2).rotateZ(-0.42).translate(-0.45, 3.2, 0), 0x4e4236);
    crown(0, 5, 0, 3, 0.74, 16, 0x668c38);
    return bake();
  },
  banyan: () => {
    pt(limb(0.75, 0.46, 3.4, 8).translate(0, 1.7, 0), GREY);
    // the buttressed foot of an old one
    for (const a of [0.3, 1.9, 3.6, 5.2])
      pt(limb(0.3, 0.1, 1.4, 4).rotateZ(0.7).rotateY(a).translate(0, 0.45, 0), GREY);
    for (const a of [0.6, 2.6, 4.4]) pt(limb(0.24, 0.13, 3.2).rotateZ(0.85).rotateY(a).translate(0, 3.8, 0), GREY);
    crown(0, 5.5, 0, 5.8, 0.34, 30, 0x31602c);
    // aerial roots hanging from the limbs; a few reach the ground as pillar roots
    for (let k = 0; k < 18; k++) {
      const a = k * 2.39,
        r = 1.2 + (k % 5) * 0.62,
        l = k % 5 === 0 ? 4.5 : 1.3 + (k % 3) * 0.7;
      pt(limb(0.06, 0.04, l, 3).translate(Math.cos(a) * r, 4.5 - l / 2, Math.sin(a) * r), 0x5d544a);
    }
    return bake();
  },
  bishop: () => {
    pt(limb(0.34, 0.24, 2.7).translate(0, 1.35, 0), 0x7a4a34);
    crown(0, 4.5, 0, 2.5, 0.84, 12, 0x2f5f2c);
    return bake();
  },
  // 黑板樹: a straight grey trunk with whorls of flat branches, gaps showing between them; not a Christmas tree
  board: () => {
    pt(limb(0.25, 0.1, 9.5).translate(0, 4.75, 0), 0x8a857c);
    for (const [y, r] of [
      [3.6, 2.5],
      [5.5, 2.1],
      [7.2, 1.6],
      [8.8, 1.05],
    ]) {
      for (let k = 0; k < 3; k++) {
        const a = k * 2.094 + y;
        lv(r * 0.72, Math.cos(a) * r * 0.42, y, Math.sin(a) * r * 0.42, 0.28, 0x2f6230, 0, 0.3);
      }
    }
    lv(0.7, 0, 9.8, 0, 0.8, 0x356a32, 0, 0.3);
    return bake();
  },
  // 小葉欖仁: a thin trunk and flat tiers, airy
  termin: () => {
    pt(limb(0.16, 0.07, 7.2).translate(0, 3.6, 0), 0x6e6256);
    for (const [y, r] of [
      [2.7, 2.35],
      [4, 1.95],
      [5.2, 1.45],
      [6.3, 0.95],
    ]) {
      for (let k = 0; k < 2; k++) {
        const a = k * 3.14 + y * 1.7;
        lv(r * 0.82, Math.cos(a) * r * 0.3, y, Math.sin(a) * r * 0.3, 0.17, 0x8bb24c, 0, 0.26);
      }
    }
    lv(0.42, 0, 7.2, 0, 0.5, 0x94bb54, 0, 0.3);
    return bake();
  },
  palm: () => {
    pt(limb(0.31, 0.26, 10, 8).translate(0, 5, 0), 0xb4b0a6);
    pt(new THREE.IcosahedronGeometry(0.42, 0).scale(1, 1.4, 1).translate(0, 4, 0), 0xb4b0a6);
    pt(limb(0.28, 0.2, 2, 8).translate(0, 11, 0), 0x5f8a3a);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + (k % 2) * 0.1;
      frond(3.9 - (k % 3) * 0.3, 0.8, a, 12, 0.5 - (k % 2) * 0.5, 2.1, k % 2 ? 0x3f7a30 : 0x4a8a38);
    }
    return bake();
  },
  pruned: () => {
    // 修剪過度的行道樹: short trunk, stubby limbs, thin regrowth tufts
    pt(limb(0.21, 0.15, 3.2).translate(0, 1.6, 0), BARK);
    for (const a of [0, 2.1, 4.2]) {
      pt(
        limb(0.1, 0.07, 1.4)
          .rotateZ(0.8)
          .rotateY(a)
          .translate(Math.cos(a) * 0.45, 3.45, -Math.sin(a) * 0.45),
        BARK,
      );
      lv(0.62, Math.cos(a) * 0.95, 4.1, -Math.sin(a) * 0.95, 0.78, 0x4c7c34, 0, 0.3);
      lv(0.4, Math.cos(a + 0.8) * 0.6, 4.3, -Math.sin(a + 0.8) * 0.6, 0.8, 0x5a8c3a, 0, 0.3);
    }
    return bake();
  },
  shrub: () => {
    lv(0.72, 0, 0.45, 0, 0.72, 0x3b6d2f, 1, 0.26);
    lv(0.5, 0.6, 0.35, 0.2, 0.72, 0x4a7d36, 0, 0.3);
    return bake();
  },
  // 香蕉: a few soft stems from one root, big paddles of leaves arching out, one of them dead and hanging
  banana: () => {
    for (const [x, z, h] of [
      [0, 0, 2.5],
      [0.45, 0.2, 1.9],
      [-0.3, 0.4, 1.5],
    ]) {
      pt(limb(0.14, 0.09, h, 5).translate(x, h / 2, z), 0x6d8a3e);
      for (let k = 0; k < 5; k++) {
        const a = k * 1.32 + x * 3;
        const g0 = P.length;
        frond(2 + (k % 2) * 0.4, 0.62, a, h, 0.35, 0.95, k === 4 ? 0x8a7a44 : k % 2 ? 0x5da03c : 0x4f9034);
        for (let q = g0; q < P.length; q++) P[q].g.translate(x, 0, z);
      }
    }
    return bake();
  },
  // 木瓜: one thin stem, an umbrella of leaves at the top, the fruit tucked under it
  papaya: () => {
    pt(limb(0.11, 0.07, 3.3, 5).translate(0, 1.65, 0), 0x8a8a70);
    for (let k = 0; k < 9; k++)
      frond(1.45, 0.75, k * 0.7, 3.3, 0.25 + (k % 3) * 0.12, 0.55, k % 2 ? 0x4f8a34 : 0x5f9a3c);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3;
      lv(0.15, Math.cos(a) * 0.17, 3.02, Math.sin(a) * 0.17, 1.35, k % 2 ? 0x7f9a3a : 0xd8a03a, 0, 0.1);
    }
    return bake();
  },
  grate: () => {
    for (const [x, z, w, d] of [
      [0, 0.5, 1.1, 0.1],
      [0, -0.5, 1.1, 0.1],
      [0.5, 0, 0.1, 0.9],
      [-0.5, 0, 0.1, 0.9],
      [0, 0.28, 0.9, 0.05],
      [0, -0.28, 0.9, 0.05],
      [0.28, 0, 0.05, 0.9],
      [-0.28, 0, 0.05, 0.9],
    ])
      pt(box(w, 0.03, d, x, 0.17, z), 0x2a2826);
    // guard hoop
    pt(new THREE.TorusGeometry(0.35, 0.025, 4, 10).rotateX(Math.PI / 2).translate(0, 0.9, 0), 0x3c4a3e);
    for (const a of [0, 1.57, 3.14, 4.71])
      pt(cyl(0.02, 0.02, 0.75, 0.15, 3).translate(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35), 0x3c4a3e);
    return bake();
  },
  bench: () => {
    pt(box(1.6, 0.06, 0.45, 0, 0.45, 0), 0x8a6a3a);
    pt(box(1.6, 0.35, 0.05, 0, 0.72, -0.2), 0x8a6a3a);
    for (const x of [-0.7, 0.7]) pt(box(0.06, 0.45, 0.4, x, 0.22, 0), 0x333333);
    return bake();
  },
  plamp: () => {
    pt(cyl(0.07, 0.05, 3.6, 0), 0x2f3a34);
    pt(new THREE.SphereGeometry(0.22, 8, 6).translate(0, 3.8, 0), 0xf2efe2);
    return bake();
  },
};
const cache: Partial<Record<Kind, THREE.BufferGeometry>> = {};
const geo = (k: Kind) => (cache[k] ||= GEO[k]());
/** v24.25 for lots.ts, which bakes a few of them into its own mesh instead of paying a draw call for each kind */
export const treeGeometry = (k: Kind) => geo(k);
export const TREE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
/** trunk radius (cover / collision) per kind; 0 = no blocker */
export const TRUNK_R: Record<Kind, number> = {
  luan: 0.2,
  luanY: 0.2,
  luanR: 0.2,
  flame: 0.2, // as the 欒樹 it stands in for: a door is placed clear of trunks, so this decides where doors go
  banana: 0.2,
  papaya: 0.1,
  camphor: 0.3,
  banyan: 0.75,
  bishop: 0.32,
  board: 0.24,
  termin: 0.15,
  palm: 0.3,
  pruned: 0.2,
  shrub: 0,
  grate: 0,
  bench: 0,
  plamp: 0.07,
};

/** street-tree mix seen along 萬華 roads (欒樹 / 樟樹 / 茄苳 / 黑板樹 / 小葉欖仁, some hacked back) */
export function streetKind(r: () => number): Kind {
  const v = r();
  return v < 0.12
    ? 'pruned'
    : v < 0.3
      ? r() < 0.5
        ? 'luanY'
        : r() < 0.5
          ? 'flame'
          : 'luan'
      : v < 0.48
        ? 'camphor'
        : v < 0.63
          ? 'bishop'
          : v < 0.8
            ? 'termin'
            : 'board';
}
/** park mix (青年公園 / 華江 / 艋舺公園 feel): big 榕樹, 樟樹, 大王椰子 rows, 茄苳, 欒樹 */
export function parkKind(r: () => number): Kind {
  const v = r();
  return v < 0.22
    ? 'banyan'
    : v < 0.42
      ? 'camphor'
      : v < 0.54
        ? 'palm'
        : v < 0.68
          ? 'bishop'
          : v < 0.82
            ? r() < 0.6
              ? 'luanY'
              : 'luan'
            : v < 0.91
              ? 'termin'
              : 'board';
}

/** Collects instances, then builds one InstancedMesh per kind. */
export class Forest {
  items = new Map<Kind, THREE.Matrix4[]>();
  tints = new Map<Kind, number[]>();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  add(k: Kind, x: number, z: number, rot: number, s = 1, lean = 0, tint = 1, y = 0) {
    this.e.set(lean, rot, lean * 0.5);
    this.q.setFromEuler(this.e);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(s, s, s));
    (this.items.get(k) || this.items.set(k, []).get(k)!).push(m);
    (this.tints.get(k) || this.tints.set(k, []).get(k)!).push(tint);
  }
  /** a street tree: kind + iron grate, sometimes leaning (decay). Returns the trunk radius for a blocker. */
  street(x: number, z: number, r: () => number, ang = 0, grate = true) {
    const k = streetKind(r);
    if (grate) this.add('grate', x, z, ang, 1, 0, 1);
    this.add(k, x, z, r() * 6.28, 0.8 + r() * 0.35, r() < 0.12 ? 0.08 + r() * 0.08 : 0, 0.85 + r() * 0.25);
    return TRUNK_R[k];
  }
  park(x: number, z: number, r: () => number) {
    const k = parkKind(r);
    this.add(k, x, z, r() * 6.28, k === 'banyan' ? 1 + r() * 0.5 : 0.85 + r() * 0.35, 0, 0.85 + r() * 0.25);
    return { k, r: TRUNK_R[k] * (k === 'banyan' ? 1.2 : 1) };
  }
  build(par: THREE.Object3D, shadow = true) {
    const out: THREE.InstancedMesh[] = [];
    const col = new THREE.Color();
    for (const [k, ms] of this.items) {
      if (!ms.length) continue;
      const im = new THREE.InstancedMesh(geo(k), TREE_MAT, ms.length);
      ms.forEach((m, i) => im.setMatrixAt(i, m));
      this.tints.get(k)!.forEach((t, i) => im.setColorAt(i, col.setScalar(t)));
      im.castShadow = shadow && k !== 'grate';
      im.receiveShadow = true;
      im.computeBoundingSphere();
      par.add(im);
      out.push(im);
    }
    return out;
  }
}
