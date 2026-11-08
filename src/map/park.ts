// Round 7: turn big empty lots into 鄰里公園 or 停車場 (instead of bare concrete with stray pillars).
import * as THREE from 'three';
import { Forest } from './trees';
type V2 = [number, number];
export type PCtx = {
  scene: THREE.Scene;
  bldAt: (x: number, z: number) => any;
  merge: (g: THREE.BufferGeometry[]) => THREE.BufferGeometry;
  addSeg: (s: { a: V2; b: V2 }, low?: boolean) => void;
  roadDist: (x: number, z: number) => number;
  center: V2;
  R: number;
};
const strip = (g: THREE.BufferGeometry) => {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
};
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const B = (x: number, y: number, z: number, tx = 0, ty = 0, tz = 0) =>
  new THREE.BoxGeometry(x, y, z).translate(tx, ty, tz);
const Cy = (r: number, h: number, ty = 0, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg).translate(0, ty, 0);
export function buildParks(c: PCtx) {
  const rnd = prng(7777);
  const forest = new Forest();
  const S = 3;
  const cells = new Map<string, V2>();
  const key = (i: number, j: number) => i + ',' + j;
  const [cx, cz] = c.center;
  for (let i = -Math.floor(c.R / S); i <= c.R / S; i++)
    for (let j = -Math.floor(c.R / S); j <= c.R / S; j++) {
      const x = cx + i * S,
        z = cz + j * S;
      if (Math.hypot(x - cx, z - cz) > c.R) continue;
      let ok = c.roadDist(x, z) > 2.5;
      for (const [dx, dz] of [
        [0, 0],
        [1.6, 0],
        [-1.6, 0],
        [0, 1.6],
        [0, -1.6],
        [1.6, 1.6],
        [-1.6, -1.6],
        [1.6, -1.6],
        [-1.6, 1.6],
      ])
        if (ok && c.bldAt(x + dx, z + dz)) ok = false;
      if (ok) cells.set(key(i, j), [x, z]);
    }
  // flood fill clusters
  const seen = new Set<string>();
  const clusters: [number, number][][] = [];
  for (const k of cells.keys()) {
    if (seen.has(k)) continue;
    const q = [k];
    seen.add(k);
    const cl: [number, number][] = [];
    while (q.length) {
      const kk = q.pop()!;
      const [i, j] = kk.split(',').map(Number);
      cl.push([i, j]);
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = key(i + di, j + dj);
        if (cells.has(n) && !seen.has(n)) {
          seen.add(n);
          q.push(n);
        }
      }
    }
    if (cl.length >= 10) clusters.push(cl);
  }
  const all = new Set<string>();
  for (const cl of clusters) for (const [i, j] of cl) all.add(key(i, j));
  const V: { g: THREE.BufferGeometry; col: number }[] = [];
  const va = (g: THREE.BufferGeometry, col: number) => V.push({ g, col });
  const brick: THREE.BufferGeometry[] = [],
    lot: THREE.BufferGeometry[] = [],
    lines: THREE.BufferGeometry[] = [];
  let parks = 0,
    lots = 0;
  clusters
    .sort((a, b) => b.length - a.length)
    .forEach((cl, ci) => {
      const isPark = ci % 3 !== 1;
      isPark ? parks++ : lots++;
      const inC = new Set(cl.map(([i, j]) => key(i, j)));
      const edge = (i: number, j: number) =>
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].filter(([di, dj]) => !inC.has(key(i + di, j + dj)));
      let play = false,
        shrine = !isPark;
      cl.forEach(([i, j], n) => {
        const x = cx + i * S,
          z = cz + j * S;
        const pl = new THREE.PlaneGeometry(S, S).rotateX(-Math.PI / 2).translate(x, 0.03, z);
        (isPark ? brick : lot).push(pl);
        const ed = edge(i, j);
        if (isPark) {
          for (const [di, dj] of ed) {
            const hx = x + di * (S / 2 - 0.3),
              hz = z + dj * (S / 2 - 0.3);
            va(B(di ? 0.5 : S, 0.6, di ? S : 0.5).translate(hx, 0.3, hz), 0x2f5a2a);
            c.addSeg(
              { a: [hx - (dj ? S / 2 : 0), hz - (di ? S / 2 : 0)], b: [hx + (dj ? S / 2 : 0), hz + (di ? S / 2 : 0)] },
              true,
            );
          } // low hedge
          const r = rnd();
          if (!ed.length && !play && cl.length > 16) {
            play = true;
            va(B(0.6, 1.6, 0.6, -0.6, 0.8, 0), 0xe0b020);
            va(B(0.5, 0.05, 2.0, -0.6, 0.85, 1.1).rotateX(0.5), 0xd83a2a);
            for (const sx of [0.4, 1.4]) {
              va(B(0.06, 2.0, 0.06, sx, 1.0, -0.6), 0x2a6ab0);
              va(B(0.06, 2.0, 0.06, sx, 1.0, 0.6), 0x2a6ab0);
            }
            va(
              B(1.2, 0.06, 0.06, 0.9, 2.0, 0)
                .rotateY(Math.PI / 2)
                .translate(0, 0, 0),
              0x2a6ab0,
            );
            va(B(0.4, 0.04, 0.2, 0.9, 0.45, 0), 0xe8e8e0);
            V.slice(-7).forEach(v => v.g.translate(x, 0, z));
          } else if (r < 0.35) {
            // v21.4 real Taipei park species (榕樹 / 樟樹 / 大王椰子 …) + undergrowth
            const t = forest.park(x + (rnd() - 0.5), z + (rnd() - 0.5), rnd);
            if (rnd() < 0.5) forest.add('shrub', x + 1, z - 0.8, rnd() * 6, 0.7 + rnd() * 0.5);
            const tr = Math.max(0.2, t.r);
            c.addSeg({ a: [x - tr, z], b: [x + tr, z] });
            c.addSeg({ a: [x, z - tr], b: [x, z + tr] });
          } else if (r < 0.42) {
            forest.add('shrub', x, z, rnd() * 6, 0.8 + rnd() * 0.6);
            if (rnd() < 0.3) forest.add('plamp', x + 1.2, z + 1.2, 0);
          } else if (r < 0.55) {
            const ry = rnd() < 0.5 ? 0 : Math.PI / 2;
            const g = [
              B(1.6, 0.06, 0.45, 0, 0.45, 0),
              B(1.6, 0.4, 0.05, 0, 0.7, -0.2),
              B(0.06, 0.45, 0.4, -0.7, 0.22, 0),
              B(0.06, 0.45, 0.4, 0.7, 0.22, 0),
            ];
            g.forEach(q => va(q.rotateY(ry).translate(x, 0, z), 0x8a6a3a));
          } else if (!shrine && ed.length) {
            shrine = true;
            va(B(1.2, 0.6, 1.0, 0, 0.3, 0).translate(x, 0, z), 0xb8b0a0);
            va(B(1.0, 1.0, 0.8, 0, 1.1, 0).translate(x, 0, z), 0xc8341e);
            va(new THREE.ConeGeometry(0.9, 0.5, 4).rotateY(Math.PI / 4).translate(x, 1.85, z), 0xd8a030);
            va(B(0.5, 0.5, 0.05, 0, 1.0, 0.42).translate(x, 0, z), 0x2a1a10);
            c.addSeg({ a: [x - 0.6, z], b: [x + 0.6, z] }, true);
          } // 土地公小廟
        } else {
          // 停車場: white stall lines
          lines.push(new THREE.PlaneGeometry(0.1, S * 0.8).rotateX(-Math.PI / 2).translate(x - S / 2 + 0.1, 0.04, z));
          if (n % 7 === 3) lines.push(new THREE.PlaneGeometry(1.2, 0.5).rotateX(-Math.PI / 2).translate(x, 0.04, z));
        }
      });
    });
  const brickT = (() => {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#9a5a44';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#6a3a2a';
    for (let y = 0; y < 64; y += 8) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(64, y);
      g.stroke();
      for (let x = (y / 8) % 2 ? 0 : 8; x < 64; x += 16) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 8);
        g.stroke();
      }
    }
    for (let k = 0; k < 200; k++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
      g.fillRect(Math.random() * 64, Math.random() * 64, 3, 3);
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material) => {
    if (!gs.length) return;
    const me = new THREE.Mesh(c.merge(gs.map(strip)), m);
    me.receiveShadow = true;
    c.scene.add(me);
  };
  add(
    brick,
    new THREE.MeshStandardMaterial({ map: brickT, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  add(
    lot,
    new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }),
  );
  add(lines, new THREE.MeshBasicMaterial({ color: 0xe8e8e0 }));
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
    const me = new THREE.Mesh(c.merge(gs), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    me.castShadow = true;
    me.receiveShadow = true;
    c.scene.add(me);
  }
  forest.build(c.scene);
  return {
    parks,
    lots,
    clusters: clusters.map(cl => [cx + cl[0][0] * S, cz + cl[0][1] * S]),
    /** v24.25 this ground is a park or a car park already */
    covers: (x: number, z: number) => all.has(key(Math.round((x - cx) / S), Math.round((z - cz) / S))),
  };
}
