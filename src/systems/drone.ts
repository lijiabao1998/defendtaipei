// FPV kamikaze drone (pilot view w/ analog video look + OSD) and PLA recon drones.
import * as THREE from 'three';
type V2 = [number, number];
export class Recon {
  list: { g: THREE.Group; c: V2; r: number; a: number; h: number; spot: number; cd: number }[] = [];
  audio?: { ctx: AudioContext; g: GainNode; o: OscillatorNode };
  constructor(
    public scene: THREE.Scene,
    public deps: {
      player: () => THREE.Vector3;
      hidden: () => boolean;
      spotted: (p: V2, you?: boolean) => void;
      log: (m: string, c?: string) => void;
      /** v22.11 seconds of exposure before a spot, and re-spot cooldown (night: faster) */
      spotTime?: () => number;
      spotCd?: () => number;
      /** v24.38 not heard (the player is down in a station) */
      muted?: () => boolean;
      /** v24.42 the teammates out in the open (where on the map, and whether out of its sight); spotted() says whether
       *  it was the player it saw */
      others?: () => { p: V2; hidden: boolean }[];
    },
    centres: V2[],
  ) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3e38, roughness: 0.6 }),
      lm = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    for (const c of centres) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), mat);
      g.add(b);
      for (const [x, z] of [
        [0.45, 0.45],
        [-0.45, 0.45],
        [0.45, -0.45],
        [-0.45, -0.45],
      ]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.06), mat);
        arm.position.set(x / 2, 0, z / 2);
        arm.rotation.y = Math.atan2(-z, x);
        g.add(arm);
        const rot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.28, 0.01, 12),
          new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.35 }),
        );
        rot.position.set(x, 0.08, z);
        g.add(rot);
      }
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), lm);
      l.position.y = -0.1;
      g.add(l);
      g.scale.setScalar(1.8);
      scene.add(g);
      this.list.push({
        g,
        c,
        r: 30 + Math.random() * 25,
        a: Math.random() * 6,
        h: 30 + Math.random() * 10,
        spot: 0,
        cd: 0,
      });
    }
  }
  update(dt: number, t: number) {
    const P = this.deps.player();
    let near = 1e9;
    for (const d of this.list) {
      d.a += (dt * 12) / d.r; // drift centre slowly toward player area
      d.c[0] += (P.x - d.c[0]) * dt * 0.004;
      d.c[1] += (P.z - d.c[1]) * dt * 0.004;
      d.g.position.set(d.c[0] + Math.cos(d.a) * d.r, d.h + Math.sin(t * 0.8) * 1.2, d.c[1] + Math.sin(d.a) * d.r);
      d.g.rotation.y = -d.a;
      (d.g.children[d.g.children.length - 1] as THREE.Mesh).visible = Math.sin(t * 6) > 0.4;
      const hd = Math.hypot(P.x - d.g.position.x, P.z - d.g.position.z);
      near = Math.min(near, Math.hypot(hd, d.h));
      d.cd -= dt;
      // the player first; else (v24.42) a teammate in the open under it
      let seen: V2 | null = hd < 24 && !this.deps.hidden() ? [P.x, P.z] : null;
      const you = !!seen;
      if (!seen)
        for (const o of this.deps.others?.() ?? [])
          if (!o.hidden && Math.hypot(o.p[0] - d.g.position.x, o.p[1] - d.g.position.z) < 24) {
            seen = o.p;
            break;
          }
      if (seen) {
        d.spot += dt;
        if (d.spot > (this.deps.spotTime?.() ?? 2.5) && d.cd <= 0) {
          d.cd = this.deps.spotCd?.() ?? 70;
          d.spot = 0;
          this.deps.spotted([seen[0], seen[1]], you);
        }
      } else d.spot = Math.max(0, d.spot - dt * 0.5);
    }
    try {
      if (!this.audio) {
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 230;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1200;
        const g = ctx.createGain();
        g.gain.value = 0;
        o.connect(f);
        f.connect(g);
        g.connect(ctx.destination);
        o.start();
        this.audio = { ctx, g, o };
      }
      const hear = near < 70 && !this.deps.muted?.();
      this.audio.g.gain.setTargetAtTime(hear ? (1 - near / 70) * 0.05 : 0, this.audio.ctx.currentTime, 0.2);
      this.audio.o.frequency.value = 220 + Math.sin(t * 3) * 12;
    } catch {
      /* audio blocked */
    }
    return near;
  }
}

// ---------- explosion visual ----------
let fxHook: ((p: THREE.Vector3, big: number) => void) | null = null;
/** v22.9: route every explosion through the pooled BlastFX (see blastfx.ts) */
export function setBoomFx(f: (p: THREE.Vector3, big: number) => void) {
  fxHook = f;
}
export function boom(scene: THREE.Scene, p: THREE.Vector3, big = 1) {
  if (fxHook) return fxHook(p, big);
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  m.position.copy(p);
  scene.add(m);
  const L = new THREE.PointLight(0xffa040, 60 * big, 30);
  L.position.copy(p).y += 1;
  scene.add(L);
  let t = 0;
  const f = () => {
    t += 0.016;
    m.scale.setScalar(1 + t * 14 * big);
    (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - t * 1.6);
    (m.material as THREE.MeshBasicMaterial).color.setHSL(0.08 - t * 0.08, 1, 0.55 - t * 0.4);
    L.intensity = Math.max(0, 60 * big * (1 - t * 2));
    if (t < 0.6) requestAnimationFrame(f);
    else {
      scene.remove(m, L);
      m.geometry.dispose();
    }
  };
  f();
}
