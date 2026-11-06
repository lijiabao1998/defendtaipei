// v19.3 騎樓 (arcade) shophouse fronts. Columns stand inside the footprint on its street edge, under the upper
// floors; the shopfront is recessed ARC m behind them with a continuous lit ceiling. Arcades are only built on
// edges that face a road, and never on an edge that sits in the carriageway.
import * as THREE from 'three';
import { ARCADE_MATS, worldUV } from './paving';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V2 = [number, number];
/** ground-floor height (shop + arcade), upper-floor height, arcade depth, target bay (lot) width */
export const GF = 3.8,
  FH = 3.2,
  ARC = 3.6,
  BAY = 4.5;
const COL = 0.5;

export type Arc = { a: V2; c: V2; ux: number; uz: number; nx: number; nz: number; dl: number; mid: V2 };
type Deps = {
  roadDist: (x: number, z: number) => number;
  pip: (p: V2, pts: V2[]) => boolean;
  addSeg: (s: { a: V2; b: V2 }) => void;
};
let D: Deps | null = null;
export function setArcadeDeps(d: Deps) {
  D = d;
}
const pillars: { x: number; z: number; pts: V2[]; nx: number; nz: number }[] = [];
/** v24.11 every arcade front built (rain pours off their outer beams) */
export const arcFronts: Arc[] = [];
const G = {
  col: [] as THREE.BufferGeometry[],
  shut: [] as THREE.BufferGeometry[],
  floor: [] as THREE.BufferGeometry[],
};
let curPts: V2[] = [];
const floorG: THREE.BufferGeometry[][] = ARCADE_MATS.map(() => []);

/** returns the arcade frame if this footprint edge can take one */
export function arcadeFits(
  pts: V2[],
  a: V2,
  c: V2,
  ux: number,
  uz: number,
  nx: number,
  nz: number,
  dl: number,
  h: number,
): Arc | null {
  if (!D || dl < 3.5 || h < GF + FH - 0.1) return null;
  const mid: V2 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const at = (s: number, d: number): V2 => [a[0] + ux * s - nx * d, a[1] + uz * s - nz * d];
  // deep enough: the recessed shopfront and the shop behind it are still inside the footprint
  for (const p of [at(0.6, ARC + 0.3), at(dl - 0.6, ARC + 0.3), at(dl / 2, ARC + 2.5), at(0.4, 0.3), at(dl - 0.4, 0.3)])
    if (!D.pip(p, pts)) return null;
  // faces a road (the strip just outside the edge is sidewalk / roadside), but the edge is not in the roadway
  if (D.roadDist(mid[0] + nx * 1.5, mid[1] + nz * 1.5) > 2.5) return null;
  for (const p of [a, c, mid]) if (D.roadDist(p[0], p[1]) < 0.2) return null;
  curPts = pts;
  return { a, c, ux, uz, nx, nz, dl, mid };
}

const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, ang: number) => {
  g.rotateY(-ang);
  g.translate(x, y, z);
  return g;
};
const CEIL_M = new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.9 });
const LAMP_M = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 1.2 });
/** ceiling + lamps go into the building's roof group so the roof cutaway also opens the arcade */
export function buildArcade(A: Arc, roof: THREE.Object3D) {
  const ceil: THREE.BufferGeometry[] = [],
    lamp: THREE.BufferGeometry[] = [];
  arcFronts.push(A);
  const { a, ux, uz, nx, nz, dl } = A;
  const ang = Math.atan2(uz, ux);
  const at = (s: number, d: number): V2 => [a[0] + ux * s - nx * d, a[1] + uz * s - nz * d];
  const n = Math.max(1, Math.round((dl - COL) / BAY)); // bays match the lot / shopfront divisions
  const step = (dl - 0.7) / n;
  for (let k = 0; k <= n; k++) {
    const s = 0.35 + k * step;
    const [px, pz] = at(s, 0.3);
    if (!D!.pip([px, pz], curPts)) continue; // never a column outside the building mass
    G.col.push(place(new THREE.BoxGeometry(COL, GF, COL), px, GF / 2, pz, ang));
    pillars.push({ x: px, z: pz, pts: curPts, nx, nz });
    const h = COL / 2;
    D!.addSeg({ a: [px - ux * h, pz - uz * h], b: [px + ux * h, pz + uz * h] });
  }
  // continuous ceiling (soffit of the first floor), lights per bay, tiled arcade floor
  const [cx, cz] = at(dl / 2, ARC / 2);
  const [bx, bz] = at(dl / 2, 0.3);
  ceil.push(place(new THREE.BoxGeometry(dl, 0.22, ARC), cx, GF - 0.11, cz, ang));
  ceil.push(place(new THREE.BoxGeometry(dl, 0.45, 0.25), bx, GF - 0.2, bz, ang)); // beam over the columns
  // v21.3 each lot (bay) tiled by its own owner: pick one of the 騎樓 tile styles per bay, world-planar UVs
  {
    const nb = Math.max(1, n),
      bl = dl / nb;
    for (let k = 0; k < nb; k++) {
      const [fx, fz] = at((k + 0.5) * bl, ARC / 2);
      const hsh = Math.abs(Math.sin(fx * 12.9898 + fz * 78.233) * 43758.5453) % 1;
      const si = Math.floor(hsh * ARCADE_MATS.length);
      floorG[si].push(worldUV(place(new THREE.BoxGeometry(bl, 0.06, ARC), fx, 0.03, fz, ang), 1, -ang));
    }
  }
  for (let k = 0; k < n; k++) {
    const s = 0.35 + (k + 0.5) * step;
    const [lx, lz] = at(s, ARC / 2);
    lamp.push(place(new THREE.BoxGeometry(1.0, 0.04, 0.18), lx, GF - 0.24, lz, ang));
    // roll-up shutter on each bay of the recessed shopfront, except where the shop door is
    const [sx, sz] = at(s, ARC - 0.15);
    if (Math.abs(s - dl / 2) > step / 2)
      G.shut.push(place(new THREE.BoxGeometry(step - COL - 0.1, 2.9, 0.06), sx, 1.45, sz, ang));
  }
  const cm = new THREE.Mesh(mergeGeometries(ceil), CEIL_M);
  cm.castShadow = cm.receiveShadow = true;
  roof.add(cm, new THREE.Mesh(mergeGeometries(lamp), LAMP_M));
}

const cv = (w: number, h: number, f: (g: CanvasRenderingContext2D) => void, rx = 1, ry = 1) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  f(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
// small mosaic / ceramic tiles typical of 騎樓 columns and floors
const tileTex = (base: string, line: string, n: number, rx: number, ry: number) =>
  cv(
    128,
    128,
    g => {
      g.fillStyle = base;
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 200; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
        g.fillRect(Math.random() * 128, Math.random() * 128, 128 / n, 128 / n);
      }
      g.strokeStyle = line;
      g.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        g.beginPath();
        g.moveTo((i * 128) / n, 0);
        g.lineTo((i * 128) / n, 128);
        g.moveTo(0, (i * 128) / n);
        g.lineTo(128, (i * 128) / n);
        g.stroke();
      }
    },
    rx,
    ry,
  );
const shutTex = () =>
  cv(
    64,
    64,
    g => {
      g.fillStyle = '#9a9c9e';
      g.fillRect(0, 0, 64, 64);
      for (let y = 0; y < 64; y += 4) {
        g.fillStyle = '#6e7072';
        g.fillRect(0, y, 64, 1);
        g.fillStyle = '#b4b6b8';
        g.fillRect(0, y + 1, 64, 1);
      }
      for (let i = 0; i < 30; i++) {
        g.fillStyle = `rgba(90,60,40,${Math.random() * 0.25})`;
        g.fillRect(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 8, 1 + Math.random() * 6);
      }
    },
    1,
    6,
  );

export function flushArcades(scene: THREE.Scene) {
  const add = (gs: THREE.BufferGeometry[], m: THREE.Material, shadow = false) => {
    if (!gs.length) return;
    const me = new THREE.Mesh(mergeGeometries(gs), m);
    me.castShadow = shadow;
    me.receiveShadow = true;
    scene.add(me);
    gs.length = 0;
  };
  add(G.col, new THREE.MeshStandardMaterial({ map: tileTex('#c9b9a0', '#8a7a64', 8, 1, 6), roughness: 0.45 }), true);
  floorG.forEach((gs, i) => add(gs, ARCADE_MATS[i]));
  add(G.shut, new THREE.MeshStandardMaterial({ map: shutTex(), roughness: 0.6, metalness: 0.4 }));
}

/** automated check: columns that are outside their footprint, not under any building, or in a road */
export function arcadeAudit(bldAt: (x: number, z: number) => unknown) {
  let outside = 0,
    free = 0,
    road = 0;
  for (const p of pillars) {
    if (!D!.pip([p.x, p.z], p.pts)) outside++;
    if (!bldAt(p.x, p.z)) free++;
    if (D!.roadDist(p.x, p.z) < 0) road++;
  }
  const sample = [0.1, 0.4, 0.7]
    .map(f => pillars[Math.floor(f * pillars.length)])
    .filter(Boolean)
    .map(p => [+(p.x + p.nx * 4).toFixed(1), +(p.z + p.nz * 4).toFixed(1)]); /* street spot 4 m out */
  return { columns: pillars.length, outside, free, road, sample };
}
