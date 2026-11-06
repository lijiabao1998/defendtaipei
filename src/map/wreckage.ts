import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// v24.5 the occupied city's streets, compared against street photos of Wanhua / Ximending: Taipei roads are never
// empty — scooters packed nose-in along every kerb, cars, taxis and buses in every lane. Three days after the
// landing the traffic simply stopped: cars left in their lanes (some slewed, some crashed, a few burnt out),
// buses abandoned at stops, scooters dropped on their sides, water-filled barriers and jersey barriers across
// lanes, paper, plastic and glass everywhere. Everything is instanced per 80 m cell and kind (cars, buses,
// scooters, barriers, debris, scorch marks), so off-screen cells are culled whole; abandoned vehicles and barriers
// are low cover (collision walls).
type V2 = [number, number];
export type WreckDeps = {
  scene: THREE.Scene;
  roads: { p: V2[]; t: string; n: string }[];
  roadW: Record<string, number>;
  bldAt: (x: number, z: number) => unknown;
  /** keep clear: doorways, the spawn, junction centres */
  blocked: (x: number, z: number) => boolean;
  addSeg: (a: V2, b: V2, h: number) => void;
  rnd: () => number;
};
const VC = (g: THREE.BufferGeometry, hex: number) => {
  const c = new THREE.Color(hex),
    n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
};
const B = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) =>
  VC(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
/** sedan / taxi: body tinted by instance colour, dark glass cabin, black wheels (vertex colours × instance colour) */
function carGeo() {
  return mergeGeometries([
    B(1.8, 0.62, 4.4, 0, 0.62, 0, 0xffffff),
    B(1.62, 0.56, 2.2, 0, 1.2, -0.25, 0x3a4048),
    B(1.7, 0.08, 0.9, 0, 0.95, 1.55, 0xd8d8d8), // bonnet highlight
    ...[-1.4, 1.35].flatMap(z => [
      B(0.22, 0.6, 0.62, -0.86, 0.3, z, 0x141414),
      B(0.22, 0.6, 0.62, 0.86, 0.3, z, 0x141414),
    ]),
  ]);
}
/** city bus: long body, window band, roof unit */
function busGeo() {
  return mergeGeometries([
    B(2.5, 2.4, 11, 0, 1.55, 0, 0xffffff),
    B(2.52, 0.9, 10.2, 0, 2.05, -0.2, 0x2a3138),
    B(1.6, 0.35, 2.6, 0, 2.9, -1.5, 0xc8c8c8),
    ...[-3.6, 3.4].flatMap(z => [
      B(0.25, 0.9, 1.0, -1.2, 0.45, z, 0x141414),
      B(0.25, 0.9, 1.0, 1.2, 0.45, z, 0x141414),
    ]),
  ]);
}
/** scooter (Taiwan 機車): body tinted, dark seat / handlebar / wheels */
function scooterGeo() {
  // four boxes (seen from above that reads as a scooter): body + wheels, front shield, seat, delivery box
  return mergeGeometries([
    B(0.34, 0.5, 1.5, 0, 0.3, 0, 0xffffff),
    B(0.32, 0.5, 0.24, 0, 0.75, 0.5, 0xffffff),
    B(0.36, 0.12, 0.55, 0, 0.6, -0.2, 0x1e1e1e),
    B(0.32, 0.26, 0.36, 0, 0.6, -0.62, 0x2a6a3a), // the green delivery box half of Taipei carries
  ]);
}
/** water-filled barrier (red / white) and concrete jersey barrier, 2 m long */
function barrierGeo() {
  return mergeGeometries([B(2.0, 0.8, 0.5, 0, 0.4, 0, 0xffffff), B(1.9, 0.12, 0.36, 0, 0.86, 0, 0xffffff)]);
}
const debrisGeo = () => new THREE.PlaneGeometry(0.4, 0.3).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
const scorchGeo = () => new THREE.CircleGeometry(2.6, 14).rotateX(-Math.PI / 2).translate(0, 0.015, 0);
type Inst = { m: THREE.Matrix4; c: number; k: string };
const CELLW = 80;
export const wreckStats = {
  cars: 0,
  buses: 0,
  scooters: 0,
  kerbScooters: 0,
  barriers: 0,
  debris: 0,
  burnt: 0,
  segs: 0,
  meshes: 0,
};
export function buildWreckage(d: WreckDeps) {
  const { rnd } = d;
  const cars: Inst[] = [],
    buses: Inst[] = [],
    scoot: Inst[] = [],
    barr: Inst[] = [],
    deb: Inst[] = [],
    scorch: Inst[] = [];
  const taken: V2[] = [];
  const free = (x: number, z: number, r: number) =>
    !d.bldAt(x, z) && !d.blocked(x, z) && taken.every(q => Math.hypot(q[0] - x, q[1] - z) > r);
  const put = (list: Inst[], x: number, z: number, ang: number, c: number, tilt = 0, y = 0) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang, tilt, 'YXZ'));
    list.push({
      m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)),
      c,
      k: Math.floor(x / CELLW) + ',' + Math.floor(z / CELLW),
    });
  };
  /** a vehicle's footprint as low cover (cars 1.45 m, buses 2.8 m stop everything) */
  const cover = (x: number, z: number, ang: number, w: number, l: number, h: number) => {
    const ux = Math.sin(ang),
      uz = Math.cos(ang),
      vx = uz,
      vz = -ux;
    const c: V2[] = [
      [x + ux * l + vx * w, z + uz * l + vz * w],
      [x + ux * l - vx * w, z + uz * l - vz * w],
      [x - ux * l - vx * w, z - uz * l - vz * w],
      [x - ux * l + vx * w, z - uz * l + vz * w],
    ];
    for (let i = 0; i < 4; i++) d.addSeg(c[i], c[(i + 1) % 4], h);
    wreckStats.segs += 4;
  };
  const CAR = [0xd8d8d8, 0x30343a, 0x8a1a1a, 0x2a4a7a, 0xbfbfbf, 0xe8e8e8, 0x6a6e72, 0x1f3a2a];
  const SCOOT = [
    0xd8d8d4, 0xd8d8d4, 0x26282a, 0x26282a, 0x8e9498, 0x8e9498, 0xa63a30, 0x2f4f86, 0x7fa8a2, 0xb8963a, 0xb07f90,
  ];
  const BURNT = 0x1c1a18;
  for (const r of d.roads) {
    const w = d.roadW[r.t.replace('_link', '')] ?? 3;
    const main = w >= 9; // tertiary and up: lanes of traffic
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 6) continue;
      const tx = (bx - ax) / L,
        tz = (bz - az) / L;
      const nx = -tz,
        nz = tx;
      const head = Math.atan2(tx, tz);
      // ---- kerbside scooter rows (every road wide enough for a kerb): 4–12 scooters nose-in, 0.75 m apart
      if (w >= 6)
        for (let s = 4 + rnd() * 16; s < L - 4; s += 34 + rnd() * 40) {
          const side = rnd() < 0.5 ? -1 : 1;
          const off = w / 2 - 0.7;
          const n = 4 + Math.floor(rnd() * 6);
          for (let k = 0; k < n; k++) {
            const t = s + k * 0.75;
            if (t > L - 2) break;
            const x = ax + tx * t + nx * off * side,
              z = az + tz * t + nz * off * side;
            if (d.bldAt(x, z) || d.blocked(x, z)) continue;
            const down = rnd() < 0.12; // knocked over in the panic
            put(
              scoot,
              x,
              z,
              head + (Math.PI / 2) * side + (rnd() - 0.5) * 0.3,
              SCOOT[Math.floor(rnd() * SCOOT.length)],
              down ? 1.35 : 0,
            );
            wreckStats.kerbScooters++;
          }
        }
      if (!main && w >= 6) {
        // residential lanes: cars parked nose to tail along one kerb (the other is the scooters'), like every 巷
        const side = rnd() < 0.5 ? -1 : 1;
        for (let s = 5 + rnd() * 12; s < L - 4; s += 6 + rnd() * 14) {
          if (rnd() < 0.4) continue;
          const off = (w / 2 - 1.05) * side;
          const x = ax + tx * s + nx * off,
            z = az + tz * s + nz * off;
          if (!free(x, z, 4.6)) continue;
          taken.push([x, z]);
          const burnt = rnd() < 0.04;
          const ang = head + (rnd() < 0.5 ? Math.PI : 0) + (rnd() - 0.5) * 0.12;
          put(cars, x, z, ang, burnt ? BURNT : rnd() < 0.12 ? 0xf2c21a : CAR[Math.floor(rnd() * CAR.length)]);
          cover(x, z, ang, 0.9, 2.2, 1.45);
          wreckStats.cars++;
          if (burnt) put(scorch, x, z, rnd() * 6.28, 0x0c0a08);
        }
      }
      if (!main) {
        // lanes: a dropped scooter or two and litter on the narrow streets
        for (let s = rnd() * 30; s < L; s += 28 + rnd() * 40) {
          const x = ax + tx * s + nx * (rnd() - 0.5) * w * 0.5,
            z = az + tz * s + nz * (rnd() - 0.5) * w * 0.5;
          if (!free(x, z, 1.2)) continue;
          put(scoot, x, z, rnd() * 6.28, SCOOT[Math.floor(rnd() * SCOOT.length)], 1.4);
          wreckStats.scooters++;
        }
      } else {
        // ---- abandoned traffic in the lanes: one vehicle every 9–24 m per direction
        for (const dir of [-1, 1])
          for (let s = 3 + rnd() * 10; s < L - 3; s += 9 + rnd() * 15) {
            const lane = dir * (w / 4 + (rnd() - 0.5) * 0.8);
            const x = ax + tx * s + nx * lane,
              z = az + tz * s + nz * lane;
            const bus = w >= 12 && rnd() < 0.1;
            if (!free(x, z, bus ? 7 : 3.4)) continue;
            const crash = rnd() < 0.18;
            const ang = head + (dir < 0 ? Math.PI : 0) + (crash ? (rnd() - 0.5) * 1.6 : (rnd() - 0.5) * 0.22);
            const burnt = rnd() < 0.09;
            taken.push([x, z]);
            if (bus) {
              put(buses, x, z, ang, burnt ? BURNT : [0x2a8a5a, 0x3a6ab8, 0xe8e8e8][Math.floor(rnd() * 3)]);
              cover(x, z, ang, 1.25, 5.5, 2.8);
              wreckStats.buses++;
            } else {
              const taxi = !burnt && rnd() < 0.2;
              put(cars, x, z, ang, burnt ? BURNT : taxi ? 0xf2c21a : CAR[Math.floor(rnd() * CAR.length)]);
              cover(x, z, ang, 0.9, 2.2, 1.45);
              wreckStats.cars++;
            }
            if (burnt) {
              put(scorch, x, z, rnd() * 6.28, 0x0c0a08);
              wreckStats.burnt++;
            }
            // glass and paper around it
            for (let k = 0; k < 3; k++)
              put(
                deb,
                x + (rnd() - 0.5) * 5,
                z + (rnd() - 0.5) * 5,
                rnd() * 6.28,
                [0xe8e4d6, 0xbfe0e8, 0xd84a3a, 0x3a6ab8, 0xf2f2f2][Math.floor(rnd() * 5)],
              );
          }
        // ---- a barrier line across one lane here and there (police / army roadblock left behind)
        if (L > 30 && rnd() < 0.35) {
          const s = L * (0.3 + rnd() * 0.4);
          const side = rnd() < 0.5 ? -1 : 1;
          for (let k = 0; k < Math.ceil(w / 4.2); k++) {
            const o = side * (0.6 + k * 2.1);
            const x = ax + tx * s + nx * o,
              z = az + tz * s + nz * o;
            if (!free(x, z, 1.5)) continue;
            const water = rnd() < 0.6;
            put(
              barr,
              x,
              z,
              head + Math.PI / 2 + (rnd() - 0.5) * 0.25,
              water ? (k % 2 ? 0xd8d8d8 : 0xc8302a) : 0x9a9a94,
            );
            const ux = Math.cos(head),
              uz = -Math.sin(head);
            d.addSeg([x - ux, z - uz], [x + ux, z + uz], 1.0);
            wreckStats.segs++;
            wreckStats.barriers++;
          }
        }
      }
      // litter along every road
      for (let s = rnd() * 8; s < L; s += 7 + rnd() * 10)
        put(
          deb,
          ax + tx * s + nx * (rnd() - 0.5) * w,
          az + tz * s + nz * (rnd() - 0.5) * w,
          rnd() * 6.28,
          [0xe8e4d6, 0xf2f2f2, 0x2a2a2a, 0xd84a3a, 0x8fc8c0][Math.floor(rnd() * 5)],
        );
    }
  }
  wreckStats.debris = deb.length;
  const g = new THREE.Group();
  g.name = 'wreckage';
  const mk = (geo: THREE.BufferGeometry, list: Inst[], mat: THREE.Material, shadow = true) => {
    const cells = new Map<string, Inst[]>();
    for (const q of list) (cells.get(q.k) || cells.set(q.k, []).get(q.k)!).push(q);
    const col = new THREE.Color();
    for (const part of cells.values()) {
      const m = new THREE.InstancedMesh(geo, mat, part.length);
      part.forEach((q, i) => {
        m.setMatrixAt(i, q.m);
        m.setColorAt(i, col.setHex(q.c));
      });
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      g.add(m);
      wreckStats.meshes++;
    }
  };
  const paint = (r = 0.5, me = 0.2) =>
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: r, metalness: me });
  mk(carGeo(), cars, paint(0.35, 0.45));
  mk(busGeo(), buses, paint(0.45, 0.3));
  mk(scooterGeo(), scoot, paint(0.4, 0.25), false);
  mk(barrierGeo(), barr, paint(0.7, 0.05));
  mk(debrisGeo(), deb, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), false);
  mk(scorchGeo(), scorch, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), false);
  d.scene.add(g);
  return g;
}
