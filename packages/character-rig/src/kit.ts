// @lijiabao/character-rig — shared kit for the 白面人 (faceless mannequin) humanoid.
// Baseline: DefendTaipei-Lab src/npc/human.ts (v24.0). Geometry accumulation (one merged mesh per
// joint/material), joint + primitive helpers, the mannequin materials and the garment-fabric picker.
// Game-specific wardrobe, gear and animation stay in each game.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fabricMat, type Fabric } from './fabric.ts';
export type J = THREE.Object3D;
export const SKIN = 0xf1eee8;
export const matS = new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: 0.32,
  metalness: 0,
  clearcoat: 0.7,
  clearcoatRoughness: 0.28,
  sheen: 0.35,
  sheenRoughness: 0.45,
  sheenColor: new THREE.Color(0xfff4ee),
}); // v17.2: glossy satin mannequin (low roughness, soft specular sheen)
export const matC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }); // cloth / gear
// ---- per-joint geometry accumulation, merged to one mesh per joint/material ----
export class Parts {
  m = new Map<J, Map<string, THREE.BufferGeometry[]>>();
  /** current fabric for cloth parts, and whether parts are LOD-hidden detail */
  fab: Fabric | 'plain' = 'plain';
  det = false;
  /** single plain material per joint, no detail split (cheap crowd copies); default off */
  lite = false;
  dets: THREE.Object3D[] = [];
  add(
    j: J,
    g: THREE.BufferGeometry,
    col: number,
    skin = false,
    pos?: [number, number, number],
    rot?: [number, number, number],
    scl?: [number, number, number],
  ) {
    if (scl) g.scale(...scl);
    if (rot) {
      g.rotateX(rot[0]);
      g.rotateY(rot[1]);
      g.rotateZ(rot[2]);
    }
    if (pos) g.translate(...pos);
    const gg = g.index ? g : g;
    const n = gg.attributes.position.count;
    const c = new THREE.Color(col);
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = 0.93 + 0.07 * Math.sin(i * 12.9898);
      a[i * 3] = c.r * v;
      a[i * 3 + 1] = c.g * v;
      a[i * 3 + 2] = c.b * v;
    }
    gg.setAttribute('color', new THREE.BufferAttribute(a, 3));
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    for (const k of Object.keys(gg.attributes))
      if (!['position', 'normal', 'uv', 'color'].includes(k)) gg.deleteAttribute(k);
    const e = this.m.get(j) || new Map<string, THREE.BufferGeometry[]>();
    const key = this.lite ? 'plain' : (skin ? 's' : this.fab) + (this.det ? '|d' : '');
    if (!e.has(key)) e.set(key, []);
    e.get(key)!.push(gg.index ? gg.toNonIndexed() : gg);
    this.m.set(j, e);
  }
  build(shadow: boolean) {
    this.m.forEach((e, j) => {
      e.forEach((arr, key) => {
        const [mk, d] = key.split('|');
        const mat = mk === 's' ? matS : mk === 'plain' ? matC : fabricMat(mk as Fabric);
        const me = new THREE.Mesh(mergeGeometries(arr), mat);
        me.castShadow = shadow && !d;
        j.add(me);
        if (d) me.userData.det = true; // survives clone() so copies can find LOD detail
        if (d) this.dets.push(me);
      });
    });
  }
}
export const jt = (p: J, x: number, y: number, z: number, name = '') => {
  const j = new THREE.Object3D();
  j.name = name; // optional: lets a cloned hierarchy find its joints
  j.position.set(x, y, z);
  p.add(j);
  return j;
};
export const lathe = (pts: [number, number][], seg = 14, ps = 0, pl = Math.PI * 2) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
    ps,
    pl,
  );
export const cyl = (r0: number, r1: number, len: number, seg = 10) => {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, -len / 2, 0);
  return g;
};
export const sph = (r: number, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
export const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
export const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 3, 8);

/** the RigOpts fields the fabric picker reads (structurally compatible with each game's RigOpts) */
export type FabricPickOpts = {
  top: number;
  bottom: number;
  soldier?: boolean;
  jacket?: number;
  outfit?: string;
  fabric?: { top?: Fabric; bottom?: Fabric; jacket?: Fabric };
};
export const bluish = (c: number) => (c & 0xff) > ((c >> 16) & 0xff) + 12;
export function pickFabrics(o: FabricPickOpts) {
  const F = o.fabric || {};
  const civ = !o.soldier && !o.outfit;
  return {
    top: F.top ?? (o.soldier ? 'gear' : civ && (o.top >> 3) % 3 === 0 ? 'plaid' : 'cotton'),
    bottom: F.bottom ?? (o.soldier ? 'gear' : bluish(o.bottom) && !o.outfit ? 'denim' : 'cotton'),
    jacket: F.jacket ?? (o.jacket !== undefined && bluish(o.jacket) ? 'denim' : 'cotton'),
  } as { top: Fabric; bottom: Fabric; jacket: Fabric };
}
