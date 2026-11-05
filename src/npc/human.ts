// 白面人 (faceless mannequin) humanoid: procedurally modeled, hierarchically rigged, with a layered,
// spring-driven procedural animation system (stride-locked gait, hip IK, lean, momentum, overlays).
import * as THREE from 'three';
import { type Fabric } from '../map/fabric';
import { Parts, jt, lathe, cyl, sph, box, cap, pickFabrics, SKIN } from '../../packages/character-rig/src/index.ts';
import {
  sm,
  KEYS,
  eo,
  ei,
  zero,
  trackMotion,
  baseGait,
  applySprings,
  bodyDims,
  type Pose,
} from '../../packages/character-rig/src/index.ts';
import { gunModel, gunFam, gunMat, makeFlash, RECOIL, type GunFam } from './firearms';
export type AnimState =
  'idle' | 'walk' | 'run' | 'sneak' | 'melee' | 'aim' | 'shoot' | 'loot' | 'hurt' | 'death' | 'sleep' | 'carry';
export type RigOpts = {
  gender: 'm' | 'f';
  skin?: number;
  hair: number;
  top: number;
  bottom: number;
  shoes: number;
  soldier?: boolean;
  jacket?: number;
  pack?: number;
  outfit?: string;
  /** v17.2 fabric per garment; defaults are guessed from the colours */
  fabric?: { top?: Fabric; bottom?: Fabric; jacket?: Fabric };
};
type J = THREE.Object3D;
export type Rig = {
  root: THREE.Group;
  body: THREE.Group;
  hips: J;
  spine: J;
  chest: J;
  neck: J;
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
  handR: J;
  weapon: THREE.Group;
  phase: number;
  meleeT: number;
  /** v22.10 swing length, variant (0 forehand, 1 backhand, 2 overhead, 3 rifle-butt), hit-stop timer, swing counter */
  meleeDur: number;
  meleeVar: number;
  hitStop: number;
  swings: number;
  /** weapon base pitch (muzzle rise is added on top) */
  wRx0: number;
  shootT: number;
  hurtT: number;
  deadT: number;
  lootT: number;
  vaultT: number;
  shoveT: number;
  state: AnimState;
  weaponKind: string;
  /** v23.5 gun in hand: family (recoil character), inner pivot (slides back on recoil), muzzle / port points */
  gunFam: GunFam | null;
  gunInner: THREE.Group | null;
  muzzle: THREE.Object3D | null;
  eject: THREE.Object3D | null;
  flash: THREE.Mesh | null;
  flashT: number;
  /** sustained-fire heat 0..1 (muzzle climb, braced stance) and this shot's sideways shudder */
  heat: number;
  jit: [number, number];
  shots: number;
  f: boolean;
  t: number;
  sp: Record<string, [number, number]>;
  w: Record<string, number>;
  lastYaw: number;
  yawRate: number;
  lastSpeed: number;
  accel: number;
  deathV: number;
  hurtSide: number;
  legT: number;
  legS: number;
  legH: number;
  /** fine detail (fingers, seams, folds) hidden at LOD distance */
  det: THREE.Object3D[];
  lod: number;
};
export function makeRig(o: RigOpts): Rig {
  const FAB = pickFabrics(o);
  const f = o.gender === 'f',
    S = o.soldier;
  const { k, LT, LS, hipH } = bodyDims(o.gender);
  const P = new Parts();
  const fab = (f: Fabric | 'plain') => (P.fab = f);
  const det = (fn: () => void) => {
    P.det = true;
    fn();
    P.det = false;
  };
  const skinC = o.skin ?? SKIN,
    sk = (
      j: J,
      g: THREE.BufferGeometry,
      p?: [number, number, number],
      r?: [number, number, number],
      s?: [number, number, number],
    ) => P.add(j, g, skinC, true, p, r, s);
  const cl = (
    j: J,
    g: THREE.BufferGeometry,
    c: number,
    p?: [number, number, number],
    r?: [number, number, number],
    s?: [number, number, number],
  ) => P.add(j, g, c, false, p, r, s);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = jt(body, 0, hipH, 0);
  // pelvis / pants seat
  fab(FAB.bottom);
  cl(
    hips,
    lathe(
      f
        ? [
            [0.0, -0.1],
            [0.12, -0.09],
            [0.165, -0.02],
            [0.155, 0.06],
            [0.13, 0.1],
          ]
        : [
            [0.0, -0.1],
            [0.12, -0.09],
            [0.155, -0.02],
            [0.15, 0.06],
            [0.14, 0.1],
          ],
    ),
    o.bottom,
    undefined,
    undefined,
    [1, 1, 0.68],
  );
  fab('leather');
  cl(hips, cyl(0.145, 0.145, 0.035, 14), S ? 0x2a2a1e : 0x2a2420, [0, 0.1, 0], undefined, [1, 1, 0.7]); // belt
  if (!S) cl(hips, box(0.045, 0.032, 0.012), 0xb8a070, [0, 0.1, 0.103]); // buckle
  fab(FAB.bottom);
  if (!S)
    det(() => {
      // jeans/trouser seat pockets, fly seam, side seams
      for (const x of [-0.065, 0.065]) cl(hips, box(0.075, 0.085, 0.008), o.bottom, [x, 0.03, -0.1], [0.15, 0, 0]);
      cl(hips, box(0.006, 0.09, 0.006), 0x1c1a18, [0.012, 0.03, 0.1]);
      for (const x of [-0.07, 0.07]) cl(hips, box(0.06, 0.006, 0.01), 0x1c1a18, [x, 0.075, 0.095], [0, 0, x * 6]);
    });
  if (S)
    for (const x of [-0.11, 0.0, 0.11]) cl(hips, box(0.06, 0.07, 0.04), 0x3c4428, [x, 0.07, x === 0 ? -0.11 : 0.1]);
  const spine = jt(hips, 0, 0.09, 0);
  const torsoPts: [number, number][] = f
    ? [
        [0.125, 0],
        [0.11, 0.1],
        [0.135, 0.22],
        [0.155, 0.3],
        [0.16, 0.36],
        [0.14, 0.42],
        [0.07, 0.45],
      ]
    : [
        [0.14, 0],
        [0.132, 0.1],
        [0.155, 0.22],
        [0.18, 0.32],
        [0.19, 0.38],
        [0.165, 0.43],
        [0.07, 0.46],
      ];
  fab(FAB.top);
  cl(spine, lathe(torsoPts, 16), o.top, undefined, undefined, [1, 1, 0.62]);
  const chest = jt(spine, 0, 0.36, 0);
  if (f) {
    cl(chest, sph(0.075), o.top, [-0.06, -0.06, 0.07], undefined, [1, 0.85, 0.75]);
    cl(chest, sph(0.075), o.top, [0.06, -0.06, 0.07], undefined, [1, 0.85, 0.75]);
  }
  cl(chest, sph(1, 14, 8), o.top, [0, 0.03, 0], undefined, [f ? 0.165 : 0.2, 0.075, 0.115]); // shoulders
  if (o.jacket !== undefined) {
    // open-front jacket layer
    fab(FAB.jacket);
    cl(
      spine,
      lathe(torsoPts.map(([r, y]) => [r + 0.018, y] as [number, number]).slice(0, 6), 16, 0.45, Math.PI * 2 - 0.9),
      o.jacket,
      undefined,
      undefined,
      [1, 1, 0.66],
    );
    cl(chest, cyl(0.1, 0.12, 0.05, 14), o.jacket, [0, 0.1, -0.01], undefined, [1, 1, 0.75]); // collar
    for (const sd of [-1, 1]) {
      cl(chest, box(0.035, 0.17, 0.012), o.jacket, [sd * 0.062, -0.02, 0.115], [-0.12, 0, -sd * 0.3]); // open lapels
      cl(spine, box(0.07, 0.05, 0.012), o.jacket, [sd * 0.09, 0.14, 0.105], [0, sd * 0.2, 0]); // hip pockets
    }
    fab(FAB.top);
  } else cl(chest, cyl(0.075, 0.085, 0.03, 12), o.top, [0, 0.09, 0], undefined, [1, 1, 0.8]);
  if (S) {
    fab('gear');
    // plate carrier + pouches + radio
    cl(chest, box(0.34, 0.3, 0.06), 0x39412a, [0, -0.13, 0.11]);
    cl(chest, box(0.34, 0.32, 0.06), 0x39412a, [0, -0.13, -0.12]);
    for (const x of [-0.11, 0, 0.11]) cl(chest, box(0.085, 0.11, 0.05), 0x46502f, [x, -0.2, 0.155]);
    cl(chest, box(0.06, 0.06, 0.03), 0x8a7a40, [0.12, -0.02, 0.15]);
    cl(chest, box(0.07, 0.13, 0.05), 0x222222, [-0.15, -0.05, -0.15]);
    cl(chest, cyl(0.006, 0.004, 0.35, 4), 0x111111, [-0.16, 0.3, -0.16]);
    cl(chest, box(0.25, 0.22, 0.1), 0x3a422b, [0, -0.12, -0.2]); // hydration pack
  }
  if (o.pack !== undefined) {
    // backpack + straps
    cl(chest, box(0.3, 0.38, 0.16), o.pack, [0, -0.14, -0.2]);
    cl(chest, box(0.26, 0.12, 0.06), o.pack, [0, -0.24, -0.3]);
    cl(chest, box(0.24, 0.05, 0.14), 0x222222, [0, 0.06, -0.2]);
    for (const x of [-0.1, 0.1]) {
      cl(chest, box(0.04, 0.36, 0.015), 0x222222, [x, -0.12, 0.105], [-0.1, 0, 0]);
      cl(chest, box(0.04, 0.015, 0.2), 0x222222, [x, 0.07, -0.02]);
    }
  }
  const neck = jt(chest, 0, 0.08, 0);
  sk(neck, cyl(0.05, 0.042, 0.11, 12), [0, 0.095, 0]); // defined neck
  const head = jt(neck, 0, 0.09, 0);

  // v17.2 egg head: one smooth lathe, wider crown tapering to a soft chin, no features
  sk(
    head,
    lathe(
      [
        [0.0, -0.03],
        [0.04, -0.022],
        [0.068, 0.01],
        [0.084, 0.06],
        [0.091, 0.11],
        [0.086, 0.16],
        [0.066, 0.2],
        [0.034, 0.222],
        [0.0, 0.228],
      ],
      22,
    ),
    [0, 0.0, 0.0],
    [-0.08, 0, 0],
    [0.92, 0.9, 1.04],
  );
  if (S) {
    cl(
      head,
      new THREE.SphereGeometry(0.118, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
      0x4c5733,
      [0, 0.1, -0.01],
      undefined,
      [0.98, 0.95, 1.08],
    );
    cl(
      head,
      new THREE.TorusGeometry(0.115, 0.01, 4, 18),
      0x3e4828,
      [0, 0.105, -0.01],
      [Math.PI / 2, 0, 0],
      [0.98, 1.08, 1],
    );
    cl(head, box(0.15, 0.035, 0.05), 0x1c1c1c, [0, 0.135, 0.095]);
    cl(head, box(0.2, 0.012, 0.02), 0x1c1c1c, [0, 0.13, 0.03]); // goggles on helmet
    cl(head, box(0.012, 0.09, 0.012), 0x222222, [-0.085, 0.04, 0.02]);
    cl(head, box(0.012, 0.09, 0.012), 0x222222, [0.085, 0.04, 0.02]); // chin strap
  } // v17.2: no hair — bald glossy mannequin heads like the reference (helmets/caps stay)
  const tail: J | undefined = undefined;
  const ring = (j: J, r: number, y: number, c: number, sz = [1, 1, 0.66] as [number, number, number]) =>
    cl(j, new THREE.TorusGeometry(r, 0.006, 4, 20), c, [0, y, 0], [Math.PI / 2, 0, 0], sz);
  // arms
  fab(o.jacket !== undefined && !S ? FAB.jacket : FAB.top);
  const armC = S ? o.top : (o.jacket ?? o.top);
  const mkArm = (sd: number) => {
    const sh = jt(chest, sd * (f ? 0.165 : 0.2), 0.0, 0);
    cl(sh, sph(f ? 0.05 : 0.06), armC, [0, -0.01, 0]);
    cl(sh, cyl(f ? 0.05 : 0.058, 0.046, 0.28, 10), armC, undefined, undefined, [1, 1, 0.92]);
    if (S) cl(sh, box(0.05, 0.05, 0.01), 0x8a7a40, [sd * 0.058, -0.06, 0]); // shoulder patch (generic)
    const la = jt(sh, 0, -0.28, 0);
    const longSleeve = S || o.jacket !== undefined;
    const dk = new THREE.Color(armC).multiplyScalar(0.72).getHex();
    if (longSleeve) {
      cl(la, sph(0.046, 10, 8), armC); // elbow
      cl(la, cyl(0.046, 0.04, 0.22, 10), armC);
      cl(la, cyl(0.043, 0.043, 0.025, 10), armC, [0, -0.2, 0]); // cuff
      sk(la, cyl(0.032, 0.03, 0.05, 8), [0, -0.21, 0]);
      det(() => {
        for (const y of [-0.01, 0.02]) ring(la, 0.047, y, dk, [1, 1, 1]); // elbow folds
      });
    } else {
      cl(la, cyl(0.05, 0.048, 0.04, 10), armC, [0, 0.02, 0]); // sleeve hem
      sk(la, sph(0.041, 10, 8)); // elbow
      sk(la, cyl(0.04, 0.03, 0.26, 10));
    }
    const hand = jt(la, 0, -0.26, 0);
    if (S) cl(hand, sph(0.04), 0x252520, [0, -0.04, 0.005], undefined, [0.85, 1.2, 1]);
    else {
      // mannequin hand: palm + suggested fingers and thumb
      sk(hand, sph(0.036, 10, 8), [0, -0.035, 0.003], undefined, [0.62, 1.15, 1.0]);
      det(() => {
        for (let i = 0; i < 4; i++) sk(hand, cap(0.0085, 0.045), [0, -0.085, 0.024 - i * 0.015], [0, 0, sd * 0.06]);
        sk(hand, cap(0.009, 0.035), [sd * 0.005, -0.045, 0.04], [0.6, 0, 0]);
      });
    }
    return [sh, la, hand] as const;
  };
  const [uaL, laL, handL] = mkArm(1);
  const [uaR, laR, handR] = mkArm(-1); // +x is the character's left
  // legs
  fab(FAB.bottom);
  const mkLeg = (sd: number) => {
    const th = jt(hips, sd * (f ? 0.088 : 0.085), -0.03, 0);
    cl(th, cyl(f ? 0.08 : 0.078, 0.056, LT, 12), o.bottom);
    const sh = jt(th, 0, -LT, 0);
    cl(sh, sph(0.056), o.bottom);
    cl(sh, cyl(0.055, 0.044, LS, 10), o.bottom);
    if (!S) {
      cl(sh, cyl(0.05, 0.056, 0.05, 12), o.bottom, [0, -LS + 0.06, 0]); // hem break over the shoe
      det(() => {
        const dk = new THREE.Color(o.bottom).multiplyScalar(0.7).getHex();
        for (const y of [0.03, -0.02]) ring(sh, 0.057, y, dk, [1, 1, 1]); // knee folds
        ring(sh, 0.052, -LS + 0.1, dk, [1, 1, 1]);
        cl(th, box(0.005, LT * 0.9, 0.006), dk, [sd * 0.072, -LT / 2, 0]); // outseam
      });
    }
    if (S) {
      cl(sh, box(0.09, 0.1, 0.04), 0x2a2e20, [0, -0.02, 0.05]);
      cl(sh, cyl(0.05, 0.048, 0.14, 10), 0x1a1a1a, [0, -LS + 0.13, 0]);
    }
    const ft = jt(sh, 0, -LS, 0);
    fab('leather');
    cl(ft, box(0.1, 0.03, 0.26), S ? 0x111111 : 0x3a3a3a, [0, -0.06, 0.045]);
    cl(ft, cap(0.045, 0.14), o.shoes, [0, -0.03, 0.05], [Math.PI / 2, 0, 0], [1, 1, 0.75]);
    if (!S && new THREE.Color(o.shoes).getHSL({ h: 0, s: 0, l: 0 }).l > 0.7)
      det(() => {
        cl(ft, box(0.098, 0.012, 0.265), 0xe8e4da, [0, -0.044, 0.045]); // midsole
        for (let i = 0; i < 3; i++)
          cl(ft, box(0.05, 0.005, 0.008), 0xf0f0f0, [0, -0.005 - i * 0.004, 0.06 + i * 0.025]); // laces
      });
    fab(FAB.bottom);
    return [th, sh, ft] as const;
  };
  const [thL, shL, ftL] = mkLeg(1);
  const [thR, shR, ftR] = mkLeg(-1);
  // ---- profession outfits: detail only through clothing ----
  fab('cotton');
  const O = o.outfit;
  const seam = 0x1c1a18;
  const skirt = (c: number, len: number, pleats: boolean) => {
    cl(
      hips,
      lathe(
        [
          [0.15, 0.08],
          [0.17, 0.0],
          [0.2, -0.12],
          [0.23, -len],
        ],
        18,
      ),
      c,
      undefined,
      undefined,
      [1, 1, 0.75],
    );
    if (pleats)
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        cl(
          hips,
          box(0.012, len * 0.85, 0.02),
          new THREE.Color(c).multiplyScalar(0.72).getHex(),
          [Math.sin(a) * 0.2, -len * 0.5, Math.cos(a) * 0.2 * 0.75],
          [Math.cos(a) * -0.18, a, 0],
        );
      }
  };
  const collar = (c: number) => {
    for (const sd of [-1, 1])
      cl(chest, box(0.07, 0.012, 0.06), c, [sd * 0.045, 0.085, 0.07], [0.5, sd * 0.5, sd * 0.3]);
  };
  const badge = (y = -0.05, x = 0.08) => {
    cl(chest, box(0.05, 0.07, 0.006), 0xf4f4f0, [x, y, 0.135]);
    cl(chest, box(0.04, 0.02, 0.007), 0x3a6aa8, [x, y + 0.02, 0.136]);
  };
  if (O === 'office') {
    collar(0xf4f4f6);
    cl(chest, box(0.035, 0.03, 0.02), f ? 0xf4f4f6 : 0x7a1e2a, [0, 0.06, 0.1]);
    if (!f) cl(chest, box(0.04, 0.24, 0.012), 0x7a1e2a, [0, -0.07, 0.122], [0.08, 0, 0]); // tie
    cl(chest, new THREE.TorusGeometry(0.09, 0.004, 3, 16, Math.PI), 0x2a5aa8, [0, 0.02, 0.06], [-0.4, 0, Math.PI]);
    badge(-0.12, 0); // lanyard + badge
    for (const y of [-0.12, -0.2]) cl(chest, sph(0.008), 0x111111, [0.02, y, 0.128]); // jacket buttons
    ring(hips, 0.15, 0.1, seam);
    if (f) skirt(o.bottom, 0.3, false);
    cl(handL, box(0.08, 0.28, 0.36), 0x3a2a1e, [0, -0.2, 0]);
    cl(handL, box(0.02, 0.04, 0.12), 0x1a1a1a, [0, -0.05, 0]); // briefcase
    for (const ft of [ftL, ftR]) cl(ft, box(0.098, 0.025, 0.24), 0x111111, [0, -0.05, 0.05]);
  }
  if (O === 'student') {
    collar(0xffffff);
    cl(chest, box(0.05, 0.012, 0.005), 0x2a4a9a, [0.08, -0.03, 0.13]); // embroidered name/student no.
    if (f) {
      skirt(o.bottom, 0.34, true);
      cl(chest, box(0.03, 0.06, 0.01), 0x2a3a6a, [0, 0.05, 0.11]);
    } else ring(hips, 0.15, 0.1, 0x111111);
    cl(chest, box(0.06, 0.6, 0.012), 0x2a2a2a, [0, -0.1, 0.1], [0, 0, 0.75]);
    cl(hips, box(0.3, 0.24, 0.09), o.pack ?? 0x2a3a6a, [-0.2, 0.02, 0.02], [0, Math.PI / 2, 0]); // shoulder school bag
    for (const sh of [shL, shR]) cl(sh, cyl(0.045, 0.043, 0.1, 10), 0xffffff, [0, -LS + 0.1, 0]); // white socks
  }
  if (O === 'courier') {
    cl(
      head,
      new THREE.SphereGeometry(0.128, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      0x2f6a4c,
      [0, 0.1, -0.01],
      [-0.15, 0, 0],
    );
    cl(head, box(0.2, 0.012, 0.08), 0x2a2e30, [0, 0.175, 0.1], [-0.25, 0, 0]);
    cl(head, box(0.26, 0.03, 0.01), 0xffe680, [0, 0.17, 0.0], [0, 0, 0]); // half helmet + visor
    cl(chest, box(0.42, 0.42, 0.28), 0x3a3f8a, [0, -0.1, -0.26]);
    cl(chest, box(0.425, 0.07, 0.285), 0xffe680, [0, 0.03, -0.26]);
    cl(chest, box(0.2, 0.08, 0.005), 0xffe680, [0, -0.14, -0.402]);
    for (const x of [-0.1, 0.1]) cl(chest, box(0.04, 0.34, 0.015), 0x222222, [x, -0.12, 0.112], [-0.1, 0, 0]); // thermal backpack (fictional 飽飽送)
    ring(spine, 0.15, 0.0, seam);
    for (const x of [-0.1, 0.1]) cl(chest, box(0.012, 0.3, 0.005), 0xd8d8d8, [x, -0.15, 0.124]); // reflective strips
    cl(chest, box(0.008, 0.3, 0.008), 0x222222, [0.01, -0.12, 0.125]); // zipper
  }
  if (O === 'nurse') {
    cl(
      chest,
      box(0.1, 0.012, 0.03),
      new THREE.Color(o.top).multiplyScalar(0.7).getHex(),
      [-0.03, 0.06, 0.1],
      [0, 0, 0.7],
    );
    cl(
      chest,
      box(0.1, 0.012, 0.03),
      new THREE.Color(o.top).multiplyScalar(0.7).getHex(),
      [0.03, 0.06, 0.1],
      [0, 0, -0.7],
    ); // V-neck
    cl(chest, box(0.08, 0.06, 0.01), new THREE.Color(o.top).multiplyScalar(0.85).getHex(), [-0.08, -0.12, 0.125]);
    cl(chest, box(0.006, 0.05, 0.006), 0x2a2a2a, [-0.06, -0.09, 0.128]);
    badge(-0.05, 0.08); // pocket + pen + ID
    cl(neck, box(0.13, 0.05, 0.02), 0x8ac8e0, [0, 0.0, 0.06]);
    for (const sd of [-1, 1]) cl(neck, box(0.004, 0.004, 0.08), 0xf4f4f4, [sd * 0.06, 0.02, 0.02]); // face mask hanging at the neck
    for (const sh of [shL, shR])
      ring(sh, 0.044, -LS + 0.16, new THREE.Color(o.bottom).multiplyScalar(0.7).getHex(), [1, 1, 1]);
    for (const ft of [ftL, ftR]) cl(ft, box(0.1, 0.035, 0.25), 0xf4f4f4, [0, -0.055, 0.05]); // nurse shoes
  }
  if (O === 'tech') {
    cl(
      spine,
      lathe(torsoPts.map(([r, y]) => [r + 0.03, y] as [number, number]).slice(0, 6), 16, 0.5, Math.PI * 2 - 1),
      0x8a7a4a,
      undefined,
      undefined,
      [1, 1, 0.7],
    ); // work vest
    for (const x of [-0.08, 0.08])
      for (const y of [0.15, 0.25]) cl(spine, box(0.07, 0.06, 0.02), 0x6a5a34, [x, y, 0.12]);
    cl(hips, cyl(0.17, 0.17, 0.05, 16), 0x4a3420, [0, 0.11, 0], undefined, [1, 1, 0.72]);
    for (const a of [-1.1, 1.1, 2.4])
      cl(hips, box(0.07, 0.1, 0.05), 0x5a4028, [Math.sin(a) * 0.17, 0.05, Math.cos(a) * 0.13]);
    cl(hips, cyl(0.012, 0.012, 0.18, 6), 0x7a5a3a, [-0.17, 0.08, 0.06]);
    cl(hips, box(0.09, 0.03, 0.03), 0x555555, [-0.17, 0.09, 0.06]); // tool belt + hammer
    for (const sh of [shL, shR]) cl(sh, cyl(0.06, 0.058, 0.3, 12), 0x2a4a8a, [0, -LS + 0.31, 0]);
    for (const ft of [ftL, ftR]) cl(ft, box(0.11, 0.05, 0.27), 0x2a4a8a, [0, -0.045, 0.045]); // rubber boots
    cl(head, new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), 0x3a5a7a, [0, 0.105, -0.01]);
    cl(head, box(0.15, 0.012, 0.09), 0x3a5a7a, [0, 0.135, 0.1], [-0.15, 0, 0]); // cap
  }
  fab('plain');
  P.build(true);
  const weapon = new THREE.Group();
  handR.add(weapon);
  return {
    root,
    body,
    hips,
    spine,
    chest,
    neck,
    head,
    tail,
    uaL,
    laL,
    uaR,
    laR,
    thL,
    shL,
    thR,
    shR,
    ftL,
    ftR,
    handR,
    weapon,
    phase: Math.random() * 6,
    meleeT: 0,
    meleeDur: 0.45,
    meleeVar: 0,
    hitStop: 0,
    swings: 0,
    wRx0: Math.PI / 2,
    shootT: 0,
    hurtT: 0,
    deadT: 0,
    lootT: 0,
    vaultT: 0,
    shoveT: 0,
    state: 'idle',
    weaponKind: '',
    gunFam: null,
    gunInner: null,
    muzzle: null,
    eject: null,
    flash: null,
    flashT: 0,
    heat: 0,
    jit: [0, 0],
    shots: 0,
    f,
    t: Math.random() * 10,
    sp: {},
    w: { aim: 0, loot: 0, sneak: 0, carry: 0, sleep: 0 },
    lastYaw: 0,
    yawRate: 0,
    lastSpeed: 0,
    accel: 0,
    deathV: 0,
    hurtSide: 1,
    legT: LT,
    legS: LS,
    legH: hipH,
    det: P.dets,
    lod: 0,
  };
}
const wm = (c: number, r = 0.5, m = 0.3) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
export function setWeapon(r: Rig, kind: string) {
  if (r.weaponKind === kind) return;
  r.weaponKind = kind;
  r.weapon.clear();
  r.gunFam = gunFam(kind);
  r.gunInner = r.muzzle = r.eject = r.flash = null;
  r.weapon.position.set(0, 0, 0);
  const add = (g: THREE.BufferGeometry, c: number, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(g, wm(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    r.weapon.add(m);
    return m;
  };
  const gm = gunModel(kind);
  if (gm) {
    // v23.5 one merged model per gun (firearms.ts), inside a pivot that recoils back into the hand
    const inner = new THREE.Group();
    const m = new THREE.Mesh(gm.geo, gunMat);
    m.castShadow = true;
    inner.add(m);
    const mz = new THREE.Object3D();
    mz.position.copy(gm.muzzle);
    const ej = new THREE.Object3D();
    ej.position.copy(gm.eject);
    const fl = makeFlash();
    mz.add(fl);
    inner.add(mz, ej);
    r.weapon.add(inner);
    Object.assign(r, { gunInner: inner, muzzle: mz, eject: ej, flash: fl });
    r.weapon.rotation.set(Math.PI / 2, 0, 0);
    r.wRx0 = Math.PI / 2;
  } else if (kind === 'bat') {
    add(new THREE.CylinderGeometry(0.035, 0.016, 0.85, 8), 0xc08a4a, 0, 0, 0.36).rotation.x = Math.PI / 2;
    r.weapon.rotation.set(Math.PI / 2 - 0.3, 0, 0);
    r.wRx0 = Math.PI / 2 - 0.3;
  } else if (kind === 'hammer') {
    add(box(0.035, 0.035, 0.34), 0x8a5930, 0, 0, 0.13);
    add(box(0.16, 0.07, 0.07), 0x8c969d, 0, 0, 0.31);
    r.weapon.rotation.set(Math.PI / 2 - 0.3, 0, 0);
    r.wRx0 = Math.PI / 2 - 0.3;
  } else if (kind === 'pipe') {
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 8), 0x7a6a5a, 0, 0, 0.38).rotation.x = Math.PI / 2;
    r.weapon.rotation.set(Math.PI / 2 - 0.3, 0, 0);
    r.wRx0 = Math.PI / 2 - 0.3;
  } else if (kind === 'knife') {
    add(box(0.015, 0.05, 0.2), 0xd0d6da, 0, 0.0, 0.15);
    add(box(0.025, 0.035, 0.1), 0x5a3a1a, 0, 0, 0.02);
    r.weapon.rotation.set(Math.PI / 2, 0, 0);
    r.wRx0 = Math.PI / 2;
  }
}
/**
 * v23.5 one shot: restart the kick, add heat (sustained fire climbs and braces harder), roll a sideways shudder and
 * light the muzzle flash. Returns the family so callers can scale screen shake, casings and the flash light.
 */
export function fireShot(r: Rig): GunFam {
  const fam = r.gunFam ?? 'rifle';
  const R = RECOIL[fam];
  r.shootT = 0.14;
  r.heat = Math.min(1, r.heat + R.heat);
  r.jit = [(Math.random() - 0.5) * 2 * R.jitter, (Math.random() - 0.5) * 2 * R.jitter];
  r.shots++;
  if (r.flash) {
    r.flashT = fam === 'smg' ? 0.025 : 0.05; // suppressed: barely a flicker
    r.flash.rotation.z = Math.random() * Math.PI;
    const k =
      (fam === 'smg' ? 0.35 : fam === 'pistol' ? 0.7 : fam === 'launcher' ? 1.8 : 1) * (0.85 + Math.random() * 0.4);
    r.flash.scale.set(k, k, k * (0.8 + Math.random() * 0.5));
  }
  return fam;
}
/** Fluid procedural animation. speed in m/s (actual, already accelerated). */
// v17.2 LOD: rigs farther than LOD_FAR from the focus (the player) hide their fine detail meshes
let lodFocus: THREE.Vector3 | null = null;
const LOD_FAR = 22;
export function setLodFocus(v: THREE.Vector3 | null) {
  lodFocus = v;
}
function updateLod(r: Rig) {
  const far = lodFocus ? r.root.position.distanceToSquared(lodFocus) > LOD_FAR * LOD_FAR : false;
  const want = far ? 1 : 0;
  if (want === r.lod) return;
  r.lod = want;
  for (const m of r.det) m.visible = !far;
}
const ARM = new Set(['uaR', 'laR', 'uaRz', 'uaRy', 'laRy', 'uaL', 'laL', 'uaLz']);
/** v22.10 swing keyframes: [wind-up, contact, follow-through] per pose key */
const MELEE: Record<string, [number, number, number]>[] = [
  // 0 forehand diagonal (high right → low left)
  {
    uaR: [-2.6, -1.1, -0.4],
    laR: [-1.3, -0.15, -0.4],
    uaRz: [-0.9, 0.35, 0.7],
    uaRy: [0.3, -0.2, -0.3],
    uaL: [-0.4, -0.9, -0.8],
    laL: [-1.0, -1.1, -1.0],
    uaLz: [0.25, 0.1, 0.1],
    hipYaw: [0.28, -0.25, -0.32],
    spY: [0.55, -0.55, -0.75],
    chY: [0.25, -0.3, -0.35],
    spX: [-0.08, 0.2, 0.28],
    thL: [0.1, -0.35, -0.4],
    shL: [0.1, 0.3, 0.3],
    thR: [-0.05, 0.2, 0.25],
    stepZ: [-0.05, 0.14, 0.18],
  },
  // 1 backhand horizontal (left → right)
  {
    uaR: [-1.3, -1.5, -1.2],
    laR: [-1.6, -0.1, -0.3],
    uaRz: [0.9, -0.4, -1.0],
    uaRy: [0.6, -0.2, -0.3],
    uaL: [-0.2, -0.6, -0.7],
    laL: [-1.1, -1.0, -1.0],
    uaLz: [0.1, 0.35, 0.4],
    hipYaw: [-0.25, 0.2, 0.28],
    spY: [-0.6, 0.45, 0.65],
    chY: [-0.3, 0.25, 0.3],
    spX: [0, 0.1, 0.15],
    thR: [0.1, -0.3, -0.35],
    shR: [0.1, 0.28, 0.3],
    thL: [-0.05, 0.15, 0.2],
    stepZ: [-0.04, 0.12, 0.15],
  },
  // 2 overhead chop
  {
    uaR: [-2.9, -0.9, -0.35],
    laR: [-1.5, -0.1, -0.3],
    uaRz: [-0.2, 0.1, 0.2],
    uaL: [-0.9, -0.5, -0.4],
    laL: [-0.9, -0.8, -0.9],
    uaLz: [0.2, 0.15, 0.1],
    spX: [-0.18, 0.35, 0.45],
    chX: [-0.15, 0.1, 0.15],
    spY: [0.2, -0.15, -0.1],
    hipYaw: [0.1, -0.05, 0],
    thL: [0.05, -0.4, -0.45],
    shL: [0.15, 0.4, 0.45],
    thR: [0, 0.25, 0.3],
    shR: [0.1, 0.25, 0.3],
    stepZ: [-0.06, 0.16, 0.2],
  },
  // 3 rifle-butt jab (enemy melee): both hands drive the stock forward
  {
    uaR: [-0.5, -1.6, -1.5],
    laR: [-1.4, -0.2, -0.3],
    uaL: [-0.9, -1.25, -1.2],
    laL: [-1.2, -0.5, -0.6],
    uaLz: [-0.3, -0.4, -0.4],
    spY: [0.5, -0.4, -0.45],
    hipYaw: [0.22, -0.2, -0.22],
    spX: [-0.05, 0.25, 0.3],
    thL: [0.1, -0.4, -0.4],
    shL: [0.1, 0.3, 0.3],
    thR: [0, 0.2, 0.22],
    stepZ: [-0.06, 0.18, 0.2],
  },
];
/** v22.10 start a swing; variants alternate per rig unless forced */
export function startMelee(r: Rig, dur = 0.45, variant?: number) {
  r.meleeVar = variant ?? r.swings++ % 3;
  r.meleeDur = dur;
  r.meleeT = dur;
  r.hitStop = 0;
}
/** progress 0..1 of the current swing (-1 when idle) */
export function meleeQ(r: Rig) {
  return r.meleeT > 0 ? 1 - r.meleeT / r.meleeDur : -1;
}
export function hitStop(r: Rig, t = 0.07) {
  r.hitStop = t;
}
export function animate(r: Rig, state: AnimState, speed: number, dt: number) {
  if (dt <= 0) return;
  updateLod(r);
  r.t += dt;
  r.state = state;
  if (r.hitStop > 0) {
    r.hitStop -= dt;
    r.meleeT = Math.max(0, r.meleeT - dt * 0.08); // hit-stop: freeze the swing for a beat on contact
  } else r.meleeT = Math.max(0, r.meleeT - dt);
  r.shootT = Math.max(0, r.shootT - dt);
  r.heat = Math.max(0, r.heat - dt * (r.shootT > 0 ? 0.9 : 1.8)); // cools fast once the trigger is let go
  if (r.flash) {
    r.flashT = Math.max(0, r.flashT - dt);
    r.flash.visible = r.flashT > 0;
  }
  r.hurtT = Math.max(0, r.hurtT - dt);
  r.vaultT = Math.max(0, r.vaultT - dt);
  r.shoveT = Math.max(0, r.shoveT - dt);
  trackMotion(r, speed, dt);
  const W = r.w,
    ease = (k: string, v: number, rate: number) => {
      W[k] += (v - W[k]) * Math.min(1, dt * rate);
    };
  ease('aim', state === 'aim' || state === 'shoot' || r.shootT > 0 ? 1 : 0, 10);
  ease('loot', state === 'loot' ? 1 : 0, 6);
  ease('sneak', state === 'sneak' ? 1 : 0, 5);
  const longGun = !!r.gunFam && r.gunFam !== 'pistol';
  ease('carry', longGun && state !== 'aim' ? 1 : 0, 6);
  ease('sleep', state === 'sleep' ? 1 : 0, 3);
  const T = zero();
  const LT = r.legT,
    LS = r.legS;
  if (state === 'death') return deathPose(r, dt);
  r.deadT = 0;
  // shared stride-locked base gait (@lijiabao/character-rig); game-specific layers follow
  let { s, runW, walkW, sn, amp, p, sL, cL, tL, kL, tR, kR, breath, idleW } = baseGait(r, T, speed, dt, {
    sneak: W.sneak,
    carry: W.carry,
    aim: W.aim,
  });
  // sneak: deep crouch blended continuously
  if (sn > 0.01) {
    T.thL += -0.95 * sn;
    T.thR += -0.95 * sn;
    T.shL += 1.45 * sn;
    T.shR += 1.45 * sn;
    T.spX += 0.5 * sn;
    T.hdX -= 0.35 * sn;
    T.uaL += -0.45 * sn;
    T.uaR += -0.45 * sn;
    T.laL -= 0.7 * sn;
    T.laR -= 0.7 * sn;
    T.uaLz += 0.1 * sn;
  }
  // feet stay flat-ish (ankle compensation), toe-off in swing
  T.ftL = -(T.thL + T.shL) * 0.85 + Math.max(0, cL) * amp * 0.3;
  T.ftR = -(T.thR + T.shR) * 0.85 + Math.max(0, -cL) * amp * 0.3;
  // ---- upper overlays (layered over locomotion) ----
  const C = W.carry;
  if (C > 0.01) {
    T.uaR = T.uaR * (1 - C) - 0.55 * C;
    T.laR = T.laR * (1 - C) - 1.25 * C;
    T.uaL = T.uaL * (1 - C) - 0.85 * C;
    T.laL = T.laL * (1 - C) - 1.35 * C;
    T.uaLz = T.uaLz * (1 - C) - 0.6 * C;
    T.uaRz = T.uaRz * (1 - C) - 0.1 * C;
  }
  const A = W.aim;
  if (A > 0.01) {
    const kick = r.shootT > 0.05 ? 0.22 : 0;
    const two = longGun ? 1 : 0.7;
    T.uaR = T.uaR * (1 - A) + (-1.5 - kick) * A;
    T.laR = T.laR * (1 - A) + 0.02 * A;
    T.uaRz = T.uaRz * (1 - A);
    T.uaRy = 0.1 * A;
    T.uaL = T.uaL * (1 - A) + (-1.35 - kick * 0.5) * A;
    T.laL = T.laL * (1 - A) - 0.4 * A;
    T.uaLz = T.uaLz * (1 - A) - 0.55 * two * A;
    T.uaLy = -0.25 * A;
    T.spY *= 1 - A;
    T.chY = T.chY * (1 - A) + 0.12 * A;
    T.spX = T.spX * (1 - A * 0.5) - kick * 0.4;
    T.hdX += kick * -0.3;
    T.hdY *= 1 - A;
  }
  const Lo = W.loot;
  if (Lo > 0.01) {
    r.lootT += dt * 4;
    const L = (a: keyof Pose, v: number) => {
      T[a] = T[a] * (1 - Lo) + v * Lo;
    };
    L('thL', -1.25);
    L('thR', -0.45);
    L('shL', 1.55);
    L('shR', 1.25);
    L('ftL', -0.3);
    L('ftR', -0.75);
    L('spX', 0.55);
    L('hdX', 0.25);
    L('uaL', -1.0 + Math.sin(r.lootT) * 0.35);
    L('uaR', -1.1 + Math.cos(r.lootT * 1.3) * 0.35);
    L('laL', -0.6 + Math.sin(r.lootT * 2) * 0.2);
    L('laR', -0.5);
    L('uaLz', 0.15);
    L('uaRz', -0.15);
  }
  let stepZ = 0;
  if (r.meleeT > 0) {
    // v22.10 swing: wind-up (ease-out) → fast strike → follow-through overshoot → eased recovery,
    // driven from the hips up (hip yaw → spine → chest → arm) with a step-in and weight shift.
    const q = 1 - r.meleeT / r.meleeDur;
    const key = (w: number, c: number, f: number) =>
      q < 0.34
        ? w * eo(q / 0.34)
        : q < 0.5
          ? w + (c - w) * ei((q - 0.34) / 0.16)
          : q < 0.66
            ? c + (f - c) * eo((q - 0.5) / 0.16)
            : f * (1 - sm((q - 0.66) / 0.34));
    const V = MELEE[r.meleeVar] || MELEE[0];
    const legK = 1 - runW * 0.7; // upper-body layer while running: legs keep the gait
    for (const k in V) {
      const [w, c, f] = V[k];
      const v = key(w, c, f);
      if (k === 'stepZ') stepZ = v * legK;
      else if (k.startsWith('th') || k.startsWith('sh')) T[k as keyof Pose] += v * legK;
      else if (ARM.has(k))
        T[k as keyof Pose] = T[k as keyof Pose] * (1 - sm(q / 0.12) * (1 - sm((q - 0.85) / 0.15))) + v;
      else T[k as keyof Pose] += v;
    }
  }
  if (r.shoveT > 0) {
    const q = 1 - r.shoveT / 0.35;
    const pu = q < 0.4 ? sm(q / 0.4) : 1 - sm((q - 0.4) / 0.6);
    T.uaL = -1.5 * pu + T.uaL * (1 - pu);
    T.uaR = -1.5 * pu + T.uaR * (1 - pu);
    T.laL = -1.2 * (1 - pu);
    T.laR = -1.2 * (1 - pu);
    T.uaLz = 0.35 - 0.3 * pu;
    T.uaRz = -0.35 + 0.3 * pu;
    T.spX += 0.3 * pu;
    T.thL += -0.4 * pu;
    T.shL += 0.3 * pu;
  }
  if (r.hurtT > 0) {
    const h = sm(r.hurtT / 0.35);
    T.spX -= 0.45 * h;
    T.hdX -= 0.5 * h;
    T.spZ += 0.25 * h * r.hurtSide;
    T.uaL -= 0.7 * h;
    T.uaLz += 0.4 * h;
    T.uaR -= 0.3 * h;
    T.thR += -0.3 * h;
    T.shR += 0.4 * h;
    T.bodyX -= 0.08 * h;
  }
  let lift = 0;
  if (r.vaultT > 0) {
    const q = 1 - r.vaultT / 0.55;
    const arc = Math.sin(Math.PI * q);
    lift = arc * 0.55;
    T.thL = -1.3 * arc;
    T.thR = -0.6 * arc;
    T.shL = 1.7 * arc;
    T.shR = 1.2 * arc;
    T.spX = 0.45 * arc;
    T.uaL = -0.9 * arc;
    T.laL = -0.1;
    T.uaLz = 0.2;
    T.bodyZ = -0.25 * arc;
    T.uaR = T.uaR * (1 - arc) - 0.6 * arc;
  }
  if (W.sleep > 0.01) {
    const z = W.sleep;
    for (const k of KEYS) T[k] *= 1 - z;
    T.bodyX = (-Math.PI / 2) * z;
    T.uaL = -0.3 * z;
    T.uaR = -0.2 * z;
    T.thR = -0.4 * z;
    T.shR = 0.8 * z;
    T.hdX = 0.2 * z;
  }
  // tail (ponytail) secondary motion: driven by accel / speed
  T.tail = 0.25 + s * 0.08 - r.accel * 0.05 + Math.sin(p * 2) * amp * 0.25;
  // ---- hip IK: lower pelvis so the stance foot stays planted ----
  const eff = (th: number, sh: number) => LT * Math.cos(th) + LS * Math.cos(th + sh);
  const hipTarget = Math.max(eff(T.thL, T.shL), eff(T.thR, T.shR)) + 0.105 + breath * 0.003;
  T.hipY = (1 - W.sleep) * hipTarget + W.sleep * 0.25;
  applySprings(r, T, dt, r.meleeT > 0 ? 30 : 16);
  // v22.10 foot plant from the *rendered* (post-spring) leg: the lower foot's sole sits on the ground.
  // (was min() over target angles → pelvis followed the bent swing leg and the stance foot sank ~0.6 m in a sprint)
  if (W.sleep < 0.01 && r.vaultT <= 0) {
    const g = (k: string) => r.sp[k][0];
    const reach = Math.max(
      eff(g('thL'), g('shL')) * Math.cos(g('thLz')),
      eff(g('thR'), g('shR')) * Math.cos(g('thRz')),
    );
    r.hips.position.y = reach + 0.105 + 0.03 * walkW + breath * 0.003; // + heel/toe corner of the pitched shoe
  }
  // v23.5 gun recoil: per shot a fast kick and slow settle (muzzle snaps up, the gun slides back into the hand,
  // arms and chest are punched back, a sideways shudder); under sustained fire the heat keeps the muzzle climbing,
  // braces the shoulders and rocks the whole stance back, so full-auto reads as violent, not as a twitch.
  let recZ = 0;
  if (r.weapon && r.gunFam) {
    const R = RECOIL[r.gunFam];
    const t0 = 1 - r.shootT / 0.14,
      c = r.shootT > 0 ? (t0 < 0.18 ? t0 / 0.18 : (1 - (t0 - 0.18) / 0.82) ** 2) : 0;
    const H = r.heat * A;
    const B = R.body;
    r.weapon.rotation.x = r.wRx0 - c * R.kick - H * R.climb;
    r.weapon.rotation.y = r.jit[0] * c;
    r.weapon.rotation.z = r.jit[1] * c * 1.5;
    if (r.gunInner) r.gunInner.position.z = -c * R.back;
    r.uaR.rotation.x -= (c * 0.16 + H * 0.08) * B;
    r.laR.rotation.x -= c * 0.12 * B;
    r.uaL.rotation.x -= (c * 0.1 + H * 0.06) * B;
    r.chest.rotation.x -= (c * 0.06 + H * 0.07) * B;
    r.chest.rotation.y += r.jit[0] * c * 0.8 * B;
    r.spine.rotation.z += r.jit[1] * c * 0.5 * B;
    r.head.rotation.x -= c * 0.05 + H * 0.03;
    recZ = -(c * 0.025 + H * 0.035) * B;
  } else if (r.weapon) r.weapon.rotation.set(r.wRx0, 0, 0);
  r.body.position.y = lift + (W.sleep > 0.01 ? 0.25 * W.sleep : 0);
  r.body.position.x = r.sp.bodyZoff?.[0] ?? 0;
  r.body.position.z = -(r.hurtT > 0 ? 0.12 * sm(r.hurtT / 0.35) : 0) + stepZ + recZ;
}
function deathPose(r: Rig, dt: number) {
  if (r.deadT === 0) r.deathV = Math.floor(Math.random() * 3);
  r.deadT = Math.min(1, r.deadT + dt * 1.25);
  const d = r.deadT;
  const T = zero();
  const buck = sm(d / 0.35),
    fall = sm((d - 0.2) / 0.7);
  const LT = r.legT,
    LS = r.legS;
  let bx = 0,
    bz = 0;
  if (r.deathV === 0) {
    // knees buckle, fall backward
    T.thL = -0.9 * buck + 0.6 * fall;
    T.thR = -0.6 * buck + 0.3 * fall;
    T.shL = 1.6 * buck - 1.2 * fall;
    T.shR = 1.2 * buck - 0.9 * fall;
    T.uaL = -2.6 * fall;
    T.uaR = -2.2 * fall;
    T.uaLz = 0.7;
    T.uaRz = -0.9;
    T.hdX = -0.4 * fall;
    T.spX = 0.3 * buck - 0.3 * fall;
    bx = (-Math.PI / 2) * fall;
  } else if (r.deathV === 1) {
    // collapse forward onto face
    T.thL = -0.7 * buck + 0.5 * fall;
    T.thR = -0.3 * buck + 0.4 * fall;
    T.shL = 1.4 * buck - 1.0 * fall;
    T.shR = 0.9 * buck - 0.5 * fall;
    T.uaL = -0.6 * buck - 2.2 * fall;
    T.uaR = -0.4 - 2.6 * fall;
    T.laL = -0.8;
    T.laR = -1.4 * fall;
    T.uaLz = 0.5;
    T.uaRz = -0.6;
    T.spX = 0.6 * buck - 0.4 * fall;
    T.hdY = 0.9 * fall;
    bx = (Math.PI / 2) * fall;
  } else {
    // spin and crumple sideways
    T.thL = -1.2 * buck;
    T.thR = -0.4 * buck;
    T.shL = 1.8 * buck;
    T.shR = 1.0 * buck;
    T.spZ = 0.4 * buck;
    T.uaL = -0.4 - 1.6 * fall;
    T.uaR = -0.3;
    T.uaLz = 1.0 * fall;
    T.uaRz = -0.2;
    T.laR = -1.2;
    T.hdX = 0.3;
    T.hdY = -0.6 * fall;
    bz = (Math.PI / 2) * fall;
    r.root.rotation.y += dt * 2.2 * (1 - d);
  }
  T.hipY = (LT + LS) * (1 - 0.45 * buck) + 0.075;
  T.tail = 0.6;
  applySprings(r, T, dt, 18);
  r.body.rotation.x = bx;
  r.body.rotation.z = bz;
  r.body.position.y = 0.13 * fall;
  r.body.position.z = 0;
}
