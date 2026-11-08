// v24.24 helicopters over Wanhua. PLA machines fly the wide roads and the river front above the rooftops, hunt whoever they
// catch in the open (a door gun, and on the attack type a salvo of rockets you can run from), lose you if you get indoors,
// and can be brought down with heavy weapons. A Black Hawk left behind on an empty lot can be flown: see drive.ts.
// Low-poly and generic, no real insignia. Models face +z, like every driven vehicle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tr } from '../i18n';

type V2 = [number, number];
type G = THREE.BufferGeometry;
export type HeliKind = 'uh60' | 'z20' | 'z10';
export const HELI_NAME: Record<HeliKind, string> = {
  uh60: tr('UH-60M 黑鷹直升機', 'UH-60M Black Hawk'),
  z20: tr('直-20 通用直升機', 'Z-20 utility helicopter'),
  z10: tr('直-10 攻擊直升機', 'Z-10 attack helicopter'),
};

const paint = (g: G, c: number) => {
  const s = (g.index ? g.toNonIndexed() : g) as G;
  for (const k of Object.keys(s.attributes)) if (k !== 'position' && k !== 'normal') s.deleteAttribute(k);
  const n = s.getAttribute('position').count,
    a = new Float32Array(n * 3),
    cc = new THREE.Color(c);
  for (let i = 0; i < n; i++) cc.toArray(a, i * 3);
  s.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return s;
};
const bx = (w: number, h: number, l: number, x: number, y: number, z: number, c: number) =>
  paint(new THREE.BoxGeometry(w, h, l).translate(x, y, z), c);
/** a box along z, narrower at its +z end (w1, h1) than at its -z end (w0, h0); dz > 0 swaps the look of a nose and a boom */
function taper(w0: number, h0: number, w1: number, h1: number, l: number, x: number, y: number, z: number, c: number) {
  const g = new THREE.BoxGeometry(1, 1, l);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const front = p.getZ(i) > 0;
    p.setX(i, p.getX(i) * (front ? w1 : w0));
    p.setY(i, p.getY(i) * (front ? h1 : h0));
  }
  g.computeVertexNormals();
  return paint(g.translate(x, y, z), c);
}
const cylZ = (r: number, l: number, x: number, y: number, z: number, c: number, seg = 8) =>
  paint(new THREE.CylinderGeometry(r, r, l, seg).rotateX(Math.PI / 2).translate(x, y, z), c);
const cylY = (r: number, l: number, x: number, y: number, z: number, c: number, seg = 8) =>
  paint(new THREE.CylinderGeometry(r, r, l, seg).translate(x, y, z), c);
const cylX = (r: number, l: number, x: number, y: number, z: number, c: number, seg = 10) =>
  paint(new THREE.CylinderGeometry(r, r, l, seg).rotateZ(Math.PI / 2).translate(x, y, z), c);

const DARK = 0x1c2022,
  GLASS = 0x28343c,
  TYRE = 0x141414;

function bodyUtility(c: number, c2: number): G[] {
  const P: G[] = [
    bx(2.3, 1.9, 5.4, 0, 1.75, 0.4, c), // cabin
    taper(2.3, 1.9, 1.2, 0.9, 2.2, 0, 1.62, 4.2, c), // nose
    taper(1.9, 0.9, 1.05, 0.42, 1.5, 0, 2.2, 3.75, GLASS), // windscreen
    taper(1.7, 0.75, 1.1, 0.5, 3.6, 0, 2.98, 0.3, c2), // engine deck
    taper(0.5, 0.5, 1.5, 1.3, 7.6, 0, 2.15, -6.1, c), // tail boom, thin end aft
    bx(0.22, 2.7, 1.2, 0, 3.45, -10, c), // fin
    bx(3.2, 0.1, 0.85, 0, 1.75, -9.6, c2), // stabiliser
    bx(0.05, 0.85, 2.3, 1.17, 2.05, 0.6, GLASS), // side door windows
    bx(0.05, 0.85, 2.3, -1.17, 2.05, 0.6, GLASS),
    bx(0.5, 0.35, 1.4, 1.35, 1.1, 0.6, c2), // fuel sponsons
    bx(0.5, 0.35, 1.4, -1.35, 1.1, 0.6, c2),
    cylY(0.16, 0.85, 0, 3.72, 0.3, DARK), // mast
  ];
  // wheels and struts
  for (const s of [-1, 1]) {
    P.push(cylX(0.36, 0.26, s * 1.35, 0.36, 2.0, TYRE));
    P.push(bx(0.12, 0.8, 0.14, s * 1.25, 0.72, 2.0, DARK));
  }
  P.push(cylX(0.2, 0.14, 0, 0.42, -7.8, TYRE), bx(0.08, 1.3, 0.1, 0, 1.05, -7.8, DARK));
  return P;
}
function bodyAttack(c: number, c2: number): G[] {
  const P: G[] = [
    bx(1.15, 1.75, 5.2, 0, 1.75, 0.6, c), // narrow fuselage
    taper(1.15, 1.75, 0.6, 0.7, 1.9, 0, 1.55, 4.15, c), // nose
    taper(0.95, 0.75, 0.7, 0.5, 1.5, 0, 2.62, 3, GLASS), // front cockpit
    taper(0.95, 0.85, 0.85, 0.65, 1.4, 0, 2.95, 1.55, GLASS), // the rear one, stepped up
    taper(1.3, 0.8, 0.9, 0.6, 2.6, 0, 2.85, -0.4, c2), // engines
    taper(0.42, 0.42, 1, 1, 7, 0, 2.05, -5.2, c), // tail boom
    bx(0.2, 2.6, 1.1, 0, 3.3, -8.8, c),
    bx(2.6, 0.1, 0.75, 0, 1.75, -8.4, c2),
    bx(4.2, 0.18, 1, 0, 1.55, 0.2, c2), // stub wings
    cylY(0.15, 0.8, 0, 3.45, -0.2, DARK), // mast
    bx(0.32, 0.32, 1.5, 0, 0.95, 3.7, DARK), // chin gun
    cylZ(0.06, 1.4, 0, 0.95, 4.9, DARK, 6),
  ];
  for (const s of [-1, 1]) {
    P.push(cylZ(0.24, 1.5, s * 1.65, 1.2, 0.2, DARK, 8)); // rocket pods
    P.push(cylX(0.26, 0.2, s * 0.85, 0.3, 1.8, TYRE), bx(0.1, 0.6, 0.12, s * 0.8, 0.65, 1.8, DARK));
  }
  P.push(cylX(0.16, 0.12, 0, 0.5, -7, TYRE));
  return P;
}

export type HeliModel = {
  g: THREE.Group;
  /** the main rotor, and its blur */
  spin: THREE.Object3D;
  blur: THREE.Mesh;
  tail: THREE.Object3D;
  /** the door gun, on the machine that has one */
  gun: THREE.Object3D;
};
const bladeMat = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.7, flatShading: true });
const blurMat = new THREE.MeshBasicMaterial({
  color: 0x20262a,
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const bodyMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.72,
  metalness: 0.18,
  flatShading: true,
});
// you may be sitting in one, and they fly: never cut away by the see-through cylinder
bladeMat.userData.noOcc = blurMat.userData.noOcc = bodyMat.userData.noOcc = true;
const bladeGeo = (() => {
  const a = new THREE.BoxGeometry(0.5, 0.05, 16);
  return mergeGeometries([a, a.clone().rotateY(Math.PI / 2)]);
})();
const blurGeo = new THREE.CircleGeometry(8, 28).rotateX(-Math.PI / 2);
const tailGeo = new THREE.BoxGeometry(0.08, 2.8, 0.26);
const bodyCache: Partial<Record<HeliKind, G>> = {};
export function makeHeli(kind: HeliKind): HeliModel {
  const C: Record<HeliKind, [number, number]> = {
    uh60: [0x4b5439, 0x3e4631],
    z20: [0x6a7276, 0x585f63],
    z10: [0x5e6a5e, 0x4c574c],
  };
  const body = (bodyCache[kind] ||= mergeGeometries(
    kind === 'z10' ? bodyAttack(C[kind][0], C[kind][1]) : bodyUtility(C[kind][0], C[kind][1]),
  ));
  const g = new THREE.Group();
  const m = new THREE.Mesh(body, bodyMat);
  m.castShadow = true;
  g.add(m);
  const spin = new THREE.Mesh(bladeGeo, bladeMat);
  spin.position.set(0, kind === 'z10' ? 3.9 : 4.2, kind === 'z10' ? -0.2 : 0.3);
  spin.castShadow = true;
  g.add(spin);
  const blur = new THREE.Mesh(blurGeo, blurMat);
  blur.position.copy(spin.position);
  blur.visible = false;
  g.add(blur);
  const tail = new THREE.Mesh(tailGeo, bladeMat);
  tail.position.set(0.22, kind === 'z10' ? 3.6 : 3.8, kind === 'z10' ? -8.8 : -10);
  g.add(tail);
  // the door gun: a short barrel on a post in the door, which turns; only the machine you fly shows it
  const gun = new THREE.Group();
  gun.position.set(0, 2, 0.6);
  if (kind !== 'z10') {
    const b = new THREE.Mesh(cylZ(0.05, 1.5, 0, 0, 1.6, DARK, 5), bodyMat);
    gun.add(b);
  }
  g.add(gun);
  g.rotation.order = 'YXZ';
  return { g, spin, blur, tail, gun };
}
/** spin the blades; rate 0..1 */
export function spinRotor(
  m: { spin?: THREE.Object3D; blur?: THREE.Object3D; tail?: THREE.Object3D },
  rate: number,
  dt: number,
) {
  if (m.spin) m.spin.rotation.y += rate * dt * 34;
  if (m.tail) m.tail.rotation.x += rate * dt * 60;
  if (m.blur) m.blur.visible = rate > 0.55;
}

export type HeliDeps = {
  scene: THREE.Scene;
  player: () => THREE.Vector3;
  /** indoors or under an arcade: they cannot see you */
  hidden: () => boolean;
  night: () => boolean;
  /** long wide roads, as polylines */
  routes: () => V2[][];
  roofAt: (x: number, z: number) => number;
  log: (m: string, c?: string) => void;
  alert: (x: number, z: number) => void;
  hurt: (n: number, by: string) => void;
  gun: (dist: number) => void;
  rotor: (dist: number) => void;
  /** the attack type's rockets: rings on the ground, a few seconds to run */
  salvo: (x: number, z: number) => void;
  smoke: (x: number, y: number, z: number, fire: boolean) => void;
  crash: (x: number, z: number, kind: HeliKind) => void;
};
export type Craft = HeliModel & {
  kind: HeliKind;
  hp: number;
  state: 'patrol' | 'hunt' | 'fall';
  way: V2[];
  alt: number;
  hd: number;
  vx: number;
  vz: number;
  spot: number;
  lost: number;
  huntT: number;
  gunT: number;
  burst: number;
  rocketT: number;
  soundT: number;
  fallT: number;
  smokeT: number;
  ang: number;
  light: THREE.Mesh;
  beam: THREE.Mesh;
};
const SPEED = 20,
  CRUISE = 24,
  SEE = 34;
const poolMat = new THREE.MeshBasicMaterial({
  color: 0xfff4c8,
  transparent: true,
  opacity: 0.2,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const beamMat = new THREE.MeshBasicMaterial({
  color: 0xfff4c8,
  transparent: true,
  opacity: 0.09,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
});
poolMat.userData.noOcc = beamMat.userData.noOcc = true;
const poolGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
// a cone from y = 1 down to y = 0
const beamGeo = new THREE.CylinderGeometry(0.03, 1, 1, 16, 1, true).translate(0, 0.5, 0);
const UP = new THREE.Vector3(0, 1, 0);
const tv = new THREE.Vector3();

export class HeliPatrols {
  list: Craft[] = [];
  stats = { spawned: 0, hunts: 0, shots: 0, hits: 0, downed: 0, salvos: 0, sounds: 0 };
  private respawn = 0;
  private tracers: THREE.LineSegments;
  private trT = 0;
  private trI = 0;
  constructor(public d: HeliDeps) {
    this.tracers = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 6), 3)),
      new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.9 }),
    );
    this.tracers.frustumCulled = false;
    this.tracers.visible = false;
    d.scene.add(this.tracers);
  }
  /** how many should be up at this level of the war */
  static wanted(L: number) {
    return L < 0.05 ? 0 : L < 0.35 ? 1 : L < 0.7 ? 2 : 3;
  }
  private newRoute(c: Craft) {
    const R = this.d.routes();
    const P = this.d.player();
    if (!R.length) {
      const a = Math.random() * 6.28,
        r = 120 + Math.random() * 200;
      c.way = [[P.x + Math.cos(a) * r, P.z + Math.sin(a) * r]];
      return;
    }
    // one of the roads nearest you, so that you see them now and then
    const near = R.map(q => ({ q, d: Math.hypot(q[0][0] - P.x, q[0][1] - P.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6);
    const q = near[Math.floor(Math.random() * near.length)].q;
    c.way = (Math.random() < 0.5 ? q.slice() : q.slice().reverse()) as V2[];
  }
  spawn(kind: HeliKind) {
    const P = this.d.player();
    const m = makeHeli(kind);
    const a = Math.random() * 6.28;
    const x = P.x + Math.cos(a) * 420,
      z = P.z + Math.sin(a) * 420;
    m.g.position.set(x, CRUISE, z);
    const light = new THREE.Mesh(poolGeo, poolMat),
      beam = new THREE.Mesh(beamGeo, beamMat);
    light.visible = beam.visible = false;
    this.d.scene.add(m.g, light, beam);
    const c: Craft = {
      ...m,
      kind,
      hp: kind === 'z10' ? 90 : 100,
      state: 'patrol',
      way: [],
      alt: CRUISE,
      hd: 0,
      vx: 0,
      vz: 0,
      spot: 0,
      lost: 0,
      huntT: 0,
      gunT: 2,
      burst: 0,
      rocketT: 8,
      soundT: 0,
      fallT: 0,
      smokeT: 0,
      ang: 0,
      light,
      beam,
    };
    this.newRoute(c);
    this.list.push(c);
    this.stats.spawned++;
    return c;
  }
  private remove(c: Craft) {
    this.d.scene.remove(c.g, c.light, c.beam);
    this.list.splice(this.list.indexOf(c), 1);
  }
  /** the craft under this ray (the mouse), if any */
  pick(ray: THREE.Ray) {
    let best: Craft | null = null,
      bd = 8;
    for (const c of this.list) {
      if (c.state === 'fall') continue;
      const d = ray.distanceToPoint(c.g.position);
      if (d < bd) ((bd = d), (best = c));
    }
    return best;
  }
  nearestTo(x: number, z: number, r: number) {
    let best: Craft | null = null,
      bd = r;
    for (const c of this.list) {
      if (c.state === 'fall') continue;
      const d = Math.hypot(c.g.position.x - x, c.g.position.z - z);
      if (d < bd) ((bd = d), (best = c));
    }
    return best;
  }
  hit(c: Craft, dmg: number) {
    if (c.state === 'fall') return;
    c.hp -= dmg;
    this.stats.hits++;
    if (c.hp > 0) return;
    c.state = 'fall';
    c.fallT = 0;
    this.d.log(
      tr(`🔥 ${HELI_NAME[c.kind]} 被打中了，正在往下掉！`, `🔥 The ${HELI_NAME[c.kind]} is hit and going down!`),
      '#ffd76a',
    );
  }
  update(dt: number, L: number) {
    const d = this.d;
    const P = d.player();
    // keep the numbers up, slowly: a replacement takes minutes
    if ((this.respawn -= dt) <= 0 && this.list.length < HeliPatrols.wanted(L)) {
      this.respawn = 180 + Math.random() * 120;
      this.spawn(L > 0.35 && Math.random() < 0.45 ? 'z10' : 'z20');
    }
    if (this.trT > 0 && (this.trT -= dt) <= 0) this.tracers.visible = false;
    for (const c of this.list.slice()) this.fly(c, dt, P);
  }
  private fly(c: Craft, dt: number, P: THREE.Vector3) {
    const d = this.d;
    const g = c.g;
    spinRotor(c, 1, dt);
    const px = g.position.x,
      pz = g.position.z;
    const dist = Math.hypot(P.x - px, P.z - pz);
    if ((c.soundT -= dt) <= 0) {
      c.soundT = 1.1;
      if (dist < 300) {
        d.rotor(dist);
        this.stats.sounds++;
      }
    }
    if (c.state === 'fall') return this.fall(c, dt);
    if (c.hp < 50 && (c.smokeT -= dt) <= 0) {
      c.smokeT = 0.25;
      d.smoke(px, g.position.y, pz, false);
    }
    // where to go
    let tx = px,
      tz = pz,
      speed = SPEED;
    if (c.state === 'patrol') {
      while (c.way.length && Math.hypot(c.way[0][0] - px, c.way[0][1] - pz) < 12) c.way.shift();
      if (!c.way.length) this.newRoute(c);
      if (c.way.length) [tx, tz] = c.way[0];
      // can it see you?
      const inPool = dist < (d.night() ? 12 : SEE);
      if (inPool && !d.hidden()) {
        c.spot += dt;
        if (c.spot > (d.night() ? 0.9 : 1.6)) {
          c.state = 'hunt';
          c.huntT = 28;
          c.lost = 0;
          this.stats.hunts++;
          d.alert(P.x, P.z);
          d.log(
            tr(
              `⚠ ${HELI_NAME[c.kind]} 發現你了！快躲進室內或騎樓！`,
              `⚠ The ${HELI_NAME[c.kind]} has seen you! Get indoors or under an arcade!`,
            ),
            '#f66',
          );
        }
      } else c.spot = Math.max(0, c.spot - dt * 0.5);
    } else {
      // circle above you
      c.ang += dt * 0.42;
      // close enough to be seen doing it: the view only reaches some twenty metres up
      const r = c.kind === 'z10' ? 18 : 14;
      tx = P.x + Math.cos(c.ang) * r;
      tz = P.z + Math.sin(c.ang) * r;
      speed = 16;
      c.huntT -= dt;
      if (d.hidden()) c.lost += dt;
      else c.lost = Math.max(0, c.lost - dt);
      if (c.lost > 6 || c.huntT <= 0 || dist > 90) {
        c.state = 'patrol';
        c.spot = 0;
        this.newRoute(c);
      } else if (dist < 44 && !d.hidden()) this.shoot(c, P, dt);
    }
    // fly there: a little banked and nose down, as they do
    const dx = tx - px,
      dz = tz - pz,
      dl = Math.hypot(dx, dz) || 1;
    const wvx = (dx / dl) * speed,
      wvz = (dz / dl) * speed;
    const k = Math.min(1, dt * 0.9);
    c.vx += (wvx - c.vx) * k;
    c.vz += (wvz - c.vz) * k;
    g.position.x += c.vx * dt;
    g.position.z += c.vz * dt;
    const v = Math.hypot(c.vx, c.vz);
    if (v > 2) {
      const want = Math.atan2(c.vx, c.vz);
      const dh = Math.atan2(Math.sin(want - c.hd), Math.cos(want - c.hd));
      c.hd += THREE.MathUtils.clamp(dh, -1.2 * dt, 1.2 * dt);
      g.rotation.z = THREE.MathUtils.lerp(
        g.rotation.z,
        THREE.MathUtils.clamp(dh, -0.5, 0.5) * 0.45,
        Math.min(1, dt * 2),
      );
    }
    g.rotation.y = c.hd;
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, (v / SPEED) * 0.14, Math.min(1, dt * 2));
    // and over the rooftops
    const look = Math.max(
      d.roofAt(g.position.x, g.position.z),
      d.roofAt(g.position.x + c.vx * 1.5, g.position.z + c.vz * 1.5),
      d.roofAt(g.position.x + c.vx * 3, g.position.z + c.vz * 3),
    );
    const want = Math.max(c.state === 'hunt' ? 15 : CRUISE, look + 7);
    c.alt += THREE.MathUtils.clamp(want - c.alt, -4 * dt, 8 * dt);
    g.position.y = c.alt;
    this.lights(c, P);
  }
  /** the searchlight, by night */
  private lights(c: Craft, P: THREE.Vector3) {
    const on = this.d.night();
    c.light.visible = c.beam.visible = on;
    if (!on) return;
    const g = c.g.position;
    const lx = c.state === 'hunt' ? P.x : g.x + Math.sin(c.hd) * 6,
      lz = c.state === 'hunt' ? P.z : g.z + Math.cos(c.hd) * 6;
    const r = 9;
    c.light.position.set(lx, 0.12, lz);
    c.light.scale.setScalar(r);
    // a cone from the nose down to the pool
    c.beam.position.set(lx, 0, lz);
    tv.set(g.x - lx, c.alt, g.z - lz);
    const h = tv.length();
    tv.divideScalar(h);
    c.beam.quaternion.setFromUnitVectors(UP, tv);
    c.beam.scale.set(r, h, r);
  }
  private shoot(c: Craft, P: THREE.Vector3, dt: number) {
    const d = this.d;
    c.gunT -= dt;
    if (c.gunT <= 0) {
      c.gunT = 0.11;
      if (c.burst <= 0) c.burst = 8;
      if (--c.burst <= 0) c.gunT = 2.4 + Math.random() * 1.3;
      this.stats.shots++;
      d.gun(Math.hypot(P.x - c.g.position.x, P.z - c.g.position.z));
      const a = this.tracers.geometry.attributes.position as THREE.BufferAttribute;
      a.setXYZ(this.trI, c.g.position.x, c.alt + 1.2, c.g.position.z);
      a.setXYZ(this.trI + 1, P.x + (Math.random() - 0.5) * 3, 0.6, P.z + (Math.random() - 0.5) * 3);
      a.needsUpdate = true;
      this.trI = (this.trI + 2) % 16;
      this.tracers.visible = true;
      this.trT = 0.2;
      if (Math.random() < 0.12) d.hurt(8 + Math.random() * 4, HELI_NAME[c.kind]);
    }
    if (c.kind === 'z10' && (c.rocketT -= dt) <= 0) {
      c.rocketT = 13 + Math.random() * 7;
      this.stats.salvos++;
      d.salvo(P.x, P.z);
    }
  }
  private fall(c: Craft, dt: number) {
    const d = this.d;
    c.fallT += dt;
    c.hd += dt * (2.4 + c.fallT * 1.5);
    c.alt -= dt * (8 + c.fallT * 7);
    c.g.position.x += c.vx * dt * 0.8;
    c.g.position.z += c.vz * dt * 0.8;
    c.g.position.y = c.alt;
    c.g.rotation.y = c.hd;
    c.g.rotation.z = Math.min(0.5, c.fallT * 0.25);
    c.light.visible = c.beam.visible = false;
    if ((c.smokeT -= dt) <= 0) {
      c.smokeT = 0.08;
      d.smoke(c.g.position.x, c.alt + 1, c.g.position.z, true);
    }
    const roof = d.roofAt(c.g.position.x, c.g.position.z);
    if (c.alt > Math.max(0.4, roof + 0.5)) return;
    const { x, z } = c.g.position;
    this.stats.downed++;
    this.remove(c);
    d.crash(x, z, c.kind);
  }
}
