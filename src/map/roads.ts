// Streamed road detail (v19): markings, junction furniture, surface wear and war damage, built per 200 m tile
// from offline-preprocessed OSM tiles (scripts/tiles.mjs). 3×3 tiles around the player are kept; the rest is disposed.
// Each tile is deterministic from its seed; player changes (looted wrecks, cleared barriers) are stored separately.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLYPHS, GMAT, atlas } from './roadglyphs';
import { PAVE, worldUV } from './paving';
import { Forest } from './trees';
import { clearRoadTiles, readRoadTiles, writeRoadTiles } from '../systems/save';
type Seg = [number, number, number, number, number, string, number, string, number?, number?];
type Node = [number, number, number, [number, number, number][], number?];
type TileData = { tx: number; tz: number; seed: number; segs: Seg[]; nodes: Node[]; clip?: [number, number, number][] };
export type Wreck = {
  id: string;
  key: string;
  x: number;
  z: number;
  kind: 'car' | 'bus';
  looted: boolean;
  g: THREE.Object3D;
};
export type Light = { x: number; z: number; ax: number; lamps: THREE.Mesh[] };
type Tile = {
  key: string;
  g: THREE.Group;
  lights: Light[];
  wrecks: Wreck[];
  barriers: { id: string; key: string; x: number; z: number; g: THREE.Object3D }[];
  geos: THREE.BufferGeometry[];
};
export type RoadDeps = {
  scene: THREE.Scene;
  base: string;
  bldAt: (x: number, z: number) => any;
  power: () => boolean;
  war: () => boolean;
  addSeg?: (s: { a: [number, number]; b: [number, number]; h?: number }) => void;
  removeSeg?: (s: any) => void;
};
// v21.4 raised-walk height lookup (2 m cells) so feet stand on the 15 cm sidewalks, per-tile ownership for unload
type WR = { x: number; z: number; c: number; s: number; hl: number; hw: number; h: number; k: string };
const WALK = new Map<string, WR[]>();
const WOWN = new Map<string, Set<string>>();
const TSEG = new Map<string, any[]>();
function addWalk(r: WR) {
  const e = Math.hypot(r.hl, r.hw),
    own = WOWN.get(r.k) || WOWN.set(r.k, new Set()).get(r.k)!;
  for (let i = Math.floor((r.x - e) / 2); i <= Math.floor((r.x + e) / 2); i++)
    for (let j = Math.floor((r.z - e) / 2); j <= Math.floor((r.z + e) / 2); j++) {
      const ck = i + ',' + j;
      (WALK.get(ck) || WALK.set(ck, []).get(ck)!).push(r);
      own.add(ck);
    }
}
/** height of the paved walk under (x, z), 0 on the road / ground */
export function walkH(x: number, z: number) {
  const a = WALK.get(Math.floor(x / 2) + ',' + Math.floor(z / 2));
  if (!a) return 0;
  for (const r of a) {
    const dx = x - r.x,
      dz = z - r.z;
    if (Math.abs(dx * r.c + dz * r.s) < r.hl && Math.abs(-dx * r.s + dz * r.c) < r.hw) return r.h;
  }
  return 0;
}
const M = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({
    color: c,
    roughness: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    ...o,
  });
const MAT = {
  white: M(0xe9e7df),
  yellow: M(0xe2b228),
  red: M(0xc0302a),
  busred: M(0x8a3a30, { roughness: 0.9 }),
  curbR: new THREE.MeshStandardMaterial({ color: 0xb8302a, roughness: 0.8 }),
  curbY: new THREE.MeshStandardMaterial({ color: 0xd8a828, roughness: 0.8 }),
  green: M(0x2f7a4a, { roughness: 0.7 }),
  dark: M(0x1b1c1e, { roughness: 0.95 }),
  patch: M(0x3a3b3e, { roughness: 0.9 }),
  patch2: M(0x55565a),
  crack: M(0x121212),
  puddle: new THREE.MeshStandardMaterial({
    color: 0x1a2230,
    roughness: 0.04,
    metalness: 0.6,
    transparent: true,
    opacity: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  }),
  curb: new THREE.MeshStandardMaterial({ color: 0x9a988f, roughness: 0.9 }),
  curbG: PAVE.curb,
  walk: PAVE.walk,
  tactile: PAVE.tactile,
  manhole: PAVE.manhole,
  pit: PAVE.pit,
  leaf: new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 0.9, flatShading: true }),
  pole: new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.6, metalness: 0.4 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xe07a20, roughness: 0.6 }),
  mirror: new THREE.MeshStandardMaterial({ color: 0xc8d4dc, roughness: 0.05, metalness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.9 }),
  wire: new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.7, roughness: 0.4 }),
  sand: new THREE.MeshStandardMaterial({ color: 0x8a7a54, roughness: 1 }),
  burnt: new THREE.MeshStandardMaterial({ color: 0x1e1a18, roughness: 1 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x5a3020, roughness: 1 }),
  crater: M(0x0e0d0c, { roughness: 1 }),
  rubble: new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 1 }),
  housing: new THREE.MeshStandardMaterial({ color: 0x24282a, roughness: 0.6 }),
  scoot: new THREE.MeshStandardMaterial({ color: 0x8a9aa8, roughness: 0.5 }),
};
const LAMP = {
  r: [new THREE.MeshStandardMaterial({ color: 0x3a1010, emissive: 0xff2010, emissiveIntensity: 0 }), 0xff2010],
  y: [new THREE.MeshStandardMaterial({ color: 0x3a3010, emissive: 0xffb000, emissiveIntensity: 0 }), 0xffb000],
  g: [new THREE.MeshStandardMaterial({ color: 0x103a20, emissive: 0x20ff80, emissiveIntensity: 0 }), 0x20ff80],
} as const;
// lamp materials per phase: shared so a single update drives every light
const LM = {
  r0: LAMP.r[0],
  y0: LAMP.y[0],
  g0: LAMP.g[0],
  r1: LAMP.r[0].clone(),
  y1: LAMP.y[0].clone(),
  g1: LAMP.g[0].clone(),
};
// v19.2 road paint per 道路交通標誌標線號誌設置規則: white / yellow / red, glyph atlas for 標字 and icons (white or yellow variant)
export class RoadTiles {
  size = 200;
  have = new Set<string>();
  tiles = new Map<string, Tile>();
  loading = new Map<string, symbol>();
  private wanted = new Set<string>();
  private retryAt = new Map<string, number>();
  // Failed construction may leave partial global registrations. Keep the key
  // quarantined until a page reload rather than repeating construction.
  private failedBuild = new Set<string>();
  cache = new Map<string, TileData>();
  state: Record<string, string[]> = {};
  cur = '';
  phase = 0;
  stats = { loads: 0, unloads: 0, built: 0 };
  constructor(public d: RoadDeps) {
    this.state = readRoadTiles();
  }
  async init() {
    const ix = await (await fetch(this.d.base + 'data/tiles/index.json')).json();
    this.size = ix.size;
    for (const k of ix.tiles) this.have.add(k);
  }
  reset() {
    this.state = {};
    clearRoadTiles();
    this.loading.clear();
    this.retryAt.clear();
    this.wanted.clear();
    for (const k of [...this.tiles.keys()]) this.unload(k);
    this.cur = '';
  }
  rebuild() {
    this.loading.clear();
    this.retryAt.clear();
    this.wanted.clear();
    for (const k of [...this.tiles.keys()]) this.unload(k);
    this.cur = '';
  }
  mark(key: string, id: string) {
    (this.state[key] ||= []).push(id);
    writeRoadTiles(this.state);
  }
  done(key: string, id: string) {
    return !!this.state[key]?.includes(id);
  }
  update(px: number, pz: number, dt: number) {
    const tx = Math.floor(px / this.size),
      tz = Math.floor(pz / this.size),
      ck = tx + '_' + tz;
    if (ck !== this.cur) {
      this.cur = ck;
      this.wanted = new Set<string>();
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) this.wanted.add(tx + i + '_' + (tz + j));
      for (const k of [...this.tiles.keys()]) if (!this.wanted.has(k)) this.unload(k);
      // Invalidate pending requests too. Their completion must not publish into a new generation.
      for (const k of this.loading.keys()) if (!this.wanted.has(k)) this.loading.delete(k);
      for (const k of this.retryAt.keys()) if (!this.wanted.has(k)) this.retryAt.delete(k);
    }
    // Retry failed fetches without requiring the player to cross another tile boundary.
    const now = performance.now();
    for (const k of this.wanted)
      if (
        this.have.has(k) &&
        !this.tiles.has(k) &&
        !this.loading.has(k) &&
        !this.failedBuild.has(k) &&
        now >= (this.retryAt.get(k) ?? 0)
      )
        this.load(k);
    // traffic-light cycle: 0-12 s axis A green, 12-15 amber, 15-27 axis B green, 27-30 amber; all dark after the blackout
    this.phase = (this.phase + dt) % 30;
    const on = this.d.power(),
      p = this.phase;
    const a = p < 12 ? 'g' : p < 15 ? 'y' : 'r',
      b = p < 15 ? 'r' : p < 27 ? 'g' : 'y';
    for (const [k, m] of [
      ['r0', a === 'r'],
      ['y0', a === 'y'],
      ['g0', a === 'g'],
      ['r1', b === 'r'],
      ['y1', b === 'y'],
      ['g1', b === 'g'],
    ] as const)
      (LM as any)[k].emissiveIntensity = on && m ? 2.2 : 0;
  }
  /** can a car moving along (ux,uz) proceed past a signalised junction? */
  green(ux: number, uz: number) {
    if (!this.d.power()) return true;
    const axA = Math.abs(ux) >= Math.abs(uz);
    const p = this.phase;
    return axA ? p < 13 : p >= 15 && p < 28;
  }
  lightsNear(x: number, z: number, r: number) {
    const o: Light[] = [];
    for (const t of this.tiles.values()) for (const l of t.lights) if (Math.hypot(l.x - x, l.z - z) < r) o.push(l);
    return o;
  }
  wreckNear(x: number, z: number, r = 2.6) {
    let b: Wreck | null = null,
      bd = r;
    for (const t of this.tiles.values())
      for (const w of t.wrecks) {
        const d = Math.hypot(w.x - x, w.z - z);
        if (d < bd) {
          bd = d;
          b = w;
        }
      }
    return b;
  }
  barrierAt(x: number, z: number, r = 1.2) {
    for (const t of this.tiles.values()) for (const b of t.barriers) if (Math.hypot(b.x - x, b.z - z) < r) return b;
    return null;
  }
  loot(w: Wreck) {
    if (w.looted) return false;
    w.looted = true;
    this.mark(w.key, w.id);
    w.g.traverse(o => {
      if ((o as any).userData.trunk) (o as THREE.Mesh).rotation.x = -1.1;
    });
    return true;
  }
  clear(key: string, id: string) {
    const t = this.tiles.get(key);
    if (!t) return;
    const i = t.barriers.findIndex(b => b.id === id);
    if (i < 0) return;
    t.g.remove(t.barriers[i].g);
    t.barriers.splice(i, 1);
    this.mark(key, id);
  }
  private async load(k: string) {
    const token = Symbol(k);
    this.loading.set(k, token);
    let building = false;
    try {
      let td = this.cache.get(k);
      if (!td) {
        const response = await fetch(this.d.base + `data/tiles/${k}.json`);
        if (!response.ok) throw new Error(`road tile request failed: ${response.status}`);
        td = await response.json();
      }
      if (this.loading.get(k) !== token) return;
      this.cache.set(k, td);
      if (!this.tiles.has(k)) {
        building = true;
        this.tiles.set(k, this.build(k, td));
        this.stats.loads++;
      }
      this.retryAt.delete(k);
    } catch (e) {
      if (this.loading.get(k) === token) {
        console.warn('tile', k, e);
        // A failed build may already have published geometry or colliders; do not retry it blindly.
        if (building) this.failedBuild.add(k);
        else this.retryAt.set(k, performance.now() + 1000);
      }
    } finally {
      if (this.loading.get(k) === token) this.loading.delete(k);
    }
  }
  private unload(k: string) {
    const t = this.tiles.get(k);
    this.loading.delete(k);
    if (!t) return;
    this.d.scene.remove(t.g);
    for (const ck of WOWN.get(k) || []) {
      const a = WALK.get(ck)?.filter(r => r.k !== k);
      if (a?.length) WALK.set(ck, a);
      else WALK.delete(ck);
    }
    WOWN.delete(k);
    for (const sg of TSEG.get(k) || []) this.d.removeSeg?.(sg);
    TSEG.delete(k);
    t.g.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.geometry as any).shared) m.geometry.dispose();
    });
    this.tiles.delete(k);
    this.stats.unloads++;
  }
  private build(key: string, td: TileData): Tile {
    let sd = (td.seed % 2147483646) + 1;
    const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const bldAt = this.d.bldAt;
    const war = this.d.war();
    const G: Record<string, THREE.BufferGeometry[]> = {};
    const put = (m: string, g: THREE.BufferGeometry) => (G[m] ||= []).push(g);
    const forest = new Forest();
    const quad = (m: string, x: number, z: number, ang: number, l: number, w: number, y = 0.045) => {
      const g = new THREE.PlaneGeometry(l, w);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-ang);
      g.translate(x, y, z);
      put(m, g);
    };
    const disc = (m: string, x: number, z: number, rad: number, y = 0.047, seg = 14) => {
      const g = new THREE.CircleGeometry(rad, seg);
      g.rotateX(-Math.PI / 2);
      g.translate(x, y, z);
      put(m, g);
    };
    const solid = (m: string, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
      g.rotateY(ry);
      g.translate(x, y, z);
      put(m, g);
    };
    const tile: Tile = { key, g: new THREE.Group(), lights: [], wrecks: [], barriers: [], geos: [] };
    const clip = td.clip || [];
    for (const [ax, az, bx, bz, w0, cls, , , f = 0, ow = w0] of td.segs) {
      const L = Math.hypot(bx - ax, bz - az),
        ux = (bx - ax) / L,
        uz = (bz - az) / L,
        nx = -uz,
        nz = ux,
        ang = Math.atan2(uz, ux);
      const at = (t: number, o: number): [number, number] => [ax + ux * t + nx * o, az + uz * t + nz * o];
      // v19.1: visible spans along the segment = [0,L] minus junction areas (markings stop before the zebra)
      let spans: [number, number][] = [[0, L]];
      for (const [cx, cz, cr] of clip) {
        const rx = cx - ax,
          rz = cz - az,
          tc = rx * ux + rz * uz,
          lat = Math.abs(rx * nx + rz * nz);
        if (lat >= cr + w0 / 2) continue;
        const h = Math.sqrt(Math.max(0, cr * cr - Math.min(lat, cr) ** 2)) + w0 / 4,
          t0 = tc - h,
          t1 = tc + h;
        const nsp: [number, number][] = [];
        for (const [s0, s1] of spans) {
          if (t1 <= s0 || t0 >= s1) {
            nsp.push([s0, s1]);
            continue;
          }
          if (t0 > s0) nsp.push([s0, t0]);
          if (t1 < s1) nsp.push([t1, s1]);
        }
        spans = nsp.filter(([a, b]) => b - a > 0.6);
      }
      const inSpan = (t: number) => spans.some(([a, b]) => t >= a && t <= b);
      const line = (m: string, o: number, wd: number, y = 0.045, frac = 1) => {
        for (const [a, b] of spans) {
          const l = (b - a) * frac;
          const [x, z] = at((a + b) / 2, o);
          quad(m, x, z, ang, l, wd, y);
        }
      };
      // dashed line per §181/§182: 4 m paint, 6 m gap (only whole dashes inside visible spans)
      const dash = (m: string, o: number, wd: number, seg = 4, gap = 6) => {
        for (const [a0, b0] of spans)
          for (let t = a0 + 1; t + seg <= b0 - 0.5; t += seg + gap) {
            const [x, z] = at(t + seg / 2, o);
            quad(m, x, z, ang, seg, wd);
          }
      };
      const dbl = (m: string, o: number) => {
        line(m, o - 0.1, 0.1);
        line(m, o + 0.1, 0.1);
      }; // §165 雙實線: 10 cm lines, 10 cm apart
      // curb with painted no-parking (§168 yellow / §169 red on the curb face and top)
      const curb = (sgn: number, w: number, paint: string) => {
        // v21.3 granite curb 18 cm + paved sidewalk behind it (own RNG so markings stay as they were)
        let ps = Math.abs(Math.floor(ax * 73.1 + az * 19.7 + bx * 7.3 + bz * 3.1 + sgn * 11)) % 2147483646 || 1;
        const pr = () => (ps = (ps * 16807) % 2147483647) / 2147483647;
        const sw = cls === 'main' ? 2.6 + pr() * 1.2 : 1.6 + pr() * 0.8;
        const o0 = w / 2 + 0.18;
        for (const [a0, b0] of spans) {
          const l = b0 - a0;
          const [cx, cz] = at((a0 + b0) / 2, sgn * (w / 2 + 0.09));
          if (!bldAt(cx, cz)) {
            // v21.4 lowered curb (斜坡 ramp) for 1.2 m where the walk meets a crossing
            const rA = a0 > 0.5 && l > 4 ? 1.2 : 0,
              rB = b0 < L - 0.5 && l > 4 ? 1.2 : 0;
            const cb = (t0: number, t1: number, h: number, m: string) => {
              const [qx, qz] = at((t0 + t1) / 2, sgn * (w / 2 + 0.09));
              const g = new THREE.BoxGeometry(t1 - t0, h, 0.18);
              g.rotateY(-ang);
              g.translate(qx, h / 2, qz);
              put(m, worldUV(g, 2, ang));
            };
            cb(a0 + rA, b0 - rB, 0.18, paint === 'R' ? 'curbR' : paint === 'Y' ? 'curbY' : 'curbG');
            if (rA) cb(a0, a0 + rA, 0.04, 'curbG');
            if (rB) cb(b0 - rB, b0, 0.04, 'curbG');
          }
          const n = Math.max(1, Math.ceil(l / 4)),
            pl = l / n;
          for (let k = 0; k < n; k++) {
            const tm = a0 + (k + 0.5) * pl;
            // stop the walk at the building line (arcades keep their own tiled floor)
            let ws = 0;
            for (const f of [0.25, 0.5, 0.75, 1]) {
              const [qx, qz] = at(tm, sgn * (o0 + sw * f - 0.1));
              if (bldAt(qx, qz)) break;
              ws = sw * f;
            }
            if (ws < 0.7) continue;
            const [wx, wz] = at(tm, sgn * (o0 + ws / 2));
            const g = new THREE.BoxGeometry(pl + 0.02, 0.15, ws);
            g.rotateY(-ang);
            g.translate(wx, 0.075, wz);
            put('walk', worldUV(g, 2, ang));
            addWalk({
              x: wx,
              z: wz,
              c: Math.cos(ang),
              s: Math.sin(ang),
              hl: (pl + 0.02) / 2,
              hw: ws / 2 + 0.1,
              h: 0.15,
              k: key,
            });
            const first = k === 0 && a0 > 0.5,
              last = k === n - 1 && b0 < L - 0.5;
            // yellow 導盲 warning strip where the walk meets the crossing
            for (const [on, te] of [
              [first, a0 + 0.35],
              [last, b0 - 0.35],
            ] as [boolean, number][])
              if (on) {
                const [tx, tz] = at(te, sgn * (o0 + ws / 2));
                const tg = new THREE.PlaneGeometry(0.6, ws - 0.1);
                tg.rotateX(-Math.PI / 2);
                tg.rotateY(-ang);
                tg.translate(tx, 0.152, tz);
                put('tactile', worldUV(tg, 0.6, ang));
              }
            if (pr() < 0.07) {
              const [mx, mz] = at(tm + (pr() - 0.5) * pl * 0.6, sgn * (o0 + ws * (0.3 + pr() * 0.4)));
              const mg = new THREE.CircleGeometry(0.32, 16);
              mg.rotateX(-Math.PI / 2);
              mg.translate(mx, 0.153, mz);
              put('manhole', mg);
            }
            if (cls === 'main' && ws > 2 && !first && !last && pr() < 0.3) {
              // tree pit + street tree near the curb
              const [px, pz] = at(tm, sgn * (o0 + 0.75));
              const pg = new THREE.PlaneGeometry(1.1, 1.1);
              pg.rotateX(-Math.PI / 2);
              pg.rotateY(-ang);
              pg.translate(px, 0.153, pz);
              put('pit', pg);
              const tr = forest.street(px, pz, pr, -ang);
              if (this.d.addSeg && tr > 0)
                for (const [qa, qb] of [
                  [tr, 0],
                  [0, tr],
                ]) {
                  const sg = { a: [px - qa, pz - qb] as [number, number], b: [px + qa, pz + qb] as [number, number] };
                  this.d.addSeg(sg);
                  (TSEG.get(key) || TSEG.set(key, []).get(key)!).push(sg);
                }
            }
          }
        }
      };
      // text / icon decal: reads toward the driver travelling along (dx,dz), first glyph furthest (§150)
      const near = (t: number) => inSpan(t) && inSpan(t - 3) && inSpan(t + 3);
      if ((cls === 'main' || cls === 'street') && f !== 2) {
        // f: 0 normal two-way, 3/4 = one carriageway of a divided road (outer side +1 / -1), 2 = duplicate way (no markings)
        const half = f === 3 || f === 4,
          outer = f === 4 ? -1 : 1;
        const w = half ? Math.max(6, ow) : w0;
        const paints = [r() < 0.45 ? 'R' : r() < 0.5 ? 'Y' : '', r() < 0.45 ? 'R' : r() < 0.5 ? 'Y' : ''];
        if (!half) {
          if (w < 12) {
            dash('yellow', 0, 0.1);
            for (const sgn of [-1, 1]) {
              const p = paints[sgn > 0 ? 0 : 1];
              curb(sgn, w, p);
              if (!p) line('white', sgn * (w / 2 - 0.3), 0.15);
            }
          } // 行車分向線 + 路面邊線 15 cm
          else {
            dbl('yellow', 0); // 分向限制線
            const bus = w >= 18; // 中華路-type: median 公車專用道 (§174), double white separating it
            for (const sgn of [-1, 1]) {
              const hw = w / 2;
              const p = paints[sgn > 0 ? 0 : 1];
              curb(sgn, w, p);
              const dir = sgn; // traffic on +n side moves +u
              if (bus) {
                dbl('white', sgn * 3.4);
                line('busred', sgn * 1.75, 3.1, 0.043);
              }
              const inner = bus ? 3.4 : 0;
              const mlane = hw - 2.6; // outer 2.5 m 機慢車優先道 (§174-1 white solid line)
              if (hw - inner > 6.5) dash('white', sgn * (inner + (mlane - inner) / 2), 0.1);
              line('white', sgn * mlane, 0.1);
              // repeated decals along the segment, away from junctions
              for (const [a0, b0] of spans) {
                const lenS = b0 - a0;
                if (lenS < 24) continue;
                const tt = dir > 0 ? b0 - 14 : a0 + 14;
                const tt2 = (a0 + b0) / 2;
                const dX = ux * dir,
                  dZ = uz * dir;
                const oLane = sgn * (mlane + (hw - mlane) / 2);
                this.text(put, '機車優先', at(tt, oLane), dX, dZ, 1.0, 1.7, 'W');
                this.text(put, 'SCOOT', at(tt + dir * 8.5, oLane), dX, dZ, 0.9, 1.8, 'W');
                const arL = sgn * (inner + (mlane - inner) / 2);
                this.text(put, r() < 0.6 ? 'UP' : r() < 0.5 ? 'UPR' : 'UPL', at(tt, arL), dX, dZ, 1.1, 4.5, 'W'); // 指向線 before the junction
                if (!bus && r() < 0.5) this.text(put, '禁行機車', at(tt2, sgn * (inner + 1.6)), dX, dZ, 1.0, 1.7, 'Y'); // §178 yellow
                if (bus) this.text(put, '公車專用', at(tt2, sgn * 1.75), dX, dZ, 1.0, 1.7, 'W');
                if (bus)
                  for (const k of [-1, 1]) {
                    const [px, pz] = at(tt2 + k * 9, sgn * 1.75);
                    this.diamond(put, px, pz, ang);
                  }
              }
            }
          }
          // mid-block 斑馬紋行人穿越道 (§186): two 10 cm edge lines 4 m apart, 40 cm diagonals at 45 deg; 慢 30 m before (§163)
          if (L > 70 && w >= 9 && r() < 0.3) {
            const tm = L / 2;
            if (near(tm)) {
              for (const k of [-2, 2]) {
                const [x, z] = at(tm + k, 0);
                quad('white', x, z, ang + Math.PI / 2, w - 0.6, 0.1);
              }
              for (let o = -w / 2 + 0.6; o < w / 2 - 0.6; o += 0.8 * Math.SQRT2) {
                const [x, z] = at(tm, o);
                quad('white', x, z, ang + Math.PI / 4, 5.4, 0.4);
              }
              for (const sgn of [-1, 1]) {
                const tt = tm - sgn * 32;
                if (inSpan(tt)) this.text(put, '慢', at(tt, (sgn * w) / 4), ux * sgn, uz * sgn, 1.6, 3.0, 'W');
              }
            }
          }
        } else {
          // one carriageway of a divided road: single yellow 10 cm along the median side (§165), curb + paint on the outside
          line('yellow', -outer * (w / 2 - 0.3), 0.1);
          curb(outer, w, paints[0]);
          if (!paints[0]) line('white', outer * (w / 2 - 0.3), 0.15);
          if (w >= 7) dash('white', 0, 0.1);
          if (w >= 9) line('white', outer * (w / 2 - 2.6), 0.1);
        }
      } else if (cls === 'lane' || cls === 'alley') {
        const w = w0;
        // 巷道: often only red/yellow edge lines 30 cm from the edge (§168/§169, no curb) or a 15 cm white edge line; 慢 near junctions
        for (const sgn of [-1, 1]) {
          const q = r();
          if (q < 0.3) line('red', sgn * (w / 2 - 0.3), 0.1);
          else if (q < 0.45) line('yellow', sgn * (w / 2 - 0.3), 0.1);
          else if (q < 0.7) line('white', sgn * (w / 2 - 0.3), 0.15);
        }
        if (w >= 6 && L > 20)
          for (const [a0, b0] of spans) {
            if (b0 - a0 < 14) continue;
            if (r() < 0.6) this.text(put, '慢', at(b0 - 6, -w / 4), ux, uz, 1.3, 2.4, 'W');
            if (r() < 0.6) this.text(put, '慢', at(a0 + 6, w / 4), -ux, -uz, 1.3, 2.4, 'W');
          }
        const ds = r() < 0.5 ? 1 : -1;
        for (let t = 1; t < L - 1; t += 1.2) {
          const [x, z] = at(t, ds * (w / 2 - 0.45));
          if (!bldAt(x, z)) quad('dark', x, z, ang, 1.0, 0.35, 0.046);
        } // gutter drain grates
        for (let t = 2; t < L - 2; t += 2.4 + r() * 6)
          if (r() < 0.35) {
            const [x, z] = at(t, -ds * (w / 2 - 0.7));
            if (bldAt(x, z)) continue; // parked scooters along the alley wall
            const g = new THREE.Group();
            const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.45, 1.5), MAT.scoot);
            b.position.y = 0.45;
            g.add(b);
            const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.7), MAT.dark);
            s.position.set(0, 0.74, -0.2);
            g.add(s);
            for (const zz of [-0.55, 0.55]) {
              const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10), MAT.dark);
              wh.rotation.z = Math.PI / 2;
              wh.position.set(0, 0.22, zz);
              g.add(wh);
            }
            g.position.set(x, 0, z);
            g.rotation.y = Math.atan2(nx, nz) + (r() - 0.5) * 0.4;
            (b.material as any).color as THREE.Color;
            tile.g.add(g);
          }
      }
      const w = w0;
      if (w < 4) continue;
      // surface wear
      for (let t = 3; t < L - 2; t += 9) {
        const o = (r() - 0.5) * (w - 1.5);
        const q = r();
        const [x, z] = at(t + r() * 5, o);
        if (q < 0.12) {
          disc('dark', x, z, 0.35, 0.048);
          disc('patch2', x, z, 0.3, 0.049);
        } // manhole
        else if (q < 0.3)
          quad(r() < 0.5 ? 'patch' : 'patch2', x, z, ang + (r() - 0.5) * 0.2, 1 + r() * 3, 0.8 + r() * 1.5, 0.043); // asphalt patch
        else if (q < 0.45)
          for (let c = 0; c < 4; c++) {
            const [cx, cz] = at(t + c * 0.6, o + (r() - 0.5) * 0.5);
            quad('crack', cx, cz, ang + (r() - 0.5) * 1.6, 0.7, 0.03, 0.047);
          } // crack
        else if (q < 0.53) {
          const g = new THREE.CircleGeometry(0.6 + r() * 1.2, 12);
          g.scale(1, 0.6, 1);
          g.rotateX(-Math.PI / 2);
          g.translate(x, 0.05, z);
          put('puddle', g);
        }
      } // puddle
      // war damage on main roads
      if (war && w >= 9 && L > 12) {
        const q = r();
        if (q < 0.1) {
          const [x, z] = at(L * (0.3 + r() * 0.4), (r() - 0.5) * (w - 4));
          disc('crater', x, z, 1.4 + r(), 0.051, 16);
          for (let k = 0; k < 9; k++) {
            const a = r() * 6.28,
              d = 1.6 + r() * 1.4;
            solid(
              'rubble',
              new THREE.DodecahedronGeometry(0.12 + r() * 0.2),
              x + Math.cos(a) * d,
              0.1,
              z + Math.sin(a) * d,
              r(),
            );
          }
        } else if (q < 0.18) {
          const [x, z] = at(L * (0.3 + r() * 0.4), 0);
          this.barrierRow(tile, key, `b${ax | 0}_${az | 0}`, x, z, ang, w, r);
        } else if (q < 0.26 || (q < 0.3 && w >= 12)) {
          const bus = q >= 0.26;
          const [x, z] = at(L * (0.2 + r() * 0.6), (r() < 0.5 ? 1 : -1) * (w / 2 - (bus ? 1.8 : 1.5)));
          if (!bldAt(x, z))
            this.wreck(tile, key, `w${x | 0}_${z | 0}`, x, z, Math.atan2(ux, uz) + (r() - 0.5) * 0.7, bus, r);
        }
      }
    }
    // junctions: zebras, stop lines, 待轉格, signals; mirrors at alley corners
    for (const [x, z, w, arms, rad = w / 2] of td.nodes) {
      if (w >= 9) {
        const sig = arms.length >= 3;
        const unsig = !sig;
        for (const [ux, uz, aw] of arms) {
          const ang = Math.atan2(uz, ux),
            nx = -uz,
            nz = ux;
          const hw = aw / 2 - 0.3;
          const P = (d: number, o: number): [number, number] => [x + ux * d + nx * o, z + uz * d + nz * o];
          if (aw < 6) {
            // alley meeting a main road: stop line + 停 (§170/§177), sometimes 網狀線 keep-clear box on the main road (§173)
            const [sx, sz] = P(rad + 0.6, -aw / 4);
            quad('white', sx, sz, ang + Math.PI / 2, aw / 2 - 0.2, 0.35);
            this.text(put, '停', P(rad + 2.8, -aw / 4), -ux, -uz, 1.2, 2.2, 'W');
            if (w >= 12 && r() < 0.35) {
              const gw = aw + 3,
                gl = w / 2 - 0.4;
              const [gx, gz] = P(w / 4, 0);
              this.grid(put, gx, gz, ang, gl, gw);
            }
            continue;
          }
          const d0 = Math.max(rad, aw / 2) + 1.2; // crosswalk 3-5 m back from the cross street edge (§185)
          // 枕木紋行人穿越道 (§185): 40 cm stripes parallel to traffic, 3 m long, 40-80 cm gaps (here 60 cm)
          for (let o = -hw + 0.2; o <= hw - 0.2; o += 1.0) {
            const [px, pz] = P(d0 + 1.5, o);
            quad('white', px, pz, ang, 3.0, 0.4);
          }
          // 停止線 (§170): 30-40 cm, 2-3 m behind the crosswalk, across the approach half (-n side for right-hand traffic)
          const ds = d0 + 3.0 + 2.5;
          const [sx, sz] = P(ds, -hw / 2);
          quad('white', sx, sz, ang + Math.PI / 2, hw, 0.35);
          if (aw >= 12) {
            // 機慢車停等區 (§174-2): box behind the stop line, 20 cm front/back, 10 cm sides, 3 m deep, scooter icons
            if (r() < 0.7) {
              const dep = 3;
              const [bx, bz] = P(ds + 0.2 + dep, -hw / 2);
              quad('white', bx, bz, ang + Math.PI / 2, hw, 0.2);
              const [e1x, e1z] = P(ds + dep / 2 + 0.2, -0.25);
              quad('white', e1x, e1z, ang, dep, 0.1);
              const [e2x, e2z] = P(ds + dep / 2 + 0.2, -hw + 0.05);
              quad('white', e2x, e2z, ang, dep, 0.1);
              for (let o = -hw + 1.4; o < -1; o += 2.2)
                this.text(put, 'SCOOT', P(ds + dep / 2 + 0.2, o), -ux, -uz, 0.8, 1.6, 'W');
            }
            // 機慢車左轉待轉區 (§191): 15 cm white box in front of the crosswalk on the departure side, scooter icon + 待轉
            {
              const bl = 2.2,
                bw = 1.6;
              const cdist = d0 - 0.5 - bl / 2;
              const off = hw - bw / 2 - 0.4;
              const [cx, cz] = P(cdist, off);
              for (const [l, ww, oa, ob] of [
                [bl, 0.15, 0, bw / 2],
                [bl, 0.15, 0, -bw / 2],
                [0.15, bw, bl / 2, 0],
                [0.15, bw, -bl / 2, 0],
              ] as const)
                quad('white', cx + ux * oa + nx * ob, cz + uz * oa + nz * ob, ang, l, ww, 0.046);
              this.text(put, 'SCOOT', [cx, cz], -nx, -nz, 0.6, 1.2, 'W');
            }
            // 槽化線 (§171): yellow hatched taper where the median begins, 15 cm outline, 20 cm diagonals / 30 cm gaps at 45 deg
            if (r() < 0.6) {
              const L0 = 9,
                W0 = 1.2;
              const [hx, hz] = P(ds + 0.5 + L0 / 2, 0);
              this.hatch(put, hx, hz, ang, L0, W0);
            }
          }
          // lane arrows behind the stop line on smaller signalised streets
          else this.text(put, 'UP', P(ds + 4, -hw / 2), -ux, -uz, 1.0, 4.0, 'W');
          if (sig) {
            const px = x + ux * (d0 + 2.6) + nx * (aw / 2 + 0.4),
              pz = z + uz * (d0 + 2.6) + nz * (aw / 2 + 0.4);
            if (bldAt(px, pz)) continue;
            this.signal(tile, px, pz, ang, Math.abs(ux) >= Math.abs(uz) ? 0 : 1);
          }
        }
      } else if (arms.length >= 3) {
        const [ux, uz] = arms[0];
        const px = x - uz * (w / 2 + 0.5) - ux * 0.5,
          pz = z + ux * (w / 2 + 0.5) - uz * 0.5;
        if (!bldAt(px, pz) && r() < 0.6) {
          // convex traffic mirror
          const g = new THREE.Group();
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), MAT.orange);
          p.position.y = 1.3;
          g.add(p);
          const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 6, 18), MAT.orange);
          rim.position.set(0, 2.7, 0.06);
          g.add(rim);
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, 0.6), MAT.mirror);
          m.rotation.x = Math.PI / 2;
          m.position.set(0, 2.7, 0.06);
          g.add(m);
          g.position.set(px, 0, pz);
          g.rotation.y = Math.atan2(x - px, z - pz);
          tile.g.add(g);
        }
      }
    }
    for (const [m, gs] of Object.entries(G)) {
      const me = new THREE.Mesh(mergeGeometries(gs), m[0] === 'G' ? GMAT[m.slice(1)] : (MAT as any)[m]);
      me.receiveShadow = true;
      if (['curb', 'curbG', 'curbR', 'curbY', 'rubble', 'leaf', 'wood'].includes(m)) me.castShadow = true;
      tile.g.add(me);
      gs.forEach(g => g.dispose());
    }
    forest.build(tile.g);
    tile.g.name = 'tile ' + key;
    this.d.scene.add(tile.g);
    this.stats.built++;
    return tile;
  }
  // glyph decals: each char 1 cell; laid out along travel direction (dx,dz), first glyph furthest
  private text(
    put: (m: string, g: THREE.BufferGeometry) => void,
    str: string,
    at: [number, number],
    dx: number,
    dz: number,
    cw: number,
    cl: number,
    col: 'W' | 'Y' | 'R',
  ) {
    atlas();
    const items = GLYPHS.includes(str) ? [str] : [...str];
    const pitch = cl * 1.25;
    const th = Math.atan2(-dx, -dz);
    items.forEach((ch, i) => {
      const gi = GLYPHS.indexOf(ch);
      if (gi < 0) return;
      const g = new THREE.PlaneGeometry(cw, cl);
      const uv = g.attributes.uv;
      const u0 = (gi % 8) / 8,
        v1 = 1 - Math.floor(gi / 8) / 4;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 8, v1 - (1 - uv.getY(k)) / 4);
      const off = ((items.length - 1) / 2 - i) * pitch;
      g.rotateX(-Math.PI / 2);
      g.rotateY(th);
      g.translate(at[0] + dx * off, 0.05, at[1] + dz * off);
      put('G' + col, g);
    });
  }
  // 車種專用車道 diamond (§174): 2.5 m x 1.0 m, 15 cm line
  private diamond(put: (m: string, g: THREE.BufferGeometry) => void, x: number, z: number, ang: number) {
    const a = 1.25,
      b = 0.5,
      L = Math.hypot(a, b),
      t = Math.atan2(b, a);
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const g = new THREE.PlaneGeometry(L, 0.15);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-(ang + sx * sz * -t));
      const lx = (sx * a) / 2,
        lz = (sz * b) / 2;
      g.translate(x + Math.cos(ang) * lx - Math.sin(ang) * lz, 0.046, z + Math.sin(ang) * lx + Math.cos(ang) * lz);
      put('white', g);
    }
  }
  // 網狀線 (§173): yellow box, 20 cm outline, 10 cm diagonals at 45 deg, spacing 1.5 m
  private grid(
    put: (m: string, g: THREE.BufferGeometry) => void,
    x: number,
    z: number,
    ang: number,
    l: number,
    w: number,
  ) {
    this.box(put, 'yellow', x, z, ang, l, w, 0.2);
    const c = Math.cos(ang),
      s = Math.sin(ang);
    for (const sgn of [1, -1])
      for (let k = -l - w; k <= l + w; k += 1.5) {
        // line u = k + sgn*v clipped to |u|<=l/2, |v|<=w/2
        const v0 = Math.max(-w / 2, sgn > 0 ? -l / 2 - k : k - l / 2),
          v1 = Math.min(w / 2, sgn > 0 ? l / 2 - k : k + l / 2);
        if (v1 - v0 < 0.1) continue;
        const vm = (v0 + v1) / 2,
          um = k + sgn * vm;
        const len = (v1 - v0) * Math.SQRT2;
        const g = new THREE.PlaneGeometry(len, 0.1);
        g.rotateX(-Math.PI / 2);
        g.rotateY(-(ang + (sgn * Math.PI) / 4));
        g.translate(x + c * um - s * vm, 0.046, z + s * um + c * vm);
        put('yellow', g);
      }
  }
  private hatch(
    put: (m: string, g: THREE.BufferGeometry) => void,
    x: number,
    z: number,
    ang: number,
    l: number,
    w: number,
  ) {
    this.box(put, 'yellow', x, z, ang, l, w, 0.15);
    const c = Math.cos(ang),
      s = Math.sin(ang);
    for (let k = -l / 2 + 0.3; k < l / 2 - 0.3; k += 0.5 * Math.SQRT2) {
      const g = new THREE.PlaneGeometry(w * Math.SQRT2 * 0.9, 0.2);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-(ang + Math.PI / 4));
      g.translate(x + c * k, 0.046, z + s * k);
      put('yellow', g);
    }
  }
  private box(
    put: (m: string, g: THREE.BufferGeometry) => void,
    m: string,
    x: number,
    z: number,
    ang: number,
    l: number,
    w: number,
    lw: number,
  ) {
    const c = Math.cos(ang),
      s = Math.sin(ang);
    for (const [ll, ww, ou, ov] of [
      [l, lw, 0, w / 2],
      [l, lw, 0, -w / 2],
      [lw, w, l / 2, 0],
      [lw, w, -l / 2, 0],
    ] as const) {
      const g = new THREE.PlaneGeometry(ll, ww);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-ang);
      g.translate(x + c * ou - s * ov, 0.046, z + s * ou + c * ov);
      put(m, g);
    }
  }
  private signal(t: Tile, x: number, z: number, ang: number, ax: number) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8), MAT.pole);
    p.position.y = 2.6;
    g.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.2), MAT.pole);
    arm.position.set(0, 5.1, -1.6);
    g.add(arm);
    const h = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 0.3), MAT.housing);
    h.position.set(0, 4.85, -2.9);
    g.add(h);
    const lamps: THREE.Mesh[] = [];
    (['r', 'y', 'g'] as const).forEach((c, i) => {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), (LM as any)[c + ax]);
      l.position.set(-0.34 + i * 0.34, 4.85, -2.74);
      g.add(l);
      lamps.push(l);
    });
    const pb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.12), MAT.housing);
    pb.position.set(0, 1.2, 0.1);
    g.add(pb); // pedestrian button box
    g.position.set(x, 0, z);
    g.rotation.y = -ang - Math.PI / 2;
    g.traverse(o => {
      o.castShadow = true;
    });
    t.g.add(g);
    t.lights.push({ x, z, ax, lamps });
  }
  private barrierRow(t: Tile, key: string, id: string, x: number, z: number, ang: number, w: number, r: () => number) {
    const nx = -Math.sin(ang),
      nz = Math.cos(ang);
    const n = Math.floor(w / 2.4);
    for (let i = 0; i < n; i++) {
      const bid = id + '_' + i;
      if (this.done(key, bid)) continue;
      const o = -w / 2 + 1.2 + i * 2.4;
      const g = new THREE.Group();
      if (r() < 0.75) {
        for (const s of [-1, 1])
          for (const e of [-0.9, 0.9]) {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), MAT.wood);
            leg.position.set(e, 0.55, 0);
            leg.rotation.x = s * 0.6;
            g.add(leg);
          } // 拒馬: X-legs + rail + razor wire
        const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.1), MAT.wood);
        rail.position.y = 0.9;
        g.add(rail);
        const wire = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 4, 10), MAT.wire);
        for (let k = -2; k <= 2; k++) {
          const c = wire.clone();
          c.position.set(k * 0.4, 1.0, 0);
          c.rotation.y = Math.PI / 2;
          g.add(c);
        }
      } else
        for (let k = 0; k < 6; k++) {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.4), MAT.sand);
          s.position.set(-0.8 + (k % 3) * 0.75, 0.13 + Math.floor(k / 3) * 0.25, 0);
          g.add(s);
        } // sandbags
      g.position.set(x + nx * o, 0, z + nz * o);
      g.rotation.y = -ang + Math.PI / 2 + Math.PI / 2;
      g.traverse(q => {
        q.castShadow = true;
      });
      t.g.add(g);
      t.barriers.push({ id: bid, key, x: x + nx * o, z: z + nz * o, g });
    }
  }
  private wreck(t: Tile, key: string, id: string, x: number, z: number, hd: number, bus: boolean, r: () => number) {
    const g = new THREE.Group();
    const L = bus ? 11 : 4.3,
      W = bus ? 2.5 : 1.7,
      H = bus ? 2.9 : 1.4;
    const burnt = bus || r() < 0.4;
    const body = burnt
      ? MAT.burnt
      : new THREE.MeshStandardMaterial({
          color: [0x8a8a8a, 0x3a4a6a, 0xd8d4c8, 0x6a2a2a, 0xd8b020][Math.floor(r() * 5)],
          roughness: 0.6,
          metalness: 0.3,
        });
    const b = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.55, L), body);
    b.position.y = H * 0.35 + 0.2;
    g.add(b);
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.92, H * 0.42, L * (bus ? 0.96 : 0.5)),
      burnt ? MAT.rust : MAT.dark,
    );
    c.position.set(0, H * 0.8 + 0.2, bus ? 0 : -L * 0.05);
    g.add(c);
    for (const sx of [-1, 1])
      for (const sz of bus ? [-0.35, 0.35] : [-0.32, 0.32]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), MAT.dark);
        wh.rotation.z = Math.PI / 2;
        wh.position.set((sx * W) / 2, burnt ? 0.2 : 0.34, sz * L);
        g.add(wh);
      }
    if (!bus) {
      const tr = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.06, L * 0.22), body);
      tr.position.set(0, H * 0.63 + 0.2, -L * 0.4);
      tr.userData.trunk = 1;
      g.add(tr);
    }
    g.position.set(x, 0, z);
    g.rotation.set(0, hd, burnt ? (r() - 0.5) * 0.08 : 0);
    g.traverse(q => {
      q.castShadow = true;
    });
    t.g.add(g);
    const looted = this.done(key, id);
    const wk: Wreck = { id, key, x, z, kind: bus ? 'bus' : 'car', looted, g };
    if (looted)
      g.traverse(o => {
        if ((o as any).userData.trunk) (o as THREE.Mesh).rotation.x = -1.1;
      });
    t.wrecks.push(wk);
  }
}
