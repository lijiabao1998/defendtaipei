import { tr } from '../i18n';
// 國軍 (ROC Army) support vehicles — AI only, not player-driven. Low-poly boxy meshes, fictional game use.
// M1A2T (120mm M256), CM-11 Brave Tiger (105mm M68A1), CM-32/34 Clouded Leopard 8x8 (30mm Mk44 on CM34).
import * as THREE from 'three';
type V2 = [number, number];
export type RocKind = 'm1a2t' | 'cm11' | 'cm32';
export const ROC_NAME: Record<RocKind, string> = {
  m1a2t: tr('M1A2T 艾布蘭戰車', 'M1A2T Abrams tank'),
  cm11: tr('CM-11 勇虎戰車', 'CM-11 Brave Tiger tank'),
  cm32: tr('CM-32/34 雲豹甲車', 'CM-32/34 Clouded Leopard armored vehicle'),
};
const green = new THREE.MeshStandardMaterial({ color: 0x4c5638, roughness: 0.85 }),
  dark = new THREE.MeshStandardMaterial({ color: 0x2c3022, roughness: 0.9 }),
  blk = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
function flagTex() {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fe0000';
  g.fillRect(0, 0, 96, 64);
  g.fillStyle = '#000095';
  g.fillRect(0, 0, 48, 32);
  g.fillStyle = '#fff';
  g.translate(24, 16);
  for (let i = 0; i < 12; i++) {
    g.rotate(Math.PI / 6);
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(3, -6);
    g.lineTo(-3, -6);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, 6.5, 0, 7);
  g.fill();
  g.fillStyle = '#000095';
  g.beginPath();
  g.arc(0, 0, 5.5, 0, 7);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(0, 0, 4.6, 0, 7);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let FLAG: THREE.Texture | null = null;
/** v24.3 a 國旗 on a steel pole (remnant positions): pole 3.2 m, flag 1.2 × 0.8 m, double-sided */
export function flagPole() {
  FLAG = FLAG || flagTex();
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 3.2, 6), dark);
  pole.position.y = 1.6;
  pole.castShadow = true;
  const fl = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 0.8),
    new THREE.MeshStandardMaterial({ map: FLAG, side: THREE.DoubleSide, roughness: 0.8 }),
  );
  fl.position.set(0.62, 2.75, 0);
  fl.rotation.y = 0.35; // a little wind
  fl.castShadow = true;
  g.add(pole, fl);
  return g;
}
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = true;
  return b;
};
export function makeRoc(kind: RocKind) {
  const g = new THREE.Group(),
    tur = new THREE.Group();
  if (kind === 'cm32') {
    g.add(box(2.7, 1.3, 7.0, green, 0, 1.35, 0));
    const nose = box(2.6, 0.8, 1.2, green, 0, 1.0, 3.6);
    nose.rotation.x = 0.5;
    g.add(nose);
    for (let i = 0; i < 4; i++)
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12), blk);
        w.rotation.z = Math.PI / 2;
        w.position.set(s * 1.3, 0.55, -2.4 + i * 1.6);
        g.add(w);
      }
    tur.add(box(1.3, 0.55, 1.5, dark, 0, 0, 0), box(0.12, 0.12, 2.0, blk, 0, 0.05, 1.6));
    tur.position.set(0, 2.25, 0.6);
  } else {
    const L = kind === 'm1a2t' ? 7.9 : 6.9,
      W = kind === 'm1a2t' ? 3.6 : 3.4;
    g.add(box(W, 1.1, L, green, 0, 1.05, 0), box(W + 0.2, 0.9, L - 0.6, blk, 0, 0.5, 0));
    for (const s of [-1, 1])
      for (let i = 0; i < 6; i++) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), dark);
        w.rotation.z = Math.PI / 2;
        w.position.set(s * (W / 2 + 0.12), 0.45, -L / 2 + 0.8 + (i * (L - 1.6)) / 5);
        g.add(w);
      }
    if (kind === 'm1a2t') {
      tur.add(box(3.1, 0.8, 3.9, green, 0, 0, -0.3));
      const fr = box(3.1, 0.6, 0.8, green, 0, -0.05, 1.9);
      fr.rotation.x = -0.35;
      tur.add(fr);
      tur.add(box(0.75, 0.35, 0.8, dark, 0.8, 0.55, -0.6));
    } else {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), green);
      dome.scale.set(1, 0.55, 1.25);
      dome.castShadow = true;
      tur.add(dome);
      tur.add(box(0.6, 0.4, 0.6, dark, 0.6, 0.75, -0.3));
    }
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, kind === 'm1a2t' ? 5.6 : 4.8, 8), dark);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(0, 0.1, kind === 'm1a2t' ? 4.4 : 3.8);
    tur.add(gun);
    tur.position.set(0, 2.0, kind === 'm1a2t' ? -0.4 : 0);
  }
  FLAG = FLAG || flagTex();
  const pole = box(0.04, 2.2, 0.04, blk, -1.0, 1.1, -1.2);
  const fl = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.6),
    new THREE.MeshStandardMaterial({ map: FLAG, side: THREE.DoubleSide, roughness: 0.9 }),
  );
  fl.position.set(-1.0, 1.9, -1.65);
  fl.rotation.y = Math.PI / 2;
  tur.add(pole, fl);
  g.add(tur);
  return { g, tur, flag: fl };
}
export type RocUnit = {
  kind: RocKind;
  g: THREE.Group;
  tur: THREE.Group;
  flag: THREE.Mesh;
  route: V2[];
  seg: number;
  t: number;
  cd: number;
  life: number;
  leaving: boolean;
};
type Tgt = { x: number; z: number; kind: 'armor' | 'sol' | 'post'; ref: unknown };
export class RocSystem {
  list: RocUnit[] = [];
  fx: { m: THREE.Object3D; t: number }[] = [];
  constructor(
    public scene: THREE.Scene,
    public d: {
      targets: () => Tgt[];
      fire: (t: Tgt, from: THREE.Vector3) => void;
      los: (a: V2, b: V2) => boolean;
      log: (m: string, c?: string) => void;
    },
  ) {}
  spawn(kind: RocKind, route: V2[], life = 150, delay = 0) {
    const { g, tur, flag } = makeRoc(kind);
    g.position.set(route[0][0], 0, route[0][1]);
    this.scene.add(g);
    const u = { kind, g, tur, flag, route, seg: 0, t: -delay, cd: 1.5 + Math.random(), life, leaving: false };
    this.list.push(u);
    return u;
  }
  update(dt: number) {
    const tg = this.d.targets();
    for (const u of this.list) {
      u.t += dt;
      u.life -= dt;
      u.flag.rotation.x = Math.sin(u.t * 5) * 0.15;
      if (u.t < 0) {
        u.g.visible = false;
        continue;
      }
      u.g.visible = true;
      const P = u.g.position;
      let tgt: Tgt | null = null,
        bd = 1e9;
      for (const t of tg) {
        const dd = Math.hypot(t.x - P.x, t.z - P.z);
        const rng = t.kind === 'armor' ? 110 : t.kind === 'post' ? 60 : 50;
        if (dd < rng && dd < bd && this.d.los([P.x, P.z], [t.x, t.z])) {
          bd = dd;
          tgt = t;
        }
      }
      // advance along the road unless engaging something close
      if ((!tgt || bd > 30) && u.seg < u.route.length - 1) {
        const a = u.route[u.seg],
          b = u.route[u.seg + 1];
        const dx = b[0] - P.x,
          dz = b[1] - P.z,
          L = Math.hypot(dx, dz);
        const sp = 5.5 * dt;
        if (L < sp) {
          P.set(b[0], 0, b[1]);
          u.seg++;
        } else {
          P.x += (dx / L) * sp;
          P.z += (dz / L) * sp;
          const want = Math.atan2(dx, dz);
          let dh = want - u.g.rotation.y;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          u.g.rotation.y += dh * Math.min(1, dt * 3);
        }
        void a;
      }
      if (tgt) {
        const want = Math.atan2(tgt.x - P.x, tgt.z - P.z) - u.g.rotation.y;
        let dh = want - u.tur.rotation.y;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        u.tur.rotation.y += dh * Math.min(1, dt * 4);
        u.cd -= dt;
        if (u.cd <= 0 && Math.abs(dh) < 0.25) {
          u.cd = u.kind === 'cm32' ? 1.2 : 3.2;
          this.muzzle(u);
          this.d.fire(tgt, P.clone().setY(2.2));
        }
      }
      if (u.life <= 0 && !u.leaving) {
        u.leaving = true;
        this.d.log(
          tr(
            `${ROC_NAME[u.kind]} 完成支援，撤離戰區`,
            `${ROC_NAME[u.kind]} has completed support and is leaving the combat zone`,
          ),
          '#9cf',
        );
      }
    }
    for (const u of this.list.filter(u => u.leaving)) {
      u.g.position.y -= dt * 0;
      u.g.traverse(o => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && !m.userData.fade) {
          /* keep shared mats */
        }
      });
      if (u.life < -4) {
        this.scene.remove(u.g);
      }
    }
    this.list = this.list.filter(u => u.life > -4);
    for (const f of this.fx) {
      f.t -= dt;
      f.m.scale.multiplyScalar(1 + dt * 3);
    }
    this.fx = this.fx.filter(f => {
      if (f.t > 0) return true;
      this.scene.remove(f.m);
      return false;
    });
  }
  muzzle(u: RocUnit) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 }),
    );
    const p = new THREE.Vector3(0, 0.1, u.kind === 'm1a2t' ? 7.3 : u.kind === 'cm11' ? 6.3 : 2.7);
    u.tur.localToWorld(p);
    m.position.copy(p);
    this.scene.add(m);
    this.fx.push({ m, t: 0.12 });
  }
}
