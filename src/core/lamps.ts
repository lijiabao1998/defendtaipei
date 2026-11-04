import * as THREE from 'three';

/** Group static street lamps into bounded batches so the renderer can cull off-screen lamps. */
export function makeLampBatches(
  lamps: readonly (readonly [number, number, number])[],
  poleGeometry: THREE.BufferGeometry,
  headGeometry: THREE.BufferGeometry,
  poleMaterial: THREE.Material,
  headMaterial: THREE.Material,
  cellSize = 80,
): THREE.InstancedMesh[] {
  const groups = new Map<string, (readonly [number, number, number])[]>();
  for (const lamp of lamps) {
    const key = `${Math.floor(lamp[0] / cellSize)}_${Math.floor(lamp[1] / cellSize)}`;
    const group = groups.get(key) || [];
    group.push(lamp);
    groups.set(key, group);
  }
  const meshes: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  for (const group of groups.values()) {
    const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, group.length);
    const heads = new THREE.InstancedMesh(headGeometry, headMaterial, group.length);
    group.forEach(([x, z, angle], i) => {
      rotation.setFromAxisAngle(axis, angle);
      matrix.compose(position.set(x, 0, z), rotation, scale);
      poles.setMatrixAt(i, matrix);
      heads.setMatrixAt(i, matrix);
    });
    poles.castShadow = true;
    poles.computeBoundingSphere();
    heads.computeBoundingSphere();
    meshes.push(poles, heads);
  }
  return meshes;
}
