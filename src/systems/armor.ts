import { tr } from '../i18n';
// PLA armour on main roads (generic low-poly, no real insignia): ZBD-05 / ZTD-05 amphibious tracked, ZBL-08 8x8, Dongfeng Mengshi 4x4.
// Small arms cannot hurt them; hit(x,z,dmg,antiArmor) is the hook for FPV drones / AT weapons.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
type V2 = [number, number];
type G = THREE.BufferGeometry;
export type ArmorKind = 'zbd05' | 'ztd05' | 'zbl08' | 'mengshi';
export const ARMOR_NAME: Record<ArmorKind, string> = {
  zbd05: tr('ZBD-05 兩棲步兵戰車', 'ZBD-05 amphibious IFV'),
  ztd05: tr('ZTD-05 兩棲突擊車', 'ZTD-05 amphibious assault vehicle'),
  zbl08: tr('ZBL-08 輪式步兵戰車', 'ZBL-08 wheeled IFV'),
  mengshi: tr('東風猛士 輕型車', 'Dongfeng Mengshi light vehicle'),
};
const col = (g: G, c: number) => {
  const n = g.getAttribute('position').count,
    a = new Float32Array(n * 3),
    cc = new THREE.Color(c);
  for (let i = 0; i < n; i++) cc.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
};
const bx = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return col(g, c);
};
const cyl = (
  r: number,
  l: number,
  x: number,
  y: number,
  z: number,
  c: number,
  axis: 'x' | 'z' | 'y' = 'z',
  seg = 10,
) => {
  const g = new THREE.CylinderGeometry(r, r, l, seg);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return col(g, c);
};
// woodland digital camo texture (generic)
let camoTex: THREE.Texture | null = null;
function camo() {
  if (camoTex) return camoTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#4a5636';
  x.fillRect(0, 0, 128, 128);
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const [cl, n] of [
    ['#323d24', 90],
    ['#66654a', 60],
    ['#23271c', 40],
  ] as const) {
    x.fillStyle = cl;
    for (let i = 0; i < n; i++) {
      const px = Math.floor(r() * 32) * 4,
        py = Math.floor(r() * 32) * 4;
      x.fillRect(px, py, 4 * (1 + Math.floor(r() * 3)), 4 * (1 + Math.floor(r() * 2)));
    }
  }
  camoTex = new THREE.CanvasTexture(c);
  camoTex.wrapS = camoTex.wrapT = THREE.RepeatWrapping;
  camoTex.colorSpace = THREE.SRGBColorSpace;
  camoTex.magFilter = THREE.NearestFilter;
  return camoTex;
}
const boxUV = (g: G) => {
  const p = g.getAttribute('position'),
    n = g.getAttribute('normal'),
    uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i));
    const u = ax > 0.5 ? p.getZ(i) : p.getX(i),
      v = ay > 0.5 ? p.getZ(i) : p.getY(i);
    uv[i * 2] = u * 0.5;
    uv[i * 2 + 1] = v * 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
};
const DARK = 0x22251e,
  HULL = 0xc8ccbc,
  MET = 0x3a3d36,
  TYRE = 0x161616;
function trackedHull(P: G[], D: G[]) {
  // ZBD-05/ZTD-05: long low boat-like hull, sloped bow, 6 road wheels a side
  const L = 9.5,
    W = 3.3;
  P.push(bx(L - 2, 1.3, W, -0.3, 1.25, 0, HULL));
  const bow = new THREE.BoxGeometry(2.6, 1.3, W);
  const bp = bow.getAttribute('position');
  for (let i = 0; i < bp.count; i++) if (bp.getX(i) > 0) bp.setY(i, bp.getY(i) > 0 ? bp.getY(i) : bp.getY(i) + 0.9);
  bow.translate(L / 2 - 1.3, 1.25, 0);
  P.push(col(bow, HULL));
  P.push(bx(L - 1.2, 0.18, W + 0.3, 0, 1.92, 0, HULL)); // deck lip
  for (const s of [-1, 1]) {
    D.push(bx(L - 1.5, 0.9, 0.55, -0.2, 0.55, s * (W / 2 - 0.1), TYRE));
    for (let i = 0; i < 6; i++) D.push(cyl(0.38, 0.6, -3.6 + i * 1.35, 0.45, s * (W / 2 - 0.1), MET));
    D.push(cyl(0.3, 0.62, 3.9, 0.85, s * (W / 2 - 0.1), MET));
  }
  D.push(bx(0.08, 0.5, 2.6, 4.75, 1.8, 0, DARK)); // trim vane
  for (let i = 0; i < 3; i++) D.push(bx(0.5, 0.2, 0.4, -4.2, 1.95, -1 + i, DARK)); // rear hatches
}
export function makeMesh(kind: ArmorKind) {
  const P: G[] = [],
    D: G[] = [],
    T: G[] = [];
  if (kind === 'zbd05' || kind === 'ztd05') {
    trackedHull(P, D);
    if (kind === 'zbd05') {
      T.push(bx(2.2, 0.8, 2.2, 0.6, 2.4, 0, HULL));
      D.push(cyl(0.08, 2.8, 2.1, 2.5, 0, DARK, 'x', 6), bx(0.6, 0.35, 0.3, 0.2, 2.6, 1.25, DARK));
    } else {
      T.push(bx(3.2, 0.9, 2.8, 0.2, 2.45, 0, HULL), bx(1.2, 0.6, 2.4, -1.8, 2.35, 0, HULL));
      D.push(cyl(0.11, 5.4, 4.3, 2.55, 0, DARK, 'x', 8), cyl(0.18, 0.7, 6.6, 2.55, 0, DARK, 'x', 8));
    }
    D.push(cyl(0.05, 1.2, -0.3, 3.2, -0.7, DARK, 'x', 5));
  }
  if (kind === 'zbl08') {
    const L = 8,
      W = 3;
    P.push(bx(L - 1.4, 1.5, W, -0.4, 1.6, 0, HULL));
    const bow = new THREE.BoxGeometry(1.8, 1.5, W);
    const bp = bow.getAttribute('position');
    for (let i = 0; i < bp.count; i++) if (bp.getX(i) > 0 && bp.getY(i) < 0) bp.setX(i, bp.getX(i) - 0.9);
    bow.translate(L / 2 - 1.2, 1.6, 0);
    P.push(col(bow, HULL));
    for (const s of [-1, 1])
      for (const x of [-2.9, -1.5, 1.2, 2.6]) D.push(cyl(0.55, 0.45, x, 0.55, s * (W / 2 - 0.05), TYRE, 'z', 12));
    T.push(bx(2, 0.7, 2, 0.4, 2.7, 0, HULL));
    D.push(cyl(0.07, 2.4, 1.9, 2.75, 0, DARK, 'x', 6));
  }
  if (kind === 'mengshi') {
    P.push(bx(4.9, 1.0, 2.2, 0, 1.0, 0, HULL), bx(2.6, 0.9, 2.1, -0.6, 1.95, 0, HULL));
    D.push(bx(0.05, 0.6, 1.9, 0.72, 1.95, 0, 0x1a2228, 0, 0.35));
    for (const s of [-1, 1]) for (const x of [-1.6, 1.6]) D.push(cyl(0.48, 0.4, x, 0.48, s * 1.05, TYRE, 'z', 12));
    T.push(bx(0.7, 0.4, 0.7, -0.6, 2.6, 0, MET));
    D.push(cyl(0.05, 1.3, 0.1, 2.75, 0, DARK, 'x', 5));
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: camo(), roughness: 0.85, metalness: 0.15 });
  const dmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.3 });
  // v24.22 never cut away by the see-through cylinder: you may be sitting inside this one
  mat.userData.noOcc = dmat.userData.noOcc = true;
  const g = new THREE.Group();
  const hull = new THREE.Mesh(boxUV(mergeGeometries(P)), mat),
    dk = new THREE.Mesh(mergeGeometries(D), dmat);
  const tur = new THREE.Group();
  const tm = new THREE.Mesh(boxUV(mergeGeometries(T)), mat);
  tur.add(tm);
  for (const m of [hull, dk, tm]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  g.add(hull, dk, tur);
  // hull number (generic, white stencil)
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 48;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e8e8e0';
  x.font = 'bold 40px sans-serif';
  x.fillText(String(100 + Math.floor(Math.random() * 800)), 10, 40);
  const nm = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  nm.userData.noOcc = true;
  for (const s of [-1, 1]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.38), nm);
    pl.position.set(
      kind === 'mengshi' ? 1.2 : 2,
      kind === 'mengshi' ? 1.1 : 1.6,
      s * (kind === 'mengshi' ? 1.11 : kind === 'zbl08' ? 1.51 : 1.66),
    );
    pl.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(pl);
  }
  return { g, tur, mats: [mat, dmat] };
}
const burnt = new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: 1, metalness: 0.2 }),
  rust = new THREE.MeshStandardMaterial({ color: 0x4a2a1a, roughness: 1 });
function burn(g: THREE.Object3D) {
  let i = 0;
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m.material as any).map?.image?.width) {
    }
    if (m.isMesh) m.material = i++ % 3 === 2 ? rust : burnt;
  });
}

export type Armor = {
  kind: ArmorKind;
  g: THREE.Group;
  tur: THREE.Group;
  route: V2[];
  seg: number;
  t: number;
  dir: number;
  hp: number;
  dead: boolean;
  fireCd: number;
  spot: number;
  alerted: boolean;
  speed: number;
  stop: number;
};
export class ArmorSystem {
  list: Armor[] = [];
  wrecks: THREE.Object3D[] = [];
  tracers: THREE.LineSegments;
  tp = new Float32Array(6 * 8);
  smoke: THREE.Points[] = [];
  audio?: { ctx: AudioContext; g: GainNode };
  heard = false;
  constructor(
    public scene: THREE.Scene,
    public deps: {
      canSee: (ax: number, az: number, bx: number, bz: number) => boolean;
      hurt: (d: number, from: string) => void;
      alert: (x: number, z: number) => void;
      log: (m: string, c?: string) => void;
      player: () => THREE.Vector3;
      /** v24.22 the crew has abandoned it: true if it should leave the fight as something the player can take */
      bail?: (a: Armor) => boolean;
    },
  ) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.tp, 3));
    this.tracers = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.9 }),
    );
    this.tracers.frustumCulled = false;
    this.tracers.visible = false;
    scene.add(this.tracers);
  }
  spawn(kind: ArmorKind, route: V2[], seg = 0) {
    const { g, tur } = makeMesh(kind);
    this.scene.add(g);
    const a: Armor = {
      kind,
      g,
      tur,
      route,
      seg,
      t: 0,
      dir: 1,
      hp: kind === 'mengshi' ? 40 : 100,
      dead: false,
      fireCd: 0,
      spot: 0,
      alerted: false,
      speed: kind === 'mengshi' ? 7 : 4.5,
      stop: 0,
    };
    this.place(a);
    this.list.push(a);
    return a;
  }
  wreck(kind: ArmorKind, x: number, z: number, ang: number) {
    const { g } = makeMesh(kind);
    g.position.set(x, 0, z);
    g.rotation.y = ang;
    g.children[2].rotation.y = 0.7;
    g.children[2].position.y = -0.15;
    burn(g);
    this.scene.add(g);
    this.wrecks.push(g);
    this.addSmoke(x, z, false);
  }
  addSmoke(x: number, z: number, thick: boolean) {
    const n = thick ? 40 : 14,
      p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = x + (Math.random() - 0.5);
      p[i * 3 + 1] = Math.random() * 12;
      p[i * 3 + 2] = z + (Math.random() - 0.5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: thick ? 0x222222 : 0x555555,
        size: thick ? 3 : 2,
        transparent: true,
        opacity: thick ? 0.55 : 0.3,
        depthWrite: false,
      }),
    );
    (pts as any).base = [x, z];
    this.scene.add(pts);
    this.smoke.push(pts);
  }
  place(a: Armor) {
    const p = a.route[a.seg],
      q = a.route[a.seg + 1] || p;
    a.g.position.set(p[0] + (q[0] - p[0]) * a.t, 0, p[1] + (q[1] - p[1]) * a.t);
  }
  // Hook: anything that explodes calls this. Small arms (antiArmor=false) never damage armour.
  hit(x: number, z: number, dmg: number, antiArmor: boolean) {
    for (const a of this.list) {
      if (a.dead) continue;
      if (Math.hypot(a.g.position.x - x, a.g.position.z - z) > 4) continue;
      if (!antiArmor) {
        this.deps.log(
          tr(
            '子彈打在裝甲上彈開了——輕兵器無效，快躲進騎樓或巷子！',
            'Your rounds bounced off the armor. Small arms are ineffective. Get under an arcade or into an alley!',
          ),
          '#f99',
        );
        return false;
      }
      a.hp -= dmg;
      if (a.hp <= 0) this.kill(a);
      else if (a.hp <= 30 && this.deps.bail?.(a)) {
        this.scene.remove(a.g);
        this.list.splice(this.list.indexOf(a), 1);
      }
      return true;
    }
    return false;
  }
  kill(a: Armor) {
    a.dead = true;
    burn(a.g);
    a.tur.rotation.z = 0.25;
    this.addSmoke(a.g.position.x, a.g.position.z, true);
    this.wrecks.push(a.g);
    this.deps.log(tr(`${ARMOR_NAME[a.kind]} 被擊毀！`, `${ARMOR_NAME[a.kind]} destroyed!`), '#ffd76a');
  }
  engine(vol: number) {
    try {
      if (!this.audio) {
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 38;
        const o2 = ctx.createOscillator();
        o2.type = 'square';
        o2.frequency.value = 57;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 220;
        const g = ctx.createGain();
        g.gain.value = 0;
        o.connect(f);
        o2.connect(f);
        f.connect(g);
        g.connect(ctx.destination);
        o.start();
        o2.start();
        this.audio = { ctx, g };
      }
      this.audio.g.gain.setTargetAtTime(vol * 0.12, this.audio.ctx.currentTime, 0.3);
    } catch {
      /* audio unavailable */
    }
  }
  update(dt: number) {
    const P = this.deps.player();
    let near = 1e9;
    let tn = 0;
    for (const a of this.list) {
      if (a.dead) continue;
      const pos = a.g.position;
      const d = Math.hypot(P.x - pos.x, P.z - pos.z);
      near = Math.min(near, d);
      // patrol: ping-pong along main-road polyline; brief stops; slow when alerted
      if (a.stop > 0) a.stop -= dt;
      else {
        const p = a.route[a.seg],
          q = a.route[a.seg + 1];
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        a.t += (a.dir * a.speed * (a.alerted ? 0.4 : 1) * dt) / L;
        if (a.t > 1) {
          a.seg++;
          a.t = 0;
          if (a.seg >= a.route.length - 1) {
            a.seg = a.route.length - 2;
            a.t = 1;
            a.dir = -1;
            a.stop = 4;
          }
        } else if (a.t < 0) {
          a.seg--;
          a.t = 1;
          if (a.seg < 0) {
            a.seg = 0;
            a.t = 0;
            a.dir = 1;
            a.stop = 4;
          }
        }
        this.place(a);
        const yaw = Math.atan2(-(q[1] - p[1]) * a.dir, (q[0] - p[0]) * a.dir);
        a.g.rotation.y += (((yaw - a.g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 2);
      }
      // mounted MG: fires at visible player within 38 m
      const see = d < 38 && this.deps.canSee(pos.x, pos.z, P.x, P.z);
      if (see) {
        a.spot += dt;
        const ty = Math.atan2(-(P.z - pos.z), P.x - pos.x) - a.g.rotation.y;
        a.tur.rotation.y += (((ty - a.tur.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 3);
        if (!a.alerted && a.spot > 0.6) {
          a.alerted = true;
          a.stop = 6;
          this.deps.alert(pos.x, pos.z);
          this.deps.log(
            tr(
              `⚠ ${ARMOR_NAME[a.kind]} 發現你！步兵下車搜索——快躲進騎樓或巷子`,
              `⚠ ${ARMOR_NAME[a.kind]} spotted you! Infantry are dismounting to search. Hide under an arcade or in an alley.`,
            ),
            '#f66',
          );
        }
        a.fireCd -= dt;
        if (a.alerted && a.fireCd <= 0) {
          a.fireCd = 0.12;
          if (tn < 8) {
            const o = tn * 6;
            this.tp.set(
              [pos.x, 2.8, pos.z, P.x + (Math.random() - 0.5) * 2, 1 + Math.random(), P.z + (Math.random() - 0.5) * 2],
              o,
            );
            tn++;
          }
          if (Math.random() < 0.13) this.deps.hurt(7 + Math.random() * 6, ARMOR_NAME[a.kind]);
        }
      } else {
        a.spot = Math.max(0, a.spot - dt);
        if (a.spot === 0 && a.alerted && Math.random() < dt * 0.05) a.alerted = false;
      }
    }
    for (let i = tn * 6; i < this.tp.length; i++) this.tp[i] = 0;
    this.tracers.visible = tn > 0;
    (this.tracers.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    for (const s of this.smoke) {
      const p = s.geometry.getAttribute('position') as THREE.BufferAttribute,
        b = (s as any).base;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) + dt * 1.6;
        if (y > 14) {
          y = 0;
          p.setX(i, b[0] + (Math.random() - 0.5));
          p.setZ(i, b[1] + (Math.random() - 0.5));
        } else p.setX(i, p.getX(i) + dt * 0.6);
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    // engine noise: audible & warns player
    const v = near < 90 ? 1 - near / 90 : 0;
    if (v > 0) this.engine(v);
    else if (this.audio) this.engine(0);
    if (near < 60 && !this.heard) {
      this.heard = true;
      this.deps.log(
        tr(
          '聽見履帶與柴油引擎聲……裝甲車在附近大馬路上',
          'Tracks and a diesel engine... An armored vehicle is on a nearby main road.',
        ),
        '#fc9',
      );
    }
    if (near > 100) this.heard = false;
  }
}
