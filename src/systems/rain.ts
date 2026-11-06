// v24.11 台北的雨 — what the rain looks like at street level: rings where every drop lands, water curtains
// pouring off the 騎樓 eaves, lightning before the thunder, and the clear convenience-store umbrella.
// Two draw calls (splash rings, eave streaks) plus a CSS flash overlay; nothing is built while it is dry.
import * as THREE from 'three';
import { GF, type Arc } from '../map/arcade';

type V2 = [number, number];
export type RainDeps = {
  /** under a roof (core or district building, arcades included) */
  indoorAt: (x: number, z: number) => boolean;
  /** street / raised-walk height */
  groundY: (x: number, z: number) => number;
};
const NS = 300, // splash rings in flight
  ND = 1400, // eave streaks
  CELL = 20,
  NEAR = 26; // eave curtains drawn within this distance of the player
const LIFE = 0.32;
const fract = (v: number) => v - Math.floor(v);
const h1 = (k: number) => fract(Math.sin(k * 12.9898) * 43758.5453);
const h2 = (k: number) => fract(Math.sin(k * 78.233 + 1.7) * 24634.6345);

export class RainFx {
  readonly group = new THREE.Group();
  /** CSS overlay for the lightning flash (inserted by the caller just after the canvas) */
  readonly flashEl: HTMLDivElement;
  /** lightning light boost 0..1 this frame (the caller adds it to the ambient light) */
  flashK = 0;
  readonly stats = { splash: 0, drips: 0, flash: 0, fronts: 0 };
  private sp: THREE.InstancedMesh;
  private spT = new Float32Array(NS).fill(-1);
  private spP = new Float32Array(NS * 3);
  private spHead = 0;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private drip: THREE.LineSegments;
  private dripPos = new Float32Array(ND * 6);
  private dripMat: THREE.LineBasicMaterial;
  private cells = new Map<string, number[]>();
  /** nearby eave points: x, z, ground y, seed */
  private near: number[] = [];
  private prevY = new Float32Array(ND);
  private nearAt: V2 = [1e9, 1e9];
  private t = 0;
  private flashT = -1;
  private flashS = 1;
  private acc = 0;
  constructor(private D: RainDeps) {
    const ring = new THREE.RingGeometry(0.045, 0.07, 14).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sp = new THREE.InstancedMesh(ring, mat, NS);
    this.sp.frustumCulled = false;
    this.sp.userData.noChunk = true;
    this.sp.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < NS; i++) {
      this.sp.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.sp.setColorAt(i, this.c.setRGB(0, 0, 0));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.dripPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.dripMat = new THREE.LineBasicMaterial({ color: 0xe6eef6, transparent: true, opacity: 0, depthWrite: false });
    this.drip = new THREE.LineSegments(g, this.dripMat);
    this.drip.frustumCulled = false;
    this.drip.userData.noChunk = true;
    this.group.add(this.sp, this.drip);
    this.group.visible = false;
    const el = document.createElement('div');
    el.id = 'lightning';
    el.style.cssText =
      'position:fixed;inset:0;pointer-events:none;opacity:0;mix-blend-mode:screen;' +
      'background:radial-gradient(ellipse at 62% 18%,rgba(240,244,255,.95),rgba(196,206,236,.6) 55%,rgba(150,160,205,.4))';
    this.flashEl = el;
  }
  /** the 騎樓 fronts: water runs down the upper facade and pours off the arcade's outer beam */
  setFronts(fronts: Arc[]) {
    this.cells.clear();
    let n = 0;
    for (const A of fronts) {
      const { a, ux, uz, nx, nz, dl } = A;
      for (let s = 0.2; s < dl - 0.15; s += 0.22) {
        const x = a[0] + ux * s + nx * 0.12,
          z = a[1] + uz * s + nz * 0.12;
        const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
        let L = this.cells.get(k);
        if (!L) this.cells.set(k, (L = []));
        L.push(x, z);
        n++;
      }
    }
    this.stats.fronts = n;
    this.nearAt = [1e9, 1e9];
  }
  /** lightning: two quick pulses and a fading afterglow (scale < 1 indoors) */
  flash(scale = 1) {
    this.flashT = 0;
    this.flashS = scale;
    this.stats.flash++;
  }
  private spawn(x: number, y: number, z: number) {
    const i = this.spHead;
    this.spHead = (i + 1) % NS;
    this.spT[i] = 0;
    this.spP[i * 3] = x;
    this.spP[i * 3 + 1] = y;
    this.spP[i * 3 + 2] = z;
    this.stats.splash++;
  }
  private gather(px: number, pz: number) {
    this.nearAt = [px, pz];
    const N: number[] = [];
    const c0x = Math.floor((px - NEAR) / CELL),
      c1x = Math.floor((px + NEAR) / CELL),
      c0z = Math.floor((pz - NEAR) / CELL),
      c1z = Math.floor((pz + NEAR) / CELL);
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cz = c0z; cz <= c1z; cz++) {
        const L = this.cells.get(cx + ',' + cz);
        if (!L) continue;
        for (let j = 0; j < L.length && N.length < ND * 4; j += 2) {
          const x = L[j],
            z = L[j + 1];
          if (Math.abs(x - px) > NEAR || Math.abs(z - pz) > NEAR) continue;
          N.push(x, z, this.D.groundY(x, z), (x * 7.13 + z * 3.71) % 97);
        }
      }
    this.near = N;
    this.prevY.fill(1e9);
  }
  /**
   * amt: how hard it is raining right now (0..1), int: this shower's intensity (drizzle ~0.4, 西北雨 1),
   * street: the player is on the street map (not upstairs, not underground)
   */
  update(dt: number, amt: number, int: number, px: number, pz: number, street: boolean) {
    this.t += dt;
    // lightning envelope
    if (this.flashT >= 0) {
      const t = (this.flashT += dt);
      const k = t < 0.06 ? 0.9 : t < 0.13 ? 0.15 : t < 0.2 ? 0.7 : 0.7 * Math.exp(-(t - 0.2) * 8);
      this.flashK = k * this.flashS;
      if (t > 0.9) ((this.flashT = -1), (this.flashK = 0));
    } else this.flashK = 0;
    this.flashEl.style.opacity = this.flashK > 0.004 ? (this.flashK * 0.55).toFixed(3) : '0';
    const on = street && amt > 0.03;
    if (!on && !this.group.visible) return;
    this.group.visible = on || this.spT.some(v => v >= 0);
    // splash rings: rate follows the rain; none under a roof
    if (on) {
      this.acc += dt * 700 * amt * (0.35 + 0.65 * int);
      let tries = 0;
      while (this.acc >= 1 && tries++ < 40) {
        this.acc -= 1;
        const x = px + (Math.random() - 0.5) * 56,
          z = pz + (Math.random() - 0.5) * 56;
        if (this.D.indoorAt(x, z)) continue;
        this.spawn(x, this.D.groundY(x, z) + 0.03, z);
      }
      if (this.acc > 40) this.acc = 0;
    }
    // eave curtains (only where there are arcades nearby)
    let nd = 0;
    if (on && this.cells.size) {
      if (Math.hypot(px - this.nearAt[0], pz - this.nearAt[1]) > 3) this.gather(px, pz);
      const N = this.near,
        dens = 0.3 + 0.7 * int,
        v = 8 + 3 * int,
        len = 0.8 + 0.6 * int;
      for (let j = 0, k = 0; j < N.length && nd < ND; j += 4, k++) {
        const seed = N[j + 3];
        if (h1(seed + k) > dens) continue;
        const x = N[j] + (h2(seed) - 0.5) * 0.12,
          z = N[j + 1] + (h2(seed + 3) - 0.5) * 0.12,
          gy = N[j + 2];
        const y = gy + GF - fract((this.t * v) / GF + h2(seed + k)) * GF;
        if (y > this.prevY[nd] + 0.5 && Math.random() < 0.35) this.spawn(x, gy + 0.03, z);
        this.prevY[nd] = y;
        const o = nd * 6;
        const P = this.dripPos;
        P[o] = x;
        P[o + 1] = y;
        P[o + 2] = z;
        P[o + 3] = x;
        P[o + 4] = Math.min(gy + GF, y + len);
        P[o + 5] = z;
        nd++;
      }
      this.drip.geometry.attributes.position.needsUpdate = true;
    }
    this.drip.geometry.setDrawRange(0, nd * 2);
    this.dripMat.opacity = Math.min(0.85, 0.85 * amt + 0.15);
    this.stats.drips = nd;
    // advance the rings
    const sp = this.sp;
    for (let i = 0; i < NS; i++) {
      if (this.spT[i] < 0) continue;
      const a = (this.spT[i] += dt) / LIFE;
      if (a >= 1) {
        this.spT[i] = -1;
        sp.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        sp.setColorAt(i, this.c.setRGB(0, 0, 0));
        continue;
      }
      const s = 0.6 + a * 2.6,
        f = (1 - a) ** 1.5 * 0.6;
      this.m.set(s, 0, 0, this.spP[i * 3], 0, 1, 0, this.spP[i * 3 + 1], 0, 0, s, this.spP[i * 3 + 2], 0, 0, 0, 1);
      sp.setMatrixAt(i, this.m);
      sp.setColorAt(i, this.c.setRGB(f * 0.8, f * 0.86, f));
    }
    sp.instanceMatrix.needsUpdate = true;
    if (sp.instanceColor) sp.instanceColor.needsUpdate = true;
  }
}

/** the clear convenience-store umbrella (透明傘): canopy origin at its centre, shaft hanging below */
export function makeUmbrella() {
  const g = new THREE.Group();
  const R = 0.6,
    H = 0.26;
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(R, H, 12, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xeef4f8,
      emissive: 0x1c262c,
      transparent: true,
      opacity: 0.62,
      roughness: 0.08,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.4 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.016, 3, 24).rotateX(Math.PI / 2), white);
  rim.position.y = -H / 2;
  const Y = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tip = new THREE.Vector3(0, H / 2, 0),
      end = new THREE.Vector3(Math.cos(a) * R, -H / 2, Math.sin(a) * R);
    const d = end.clone().sub(tip);
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, d.length(), 0.012), white);
    rib.position.copy(tip).addScaledVector(d, 0.5);
    rib.quaternion.setFromUnitVectors(Y, d.normalize());
    g.add(rib);
  }
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.72, 5), dark);
  shaft.position.y = H / 2 - 0.36;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 6), dark);
  handle.position.y = H / 2 - 0.72;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 5), dark);
  top.position.y = H / 2 + 0.03;
  g.add(canopy, rim, shaft, handle, top);
  g.traverse(o => {
    o.castShadow = false;
    o.userData.noChunk = true;
  });
  g.rotation.set(-0.12, 0, 0.1); // tipped a little back over the shoulder
  return g;
}
