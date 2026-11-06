// v24.14 奪回 — what occupation and liberation look like on the street. While a core district is occupied its walls and
// streets carry the occupier's red curfew banners (all invented). When it is reclaimed they come down, ROC flags wave
// from the windows and roofs, and the neighbours stand in the street among red firecracker paper. Each state is one or
// two merged, unshadowed meshes per district, so a district in view costs at most two draw calls. Geometry uses its own
// RNG: nothing else in the world moves because of this. Boot only builds the banners and plans the rest; a district's
// flags and neighbours are built the first time it is reclaimed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V2 = [number, number];
export type ReclaimBld = { c: V2; pts: V2[]; h: number; fill?: unknown };
export type ReclaimRoad = { p: V2[]; t: string };
export type ReclaimDeps = {
  scene: THREE.Scene;
  blds: ReclaimBld[];
  roads: ReclaimRoad[];
  roadW: Record<string, number>;
  bldAt: (x: number, z: number) => unknown;
  /** indoors anywhere on the map, streamed district buildings included (where a crowd must not stand) */
  blocked: (x: number, z: number) => boolean;
  pip: (p: V2, pts: V2[]) => boolean;
  groundY: (x: number, z: number) => number;
  sectorOf: (x: number, z: number) => number;
  nSec: number;
  flagTex: THREE.Texture;
};
const ORDERS_V = ['宵禁後禁止外出', '服從管制維護秩序', '舉報可疑人員', '軍事管制區'];
const ORDERS_H = ['軍事管制區　禁止聚集', '二十時起全面宵禁', '交出武器　既往不咎', '違者依戰時法令處置'];
const SHIRT = [0x3a4f7a, 0xc9c4b4, 0x7a2f2a, 0x4a6a4a, 0xd8d2c0, 0x2f2f33, 0x8a6a3a, 0x9a4a6a, 0x5f7f92];
const LEGS = [0x23262e, 0x3a3f4a, 0x4a4238, 0x2c3a4a];
const SKIN = [0xd9b08c, 0xc99a74, 0xe2bd9c];
const PAPER = [0xc8141a, 0xe0241f, 0xa80f14, 0xe8b818];

function ordersAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const c = cv.getContext('2d')!;
  const cloth = (x: number, y: number, w: number, h: number) => {
    c.fillStyle = '#b3120f';
    c.fillRect(x, y, w, h);
    for (let i = 0; i < 60; i++) {
      c.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`;
      c.fillRect(x + Math.random() * w, y + Math.random() * h, 2 + Math.random() * 30, 1 + Math.random() * 3);
    }
  };
  ORDERS_V.forEach((t, i) => {
    const x = i * 128;
    cloth(x, 0, 128, 512);
    const ch = [...t];
    const fs = Math.min(84, 480 / ch.length);
    c.fillStyle = '#ffe94a';
    c.font = `bold ${fs}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    ch.forEach((s, k) => c.fillText(s, x + 64, 256 + (k - (ch.length - 1) / 2) * fs * 1.02));
  });
  ORDERS_H.forEach((t, i) => {
    const y = i * 128;
    cloth(512, y, 512, 128);
    c.fillStyle = '#ffffff';
    c.font = 'bold 56px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(t, 768, y + 64, 480);
  });
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}
const setUV = (g: THREE.BufferGeometry, u0: number, v0: number, du: number, dv: number) => {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
  return g;
};
const cellV = (i: number): [number, number, number, number] => [(i * 128) / 1024, 0, 128 / 1024, 1];
const cellH = (i: number): [number, number, number, number] => [0.5, 1 - (i + 1) / 4, 0.5, 1 / 4];
const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
  g.rotateZ(rz);
  g.rotateX(rx);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
};
const tint = (g: THREE.BufferGeometry, hex: number) => {
  const col = new THREE.Color(hex);
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) ((a[i * 3] = col.r), (a[i * 3 + 1] = col.g), (a[i * 3 + 2] = col.b));
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
/** building centre: fades with that building's walls (occlusion.ts) */
const tagB = (g: THREE.BufferGeometry, q: V2) => {
  const n = g.attributes.position.count,
    a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) ((a[i * 2] = q[0]), (a[i * 2 + 1] = q[1]));
  g.setAttribute('aBld', new THREE.BufferAttribute(a, 2));
  return g;
};
/** sway: seed, sideways amplitude, vertical amplitude, per vertex (occlusion.ts) */
const swayOf = (g: THREE.BufferGeometry, f: (x: number, y: number, z: number) => [number, number, number]) => {
  const p = g.attributes.position as THREE.BufferAttribute,
    a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) a.set(f(p.getX(i), p.getY(i), p.getZ(i)), i * 3);
  g.setAttribute('aSway', new THREE.BufferAttribute(a, 3));
  return g;
};
const merged = (L: THREE.BufferGeometry[], keep: string[]) => {
  const out = L.map(g => {
    const q = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(q.attributes)) if (!keep.includes(k)) q.deleteAttribute(k);
    return q;
  });
  return mergeGeometries(out);
};

type Sec = {
  occ: THREE.Mesh | null;
  free: THREE.Group | null;
  spot: V2 | null;
  wall: V2 | null;
  gathered?: boolean;
  /** builds the flags and the crowd; emptied once it has run */
  later: (() => void)[];
  flags: THREE.BufferGeometry[];
  crowd: THREE.BufferGeometry[];
};
export class Reclaim {
  readonly stats = { banners: 0, crossings: 0, flags: 0, people: 0, ms: 0, freeMs: 0 };
  private secs: Sec[] = [];
  private flagMat!: THREE.Material;
  private crowdMat!: THREE.Material;
  private known = new Set<number>();
  constructor(private D: ReclaimDeps) {
    const t0 = performance.now();
    this.build();
    this.stats.ms = Math.round(performance.now() - t0);
  }
  /** a street spot in district i with neighbours on it (null when the district is outside the core map) */
  spot(i: number) {
    return this.secs[i]?.spot ?? null;
  }
  /** in front of a wall with flags on it in district i */
  wall(i: number) {
    return this.secs[i]?.wall ?? null;
  }
  visible(i: number) {
    const s = this.secs[i];
    return { occ: !!s?.occ?.visible, free: !!s?.free?.visible };
  }
  /** match the street to the reclaimed set; returns the districts reclaimed since the last call */
  sync(reclaimed: Set<number>) {
    const fresh: number[] = [];
    for (let i = 0; i < this.D.nSec; i++) {
      const on = reclaimed.has(i);
      if (on && !this.known.has(i)) {
        this.known.add(i);
        fresh.push(i);
      }
      if (on) this.ensure(i);
      const s = this.secs[i];
      if (s?.occ) s.occ.visible = !on;
      if (s?.free) s.free.visible = on;
    }
    return fresh;
  }
  /** the crowd that comes out around the player the moment district i falls, wherever on the map that is */
  gather(i: number, x: number, z: number) {
    const s = this.secs[i];
    if (!s || s.gathered) return;
    s.gathered = true;
    let rs = (0x51ab + i * 7919) >>> 0;
    const r = () => (rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296;
    const out: THREE.BufferGeometry[] = [];
    for (let k = 0, placed = 0; k < 90 && placed < 16; k++) {
      const a = r() * 6.283,
        d = 5 + r() * 20;
      const qx = x + Math.cos(a) * d,
        qz = z + Math.sin(a) * d;
      if (this.D.blocked(qx, qz)) continue;
      this.group(out, qx, qz, 2 + Math.floor(r() * 3), 1.6, 6, 22, r);
      placed++;
    }
    if (!out.length) return;
    const me = new THREE.Mesh(merged(out, ['position', 'normal', 'color', 'aSway']), this.crowdMat);
    me.castShadow = false;
    me.receiveShadow = true;
    me.userData.noChunk = true;
    if (!s.free) {
      s.free = new THREE.Group();
      this.D.scene.add(s.free);
    }
    s.free.add(me);
  }
  /** a knot of people and the firecracker paper at their feet */
  private group(
    out: THREE.BufferGeometry[],
    x0: number,
    z0: number,
    n: number,
    spread: number,
    paper: number,
    nPaper: number,
    rr: () => number,
  ) {
    const D = this.D;
    for (let k = 0; k < n; k++) this.person(out, x0 + (rr() - 0.5) * spread, z0 + (rr() - 0.5) * spread, rr);
    for (let k = 0; k < nPaper; k++) {
      const qx = x0 + (rr() - 0.5) * paper,
        qz = z0 + (rr() - 0.5) * paper;
      if (D.blocked(qx, qz)) continue;
      const sz = 0.05 + rr() * 0.09;
      out.push(
        swayOf(
          tint(
            place(new THREE.PlaneGeometry(sz, sz * 1.5), qx, D.groundY(qx, qz) + 0.03, qz, rr() * 6.28, -Math.PI / 2),
            PAPER[Math.floor(rr() * PAPER.length)],
          ),
          () => [0, 0, 0],
        ),
      );
    }
  }
  /** the first time district i is reclaimed: build its flags and its neighbours */
  private ensure(i: number) {
    const s = this.secs[i];
    if (!s || s.free || !s.later.length) return;
    const t0 = performance.now();
    for (const f of s.later) f();
    s.later = [];
    const mk = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const me = new THREE.Mesh(g, m);
      me.castShadow = false;
      me.receiveShadow = true;
      me.userData.noChunk = true;
      return me;
    };
    s.free = new THREE.Group();
    if (s.flags.length) s.free.add(mk(merged(s.flags, ['position', 'normal', 'uv', 'aBld', 'aSway']), this.flagMat));
    if (s.crowd.length) s.free.add(mk(merged(s.crowd, ['position', 'normal', 'color', 'aSway']), this.crowdMat));
    s.flags = [];
    s.crowd = [];
    this.D.scene.add(s.free);
    this.stats.freeMs = Math.round(performance.now() - t0);
  }
  private build() {
    const D = this.D;
    let rs = 0x7e11a;
    const r = () => (rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296;
    let rl = 0x2c0de;
    const rlater = () => (rl = (Math.imul(rl, 1664525) + 1013904223) >>> 0) / 4294967296;
    const banner: THREE.BufferGeometry[][] = [];
    const later: (() => void)[][] = [],
      flags: THREE.BufferGeometry[][] = [],
      crowd: THREE.BufferGeometry[][] = [],
      nFlags: number[] = [],
      sites: [number, number, number][][] = [];
    const spots: (V2 | null)[] = [],
      walls: (V2 | null)[] = [];
    for (let i = 0; i < D.nSec; i++) {
      banner.push([]);
      later.push([]);
      flags.push([]);
      crowd.push([]);
      nFlags.push(0);
      sites.push([]);
      spots.push(null);
      walls.push(null);
    }
    // ---- walls: vertical order banners while occupied, window flags once reclaimed
    for (const b of D.blds) {
      if (b.h < 6.5) continue;
      const sec = D.sectorOf(b.c[0], b.c[1]);
      const pts = b.pts;
      for (let i = 0; i < pts.length; i++) {
        if (b.fill && i !== 0) continue;
        const a = pts[i],
          e = pts[(i + 1) % pts.length];
        const L = Math.hypot(e[0] - a[0], e[1] - a[1]);
        if (L < 3) continue;
        const ux = (e[0] - a[0]) / L,
          uz = (e[1] - a[1]) / L;
        let nx = -uz,
          nz = ux;
        const m: V2 = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2];
        if (D.pip([m[0] + nx * 0.5, m[1] + nz * 0.5], pts)) ((nx = -nx), (nz = -nz));
        if (D.bldAt(m[0] + nx * 4, m[1] + nz * 4) || D.bldAt(m[0] + nx * 8, m[1] + nz * 8)) continue;
        const fy = Math.atan2(nx, nz);
        if (r() < 0.22 && banner[sec].length < 150) {
          const h = Math.min(4.6, b.h - 5.2);
          if (h >= 2.4) {
            const d = 0.8 + r() * Math.max(0.1, L - 1.6);
            banner[sec].push(
              tagB(
                place(
                  setUV(new THREE.PlaneGeometry(h / 4, h), ...cellV(Math.floor(r() * ORDERS_V.length))),
                  a[0] + ux * d + nx * 0.3,
                  4.9 + h / 2,
                  a[1] + uz * d + nz * 0.3,
                  fy,
                ),
                b.c,
              ),
            );
            this.stats.banners++;
          }
        }
        // window flags, sticking out from the wall and hanging down a little
        const yawOut = Math.atan2(-nz, nx);
        for (let d = 1 + r() * 3; d < L - 0.8 && nFlags[sec] < 320; d += 3.5 + r() * 6) {
          if (r() > 0.5) continue;
          const y = 4.6 + Math.floor(r() * Math.max(1, (b.h - 6) / 3.2)) * 3.2 + 1;
          const px = a[0] + ux * d + nx * 0.12,
            pz = a[1] + uz * d + nz * 0.12;
          const seed = r() * 6.28;
          later[sec].push(() => {
            const fl = new THREE.PlaneGeometry(1.05, 0.7, 4, 1).translate(0.525, 0, 0);
            swayOf(fl, x => [seed, 0.1 * (x / 1.05), 0.03 * (x / 1.05)]);
            flags[sec].push(tagB(place(fl, px, y, pz, yawOut, 0, -0.32), b.c));
          });
          nFlags[sec]++;
          this.stats.flags++;
          if (!walls[sec] && b.h >= 13 && nx + nz > 0.6) walls[sec] = [px + nx * 7, pz + nz * 7];
        }
        // a big flag on the roof of the taller buildings
        if (!b.fill && b.h >= 10 && r() < 0.05 && nFlags[sec] < 320) {
          const seed = r() * 6.28;
          const rx = m[0] - nx * 1.2,
            rz = m[1] - nz * 1.2;
          later[sec].push(() => {
            const fl = new THREE.PlaneGeometry(2.1, 1.4, 6, 1).translate(1.05, 0, 0);
            swayOf(fl, x => [seed, 0.22 * (x / 2.1), 0.05 * (x / 2.1)]);
            flags[sec].push(tagB(place(fl, rx, b.h + 3.1, rz, yawOut + 0.6, 0, -0.04), b.c));
            const pole = tint(new THREE.CylinderGeometry(0.04, 0.05, 3.9, 5), 0x4a4a4a);
            crowd[sec].push(swayOf(place(pole, rx, b.h + 1.95, rz), () => [0, 0, 0]));
          });
          nFlags[sec]++;
          this.stats.flags++;
        }
      }
    }
    // ---- streets: order banners strung across the wide roads; neighbours and firecracker paper along the rest
    for (const q of D.roads) {
      const w = D.roadW[q.t.replace('_link', '')] ?? 3;
      if (w < 4) continue;
      let next = 8 + r() * 30,
        nextB = 40 + r() * 60,
        run = 0;
      for (let i = 0; i < q.p.length - 1; i++) {
        const a = q.p[i],
          e = q.p[i + 1];
        const L = Math.hypot(e[0] - a[0], e[1] - a[1]);
        if (L < 0.5) continue;
        const ux = (e[0] - a[0]) / L,
          uz = (e[1] - a[1]) / L;
        for (; next < run + L; next += 7 + r() * 15) {
          const s = next - run;
          const side = r() < 0.5 ? 1 : -1;
          const x0 = a[0] + ux * s - uz * side * (w / 2 + 1.1),
            z0 = a[1] + uz * s + ux * side * (w / 2 + 1.1);
          const sec = D.sectorOf(x0, z0);
          if (D.bldAt(x0, z0)) continue;
          sites[sec].push([x0, z0, w]);
        }
        if (w >= 9)
          for (; nextB < run + L; nextB += 70 + r() * 70) {
            const s = nextB - run;
            const x0 = a[0] + ux * s,
              z0 = a[1] + uz * s;
            const sec = D.sectorOf(x0, z0);
            const span = w * 0.92;
            const fy = Math.atan2(ux, uz);
            banner[sec].push(
              place(
                setUV(new THREE.PlaneGeometry(span, span / 8), ...cellH(Math.floor(r() * ORDERS_H.length))),
                x0,
                6.4,
                z0,
                fy,
              ),
            );
            for (const sd of [-1, 1])
              banner[sec].push(
                place(
                  setUV(new THREE.BoxGeometry(0.1, 6.9, 0.1), 0.02, 0.02, 0.001, 0.001),
                  x0 + uz * sd * (span / 2),
                  3.45,
                  z0 - ux * sd * (span / 2),
                ),
              );
            this.stats.crossings++;
          }
        run += L;
      }
    }
    // ---- neighbours: evenly along all of a district's streets, however long the list of roads
    for (let sec = 0; sec < D.nSec; sec++) {
      const L = sites[sec];
      const stride = Math.max(1, L.length / 110);
      for (let f = 0; f < L.length; f += stride) {
        const [x0, z0, w] = L[Math.floor(f)];
        const n = 2 + Math.floor(r() * 4);
        this.stats.people += n;
        later[sec].push(() => this.group(crowd[sec], x0, z0, n, 1.8, 5, 14, rlater));
        if (!spots[sec] && w >= 6) spots[sec] = [x0, z0];
      }
    }
    // ---- one or two meshes per district
    const atlas = ordersAtlas();
    const orderMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.85, side: THREE.DoubleSide });
    orderMat.userData.front = true;
    orderMat.customProgramCacheKey = () => 'front';
    this.flagMat = new THREE.MeshStandardMaterial({ map: D.flagTex, roughness: 0.8, side: THREE.DoubleSide });
    this.flagMat.userData.front = true;
    this.flagMat.userData.sway = true;
    this.flagMat.customProgramCacheKey = () => 'front+sway';
    this.crowdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    this.crowdMat.userData.sway = true;
    this.crowdMat.customProgramCacheKey = () => 'sway';
    const mk = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const me = new THREE.Mesh(g, m);
      me.castShadow = false;
      me.receiveShadow = true;
      me.userData.noChunk = true;
      return me;
    };
    for (let i = 0; i < D.nSec; i++) {
      const s: Sec = {
        occ: null,
        free: null,
        spot: spots[i],
        wall: walls[i],
        later: later[i],
        flags: flags[i],
        crowd: crowd[i],
      };
      if (banner[i].length) {
        // cross-street banners have no building: give them a centre the fade test can never match
        for (const g of banner[i]) if (!g.attributes.aBld) tagB(g, [1e6, 1e6]);
        s.occ = mk(merged(banner[i], ['position', 'normal', 'uv', 'aBld']), orderMat);
        D.scene.add(s.occ);
      }
      this.secs.push(s);
    }
  }
  private person(out: THREE.BufferGeometry[], x: number, z: number, r: () => number) {
    const y0 = this.D.groundY(x, z);
    const yaw = r() * 6.28,
      seed = r() * 6.28;
    const shirt = SHIRT[Math.floor(r() * SHIRT.length)],
      legs = LEGS[Math.floor(r() * LEGS.length)],
      skin = SKIN[Math.floor(r() * SKIN.length)];
    const parts: THREE.BufferGeometry[] = [
      tint(new THREE.CapsuleGeometry(0.17, 0.36, 2, 6).translate(0, 1.08, 0), shirt),
      tint(new THREE.SphereGeometry(0.115, 6, 4).translate(0, 1.55, 0), skin),
      tint(new THREE.BoxGeometry(0.11, 0.78, 0.13).translate(-0.09, 0.39, 0), legs),
      tint(new THREE.BoxGeometry(0.11, 0.78, 0.13).translate(0.09, 0.39, 0), legs),
      tint(new THREE.BoxGeometry(0.07, 0.56, 0.08).translate(-0.23, 1.04, 0), shirt),
      tint(new THREE.BoxGeometry(0.07, 0.56, 0.08).translate(0.23, 1.04, 0), shirt),
    ];
    for (const g of parts) {
      swayOf(g, (_x, y) => [seed, 0.022 * (y / 1.6), 0.012 * (y / 1.6)]);
      out.push(place(g, x, y0, z, yaw));
    }
    if (r() < 0.3) {
      // a small flag on a stick, held up in the right hand
      const cloth = [
        tint(new THREE.PlaneGeometry(0.42, 0.28, 3, 1).translate(0.47, 1.9, 0), 0xc8141a),
        tint(new THREE.PlaneGeometry(0.19, 0.13, 1, 1).translate(0.36, 1.97, 0.002), 0x1a2f7a),
      ];
      for (const g of cloth) {
        swayOf(g, gx => [seed, 0.09 * Math.max(0, gx - 0.26) * 2, 0.02]);
        out.push(place(g, x, y0, z, yaw));
      }
      const stick = swayOf(tint(new THREE.BoxGeometry(0.02, 0.9, 0.02).translate(0.25, 1.6, 0), 0xd8d2c0), () => [
        0, 0, 0,
      ]);
      out.push(place(stick, x, y0, z, yaw));
    }
  }
}

/** the big title over the street when a district comes back (does not stop the game) */
export function reclaimTitle(title: string, line: string) {
  const el = document.createElement('div');
  el.id = 'reclaim-title';
  el.style.cssText =
    'position:fixed;left:0;right:0;top:22%;text-align:center;pointer-events:none;z-index:30;' +
    'transition:opacity 1.6s;opacity:0;text-shadow:0 2px 12px #000,0 0 3px #000;padding:0 16px';
  const h = document.createElement('div');
  h.textContent = title;
  h.style.cssText = 'font:bold clamp(30px,6vw,58px) sans-serif;color:#ffe9a8;letter-spacing:.08em';
  const p = document.createElement('div');
  p.textContent = line;
  p.style.cssText = 'font:clamp(15px,2.4vw,21px) sans-serif;color:#fff;margin-top:10px';
  el.append(h, p);
  document.body.appendChild(el);
  requestAnimationFrame(() => (el.style.opacity = '1'));
  setTimeout(() => (el.style.opacity = '0'), 6500);
  setTimeout(() => el.remove(), 8400);
}
