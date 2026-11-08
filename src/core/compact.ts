// v24.27 most of the game's memory is vertex data: about 16 million vertices at 44 bytes each. Nearly all of that is big merged
// static meshes, and the bytes are not earning their keep: an uv pair on geometry whose material has no texture to look up,
// normals to thirty-two bits for surfaces lit with a roughness of 0.9, and colours to thirty-two bits for flat paint. This packs
// them once a mesh has been built and before it is first drawn: no uv unless a texture needs it, normals in four signed bytes,
// colours in four 16-bit channels (no visible difference in the darks, where 8 bits would show). Four components, because three
// is not a format the graphics hardware has, and on Windows the driver layer would have to convert them. ?nocompact=1 turns it
// off, for before/after checks.
import * as THREE from 'three';

export const COMPACT = {
  on: !/[?&]nocompact=1/.test(location.search),
  meshes: 0,
  verts: 0,
  /** bytes no longer held */
  saved: 0,
  ms: 0,
};
/** small things are many and share programs with what they are drawn with; the memory is in the big ones */
const MIN_VERTS = 200;
const TEX = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'lightMap',
  'specularMap',
  'displacementMap',
] as const;
type Geo = THREE.BufferGeometry & { shared?: boolean };
type Mat = THREE.Material & Record<string, unknown> & { vertexColors?: boolean; isShaderMaterial?: boolean };

function packNormal(a: THREE.BufferAttribute) {
  const n = a.count,
    src = a.array as Float32Array,
    out = new Int8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = Math.round(src[i * 3] * 127);
    out[i * 4 + 1] = Math.round(src[i * 3 + 1] * 127);
    out[i * 4 + 2] = Math.round(src[i * 3 + 2] * 127);
  }
  return new THREE.BufferAttribute(out, 4, true);
}
function packColor(a: THREE.BufferAttribute) {
  const n = a.count,
    src = a.array as Float32Array,
    out = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(Math.max(0, Math.min(1, src[i * 3 + k])) * 65535);
    out[i * 4 + 3] = 65535;
  }
  return new THREE.BufferAttribute(out, 4, true);
}
/** pack everything under this object that can be. Safe to call again: what is done is marked. */
export function compact(root: THREE.Object3D) {
  if (!COMPACT.on) return;
  const t0 = performance.now();
  // a geometry used by several meshes here may be drawn with several materials: leave it
  const users = new Map<THREE.BufferGeometry, number>();
  root.traverse(o => {
    const g = (o as THREE.Mesh).geometry;
    if (g) users.set(g, (users.get(g) || 0) + 1);
  });
  root.traverse(o => {
    const m = o as THREE.Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean };
    if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || m.userData.noCompact) return;
    const g = m.geometry as Geo;
    if (!g || g.userData.compact || g.shared || users.get(g)! > 1 || Object.keys(g.morphAttributes).length) return;
    const pos = g.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos || pos.count < MIN_VERTS || pos.usage !== THREE.StaticDrawUsage) return;
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as Mat[];
    if (mats.some(q => q.isShaderMaterial)) return;
    let saved = 0;
    const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
    if (uv && !mats.some(q => TEX.some(k => q[k]))) {
      saved += uv.array.byteLength;
      g.deleteAttribute('uv');
    }
    const nor = g.attributes.normal as THREE.BufferAttribute | undefined;
    if (nor && nor.array instanceof Float32Array && nor.itemSize === 3 && nor.usage === THREE.StaticDrawUsage) {
      const p = packNormal(nor);
      saved += nor.array.byteLength - p.array.byteLength;
      g.setAttribute('normal', p);
    }
    const col = g.attributes.color as THREE.BufferAttribute | undefined;
    if (col && col.array instanceof Float32Array && col.itemSize === 3 && col.usage === THREE.StaticDrawUsage) {
      if (!mats.some(q => q.vertexColors)) {
        // painted for nobody
        saved += col.array.byteLength;
        g.deleteAttribute('color');
      } else {
        const p = packColor(col);
        saved += col.array.byteLength - p.array.byteLength;
        g.setAttribute('color', p);
      }
    }
    g.userData.compact = true;
    COMPACT.meshes++;
    COMPACT.verts += pos.count;
    COMPACT.saved += saved;
  });
  COMPACT.ms += performance.now() - t0;
}
