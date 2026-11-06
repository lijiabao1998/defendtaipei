// v21.2 occlusion cutaway. The camera is untouched; instead every lit material discards fragments that lie inside a
// cylinder from the player's chest towards the camera (soft dithered rim). Because it hooks the shader of every
// material, it covers walls, roofs, 頂樓加蓋, 鐵窗 cages, awnings, arcade ceilings, signs and trees, including the
// meshes of streamed district tiles, with no registration. Ground-level fragments (y < 0.35) are kept so the street
// under the player never gets a hole. Set material.userData.noOcc to opt out.
// v23.3 building cut: while the player is inside an enterable district building, materials that opted in with
// material.userData.cut (the streamed tile meshes) also drop every fragment above CUT.y that lies inside that
// building's oriented box or hides a floor point of that box from the camera (taller neighbours in front), so the
// room reads like the core buildings (low walls, no roof). Characters and furniture never opt in.
import * as THREE from 'three';

export const OCC = {
  p: { value: new THREE.Vector3() },
  r: { value: 3.0 },
  on: { value: 1 },
  /** seconds, for the v24.14 sway (flags, people) */
  t: { value: 0 },
  /** test hook: 0/1 overrides the per-frame state */
  force: null as number | null,
};
/** cut box: f = (origin x, origin z, axis U x, axis U z); b = (umin, umax, vmin, vmax) along U and N = (-Uz, Ux) */
export const CUT = {
  f: { value: new THREE.Vector4() },
  b: { value: new THREE.Vector4() },
  /** fragments above this height are cut; 1e9 = off */
  y: { value: 1e9 },
};
// v24.13 street signs: each carries its building's centre (attribute aBld) and goes ghostly by the very rule that turns
// that building's walls see-through (main.ts: near && dx + dz in -4..30 && |dx - dz| < 22), so a sign fades exactly when
// its own wall does, instead of floating solid. Materials opt in with userData.front and customProgramCacheKey.
const NL = String.fromCharCode(10);
// v24.14 cloth and people: moved in the vertex shader, so a whole district of them costs nothing per frame on the CPU.
// aSway = (seed, sideways amplitude, vertical amplitude). Materials opt in with userData.sway and customProgramCacheKey.
const GLSL_SWAY = /* glsl */ `
  float swP = uOccT * 2.3 + aSway.x + position.x * 1.7 + position.z * 1.7;
  transformed.x += sin(swP) * aSway.y;
  transformed.z += cos(swP * 0.8) * aSway.y;
  transformed.y += sin(swP * 1.3) * aSway.z;
`;
const GLSL_FRONT = /* glsl */ `
    if (occW.y > 0.35) {
      vec2 frD = vBld - uOccP.xz;
      float frA = frD.x + frD.y;
      if (abs(frD.x) < 40.0 && abs(frD.y) < 40.0 && frA > -4.0 && frA < 30.0 && abs(frD.x - frD.y) < 22.0) {
        if (mod(floor(gl_FragCoord.x), 2.0) + mod(floor(gl_FragCoord.y), 2.0) > 0.5) discard;
      }
    }
`;
const GLSL = /* glsl */ `
  if (uOccOn > 0.5) {
    vec3 occW = cameraPosition + transpose(mat3(viewMatrix)) * (-vViewPosition);
    vec3 occD = isOrthographic ? transpose(mat3(viewMatrix)) * vec3(0.0, 0.0, 1.0) : normalize(cameraPosition - uOccP);
    vec3 occQ = occW - uOccP;
    float occA = dot(occQ, occD);
    float occR = length(occQ - occD * occA);
    if (occA > 0.9 && occW.y > 0.35 && occR < uOccR) {
      float occE = smoothstep(uOccR * 0.7, uOccR, occR);
      float occS = mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0);
      if (occE < 0.5 || occS < 0.5) discard;
    }
    /*FRONT*/
    if (uCutMe > 0.5 && occW.y > uCutY) {
      // the fragment itself is inside the building box, or it hides a floor point of the box from the camera
      vec3 cutR = isOrthographic ? -(transpose(mat3(viewMatrix)) * vec3(0.0, 0.0, 1.0)) : occW - cameraPosition;
      vec2 cutG = cutR.y < -1e-4 ? occW.xz + cutR.xz * (occW.y / -cutR.y) : occW.xz;
      for (int cutI = 0; cutI < 2; cutI++) {
        vec2 cutQ = (cutI == 0 ? occW.xz : cutG) - uCutF.xy;
        float cutU = dot(cutQ, uCutF.zw);
        float cutV = dot(cutQ, vec2(-uCutF.w, uCutF.z));
        if (cutU > uCutB.x && cutU < uCutB.y && cutV > uCutB.z && cutV < uCutB.w) discard;
      }
    }
  }
`;
THREE.Material.prototype.onBeforeCompile = function (
  this: THREE.Material,
  sh: THREE.WebGLProgramParametersWithUniforms,
) {
  if (this.userData?.noOcc) return;
  const fs = sh.fragmentShader;
  if (!fs.includes('vViewPosition') || !fs.includes('#include <clipping_planes_fragment>')) return;
  const m = this;
  sh.uniforms.uOccP = OCC.p;
  sh.uniforms.uOccR = OCC.r;
  sh.uniforms.uOccOn = OCC.on;
  sh.uniforms.uCutF = CUT.f;
  sh.uniforms.uCutB = CUT.b;
  sh.uniforms.uCutY = CUT.y;
  // read live, so a material may opt in after it was first compiled (shared tile materials)
  sh.uniforms.uCutMe = {
    get value() {
      return m.userData?.cut ? 1 : 0;
    },
  };
  const fr = !!m.userData?.front,
    sw = !!m.userData?.sway;
  if (fr || sw) {
    sh.uniforms.uOccT = OCC.t;
    sh.vertexShader =
      (fr ? 'attribute vec2 aBld;' + NL + 'varying vec2 vBld;' + NL : '') +
      (sw ? 'attribute vec3 aSway;' + NL + 'uniform float uOccT;' + NL : '') +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>' + NL + (fr ? 'vBld = aBld;' + NL : '') + (sw ? GLSL_SWAY : ''),
      );
  }
  sh.fragmentShader =
    'uniform vec3 uOccP;\nuniform float uOccR;\nuniform float uOccOn;\n' +
    'uniform vec4 uCutF;\nuniform vec4 uCutB;\nuniform float uCutY;\nuniform float uCutMe;\n' +
    (fr ? 'varying vec2 vBld;' + NL : '') +
    fs.replace(
      '#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>' + NL + GLSL.replace('/*FRONT*/', fr ? GLSL_FRONT : ''),
    );
};
/** call once per frame before rendering */
export function updateOcclusion(px: number, py: number, pz: number, on = true) {
  OCC.p.value.set(px, py + 1.1, pz);
  OCC.on.value = OCC.force ?? (on ? 1 : 0);
  OCC.t.value = performance.now() / 1000;
}
/** v23.3 cut everything above y inside an oriented box (O, U, [umin, umax, vmin, vmax]); null turns it off */
export function setBuildingCut(
  box: { O: [number, number]; U: [number, number]; ub: [number, number, number, number] } | null,
  y = 1.5,
) {
  if (!box) {
    CUT.y.value = 1e9;
    return;
  }
  CUT.f.value.set(box.O[0], box.O[1], box.U[0], box.U[1]);
  CUT.b.value.set(...box.ub);
  CUT.y.value = y;
}
