import * as THREE from 'three';
import { makeLampBatches } from './lamps';

const assert = {
  equal(actual: unknown, expected: unknown) {
    if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  },
  ok(value: unknown) {
    if (!value) throw new Error('Lamp batch assertion failed');
  },
  deepEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Lamp batch arrays differ');
  },
};
const samples: [number, number, number][] = [
  [-160, -160, 0],
  [-80.01, 79.99, 1.3],
  [-80, -0.01, -0.5],
  [-0.01, 0, Math.PI],
  [0, 0, 0.8],
  [79.99, 79.99, 2.1],
  [80, 80, -1],
  [160, -160, 0.7],
];
const poleGeometry = new THREE.CylinderGeometry(0.07, 0.09, 5, 6).translate(0, 2.5, 0);
const headGeometry = new THREE.BoxGeometry(0.35, 0.12, 0.5).translate(0, 4.88, 1.1);
const poleMaterial = new THREE.MeshStandardMaterial();
const headMaterial = new THREE.MeshStandardMaterial({ emissive: 0xffc070 });
const batches = makeLampBatches(samples, poleGeometry, headGeometry, poleMaterial, headMaterial);
const byCell = new Map<string, [number, number, number][]>();
for (const s of samples) {
  const key = `${Math.floor(s[0] / 80)}_${Math.floor(s[1] / 80)}`;
  const group = byCell.get(key) || [];
  group.push(s);
  byCell.set(key, group);
}
assert.equal(batches.length, byCell.size * 2);
let i = 0;
const axis = new THREE.Vector3(0, 1, 0);
const matrix = new THREE.Matrix4();
const actual = new THREE.Matrix4();
for (const group of byCell.values()) {
  const poles = batches[i++],
    heads = batches[i++];
  assert.equal(poles.count, group.length);
  assert.equal(heads.count, group.length);
  assert.equal(poles.geometry, poleGeometry);
  assert.equal(heads.geometry, headGeometry);
  assert.equal(poles.material, poleMaterial);
  assert.equal(heads.material, headMaterial);
  assert.equal(poles.castShadow, true);
  assert.equal(heads.castShadow, false);
  assert.ok(poles.boundingSphere && heads.boundingSphere);
  for (const [j, [x, z, angle]] of group.entries()) {
    matrix.compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromAxisAngle(axis, angle),
      new THREE.Vector3(1, 1, 1),
    );
    for (const mesh of [poles, heads]) {
      mesh.getMatrixAt(j, actual);
      for (let n = 0; n < 16; n++) assert.equal(actual.elements[n], Math.fround(matrix.elements[n]));
      mesh.geometry.computeBoundingSphere();
      const sphere = mesh.geometry.boundingSphere!.clone().applyMatrix4(actual);
      assert.ok(
        mesh.boundingSphere!.center.distanceTo(sphere.center) + sphere.radius <= mesh.boundingSphere!.radius + 1e-5,
      );
    }
  }
}
headMaterial.emissiveIntensity = 2.5;
assert.ok(
  batches
    .filter((_, n) => n % 2 === 1)
    .every(mesh => (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity === 2.5),
);
assert.deepEqual(makeLampBatches([], poleGeometry, headGeometry, poleMaterial, headMaterial), []);
console.log('Lamp batches preserve geometry, transforms, bounds, shadow flags and shared emissive material');
