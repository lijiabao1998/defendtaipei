// v24.23 the scene holds some 30,000 objects and a frame draws under a thousand of them, yet three.js walks them all three
// times a frame: to recompose every matrix, to frustum-test every mesh, and again for the shadow pass. That walk was a third
// of the frame on a desktop and worse on a phone. Two changes that leave the picture as it was:
//  - a matrix is only recomposed when the object's position, rotation or scale really changed, by comparing values;
//  - anything that has never moved and lies outside both the camera's and the shadow camera's frustum is hidden as a whole
//    (a whole building, or a whole item of a tile), so the walks stop at its root.
// ?nofast=1 turns the second one off, for before/after checks.
import * as THREE from 'three';

export const FAST = {
  on: !/[?&]nofast=1/.test(location.search),
  culled: 0,
  roots: 0,
  /** roots still waiting to have their bounds measured */
  pending: 0,
};

type Bound = { x: number; y: number; z: number; r: number; cast: boolean; mx: number; my: number; mz: number };
type Node = THREE.Object3D & {
  __tc?: number[];
  __b?: Bound | null;
  __culled?: boolean;
  __vis?: boolean;
  __wrapped?: boolean;
};

// ---------- matrices ----------
const proto = THREE.Object3D.prototype as unknown as {
  updateMatrixWorld: (this: Node, force?: boolean) => void;
};
proto.updateMatrixWorld = function (force?: boolean) {
  if (this.matrixAutoUpdate) {
    const p = this.position,
      q = this.quaternion,
      s = this.scale;
    const c = this.__tc;
    if (
      c === undefined ||
      c[0] !== p.x ||
      c[1] !== p.y ||
      c[2] !== p.z ||
      c[3] !== q.x ||
      c[4] !== q.y ||
      c[5] !== q.z ||
      c[6] !== q.w ||
      c[7] !== s.x ||
      c[8] !== s.y ||
      c[9] !== s.z
    ) {
      this.__tc = [p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z];
      this.matrix.compose(p, q, s);
      this.matrixWorldNeedsUpdate = true;
    }
  }
  if (this.matrixWorldNeedsUpdate || force) {
    if (this.matrixWorldAutoUpdate === true) {
      if (this.parent === null) this.matrixWorld.copy(this.matrix);
      else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
    }
    this.matrixWorldNeedsUpdate = false;
    force = true;
  }
  // nothing under a hidden root needs to be right until it comes back, and it is forced then
  if (this.__culled && !force) return;
  const ch = this.children;
  for (let i = 0, l = ch.length; i < l; i++) ch[i].updateMatrixWorld(force);
};

// ---------- hiding what is out of view ----------
const camF = new THREE.Frustum(),
  shF = new THREE.Frustum(),
  m4 = new THREE.Matrix4(),
  sph = new THREE.Sphere(),
  box = new THREE.Box3();
/** bounds grow a little: doors swing, cloth sways, the player has moved on since the last shadow pass */
const MARGIN = 3;
const CONTAINER: Bound = { x: 0, y: 0, z: 0, r: 0, cast: false, mx: 0, my: 0, mz: 0 };
let tick = 0,
  anyCulled = false;

/** never hide this one: it holds a light, a particle cloud or something that opted out of culling, or it is empty */
function measure(o: Node): Bound | null {
  // too spread out to be hidden as one: its items are
  if (o.name.startsWith('tile') || o.name === 'wreckage' || (o.userData.chunked && o.frustumCulled === false))
    return CONTAINER;
  let cast = false,
    bad = false;
  o.traverse(q => {
    const n = q as THREE.Mesh & { isLight?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
    if (n.isLight || n.isPoints || n.isLine || n.isSprite || n.userData.noCull) bad = true;
    // (chunk.ts leaves an empty parent mesh behind with frustum culling off; that one draws nothing)
    if (n.frustumCulled === false && !n.userData.chunked) bad = true;
    if (n.castShadow) cast = true;
  });
  if (bad) return null;
  box.setFromObject(o);
  if (box.isEmpty()) return null;
  box.getBoundingSphere(sph);
  if (sph.radius > 120 && o.children.length >= 8) return CONTAINER;
  const e = o.matrixWorld.elements;
  return {
    x: sph.center.x,
    y: sph.center.y,
    z: sph.center.z,
    r: sph.radius + MARGIN,
    cast,
    mx: e[12],
    my: e[13],
    mz: e[14],
  };
}
function hide(o: Node) {
  if (!o.__wrapped) {
    // the game's own idea of .visible is kept apart from this one, so that it can still hide and show things
    o.__wrapped = true;
    o.__vis = o.visible;
    Object.defineProperty(o, 'visible', {
      configurable: true,
      enumerable: true,
      get(this: Node) {
        return this.__vis && !this.__culled;
      },
      set(this: Node, v: boolean) {
        this.__vis = v;
      },
    });
  }
  o.__culled = true;
}
function show(o: Node) {
  o.__culled = false;
  o.matrixWorldNeedsUpdate = true; // what changed under it meanwhile
}
/** people and vehicles move, and the game asks them whether they are visible: their root stays, what hangs from it goes */
function moverPass(o: Node, shadow: boolean) {
  const e = o.matrixWorld.elements;
  sph.center.set(e[12], e[13] + 1, e[14]);
  sph.radius = 9;
  const see = camF.intersectsSphere(sph) || (shadow && shF.intersectsSphere(sph));
  const ch = o.children as Node[];
  for (let i = 0; i < ch.length; i++) {
    if (see) {
      if (ch[i].__culled) show(ch[i]);
    } else if (!ch[i].__culled) hide(ch[i]);
  }
}
function pass(list: Node[], shadow: boolean, until: number) {
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o.userData.noCull) {
      moverPass(o, shadow);
      continue;
    }
    let b = o.__b;
    // now and then measure again: rooftops and shop fronts are added to buildings after they were first seen
    if (b === undefined || (b && b !== CONTAINER && (i + tick) % 64 === 0 && performance.now() < until)) {
      if (b === undefined && performance.now() > until) {
        FAST.pending++;
        continue;
      }
      b = o.__b = measure(o);
    }
    if (b === CONTAINER) {
      pass(o.children as Node[], shadow, until);
      continue;
    }
    if (!b) {
      if (o.__culled) show(o);
      continue;
    }
    const e = o.matrixWorld.elements;
    if (e[12] !== b.mx || e[13] !== b.my || e[14] !== b.mz) {
      // it moves after all: not ours to hide
      o.__b = null;
      if (o.__culled) show(o);
      continue;
    }
    FAST.roots++;
    sph.center.set(b.x, b.y, b.z);
    sph.radius = b.r;
    const see = camF.intersectsSphere(sph) || (shadow && b.cast && shF.intersectsSphere(sph));
    if (see) {
      if (o.__culled) show(o);
    } else {
      if (!o.__culled) hide(o);
      FAST.culled++;
    }
  }
}
/** call right before rendering with the camera that is about to draw */
export function fastCull(scene: THREE.Scene, camera: THREE.Camera, shadowCam: THREE.Camera | null) {
  if (!FAST.on) return fastShowAll(scene);
  tick++;
  if (tick < 4) return; // the shadow camera has not been placed yet
  camera.updateMatrixWorld();
  m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  camF.setFromProjectionMatrix(m4);
  if (shadowCam) {
    m4.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse);
    shF.setFromProjectionMatrix(m4);
  }
  FAST.culled = FAST.roots = FAST.pending = 0;
  anyCulled = true;
  pass(scene.children as Node[], !!shadowCam, performance.now() + 2);
}
/** another camera is about to look at the world (the scope, the drone, a cutscene): show everything */
export function fastShowAll(scene: THREE.Scene) {
  if (!anyCulled) return;
  anyCulled = false;
  FAST.culled = 0;
  const all = (list: Node[]) => {
    for (const o of list) {
      if (o.__b === CONTAINER || o.userData.noCull) all(o.children as Node[]);
      else if (o.__culled) show(o);
    }
  };
  all(scene.children as Node[]);
}
