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
/**
 * v24.29 once a mesh has been drawn its vertex data is in the graphics card's memory, and the copy this page holds is read by
 * nobody: not by the renderer (it only looks again if the data is marked changed, and these never are), not by the game (walls
 * are collision segments, not triangles). So the page's copy is let go when the card has taken it. `transfer` gives the memory
 * back at once rather than whenever the collector gets round to it, which is what matters on a phone as district tiles come
 * and go. What has not been drawn yet (most of a tile, until the player gets near) keeps its copy. Only district tiles do this:
 * they can be built again if the graphics context is lost, which the core of the map cannot. ?norelease=1 turns it off;
 * ?releasecheck=1 reports anything that reads a copy that is gone.
 */
export const RELEASE = {
  on: !/[?&]norelease=1/.test(location.search),
  check: /[?&]releasecheck=1/.test(location.search) || import.meta.env.VITE_RELEASE_CHECK === '1',
  /** arrays waiting for their mesh to be drawn */
  held: 0,
  heldBytes: 0,
  /** arrays let go once the card had them */
  attrs: 0,
  bytes: 0,
  /** arrays given back when their tile was unloaded, drawn or not */
  freed: 0,
  freedBytes: 0,
  /** (releasecheck) who read one afterwards */
  reads: [] as string[],
  /** time spent on all this while meshes are packed (bounds worked out early, arrays given back) */
  ms: 0,
};
type Arr = Float32Array | Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;
/** giving an array back costs a little each time, and the memory is in the big ones: small ones are left to the collector */
const SMALL = 16384;
const seenReads = new Set<string>();
const dropped = new WeakSet<THREE.BufferAttribute>();
/** this attribute's array is finished with: give the memory back now. Returns the bytes. */
function drop(at: THREE.BufferAttribute) {
  if (dropped.has(at)) return 0;
  const a = at.array as Arr;
  const n = a.byteLength;
  if (!n) return 0;
  if (at.onUploadCallback === letGo) {
    RELEASE.held--;
    RELEASE.heldBytes -= n;
    at.onUploadCallback = nothing;
  }
  dropped.add(at);
  const empty = new (a.constructor as new (n: number) => Arr)(0);
  if (RELEASE.check) {
    Object.defineProperty(at, 'array', {
      configurable: true,
      get() {
        const st = (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 7).join(' < ');
        if (!seenReads.has(st) && RELEASE.reads.length < 200) {
          seenReads.add(st);
          RELEASE.reads.push(st);
          // loud, so that every browser check fails on it
          setTimeout(() => {
            throw new Error('vertex data read after release: ' + st);
          }, 0);
        }
        return empty;
      },
      set(v) {
        Object.defineProperty(at, 'array', { value: v, writable: true, configurable: true });
      },
    });
  } else at.array = empty;
  // only when the array is the whole of its buffer: a view into a shared one leaves the others alone
  const buf = a.buffer as ArrayBuffer & { transfer?: (n?: number) => ArrayBuffer };
  if (n >= SMALL && a.byteOffset === 0 && n === buf.byteLength && typeof buf.transfer === 'function') buf.transfer(0);
  return n;
}
function letGo(this: THREE.BufferAttribute) {
  const n = drop(this);
  if (n) (RELEASE.attrs++, (RELEASE.bytes += n));
}
function nothing() {}
function hold(a: THREE.BufferAttribute | null | undefined) {
  if (!a || dropped.has(a) || (a as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) return;
  if (a.usage !== THREE.StaticDrawUsage || !a.array?.byteLength || a.onUploadCallback === letGo) return;
  a.onUploadCallback = letGo;
  RELEASE.held++;
  RELEASE.heldBytes += a.array.byteLength;
}
/** this geometry is finished with and nothing else uses it (a mesh that has been split into pieces): its arrays go back now */
export function discard(g: THREE.BufferGeometry) {
  if (!RELEASE.on || (g as Geo).shared) return;
  const all = Object.values(g.attributes) as THREE.BufferAttribute[];
  if (g.index) all.push(g.index);
  for (const at of all) {
    if ((at as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) continue;
    if (dropped.has(at) || (at.array.byteLength < SMALL && !RELEASE.check)) continue;
    const n = drop(at);
    if (n) (RELEASE.freed++, (RELEASE.freedBytes += n));
  }
}
/**
 * this part of the world is being thrown away (a district tile unloading): give back what its big meshes still hold, now,
 * instead of leaving it for the collector. Call after the geometries are disposed. Only what compact() took on: meshes of
 * their own, not the shared trees and props.
 */
export function freeNow(root: THREE.Object3D) {
  if (!RELEASE.on) return;
  root.traverse(o => {
    const g = (o as THREE.Mesh).geometry as Geo | undefined;
    if (!g || !g.userData.compact || g.shared || g.userData.freed) return;
    g.userData.freed = true;
    const all = Object.values(g.attributes) as THREE.BufferAttribute[];
    if (g.index) all.push(g.index);
    for (const at of all) {
      if ((at as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) continue;
      if (dropped.has(at) || (at.array.byteLength < SMALL && !RELEASE.check)) continue;
      const n = drop(at);
      if (n) (RELEASE.freed++, (RELEASE.freedBytes += n));
    }
  });
}
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
/**
 * @param release v24.29 also let the page's copy go once the card has it. Only for what can be built again (district tiles):
 *   if the graphics context is lost, the card's copy is gone too, and the renderer can only restore what the page still has.
 */
export function compact(root: THREE.Object3D, release = false) {
  if (!COMPACT.on) return;
  const t0 = performance.now();
  // a geometry used by several meshes here may be drawn with several materials: leave it
  const users = new Map<THREE.BufferGeometry, number>();
  // and an array held by several geometries is not this one's to give back
  const ausers = new Map<THREE.BufferAttribute, number>();
  root.traverse(o => {
    const g = (o as THREE.Mesh).geometry;
    if (!g) return;
    users.set(g, (users.get(g) || 0) + 1);
    if (users.get(g) === 1)
      for (const k in g.attributes) {
        const a = g.attributes[k] as THREE.BufferAttribute;
        ausers.set(a, (ausers.get(a) || 0) + 1);
      }
  });
  let rel = 0;
  const gone = (a: THREE.BufferAttribute) => {
    if (!RELEASE.on || a.array.byteLength < SMALL || ausers.get(a) !== 1) return;
    if ((a as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) return;
    const T0 = performance.now();
    const n = drop(a);
    if (n) (RELEASE.freed++, (RELEASE.freedBytes += n));
    rel += performance.now() - T0;
  };

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
      gone(uv);
    }
    const nor = g.attributes.normal as THREE.BufferAttribute | undefined;
    if (nor && nor.array instanceof Float32Array && nor.itemSize === 3 && nor.usage === THREE.StaticDrawUsage) {
      const p = packNormal(nor);
      saved += nor.array.byteLength - p.array.byteLength;
      g.setAttribute('normal', p);
      gone(nor);
    }
    const col = g.attributes.color as THREE.BufferAttribute | undefined;
    if (col && col.array instanceof Float32Array && col.itemSize === 3 && col.usage === THREE.StaticDrawUsage) {
      if (!mats.some(q => q.vertexColors)) {
        // painted for nobody
        saved += col.array.byteLength;
        g.deleteAttribute('color');
        gone(col);
      } else {
        const p = packColor(col);
        saved += col.array.byteLength - p.array.byteLength;
        g.setAttribute('color', p);
        gone(col);
      }
    }
    g.userData.compact = true;
    if (RELEASE.on && release) {
      // what the renderer would otherwise work out from the positions when it first looks
      const T0 = performance.now();
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingBox) g.computeBoundingBox();
      for (const k in g.attributes) hold(g.attributes[k] as THREE.BufferAttribute);
      hold(g.index);
      rel += performance.now() - T0;
    }
    COMPACT.meshes++;
    COMPACT.verts += pos.count;
    COMPACT.saved += saved;
  });
  COMPACT.ms += performance.now() - t0 - rel;
  RELEASE.ms += rel;
}
