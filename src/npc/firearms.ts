// v23.5 firearm props: one stylised low-poly model per gun in items.ts (silhouettes you can tell apart from the
// top-down camera: slide + frame pistols, AR-pattern and conventional rifles, bullpups with the magazine behind
// the grip, scoped rifles, belt-fed / box-fed machine guns, a suppressed SMG, a pump shotgun and rocket tubes).
// Not dimensionally accurate replicas. Convention (as the old props): origin at the pistol grip in the hand,
// muzzle along +z, top of the gun +y, so the gun's right side (ejection port, bolt handle) is -x. Every model is one merged vertex-coloured mesh (one draw call), cached per id
// and shared by every rig that holds it. Each also exposes its muzzle and ejection-port points, and its family,
// which sets how hard it kicks (see RECOIL).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type GunFam = 'pistol' | 'rifle' | 'bullpup' | 'dmr' | 'sniper' | 'lmg' | 'smg' | 'shotgun' | 'launcher';
/** item id → model family. 'rifle' / 'pistol' are the generic items (and the soldiers' default rifle). */
export const GUN_FAM: Record<string, GunFam> = {
  pistol: 'pistol',
  qsz92: 'pistol',
  t75p: 'pistol',
  rifle: 'rifle',
  qbz191: 'rifle',
  t91: 'rifle',
  t65k2: 'rifle',
  qbz95: 'bullpup',
  qbu191: 'dmr',
  qbu88: 'sniper',
  t93: 'sniper',
  qjy88: 'lmg',
  t75saw: 'lmg',
  qcw05: 'smg',
  qbs09: 'shotgun',
  kestrel: 'launcher',
  at4: 'launcher',
  jav: 'launcher',
};
export const gunFam = (id: string): GunFam | null => GUN_FAM[id] ?? null;
/**
 * How a family moves when it fires. kick: snap of the muzzle per shot (rad); climb: extra muzzle rise at full
 * heat (sustained fire); back: the gun pushed back into the hand (m); body: how much arms / chest / stance take;
 * jitter: sideways shudder per shot (rad); heat: heat added per shot (0..1, decays ~1.8/s); shake: screen jolt.
 */
export const RECOIL: Record<
  GunFam,
  { kick: number; climb: number; back: number; body: number; jitter: number; heat: number; shake: number }
> = {
  pistol: { kick: 0.42, climb: 0.12, back: 0.03, body: 0.8, jitter: 0.05, heat: 0.3, shake: 0.025 },
  rifle: { kick: 0.2, climb: 0.14, back: 0.05, body: 1, jitter: 0.07, heat: 0.22, shake: 0.03 },
  bullpup: { kick: 0.2, climb: 0.13, back: 0.05, body: 1, jitter: 0.07, heat: 0.22, shake: 0.03 },
  smg: { kick: 0.13, climb: 0.12, back: 0.035, body: 0.75, jitter: 0.09, heat: 0.16, shake: 0.02 },
  lmg: { kick: 0.16, climb: 0.15, back: 0.06, body: 1.35, jitter: 0.1, heat: 0.18, shake: 0.035 },
  dmr: { kick: 0.32, climb: 0.15, back: 0.06, body: 1.15, jitter: 0.05, heat: 0.35, shake: 0.05 },
  sniper: { kick: 0.5, climb: 0.1, back: 0.08, body: 1.5, jitter: 0.04, heat: 0.6, shake: 0.08 },
  shotgun: { kick: 0.55, climb: 0.12, back: 0.08, body: 1.6, jitter: 0.06, heat: 0.6, shake: 0.08 },
  launcher: { kick: 0.3, climb: 0.05, back: 0.1, body: 1.4, jitter: 0.03, heat: 0.7, shake: 0.1 },
};

// palette
const STEEL = 0x2c3034,
  BLK = 0x1b1e21,
  DARK = 0x24282b,
  GUNM = 0x3a3f43,
  PLA_OD = 0x4c5340,
  PLA_TAN = 0x6d6650,
  ROC_GRN = 0x3c4434,
  OD = 0x55603a,
  BRASS = 0xb08a3a,
  LENS = 0x1f3a48,
  RED = 0x7a2a22;

/** b: box w(x) h(y) l(z) at (x, y, z), rotated rx about x; c: cylinder along z, radius r, length l */
type Part =
  | ['b', number, number, number, number, number, number, number, number?]
  | ['c', number, number, number, number, number, number, number?];
const b = (w: number, h: number, l: number, x: number, y: number, z: number, c: number, rx?: number): Part => [
  'b',
  w,
  h,
  l,
  x,
  y,
  z,
  c,
  rx,
];
const c = (r: number, l: number, x: number, y: number, z: number, col: number, seg?: number): Part => [
  'c',
  r,
  l,
  x,
  y,
  z,
  col,
  seg,
];

type Spec = { parts: Part[]; muzzle: [number, number, number]; eject: [number, number, number] };

function pistol(frame: number, slide: number): Spec {
  return {
    parts: [
      b(0.03, 0.034, 0.19, 0, 0.045, 0.05, slide), // slide
      b(0.032, 0.006, 0.12, 0, 0.064, 0.03, GUNM), // slide serrations / top flat
      b(0.028, 0.022, 0.15, 0, 0.019, 0.045, frame), // frame + dust cover
      b(0.03, 0.1, 0.046, 0, -0.034, -0.008, frame, -0.26), // raked grip
      b(0.032, 0.008, 0.05, 0, -0.084, -0.022, BLK, -0.26), // magazine base plate
      b(0.008, 0.008, 0.05, 0, -0.005, 0.035, frame), // trigger guard (bottom)
      b(0.008, 0.026, 0.008, 0, 0.006, 0.06, frame), // trigger guard (front)
      b(0.006, 0.018, 0.006, 0, 0.007, 0.028, STEEL), // trigger
      b(0.006, 0.009, 0.008, 0, 0.066, 0.138, BLK), // front sight
      b(0.022, 0.009, 0.008, 0, 0.066, -0.036, BLK), // rear sight
      c(0.008, 0.02, 0, 0.045, 0.15, STEEL), // muzzle crown
      b(0.012, 0.012, 0.02, 0, 0.045, -0.05, STEEL), // hammer
    ],
    muzzle: [0, 0.045, 0.165],
    eject: [-0.018, 0.055, 0.07],
  };
}
/** AR-pattern rifle (T91 flat-top with flip sights, T65K2 with carry handle) */
function arRifle(handle: boolean, poly: number): Spec {
  return {
    parts: [
      b(0.038, 0.05, 0.2, 0, 0.022, 0.02, GUNM), // lower receiver
      b(0.042, 0.046, 0.25, 0, 0.066, 0.035, GUNM), // upper receiver
      b(0.006, 0.02, 0.05, -0.022, 0.068, 0.06, BLK), // ejection port cover (right)
      b(0.03, 0.01, 0.025, 0, 0.094, -0.085, BLK), // charging handle
      handle
        ? b(0.02, 0.034, 0.13, 0, 0.11, 0.02, GUNM) // carry handle
        : b(0.024, 0.012, 0.24, 0, 0.095, 0.04, BLK), // flat-top rail
      ...(handle ? [b(0.02, 0.03, 0.02, 0, 0.12, -0.035, BLK)] : [b(0.02, 0.022, 0.018, 0, 0.11, -0.06, BLK)]), // rear sight
      b(0.056, 0.06, 0.26, 0, 0.062, 0.29, poly), // handguard
      b(0.058, 0.004, 0.24, 0, 0.093, 0.29, BLK), // handguard top rib
      c(0.011, 0.2, 0, 0.066, 0.5, STEEL), // barrel
      b(0.012, 0.06, 0.016, 0, 0.1, 0.43, BLK), // front sight post (A-frame)
      b(0.03, 0.008, 0.02, 0, 0.068, 0.43, BLK), // front sight base
      c(0.015, 0.055, 0, 0.066, 0.625, BLK), // flash hider
      b(0.03, 0.088, 0.04, 0, -0.034, -0.025, BLK, -0.32), // pistol grip
      b(0.006, 0.008, 0.055, 0, -0.004, 0.035, BLK), // trigger guard
      b(0.028, 0.09, 0.062, 0, -0.035, 0.095, DARK, 0.12), // magazine (upper)
      b(0.028, 0.07, 0.058, 0, -0.105, 0.112, DARK, 0.32), // magazine (curved lower)
      c(0.016, 0.16, 0, 0.05, -0.17, GUNM), // buffer tube
      b(0.04, 0.085, 0.16, 0, 0.032, -0.28, poly), // stock
      b(0.044, 0.1, 0.016, 0, 0.026, -0.365, BLK), // butt plate
    ],
    muzzle: [0, 0.066, 0.655],
    eject: [-0.03, 0.07, 0.06],
  };
}
/** QBZ-191-like conventional rifle: long top rail, slim fore-end, folding stock */
function pla191(poly: number, long = false, scope = false): Spec {
  const L = long ? 0.16 : 0;
  return {
    parts: [
      b(0.042, 0.075, 0.27, 0, 0.042, 0.03, poly), // receiver
      b(0.024, 0.012, 0.44 + L, 0, 0.087, 0.1 + L / 2, BLK), // full-length top rail
      b(0.006, 0.02, 0.05, -0.023, 0.06, 0.06, BLK), // ejection port
      b(0.05, 0.055, 0.25 + L * 0.5, 0, 0.055, 0.3 + L * 0.25, poly), // fore-end
      c(0.011, 0.16 + L, 0, 0.062, 0.5 + L * 0.75, STEEL), // barrel
      c(0.016, 0.05, 0, 0.062, 0.6 + L * 1.25, BLK), // muzzle device
      b(0.03, 0.086, 0.042, 0, -0.036, -0.02, BLK, -0.3), // grip
      b(0.006, 0.008, 0.05, 0, -0.002, 0.035, BLK), // trigger guard
      b(0.028, 0.095, 0.06, 0, -0.04, 0.1, DARK, 0.15), // magazine
      b(0.028, 0.06, 0.056, 0, -0.11, 0.12, DARK, 0.35),
      b(0.022, 0.022, 0.12, 0, 0.05, -0.14, BLK), // stock hinge / neck
      b(0.036, 0.08, 0.16, 0, 0.035, -0.27, poly), // stock
      b(0.04, 0.03, 0.12, 0, 0.082, -0.26, poly), // cheek riser
      b(0.042, 0.09, 0.016, 0, 0.032, -0.355, BLK), // butt pad
      ...(scope
        ? scopeParts(0.12, 0.08, 0.3)
        : [b(0.018, 0.022, 0.018, 0, 0.104, 0.36 + L, BLK), b(0.02, 0.024, 0.02, 0, 0.104, -0.04, BLK)]),
    ],
    muzzle: [0, 0.062, 0.63 + L * 1.25],
    eject: [-0.03, 0.065, 0.06],
  };
}
function scopeParts(y: number, z: number, len: number): Part[] {
  return [
    c(0.02, len, 0, y, z, BLK), // tube
    c(0.027, 0.07, 0, y, z + len / 2 - 0.02, BLK), // objective bell
    c(0.024, 0.06, 0, y, z - len / 2 + 0.03, BLK), // eyepiece
    c(0.02, 0.004, 0, y, z + len / 2 + 0.016, LENS), // lens
    b(0.02, 0.03, 0.02, 0, y + 0.024, z, BLK), // turret
    b(0.016, 0.028, 0.03, 0, y - 0.03, z - 0.08, BLK), // rings
    b(0.016, 0.028, 0.03, 0, y - 0.03, z + 0.08, BLK),
  ];
}
/** bullpup: magazine and action behind the grip (QBZ-95-1 with a carry handle; QBU-88 with a scope) */
function bullpup(poly: number, sniper: boolean): Spec {
  const L = sniper ? 0.28 : 0;
  return {
    parts: [
      b(0.05, 0.085, 0.52, 0, 0.04, -0.09, poly), // main body (receiver + stock in one)
      b(0.054, 0.1, 0.12, 0, 0.03, -0.37, poly), // butt
      b(0.056, 0.104, 0.016, 0, 0.03, -0.435, BLK), // butt plate
      b(0.04, 0.045, 0.18, 0, 0.03, 0.24, poly), // fore-end
      c(0.011, 0.14 + L, 0, 0.045, 0.39 + L / 2, STEEL), // barrel
      c(0.015, 0.05, 0, 0.045, 0.47 + L, BLK), // muzzle device
      b(0.032, 0.09, 0.044, 0, -0.04, 0.0, BLK, -0.2), // grip (forward of the magazine)
      b(0.03, 0.05, 0.11, 0, -0.03, 0.06, poly), // trigger guard / hand stop
      b(0.03, 0.1, 0.064, 0, -0.055, -0.13, DARK, 0.18), // magazine (behind the grip)
      b(0.006, 0.026, 0.06, -0.028, 0.06, -0.2, BLK), // ejection port
      ...(sniper
        ? [...scopeParts(0.14, -0.03, 0.3), b(0.04, 0.03, 0.12, 0, 0.1, -0.3, poly)]
        : [
            b(0.026, 0.03, 0.06, 0, 0.1, 0.12, poly), // carry handle front
            b(0.026, 0.03, 0.06, 0, 0.1, -0.18, poly), // carry handle rear
            b(0.03, 0.024, 0.36, 0, 0.128, -0.03, poly), // carry handle top
          ]),
    ],
    muzzle: [0, 0.045, 0.5 + L],
    eject: [-0.03, 0.06, -0.2],
  };
}
function t93(): Spec {
  return {
    parts: [
      b(0.04, 0.05, 0.24, 0, 0.05, 0.04, STEEL), // receiver
      c(0.013, 0.56, 0, 0.055, 0.44, STEEL), // heavy barrel
      c(0.018, 0.06, 0, 0.055, 0.74, BLK), // muzzle brake
      b(0.012, 0.012, 0.05, -0.05, 0.06, -0.02, STEEL), // bolt handle (right)
      c(0.01, 0.012, -0.075, 0.06, -0.02, BLK), // bolt knob
      b(0.05, 0.06, 0.32, 0, 0.03, 0.27, ROC_GRN), // fore-stock
      b(0.008, 0.16, 0.012, -0.02, -0.06, 0.38, BLK, 0.5), // bipod legs (folded back)
      b(0.008, 0.16, 0.012, 0.02, -0.06, 0.38, BLK, 0.5),
      b(0.032, 0.085, 0.04, 0, -0.035, -0.03, ROC_GRN, -0.3), // grip
      b(0.006, 0.008, 0.05, 0, -0.002, 0.03, BLK), // trigger guard
      b(0.026, 0.04, 0.07, 0, -0.012, 0.07, DARK), // box magazine
      b(0.048, 0.11, 0.26, 0, 0.03, -0.24, ROC_GRN), // thumbhole stock
      b(0.044, 0.035, 0.16, 0, 0.098, -0.24, ROC_GRN), // cheek piece
      b(0.05, 0.12, 0.018, 0, 0.03, -0.38, BLK), // butt pad
      ...scopeParts(0.12, 0.05, 0.36),
    ],
    muzzle: [0, 0.055, 0.78],
    eject: [-0.03, 0.07, 0.04],
  };
}
/** belt-fed GPMG (QJY-88: belt box on the left) or box-fed SAW (T75: plastic box under the gun) */
function lmg(pla: boolean): Spec {
  const poly = pla ? PLA_OD : ROC_GRN;
  return {
    parts: [
      b(0.062, 0.09, 0.34, 0, 0.05, 0.03, GUNM), // receiver
      b(0.066, 0.02, 0.2, 0, 0.104, 0.0, GUNM), // feed cover
      c(0.014, 0.46, 0, 0.06, 0.45, STEEL), // barrel
      c(0.01, 0.34, 0, 0.03, 0.38, STEEL), // gas tube
      b(0.05, 0.05, 0.16, 0, 0.055, 0.25, BLK), // heat shield / handguard
      c(0.018, 0.06, 0, 0.06, 0.7, BLK), // flash hider
      b(0.016, 0.07, 0.016, 0, 0.13, 0.26, GUNM), // carry handle post
      b(0.016, 0.014, 0.14, 0, 0.165, 0.22, GUNM), // carry handle
      b(0.014, 0.05, 0.014, 0, 0.1, 0.62, BLK), // front sight
      b(0.01, 0.22, 0.012, -0.035, -0.07, 0.58, BLK, -0.35), // bipod legs, deployed
      b(0.01, 0.22, 0.012, 0.035, -0.07, 0.58, BLK, -0.35),
      b(0.034, 0.09, 0.045, 0, -0.035, -0.04, BLK, -0.3), // grip
      b(0.006, 0.008, 0.055, 0, -0.003, 0.02, BLK), // trigger guard
      ...(pla
        ? [b(0.08, 0.1, 0.12, 0.075, 0.02, 0.07, poly), b(0.04, 0.03, 0.06, 0.03, 0.07, 0.07, BRASS)] // belt box (left) + belt
        : [b(0.08, 0.11, 0.12, 0, -0.06, 0.1, poly)]), // box magazine under
      b(0.02, 0.06, 0.18, 0, 0.04, -0.2, GUNM), // skeleton stock arm
      b(0.044, 0.1, 0.06, 0, 0.03, -0.3, poly), // stock
      b(0.046, 0.11, 0.016, 0, 0.03, -0.335, BLK),
    ],
    muzzle: [0, 0.06, 0.73],
    eject: [-0.04, 0.03, 0.06],
  };
}
/** QCW-05-like compact bullpup SMG with an integral suppressor */
function smg(): Spec {
  return {
    parts: [
      b(0.046, 0.07, 0.38, 0, 0.035, -0.06, PLA_OD), // body
      b(0.05, 0.085, 0.08, 0, 0.03, -0.27, PLA_OD), // butt
      b(0.022, 0.012, 0.22, 0, 0.077, -0.02, BLK), // top rail
      c(0.024, 0.24, 0, 0.042, 0.25, BLK), // suppressor
      b(0.03, 0.085, 0.04, 0, -0.035, 0.03, BLK, -0.25), // grip
      b(0.028, 0.04, 0.09, 0, -0.025, 0.08, PLA_OD), // hand stop
      b(0.026, 0.09, 0.05, 0, -0.05, -0.1, DARK, 0.15), // magazine behind the grip
      b(0.02, 0.02, 0.03, 0, 0.096, 0.04, BLK), // red dot
    ],
    muzzle: [0, 0.042, 0.37],
    eject: [-0.03, 0.05, -0.12],
  };
}
function shotgun(): Spec {
  return {
    parts: [
      b(0.042, 0.065, 0.22, 0, 0.045, 0.02, BLK), // receiver
      c(0.013, 0.46, 0, 0.065, 0.36, STEEL), // barrel
      c(0.014, 0.36, 0, 0.03, 0.3, BLK), // magazine tube
      b(0.05, 0.05, 0.14, 0, 0.032, 0.25, PLA_TAN), // pump fore-end
      b(0.012, 0.012, 0.012, 0, 0.082, 0.58, BRASS), // bead sight
      b(0.03, 0.085, 0.042, 0, -0.035, -0.04, BLK, -0.3), // grip
      b(0.006, 0.008, 0.05, 0, -0.002, 0.02, BLK), // trigger guard
      b(0.04, 0.08, 0.26, 0, 0.03, -0.22, PLA_TAN), // stock
      b(0.044, 0.1, 0.018, 0, 0.025, -0.36, BLK), // recoil pad
      b(0.012, 0.016, 0.06, 0.022, 0.035, 0.0, RED), // side shell carrier
    ],
    muzzle: [0, 0.065, 0.6],
    eject: [-0.03, 0.06, 0.04],
  };
}
function launcher(id: string): Spec {
  if (id === 'jav')
    return {
      parts: [
        c(0.075, 1.12, 0, 0.12, 0.1, OD, 14), // launch tube
        c(0.085, 0.06, 0, 0.12, 0.64, BLK, 14), // front cap
        c(0.085, 0.06, 0, 0.12, -0.44, BLK, 14),
        b(0.17, 0.13, 0.2, 0.13, 0.12, -0.12, OD), // command launch unit (left)
        c(0.03, 0.05, 0.13, 0.13, -0.24, LENS), // CLU eyepiece
        b(0.03, 0.08, 0.04, 0, -0.01, 0.0, BLK, -0.2), // grip
      ],
      muzzle: [0, 0.12, 0.68],
      eject: [0, 0.12, -0.5],
    };
  const at4 = id === 'at4';
  return {
    parts: [
      c(at4 ? 0.042 : 0.05, 1.0, 0, 0.1, 0.12, at4 ? OD : ROC_GRN, 12), // tube
      c(at4 ? 0.05 : 0.058, 0.05, 0, 0.1, 0.62, BLK, 12), // muzzle ring
      c(at4 ? 0.056 : 0.065, 0.08, 0, 0.1, -0.4, BLK, 12), // venturi flare
      b(0.03, 0.08, 0.04, 0, -0.005, 0.0, BLK, -0.2), // rear grip
      b(0.03, 0.07, 0.035, 0, 0.0, 0.2, BLK, 0.1), // fore grip
      b(0.03, 0.05, at4 ? 0.06 : 0.12, 0.06, 0.15, 0.08, BLK), // sight / optic (left)
      b(0.02, 0.03, 0.02, 0, 0.15, 0.4, BLK), // front sight
    ],
    muzzle: [0, 0.1, 0.66],
    eject: [0, 0.1, -0.45],
  };
}
function spec(id: string): Spec | null {
  switch (id) {
    case 'pistol':
    case 'qsz92':
      return pistol(BLK, DARK);
    case 't75p':
      return pistol(STEEL, STEEL);
    case 'rifle':
    case 'qbz191':
      return pla191(PLA_OD);
    case 'qbu191':
      return pla191(PLA_TAN, true, true);
    case 't91':
      return arRifle(false, ROC_GRN);
    case 't65k2':
      return arRifle(true, BLK);
    case 'qbz95':
      return bullpup(PLA_OD, false);
    case 'qbu88':
      return bullpup(PLA_OD, true);
    case 't93':
      return t93();
    case 'qjy88':
      return lmg(true);
    case 't75saw':
      return lmg(false);
    case 'qcw05':
      return smg();
    case 'qbs09':
      return shotgun();
    case 'kestrel':
    case 'at4':
    case 'jav':
      return launcher(id);
  }
  return null;
}

export const gunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
const cache = new Map<string, { geo: THREE.BufferGeometry; muzzle: THREE.Vector3; eject: THREE.Vector3 }>();
const _col = new THREE.Color();
function bake(p: Part) {
  let g: THREE.BufferGeometry;
  if (p[0] === 'b') {
    const [, w, h, l, x, y, z, , rx] = p;
    g = new THREE.BoxGeometry(w, h, l);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
  } else {
    const [, r, l, x, y, z, , seg] = p;
    g = new THREE.CylinderGeometry(r, r, l, seg ?? 8);
    g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
  }
  g.deleteAttribute('uv');
  const col = p[0] === 'b' ? p[7] : p[6];
  _col.setHex(col);
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([_col.r, _col.g, _col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
/** cached model data for an item id, or null when it is not a gun */
export function gunModel(id: string) {
  if (cache.has(id)) return cache.get(id)!;
  const s = spec(id);
  if (!s) return null;
  const parts = s.parts.map(bake);
  const geo = mergeGeometries(parts)!;
  parts.forEach(q => q.dispose());
  geo.computeBoundingSphere();
  const m = { geo, muzzle: new THREE.Vector3(...s.muzzle), eject: new THREE.Vector3(...s.eject) };
  cache.set(id, m);
  return m;
}

// ---- muzzle flash: crossed additive cards + a front star, shared by every gun ----
const flashTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,235,1)');
  gr.addColorStop(0.25, 'rgba(255,214,120,0.95)');
  gr.addColorStop(0.6, 'rgba(255,130,40,0.35)');
  gr.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const flashMat = new THREE.MeshBasicMaterial({
  map: flashTex,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
});
flashMat.userData.noOcc = true;
const flashGeo = (() => {
  const gs: THREE.BufferGeometry[] = [];
  // two crossed cards stretched along +z (the flame cone) and one card facing forward (the star)
  for (const r of [0, Math.PI / 2]) {
    const p = new THREE.PlaneGeometry(0.16, 0.36);
    p.rotateX(Math.PI / 2);
    p.rotateZ(r);
    p.translate(0, 0, 0.17);
    gs.push(p);
  }
  gs.push(new THREE.PlaneGeometry(0.22, 0.22).translate(0, 0, 0.02));
  return mergeGeometries(gs)!;
})();
export function makeFlash() {
  const m = new THREE.Mesh(flashGeo, flashMat);
  m.visible = false;
  m.renderOrder = 5;
  (m.geometry as any).shared = true;
  return m;
}
