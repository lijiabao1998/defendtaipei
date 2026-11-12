// v23.4 second floor (2F) of multi-storey buildings whose ground floor has a stairwell (clutter.ts plan.stair).
// Like the metro, the floor lives in its own off-map space: the footprint is re-centred at UP_O, east of the
// district, and only one floor exists at a time. The camera is unchanged; the walls are cut down by the building
// cut (occlusion.ts) like the ground floors, and the street is drawn one storey below so the room reads as upstairs.
// This module only builds geometry and collision; furniture comes from clutter.ts and the state lives in core/main.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARCADE_MATS, lotTex, worldUV } from './paving';

type V2 = [number, number];
/** centre of the off-map upstairs space */
export const UP_O: V2 = [6000, 0];
/** x beyond the district where the upstairs space lives (the district bbox ends near x = 1000) */
export const isUp = (x: number) => x > 5000;
export const FLOOR_H = 3.2;
/** v24.1 the street seen from floor f (2 = one storey up) */
const streetY = (f: number) => -(3.8 + (Math.max(2, f) - 2) * FLOOR_H);
/** v24.30 height of floor f above the street */
export const floorY = (f: number) => -streetY(f);

const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
wallMat.userData.cut = true; // cut down to a low wall while the player is up here, like the ground floors
const groundTex = lotTex.clone();
groundTex.needsUpdate = true;
groundTex.repeat.set(75, 75);
const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, color: 0x9a9a9a, roughness: 1 });
const PLASTER = [0xe6e0d0, 0xdcdfd4, 0xe8dccb, 0xd8d4c8];
// v24.31 light indoors. A walk-up or a 透天 is long and narrow with windows only at the street end (and the back): by
// day the front of the room is bright where the sun comes through the glass and it falls away into the depth; at
// night, with the power on, each room has a fluorescent tube and a cold pool of light under it. Both are drawn as
// light added to the floor (no extra lamps for the renderer to carry); main.ts dims the sun for this pass.
const poolSun = new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0,
});
const poolLamp = poolSun.clone();
const tubeMat = new THREE.MeshBasicMaterial({ color: 0x20221f });
/** day: 0 (night) … 1 (noon), how much sun comes through the windows; lamp: the tubes are lit */
export function setUpLight(day: number, lamp: boolean) {
  poolSun.opacity = 0.5 * day;
  poolLamp.opacity = lamp ? 0.42 : 0;
  tubeMat.color.setHex(lamp ? 0xf4fbf6 : 0x4a4d4a);
}
/** a quad on the floor from p-q (bright) reaching `len` along (nx, nz) and fading out */
function pool(p: V2, q: V2, nx: number, nz: number, len: number, hex: number) {
  const g = new THREE.BufferGeometry();
  const y = 0.022;
  // slanted a little, as sunlight through a window lies
  const sx = (q[0] - p[0]) * 0.18,
    sz = (q[1] - p[1]) * 0.18;
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        p[0],
        y,
        p[1],
        q[0],
        y,
        q[1],
        q[0] + nx * len + sx,
        y,
        q[1] + nz * len + sz,
        p[0] + nx * len + sx,
        y,
        p[1] + nz * len + sz,
      ],
      3,
    ),
  );
  col.setHex(hex);
  g.setAttribute(
    'color',
    new THREE.Float32BufferAttribute([col.r, col.g, col.b, col.r, col.g, col.b, 0, 0, 0, 0, 0, 0], 3),
  );
  g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]);
  return g;
}
/** a round pool of lamp light on the floor */
function disc(x: number, z: number, r: number, hex: number, pts: V2[]) {
  const g = new THREE.BufferGeometry();
  const N = 14,
    pos: number[] = [x, 0.024, z],
    cl: number[] = [];
  col.setHex(hex);
  cl.push(col.r, col.g, col.b);
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    // not through the walls: the pool stops where the room does
    let rr = r;
    while (rr > 0.3 && !pipPts([x + Math.cos(a) * rr, z + Math.sin(a) * rr], pts)) rr -= 0.3;
    pos.push(x + Math.cos(a) * rr, 0.024, z + Math.sin(a) * rr);
    cl.push(0, 0, 0);
  }
  const idx: number[] = [];
  for (let i = 1; i <= N; i++) idx.push(0, i + 1, i);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.setIndex(idx);
  return g;
}
const col = new THREE.Color();

function paint(g: THREE.BufferGeometry, hex: number) {
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  col.setHex(hex);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
/** box in a local frame (x along, y up, z across), placed by m */
function box(w: number, h: number, d: number, x: number, y: number, z: number, c: number, m: THREE.Matrix4) {
  return paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z).applyMatrix4(m), c);
}
/** vertical quad p→q from y0 to y1, lit side facing `face` */
function quad(p: V2, q: V2, y0: number, y1: number, face: V2, hex: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([p[0], y0, p[1], q[0], y0, q[1], q[0], y1, q[1], p[0], y1, p[1]], 3),
  );
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  const [fx, fz] = face;
  g.setAttribute('normal', new THREE.Float32BufferAttribute([fx, 0, fz, fx, 0, fz, fx, 0, fz, fx, 0, fz], 3));
  const front = -(q[1] - p[1]) * fx + (q[0] - p[0]) * fz;
  g.setIndex(front >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  return paint(g, hex);
}
function hash(n: number) {
  let x = n >>> 0 || 1;
  return () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export type UpRoom = {
  g: THREE.Group;
  /** walls and the stair opening (full height) */
  segs: { a: V2; b: V2 }[];
  /** where the stairs arrive (in front of the opening) */
  land: V2;
  /** v24.1 foot of the flight up to the next floor, when there is one */
  upFoot: V2 | null;
  /** cut box for occlusion.ts while up here */
  box: { O: V2; U: V2; ub: [number, number, number, number] };
  /** v24.32 on a rooftop: the houses one can walk into (their boxes, for the cut and for "am I inside one") */
  sheds?: { O: V2; U: V2; ub: [number, number, number, number] }[];
};

/**
 * Build the 2F shell for a footprint already moved off-map. F is the ground plan's frame (moved with it), stair the
 * ground stairwell centre in that frame; street(i) says whether footprint edge i faces a road (windows).
 */
export function buildUpstairs(o: {
  pts: V2[];
  F: { O: V2; U: V2; N: V2 };
  stair: { u: number; v: number };
  street: (i: number) => boolean;
  seed: number;
  /** v24.1 which floor (2 = 2F); the street is drawn that many storeys below */
  floor?: number;
  /** v24.1 centre (plan frame) of the flight up to the next floor, beside the opening */
  upFlight?: { u: number; v: number } | null;
  /** v24.30 the real street is drawn under this floor (main.ts draws the world in place): no stand-in plane */
  noStreet?: boolean;
}): UpRoom {
  const { pts, F, stair } = o;
  const r = hash(o.seed);
  const W = (u: number, v: number): V2 => [F.O[0] + F.U[0] * u + F.N[0] * v, F.O[1] + F.U[1] * u + F.N[1] * v];
  const frameM = new THREE.Matrix4().set(F.U[0], 0, F.N[0], F.O[0], 0, 1, 0, 0, F.U[1], 0, F.N[1], F.O[1], 0, 0, 0, 1);
  const g = new THREE.Group();
  g.name = 'upstairs';
  const vc: THREE.BufferGeometry[] = [];
  const sunP: THREE.BufferGeometry[] = [],
    lampP: THREE.BufferGeometry[] = [],
    tubes: THREE.BufferGeometry[] = [];
  const segs: { a: V2; b: V2 }[] = [];
  const plaster = PLASTER[Math.floor(r() * PLASTER.length)];
  // floor: one tile style over the footprint
  const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));
  const fl = new THREE.ShapeGeometry(sh);
  fl.rotateX(-Math.PI / 2);
  fl.translate(0, 0.01, 0);
  const floor = new THREE.Mesh(worldUV(fl, 1), ARCADE_MATS[Math.floor(r() * ARCADE_MATS.length)]);
  floor.receiveShadow = true;
  g.add(floor);
  // walls (inner faces) with windows on the street side
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      c = pts[(i + 1) % pts.length];
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (L < 0.05) continue;
    segs.push({ a, b: c });
    const ux = (c[0] - a[0]) / L,
      uz = (c[1] - a[1]) / L;
    let nx = -uz,
      nz = ux;
    const mx = (a[0] + c[0]) / 2,
      mz = (a[1] + c[1]) / 2;
    if (!pipPts([mx + nx * 0.3, mz + nz * 0.3], pts)) ((nx = -nx), (nz = -nz)); // inward
    const ins = (q: V2): V2 => [q[0] + nx * 0.05, q[1] + nz * 0.05];
    vc.push(quad(ins(a), ins(c), 0, FLOOR_H, [nx, nz], plaster));
    // skirting
    vc.push(quad(ins(a), ins(c), 0, 0.12, [nx, nz], 0x6a5a48));
    if (!o.street(i) || L < 1.8) continue;
    // aluminium sliding windows with 鐵窗 bars: local x along the wall, z inward
    const m = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(ux, 0, uz),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(nx, 0, nz),
    );
    const n = Math.max(1, Math.floor(L / 2.6));
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n) * L,
        w = Math.min(1.6, L / n - 0.5);
      m.setPosition(a[0] + ux * t, 0, a[1] + uz * t);
      // v24.31 what the sun throws on the floor through this window
      {
        const cx = a[0] + ux * t + nx * 0.25,
          cz = a[1] + uz * t + nz * 0.25;
        sunP.push(
          pool([cx - (ux * w) / 2, cz - (uz * w) / 2], [cx + (ux * w) / 2, cz + (uz * w) / 2], nx, nz, 3.4, 0xfff0c8),
        );
      }
      vc.push(box(w, 1.1, 0.02, 0, 1.55, 0.07, 0x8fb4c2, m)); // glass
      vc.push(
        box(w + 0.1, 0.06, 0.08, 0, 0.98, 0.08, 0xc8ccc8, m),
        box(w + 0.1, 0.06, 0.08, 0, 2.12, 0.08, 0xc8ccc8, m),
      );
      vc.push(
        box(0.05, 1.2, 0.08, -w / 2, 1.55, 0.08, 0xc8ccc8, m),
        box(0.05, 1.2, 0.08, w / 2, 1.55, 0.08, 0xc8ccc8, m),
      );
      for (let b = 1; b < 5; b++) vc.push(box(0.025, 1.1, 0.025, -w / 2 + (b * w) / 5, 1.55, 0.14, 0x3a3f3c, m));
      vc.push(box(w + 0.1, 0.05, 0.22, 0, 0.95, 0.1, 0xb8b4aa, m)); // sill
    }
  }
  // stair opening: dark well with the top steps, railing on three sides, landing in front (toward -v)
  {
    const { u, v } = stair;
    const sm = frameM.clone().multiply(new THREE.Matrix4().makeTranslation(u, 0, v));
    vc.push(box(1.1, 0.02, 2.3, 0, 0.015, 0, 0x151515, sm));
    for (let k = 0; k < 4; k++) vc.push(box(1.0, 0.02, 0.26, 0, 0.03, -0.95 + k * 0.28, 0x8a867c - k * 0x0c0c0c, sm));
    const rail = 0x5a5f5c;
    for (const x of [-0.58, 0.58]) {
      vc.push(box(0.04, 0.04, 2.3, x, 0.95, 0, rail, sm));
      for (const z of [-1.13, 0, 1.13]) vc.push(box(0.04, 0.95, 0.04, x, 0.475, z, rail, sm));
    }
    vc.push(box(1.2, 0.04, 0.04, 0, 0.95, 1.13, rail, sm));
    const c = [W(u - 0.6, v - 1.18), W(u + 0.6, v - 1.18), W(u + 0.6, v + 1.18), W(u - 0.6, v + 1.18)];
    for (let i = 0; i < 4; i++) segs.push({ a: c[i], b: c[(i + 1) % 4] });
  }
  // v24.1 the flight up to the next floor: concrete steps rising away from the landing beside the opening, with a
  // handrail (a Taipei walk-up stairwell: down-flight and up-flight side by side at every landing)
  let upFoot: V2 | null = null;
  if (o.upFlight) {
    const { u, v } = o.upFlight;
    const sm = frameM.clone().multiply(new THREE.Matrix4().makeTranslation(u, 0, v));
    for (let k = 0; k < 8; k++) {
      const hgt = 0.18 * (k + 1);
      vc.push(box(1.0, hgt, 0.28, 0, hgt / 2, -0.98 + k * 0.28, k % 2 ? 0x9a968c : 0x8e8a80, sm));
      vc.push(box(1.0, 0.02, 0.05, 0, hgt + 0.01, -1.1 + k * 0.28, 0xb8b2a4, sm)); // worn nosing
    }
    vc.push(box(0.04, 0.04, 2.3, -0.55, 0.95 + 0.7, 0, 0x5a5f5c, sm)); // handrail (sloped look: raised)
    for (const z of [-1.0, 0.1, 1.0])
      vc.push(box(0.04, 0.9 + (z + 1) * 0.7, 0.04, -0.55, (0.9 + (z + 1) * 0.7) / 2, z, 0x5a5f5c, sm));
    const c = [W(u - 0.55, v - 1.15), W(u + 0.55, v - 1.15), W(u + 0.55, v + 1.15), W(u - 0.55, v + 1.15)];
    for (let i = 1; i < 4; i++) segs.push({ a: c[i], b: c[(i + 1) % 4] });
    segs.push({ a: c[0], b: c[1] }); // the steps themselves block walking; [E] at the foot climbs
    upFoot = W(u, v - 1.75);
  }
  const m = new THREE.Mesh(mergeGeometries(vc), wallMat);
  m.receiveShadow = true;
  g.add(m);
  vc.forEach(q => q.dispose());
  // v24.31 a tube every few metres of the floor, and its pool of light
  {
    let x0 = 1e9,
      x1 = -1e9,
      z0 = 1e9,
      z1 = -1e9;
    for (const q of pts) {
      x0 = Math.min(x0, q[0]);
      x1 = Math.max(x1, q[0]);
      z0 = Math.min(z0, q[1]);
      z1 = Math.max(z1, q[1]);
    }
    const nxl = Math.max(1, Math.round((x1 - x0) / 4.2)),
      nzl = Math.max(1, Math.round((z1 - z0) / 4.2));
    for (let i = 0; i < nxl; i++)
      for (let k = 0; k < nzl; k++) {
        const x = x0 + ((i + 0.5) / nxl) * (x1 - x0),
          z = z0 + ((k + 0.5) / nzl) * (z1 - z0);
        if (!pipPts([x, z], pts)) continue;
        lampP.push(disc(x, z, 2.7, 0xdff0ea, pts));
        // the tube itself, where the ceiling would be (the ceiling is cut away with the upper walls)
        const t = new THREE.BoxGeometry(1.2, 0.05, 0.07);
        t.rotateY(Math.atan2(-F.U[1], F.U[0]));
        t.translate(x, 2.55, z);
        tubes.push(t);
      }
  }
  for (const [list, mat] of [
    [sunP, poolSun],
    [lampP, poolLamp],
    [tubes, tubeMat],
  ] as [THREE.BufferGeometry[], THREE.Material][]) {
    if (!list.length) continue;
    const pm = new THREE.Mesh(mergeGeometries(list), mat);
    pm.renderOrder = 2;
    g.add(pm);
    list.forEach(q => q.dispose());
  }
  // the street one storey below, seen past the cut-down walls
  if (!o.noStreet) {
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
    gp.rotation.x = -Math.PI / 2;
    gp.position.set(UP_O[0], streetY(o.floor ?? 2), UP_O[1]);
    gp.receiveShadow = true;
    g.add(gp);
  }
  // cut box in the plan frame
  let umin = 1e9,
    umax = -1e9,
    vmin = 1e9,
    vmax = -1e9;
  for (const q of pts) {
    const du = (q[0] - F.O[0]) * F.U[0] + (q[1] - F.O[1]) * F.U[1],
      dv = (q[0] - F.O[0]) * F.N[0] + (q[1] - F.O[1]) * F.N[1];
    umin = Math.min(umin, du);
    umax = Math.max(umax, du);
    vmin = Math.min(vmin, dv);
    vmax = Math.max(vmax, dv);
  }
  return {
    g,
    segs,
    land: W(stair.u, stair.v - 1.8),
    upFoot,
    box: { O: F.O, U: F.U, ub: [umin - 1, umax + 1, vmin - 1, vmax + 1] },
  };
}
const hutMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
const shadeMat = new THREE.ShadowMaterial({ opacity: 0.32, depthWrite: false });
/**
 * v24.30 the rooftop. The real roof, with its tin houses and tanks, is drawn in place (main.ts), so this is only what
 * the stairs come out of (the stairwell hut with its steel door), something for shadows to fall on, and the collision:
 * the parapet (the footprint), the hut, and whatever stands on the real roof (obs, already moved off-map).
 */
export function buildRoof(o: {
  pts: V2[];
  F: { O: V2; U: V2; N: V2 };
  stair: { u: number; v: number };
  seed: number;
  obs?: V2[][];
  /** v24.32 the tin houses (already moved off-map): centre, size, angle, door offset along the front (+z) */
  sheds?: { c: V2; w: number; d: number; ang: number; door?: number }[];
}): UpRoom {
  const { pts, F, stair } = o;
  const r = hash(o.seed ^ 0x51ed270b);
  const W = (u: number, v: number): V2 => [F.O[0] + F.U[0] * u + F.N[0] * v, F.O[1] + F.U[1] * u + F.N[1] * v];
  const frameM = new THREE.Matrix4().set(F.U[0], 0, F.N[0], F.O[0], 0, 1, 0, 0, F.U[1], 0, F.N[1], F.O[1], 0, 0, 0, 1);
  const g = new THREE.Group();
  g.name = 'rooftop';
  const vc: THREE.BufferGeometry[] = [];
  const segs: { a: V2; b: V2 }[] = [];
  for (let i = 0; i < pts.length; i++) segs.push({ a: pts[i], b: pts[(i + 1) % pts.length] });
  for (const q of o.obs ?? []) for (let i = 0; i < q.length; i++) segs.push({ a: q[i], b: q[(i + 1) % q.length] });
  // v24.32 a house on the roof: four walls, and a doorway where its door is drawn
  const sheds: NonNullable<UpRoom['sheds']> = [];
  for (const h of o.sheds ?? []) {
    if (h.door === undefined) continue; // open-sided: posts and a roof, walked through
    const ca = Math.cos(h.ang),
      sa = Math.sin(h.ang);
    const P = (lx: number, lz: number): V2 => [h.c[0] + lx * ca - lz * sa, h.c[1] + lx * sa + lz * ca];
    const w2 = h.w / 2,
      d2 = h.d / 2;
    segs.push({ a: P(-w2, -d2), b: P(w2, -d2) }, { a: P(w2, -d2), b: P(w2, d2) }, { a: P(-w2, d2), b: P(-w2, -d2) });
    const g0 = Math.max(-w2 + 0.1, h.door - 0.55),
      g1 = Math.min(w2 - 0.1, h.door + 0.55);
    if (g0 > -w2 + 0.05) segs.push({ a: P(-w2, d2), b: P(g0, d2) });
    if (g1 < w2 - 0.05) segs.push({ a: P(g1, d2), b: P(w2, d2) });
    sheds.push({ O: h.c, U: [ca, sa], ub: [-w2 - 0.15, w2 + 0.15, -d2 - 0.15, d2 + 0.15] });
  }
  // the hut over the stairwell, door toward the landing (-v)
  const { u, v } = stair;
  const sm = frameM.clone().multiply(new THREE.Matrix4().makeTranslation(u, 0, v + 0.3));
  const wall = [0xcfc9bb, 0xc4c8c0, 0xd6cdbd, 0xbdb7a8][Math.floor(r() * 4)];
  const stain = wall - 0x1a1a1a;
  for (const x of [-0.85, 0.85]) vc.push(box(0.12, 2.3, 2.4, x, 1.15, 0, wall, sm));
  vc.push(box(1.7, 2.3, 0.12, 0, 1.15, 1.2, wall, sm));
  for (const x of [-0.675, 0.675]) vc.push(box(0.35, 2.3, 0.12, x, 1.15, -1.2, wall, sm));
  vc.push(box(1.0, 0.32, 0.12, 0, 2.14, -1.2, wall, sm));
  vc.push(box(1.82, 0.5, 2.52, 0, 0.25, 0, stain, sm)); // the damp foot of the walls
  vc.push(box(0.98, 1.98, 0.02, 0, 0.99, -1.1, 0x14120f, sm)); // dark inside
  vc.push(box(0.05, 1.95, 0.9, 0.52, 0.98, -1.68, [0x6f4a3a, 0x4a5a66, 0x7a3a30][Math.floor(r() * 3)], sm)); // steel door, open
  vc.push(box(0.04, 0.12, 0.04, 0.47, 1.0, -2.05, 0x2a2a2a, sm)); // its handle
  vc.push(box(2.15, 0.12, 2.85, 0, 2.36, 0, 0x9a968c, sm)); // slab
  vc.push(box(2.19, 0.05, 2.89, 0, 2.44, 0, 0x7f7b72, sm));
  vc.push(box(1.0, 0.1, 0.5, 0, 0.05, -1.5, 0x8e8a80, sm)); // the step out
  const c = [W(u - 0.92, v - 0.95), W(u + 0.92, v - 0.95), W(u + 0.92, v + 1.56), W(u - 0.92, v + 1.56)];
  for (let i = 0; i < 4; i++) segs.push({ a: c[i], b: c[(i + 1) % 4] });
  const m = new THREE.Mesh(mergeGeometries(vc), hutMat);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  vc.forEach(q => q.dispose());
  // shadows of the player and the hut, on the real roof underneath
  const fl = new THREE.ShapeGeometry(new THREE.Shape(pts.map(q => new THREE.Vector2(q[0], -q[1]))));
  fl.rotateX(-Math.PI / 2);
  fl.translate(0, 0.03, 0);
  const sf = new THREE.Mesh(fl, shadeMat);
  sf.receiveShadow = true;
  g.add(sf);
  let umin = 1e9,
    umax = -1e9,
    vmin = 1e9,
    vmax = -1e9;
  for (const q of pts) {
    const du = (q[0] - F.O[0]) * F.U[0] + (q[1] - F.O[1]) * F.U[1],
      dv = (q[0] - F.O[0]) * F.N[0] + (q[1] - F.O[1]) * F.N[1];
    umin = Math.min(umin, du);
    umax = Math.max(umax, du);
    vmin = Math.min(vmin, dv);
    vmax = Math.max(vmax, dv);
  }
  return {
    g,
    segs,
    land: W(u, v - 1.9),
    upFoot: null,
    box: { O: F.O, U: F.U, ub: [umin - 1, umax + 1, vmin - 1, vmax + 1] },
    sheds,
  };
}
export function disposeUpstairs(room: UpRoom) {
  room.g.parent?.remove(room.g);
  room.g.traverse(q => (q as THREE.Mesh).geometry?.dispose());
}
function pipPts(pt: V2, poly: V2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i],
      [xj, zj] = poly[j];
    if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// v24.9 the neighbours seen from upstairs: the off-map floor used to float alone above a paved plane. Now the
// buildings within ~45 m are copied around it as plain extruded blocks (walls + roof), at their real heights
// relative to this floor — lower roofs spread out below the windows, taller walk-ups rise beside you. One merged,
// vertex-coloured mesh (one draw call), shadow-receiving only; the camera cutaway (occlusion.ts) applies as usual.
const nbMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
const ROOFS = [0x8a9a7a, 0x9a9a94, 0x7a8a9a, 0xa89a86, 0x6f8a6a, 0xb0a890];
export function buildNeighbours(o: {
  list: { pts: V2[]; h: number }[];
  /** world → off-map translation (the same one applied to this building) */
  off: V2;
  /** height of this floor above the street */
  floorH: number;
  seed: number;
  /** this building's centre (off-map coordinates): neighbours on the camera side are kept below the floor */
  centre?: V2;
}) {
  const r = hash(o.seed ^ 0x2c1b3c6d);
  const parts: THREE.BufferGeometry[] = [];
  const y0 = -o.floorH - 0.02;
  for (const b of o.list.slice(0, 70)) {
    let y1 = b.h - o.floorH;
    if (y1 < y0 + 0.5 || b.pts.length < 3) continue;
    const pts = b.pts.map(([x, z]) => [x + o.off[0], z + o.off[1]] as V2);
    // between the camera (it looks from +x +z) and this floor: keep it below the floor, like the street cutaway
    if (o.centre) {
      const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length - o.centre[0],
        cz = pts.reduce((a, q) => a + q[1], 0) / pts.length - o.centre[1];
      if (cx + cz > 3 && Math.abs(cx - cz) < 30) y1 = Math.min(y1, -0.4);
      if (y1 < y0 + 0.5) continue;
    }
    const wall = 0x8a8478 - Math.floor(r() * 3) * 0x080808;
    const win = 0x3a4048; // window bands, one per storey
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        c = pts[(i + 1) % pts.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < 0.05) continue;
      let nx = (c[1] - a[1]) / L,
        nz = -(c[0] - a[0]) / L;
      if (pipPts([(a[0] + c[0]) / 2 + nx * 0.2, (a[1] + c[1]) / 2 + nz * 0.2], pts)) ((nx = -nx), (nz = -nz));
      parts.push(quad(a, c, y0, y1, [nx, nz], wall));
      // a dark window band on every storey (aluminium windows behind 鐵窗, seen from a distance)
      if (L > 2.2)
        for (let y = y0 + 3.8 + 0.9; y + 1.2 < y1; y += 3.2) {
          const ins = 0.4 / L;
          const p0: V2 = [a[0] + (c[0] - a[0]) * ins + nx * 0.03, a[1] + (c[1] - a[1]) * ins + nz * 0.03],
            p1: V2 = [c[0] - (c[0] - a[0]) * ins + nx * 0.03, c[1] - (c[1] - a[1]) * ins + nz * 0.03];
          parts.push(quad(p0, p1, y, y + 1.2, [nx, nz], win));
        }
    }
    const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], -p[1])));
    const top = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(0, y1, 0);
    top.deleteAttribute('uv');
    top.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(top.attributes.position.count * 2), 2));
    parts.push(paint(top, ROOFS[Math.floor(r() * ROOFS.length)]));
    // roof life: a water tank, often a 頂樓加蓋 tin shed
    const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length,
      cz = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    const M = new THREE.Matrix4().makeTranslation(cx, 0, cz);
    if (r() < 0.7)
      parts.push(box(0.9, 1.0, 0.9, 1.2, y1 + 0.9, -0.8, [0x2a6ab8, 0xd8d8d0, 0x9aa0a4][Math.floor(r() * 3)], M));
    if (r() < 0.45)
      parts.push(box(3.2, 2.3, 3.6, -0.6, y1 + 1.15, 0.6, [0x6a8aa8, 0x7a9a7a, 0x9a9a94][Math.floor(r() * 3)], M));
  }
  if (!parts.length) return null;
  const m = new THREE.Mesh(mergeGeometries(parts), nbMat);
  m.receiveShadow = true;
  parts.forEach(q => q.dispose());
  return m;
}
