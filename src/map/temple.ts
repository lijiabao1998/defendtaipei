// v24.15 the great temple of the district: a real walled complex you can walk into instead of a solid block. Front hall
// (三川殿) with three doors and stone dragon pillars, side corridors (護龍) round a courtyard, a free-standing main hall
// (正殿) under a double roof, a rear hall (後殿), bell and drum towers, a bronze incense burner and strings of lanterns.
// Roofs are curved and glazed with swallowtail ridges (燕尾脊), dragons and a pearl on the ridge. Everything is merged
// into four meshes, where the old solid block was some thirty-five. Origin = temple centre, the front faces +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V2 = [number, number];
type Geo = THREE.BufferGeometry;
export type TempleCont = { id: string; p: V2; label: string; items: Record<string, number> };

const GRANITE = 0x8f8b82,
  GRANITE_D = 0x6f6c66,
  LACQUER = 0x8e2019,
  BRICK = 0xa8442e,
  TEAL = 0x2c6c66,
  GOLD = 0xd8a93a,
  CREAM = 0xe8dcc0,
  GREEN = 0x2f7a5a,
  BRONZE = 0x4a3f2a,
  WOOD = 0x5a2a18;

const tint = (g: Geo, hex: number, jitter = 0) => {
  const c = new THREE.Color(hex);
  if (jitter) c.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) ((a[i * 3] = c.r), (a[i * 3 + 1] = c.g), (a[i * 3 + 2] = c.b));
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return tint(g, hex);
};
const cyl = (r0: number, r1: number, h: number, seg: number, x: number, y: number, z: number, hex: number) =>
  tint(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z), hex);
const ball = (r: number, x: number, y: number, z: number, hex: number, ws = 6, hs = 4) =>
  tint(new THREE.SphereGeometry(r, ws, hs).translate(x, y, z), hex);
const merged = (L: Geo[], keep: string[]) =>
  mergeGeometries(
    L.map(g => {
      const q = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(q.attributes)) if (!keep.includes(k)) q.deleteAttribute(k);
      return q;
    }),
  );

export function tileTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#b4622c'; // photos: a deep terracotta, not bright orange
  c.fillRect(0, 0, 128, 128);
  // barrel tiles: rounded ribs running down the slope, one course across
  for (let x = 0; x < 128; x += 16) {
    const g = c.createLinearGradient(x, 0, x + 16, 0);
    g.addColorStop(0, 'rgba(60,24,6,.55)');
    g.addColorStop(0.35, 'rgba(255,214,140,.28)');
    g.addColorStop(0.7, 'rgba(120,60,16,.05)');
    g.addColorStop(1, 'rgba(60,24,6,.55)');
    c.fillStyle = g;
    c.fillRect(x, 0, 16, 128);
  }
  for (let y = 0; y < 128; y += 32) {
    c.fillStyle = 'rgba(50,20,6,.42)';
    c.fillRect(0, y, 128, 2);
    c.fillStyle = 'rgba(255,220,160,.14)';
    c.fillRect(0, y + 2, 128, 2);
  }
  for (let i = 0; i < 420; i++) {
    c.fillStyle = `rgba(${Math.random() < 0.6 ? '30,22,14' : '240,210,160'},${Math.random() * 0.14})`;
    c.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 7, 1 + Math.random() * 4);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * A curved hall roof. The ridge runs along local x and sweeps up at both ends into swallowtails; the eaves lift towards
 * the corners and the slopes are concave. `rot` turns the whole roof a quarter (for the side corridors).
 */
export function hallRoof(
  tiles: Geo[],
  trim: Geo[],
  o: { x: number; z: number; W: number; D: number; y: number; H: number; lift: number; rot?: boolean; rich?: boolean },
) {
  const { W, D, y, H, lift } = o;
  const NU = 12,
    NV = 5;
  const ridgeY = (e: number) => y + H + lift * 1.25 * e ** 3;
  const eaveY = (e: number) => y + lift * 0.55 * e ** 2.5;
  const pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  let base = 0;
  for (const s of [-1, 1]) {
    for (let j = 0; j <= NV; j++)
      for (let i = 0; i <= NU; i++) {
        const u = i / NU,
          v = j / NV,
          e = Math.abs(2 * u - 1);
        const py = eaveY(e) + (ridgeY(e) - eaveY(e)) * v ** 1.5;
        const px = (u - 0.5) * W * (1 - 0.05 * v);
        const pz = s * (D / 2) * (1 - v);
        pos.push(px, py, pz);
        uv.push(px * 0.5, (1 - v) * (D / 2) * 0.5);
      }
    for (let j = 0; j < NV; j++)
      for (let i = 0; i < NU; i++) {
        const a = base + j * (NU + 1) + i,
          b = a + 1,
          c = a + NU + 1,
          d = c + 1;
        if (s > 0) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    base += (NU + 1) * (NV + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const put = (q: Geo) => {
    if (o.rot) q.rotateY(Math.PI / 2);
    q.translate(o.x, 0, o.z);
    return q;
  };
  tiles.push(put(g));
  // the ridge and the eave trim follow the curves, a short block per step
  const along = (yOf: (e: number) => number, zOff: number, th: number, hex: number, hexB?: number) => {
    for (let i = 0; i < NU; i++) {
      const u0 = i / NU,
        u1 = (i + 1) / NU;
      const x0 = (u0 - 0.5) * W,
        x1 = (u1 - 0.5) * W;
      const y0 = yOf(Math.abs(2 * u0 - 1)),
        y1 = yOf(Math.abs(2 * u1 - 1));
      const len = Math.hypot(x1 - x0, y1 - y0);
      const q = new THREE.BoxGeometry(len + 0.04, th, th * 0.9);
      q.rotateZ(Math.atan2(y1 - y0, x1 - x0));
      q.translate((x0 + x1) / 2, (y0 + y1) / 2, zOff);
      trim.push(put(tint(q, hexB && i % 2 ? hexB : hex)));
    }
  };
  along(e => ridgeY(e) + 0.12, 0, 0.34, CREAM, 0xc8523a); // 剪黏 ridge: bright broken-porcelain bands
  along(e => ridgeY(e) + 0.34, 0, 0.1, GREEN);
  along(eaveY, D / 2, 0.14, GREEN);
  along(eaveY, -D / 2, 0.14, GREEN);
  // swallowtails: the ridge splits into two prongs flying up and out
  for (const sx of [-1, 1]) {
    const ex = (sx * W) / 2,
      ey = ridgeY(1) + 0.15;
    for (const sz of [-1, 1]) {
      const q = new THREE.ConeGeometry(0.13, 1.5, 5);
      q.rotateZ(-sx * 0.95);
      q.rotateX(sz * 0.22);
      q.translate(ex + sx * 0.5, ey + 0.42, sz * 0.13);
      trim.push(put(tint(q, sz > 0 ? CREAM : GREEN)));
    }
    // the upturned corners of the eaves
    for (const sz of [-1, 1]) {
      const q = new THREE.ConeGeometry(0.09, 0.8, 4);
      q.rotateZ(-sx * 1.05);
      q.translate(ex + sx * 0.25, eaveY(1) + 0.2, (sz * D) / 2);
      trim.push(put(tint(q, GREEN)));
    }
  }
  if (o.rich) {
    // a pagoda finial between two dragons, heads towards the pearl on the ridge
    const top = ridgeY(0) + 0.3;
    for (const [r, h, yy] of [
      [0.32, 0.3, 0.2],
      [0.24, 0.3, 0.5],
      [0.16, 0.3, 0.8],
    ]) {
      const q = new THREE.CylinderGeometry(r * 0.75, r, h, 6);
      q.translate(0, top + yy, 0);
      trim.push(put(tint(q, GOLD)));
    }
    trim.push(put(ball(0.17, 0, top + 1.14, 0, 0xf4d67a)));
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * W * 0.34, ridgeY(0.68) + 0.2, 0),
        new THREE.Vector3(sx * W * 0.27, ridgeY(0.54) + 0.86, 0.12),
        new THREE.Vector3(sx * W * 0.18, ridgeY(0.36) + 0.38, -0.12),
        new THREE.Vector3(sx * W * 0.1, ridgeY(0.2) + 0.84, 0.1),
        new THREE.Vector3(sx * 0.8, ridgeY(0.1) + 0.72, 0),
      ]);
      trim.push(put(tint(new THREE.TubeGeometry(c, 14, 0.11, 4), GREEN)));
      trim.push(put(ball(0.17, sx * 0.72, ridgeY(0.1) + 0.76, 0, GOLD)));
    }
  }
}

/** a hexagonal tower roof for the bell and drum towers */
function towerRoof(tiles: Geo[], trim: Geo[], x: number, z: number, y: number) {
  for (const [r, h, yy] of [
    [2.8, 1.3, 0],
    [1.7, 1.9, 1.5],
  ]) {
    const g = new THREE.ConeGeometry(r, h, 6, 1, true);
    g.translate(x, y + yy + h / 2, z);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 1.5);
    tiles.push(g);
    trim.push(tint(new THREE.TorusGeometry(r, 0.07, 3, 6).rotateX(Math.PI / 2).translate(x, y + yy + 0.02, z), GREEN));
  }
  trim.push(ball(0.22, x, y + 3.75, z, GOLD));
  trim.push(cyl(0.05, 0.1, 0.5, 5, x, y + 3.45, z, GOLD));
}

export function buildTemple(
  g: THREE.Group,
  worldX: number,
  worldZ: number,
  addSeg: (a: V2, b: V2) => void,
): { conts: TempleCont[]; stats: { tris: number; meshes: number } } {
  const tiles: Geo[] = [],
    trim: Geo[] = [],
    body: Geo[] = [],
    props: Geo[] = [],
    lamps: Geo[] = [];
  const seg = (ax: number, az: number, bx: number, bz: number) => addSeg([ax, az], [bx, bz]);
  // ---- paving: granite slabs, each a little different, worn darker along the middle
  for (let x = -16; x < 16; x += 2)
    for (let z = -19; z < 19; z += 2) {
      const q = new THREE.PlaneGeometry(1.96, 1.96).rotateX(-Math.PI / 2).translate(x + 1, 0.03, z + 1);
      body.push(tint(q, Math.abs(x + 1) < 3 ? GRANITE_D : GRANITE, 0.05));
    }
  /** a wall run: stone skirt, red brick, a painted band under the eaves; the x and z in it are the run's two ends */
  const wall = (ax: number, az: number, bx: number, bz: number, h: number) => {
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.05) return;
    const ry = Math.atan2(-(bz - az), bx - ax);
    const mx = (ax + bx) / 2,
      mz = (az + bz) / 2;
    body.push(box(L, 0.9, 0.46, mx, 0.45, mz, GRANITE, ry));
    body.push(box(L, h - 1.5, 0.4, mx, 0.9 + (h - 1.5) / 2, mz, BRICK, ry));
    body.push(box(L, 0.42, 0.44, mx, h - 0.39, mz, TEAL, ry));
    body.push(box(L, 0.1, 0.46, mx, h - 0.59, mz, GOLD, ry));
    body.push(box(L, 0.1, 0.46, mx, h - 0.14, mz, GOLD, ry));
    seg(ax, az, bx, bz);
  };
  /** a pillar on a stone drum; dragon pillars are dark granite with gold rings where the dragon winds round */
  const pillar = (x: number, z: number, h: number, dragon = false) => {
    body.push(cyl(0.46, 0.5, 0.42, 8, x, 0.21, z, GRANITE));
    body.push(cyl(0.3, 0.32, h, 8, x, h / 2, z, dragon ? 0x3f4240 : LACQUER));
    if (dragon)
      for (let k = 0; k < 4; k++)
        body.push(
          tint(
            new THREE.TorusGeometry(0.33, 0.05, 3, 8)
              .rotateX(Math.PI / 2 + 0.34)
              .rotateY(k * 1.9)
              .translate(x, 1 + k * ((h - 1.4) / 3), z),
            k % 2 ? GOLD : GREEN,
          ),
        );
    body.push(box(0.9, 0.2, 0.9, x, h - 0.1, z, TEAL));
    seg(x - 0.3, z, x + 0.3, z);
    seg(x, z - 0.3, x, z + 0.3);
  };
  /** a pair of red doors standing open against the jambs, with rows of gold nails */
  const door = (x: number, z: number, w: number, h: number) => {
    body.push(box(w + 0.5, 0.4, 0.5, x, h + 0.2, z, TEAL));
    for (const s of [-1, 1]) {
      body.push(box(0.2, h, 0.46, x + (s * (w + 0.2)) / 2, h / 2, z, GRANITE_D));
      const lx = x + s * (w / 2 - 0.08),
        lz = z - w / 4;
      body.push(box(0.09, h - 0.05, w / 2, lx, h / 2, lz, LACQUER));
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 3; b++)
          body.push(
            box(
              0.03,
              0.09,
              0.09,
              lx + s * 0.05,
              0.75 + a * ((h - 1.2) / 3),
              lz - w / 4 + 0.2 + b * ((w / 2 - 0.4) / 2),
              GOLD,
            ),
          );
    }
  };
  // ---- front hall: three doors, dragon pillars across the front, open to the courtyard behind
  const FH = 5.4;
  const FRONT = 18.6;
  for (const [a, b] of [
    [-13, -8.6],
    [-5.4, -2.3],
    [2.3, 5.4],
    [8.6, 13],
  ])
    wall(a, FRONT, b, FRONT, FH);
  door(0, FRONT, 4.2, 4.4);
  door(-7, FRONT, 2.8, 3.8);
  door(7, FRONT, 2.8, 3.8);
  for (const x of [-11.5, -4, 4, 11.5]) pillar(x, 19.4, FH, true);
  wall(-13, 12, -13, FRONT, FH);
  wall(13, 12, 13, FRONT, FH);
  wall(-16, 12, -13, 12, 3.9);
  wall(13, 12, 16, 12, 3.9);
  for (const x of [-9, -3.4, 3.4, 9]) pillar(x, 12.3, FH);
  body.push(box(26.6, 0.34, 7.4, 0, FH + 0.17, 15.5, WOOD)); // ceiling under the roofs
  hallRoof(tiles, trim, { x: 0, z: 15.8, W: 15.5, D: 10.4, y: FH + 1.7, H: 2.7, lift: 1.5, rich: true });
  hallRoof(tiles, trim, { x: -11.3, z: 15.8, W: 11, D: 10, y: FH + 0.25, H: 2.3, lift: 1.1 });
  hallRoof(tiles, trim, { x: 11.3, z: 15.8, W: 11, D: 10, y: FH + 0.25, H: 2.3, lift: 1.1 });
  body.push(box(15, 1.7, 0.3, 0, FH + 0.85, 15.8, TEAL));
  // ---- side corridors round the courtyard: outer wall, open arcade inside
  for (const s of [-1, 1]) {
    wall(s * 16, -12, s * 16, 12, 3.9);
    for (let z = -10; z <= 10; z += 4) pillar(s * 12.6, z, 3.9);
    body.push(box(3.9, 0.26, 24, s * 14.2, 4.03, 0, WOOD));
    hallRoof(tiles, trim, { x: s * 14.2, z: 0, W: 24.6, D: 6.2, y: 4.2, H: 1.5, lift: 0.5, rot: true });
  }
  // ---- main hall: free-standing, a verandah of pillars round it, under a double roof
  const MH = 5.2;
  wall(-8, -6, 8, -6, MH);
  wall(-8, -6, -8, 4, MH);
  wall(8, -6, 8, 4, MH);
  wall(-8, 4, -3, 4, MH);
  wall(3, 4, 8, 4, MH);
  door(0, 4, 5.4, 4.3);
  for (const x of [-9.6, -5.4, 5.4, 9.6]) pillar(x, 5.5, MH, Math.abs(x) < 7);
  for (const z of [1.5, -3.2]) for (const s of [-1, 1]) pillar(s * 9.6, z, MH);
  body.push(box(20, 0.34, 12.8, 0, MH + 0.17, -0.6, WOOD));
  hallRoof(tiles, trim, { x: 0, z: -0.6, W: 23.5, D: 16, y: MH + 0.3, H: 1.9, lift: 1.2 });
  body.push(box(14.5, 1.1, 8.4, 0, MH + 2.1, -0.6, TEAL));
  hallRoof(tiles, trim, { x: 0, z: -0.6, W: 16, D: 10.6, y: MH + 2.6, H: 2.8, lift: 1.9, rich: true });
  // ---- rear hall: walls on three sides, open to the courtyard
  const RH = 5.2;
  wall(-14, -19, 14, -19, RH);
  wall(-14, -19, -14, -12, RH);
  wall(14, -19, 14, -12, RH);
  wall(-16, -12, -14, -12, 3.9);
  wall(14, -12, 16, -12, 3.9);
  for (const x of [-10, -3.6, 3.6, 10]) pillar(x, -12.3, RH);
  body.push(box(28.6, 0.34, 7.4, 0, RH + 0.17, -15.5, WOOD));
  hallRoof(tiles, trim, { x: 0, z: -15.6, W: 31.5, D: 10.6, y: RH + 0.25, H: 2.7, lift: 1.5, rich: true });
  // ---- bell tower and drum tower, at the two front corners of the courtyard
  for (const s of [-1, 1]) {
    const x = s * 9.3,
      z = 8.4,
      r = 1.5;
    wall(x - r, z - r, x + r, z - r, 5.4);
    wall(x - r, z + r, x + r, z + r, 5.4);
    wall(x - r, z - r, x - r, z + r, 5.4);
    wall(x + r, z - r, x + r, z + r, 5.4);
    body.push(box(3.5, 0.22, 3.5, x, 5.5, z, WOOD));
    towerRoof(tiles, trim, x, z, 5.6);
  }
  // ---- the bronze incense burner in the courtyard, on three legs under a little roof
  {
    const x = 0,
      z = 8.4;
    props.push(cyl(1.15, 1.25, 0.34, 8, x, 0.17, z, GRANITE));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * 6.283;
      props.push(box(0.2, 0.56, 0.2, x + Math.cos(a) * 0.62, 0.62, z + Math.sin(a) * 0.62, BRONZE));
    }
    props.push(cyl(0.98, 0.72, 0.8, 10, x, 1.28, z, BRONZE));
    props.push(tint(new THREE.TorusGeometry(0.98, 0.07, 4, 10).rotateX(Math.PI / 2).translate(x, 1.68, z), GOLD));
    for (const s of [-1, 1]) props.push(box(0.12, 0.42, 0.34, x + s * 1.05, 1.5, z, GOLD));
    props.push(cyl(0.72, 0.84, 0.1, 10, x, 1.7, z, 0x8f8878)); // incense ash
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4,
        d = 0.18 + (k % 3) * 0.2;
      props.push(box(0.025, 0.48, 0.025, x + Math.cos(a) * d, 1.95, z + Math.sin(a) * d, 0xa8522a));
    }
    for (let k = 0; k < 4; k++) {
      const a = 0.785 + (k * 3.1416) / 2;
      props.push(box(0.1, 1.5, 0.1, x + Math.cos(a) * 1.05, 2.45, z + Math.sin(a) * 1.05, BRONZE));
    }
    props.push(tint(new THREE.ConeGeometry(1.6, 0.8, 4).rotateY(0.785).translate(x, 3.5, z), GREEN));
    props.push(ball(0.13, x, 3.98, z, GOLD));
    seg(x - 1, z - 1, x + 1, z - 1);
    seg(x + 1, z - 1, x + 1, z + 1);
    seg(x + 1, z + 1, x - 1, z + 1);
    seg(x - 1, z + 1, x - 1, z - 1);
  }
  // ---- altars: a carved table, a gilded figure in a niche, offerings; these are what can be searched
  const conts: TempleCont[] = [];
  const altar = (id: string, x: number, z: number, w: number, label: string, items: Record<string, number>) => {
    props.push(box(w, 0.1, 1.15, x, 1.06, z, 0x6a2a18));
    props.push(box(w - 0.2, 1.0, 0.95, x, 0.5, z, LACQUER));
    props.push(box(w - 0.5, 0.06, 0.98, x, 0.72, z, GOLD));
    props.push(box(w * 0.55, 0.9, 0.6, x, 1.55, z - 0.82, WOOD)); // niche behind
    props.push(tint(new THREE.CapsuleGeometry(0.2, 0.34, 2, 6).translate(x, 1.42, z - 0.72), GOLD));
    props.push(ball(0.13, x, 1.86, z - 0.72, GOLD));
    for (let k = 0; k < 5; k++)
      props.push(ball(0.06, x - 0.5 + k * 0.25, 1.17, z + 0.26, k % 2 ? 0xd8a020 : 0xc8501a, 5, 3));
    props.push(cyl(0.11, 0.09, 0.15, 6, x + 0.56, 1.18, z - 0.1, BRONZE));
    seg(x - w / 2, z - 0.6, x + w / 2, z - 0.6);
    seg(x - w / 2, z + 0.6, x + w / 2, z + 0.6);
    conts.push({ id, p: [x, z + 0.95], label, items });
  };
  altar('lmk_t0', 0, -3.6, 4.8, '供桌', { mantou: 3, canfruit: 2, pineapple: 2, tea: 1 });
  altar('lmk_t1', -6, -16.8, 3.6, '供桌', { rice: 2, peanutcan: 2, water: 1 });
  altar('lmk_t2', 0, -16.8, 4.2, '供桌', { mantou: 2, canfruit: 1, cracker: 2, bandage: 1 });
  altar('lmk_t3', 6, -16.8, 3.6, '供桌', { driedtofu: 2, water: 2, cig: 1 });
  for (const [id, s] of [
    ['lmk_t4', -1],
    ['lmk_t5', 1],
  ] as const) {
    const x = s * 5.2,
      z = 14.4;
    props.push(box(1, 1, 0.7, x, 0.5, z, LACQUER));
    props.push(box(1.04, 0.08, 0.74, x, 1.02, z, GOLD));
    props.push(box(0.5, 0.03, 0.06, x, 1.07, z, 0x1a1a1a)); // the slot
    seg(x - 0.5, z - 0.35, x + 0.5, z - 0.35);
    seg(x - 0.5, z + 0.35, x + 0.5, z + 0.35);
    conts.push({ id, p: [x, z - 0.9], label: '功德箱', items: s < 0 ? { cig: 2, battery: 1 } : { cig: 1, tissue: 2 } });
  }
  // ---- lanterns: strings across the courtyard and a row along each front
  const lantern = (x: number, y: number, z: number) => {
    lamps.push(ball(0.2, x, y, z, 0xd8281c, 7, 4));
    lamps.push(cyl(0.11, 0.11, 0.05, 6, x, y + 0.2, z, 0xe8b818));
    lamps.push(cyl(0.11, 0.11, 0.05, 6, x, y - 0.2, z, 0xe8b818));
  };
  for (const x of [-5.6, 5.6])
    for (let z = 5.8; z <= 11.6; z += 1.45) {
      lantern(x, 4.5, z);
      body.push(box(0.02, 0.02, 1.45, x, 4.8, z, 0x2a2a2a));
    }
  for (let x = -7.4; x <= 7.4; x += 2.1) lantern(x, 4.05, 20.1);
  for (let x = -7.4; x <= 7.4; x += 2.1) lantern(x, 4.25, 5.9);
  // ---- the temple square (廟埕): granite out to the street, stone lions at the door, an arch where it meets the road
  for (let x = -17; x < 25; x += 2)
    for (let z = 19; z < 38; z += 2) {
      const q = new THREE.PlaneGeometry(1.96, 1.96).rotateX(-Math.PI / 2).translate(x + 1, 0.03, z + 1);
      body.push(tint(q, Math.abs(x + 1) < 3 ? GRANITE_D : GRANITE, 0.05));
    }
  for (const s of [-1, 1]) {
    const x = s * 5.4,
      z = 21;
    const STONE = 0xa29e94;
    props.push(box(1.2, 0.75, 1.2, x, 0.375, z, GRANITE_D));
    props.push(tint(new THREE.CapsuleGeometry(0.3, 0.42, 2, 6).rotateX(0.5).translate(x, 1.12, z), STONE));
    props.push(ball(0.34, x, 1.68, z + 0.26, STONE));
    props.push(ball(0.2, x, 1.62, z + 0.54, 0x8a867c));
    for (const k of [-1, 1]) props.push(box(0.17, 0.42, 0.2, x + k * 0.2, 0.96, z + 0.4, STONE));
    props.push(ball(0.12, x - s * 0.3, 1.02, z + 0.56, GOLD));
    seg(x - 0.6, z - 0.6, x + 0.6, z - 0.6);
    seg(x + 0.6, z - 0.6, x + 0.6, z + 0.6);
    seg(x + 0.6, z + 0.6, x - 0.6, z + 0.6);
    seg(x - 0.6, z + 0.6, x - 0.6, z - 0.6);
  }
  {
    const z = 36.6,
      ax = 4;
    for (const x of [-7, -2.8, 2.8, 7]) {
      body.push(cyl(0.34, 0.38, 5.2, 8, ax + x, 2.6, z, Math.abs(x) < 4 ? 0x3f4240 : GRANITE));
      body.push(box(0.92, 0.5, 0.92, ax + x, 0.25, z, GRANITE_D));
      seg(ax + x - 0.4, z, ax + x + 0.4, z);
      seg(ax + x, z - 0.4, ax + x, z + 0.4);
    }
    body.push(box(14.8, 0.46, 0.62, ax, 5.1, z, TEAL));
    body.push(box(14.8, 0.08, 0.66, ax, 4.86, z, GOLD));
    body.push(box(14.8, 0.08, 0.66, ax, 5.34, z, GOLD));
    body.push(box(4.4, 1.05, 0.26, ax, 4.24, z, LACQUER));
    body.push(box(4.6, 0.08, 0.3, ax, 3.68, z, GOLD));
    hallRoof(tiles, trim, { x: ax, z, W: 7.2, D: 2.9, y: 5.95, H: 0.95, lift: 0.55, rich: true });
    for (const s of [-1, 1])
      hallRoof(tiles, trim, { x: ax + s * 6.4, z, W: 5.4, D: 2.5, y: 5.42, H: 0.72, lift: 0.34 });
    for (const x of [-6.2, -4.1, 4.1, 6.2]) lantern(ax + x, 4.35, z);
  }
  // ---- four meshes
  const tileMat = new THREE.MeshStandardMaterial({
    map: tileTex(),
    roughness: 0.42,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, side: THREE.DoubleSide });
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const lampMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    emissive: 0xff4a18,
    emissiveIntensity: 0.55,
  });
  // walking in lifts the roofs off, as in every other building; furniture stays (occlusion.ts)
  for (const m of [tileMat, bodyMat, lampMat]) m.userData.cut = true;
  const mk = (L: Geo[], m: THREE.Material, keep: string[], shadow = true) => {
    const me = new THREE.Mesh(merged(L, keep), m);
    me.castShadow = shadow;
    me.receiveShadow = true;
    g.add(me);
    return me;
  };
  const a = mk(tiles, tileMat, ['position', 'normal', 'uv']);
  const b = mk([...trim, ...body], bodyMat, ['position', 'normal', 'color']);
  const c = mk(props, propMat, ['position', 'normal', 'color']);
  const d = mk(lamps, lampMat, ['position', 'normal', 'color'], false);
  const triCount = (q: THREE.Mesh) => q.geometry.attributes.position.count / 3;
  void worldX;
  void worldZ;
  return {
    conts,
    stats: { tris: Math.round(triCount(a) + triCount(b) + triCount(c) + triCount(d)), meshes: 4 },
  };
}
