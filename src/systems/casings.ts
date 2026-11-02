// v23.5 spent cases: brass (red hulls for the shotgun) thrown out of the ejection port to the right of the gun,
// tumbling, bouncing once or twice on the ground and lying there a moment. One InstancedMesh, a fixed pool.
import * as THREE from 'three';

const N = 64;
type Case = { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; t: number; y0: number; s: number };

export class Casings {
  private im: THREE.InstancedMesh;
  private list: Case[] = [];
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private sc = new THREE.Vector3();
  private col = new THREE.Color();
  live = 0;
  constructor(scene: THREE.Scene) {
    const geo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.024, 6);
    geo.rotateX(Math.PI / 2);
    this.im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.8 }), N);
    this.im.frustumCulled = false;
    this.im.castShadow = false;
    for (let i = 0; i < N; i++) {
      this.list.push({
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        r: new THREE.Euler(),
        w: new THREE.Vector3(),
        t: 0,
        y0: 0,
        s: 1,
      });
      this.im.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.im.setColorAt(i, this.col.setHex(0xc8a050));
    }
    scene.add(this.im);
  }
  /**
   * throw one case out of `port` (world), sideways along `right` and back along `back` (unit vectors),
   * landing on ground height y0. kind: 'pistol' small, 'shell' red shotgun hull, else rifle brass.
   */
  eject(port: THREE.Vector3, right: THREE.Vector3, back: THREE.Vector3, y0: number, kind = 'rifle') {
    const i = this.next;
    this.next = (this.next + 1) % N;
    const c = this.list[i];
    c.p.copy(port);
    const sp = 2.2 + Math.random() * 1.2;
    c.v
      .copy(right)
      .multiplyScalar(sp)
      .addScaledVector(back, 0.6 + Math.random() * 0.6);
    c.v.y = 1.6 + Math.random() * 1.1;
    c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    c.w.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
    c.t = 2.6;
    c.y0 = y0;
    c.s = kind === 'pistol' ? 0.75 : kind === 'shell' ? 2.2 : 1;
    this.im.setColorAt(i, this.col.setHex(kind === 'shell' ? 0xa83228 : 0xc8a050));
    if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true;
  }
  update(dt: number) {
    let any = false,
      n = 0;
    for (let i = 0; i < N; i++) {
      const c = this.list[i];
      if (c.t <= 0) continue;
      any = true;
      c.t -= dt;
      const ground = c.y0 + 0.006 * c.s;
      if (c.p.y > ground + 1e-3 || c.v.y > 0) {
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w.x * dt;
        c.r.y += c.w.y * dt;
        c.r.z += c.w.z * dt;
        if (c.p.y < ground) {
          // bounce: lose most of the energy, spin down
          c.p.y = ground;
          c.v.y = Math.abs(c.v.y) > 1.2 ? -c.v.y * 0.32 : 0;
          c.v.x *= 0.45;
          c.v.z *= 0.45;
          c.w.multiplyScalar(0.4);
          if (c.v.y === 0) c.r.x = Math.PI / 2; // settles lying on its side
        }
      }
      const s = c.t > 0 ? c.s * Math.min(1, c.t / 0.4) : 0;
      this.q.setFromEuler(c.r);
      this.im.setMatrixAt(i, this.m.compose(c.p, this.q, this.sc.set(s, s, s)));
      if (c.t > 0) n++;
    }
    this.live = n;
    if (any) this.im.instanceMatrix.needsUpdate = true;
  }
}
