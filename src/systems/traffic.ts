// Ambient traffic (v19): normal flow obeying signals during the morning prologue, panic/jams at the invasion,
// then every car is left where it stopped and handed to the drive system as an abandoned (lootable, drivable) vehicle.
import * as THREE from 'three';
import { carModel, scooterModel, type DKind } from './drive';
type V2 = [number, number];
type Road = { p: V2[]; w: number };
type Car = {
  kind: DKind;
  g: THREE.Group;
  wheels: THREE.Object3D[];
  road: Road;
  i: number;
  t: number;
  dir: 1 | -1;
  v: number;
  vmax: number;
  lane: number;
  stuck: boolean;
  panic: number;
  x: number;
  z: number;
  ux: number;
  uz: number;
  two: boolean;
};
export type TrafficDeps = {
  scene: THREE.Scene;
  junction: (x: number, z: number) => boolean;
  green: (ux: number, uz: number) => boolean;
  player: () => THREE.Vector3;
  /** v24.42 the teammates walking with the player (the cars stop for them too) */
  others?: () => { x: number; z: number }[];
  bldAt: (x: number, z: number) => any;
  abandon: (kind: DKind, x: number, z: number, hd: number) => void;
};
const KINDS: DKind[] = [
  'taxi',
  'taxi',
  'sedan',
  'sedan',
  'van',
  'kei',
  'scooter',
  'scooter',
  'scooter',
  'delivery',
  'moto',
];
export class Traffic {
  cars: Car[] = [];
  mode: 'off' | 'normal' | 'panic' = 'off';
  stats = { spawned: 0, abandoned: 0, stoppedAtRed: 0 };
  constructor(public d: TrafficDeps) {}
  start(roads: Road[], c: V2, n: number, seed = 4242) {
    let sd = seed;
    const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const segs: [Road, number][] = [];
    for (const rd of roads)
      for (let i = 0; i < rd.p.length - 1; i++) {
        const [ax, az] = rd.p[i],
          [bx, bz] = rd.p[i + 1];
        if (Math.hypot(bx - ax, bz - az) > 6 && Math.hypot((ax + bx) / 2 - c[0], (az + bz) / 2 - c[1]) < 170)
          segs.push([rd, i]);
      }
    for (let k = 0; k < n && segs.length; k++) {
      const [road, i] = segs[Math.floor(r() * segs.length)];
      const kind = KINDS[Math.floor(r() * KINDS.length)];
      const two = ['scooter', 'delivery', 'moto'].includes(kind);
      const m = two ? scooterModel(kind, r) : carModel(kind, r);
      this.d.scene.add(m.g);
      const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
      const car: Car = {
        kind,
        g: m.g,
        wheels: m.wheels,
        road,
        i,
        t: r(),
        dir,
        v: 4,
        vmax: (two ? 9 : 11) + r() * 3,
        lane: two ? road.w / 2 - 1.2 : road.w >= 16 ? road.w / 4 + 0.2 : road.w / 4,
        stuck: false,
        panic: 0,
        x: 0,
        z: 0,
        ux: 0,
        uz: 1,
        two,
      };
      this.place(car);
      if (this.d.bldAt(car.x, car.z)) {
        this.d.scene.remove(m.g);
        continue;
      }
      this.cars.push(car);
      this.stats.spawned++;
    }
    this.mode = 'normal';
  }
  panic() {
    if (this.mode !== 'normal') return;
    this.mode = 'panic';
    for (const c of this.cars) {
      const q = Math.random();
      if (q < 0.3) {
        c.stuck = true;
      } else if (q < 0.5) {
        c.dir = c.dir === 1 ? -1 : 1;
        c.t = 1 - c.t;
      }
      c.vmax *= 1.35;
      c.panic = 0.6 + Math.random();
    }
  }
  abandonAll() {
    for (const c of this.cars) {
      this.d.scene.remove(c.g);
      this.d.abandon(c.kind, c.x, c.z, Math.atan2(c.ux, c.uz));
      this.stats.abandoned++;
    }
    this.cars = [];
    this.mode = 'off';
  }
  private seg(c: Car): [number, number, number, number] {
    const p = c.road.p;
    const a = c.dir === 1 ? p[c.i] : p[c.i + 1],
      b = c.dir === 1 ? p[c.i + 1] : p[c.i];
    return [a[0], a[1], b[0], b[1]];
  }
  private place(c: Car) {
    const [ax, az, bx, bz] = this.seg(c);
    const L = Math.hypot(bx - ax, bz - az) || 1;
    c.ux = (bx - ax) / L;
    c.uz = (bz - az) / L;
    const nx = c.uz,
      nz = -c.ux; // keep right
    c.x = ax + (bx - ax) * c.t + nx * c.lane;
    c.z = az + (bz - az) * c.t + nz * c.lane;
    c.g.position.set(c.x, 0, c.z);
    c.g.rotation.y = Math.atan2(c.ux, c.uz);
  }
  update(dt: number) {
    if (this.mode === 'off') return;
    const P = this.d.player();
    for (const c of this.cars) {
      const [ax, az, bx, bz] = this.seg(c);
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const left = (1 - c.t) * L;
      let target = c.stuck ? 0 : c.vmax;
      if (this.mode === 'normal' && left < 14 && left > 5 && this.d.junction(bx, bz) && !this.d.green(c.ux, c.uz)) {
        target = Math.min(target, Math.max(0, (left - 6) * 1.2));
        if (c.v < 0.5) this.stats.stoppedAtRed += dt;
      }
      for (const o of this.cars) {
        if (o === c) continue;
        const dx = o.x - c.x,
          dz = o.z - c.z;
        const ahead = dx * c.ux + dz * c.uz,
          side = Math.abs(dx * c.uz - dz * c.ux);
        if (ahead > 0 && ahead < (c.two ? 3.5 : 7) && side < 1.6)
          target = Math.min(target, Math.max(0, (ahead - (c.two ? 2 : 5)) * 1.5));
      }
      {
        const dx = P.x - c.x,
          dz = P.z - c.z;
        const ahead = dx * c.ux + dz * c.uz,
          side = Math.abs(dx * c.uz - dz * c.ux);
        if (ahead > -1 && ahead < 6 && side < 1.6) target = 0;
      } // yield to the player
      for (const o of this.d.others?.() ?? []) {
        const dx = o.x - c.x,
          dz = o.z - c.z;
        const ahead = dx * c.ux + dz * c.uz,
          side = Math.abs(dx * c.uz - dz * c.ux);
        if (ahead > -1 && ahead < 6 && side < 1.6) target = 0;
      }
      if (this.mode === 'panic' && c.panic > 0) {
        c.panic -= dt;
        target *= 0.5 + 0.5 * Math.sin(performance.now() / 300 + c.vmax);
      }
      c.v += Math.sign(target - c.v) * Math.min(Math.abs(target - c.v), (target < c.v ? 9 : 3) * dt);
      c.t += (c.v * dt) / L;
      for (const w of c.wheels) w.rotation.x += (c.v * dt) / 0.3;
      if (c.t >= 1) {
        c.t = 0;
        const p = c.road.p;
        if (c.dir === 1) {
          if (c.i + 2 < p.length) c.i++;
          else {
            c.dir = -1;
          }
        } else {
          if (c.i > 0) c.i--;
          else {
            c.dir = 1;
          }
        }
      }
      this.place(c);
    }
  }
}
