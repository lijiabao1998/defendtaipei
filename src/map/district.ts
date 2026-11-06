// v21: the whole of 萬華區 outside the hand-built core, streamed in 200 m tiles (scripts/district.mjs).
// Near tiles get full walk-up dressing modelled on 萬華 street photos (鐵窗 balcony cages per floor, teal/red
// corrugated awnings with rusty undersides, stained concrete, balcony plants, laundry, faded 平價快餐-style
// signboards, curved-pole lamps, parked scooters/taxis/kei trucks, rooftop tin additions); mid tiles drop to
// walls + roofs (LOD); far tiles are disposed. Each tile has a deterministic seed so content is identical on
// every client (multiplayer-ready) and player changes are stored per tile key. Data © OpenStreetMap (ODbL).
import { buildTemple, type TempleCont } from './temple';
import { buildRedHouse, buildBopiliao, type WalkIn } from './landmarks';
import * as THREE from 'three';
import { chunkify } from '../core/chunk';
/** v24.6 ?chunk=0 turns the tile chunking off (before / after comparisons) */
const CHUNK = typeof location === 'undefined' || new URLSearchParams(location.search).get('chunk') !== '0';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTex, roadMat } from './textures';
import { lotTex, ARCADE_MATS, worldUV } from './paving';
import { stair, leanTo, ac, brickPatch, brickMat, vsign, vsignMat, VSN } from './walkup';
import { useOf, specialKind, type Use } from './clutter';
import { Forest } from './trees';
import { placeRooftop, dressRoof, pickRoofMat, roofClass, roofDetMat, roofConc } from './rooftin';
import { VehicleSystem, type VehicleKind } from '../systems/vehicles';
import { readDistrictTiles, writeDistrictTiles } from '../systems/save';

type V2 = [number, number];
export type DBld = { p: V2[]; l?: number; n?: string; k?: string; s?: string; g?: 1 };
export type DRoad = { t: string; p: V2[]; n?: string; b?: 1 };
type TileData = { b: DBld[]; r: DRoad[] };
export type DIndex = {
  attribution: string;
  T: number;
  bbox: [number, number, number, number];
  boundary: V2[][];
  landmarks: { kind: string; n: string; x: number; z: number }[];
  water: V2[][];
  park: { n?: string; p: V2[] }[];
  landuse: { t: string; p: V2[] }[];
  rail: V2[][];
  river: [number, number, number, number, number, number, number][];
  tiles: Record<string, [number, number]>;
};
export type Front = { x: number; z: number; nx: number; nz: number; ux: number; uz: number; len: number };
/** v23.3 enterable district building: the whole ground floor is walkable behind a street door and is furnished
 * lazily near the player by core/main through clutter.ts (same planner as the core blocks). Deterministic per tile. */
export type DEnter = {
  key: string;
  /** building index in the tile data (stable; container ids derive from it) */
  bi: number;
  /** 32-bit seed for the interior plan */
  id: number;
  pts: V2[];
  h: number;
  type: 'home';
  /** v23.6 public building kind (school, clinic, temple, market, police, office) from the OSM tags, if any */
  kind?: Use;
  minx: number;
  maxx: number;
  minz: number;
  maxz: number;
  c: V2;
  /** street door: centre and jambs */
  door: { p: V2; a: V2; c: V2 };
  /** ground-floor use the planner will pick (door frame colour) */
  use: Use;
  /** street test result shared with the planner */
  street: boolean;
  /** footprint edge index that holds the door */
  edge: number;
  /** oriented cut box: origin, axis U (N = (-Uz, Ux) points inward), [umin, umax, vmin, vmax] with margin */
  O: V2;
  U: V2;
  ub: [number, number, number, number];
};
export type TileInfo = {
  key: string;
  cx: number;
  cz: number;
  fronts: Front[];
  roads: DRoad[];
  rnd: () => number;
  enter: DEnter[];
  /** v24.1 footprints built in this tile / how many became enterable */
  nB: number;
};
type Seg = { a: V2; b: V2; low?: boolean };
export type DistrictDeps = {
  scene: THREE.Scene;
  base: string;
  addSeg: (s: Seg) => void;
  removeSeg: (s: Seg) => void;
  inCore: (x: number, z: number) => boolean;
  onLoad?: (t: TileInfo) => void;
  onUnload?: (key: string) => void;
};

export const GF = 3.8,
  FH = 3.2;
const RW: Record<string, number> = {
  trunk: 18,
  primary: 16,
  secondary: 12,
  tertiary: 9,
  residential: 6,
  unclassified: 6,
  living_street: 5,
  service: 4,
  pedestrian: 6,
  footway: 2.5,
  path: 2,
  steps: 2,
  cycleway: 2.5,
};
/** half-width of the river ribbon either side of the boundary (river centre line) */
export const RIVER_W = 140;
export const LOAD_R = 520,
  DETAIL_R = 300,
  UNLOAD_R = 680;
/**
 * v23.3 enterable buildings: share of eligible street-front buildings, cap per tile, door width, cut-box margin.
 * v24.1 every building: all footprints (any size or height) get a door — on the street side when one faces a road,
 * otherwise on a lane / light-well side that is not blocked by a neighbour (back door).
 */
export const ENTER_P = 1,
  ENTER_CAP = 400,
  DOOR_W = 1.4,
  CUT_M = 1.0;
const DOOR_H = 2.4,
  INSET = 0.1,
  EG = 10;
const PLASTER = [0xe8e2d0, 0xd8dcd0, 0xe6d8c4, 0xe2e6dc];
function hash32(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function seeded(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pip(pt: V2, poly: V2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i],
      [xj, zj] = poly[j];
    if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// ---------- textures (photo-referenced) ----------
const stain = (c: CanvasRenderingContext2D, w: number, h: number, n: number, a: number) => {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w,
      y = Math.random() * h * 0.6;
    const g = c.createLinearGradient(x, y, x, y + 40 + Math.random() * 90);
    g.addColorStop(0, `rgba(40,36,30,${a})`);
    g.addColorStop(1, 'rgba(40,36,30,0)');
    c.fillStyle = g;
    c.fillRect(x, y, 3 + Math.random() * 10, 130);
  }
};
// one bay × one floor of a walk-up: stained/peeling render, the wall behind a balcony cage (dark opening)
const upperTex = canvasTex(128, 128, c => {
  c.fillStyle = '#d7d2c6';
  c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    c.fillStyle = `rgba(${90 + Math.random() * 60},${85 + Math.random() * 50},${70 + Math.random() * 40},${Math.random() * 0.12})`;
    c.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 14, 2 + Math.random() * 6);
  }
  c.fillStyle = '#4a4c48';
  c.fillRect(22, 30, 84, 62); // aluminium window behind the cage
  c.fillStyle = '#7d8a86';
  c.fillRect(25, 33, 38, 56);
  c.fillRect(65, 33, 38, 56);
  c.fillStyle = 'rgba(190,210,210,.45)';
  c.fillRect(27, 35, 34, 24);
  c.fillRect(67, 35, 34, 24);
  c.fillStyle = '#b9b3a6';
  c.fillRect(0, 112, 128, 16); // slab edge
  stain(c, 128, 128, 6, 0.35);
  // peeling patches
  for (let i = 0; i < 5; i++) {
    c.fillStyle = 'rgba(150,140,120,.5)';
    c.beginPath();
    c.ellipse(Math.random() * 128, 104 + Math.random() * 20, 4 + Math.random() * 8, 2 + Math.random() * 4, 0, 0, 7);
    c.fill();
  }
});
// v24.18 the same bay in coursed masonry; the vertex tint makes it red brick or small white tile
const upperAltTex = canvasTex(128, 128, c => {
  c.fillStyle = '#b4aea2';
  c.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 32; r++)
    for (let k = -1; k < 11; k++) {
      const v = 214 + Math.random() * 40;
      c.fillStyle = `rgb(${v},${v},${v})`;
      c.fillRect(k * 12 + (r % 2 ? 6 : 0), r * 4, 11, 3);
    }
  c.fillStyle = '#4a4c48';
  c.fillRect(22, 30, 84, 62);
  c.fillStyle = '#7d8a86';
  c.fillRect(25, 33, 38, 56);
  c.fillRect(65, 33, 38, 56);
  c.fillStyle = 'rgba(190,210,210,.45)';
  c.fillRect(27, 35, 34, 24);
  c.fillRect(67, 35, 34, 24);
  c.fillStyle = '#e8e2d6';
  c.fillRect(0, 112, 128, 16);
  stain(c, 128, 128, 6, 0.3);
});
// ground floor: rolled steel shutter / open shop front
const shutTex = canvasTex(128, 128, c => {
  c.fillStyle = '#8d9190';
  c.fillRect(0, 0, 128, 128);
  for (let y = 26; y < 128; y += 4) {
    c.fillStyle = y % 8 ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.2)';
    c.fillRect(6, y, 116, 2);
  }
  c.fillStyle = '#4c4a44';
  c.fillRect(0, 0, 128, 24);
  c.fillRect(0, 0, 6, 128);
  c.fillRect(122, 0, 6, 128);
  c.fillStyle = 'rgba(30,25,20,.35)';
  c.fillRect(6, 100, 116, 28);
  stain(c, 128, 128, 4, 0.25);
});
const SIGNS: [string, string, string][] = [
  ['平價快餐', '#f2c230', '#b0201a'],
  ['自助餐', '#d6342a', '#fff4c8'],
  ['機車行', '#f0d040', '#1d3f8a'],
  ['檳榔', '#e83f8a', '#fff'],
  ['五金行', '#2e8f5a', '#fff'],
  ['早餐', '#f4b030', '#c0301a'],
  ['麵店', '#c82c24', '#f4e6b0'],
  ['藥局', '#1f6fb5', '#fff'],
  ['小吃', '#efd23a', '#a51c16'],
  ['當舖', '#7a1f1a', '#f4d27a'],
  ['洗衣', '#3aa0b8', '#fff'],
  ['冷氣', '#e8e2d0', '#1d5fa8'],
];
const SA = 4; // atlas columns
const signTex = canvasTex(512, 384, c => {
  SIGNS.forEach(([t, bg, fg], i) => {
    const x = (i % SA) * 128,
      y = Math.floor(i / SA) * 128;
    c.fillStyle = bg;
    c.fillRect(x + 2, y + 30, 124, 68);
    c.fillStyle = 'rgba(255,255,255,.22)'; // sun-faded
    c.fillRect(x + 2, y + 30, 124, 68);
    c.fillStyle = fg;
    c.font = `bold ${t.length > 3 ? 26 : 34}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(t, x + 64, y + 64);
    stain(c, 0, 0, 0, 0);
    c.fillStyle = 'rgba(60,40,20,.25)';
    c.fillRect(x + 2, y + 88, 124, 10);
  });
});
signTex.repeat.set(1, 1);
const upperMat = new THREE.MeshStandardMaterial({ map: upperTex, vertexColors: true, roughness: 0.95 });
const upperAltMat = new THREE.MeshStandardMaterial({ map: upperAltTex, vertexColors: true, roughness: 0.92 });
const shutMat = new THREE.MeshStandardMaterial({ map: shutTex, vertexColors: true, roughness: 0.8, metalness: 0.2 });
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const metalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.45 });
const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.7, side: THREE.DoubleSide });
const plantMat = new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.9, flatShading: true });
const clothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 0.9, flatShading: true });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
const lampMat = new THREE.MeshStandardMaterial({ color: 0x8f9692, roughness: 0.5, metalness: 0.6 });
const waterMat = new THREE.MeshStandardMaterial({ color: 0x4f6f78, roughness: 0.25, metalness: 0.2 });
const parkMat = new THREE.MeshStandardMaterial({ color: 0x5f7f44, roughness: 1 });

const col = new THREE.Color();
function paint(g: THREE.BufferGeometry, hex: number, jitter = 0) {
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  col.setHex(hex);
  if (jitter) col.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.index) return g.toNonIndexed();
  return g;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return paint(g, c);
};
// unit balcony cage: x∈[-.5,.5], y∈[0,1], z∈[0,1] outward. Bars + rails (dark green/grey iron), rust floor
// lip, teal corrugated roof sloping out with rusty-orange underside.
function cageGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const iron = 0x46504c;
  for (let i = 0; i <= 8; i++) parts.push(box(0.012, 0.86, 0.012, -0.5 + i / 8, 0.47, 1, iron));
  for (const z of [0.25, 0.5, 0.75]) for (const s of [-0.5, 0.5]) parts.push(box(0.012, 0.86, 0.012, s, 0.47, z, iron));
  for (const y of [0.04, 0.3, 0.9]) {
    parts.push(box(1, 0.02, 0.02, 0, y, 1, iron));
    for (const s of [-0.5, 0.5]) parts.push(box(0.02, 0.02, 1, s, y, 0.5, iron));
  }
  parts.push(box(1.02, 0.05, 1.02, 0, 0.0, 0.5, 0x8a5a36)); // rusty floor lip
  const roof = box(1.08, 0.025, 1.12, 0, 0, 0.52, 0x3e8f8a); // teal corrugated
  roof.rotateX(0.14);
  roof.translate(0, 0.96, 0);
  parts.push(roof);
  const under = box(1.06, 0.01, 1.1, 0, -0.016, 0.52, 0xb2622c); // rust underside
  under.rotateX(0.14);
  under.translate(0, 0.96, 0);
  parts.push(under);
  return mergeGeometries(parts);
}
function lampGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pole = new THREE.CylinderGeometry(0.06, 0.09, 7, 6);
  pole.translate(0, 3.5, 0);
  parts.push(pole);
  // the curved 'shepherd's crook' arm of Taipei street lamps
  const arc = new THREE.TubeGeometry(
    new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 6.9, 0),
      new THREE.Vector3(0, 8.2, 0.1),
      new THREE.Vector3(0, 7.95, 1.3),
    ),
    8,
    0.05,
    5,
  );
  parts.push(arc);
  const head = new THREE.BoxGeometry(0.3, 0.14, 0.7);
  head.translate(0, 7.88, 1.55);
  parts.push(head);
  return mergeGeometries(parts.map(g => g.toNonIndexed()));
}
const CAGE = cageGeo(),
  LAMP = lampGeo(),
  PLANT = new THREE.IcosahedronGeometry(0.28, 0),
  CLOTH = new THREE.PlaneGeometry(0.45, 0.6);
const WALLTINT = [0xf2eee4, 0xe6ddc8, 0xd9d4cc, 0xefe2d2, 0xd4dbd6, 0xe8d6c8, 0xcfcab9, 0xdfe6e2];
const AWN = [0x3e8f8a, 0x3e8f8a, 0x2f7f86, 0xc0392b, 0xb5452e, 0xd8d2c0];
const CLOTHC = [0xf4f4f0, 0x3a5fa8, 0xd84a4a, 0xf0c030, 0x6aa86a, 0x222222, 0xe8a0b8];

type Tile = { key: string; cx: number; cz: number; g: THREE.Group; detail: THREE.Group; segs: Seg[]; info: TileInfo };

export class District {
  ix!: DIndex;
  ready: Promise<void>;
  tiles = new Map<string, Tile>();
  data = new Map<string, TileData>();
  pending = new Set<string>();
  stats = { loads: 0, unloads: 0, maxLoaded: 0, builtMs: 0, chunked: 0 };
  saved: Record<string, any> = {};
  /** v24.6 extra footprints per tile key (core block interiors), appended to the tile data when it is fetched */
  extra: ((key: string) => DBld[]) | null = null;
  private rgrid = new Map<string, [V2, V2, number][]>();
  /** v23.3 enterable buildings of loaded tiles, bucketed in EG m cells */
  private egrid = new Map<string, DEnter[]>();
  private queue: string[] = [];
  private busy = false;
  constructor(private d: DistrictDeps) {
    this.ready = this.init();
    this.saved = readDistrictTiles();
  }
  /** per-tile player changes (looted containers, cleared posts…) */
  save(key: string, k: string, v: any) {
    (this.saved[key] ||= {})[k] = v;
    writeDistrictTiles(this.saved);
  }
  private async init() {
    this.ix = await (await fetch(this.d.base + 'data/district/index.json')).json();
    const [x0, z0, x1, z1] = this.ix.bbox;
    // district ground (core ground sits on top, slightly higher)
    // v21.3 paved like the core (shared canvas, own repeat)
    const gt = lotTex.clone();
    gt.needsUpdate = true;
    gt.repeat.set((x1 - x0 + 400) / 8, (z1 - z0 + 400) / 8);
    const gm = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0 + 400, z1 - z0 + 400),
      new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }),
    );
    gm.rotation.x = -Math.PI / 2;
    gm.position.set((x0 + x1) / 2, -0.03, (z0 + z1) / 2);
    gm.receiveShadow = true;
    this.d.scene.add(gm);
    const flat = (polys: V2[][], y: number) => {
      const gs: THREE.BufferGeometry[] = [];
      for (const p of polys) {
        if (p.length < 4) continue;
        const sh = new THREE.Shape(p.map(q => new THREE.Vector2(q[0], -q[1])));
        const g = new THREE.ShapeGeometry(sh);
        g.rotateX(-Math.PI / 2);
        g.translate(0, y, 0);
        gs.push(g);
      }
      return gs.length ? mergeGeometries(gs) : null;
    };
    const wg = flat(this.ix.water, -0.01);
    if (wg) this.d.scene.add(new THREE.Mesh(wg, waterMat));
    const pg = flat(
      this.ix.park.filter(q => !q.p.every(v => this.d.inCore(v[0], v[1]))).map(q => q.p),
      -0.005,
    );
    if (pg) {
      const m = new THREE.Mesh(pg, parkMat);
      m.receiveShadow = true;
      this.d.scene.add(m);
    }
    // 淡水河 / 新店溪: the admin boundary runs down the river's centre line on the west & south sides
    const rw: THREE.BufferGeometry[] = [];
    for (const [ax, az, bx, bz, w, nx, nz] of this.ix.river) {
      // nx,nz = inward (land-side) normal; w = half-width of water either side of the centre line
      const L = Math.hypot(bx - ax, bz - az);
      const pg = new THREE.PlaneGeometry(L + w, w + RIVER_W);
      pg.rotateX(-Math.PI / 2);
      pg.rotateY(-Math.atan2(bz - az, bx - ax));
      pg.translate((ax + bx) / 2 + (nx * (w - RIVER_W)) / 2, -0.012, (az + bz) / 2 + (nz * (w - RIVER_W)) / 2);
      rw.push(pg);
      const ux = (bx - ax) / L,
        uz = (bz - az) / L;
      // embankment (堤防) line on the land side keeps players out of the water
      this.d.addSeg({
        a: [ax + nx * w - ux * 8, az + nz * w - uz * 8],
        b: [bx + nx * w + ux * 8, bz + nz * w + uz * 8],
      });
    }
    if (rw.length) this.d.scene.add(new THREE.Mesh(mergeGeometries(rw), waterMat));
    this.buildLandmarks();
  }
  inside(x: number, z: number) {
    return !this.ix || this.ix.boundary.some(b => pip([x, z], b));
  }
  /** v23.3 the enterable building whose footprint contains (x, z), if its tile is loaded */
  enterAt(x: number, z: number): DEnter | null {
    for (const e of this.egrid.get(Math.floor(x / EG) + ',' + Math.floor(z / EG)) || [])
      if (x > e.minx && x < e.maxx && z > e.minz && z < e.maxz && pip([x, z], e.pts)) return e;
    return null;
  }
  /** v24.18 what is loaded right now */
  *loadedInfos() {
    for (const t of this.tiles.values()) yield t.info;
  }
  /** v23.3 every enterable building of the loaded tiles */
  *enterables() {
    for (const t of this.tiles.values()) yield* t.info.enter;
  }
  /** v24.1 coverage over the loaded tiles: footprints built, enterable, back doors */
  enterStats() {
    let n = 0,
      enter = 0,
      back = 0;
    for (const t of this.tiles.values()) {
      n += t.info.nB;
      enter += t.info.enter.length;
      back += t.info.enter.filter(e => !e.street).length;
    }
    return { tiles: this.tiles.size, n, enter, back };
  }
  private egridEach(e: DEnter, f: (k: string) => void) {
    for (let x = Math.floor(e.minx / EG); x <= Math.floor(e.maxx / EG); x++)
      for (let z = Math.floor(e.minz / EG); z <= Math.floor(e.maxz / EG); z++) f(x + ',' + z);
  }
  /**
   * v23.3 decide whether a footprint becomes enterable and where its street door goes. Uses its own random stream
   * (er) so the rest of the tile's deterministic content keeps its sequence.
   */
  private planEnter(
    key: string,
    bi: number,
    pts: V2[],
    area: number,
    lv: number,
    h: number,
    er: () => number,
    kind: Use | null,
    free?: (x: number, z: number) => boolean,
  ) {
    // v23.6 public buildings (schools, hospitals, temples, markets, stations, offices) are always enterable,
    // and may be big; v24.1 so is every ordinary building (ENTER_P = 1), whatever its size or height
    const roll = er();
    if (area < 12 || roll >= ENTER_P) return null;
    let best = -1,
      bl = 0,
      back = -1,
      backL = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        c = pts[(i + 1) % pts.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 2.4) continue;
      const ux = (c[0] - a[0]) / L,
        uz = (c[1] - a[1]) / L;
      let nx = uz,
        nz = -ux;
      const mx = (a[0] + c[0]) / 2,
        mz = (a[1] + c[1]) / 2;
      if (pip([mx + nx * 0.3, mz + nz * 0.3], pts)) ((nx = -nx), (nz = -nz));
      if (L >= 3.6 && this.roadDist(mx + nx * 3, mz + nz * 3) <= 3) {
        if (L > bl) ((bl = L), (best = i));
        continue;
      }
      // v24.1 back door: an edge whose outside (0.8 m and 1.4 m out — a 1.6 m 防火巷 is enough) is open ground
      if (free && free(mx + nx * 0.8, mz + nz * 0.8) && free(mx + nx * 1.4, mz + nz * 1.4) && L > backL)
        ((backL = L), (back = i));
    }
    if (best < 0 && back >= 0) ((best = back), (bl = backL));
    if (best < 0) return null;
    const a = pts[best],
      c = pts[(best + 1) % pts.length];
    const ux = (c[0] - a[0]) / bl,
      uz = (c[1] - a[1]) / bl;
    const t0 = 0.7 + er() * Math.max(0, bl - DOOR_W - 1.4);
    const d0: V2 = [a[0] + ux * t0, a[1] + uz * t0],
      d1: V2 = [a[0] + ux * (t0 + DOOR_W), a[1] + uz * (t0 + DOOR_W)];
    const O: V2 = [(d0[0] + d1[0]) / 2, (d0[1] + d1[1]) / 2];
    let N: V2 = [-uz, ux];
    if (!pip([O[0] + N[0] * 0.6, O[1] + N[1] * 0.6], pts)) N = [uz, -ux];
    if (!pip([O[0] + N[0] * 0.6, O[1] + N[1] * 0.6], pts)) return null;
    const U: V2 = [N[1], -N[0]]; // so that N = (-Uz, Ux), the planner's right-handed frame
    let umin = 1e9,
      umax = -1e9,
      vmin = 1e9,
      vmax = -1e9;
    for (const q of pts) {
      const du = (q[0] - O[0]) * U[0] + (q[1] - O[1]) * U[1],
        dv = (q[0] - O[0]) * N[0] + (q[1] - O[1]) * N[1];
      umin = Math.min(umin, du);
      umax = Math.max(umax, du);
      vmin = Math.min(vmin, dv);
      vmax = Math.max(vmax, dv);
    }
    if (umax - umin < 3 || vmax < 3) return null;
    const xs = pts.map(q => q[0]),
      zs = pts.map(q => q[1]);
    const id = hash32('dt23e:' + key + ':' + bi);
    const street = this.roadDist(O[0] - N[0] * 3, O[1] - N[1] * 3) < 5;
    const e: DEnter = {
      key,
      bi,
      id,
      pts,
      h,
      type: 'home',
      kind: kind ?? undefined,
      minx: Math.min(...xs),
      maxx: Math.max(...xs),
      minz: Math.min(...zs),
      maxz: Math.max(...zs),
      c: [xs.reduce((s, v) => s + v, 0) / xs.length, zs.reduce((s, v) => s + v, 0) / zs.length],
      door: { p: O, a: d0, c: d1 },
      use: 'home',
      street,
      edge: best,
      O,
      U,
      ub: [umin - CUT_M, umax + CUT_M, vmin - CUT_M, vmax + CUT_M],
    };
    e.use = useOf(e, street, { seed: id });
    return e;
  }
  /** distance to nearest loaded/cached district road edge (centre distance minus half width) */
  roadDist(x: number, z: number) {
    let best = 1e9;
    const G = 20;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const [a, b, w] of this.rgrid.get(Math.floor(x / G) + i + ',' + (Math.floor(z / G) + j)) || []) {
          const dx = b[0] - a[0],
            dz = b[1] - a[1],
            l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
          best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) - w);
        }
    return best;
  }
  private async fetchTile(k: string) {
    if (this.data.has(k)) return this.data.get(k)!;
    if (!this.ix.tiles[k]) {
      this.data.set(k, { b: this.extra?.(k) ?? [], r: [] });
      return this.data.get(k)!;
    }
    const td: TileData = await (await fetch(this.d.base + `data/district/${k}.json`)).json();
    const ex = this.extra?.(k);
    if (ex?.length) td.b = td.b.concat(ex);
    this.data.set(k, td);
    const G = 20;
    for (const r of td.r) {
      const w = (RW[r.t.replace('_link', '')] ?? 3) / 2;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [a, b] = [r.p[i], r.p[i + 1]];
        for (let x = Math.floor(Math.min(a[0], b[0]) / G); x <= Math.floor(Math.max(a[0], b[0]) / G); x++)
          for (let z = Math.floor(Math.min(a[1], b[1]) / G); z <= Math.floor(Math.max(a[1], b[1]) / G); z++)
            (this.rgrid.get(x + ',' + z) || this.rgrid.set(x + ',' + z, []).get(x + ',' + z)!).push([a, b, w]);
      }
    }
    return td;
  }
  /** call every frame with the player position */
  update(px: number, pz: number) {
    if (!this.ix) return;
    const T = this.ix.T;
    const want: [string, number][] = [];
    const r = Math.ceil(LOAD_R / T);
    const tx = Math.floor(px / T),
      tz = Math.floor(pz / T);
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) {
        const k = tx + i + '_' + (tz + j);
        if (!this.ix.tiles[k]) continue;
        const d = Math.hypot((tx + i + 0.5) * T - px, (tz + j + 0.5) * T - pz);
        if (d < LOAD_R && !this.tiles.has(k) && !this.pending.has(k)) want.push([k, d]);
      }
    want.sort((a, b) => a[1] - b[1]);
    this.queue = want.map(w => w[0]);
    for (const t of this.tiles.values()) {
      const d = Math.hypot(t.cx - px, t.cz - pz);
      if (d > UNLOAD_R) this.unload(t.key);
      else t.detail.visible = d < DETAIL_R;
    }
    if (!this.busy && this.queue.length) {
      const k = this.queue.shift()!;
      this.busy = true;
      this.pending.add(k);
      this.load(k).finally(() => {
        this.pending.delete(k);
        this.busy = false;
      });
    }
  }
  private async load(k: string) {
    const [tx, tz] = k.split('_').map(Number);
    // neighbours' roads too, so frontage detection works at tile edges
    await Promise.all([-1, 0, 1].flatMap(i => [-1, 0, 1].map(j => this.fetchTile(tx + i + '_' + (tz + j)))));
    const t0 = performance.now();
    const T = this.ix.T;
    const tile = await this.build(k, this.data.get(k)!, (tx + 0.5) * T, (tz + 0.5) * T);
    // v24.6 split the tile's merged meshes (200 m across) into 50 m pieces so off-screen parts are culled
    if (CHUNK) {
      const cs = chunkify(tile.g, { minTris: 6000, minSpan: 70, cell: 50, instanced: true });
      this.stats.chunked += cs.meshes;
    }
    this.stats.builtMs = Math.max(this.stats.builtMs, performance.now() - t0);
    this.tiles.set(k, tile);
    for (const e of tile.info.enter)
      this.egridEach(e, c => (this.egrid.get(c) || this.egrid.set(c, []).get(c)!).push(e));
    this.stats.loads++;
    this.stats.maxLoaded = Math.max(this.stats.maxLoaded, this.tiles.size);
    this.d.onLoad?.(tile.info);
  }
  private unload(k: string) {
    const t = this.tiles.get(k);
    if (!t) return;
    this.d.scene.remove(t.g);
    t.g.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry && !(m.geometry as any).shared) m.geometry.dispose();
    });
    for (const s of t.segs) this.d.removeSeg(s);
    for (const e of t.info.enter)
      this.egridEach(e, c => {
        const a = this.egrid.get(c);
        const i = a ? a.indexOf(e) : -1;
        if (i >= 0) a!.splice(i, 1);
        if (a && !a.length) this.egrid.delete(c);
      });
    this.tiles.delete(k);
    this.stats.unloads++;
    this.d.onUnload?.(k);
  }
  private async build(key: string, td: TileData, cx: number, cz: number): Promise<Tile> {
    // v24.6 tiles with the core block interiors hold 60–100 walk-ups: give the browser a chance to draw after every
    // ~200 ms of building work, so a heavy tile never blocks the page for seconds on a slow CPU (software WebGL,
    // phones). Ordinary tiles build in well under that and never yield (each yield may cost a whole frame there).
    let tY = performance.now();
    const breathe = async () => {
      if (performance.now() - tY < 200) return;
      await new Promise(r => setTimeout(r, 0));
      tY = performance.now();
    };
    const rnd = seeded('dt21:' + key);
    const g = new THREE.Group(),
      detail = new THREE.Group();
    g.name = 'tile:' + key;
    g.add(detail);
    const segs: Seg[] = [];
    const upAlt: THREE.BufferGeometry[] = [];
    const up: THREE.BufferGeometry[] = [],
      gr: THREE.BufferGeometry[] = [],
      misc: THREE.BufferGeometry[] = [],
      metal: THREE.BufferGeometry[] = [],
      signs: THREE.BufferGeometry[] = [];
    const cages: THREE.Matrix4[] = [],
      plants: THREE.Matrix4[] = [],
      cloth: [THREE.Matrix4, number][] = [],
      cagesC: [THREE.Matrix4, number][] = [],
      lamps: THREE.Matrix4[] = [],
      forest = new Forest();
    // trunk blocker (collision + bullet cover)
    const trunk = (x: number, z: number, r: number) => {
      if (r <= 0) return;
      for (const [a, b] of [
        [r, 0],
        [0, r],
      ]) {
        const sg: Seg = { a: [x - a, z - b], b: [x + a, z + b] };
        segs.push(sg);
        this.d.addSeg(sg);
      }
    };
    const fronts: Front[] = [];
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      Y = new THREE.Vector3(0, 1, 0);
    const place = (x: number, y: number, z: number, ang: number, sx: number, sy: number, sz: number) =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        q.setFromAxisAngle(Y, ang).clone(),
        new THREE.Vector3(sx, sy, sz),
      );
    let roofs = 0;
    // v22.9.1 every roof in the tile gets parapets + roof kit, merged into two meshes per tile
    const roofKit = { det: [] as THREE.BufferGeometry[], conc: [] as THREE.BufferGeometry[] };
    const roofB = new Map<THREE.Material, THREE.BufferGeometry[]>();
    // base road surfaces
    const rg: THREE.BufferGeometry[] = [];
    for (const r of td.r) {
      const w = RW[r.t.replace('_link', '')] ?? 3;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [ax, az] = r.p[i],
          [bx, bz] = r.p[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.1) continue;
        if (this.d.inCore((ax + bx) / 2, (az + bz) / 2)) continue;
        const pg = new THREE.PlaneGeometry(len + w * 0.5, w);
        pg.rotateX(-Math.PI / 2);
        pg.rotateY(-Math.atan2(bz - az, bx - ax));
        pg.translate((ax + bx) / 2, 0.02 + w * 0.0005, (az + bz) / 2);
        rg.push(pg);
        // curved-pole lamps & street trees along the kerb
        if (w >= 6)
          for (let s = 8 + rnd() * 10; s < len; s += 26 + rnd() * 8) {
            const ux = (bx - ax) / len,
              uz = (bz - az) / len;
            const sd = rnd() < 0.5 ? 1 : -1;
            const x = ax + ux * s - uz * sd * (w / 2 + 0.7),
              z = az + uz * s + ux * sd * (w / 2 + 0.7);
            const ang = Math.atan2(uz * sd, -ux * sd); // arm points over the road
            lamps.push(place(x, 0, z, ang, 1, 1, 1));
            if (rnd() < 0.35) {
              const tx = x + ux * 6,
                tz = z + uz * 6;
              trunk(tx, tz, forest.street(tx, tz, rnd, ang));
            }
          }
      }
    }
    if (rg.length) {
      const rm = new THREE.Mesh(mergeGeometries(rg), roadMat);
      rm.receiveShadow = true;
      g.add(rm);
    }
    const veh: { x: number; z: number; ang: number; kind: VehicleKind }[] = [];
    // v21.5 walk-up realism + enterable ground floors
    const BB = td.b
      .filter(b => b.p.length >= 3)
      .map(b => {
        const xs = b.p.map(p => p[0]),
          zs = b.p.map(p => p[1]);
        return { p: b.p, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
      });
    const inB = (x: number, z: number) =>
      BB.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && pip([x, z], b.p));
    const brickG: THREE.BufferGeometry[] = [],
      vsG: THREE.BufferGeometry[] = [],
      tileG: THREE.BufferGeometry[][] = ARCADE_MATS.map(() => []);
    // v23.3 footprints of this tile and its neighbours (already fetched), to reject nested / blocked doors
    const [ktx, ktz] = key.split('_').map(Number);
    const near = [-1, 0, 1].flatMap(i =>
      [-1, 0, 1].flatMap(j =>
        (this.data.get(ktx + i + '_' + (ktz + j))?.b || [])
          .filter(o => o.p.length >= 3)
          .map(o => {
            const xs = o.p.map(q => q[0]),
              zs = o.p.map(q => q[1]);
            return { p: o.p, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
          }),
      ),
    );
    const otherAt = (x: number, z: number, self: V2[]) =>
      near.some(o => o.p !== self && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && pip([x, z], o.p));
    // v23.3 enterable buildings (own random stream so the rest of the tile keeps its deterministic sequence)
    const er = seeded('dt23e:' + key);
    const enter: DEnter[] = [];
    let nB = 0;
    /** points just outside each street door: keep parked scooters out of the doorway */
    const doorOut: V2[] = [];
    let stairs = 0;
    const local = (gs: THREE.BufferGeometry[], m: THREE.Matrix4, into: THREE.BufferGeometry[]) =>
      gs.forEach(q => into.push(q.applyMatrix4(m)));
    /**
     * vertical wall quad p→q between y0 and y1 whose lit side faces `face` (x, z). v23.3: the triangle order follows
     * the facing side, so walls render from outside whatever the winding of the OSM ring (single-sided materials).
     */
    const wallQuad = (
      p: V2,
      q: V2,
      y0: number,
      y1: number,
      uv: [number, number, number, number],
      face: V2,
      hex: number,
      jitter: number,
    ) => {
      const pg = new THREE.BufferGeometry();
      pg.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([p[0], y0, p[1], q[0], y0, q[1], q[0], y1, q[1], p[0], y1, p[1]], 3),
      );
      const [u0, u1, v0, v1] = uv;
      pg.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v0, u1, v0, u1, v1, u0, v1], 2));
      const [fx, fz] = face;
      pg.setAttribute('normal', new THREE.Float32BufferAttribute([fx, 0, fz, fx, 0, fz, fx, 0, fz, fx, 0, fz], 3));
      // front face of (p, q, q-top) points to (-(qz - pz), qx - px)
      const front = -(q[1] - p[1]) * fx + (q[0] - p[0]) * fz;
      pg.setIndex(front >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      return paint(pg, hex, jitter);
    };
    for (let bi = 0; bi < td.b.length; bi++) {
      await breathe();
      const b = td.b[bi];
      const pts = b.p;
      if (pts.length < 3) continue;
      let A = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i],
          c = pts[(i + 1) % pts.length];
        A += a[0] * c[1] - c[0] * a[1];
      }
      if (Math.abs(A / 2) < 12 || Math.abs(A / 2) > 8000) continue;
      const big = Math.abs(A / 2) > 1500;
      // v24.19 no sticks: however many storeys the data asks for, a narrow footprint cannot carry them
      const lvMax = Math.max(2, Math.floor(Math.sqrt(Math.abs(A / 2)) / 1.5) + 1);
      const lv = Math.max(1, Math.min(14, lvMax, b.l || (big ? 6 + Math.floor(rnd() * 4) : 3 + Math.floor(rnd() * 3))));
      const h = GF + (lv - 1) * FH;
      const tint = WALLTINT[Math.floor(rnd() * WALLTINT.length)];
      const awn = AWN[Math.floor(rnd() * AWN.length)];
      nB++;
      let ent =
        enter.length < ENTER_CAP
          ? this.planEnter(
              key,
              bi,
              pts,
              Math.abs(A / 2),
              lv,
              h,
              er,
              specialKind(b.k, b.s, b.n),
              (x, z) => !otherAt(x, z, pts),
            )
          : null;
      // not when the outline sits inside another one (overlapping OSM parts) or the door opens into a neighbour
      if (
        ent &&
        (otherAt(ent.c[0], ent.c[1], pts) ||
          otherAt(ent.door.p[0] + ent.U[1] * 0.8, ent.door.p[1] - ent.U[0] * 0.8, pts) ||
          otherAt(ent.door.p[0] - ent.U[1] * 0.8, ent.door.p[1] + ent.U[0] * 0.8, pts))
      )
        ent = null;
      const plaster = PLASTER[Math.floor(er() * PLASTER.length)];
      if (ent) {
        enter.push(ent);
        // tiled floor over the whole footprint (one style per building)
        const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));
        const fl = new THREE.ShapeGeometry(sh);
        fl.rotateX(-Math.PI / 2);
        fl.translate(0, 0.03, 0);
        tileG[Math.floor(er() * tileG.length)].push(worldUV(fl, 1));
      }
      let s0 = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i],
          c = pts[(i + 1) % pts.length];
        const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (L < 0.05) continue;
        const ux = (c[0] - a[0]) / L,
          uz = (c[1] - a[1]) / L;
        let nx = uz,
          nz = -ux;
        const mx = (a[0] + c[0]) / 2,
          mz = (a[1] + c[1]) / 2;
        if (pip([mx + nx * 0.3, mz + nz * 0.3], pts)) ((nx = -nx), (nz = -nz));
        const rdE = this.roadDist(mx + nx * 3, mz + nz * 3);
        const angE = Math.atan2(nx, nz),
          XX = nz,
          XZ = -nx; // local +x in world
        const isDoor = !!ent && ent.edge === i;
        // street wall: v23.3 split around the doorway of an enterable building
        const runs: [V2, V2][] = isDoor
          ? [
              [[a[0], a[1]], ent!.door.a],
              [ent!.door.c, [c[0], c[1]]],
            ]
          : [
              [
                [a[0], a[1]],
                [c[0], c[1]],
              ],
            ];
        for (const [p, q] of runs) {
          const seg: Seg = { a: p, b: q };
          segs.push(seg);
          this.d.addSeg(seg);
        }
        // rear light-well / back alley side: stairs, lean-tos, ACs, coloured cages, peeled brick.
        // v24.6 not on a wall that faces a neighbour across a 防火巷 (a footprint within 2.2 m): nobody sees it from
        // the street or from above, and dense blocks would otherwise pay for thousands of hidden cages
        const facing = !inB(mx + nx * 1.2, mz + nz * 1.2) && !inB(mx + nx * 2.2, mz + nz * 2.2);
        if (rdE > 3 && L >= 3.5 && facing) {
          const M0 = place(mx, 0, mz, angE, 1, 1, 1);
          const free = (lz: number) => !inB(mx + nx * lz, mz + nz * lz);
          if (lv >= 3 && stairs < 8 && L >= 4.5 && rnd() < 0.18 && free(1.5) && free(3)) {
            stairs++;
            local(stair(Math.min(lv - 1, 6), GF, FH, rnd), M0, misc);
          } else if (rnd() < 0.35 && free(1.2) && free(2.2)) local(leanTo(Math.min(L, 6), 2.2, 2.6, rnd), M0, metal);
          const nb = Math.max(1, Math.round(L / 3.4));
          for (let k = 0; k < nb; k++) {
            const lx = (k + 0.5 - nb / 2) * (L / nb);
            for (let f = 1; f < lv; f++) {
              const y = GF + (f - 1) * FH;
              if (rnd() < 0.22) local(ac(lx + 0.6, y + 0.9), M0, misc);
              if (rnd() < 0.4)
                cagesC.push([
                  place(mx + XX * lx, y + 0.15, mz + XZ * lx, angE, (L / nb) * 0.9, FH - 0.4, 0.45),
                  [0xb0ffc0, 0xffb890, 0xffffff, 0xd0e8ff][Math.floor(rnd() * 4)],
                ]);
              if (rnd() < 0.07) local(brickPatch(lx, y + 1.4, rnd), M0, brickG);
            }
          }
        }
        // wall quads: ground band (shutters) + upper floors (stained walk-up bays)
        const gH = Math.min(GF, h);
        const uAt = (q: V2) => (s0 + Math.hypot(q[0] - a[0], q[1] - a[1])) / 3.6;
        const out: V2 = [nx, nz];
        if (isDoor) {
          const [d0, d1] = [ent!.door.a, ent!.door.c];
          gr.push(wallQuad([a[0], a[1]], d0, 0, gH, [uAt(a), uAt(d0), 0, 1], out, tint, 0.06));
          gr.push(wallQuad(d1, [c[0], c[1]], 0, gH, [uAt(d1), uAt(c), 0, 1], out, tint, 0.06));
          gr.push(wallQuad(d0, d1, DOOR_H, gH, [uAt(d0), uAt(d1), DOOR_H / GF, 1], out, tint, 0.06));
        } else gr.push(wallQuad([a[0], a[1]], [c[0], c[1]], 0, gH, [uAt(a), uAt(c), 0, 1], out, tint, 0.06));
        if (h > GF) {
          // v24.18 about one building in four: red brick or small white tile, picked by position so rnd() is untouched
          const ah = Math.abs(Math.sin(pts[0][0] * 12.9898 + pts[0][1] * 78.233) * 43758.5453) % 1;
          const list = ah < 0.25 ? upAlt : up,
            ut = ah < 0.14 ? 0xc06a4c : ah < 0.25 ? 0xf8f6ee : tint;
          list.push(wallQuad([a[0], a[1]], [c[0], c[1]], GF, h, [uAt(a), uAt(c), 0, (h - GF) / FH], out, ut, 0.06));
        }
        if (ent) {
          // v23.3 plastered inner face, inset so it never fights the outer one; split around the doorway too
          const inn: V2 = [-nx, -nz];
          const ins = (q: V2): V2 => [q[0] - nx * INSET, q[1] - nz * INSET];
          const iq = (p: V2, q: V2, y0: number, y1: number) =>
            misc.push(wallQuad(ins(p), ins(q), y0, y1, [0, 1, 0, 1], inn, plaster, 0.03));
          if (isDoor) {
            const [d0, d1] = [ent.door.a, ent.door.c];
            iq([a[0], a[1]], d0, 0, gH);
            iq(d1, [c[0], c[1]], 0, gH);
            iq(d0, d1, DOOR_H, gH);
            // painted door frame + threshold (homes: red, shops: orange), like the core doors
            const fc = ent.use === 'home' ? 0xc0392b : 0xe8681c;
            const M = place(ent.door.p[0], 0, ent.door.p[1], angE, 1, 1, 1);
            local(
              [
                box(0.14, 2.45, 0.34, -DOOR_W / 2 - 0.07, 1.225, 0, fc),
                box(0.14, 2.45, 0.34, DOOR_W / 2 + 0.07, 1.225, 0, fc),
                box(DOOR_W + 0.28, 0.16, 0.34, 0, DOOR_H + 0.03, 0, fc),
                box(DOOR_W + 0.2, 0.06, 0.6, 0, 0.03, 0, 0xd8d2c4),
              ],
              M,
              misc,
            );
            doorOut.push([ent.door.p[0] + nx * 1.2, ent.door.p[1] + nz * 1.2]);
          } else iq([a[0], a[1]], [c[0], c[1]], 0, gH);
        }
        s0 += L;
        // street-facing edge → walk-up dressing
        const rd = this.roadDist(mx + nx * 3, mz + nz * 3);
        if (L < 3.5 || rd > 3) continue;
        fronts.push({ x: mx + nx * 1.5, z: mz + nz * 1.5, nx, nz, ux, uz, len: L });
        const ang = Math.atan2(nx, nz);
        const bays = Math.max(1, Math.round(L / 3.4)),
          bw = L / bays;
        for (let k = 0; k < bays; k++) {
          const bx = a[0] + ux * (k + 0.5) * bw,
            bz = a[1] + uz * (k + 0.5) * bw;
          // v21.5 vertical sign blades, split ACs, peeled render on the street face
          {
            const M1 = place(bx, 0, bz, ang, 1, 1, 1);
            if (k % 2 === 0 && rnd() < 0.3)
              vsG.push(vsign(bw / 2 - 0.15, GF + 1.6, Math.floor(rnd() * VSN)).applyMatrix4(M1));
            // v24.12 more blades, chosen by position: rnd() must keep its sequence, because tile garrisons and
            // everything else built after this draw from it (an extra rnd() here moved a soldier onto the spawn)
            else if (k % 2 === 0) {
              const hb = Math.abs(Math.sin(bx * 12.9898 + bz * 78.233) * 43758.5453) % 1;
              if (hb < 0.17) vsG.push(vsign(bw / 2 - 0.15, GF + 1.6, Math.floor((hb / 0.17) * VSN)).applyMatrix4(M1));
            }
            for (let f = 1; f < lv; f++) {
              if (rnd() < 0.18) local(ac(-bw / 2 + 0.6, GF + (f - 1) * FH + 0.5), M1, misc);
              if (rnd() < 0.05) local(brickPatch((rnd() - 0.5) * bw, GF + (f - 1) * FH + 1.6, rnd), M1, brickG);
            }
          }
          // ground: awning (teal/red corrugated, rust underside) + faded signboard
          if (rnd() < 0.8) {
            const aw = box(bw * 0.98, 0.04, 1.3, 0, 0, 0.65, rnd() < 0.7 ? awn : AWN[Math.floor(rnd() * AWN.length)]);
            aw.rotateX(0.18);
            const un = box(bw * 0.96, 0.01, 1.28, 0, -0.03, 0.65, 0xb2622c);
            un.rotateX(0.18);
            for (const gg of [aw, un]) {
              gg.applyMatrix4(place(bx, 2.75, bz, ang, 1, 1, 1));
              metal.push(gg);
            }
          }
          if (rnd() < 0.55) {
            const si = Math.floor(rnd() * SIGNS.length);
            const sg = new THREE.PlaneGeometry(bw * 0.92, 0.85);
            const u0 = (si % SA) / SA,
              v0 = 1 - (Math.floor(si / SA) * 128 + 98) / 384,
              v1 = 1 - (Math.floor(si / SA) * 128 + 30) / 384;
            const uv = sg.attributes.uv as THREE.BufferAttribute;
            for (let j = 0; j < 4; j++) uv.setXY(j, u0 + uv.getX(j) / SA, v0 + uv.getY(j) * (v1 - v0));
            sg.applyMatrix4(place(bx, GF - 0.42, bz, ang, 1, 1, 1));
            sg.translate(nx * 0.06, 0, nz * 0.06);
            signs.push(sg);
          }
          // upper floors: 鐵窗 cages (same column usually caged all the way up), plants, laundry
          const colCage = rnd() < 0.8;
          for (let f = 1; f < lv; f++) {
            const y = GF + (f - 1) * FH + 0.15;
            if (!(colCage ? rnd() < 0.9 : rnd() < 0.25)) continue;
            const dep = 0.55 + rnd() * 0.35;
            cages.push(place(bx, y, bz, ang, bw * 0.96, FH - 0.35, dep));
            if (rnd() < 0.4)
              for (let p = 0; p < 1 + rnd() * 3; p++)
                plants.push(
                  place(
                    bx + ux * (rnd() - 0.5) * bw * 0.8 + nx * dep * 0.8,
                    y + 0.25 + rnd() * 0.2,
                    bz + uz * (rnd() - 0.5) * bw * 0.8 + nz * dep * 0.8,
                    rnd() * 6,
                    1 + rnd(),
                    0.8 + rnd() * 0.8,
                    1 + rnd(),
                  ),
                );
            if (rnd() < 0.3)
              for (let p = 0; p < 2 + rnd() * 3; p++)
                cloth.push([
                  place(
                    bx + ux * (p * 0.45 - 0.6) + nx * dep * 0.45,
                    y + FH - 1.2,
                    bz + uz * (p * 0.45 - 0.6) + nz * dep * 0.45,
                    ang,
                    1,
                    0.8 + rnd() * 0.6,
                    1,
                  ),
                  CLOTHC[Math.floor(rnd() * CLOTHC.length)],
                ]);
          }
          // parked scooters on the arcade/kerb line
          if (rnd() < 0.5)
            for (let p = 0; p < 2 + rnd() * 3; p++)
              veh.push({
                x: bx + ux * (p * 0.75 - 1) + nx * (2.2 + rnd() * 0.3),
                z: bz + uz * (p * 0.75 - 1) + nz * (2.2 + rnd() * 0.3),
                ang: ang + (rnd() - 0.5) * 0.2,
                kind: 'scooter',
              });
        }
      }
      // roof slab + parapet tint; rooftop tin additions on some
      const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));
      const rf = new THREE.ShapeGeometry(sh);
      rf.rotateX(-Math.PI / 2);
      rf.translate(0, h, 0);
      const rm = pickRoofMat(rnd);
      (roofB.get(rm) || roofB.set(rm, []).get(rm)!).push(rf.toNonIndexed());
      const rcls = roofClass(pts, lv, (b.k || '') + ' ' + (b.n || ''));
      if (roofs < 40 && rcls !== 'none') {
        roofs++;
        const rg2 = new THREE.Group();
        placeRooftop(rg2, pts, h, rnd, pip as any, rcls);
        detail.add(rg2);
      }
      dressRoof(detail, pts, h, rnd, pip as any, true, roofKit);
    }
    // kerbside cars / taxis / kei trucks
    for (const r of td.r) {
      const w = RW[r.t.replace('_link', '')] ?? 3;
      if (w < 6 || r.p.length < 2) continue;
      if (rnd() > 0.45) continue;
      const i = Math.floor(rnd() * (r.p.length - 1));
      const [a, b] = [r.p[i], r.p[i + 1]];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 8) continue;
      const ux = (b[0] - a[0]) / L,
        uz = (b[1] - a[1]) / L;
      const s = 3 + rnd() * (L - 6);
      const x = a[0] + ux * s - uz * (w / 2 - 1.2),
        z = a[1] + uz * s + ux * (w / 2 - 1.2);
      if (this.d.inCore(x, z)) continue;
      const kr = rnd();
      veh.push({ x, z, ang: Math.atan2(ux, uz), kind: kr < 0.35 ? 'taxi' : kr < 0.55 ? 'truck' : 'car' });
    }
    // v21.4 parks inside this tile: dense mixed Taipei park trees (big 榕樹 canopies), shrubs, benches, lamps
    const T = this.ix.T;
    for (const pk of this.ix.park) {
      let n = 0;
      for (let s = 0; s < 70 && n < 34; s++) {
        const x = cx + (rnd() - 0.5) * T,
          z = cz + (rnd() - 0.5) * T;
        if (!pip([x, z], pk.p) || this.d.inCore(x, z)) continue;
        n++;
        const v = rnd();
        if (v < 0.6) trunk(x, z, forest.park(x, z, rnd).r);
        else if (v < 0.85) forest.add('shrub', x, z, rnd() * 6, 0.8 + rnd() * 0.6, 0, 0.85 + rnd() * 0.3);
        else if (v < 0.93) forest.add('bench', x, z, rnd() * 6);
        else forest.add('plamp', x, z, 0);
      }
    }
    const add = (gs: THREE.BufferGeometry[], mat: THREE.Material, par: THREE.Object3D, shadow = true) => {
      if (!gs.length) return;
      const m = new THREE.Mesh(mergeGeometries(gs), mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      par.add(m);
    };
    for (const [m, arr] of roofB) add(arr, m, g);
    add(roofKit.det, roofDetMat, detail);
    add(roofKit.conc, roofConc, detail);
    add(brickG, brickMat, detail, false);
    add(vsG, vsignMat, detail, false);
    tileG.forEach((gs, i) => add(gs, ARCADE_MATS[i], g, false));
    add(up, upperMat, g);
    add(upAlt, upperAltMat, g);
    add(gr, shutMat, g);
    add(misc, vcMat, g);
    add(metal, metalMat, detail, false);
    add(signs, signMat, detail, false);
    const inst = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      ms: THREE.Matrix4[],
      par: THREE.Object3D,
      cs?: number[],
    ) => {
      if (!ms.length) return;
      (geo as any).shared = true;
      const im = new THREE.InstancedMesh(geo, mat, ms.length);
      ms.forEach((m, i) => im.setMatrixAt(i, m));
      if (cs) cs.forEach((c, i) => im.setColorAt(i, col.setHex(c)));
      im.castShadow = false;
      par.add(im);
    };
    inst(CAGE, metalMat, cages, detail);
    inst(
      CAGE,
      metalMat,
      cagesC.map(c => c[0]),
      detail,
      cagesC.map(c => c[1]),
    );
    inst(PLANT, plantMat, plants, detail);
    inst(
      CLOTH,
      clothMat,
      cloth.map(c => c[0]),
      detail,
      cloth.map(c => c[1]),
    );
    inst(LAMP, lampMat, lamps, detail);
    forest.build(detail, true);
    // v23.3 keep parked scooters out of the street doors
    const vehOk = veh.filter(v => !doorOut.some(q => Math.hypot(v.x - q[0], v.z - q[1]) < 1.6));
    if (vehOk.length) {
      const vg = new THREE.Group();
      new VehicleSystem(vg as any).build(vehOk, mergeGeometries, rnd);
      detail.add(vg);
    }
    // v23.3 tile meshes take part in the building cut (occlusion.ts) while the player is inside one of them
    g.traverse(o => {
      const m = (o as THREE.Mesh).material;
      if (m) for (const x of Array.isArray(m) ? m : [m]) x.userData.cut = true;
    });
    this.d.scene.add(g);
    void m4;
    return {
      key,
      cx,
      cz,
      g,
      detail,
      segs,
      info: { key, cx, cz, fronts, roads: td.r, rnd: seeded('dtL:' + key), enter, nB },
    };
  }
  // ---------- v24.15 the walk-in temple ----------
  /** what can be searched in the landmarks (world positions), for the game to turn into containers */
  landConts: TempleCont[] = [];
  templeStats: { tris: number; meshes: number } | null = null;
  private templeAt: V2 | null = null;
  private walkIns: WalkIn[] = [];
  /** inside the temple walls: lifts the roofs off, as inside any other building */
  landmarkCut(x: number, z: number) {
    for (const w of this.walkIns) {
      const lx = x - w.O[0],
        lz = z - w.O[1];
      if (lx > w.ub[0] && lx < w.ub[1] && lz > w.ub[2] && lz < w.ub[3]) return { O: w.O, U: [1, 0] as V2, ub: w.ub };
    }
    const t = this.templeAt;
    if (!t || Math.abs(x - t[0]) > 16.2 || Math.abs(z - t[1]) > 19.6) return null;
    return { O: t, U: [1, 0] as V2, ub: [-16.6, 16.6, -20, 20] as [number, number, number, number] };
  }
  /** under one of the temple's roofs (the courtyard is open to the sky) */
  landmarkRoofAt(x: number, z: number) {
    for (const w of this.walkIns) if (w.roofAt(x - w.O[0], z - w.O[1])) return true;
    const t = this.templeAt;
    if (!t) return false;
    const dx = Math.abs(x - t[0]),
      lz = z - t[1];
    return (
      (dx <= 13 && lz >= 12 && lz <= 19.6) || // front hall
      (dx >= 12.4 && dx <= 16 && Math.abs(lz) <= 12) || // side corridors
      (dx <= 9.8 && lz >= -6.8 && lz <= 5.8) || // main hall
      (dx <= 14 && lz >= -19 && lz <= -11.6) // rear hall
    );
  }
  // ---------- cheap landmarks ----------
  /** footprints the core map must leave empty (its own generic boxes are replaced by the landmark) */
  static rects(ix: DIndex) {
    const R: Record<string, [number, number, number, number]> = {
      temple: [-16, -19, 16, 19],
      redhouse: [-26, -12, 42, 12],
      bopiliao: [-27, -5, 27, 5],
    };
    return ix.landmarks
      .filter(l => R[l.kind])
      .map(l => {
        const r = R[l.kind];
        return [l.x + r[0], l.z + r[1], l.x + r[2], l.z + r[3]] as [number, number, number, number];
      });
  }
  /** v24.17 where no vehicle, wreck or street lamp belongs: inside the walk-in landmarks and on the temple square */
  static keepOut(ix: DIndex) {
    const out = District.rects(ix).map(
      r => [r[0] - 1.2, r[1] - 1.2, r[2] + 1.2, r[3] + 1.2] as [number, number, number, number],
    );
    for (const l of ix.landmarks) if (l.kind === 'temple') out.push([l.x - 18, l.z + 19, l.x + 26, l.z + 38]);
    return out;
  }
  /** v24.15 the square in front of a landmark temple: a building whose centre is here is not placed in the world */
  static squares(ix: DIndex) {
    const out: [number, number, number, number][] = [];
    for (const l of ix.landmarks) {
      if (l.kind === 'temple') out.push([l.x - 20, l.z + 19, l.x + 20, l.z + 36]);
      // 剝皮寮: the street in front of the arcade and the lane behind the last units
      if (l.kind === 'bopiliao') out.push([l.x - 20, l.z, l.x + 12, l.z + 30], [l.x + 20, l.z - 14, l.x + 34, l.z - 4]);
    }
    return out;
  }
  private buildLandmarks() {
    for (const l of this.ix.landmarks) {
      const g = new THREE.Group();
      g.name = 'landmark:' + l.kind;
      g.position.set(l.x, 0, l.z);
      const M = (c: number, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
      const seg = (pts: V2[]) => {
        for (let i = 0; i < pts.length; i++)
          this.d.addSeg({
            a: [l.x + pts[i][0], l.z + pts[i][1]],
            b: [l.x + pts[(i + 1) % pts.length][0], l.z + pts[(i + 1) % pts.length][1]],
          });
      };
      if (l.kind === 'temple') {
        // 龍山寺: red-pillared halls on a stone base, stacked swallowtail roofs (orange glazed tile)
        // v21.5 old 榕樹 shading the temple square (廟埕) in front, with stools under them
        {
          const f = new Forest();
          let sd = 11;
          const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
          // the axis from the arch to the front door stays open
          for (const [x, z] of [
            [-12, 27],
            [13, 26],
            [19, 34],
          ]) {
            f.add('banyan', x, z, rr() * 6, 1.2 + rr() * 0.3, 0, 0.9 + rr() * 0.2);
            this.d.addSeg({ a: [l.x + x - 0.9, l.z + z], b: [l.x + x + 0.9, l.z + z] });
            this.d.addSeg({ a: [l.x + x, l.z + z - 0.9], b: [l.x + x, l.z + z + 0.9] });
            f.add('bench', x + 2.2, z, 1.57);
          }
          f.build(g);
        }
        // v24.15 a walled complex you can walk into, not a solid block
        const T = buildTemple(g, l.x, l.z, (p, q) =>
          this.d.addSeg({ a: [l.x + p[0], l.z + p[1]], b: [l.x + q[0], l.z + q[1]] }),
        );
        for (const c of T.conts) this.landConts.push({ ...c, p: [l.x + c.p[0], l.z + c.p[1]] });
        this.templeAt = [l.x, l.z];
        this.templeStats = T.stats;
      } else if (l.kind === 'redhouse' || l.kind === 'bopiliao') {
        // v24.17 walk-in, searchable, built from photos
        const build = l.kind === 'redhouse' ? buildRedHouse : buildBopiliao;
        const R = build(g, (p, q) => this.d.addSeg({ a: [l.x + p[0], l.z + p[1]], b: [l.x + q[0], l.z + q[1]] }));
        for (const c of R.conts) this.landConts.push({ ...c, p: [l.x + c.p[0], l.z + c.p[1]] });
        this.walkIns.push({ ...R.walk, O: [l.x, l.z] });
      }
      if (l.kind !== 'redhouse' && l.kind !== 'bopiliao')
        g.traverse(o => {
          (o as THREE.Mesh).castShadow = true;
          (o as THREE.Mesh).receiveShadow = true;
        });
      this.d.scene.add(g);
    }
  }
}

// ---- light 鐵窗 dressing for core walk-ups (merged per building, lives in b.roof so cutaway hides it) ----
const grilleTex = canvasTex(128, 128, c => {
  c.clearRect(0, 0, 128, 128);
  c.fillStyle = '#4a5450';
  for (let x = 2; x < 128; x += 14) c.fillRect(x, 0, 3, 128);
  for (const y of [2, 40, 122]) c.fillRect(0, y, 128, 5);
  c.strokeStyle = '#4a5450';
  c.lineWidth = 3;
  for (let x = 0; x < 128; x += 28) {
    c.beginPath();
    c.arc(x + 14, 40, 12, Math.PI, 0);
    c.stroke();
  }
});
grilleTex.wrapS = THREE.RepeatWrapping;
const grilleMat = new THREE.MeshStandardMaterial({
  map: grilleTex,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
  roughness: 0.6,
  metalness: 0.4,
});
const qd = (P: number[], uvs: number[]) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
};
/** Adds 鐵窗 cages, plants and laundry to the street-facing upper floors of one core building. */
export function dressWalkup(
  pts: [number, number][],
  h: number,
  roadDist: (x: number, z: number) => number,
  rnd: () => number,
  parent: THREE.Object3D,
) {
  const lv = Math.round((h - GF) / FH) + 1;
  if (lv < 2 || lv > 9) return;
  const gr: THREE.BufferGeometry[] = [],
    so: THREE.BufferGeometry[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      c = pts[(i + 1) % pts.length];
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (L < 3.5) continue;
    const ux = (c[0] - a[0]) / L,
      uz = (c[1] - a[1]) / L;
    let nx = uz,
      nz = -ux;
    const mx = (a[0] + c[0]) / 2,
      mz = (a[1] + c[1]) / 2;
    if (pip([mx + nx * 0.3, mz + nz * 0.3], pts)) ((nx = -nx), (nz = -nz));
    if (roadDist(mx + nx * 3, mz + nz * 3) > 3) continue;
    const bays = Math.max(1, Math.round(L / 3.4)),
      bw = L / bays;
    for (let k = 0; k < bays; k++) {
      if (rnd() < 0.2) continue;
      const colCage = rnd() < 0.8;
      for (let f = 1; f < lv; f++) {
        if (!(colCage ? rnd() < 0.9 : rnd() < 0.25)) continue;
        const y0 = GF + (f - 1) * FH + 0.15,
          y1 = y0 + FH - 0.4;
        const dep = 0.55 + rnd() * 0.35;
        const s = k * bw + 0.06,
          e = (k + 1) * bw - 0.06;
        const P = (t: number, o: number, y: number) => [a[0] + ux * t + nx * o, y, a[1] + uz * t + nz * o];
        const U = (e - s) / 1.2;
        gr.push(qd([...P(s, dep, y0), ...P(e, dep, y0), ...P(e, dep, y1), ...P(s, dep, y1)], [0, 0, U, 0, U, 1, 0, 1]));
        for (const t of [s, e])
          gr.push(
            qd([...P(t, 0, y0), ...P(t, dep, y0), ...P(t, dep, y1), ...P(t, 0, y1)], [0, 0, dep, 0, dep, 1, 0, 1]),
          );
        // teal roof (sloping out) over rust underside, rust floor lip
        const yr = y1 + 0.12;
        so.push(
          paint(
            qd(
              [
                ...P(s, 0, yr + 0.08),
                ...P(s, dep + 0.1, yr - 0.04),
                ...P(e, dep + 0.1, yr - 0.04),
                ...P(e, 0, yr + 0.08),
              ],
              [0, 0, 1, 0, 1, 1, 0, 1],
            ),
            0x3e8f8a,
          ),
        );
        so.push(
          paint(
            qd(
              [
                ...P(s, 0, yr + 0.06),
                ...P(e, 0, yr + 0.06),
                ...P(e, dep + 0.1, yr - 0.06),
                ...P(s, dep + 0.1, yr - 0.06),
              ],
              [0, 0, 1, 0, 1, 1, 0, 1],
            ),
            0xb2622c,
          ),
        );
        so.push(
          paint(
            qd([...P(s, 0, y0), ...P(s, dep, y0), ...P(e, dep, y0), ...P(e, 0, y0)], [0, 0, 1, 0, 1, 1, 0, 1]),
            0x8a5a36,
          ),
        );
        if (rnd() < 0.35) {
          const pl = new THREE.OctahedronGeometry(0.3, 0);
          const t = s + rnd() * (e - s);
          const p = P(t, dep * 0.7, y0 + 0.3);
          pl.scale(1 + rnd(), 1 + rnd(), 1 + rnd());
          pl.translate(p[0], p[1], p[2]);
          so.push(paint(pl, 0x4f8a3a, 0.1));
        }
        if (rnd() < 0.25)
          for (let p = 0; p < 2 + rnd() * 3; p++) {
            const t = s + 0.3 + p * 0.45;
            if (t > e - 0.2) break;
            const hh = 0.5 + rnd() * 0.4;
            const q = P(t, dep * 0.45, y1 - 0.25);
            const cl = qd(
              [
                q[0] - ux * 0.2,
                q[1] - hh,
                q[2] - uz * 0.2,
                q[0] + ux * 0.2,
                q[1] - hh,
                q[2] + uz * 0.2,
                q[0] + ux * 0.2,
                q[1],
                q[2] + uz * 0.2,
                q[0] - ux * 0.2,
                q[1],
                q[2] - uz * 0.2,
              ],
              [0, 0, 1, 0, 1, 1, 0, 1],
            );
            so.push(paint(cl, CLOTHC[Math.floor(rnd() * CLOTHC.length)]));
          }
      }
    }
  }
  const nonIdx = (gs: THREE.BufferGeometry[]) => gs.map(g => (g.index ? g.toNonIndexed() : g));
  if (gr.length) parent.add(new THREE.Mesh(mergeGeometries(nonIdx(gr)), grilleMat));
  if (so.length) {
    const m = new THREE.Mesh(mergeGeometries(nonIdx(so)), clothSolidMat);
    parent.add(m);
  }
}
const clothSolidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
