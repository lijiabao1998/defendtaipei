// @lijiabao/character-rig — shared procedural motion core (baseline DefendTaipei-Lab src/npc/human.ts v24.0):
// easing, the pose-key spring solver, motion signals (yaw rate / acceleration) and the stride-locked base gait
// (legs, hip sway, breathing, lean, counter arm swing). Each game layers its own actions (weapons, melee,
// loot, death, ...) on the returned Pose before calling applySprings.
import type * as THREE from 'three';

export const cl01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sm = (x: number) => {
  x = cl01(x);
  return x * x * (3 - 2 * x);
};
export const eo = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return 1 - (1 - t) ** 3;
};
export const ei = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * t;
};
export const KEYS = [
  'hipY',
  'hipX',
  'hipYaw',
  'bodyX',
  'bodyZ',
  'bodyZoff',
  'spX',
  'spY',
  'spZ',
  'chX',
  'chY',
  'hdX',
  'hdY',
  'thL',
  'thR',
  'thLz',
  'thRz',
  'shL',
  'shR',
  'ftL',
  'ftR',
  'uaL',
  'uaR',
  'uaLz',
  'uaRz',
  'uaLy',
  'uaRy',
  'laL',
  'laR',
  'laLy',
  'laRy',
  'tail',
] as const;
export type Pose = Record<(typeof KEYS)[number], number>;
export const zero = (): Pose => Object.fromEntries(KEYS.map(k => [k, 0])) as Pose;

type J = THREE.Object3D;
/** the joints and spring state the motion core drives (structurally compatible with each game's Rig) */
export type MotionRig = {
  root: THREE.Object3D;
  body: THREE.Object3D;
  hips: J;
  spine: J;
  chest: J;
  head: J;
  tail?: J;
  uaL: J;
  laL: J;
  uaR: J;
  laR: J;
  thL: J;
  shL: J;
  thR: J;
  shR: J;
  ftL: J;
  ftR: J;
  phase: number;
  t: number;
  sp: Record<string, [number, number]>;
  lastYaw: number;
  yawRate: number;
  lastSpeed: number;
  accel: number;
  legT: number;
  legS: number;
};

/** motion signals: yaw rate (lean / turn-in-place) and acceleration (momentum lean) */
export function trackMotion(r: MotionRig, speed: number, dt: number) {
  const yaw = r.root.rotation.y;
  let dy = yaw - r.lastYaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  r.lastYaw = yaw;
  r.yawRate += (dy / dt - r.yawRate) * Math.min(1, dt * 8);
  r.accel += ((speed - r.lastSpeed) / dt - r.accel) * Math.min(1, dt * 6);
  r.lastSpeed = speed;
}

/**
 * Stride-locked base gait written into T (phase advances with distance → planted feet).
 * sneak / carry / aim are the game's blend weights (0..1); strideScale lets a game shorten the stride.
 */
export function baseGait(
  r: MotionRig,
  T: Pose,
  speed: number,
  dt: number,
  w: { sneak: number; carry: number; aim: number },
  strideScale = 1,
) {
  const LT = r.legT,
    LS = r.legS;
  const s = speed,
    runW = sm((s - 3.6) / 2.2),
    walkW = sm(s / 1.2),
    sn = w.sneak;
  const stride = (0.95 + 0.42 * s) * (1 - 0.35 * sn) * strideScale;
  // amplitude from stride: the stance foot sweeps stride*duty per contact, so feet don't skate
  const duty = 0.55 - 0.2 * runW;
  let amp = walkW * Math.asin(Math.min(0.78, Math.max(0.2, (stride * duty) / (2 * (LT + LS))))) * (1 - 0.35 * sn);
  const turnStep = s < 0.4 && Math.abs(r.yawRate) > 1.2 ? Math.min(1, (Math.abs(r.yawRate) - 1.2) / 3) : 0; // turn in place: small shuffling steps
  r.phase += ((2 * Math.PI * s) / stride) * dt + turnStep * dt * 9;
  if (turnStep > 0) amp = Math.max(amp, 0.16 * turnStep);
  const p = r.phase;
  const sL = Math.sin(p),
    cL = Math.cos(p);
  const leg = (sinv: number, cosv: number) => {
    const th = -sinv * amp;
    const swing = Math.max(0, cosv);
    const sh = swing * amp * (1.3 + runW * 1.6) + 0.05 + Math.max(0, sinv) * amp * 0.25 * runW;
    return [th, sh];
  };
  const [tL, kL] = leg(sL, cL),
    [tR, kR] = leg(-sL, -cL);
  T.thL = tL;
  T.thR = tR;
  T.shL = kL;
  T.shR = kR;
  // idle weight shift + breathing
  const breath = Math.sin(r.t * 1.7),
    idleW = 1 - walkW;
  T.hipYaw = -sL * amp * 0.25 + idleW * Math.sin(r.t * 0.37) * 0.05;
  T.spY = sL * amp * 0.32;
  T.chY = -sL * amp * 0.1;
  T.bodyZoff = idleW * Math.sin(r.t * 0.37) * 0.02;
  T.thLz = idleW * 0.05 + 0.05 * walkW + 0.04 * runW; // slight abduction so knees/feet never cross
  T.thRz = -idleW * 0.03 - 0.05 * walkW - 0.04 * runW;
  T.chX = breath * 0.018 * idleW - runW * 0.05;
  T.hdX = -breath * 0.012;
  T.hdY = idleW * Math.sin(r.t * 0.29) * 0.35 * (1 - w.aim);
  T.spX = 0.04 + runW * 0.24 + walkW * 0.04 + Math.max(-0.12, Math.min(0.18, r.accel * 0.035));
  T.bodyZ = Math.max(-0.32, Math.min(0.32, -r.yawRate * s * 0.035)); // lean into turns
  // arms swing (counter to legs) with elbow drag
  T.uaL = tR * 0.85 * (1 - w.carry);
  T.uaR = tL * 0.85;
  T.uaLz = 0.1 + runW * 0.08 + breath * 0.01;
  T.uaRz = -0.1 - runW * 0.08 - breath * 0.01;
  T.laL = -0.18 - amp * 0.35 - runW * 1.05 + Math.max(0, -tR) * 0.25;
  T.laR = -0.18 - amp * 0.35 - runW * 1.05 + Math.max(0, -tL) * 0.25;
  return { LT, LS, s, runW, walkW, sn, stride, duty, amp, turnStep, p, sL, cL, tL, kL, tR, kR, breath, idleW };
}

/** critically-damped springs toward the target pose, then write the joint rotations */
export function applySprings(r: MotionRig, T: Pose, dt: number, om: number) {
  const n = Math.max(1, Math.ceil(dt / 0.012)),
    h = dt / n;
  for (const k of KEYS) {
    let e = r.sp[k];
    if (!e) e = r.sp[k] = [k === 'hipY' ? T.hipY : 0, 0];
    const o =
      k.startsWith('sp') || k.startsWith('ch') || k.startsWith('body') || k === 'hipYaw'
        ? om * 0.7
        : k === 'tail'
          ? 7
          : om;
    for (let i = 0; i < n; i++) {
      const a = o * o * (T[k] - e[0]) - 2 * o * e[1] * (k === 'tail' ? 0.45 : 1);
      e[1] += a * h;
      e[0] += e[1] * h;
    }
  }
  const v = (k: string) => r.sp[k][0];
  r.hips.position.y = v('hipY');
  r.hips.rotation.y = v('hipYaw');
  r.body.rotation.x = v('bodyX');
  r.body.rotation.z = v('bodyZ');
  r.spine.rotation.set(v('spX'), v('spY'), v('spZ'));
  r.chest.rotation.set(v('chX'), v('chY'), 0);
  r.head.rotation.set(v('hdX'), v('hdY'), 0);
  r.thL.rotation.set(v('thL'), 0, v('thLz'));
  r.thR.rotation.set(v('thR'), 0, v('thRz'));
  r.shL.rotation.x = v('shL');
  r.shR.rotation.x = v('shR');
  r.ftL.rotation.x = v('ftL');
  r.ftR.rotation.x = v('ftR');
  r.uaL.rotation.set(v('uaL'), v('uaLy'), v('uaLz'));
  r.uaR.rotation.set(v('uaR'), v('uaRy'), v('uaRz'));
  r.laL.rotation.set(v('laL'), v('laLy'), 0);
  r.laR.rotation.set(v('laR'), v('laRy'), 0);
  if (r.tail) r.tail.rotation.x = v('tail');
}

/** shared mannequin proportions: thigh / shin length and hip height (female 0.95 scale) */
export function bodyDims(gender: 'm' | 'f') {
  const k = gender === 'f' ? 0.95 : 1;
  const LT = 0.45 * k,
    LS = 0.43 * k;
  return { k, LT, LS, hipH: LT + LS + 0.075 };
}
