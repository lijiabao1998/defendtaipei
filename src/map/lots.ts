// v24.25 what grows on the empty land. Between Wanhua's buildings the ground was one sheet of concrete; a city lot in Taiwan is
// rarely that tidy. Someone's grandmother has a vegetable plot on it, with bamboo frames, blue buckets and a chair to sit
// on; or it is shut behind faded corrugated iron and gone to weeds, banana and papaya, with what people dumped there; or it
// is a pay car park with a booth; or a corner under an old tree with a little earth god's shrine. Each patch of open ground
// gets one of these, deterministically from where it is (its own hash: the world RNG is untouched). All of a tile's lots are
// one merged, vertex-coloured mesh, so a tile pays one draw call for them however many there are.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { treeGeometry } from './trees';

type V2 = [number, number];
type G = THREE.BufferGeometry;
export type LotRoad = { p: V2[]; w: number };
export type LotOpts = {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** a building or anything else that has this ground already */
  taken: (x: number, z: number) => boolean;
  roads: LotRoad[];
  seed: number;
  /** no more than this many triangles */
  maxTris?: number;
};
export type LotKind = 'veg' | 'weeds' | 'park' | 'corner' | 'slab';
export type LotResult = {
  geo: G | null;
  segs: { a: V2; b: V2; low?: boolean }[];
  stats: Record<LotKind, number> & { cells: number; tris: number };
  /** the middle of each patch, by kind */
  stops: { kind: LotKind; x: number; z: number }[];
};

const S = 4;
const MAX_PATCH = 30;
const hash = (a: number, b: number, c = 0) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};
const cc = new THREE.Color();
/** position, normal and a colour per vertex, nothing else, so that everything merges */
function paint(g: G, c: number, jit = 0, seed = 0) {
  const s = (g.index ? g.toNonIndexed() : g) as G;
  for (const k of Object.keys(s.attributes)) if (k !== 'position' && k !== 'normal') s.deleteAttribute(k);
  const n = s.getAttribute('position').count,
    a = new Float32Array(n * 3);
  cc.setHex(c);
  for (let i = 0; i < n; i += 3) {
    const f = jit ? 1 + (hash(i, seed, 3) - 0.5) * jit : 1;
    for (let k = 0; k < 3; k++) a.set([cc.r * f, cc.g * f, cc.b * f], (i + k) * 3);
  }
  s.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return s;
}
const box = (w: number, h: number, l: number, x: number, y: number, z: number, c: number, ry = 0) =>
  paint(new THREE.BoxGeometry(w, h, l).rotateY(ry).translate(x, y, z), c);
const cyl = (r: number, h: number, x: number, y: number, z: number, c: number, seg = 7) =>
  paint(new THREE.CylinderGeometry(r, r * 0.9, h, seg, 1, false).translate(x, y, z), c);
const quad = (x: number, y: number, z: number, w: number, l: number, c: number, seed = 0, jit = 0.14) =>
  paint(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2).translate(x, y, z), c, jit, seed);

const DIRT = [0x6d5a42, 0x62523c, 0x75624a, 0x5c4c38];
const WEED = [0x5c6b3a, 0x66733f, 0x72754a, 0x4f5f34, 0x7d7a50];
const GRAVEL = [0x55534f, 0x5e5b56, 0x4e4c49];
const IRON = [0x6f8187, 0x8a9a98, 0x9a8c74, 0xa2705a, 0x7a8f7c, 0xb0a890];
const CROPS = [0x8fb56a, 0x4f8a3c, 0x3f7a35, 0x6fa24a, 0xa8c47a, 0x58933f];

/** a plant from trees.ts, put down here */
function tree(k: Parameters<typeof treeGeometry>[0], x: number, z: number, ry: number, s: number) {
  return treeGeometry(k).clone().scale(s, s, s).rotateY(ry).translate(x, 0, z);
}

export function dressLots(o: LotOpts): LotResult {
  const out: G[] = [];
  const segs: LotResult['segs'] = [];
  const stats: LotResult['stats'] = { veg: 0, weeds: 0, park: 0, corner: 0, slab: 0, cells: 0, tris: 0 };
  const stops: LotResult['stops'] = [];
  const maxTris = o.maxTris ?? 9000;
  const key = (i: number, j: number) => (i + 8192) * 16384 + (j + 8192);
  const i0 = Math.floor(o.x0 / S),
    i1 = Math.floor(o.x1 / S),
    j0 = Math.floor(o.z0 / S),
    j1 = Math.floor(o.z1 / S);
  // the roads, and the pavement along them, stay as they are
  const road = new Set<number>();
  for (const r of o.roads) {
    const m = Math.ceil((r.w / 2 + 3.5) / S);
    const R2 = (r.w / 2 + 3.5) ** 2;
    for (let n = 0; n < r.p.length - 1; n++) {
      const [ax, az] = r.p[n],
        [bx, bz] = r.p[n + 1];
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= L; t += 2) {
        const x = ax + ((bx - ax) * t) / (L || 1),
          z = az + ((bz - az) * t) / (L || 1);
        if (x < o.x0 - 12 || x > o.x1 + 12 || z < o.z0 - 12 || z > o.z1 + 12) continue;
        const ci = Math.floor(x / S),
          cj = Math.floor(z / S);
        for (let i = ci - m; i <= ci + m; i++)
          for (let j = cj - m; j <= cj + m; j++)
            if (((i + 0.5) * S - x) ** 2 + ((j + 0.5) * S - z) ** 2 < R2) road.add(key(i, j));
      }
    }
  }
  // what is open: nothing on it or within a couple of metres of it
  const open = new Map<number, V2>();
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) {
      if (road.has(key(i, j))) continue;
      const x = (i + 0.5) * S,
        z = (j + 0.5) * S;
      if (x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1) continue;
      let ok = !o.taken(x, z);
      for (const [dx, dz] of [
        [2.4, 2.4],
        [-2.4, 2.4],
        [2.4, -2.4],
        [-2.4, -2.4],
      ])
        if (ok && o.taken(x + dx, z + dz)) ok = false;
      if (ok) open.set(key(i, j), [i, j]);
    }
  // patches: a big open area is several parcels, not one
  const seen = new Set<number>();
  const patches: V2[][] = [];
  for (const [k0, c0] of open) {
    if (seen.has(k0)) continue;
    const q: V2[] = [c0],
      cl: V2[] = [];
    seen.add(k0);
    while (q.length && cl.length < MAX_PATCH) {
      const [i, j] = q.shift()!;
      cl.push([i, j]);
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = key(i + di, j + dj);
        if (open.has(n) && !seen.has(n)) {
          seen.add(n);
          q.push([i + di, j + dj]);
        }
      }
    }
    // what was queued but not taken goes back to be the next patch
    for (const [i, j] of q) seen.delete(key(i, j));
    if (cl.length >= 6) patches.push(cl);
  }
  let tris = 0;
  let last: LotKind | null = null;
  const count = (g: G) => (tris += g.getAttribute('position').count / 3);
  const add = (...gs: G[]) => {
    for (const g of gs) {
      count(g);
      out.push(g);
    }
  };
  for (const cl of patches) {
    if (tris > maxTris) break;
    const [fi, fj] = cl[0];
    const h = hash(fi, fj, o.seed);
    const big = cl.length >= 16;
    const pick = (v: number): LotKind =>
      big
        ? v < 0.2
          ? 'veg'
          : v < 0.46
            ? 'weeds'
            : v < 0.62
              ? 'park'
              : v < 0.74
                ? 'corner'
                : 'slab'
        : v < 0.3
          ? 'veg'
          : v < 0.58
            ? 'weeds'
            : v < 0.74
              ? 'corner'
              : 'slab';
    // patches come out next to each other in this order: no two neighbours alike
    let kind = pick(h);
    for (let n = 1; n < 6 && kind === last; n++) kind = pick(hash(fi, fj, o.seed + n));
    last = kind;
    stats[kind]++;
    stats.cells += cl.length;
    {
      const [mi, mj] = cl[Math.floor(cl.length / 2)];
      stops.push({ kind, x: (mi + 0.5) * S, z: (mj + 0.5) * S });
    }
    const inPatch = new Set(cl.map(([i, j]) => key(i, j)));
    const dressers = { veg: veg, weeds: weeds, park: carPark, corner: corner, slab: slab };
    if (kind !== 'slab') ground(cl, inPatch, kind, add);
    if (kind === 'weeds') fence(cl, inPatch, o.taken, add, segs);
    dressers[kind](cl, h, add, segs);
  }
  stats.tris = Math.round(tris);
  return { geo: out.length ? mergeGeometries(out) : null, segs, stats, stops };
}

/** a rounded clump of weeds */
function clump(x: number, z: number, r: number, seed: number) {
  const c = WEED[Math.floor(hash(seed, 3, 7) * WEED.length)];
  return paint(
    new THREE.IcosahedronGeometry(r, 0)
      .scale(1, 0.62, 1)
      .rotateY(seed)
      .translate(x, r * 0.42, z),
    c,
    0.26,
    seed,
  );
}
/** a few thin stems with pale tips */
function reeds(x: number, z: number, seed: number) {
  const out: G[] = [];
  for (let k = 0; k < 3; k++) {
    const a = hash(seed, k, 2) * 6.28,
      r = 0.12 + hash(seed, k, 3) * 0.3,
      h = 1 + hash(seed, k, 4) * 0.7;
    out.push(
      paint(
        new THREE.ConeGeometry(0.11, h, 3, 1, true).translate(x + Math.cos(a) * r, h / 2, z + Math.sin(a) * r),
        k ? 0x8f9a5a : 0xb0a878,
        0.2,
        seed + k,
      ),
    );
  }
  return out;
}
type Add = (...g: G[]) => void;
type Segs = LotResult['segs'];
const cx = (i: number) => (i + 0.5) * S;

/** smooth noise: the colour of a patch wanders instead of going in squares */
function vnoise(x: number, z: number) {
  const X = Math.floor(x),
    Z = Math.floor(z);
  const u = x - X,
    v = z - Z;
  const su = u * u * (3 - 2 * u),
    sv = v * v * (3 - 2 * v);
  const h = (a: number, b: number) => hash(a, b, 17);
  return (h(X, Z) * (1 - su) + h(X + 1, Z) * su) * (1 - sv) + (h(X, Z + 1) * (1 - su) + h(X + 1, Z + 1) * su) * sv;
}
const CONCRETE = new THREE.Color(0x8d8c86);
/** the ground itself: one sheet of shared-colour corners, fading out into the concrete at the edge of the patch */
function ground(cl: V2[], inPatch: Set<number>, kind: LotKind, add: Add) {
  const pal = (kind === 'veg' ? DIRT : kind === 'park' ? GRAVEL : WEED).map(c => new THREE.Color(c));
  const key = (i: number, j: number) => (i + 8192) * 16384 + (j + 8192);
  const inside = (x: number, z: number) => {
    for (const dx of [-0.4, 0.4])
      for (const dz of [-0.4, 0.4])
        if (!inPatch.has(key(Math.floor((x + dx) / S), Math.floor((z + dz) / S)))) return false;
    return true;
  };
  const tmp = new THREE.Color();
  const colorAt = (x: number, z: number, out: number[]) => {
    const n = vnoise(x / 6, z / 6) * (pal.length - 1);
    const a = Math.floor(n);
    tmp.copy(pal[a]).lerp(pal[Math.min(pal.length - 1, a + 1)], n - a);
    tmp.multiplyScalar(0.92 + 0.16 * vnoise(x / 1.7, z / 1.7));
    if (!inside(x, z)) tmp.lerp(CONCRETE, 0.8);
    out.push(tmp.r, tmp.g, tmp.b);
  };
  const pos: number[] = [],
    nor: number[] = [],
    col: number[] = [];
  const H = S / 2;
  for (const [i, j] of cl)
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++) {
        const x0 = i * S + a * H,
          z0 = j * S + b * H,
          x1 = x0 + H,
          z1 = z0 + H;
        for (const [x, z] of [
          [x0, z0],
          [x0, z1],
          [x1, z0],
          [x1, z0],
          [x0, z1],
          [x1, z1],
        ]) {
          pos.push(x, 0.03, z);
          nor.push(0, 1, 0);
          colorAt(x, z, col);
        }
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  add(g);
}

/** 菜圃: raised rows of whatever is in season, a bamboo frame, buckets, and somewhere to sit */
function veg(cl: V2[], h: number, add: Add, segs: Segs) {
  const alongX = (h * 7) % 1 < 0.5;
  const crops = [
    CROPS[Math.floor(h * 13) % CROPS.length],
    CROPS[Math.floor(h * 29) % CROPS.length],
    CROPS[Math.floor(h * 41) % CROPS.length],
  ];
  let props = 0;
  cl.forEach(([i, j], n) => {
    const x = cx(i),
      z = cx(j);
    const r = hash(i, j, 21);
    // now and then a working corner instead of rows
    if (props < 3 && r > 0.82 && cl.length > 6) {
      props++;
      if (props === 1) {
        // the frame for gourds and beans
        for (const a of [-1.5, 1.5])
          for (const b of [-1.5, 1.5]) add(box(0.07, 1.9, 0.07, x + a, 0.95, z + b, 0x8a7a50));
        for (const a of [-1.5, 0, 1.5]) add(box(3.2, 0.05, 0.05, x, 1.9, z + a, 0x8a7a50));
        for (let k = 0; k < 6; k++) add(box(2.9, 0.09, 0.42, x, 1.95, z - 1.3 + k * 0.52, k % 2 ? 0x4f8a3c : 0x5f9a48));
        for (let k = 0; k < 3; k++) add(box(0.1, 1.6, 0.1, x - 1 + k, 1, z + 1.5, 0x4f8a3c));
      } else if (props === 2) {
        // blue buckets, a stack of white foam boxes, a red chair
        add(cyl(0.25, 0.45, x - 1, 0.25, z - 1, 0x2f62a8), cyl(0.25, 0.45, x - 0.4, 0.25, z - 1.2, 0x2f62a8));
        add(cyl(0.42, 0.9, x + 1.1, 0.48, z - 1.1, 0x26282a));
        for (let k = 0; k < 3; k++) add(box(0.7, 0.28, 0.5, x - 1, 0.17 + k * 0.29, z + 0.8, 0xe8e6de));
        add(
          box(0.42, 0.05, 0.42, x + 0.9, 0.42, z + 0.9, 0xc0342a),
          box(0.42, 0.4, 0.05, x + 0.9, 0.64, z + 1.1, 0xc0342a),
        );
        for (const a of [-0.17, 0.17])
          for (const b of [-0.17, 0.17]) add(box(0.04, 0.42, 0.04, x + 0.9 + a, 0.21, z + 0.9 + b, 0xc0342a));
      } else {
        // a black shade net on poles, a blue tarp over a heap
        for (const a of [-1.6, 1.6])
          for (const b of [-1.6, 1.6]) add(box(0.06, 1.7, 0.06, x + a, 0.85, z + b, 0x777066));
        add(box(3.4, 0.03, 3.4, x, 1.7, z, 0x1e1f20));
        add(box(1.6, 0.5, 1.2, x, 0.27, z, 0x2a64b4));
      }
      return;
    }
    if (n % 5 === 4 && r < 0.3) return; // a fallow bit
    for (let k = -1; k <= 1; k++) {
      const off = k * 1.3;
      const rx = alongX ? x : x + off,
        rz = alongX ? z + off : z;
      const ry = alongX ? Math.PI / 2 : 0;
      // a row of greens, a little uneven; a row in another shade now and then
      const c = crops[Math.abs(i + j + k + 3) % crops.length];
      const top = 0.2 + hash(i, j, k + 5) * 0.14;
      add(box(0.74, top, S * 0.98, rx, top / 2 + 0.03, rz, c, ry));
    }
  });
  void segs;
}

/** 鐵皮圍籬: corrugated panels of no particular colour along the open sides, with gaps people have made */
function fence(cl: V2[], inPatch: Set<number>, taken: LotOpts['taken'], add: Add, segs: Segs) {
  const key = (i: number, j: number) => (i + 8192) * 16384 + (j + 8192);
  for (const [i, j] of cl) {
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (inPatch.has(key(i + di, j + dj))) continue;
      // next to a building there may be a door: leave those sides alone, only a road side or another parcel gets a fence
      if (taken(cx(i + di), cx(j + dj))) continue;
      if (hash(i * 3 + di, j * 3 + dj, 5) < 0.22) continue; // a gap
      const x = cx(i) + di * (S / 2 - 0.1),
        z = cx(j) + dj * (S / 2 - 0.1);
      const along = dj !== 0;
      const col = IRON[Math.floor(hash(i, j, di + dj * 3) * IRON.length)];
      for (let k = -1; k <= 1; k++) {
        const c = k === 0 ? col : (cc.setHex(col).multiplyScalar(k > 0 ? 0.86 : 0.93), cc.getHex());
        const w = S / 3;
        const px = along ? x + k * w : x,
          pz = along ? z : z + k * w;
        add(box(along ? w : 0.05, 2 + (k === 0 ? 0 : 0.05 * k), along ? 0.05 : w, px, 1.0, pz, c));
      }
      const a: V2 = along ? [x - S / 2, z] : [x, z - S / 2],
        b: V2 = along ? [x + S / 2, z] : [x, z + S / 2];
      segs.push({ a, b });
    }
  }
}
/** 荒地: weeds in clumps, banana and papaya that nobody planted on purpose, and what was dumped here */
function weeds(cl: V2[], h: number, add: Add, segs: Segs) {
  let trees = 0,
    junk = 0;
  for (const [i, j] of cl) {
    const x = cx(i),
      z = cx(j);
    for (let k = 0; k < 3; k++) {
      const a = hash(i, j, k * 2 + 1) * S - S / 2,
        b = hash(i, j, k * 2 + 2) * S - S / 2;
      add(clump(x + a, z + b, 0.4 + hash(j, i, k) * 0.5, i * 7 + j + k));
    }
    // reeds, the pale kind that takes over any lot left alone
    if (hash(i, j, 12) < 0.4) add(...reeds(x + hash(i, j, 13) * 2 - 1, z + hash(i, j, 14) * 2 - 1, i + j));
    const r = hash(i, j, 41);
    if (r > 0.76 && trees < 5) {
      trees++;
      const kind = hash(i, j, 42) < 0.62 ? 'banana' : 'papaya';
      add(tree(kind, x, z, r * 40, 0.8 + hash(j, i, 43) * 0.45));
      segs.push({ a: [x - 0.25, z], b: [x + 0.25, z] }, { a: [x, z - 0.25], b: [x, z + 0.25] });
    } else if (r < 0.1 && junk < 3) {
      junk++;
      const t = junk % 3;
      if (t === 1) {
        // an old mattress and a chair on its side
        add(box(1.9, 0.2, 1.3, x - 0.4, 0.14, z, 0xa89a84, 0.5));
        add(box(0.5, 0.5, 0.06, x + 1, 0.3, z + 0.7, 0x7a5a3a, 1.2));
      } else if (t === 2) {
        // tyres
        add(paint(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 9).translate(x, 0.12, z), 0x171717));
        add(paint(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 9).translate(x + 0.1, 0.32, z - 0.05), 0x1c1c1c));
        add(paint(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 9).translate(x + 0.75, 0.12, z + 0.3), 0x171717));
      } else {
        // bags of rubbish and a broken crate
        add(paint(new THREE.IcosahedronGeometry(0.42, 0).translate(x, 0.34, z), 0x25272a, 0.2, i));
        add(paint(new THREE.IcosahedronGeometry(0.34, 0).translate(x + 0.6, 0.28, z + 0.2), 0x30343a, 0.2, j));
        add(box(0.7, 0.45, 0.6, x - 0.6, 0.24, z + 0.4, 0x8c6f48, 0.4));
      }
    }
  }
  void h;
}

/** 收費停車場: gravel and white lines, a booth, a yellow board, and a car or two that never left */
function carPark(cl: V2[], h: number, add: Add, segs: Segs) {
  let booth = false;
  const alongX = (h * 11) % 1 < 0.5;
  for (const [i, j] of cl) {
    const x = cx(i),
      z = cx(j);
    if (!booth) {
      booth = true;
      add(box(1.7, 2.1, 1.7, x, 1.06, z, 0xd8d4c8));
      add(box(1.15, 0.8, 0.04, x, 1.4, z + 0.87, 0x23303a));
      add(box(2.1, 0.1, 2.1, x, 2.16, z, 0x4a6a78));
      // a blue P on a yellow board
      add(box(0.06, 2.8, 0.06, x + 1.3, 1.4, z + 1, 0x555555));
      add(box(1.1, 1.1, 0.05, x + 1.3, 2.7, z + 1, 0xe0b81c));
      add(box(0.16, 0.8, 0.03, x + 1.08, 2.7, z + 1.04, 0x1c4a9a));
      add(box(0.48, 0.14, 0.03, x + 1.28, 3.02, z + 1.04, 0x1c4a9a));
      add(box(0.48, 0.14, 0.03, x + 1.28, 2.68, z + 1.04, 0x1c4a9a));
      add(box(0.14, 0.34, 0.03, x + 1.48, 2.85, z + 1.04, 0x1c4a9a));
      for (const [a, b] of [
        [0.85, 0],
        [0, 0.85],
      ])
        segs.push({ a: [x - a, z - b], b: [x + a, z + b] });
      continue;
    }
    // stall lines
    for (const k of [-1.25, 1.25])
      add(
        alongX
          ? quad(x + k, 0.05, z, 0.1, S * 0.82, 0xdedcd2, 0, 0)
          : quad(x, 0.05, z + k, S * 0.82, 0.1, 0xdedcd2, 0, 0),
      );
    if (hash(i, j, 61) < 0.26) {
      // parked and forgotten, grey with dust
      const c = [0x8a8a86, 0x6e7478, 0x9a8f7c, 0x5a6066][Math.floor(hash(i, j, 62) * 4)];
      const ry = alongX ? 0 : Math.PI / 2;
      add(box(1.7, 0.62, 4.1, x, 0.58, z, c, ry));
      add(box(1.5, 0.5, 2.1, x, 1.12, z - (alongX ? 0.2 : 0), 0x2a3036, ry));
      const R = 1.4;
      segs.push(alongX ? { a: [x, z - R], b: [x, z + R], low: true } : { a: [x - R, z], b: [x + R, z], low: true });
    }
  }
}

/** what is left of a house that came down: the old slab, weeds in the cracks, a scooter somebody still parks here */
function slab(cl: V2[], h: number, add: Add, segs: Segs) {
  let bike = false;
  for (const [i, j] of cl) {
    const x = cx(i),
      z = cx(j);
    const r = hash(i, j, 71);
    if (r < 0.34)
      add(clump(x + hash(i, j, 72) * 3 - 1.5, z + hash(i, j, 73) * 3 - 1.5, 0.25 + hash(i, j, 74) * 0.3, i * 9 + j));
    if (r > 0.92) add(...reeds(x, z, i + j * 3));
    if (!bike && r > 0.8 && r < 0.86) {
      bike = true;
      const c = [0xc03a2a, 0x2f62a8, 0xd8d4c8, 0x3a3a3a][Math.floor(h * 4)];
      add(box(0.32, 0.45, 1.25, x, 0.5, z, c, 0.6), box(0.3, 0.22, 0.55, x - 0.1, 0.82, z - 0.15, 0x1c1c1c, 0.6));
      add(cyl(0.2, 0.1, x + 0.32, 0.2, z + 0.42, 0x141414, 8), cyl(0.2, 0.1, x - 0.32, 0.2, z - 0.42, 0x141414, 8));
    }
  }
  void segs;
}

/** 土地公: an old tree in the corner of the lot, a little red shrine under it, a bench where people used to sit */
function corner(cl: V2[], h: number, add: Add, segs: Segs) {
  const n = Math.floor(cl.length / 2);
  const [i, j] = cl[n];
  const x = cx(i),
    z = cx(j);
  add(tree(h < 0.5 ? 'banyan' : 'camphor', x, z, h * 40, 1 + h * 0.4));
  segs.push({ a: [x - 0.7, z], b: [x + 0.7, z] }, { a: [x, z - 0.7], b: [x, z + 0.7] });
  const sx = x + 2.4,
    sz = z + 1.6;
  add(box(1.3, 0.55, 1.1, sx, 0.28, sz, 0xb8b0a0));
  add(box(1.05, 1.05, 0.85, sx, 1.08, sz, 0xc8341e));
  add(box(0.55, 0.55, 0.04, sx, 1, sz + 0.44, 0x2a1a10));
  add(paint(new THREE.ConeGeometry(0.98, 0.5, 4).rotateY(Math.PI / 4).translate(sx, 1.85, sz), 0xd8a030));
  add(box(0.5, 0.1, 0.18, sx, 0.62, sz + 0.68, 0xd8a030)); // the incense burner's shelf
  segs.push({ a: [sx - 0.65, sz], b: [sx + 0.65, sz], low: true });
  // the bench, and a couple of stools
  add(box(1.6, 0.06, 0.45, x - 2, 0.45, z + 1.4, 0x8a6a3a));
  for (const a of [-0.7, 0.7]) add(box(0.06, 0.45, 0.4, x - 2 + a, 0.22, z + 1.4, 0x333333));
  add(cyl(0.17, 0.42, x - 1, 0.21, z - 1.8, 0xc0342a), cyl(0.17, 0.42, x - 1.7, 0.21, z - 1.5, 0x2f62a8));
  // the rest of it is overgrown
  for (const [a, b] of cl) {
    if (a === i && b === j) continue;
    if (hash(a, b, 88) < 0.5)
      add(clump(cx(a) + hash(a, b, 89) * 2 - 1, cx(b) + hash(b, a, 90) * 2 - 1, 0.4 + hash(b, a, 91) * 0.4, a * 5 + b));
  }
}

/** on a phone the lots are drawn once, without a pass in the shadow map */
export const LOT_SHADOW = !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
export const lotMaterial = () => {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  });
  return m;
};
