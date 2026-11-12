// v22.5 enemy snipers: deterministic rooftop posts over key junctions (same on every client), active by day.
// Exposed player in a zone → scope glint + red laser for AIM_T s → shot. Break line of sight (arcades, cars,
// alleys, indoors) to lose the lock. Killing the sniper (scoped rifle, or climbing to the roof) clears the zone.
import * as THREE from 'three';
import type { V2, Bld } from '../core/world';

export type Post = {
  id: string;
  name: string;
  j: V2;
  b: Bld;
  p: V2;
  y: number;
  r: number;
  /** v24.31 on the roof, or at a window of the top floor (only where the building has stairs to get there) */
  kind?: 'roof' | 'window';
};
export type Sniper = Post & {
  hp: number;
  dead: boolean;
  st: 'idle' | 'aim' | 'cool';
  t: number;
  rig?: any;
  laser: THREE.Line;
  glint: THREE.Sprite;
};
export const AIM_T = 1.6;
const DAY = (gm: number) => {
  const h = (gm / 60) % 24;
  return h >= 6 && h < 18.5;
};
export const sniperActive = DAY;

/** intersections of named main roads (sorted, deterministic), then the tallest building 12–50 m from each */
export function findPosts(
  roads: { p: V2[]; n: string }[],
  blds: Bld[],
  want = ['西園路', '和平西路', '康定路', '中華路', '環河南路', '桂林路'],
  max = 5,
  /** v24.31 which buildings have stairs, and the height of their top floor: every other post there is at a window */
  o?: { stairs: (b: Bld) => boolean; topY: (b: Bld) => number },
): Omit<Post, 'r'>[] {
  const X: { j: V2; name: string }[] = [];
  const inter = (a: V2, b: V2, c: V2, d: V2): V2 | null => {
    const r = [b[0] - a[0], b[1] - a[1]],
      s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den,
      u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
  };
  const named = roads.filter(r => want.some(w => r.n.includes(w)) && !/巷|弄/.test(r.n));
  for (let i = 0; i < named.length; i++)
    for (let k = i + 1; k < named.length; k++) {
      const A = named[i],
        B = named[k];
      if (A.n === B.n) continue;
      for (let a = 0; a + 1 < A.p.length; a++)
        for (let b = 0; b + 1 < B.p.length; b++) {
          const q = inter(A.p[a], A.p[a + 1], B.p[b], B.p[b + 1]);
          if (q && !X.some(x => Math.hypot(x.j[0] - q[0], x.j[1] - q[1]) < 60))
            X.push({ j: q, name: [A.n, B.n].sort().join('／') });
        }
    }
  X.sort(
    (a, b) => want.findIndex(w => a.name.includes(w)) - want.findIndex(w => b.name.includes(w)) || a.j[0] - b.j[0],
  );
  const out: Omit<Post, 'r'>[] = [];
  const used = new Set<Bld>();
  for (const x of X) {
    if (out.length >= max) break;
    const b = blds
      .filter(b => b.h >= 9 && !used.has(b))
      .map(b => [b, Math.hypot(b.c[0] - x.j[0], b.c[1] - x.j[1])] as const)
      .filter(([, d]) => d > 12 && d < 50)
      .sort((p, q) => q[0].h - p[0].h || p[1] - q[1])[0]?.[0];
    if (!b) continue;
    used.add(b);
    // roof corner closest to the junction, pulled 0.6 m inside the parapet
    let best = b.pts[0],
      bd = 1e9;
    for (const p of b.pts) {
      const d = Math.hypot(p[0] - x.j[0], p[1] - x.j[1]);
      if (d < bd) ((bd = d), (best = p));
    }
    const k = 0.6 / (Math.hypot(b.c[0] - best[0], b.c[1] - best[1]) || 1);
    if (o && out.length % 2 === 1 && o.stairs(b)) {
      // a window of the top floor: the middle of the wall that faces the junction, a step back from the glass
      let mid: V2 = b.pts[0],
        md = 1e9;
      for (let i = 0; i < b.pts.length; i++) {
        const a = b.pts[i],
          c = b.pts[(i + 1) % b.pts.length];
        if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 2.5) continue;
        const m: V2 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
        const d = Math.hypot(m[0] - x.j[0], m[1] - x.j[1]);
        if (d < md) ((md = d), (mid = m));
      }
      const kw = 0.9 / (Math.hypot(b.c[0] - mid[0], b.c[1] - mid[1]) || 1);
      out.push({
        id: 'snp' + out.length,
        name: x.name,
        j: x.j,
        b,
        p: [mid[0] + (b.c[0] - mid[0]) * kw, mid[1] + (b.c[1] - mid[1]) * kw],
        y: o.topY(b),
        kind: 'window',
      });
      continue;
    }
    out.push({
      id: 'snp' + out.length,
      name: x.name,
      j: x.j,
      b,
      p: [best[0] + (b.c[0] - best[0]) * k, best[1] + (b.c[1] - best[1]) * k],
      y: b.h,
      kind: 'roof',
    });
  }
  return out;
}

export type SniperDeps = {
  scene: THREE.Scene;
  rig: () => any;
  animate: (rig: any, a: string, dt: number) => void;
  /** can the sniper at (sx,sz,sy) see the player? (outside, not under cover, line of sight) */
  sees: (s: Sniper) => boolean;
  player: () => THREE.Vector3;
  hurt: (dmg: number, s: Sniper) => void;
  warn: (on: boolean, s?: Sniper) => void;
  sound: (k: 'shot' | 'lock', s?: Sniper) => void;
  cleared: (s: Sniper) => void;
};
let glintTex: THREE.Texture | null = null;
function glintTexture() {
  if (glintTex) return glintTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,240,200,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#fff';
  g.fillRect(30, 0, 4, 64);
  g.fillRect(0, 30, 64, 4);
  return (glintTex = new THREE.CanvasTexture(c));
}
export class SniperSys {
  list: Sniper[] = [];
  lock: Sniper | null = null;
  constructor(
    posts: Omit<Post, 'r'>[],
    private D: SniperDeps,
    dead: string[] = [],
  ) {
    for (const p of posts) {
      const laser = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.85, depthTest: false }),
      );
      laser.renderOrder = 8;
      laser.visible = false;
      laser.frustumCulled = false;
      D.scene.add(laser);
      const glint = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glintTexture(),
          color: 0xffffff,
          transparent: true,
          depthTest: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glint.renderOrder = 9;
      glint.visible = false;
      glint.position.set(p.p[0], p.y + 1.1, p.p[1]);
      D.scene.add(glint);
      const s: Sniper = { ...p, r: 60, hp: 100, dead: dead.includes(p.id), st: 'idle', t: 0, laser, glint };
      if (!s.dead) {
        s.rig = D.rig();
        s.rig.root.position.set(p.p[0], p.y, p.p[1]);
        s.rig.root.rotation.y = Math.atan2(p.j[0] - p.p[0], p.j[1] - p.p[1]);
      }
      this.list.push(s);
    }
  }
  inZone(x: number, z: number) {
    return this.list.find(s => !s.dead && Math.hypot(s.j[0] - x, s.j[1] - z) < s.r) || null;
  }
  /** a hit from the player's rifle; head = instant kill */
  hit(s: Sniper, dmg: number, head: boolean) {
    if (s.dead) return;
    s.hp -= head ? 999 : dmg;
    s.st = 'cool';
    s.t = 3;
    if (s.hp <= 0) this.kill(s);
  }
  kill(s: Sniper) {
    s.dead = true;
    s.laser.visible = s.glint.visible = false;
    if (s.rig) s.rig.root.rotation.x = -Math.PI / 2;
    if (this.lock === s) ((this.lock = null), this.D.warn(false));
    this.D.cleared(s);
  }
  update(dt: number, gm: number) {
    const P = this.D.player();
    let lock: Sniper | null = null;
    const day = DAY(gm);
    for (const s of this.list) {
      if (s.dead) continue;
      if (s.rig) this.D.animate(s.rig, 'aim', dt);
      const inR = Math.hypot(P.x - s.p[0], P.z - s.p[1]) < s.r + 25 && Math.hypot(P.x - s.j[0], P.z - s.j[1]) < s.r;
      const see = day && inR && this.D.sees(s);
      if (s.rig && see) s.rig.root.rotation.y = Math.atan2(P.x - s.p[0], P.z - s.p[1]);
      s.t -= dt;
      if (s.st === 'cool') {
        if (s.t <= 0) s.st = 'idle';
      } else if (s.st === 'idle') {
        if (see) ((s.st = 'aim'), (s.t = AIM_T), this.D.sound('lock', s));
      } else if (s.st === 'aim') {
        if (!see) s.st = 'idle';
        else if (s.t <= 0) {
          this.D.sound('shot', s);
          this.D.hurt(38 + ((s.id.charCodeAt(3) * 7) % 10), s);
          s.st = 'cool';
          s.t = 3.5;
        }
      }
      const aiming = s.st === 'aim';
      s.laser.visible = aiming;
      s.glint.visible = aiming || (day && inR && Math.sin(performance.now() / 300 + s.p[0]) > 0.6);
      if (s.glint.visible) {
        const k = aiming ? 1.2 + Math.sin(performance.now() / 60) * 0.5 : 0.7;
        s.glint.scale.set(k, k, k);
      }
      if (aiming) {
        lock = s;
        const a = s.laser.geometry.attributes.position as THREE.BufferAttribute;
        a.setXYZ(0, s.p[0], s.y + 1.2, s.p[1]);
        a.setXYZ(1, P.x, P.y + 1.3, P.z); // (P.y: the floor or roof the player stands on)
        a.needsUpdate = true;
        (s.laser.material as THREE.LineBasicMaterial).opacity = 0.4 + 0.6 * (1 - Math.max(0, s.t) / AIM_T);
      }
    }
    if (lock !== this.lock) this.D.warn(!!lock, lock || undefined);
    this.lock = lock;
  }
}
