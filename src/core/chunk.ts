import * as THREE from 'three';
import { discard } from './compact';
// v24.6 spatial chunking of big static merged meshes. Several boot-time builders merge the whole 1.1 km core (or
// large parts of it) into one mesh — 50–175 k triangles each that are drawn, and drawn again in the shadow pass,
// whenever any corner is on screen. This splits such meshes by triangle centroid into CELL-metre pieces, so the
// renderer's frustum culling drops the off-screen pieces. The original Mesh object stays in the scene graph as the
// (now empty) parent of its pieces, keeping the same material, so code that holds a reference to it (visibility,
// material properties, shader hooks) keeps working. Only plain non-indexed / indexed triangle meshes are touched.
export type ChunkStats = { meshes: number; pieces: number; tris: number };
export function chunkify(
  root: THREE.Object3D,
  opt: {
    minTris?: number;
    minSpan?: number;
    cell?: number;
    instanced?: boolean;
    icell?: number;
    iminTris?: number;
  } = {},
) {
  const minTris = opt.minTris ?? 12000,
    minSpan = opt.minSpan ?? 100,
    CELL = opt.cell ?? 60,
    ICELL = opt.icell ?? CELL,
    IMIN = opt.iminTris ?? minTris;
  const stats: ChunkStats = { meshes: 0, pieces: 0, tris: 0 };
  const todo: THREE.Mesh[] = [];
  const itodo: THREE.InstancedMesh[] = [];
  root.updateMatrixWorld(true);
  const users = new Map<THREE.BufferGeometry, number>();
  root.traverse(o => {
    const g = (o as THREE.Mesh).geometry;
    if (g) users.set(g, (users.get(g) || 0) + 1);
  });
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (opt.instanced && (m as any).isInstancedMesh && !m.userData.chunked && !Array.isArray(m.material)) {
      const im = m as THREE.InstancedMesh;
      // instances updated every frame (debris, casings…) are marked dynamic: leave those alone
      if (im.instanceMatrix.usage === THREE.DynamicDrawUsage || im.userData.noChunk) return;
      const gt = (im.geometry.index ? im.geometry.index.count : im.geometry.attributes.position?.count || 0) / 3;
      if (im.count > 8 && im.count * gt >= IMIN) itodo.push(im);
      return;
    }
    if (!m.isMesh || (m as any).isInstancedMesh || (m as any).isSkinnedMesh || Array.isArray(m.material)) return;
    if (m.userData.chunked || m.userData.noChunk) return;
    const g = m.geometry;
    if (!g?.attributes?.position || g.morphAttributes?.position) return;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (tris < minTris) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox!.clone().applyMatrix4(m.matrixWorld);
    if (Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) < minSpan) return;
    todo.push(m);
  });
  const v = new THREE.Vector3();
  // static instanced meshes (opt.instanced): split the instances by position into cells of child InstancedMeshes
  // sharing geometry and material; the original keeps 0 instances
  const m4 = new THREE.Matrix4(),
    col = new THREE.Color();
  for (const im of itodo) {
    const cells = new Map<string, number[]>();
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m4);
      v.setFromMatrixPosition(m4).applyMatrix4(im.matrixWorld);
      const key = Math.floor(v.x / ICELL) + ',' + Math.floor(v.z / ICELL);
      (cells.get(key) || cells.set(key, []).get(key)!).push(i);
    }
    if (cells.size < 2) continue;
    for (const list of cells.values()) {
      const c = new THREE.InstancedMesh(im.geometry, im.material, list.length);
      list.forEach((i, k) => {
        im.getMatrixAt(i, m4);
        c.setMatrixAt(k, m4);
        if (im.instanceColor) {
          im.getColorAt(i, col);
          c.setColorAt(k, col);
        }
      });
      c.castShadow = im.castShadow;
      c.receiveShadow = im.receiveShadow;
      c.renderOrder = im.renderOrder;
      c.userData.chunked = true;
      c.computeBoundingSphere();
      im.add(c);
      stats.pieces++;
    }
    stats.meshes++;
    stats.tris +=
      im.count * ((im.geometry.index ? im.geometry.index.count : im.geometry.attributes.position.count) / 3);
    im.userData.chunked = true;
    im.count = 0;
    im.frustumCulled = false;
  }
  for (const m of todo) {
    const g0 = m.geometry;
    const g = g0.index ? g0.toNonIndexed() : g0;
    const pos = g.attributes.position;
    const n = pos.count / 3;
    const cells = new Map<string, number[]>();
    for (let t = 0; t < n; t++) {
      let cx = 0,
        cz = 0;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, t * 3 + k).applyMatrix4(m.matrixWorld);
        cx += v.x;
        cz += v.z;
      }
      const key = Math.floor(cx / 3 / CELL) + ',' + Math.floor(cz / 3 / CELL);
      (cells.get(key) || cells.set(key, []).get(key)!).push(t);
    }
    if (cells.size < 2) continue;
    const names = Object.keys(g.attributes);
    for (const list of cells.values()) {
      const pg = new THREE.BufferGeometry();
      for (const a of names) {
        const src = g.attributes[a] as THREE.BufferAttribute;
        const it = src.itemSize;
        const out = new (src.array.constructor as any)(list.length * 3 * it);
        let o = 0;
        for (const t of list)
          for (let k = 0; k < 3; k++) {
            const i = (t * 3 + k) * it;
            for (let c = 0; c < it; c++) out[o++] = src.array[i + c];
          }
        pg.setAttribute(a, new THREE.BufferAttribute(out, it, src.normalized));
      }
      pg.computeBoundingSphere();
      const piece = new THREE.Mesh(pg, m.material);
      piece.castShadow = m.castShadow;
      piece.receiveShadow = m.receiveShadow;
      piece.renderOrder = m.renderOrder;
      piece.userData.chunked = true;
      m.add(piece); // child of the original: same transform, follows its visibility
      stats.pieces++;
    }
    stats.meshes++;
    stats.tris += n;
    m.userData.chunked = true;
    // the original keeps its place in the graph but draws nothing itself (no bounds to cull against)
    m.geometry = new THREE.BufferGeometry();
    m.frustumCulled = false;
    if (g !== g0) {
      g.dispose();
      discard(g);
    }
    g0.dispose();
    // v24.29 the whole mesh, now copied into its pieces: its memory goes back at once (unless something else draws it too)
    if (users.get(g0) === 1) discard(g0);
  }
  return stats;
}
