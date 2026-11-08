import { tr } from '../i18n';
// Drivable Taiwan-street vehicles. All names, liveries and plates are invented; shapes are generic by class
// (no real brands, logos, grilles or signature design lines).
import * as THREE from 'three';
import { makeMesh, type ArmorKind } from './armor';
import { AV_LOADOUT, avState, type AvState } from './avgun';
type V2 = [number, number];
export type DKind =
  | 'scooter'
  | 'moto'
  | 'escooter'
  | 'delivery'
  | 'ubike'
  | 'basket'
  | 'kei'
  | 'taxi'
  | 'sedan'
  | 'van'
  | 'bus'
  | 'garbage'
  // v24.22 captured PLA armour
  | 'zbl08'
  | 'zbd05'
  | 'ztd05'
  | 'mengshi';
export type DSpec = {
  name: string;
  drive: boolean;
  two: boolean;
  L: number;
  W: number;
  vmax: number;
  acc: number;
  turn: number;
  noise: number;
  fuelCap: number;
  burn: number;
  elec?: boolean;
  pedal?: boolean;
  key: boolean;
  cargo: number;
  seatY: number;
  /** v24.22 PLA armour: the model comes from armor.ts, and it has guns */
  armored?: boolean;
};
export const SPEC: Record<DKind, DSpec> = {
  // v24.22 speeds are the published road speeds scaled the way the other vehicles here are; fuel and burn likewise
  zbl08: {
    name: tr('ZBL-08 輪式步兵戰車', 'ZBL-08 wheeled IFV'),
    drive: true,
    two: false,
    L: 8,
    W: 3,
    vmax: 24,
    acc: 2.4,
    turn: 0.85,
    noise: 70,
    fuelCap: 450,
    burn: 0.9,
    key: false,
    cargo: 300,
    seatY: 1.6,
    armored: true,
  },
  zbd05: {
    name: tr('ZBD-05 兩棲步兵戰車', 'ZBD-05 amphibious IFV'),
    drive: true,
    two: false,
    L: 9.5,
    W: 3.4,
    vmax: 18,
    acc: 2,
    turn: 1.05,
    noise: 80,
    fuelCap: 600,
    burn: 1.3,
    key: false,
    cargo: 260,
    seatY: 1.6,
    armored: true,
  },
  ztd05: {
    name: tr('ZTD-05 兩棲突擊車', 'ZTD-05 amphibious assault vehicle'),
    drive: true,
    two: false,
    L: 9.5,
    W: 3.4,
    vmax: 17,
    acc: 1.8,
    turn: 1,
    noise: 85,
    fuelCap: 600,
    burn: 1.4,
    key: false,
    cargo: 120,
    seatY: 1.7,
    armored: true,
  },
  mengshi: {
    name: tr('東風猛士 輕型車', 'Dongfeng Mengshi light vehicle'),
    drive: true,
    two: false,
    L: 4.9,
    W: 2.1,
    vmax: 26,
    acc: 4,
    turn: 1.35,
    noise: 45,
    fuelCap: 120,
    burn: 0.22,
    key: false,
    cargo: 180,
    seatY: 1.1,
    armored: true,
  },
  scooter: {
    name: tr('迅風 125', 'Swiftwind 125'),
    drive: true,
    two: true,
    L: 1.8,
    W: 0.7,
    vmax: 15,
    acc: 6,
    turn: 2.6,
    noise: 22,
    fuelCap: 5,
    burn: 0.025,
    key: true,
    cargo: 8,
    seatY: 0.62,
  },
  moto: {
    name: tr('老狼 150', 'Old Wolf 150'),
    drive: true,
    two: true,
    L: 2.0,
    W: 0.8,
    vmax: 19,
    acc: 7.5,
    turn: 2.3,
    noise: 40,
    fuelCap: 9,
    burn: 0.04,
    key: true,
    cargo: 4,
    seatY: 0.78,
  },
  escooter: {
    name: tr('電驢 E', 'E-Mule'),
    drive: true,
    two: true,
    L: 1.8,
    W: 0.7,
    vmax: 13,
    acc: 6.5,
    turn: 2.6,
    noise: 6,
    fuelCap: 1,
    burn: 0.006,
    elec: true,
    key: true,
    cargo: 8,
    seatY: 0.62,
  },
  delivery: {
    name: tr('迅風 125（外送版）', 'Swiftwind 125 (Delivery)'),
    drive: true,
    two: true,
    L: 1.9,
    W: 0.75,
    vmax: 14,
    acc: 5.5,
    turn: 2.5,
    noise: 22,
    fuelCap: 5,
    burn: 0.025,
    key: true,
    cargo: 18,
    seatY: 0.62,
  },
  ubike: {
    name: tr('微笑單車', 'Smile Bike'),
    drive: true,
    two: true,
    L: 1.75,
    W: 0.6,
    vmax: 7,
    acc: 3,
    turn: 2.8,
    noise: 0,
    fuelCap: 0,
    burn: 0,
    pedal: true,
    key: false,
    cargo: 3,
    seatY: 0.85,
  },
  basket: {
    name: tr('菜籃車（淑女車）', 'Basket bicycle (step-through)'),
    drive: true,
    two: true,
    L: 1.7,
    W: 0.6,
    vmax: 6,
    acc: 2.6,
    turn: 2.8,
    noise: 0,
    fuelCap: 0,
    burn: 0,
    pedal: true,
    key: false,
    cargo: 6,
    seatY: 0.8,
  },
  kei: {
    name: tr('勇馬小貨卡', 'Brave Horse mini truck'),
    drive: true,
    two: false,
    L: 3.4,
    W: 1.48,
    vmax: 16,
    acc: 4,
    turn: 1.6,
    noise: 34,
    fuelCap: 30,
    burn: 0.07,
    key: true,
    cargo: 120,
    seatY: 0.9,
  },
  taxi: {
    name: tr('萬順車隊 計程車', 'Wanshun Taxi'),
    drive: true,
    two: false,
    L: 4.6,
    W: 1.75,
    vmax: 20,
    acc: 4.5,
    turn: 1.4,
    noise: 28,
    fuelCap: 45,
    burn: 0.08,
    key: true,
    cargo: 40,
    seatY: 0.8,
  },
  sedan: {
    name: tr('老款四門轎車', 'Old four-door sedan'),
    drive: true,
    two: false,
    L: 4.4,
    W: 1.7,
    vmax: 18,
    acc: 3.8,
    turn: 1.4,
    noise: 30,
    fuelCap: 45,
    burn: 0.09,
    key: true,
    cargo: 40,
    seatY: 0.8,
  },
  van: {
    name: tr('麵包車（可當移動安全屋）', 'Van (mobile safe house)'),
    drive: true,
    two: false,
    L: 4.3,
    W: 1.7,
    vmax: 15,
    acc: 3.2,
    turn: 1.3,
    noise: 32,
    fuelCap: 50,
    burn: 0.1,
    key: true,
    cargo: 150,
    seatY: 1.0,
  },
  bus: {
    name: tr('萬華客運', 'Wanhua Transit'),
    drive: false,
    two: false,
    L: 11,
    W: 2.5,
    vmax: 0,
    acc: 0,
    turn: 0,
    noise: 0,
    fuelCap: 0,
    burn: 0,
    key: true,
    cargo: 0,
    seatY: 0,
  },
  garbage: {
    name: tr('垃圾車', 'Garbage truck'),
    drive: false,
    two: false,
    L: 7,
    W: 2.3,
    vmax: 0,
    acc: 0,
    turn: 0,
    noise: 0,
    fuelCap: 0,
    burn: 0,
    key: true,
    cargo: 0,
    seatY: 0,
  },
};
export type DV = {
  id: number;
  kind: DKind;
  s: DSpec;
  g: THREE.Group;
  pos: THREE.Vector3;
  hd: number;
  v: number;
  fuel: number;
  bat: number;
  tyre: number;
  eng: number;
  key: boolean;
  docked?: boolean;
  dust: number;
  plate: string;
  wheels: THREE.Object3D[];
  /** v24.22 PLA armour */
  tur?: THREE.Object3D;
  gun?: AvState;
};
const MS = new Map<string, THREE.MeshStandardMaterial>();
const M = (c: number, r = 0.55, m = 0.1) => {
  const k = `${c}|${r}|${m}`;
  let x = MS.get(k);
  if (!x) {
    x = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    MS.set(k, x);
  }
  return x;
};
const box = (
  g: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.rotation.x = rx;
  b.castShadow = true;
  g.add(b);
  return b;
};
const cyl = (g: THREE.Object3D, r: number, w: number, m: THREE.Material, x: number, y: number, z: number) => {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), m);
  c.rotation.z = Math.PI / 2;
  c.position.set(x, y, z);
  c.castShadow = true;
  g.add(c);
  return c;
};
function label(txt: string, w: number, h: number, bg: string, fg: string, font = 'bold 44px sans-serif') {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = Math.round((256 * h) / w);
  const c = cv.getContext('2d')!;
  c.fillStyle = bg;
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = fg;
  c.font = font;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(txt, cv.width / 2, cv.height / 2);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
}
const plateNo = (r: () => number, two: boolean) => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const l = () => A[Math.floor(r() * A.length)];
  const d = () => Math.floor(r() * 10);
  return two ? `${l()}${l()}${l()}-${d()}${d()}${d()}` : `${l()}${l()}${l()}-${d()}${d()}${d()}${d()}`;
};
const TIN = [0x8fa8a0, 0xc8c0b0, 0x6a8a9a, 0xa83a30, 0x2a2a2e, 0xe8e4da, 0x4a6a5a];
export function scooterModel(kind: DKind, r: () => number) {
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const col =
    kind === 'escooter' ? [0x9ac8d0, 0xe8e8e8, 0x3a3a40][Math.floor(r() * 3)] : TIN[Math.floor(r() * TIN.length)];
  const fade = new THREE.Color(col).lerp(new THREE.Color(0xd8d0c0), 0.25 + r() * 0.3).getHex();
  const body = M(fade, 0.6, 0.05),
    dark = M(0x1c1c1e, 0.85),
    chrome = M(0x9a9a9a, 0.4, 0.6);
  box(g, 0.36, 0.28, 0.95, body, 0, 0.42, -0.05);
  box(g, 0.32, 0.6, 0.18, body, 0, 0.66, 0.48, -0.25);
  box(g, 0.3, 0.08, 0.42, dark, 0, 0.32, 0.25); // floorboard
  const seat = box(g, 0.34, 0.1, 0.56, dark, 0, 0.62, -0.2);
  if (r() < 0.5) box(g, 0.12, 0.02, 0.18, M(0xd8c8a0, 0.9), 0.06, 0.675, -0.1);
  void seat; // torn seat foam
  box(g, 0.62, 0.04, 0.04, chrome, 0, 1.0, 0.56);
  box(g, 0.14, 0.1, 0.06, M(0xfff4d0, 0.3), 0, 0.88, 0.62); // bar + headlight
  box(g, 0.04, 0.12, 0.02, chrome, 0, 0.8, 0.45); // front hook
  box(g, 0.2, 0.05, 0.03, M(0xf4f4f0), 0, 0.42, -0.53);
  const pl = label(plateNo(r, true), 0.2, 0.1, '#f4f4f0', '#222', 'bold 70px monospace');
  box(g, 0.2, 0.1, 0.01, pl, 0, 0.36, -0.54);
  if (kind === 'delivery') {
    const bx = new THREE.Group();
    box(bx, 0.46, 0.42, 0.42, M(0x3a3f8a, 0.6), 0, 0, 0);
    const lb = label(tr('飽飽送', 'Full Belly'), 0.46, 0.2, '#3a3f8a', '#ffe680');
    box(bx, 0.44, 0.18, 0.005, lb, 0, 0.02, -0.215);
    bx.position.set(0, 0.92, -0.38);
    g.add(bx);
  }
  for (const z of [-0.45, 0.55]) wheels.push(cyl(g, 0.2, 0.1, dark, 0, 0.2, z));
  return { g, wheels };
}
function motoModel(r: () => number) {
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const dark = M(0x1a1a1a, 0.8),
    tank = M([0x7a2a22, 0x2a3a2a, 0x2a2a2a][Math.floor(r() * 3)], 0.45, 0.2),
    chrome = M(0xa0a0a0, 0.35, 0.7);
  box(g, 0.26, 0.24, 0.5, tank, 0, 0.88, 0.2);
  box(g, 0.24, 0.1, 0.6, dark, 0, 0.82, -0.25);
  box(g, 0.2, 0.3, 0.5, M(0x3a3a3a, 0.6, 0.4), 0, 0.5, 0.05);
  box(g, 0.06, 0.06, 0.9, chrome, 0.16, 0.42, -0.35);
  box(g, 0.7, 0.04, 0.04, chrome, 0, 1.12, 0.6);
  box(g, 0.05, 0.6, 0.05, chrome, 0, 0.75, 0.72, 0.35);
  box(g, 0.16, 0.06, 0.4, tank, 0, 0.55, 0.85);
  box(g, 0.16, 0.06, 0.4, tank, 0, 0.62, -0.82);
  for (const z of [-0.72, 0.78]) wheels.push(cyl(g, 0.31, 0.14, dark, 0, 0.31, z));
  return { g, wheels };
}
function bikeModel(kind: DKind, r: () => number) {
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const fr =
      kind === 'ubike' ? M(0x2a9a8a, 0.5, 0.3) : M([0xe8b8c0, 0xe8e8e0, 0x8ab8d8][Math.floor(r() * 3)], 0.5, 0.2),
    dark = M(0x1a1a1a, 0.8);
  box(g, 0.05, 0.05, 0.85, fr, 0, 0.5, 0, -0.35);
  box(g, 0.05, 0.5, 0.05, fr, 0, 0.6, -0.2);
  box(g, 0.05, 0.55, 0.05, fr, 0, 0.7, 0.5, 0.3);
  box(g, 0.55, 0.04, 0.04, dark, 0, 0.98, 0.42);
  box(g, 0.2, 0.06, 0.26, dark, 0, 0.86, -0.22);
  if (kind === 'ubike') {
    box(g, 0.36, 0.22, 0.28, M(0xe8f0ec, 0.6), 0, 0.82, 0.68);
    box(g, 0.34, 0.1, 0.005, label(tr('微笑', 'Smile'), 0.34, 0.1, '#2a9a8a', '#fff'), 0, 0.82, 0.825);
    box(g, 0.08, 0.12, 0.6, M(0xe8f0ec, 0.6), 0, 0.42, 0.15);
  } else box(g, 0.36, 0.24, 0.3, M(0x9a8a6a, 0.9), 0, 0.82, 0.68);
  for (const z of [-0.55, 0.6]) wheels.push(cyl(g, 0.33, 0.04, dark, 0, 0.33, z));
  return { g, wheels };
}
export function carModel(kind: DKind, r: () => number) {
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const s = SPEC[kind];
  const L = s.L,
    W = s.W;
  const glass = M(0x1e2a30, 0.15, 0.6),
    dark = M(0x151515, 0.9),
    lamp = M(0xf4f0e0, 0.3),
    red = M(0xa02020, 0.4);
  const C =
    kind === 'taxi'
      ? 0xf0c020
      : kind === 'kei'
        ? [0x2a5a9a, 0xe8e8e8, 0x6a8aa0][Math.floor(r() * 3)]
        : kind === 'van'
          ? [0xe8e8e0, 0xc8c8c0, 0x8a9aa8][Math.floor(r() * 3)]
          : kind === 'bus'
            ? 0xe8ece8
            : kind === 'garbage'
              ? 0xf2c818
              : [0xd8d4c8, 0x8a1a1a, 0x2a3a5a, 0x4a5a4a, 0xb8b8b0][Math.floor(r() * 5)];
  const paint = M(C, kind === 'sedan' ? 0.75 : 0.45, 0.3);
  if (kind === 'kei') {
    box(g, W, 1.35, 1.25, paint, 0, 1.0, L / 2 - 0.62);
    box(g, W * 0.94, 0.55, 0.05, glass, 0, 1.32, L / 2 + 0.01);
    box(g, W, 0.12, L - 1.3, M(0x5a5a5a, 0.7, 0.4), 0, 0.62, -0.62);
    for (const x of [-W / 2, W / 2]) box(g, 0.04, 0.35, L - 1.3, M(0x8a8a8a, 0.6, 0.5), x, 0.85, -0.62);
    box(g, W, 0.35, 0.04, M(0x8a8a8a, 0.6, 0.5), 0, 0.85, -L / 2 + 0.02);
    if (r() < 0.6) {
      const tarp = box(
        g,
        W * 0.96,
        0.5,
        L - 1.4,
        M([0x2a4a8a, 0x3a6a3a, 0x6a6a6a][Math.floor(r() * 3)], 0.95),
        0,
        1.0,
        -0.62,
      );
      tarp.scale.y = 0.9;
    }
  } else if (kind === 'van') {
    box(g, W, 1.55, L * 0.88, paint, 0, 1.12, -L * 0.06);
    box(g, W, 0.8, L * 0.14, paint, 0, 0.75, L * 0.43);
    box(g, W * 0.92, 0.6, 0.05, glass, 0, 1.4, L * 0.38, -0.5);
    for (const x of [-W / 2 - 0.005, W / 2 + 0.005]) box(g, 0.01, 0.45, L * 0.6, glass, x, 1.45, -0.1);
  } else if (kind === 'bus' || kind === 'garbage') {
    box(g, W, kind === 'bus' ? 2.6 : 2.2, L, paint, 0, kind === 'bus' ? 1.65 : 1.5, 0);
    if (kind === 'bus') {
      for (const x of [-W / 2 - 0.005, W / 2 + 0.005]) box(g, 0.01, 0.9, L * 0.85, glass, x, 2.1, 0);
      box(g, W - 0.01, 0.5, 0.42, M(0x2a8a5a, 0.5), 0, 0.75, 0);
      box(
        g,
        0.01,
        0.35,
        2.2,
        label(tr('萬華客運　萬88', 'Wanhua Transit W88'), 2.2, 0.35, '#2a8a5a', '#fff'),
        W / 2 + 0.012,
        0.75,
        0,
      );
      box(
        g,
        1.4,
        0.3,
        0.02,
        label(tr('萬88 龍山寺', 'W88 Longshan Temple'), 1.4, 0.3, '#111', '#ffb020'),
        0,
        2.75,
        L / 2 + 0.01,
      );
    } else {
      box(g, W, 1.7, 1.8, paint, 0, 1.25, L / 2 - 0.9);
      box(g, W * 0.9, 0.6, 0.04, glass, 0, 1.6, L / 2 + 0.01);
      box(g, 0.01, 0.4, 2.2, label(tr('清潔隊', 'Sanitation'), 2.2, 0.4, '#f2c818', '#1a4a2a'), W / 2 + 0.012, 1.3, -1);
    }
  } else {
    box(g, W, 0.62, L, paint, 0, 0.66, 0);
    const cabL = L * 0.48;
    box(g, W * 0.9, 0.55, cabL, paint, 0, 1.24, -0.15);
    box(g, W * 0.86, 0.5, 0.04, glass, 0, 1.24, -0.15 + cabL / 2 + 0.01);
    box(g, W * 0.86, 0.45, 0.04, glass, 0, 1.24, -0.15 - cabL / 2 - 0.01);
    for (const x of [-W * 0.45 - 0.005, W * 0.45 + 0.005]) box(g, 0.01, 0.4, cabL * 0.9, glass, x, 1.26, -0.15);
    if (kind === 'taxi') {
      box(g, 0.62, 0.2, 0.26, label(tr('計程車', 'Taxi'), 0.62, 0.2, '#ffffff', '#1a1a1a'), 0, 1.62, -0.15);
      box(
        g,
        0.01,
        0.16,
        1.2,
        label(tr('萬順車隊', 'Wanshun'), 1.2, 0.16, '#f0c020', '#1a1a1a'),
        W / 2 + 0.006,
        0.7,
        -0.2,
      );
    }
  }
  if (kind !== 'bus' && kind !== 'garbage') {
    for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) {
      box(g, 0.28, 0.12, 0.03, lamp, x, kind === 'kei' || kind === 'van' ? 0.72 : 0.72, L / 2 + 0.01);
      box(g, 0.22, 0.12, 0.03, red, x, 0.75, -L / 2 - 0.01);
    }
    box(
      g,
      0.32,
      0.14,
      0.01,
      label(plateNo(r, false), 0.32, 0.14, '#f4f4f0', '#222', 'bold 60px monospace'),
      0,
      0.5,
      -L / 2 - 0.02,
    );
  }
  const wr = kind === 'bus' || kind === 'garbage' ? 0.5 : kind === 'kei' ? 0.28 : 0.32;
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05])
    for (const z of [-L / 2 + Math.max(0.6, L * 0.17), L / 2 - Math.max(0.55, L * 0.17)])
      wheels.push(cyl(g, wr, 0.22, dark, x, wr, z));
  return { g, wheels };
}
export type DriveDeps = {
  scene: THREE.Scene;
  bldAt: (x: number, z: number) => any;
  noise: (x: number, z: number, r: number) => void;
  log: (m: string, c?: string) => void;
  power: () => boolean;
  armor: () => THREE.Vector3[];
  skills: () => { ride?: number; lockpick?: boolean; repair?: number };
  inv: () => Record<string, number>;
  hurt: (n: number) => void;
  roadW: (x: number, z: number) => number;
};
export class DriveSystem {
  list: DV[] = [];
  cur: DV | null = null;
  acc = 0;
  wire = 0;
  wireV: DV | null = null;
  constructor(public d: DriveDeps) {}
  spawn(kind: DKind, x: number, z: number, hd: number, r: () => number, o: Partial<DV> = {}) {
    const s = SPEC[kind];
    let tur: THREE.Object3D | undefined;
    const m: { g: THREE.Group; wheels: THREE.Object3D[] } = s.armored
      ? (() => {
          // the model faces +x, a driven vehicle faces +z; with this turn, yaw = hd + tur.rotation.y
          const q = makeMesh(kind as ArmorKind);
          q.g.rotation.y = -Math.PI / 2;
          const h = new THREE.Group();
          h.add(q.g);
          tur = q.tur;
          return { g: h, wheels: [] as THREE.Object3D[] };
        })()
      : s.two
        ? kind === 'moto'
          ? motoModel(r)
          : kind === 'ubike' || kind === 'basket'
            ? bikeModel(kind, r)
            : scooterModel(kind, r)
        : carModel(kind, r);
    if (kind === 'sedan' && r() < 0.7)
      m.g.traverse(q => {
        const mm = (q as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mm && mm.color && !mm.map) {
          (q as THREE.Mesh).material = mm.clone();
          ((q as THREE.Mesh).material as THREE.MeshStandardMaterial).color.lerp(new THREE.Color(0xb0a890), 0.35);
        }
      }); // dusty
    m.g.position.set(x, 0, z);
    m.g.rotation.y = hd;
    this.d.scene.add(m.g);
    const v: DV = {
      id: this.list.length,
      kind,
      s,
      g: m.g,
      pos: m.g.position,
      hd,
      v: 0,
      fuel: s.fuelCap * (0.1 + r() * 0.7),
      bat: 0.5 + r() * 0.5,
      tyre: r() < 0.25 ? 0.3 : 1,
      eng: 0.6 + r() * 0.4,
      key: r() < 0.4,
      dust: 0,
      plate: '',
      wheels: m.wheels,
      ...(s.armored
        ? { tur, gun: avState(AV_LOADOUT[kind as keyof typeof AV_LOADOUT], 0.6 + r() * 0.4), tyre: 1, key: true }
        : {}),
      ...o,
    };
    if (s.two && !s.pedal) v.g.rotation.z = 0.12; // on side stand
    this.list.push(v);
    return v;
  }
  nearest(p: THREE.Vector3, r = 2.6) {
    let b: DV | null = null,
      bd = r;
    for (const v of this.list) {
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z) - v.s.L * 0.3;
      if (d < bd) {
        bd = d;
        b = v;
      }
    }
    return b;
  }
  status(v: DV) {
    const s = v.s;
    const f = s.pedal
      ? ''
      : s.elec
        ? tr(`電量 ${Math.round((v.fuel / s.fuelCap) * 100)}%`, `Charge ${Math.round((v.fuel / s.fuelCap) * 100)}%`)
        : tr(`油 ${v.fuel.toFixed(1)}/${s.fuelCap}L`, `Fuel ${v.fuel.toFixed(1)}/${s.fuelCap} L`);
    return tr(
      `${s.name}｜${f}｜輪胎 ${Math.round(v.tyre * 100)}%｜電瓶 ${Math.round(v.bat * 100)}%｜引擎 ${Math.round(v.eng * 100)}%`,
      `${s.name}｜${f}｜Tires ${Math.round(v.tyre * 100)}%｜Battery ${Math.round(v.bat * 100)}%｜Engine ${Math.round(v.eng * 100)}%`,
    );
  }
  /** try to get on; returns message or '' when entered */
  enter(v: DV): string {
    const s = v.s,
      sk = this.d.skills(),
      inv = this.d.inv();
    if (!s.drive)
      return tr(
        `${s.name}：太大台，開不動（可當路障或拿來引誘巡邏）`,
        `${s.name}: too large to drive (can serve as a barricade or lure patrols)`,
      );
    if (v.docked) {
      if (inv.hammer || inv.pipe) {
        v.docked = false;
        this.d.noise(v.pos.x, v.pos.z, 26);
        this.d.log(
          tr(
            '哐！你把微笑單車從停車柱上硬撬下來——聲音很大。',
            'Clang! You pry the Smile Bike off its dock—with a very loud noise.',
          ),
          '#fc8',
        );
      } else
        return tr(
          '微笑單車鎖在停車柱上：需要鐵鎚或鐵管撬開',
          'The Smile Bike is locked to its dock. You need a hammer or metal pipe to pry it free.',
        );
    }
    if (s.key && !v.key && !inv['key' + v.id]) {
      if (!sk.lockpick)
        return tr(`${s.name}：沒有鑰匙（水電師傅可以接線發動）`, `${s.name}: no key (a handyman can hot-wire it)`);
      if (this.wireV !== v) {
        this.wireV = v;
        this.wire = sk.repair ? 2.5 : 4;
        return tr(
          '🔧 拆開鎖頭蓋，開始接線…（再按一次互動繼續）',
          '🔧 You remove the ignition cover and start hot-wiring… (interact again to continue)',
        );
      }
      if (this.wire > 0)
        return tr(`🔧 接線中…還要 ${this.wire.toFixed(1)} 秒`, `🔧 Hot-wiring… ${this.wire.toFixed(1)} seconds left`);
      v.key = true;
    }
    if (!s.pedal && !s.elec && v.fuel <= 0.05)
      return tr(
        `${s.name}：油箱是空的（用塑膠管從別的車抽油，或找汽油桶）`,
        `${s.name}: empty fuel tank (siphon another vehicle with a plastic hose, or find a gas can)`,
      );
    if (s.elec && v.fuel <= 0.02)
      return tr(
        `${s.name}：電池沒電了${this.d.power() ? '' : '——停電後沒地方充電'}`,
        `${s.name}: battery empty${this.d.power() ? '' : '—there is nowhere to charge during the blackout'}`,
      );
    if (!s.pedal && v.bat < 0.15)
      return tr(
        `${s.name}：電瓶沒電，發不動（找汽車電瓶換上）`,
        `${s.name}: dead starter battery (find a car battery to replace it)`,
      );
    if (!s.pedal && v.eng < 0.1)
      return tr(`${s.name}：引擎壞了（需要修理）`, `${s.name}: broken engine (repairs needed)`);
    this.cur = v;
    v.g.rotation.z = 0;
    return '';
  }
  exit() {
    const v = this.cur;
    if (!v) return null;
    this.cur = null;
    v.v = 0;
    if (v.s.two && !v.s.pedal) v.g.rotation.z = 0.12;
    const side = v.s.two ? 0.8 : v.s.W / 2 + 0.6;
    return new THREE.Vector3(v.pos.x + Math.cos(v.hd) * side, 0, v.pos.z - Math.sin(v.hd) * side);
  }
  blocked(v: DV, x: number, z: number, hd: number) {
    const s = v.s;
    const fx = Math.sin(hd),
      fz = Math.cos(hd),
      rx = Math.cos(hd),
      rz = -Math.sin(hd);
    for (const [a, b] of [
      [0.5, 0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [-0.5, -0.5],
      [0.5, 0],
    ]) {
      const px = x + fx * s.L * a + rx * s.W * b,
        pz = z + fz * s.L * a + rz * s.W * b;
      if (this.d.bldAt(px, pz)) return true;
    }
    for (const o of this.list)
      if (
        o !== v &&
        Math.hypot(o.pos.x - x, o.pos.z - z) < (o.s.L + s.L) * 0.32 &&
        Math.hypot(o.pos.x - x, o.pos.z - z) < (o.s.W + s.W) * 0.9 + 0.5
      )
        return true;
    return false;
  }
  /** dir: desired screen-space direction (world xz) with magnitude 0..1; brake: hold */
  update(dt: number, want: THREE.Vector3, power: boolean) {
    if (this.wireV && this.wire > 0) {
      this.wire -= dt;
      if (this.wire <= 0)
        this.d.log(
          tr('⚡ 線接好了，再按互動發動。', '⚡ Wiring complete. Interact again to start the engine.'),
          '#9f9',
        );
    }
    for (const v of this.list)
      if (v.s.elec && power && v !== this.cur) v.fuel = Math.min(v.s.fuelCap, v.fuel + dt * 0.0005); // trickle charge only while grid is up (parked at home outlet)
    const v = this.cur;
    if (!v) return;
    const s = v.s;
    const m = Math.min(1, want.length());
    const sk = this.d.skills();
    const vmax = s.vmax * (s.two ? (sk.ride ?? 1) : 1) * (0.45 + 0.55 * v.tyre) * (s.pedal ? 1 : 0.5 + 0.5 * v.eng);
    let target = 0;
    if (m > 0.1) {
      const wh = Math.atan2(want.x, want.z);
      let dh = Math.atan2(Math.sin(wh - v.hd), Math.cos(wh - v.hd));
      if (Math.abs(dh) > 2.4 && Math.abs(v.v) < 2) {
        target = -vmax * 0.3 * m;
        dh = Math.atan2(Math.sin(wh + Math.PI - v.hd), Math.cos(wh + Math.PI - v.hd));
      } else target = vmax * m * Math.max(0.25, Math.cos(dh * 0.6));
      const steer = s.turn * Math.min(1, Math.abs(v.v) / 3 + 0.15) * Math.sign(v.v || 1);
      v.hd += THREE.MathUtils.clamp(dh, -1, 1) * steer * dt * (v.tyre < 0.5 ? 0.7 : 1);
    }
    const out = !s.pedal && v.fuel <= 0;
    if (out) target = 0;
    v.v += THREE.MathUtils.clamp(target - v.v, -s.acc * 2 * dt, s.acc * dt);
    const nx = v.pos.x + Math.sin(v.hd) * v.v * dt,
      nz = v.pos.z + Math.cos(v.hd) * v.v * dt;
    if (this.blocked(v, nx, nz, v.hd)) {
      const hit = Math.abs(v.v);
      if (hit > 6) {
        v.eng = Math.max(0, v.eng - hit * 0.02);
        v.tyre = Math.max(0, v.tyre - hit * 0.01);
        this.d.hurt(s.two ? hit * 1.5 : hit * 0.4);
        this.d.noise(v.pos.x, v.pos.z, 30);
        this.d.log(
          tr(`💥 撞上了！引擎 ${Math.round(v.eng * 100)}%`, `💥 Collision! Engine ${Math.round(v.eng * 100)}%`),
          '#f88',
        );
      }
      v.v = -v.v * 0.15;
      if (!s.two && this.d.roadW(v.pos.x, v.pos.z) < s.W + 0.8 && hit > 1)
        this.d.log(
          tr(
            '巷子太窄，汽車過不去——改騎機車或用走的。',
            'The alley is too narrow for a car. Take a scooter or go on foot.',
          ),
          '#ccc',
        );
    } else {
      v.pos.x = nx;
      v.pos.z = nz;
    }
    v.g.rotation.y = v.hd;
    if (s.two) v.g.rotation.z = THREE.MathUtils.lerp(v.g.rotation.z, 0, 0.2);
    for (const w of v.wheels) w.rotation.x += (v.v * dt) / 0.3;
    if (!s.pedal) {
      v.fuel = Math.max(0, v.fuel - s.burn * dt * (0.2 + Math.abs(v.v) / Math.max(1, s.vmax)));
      if (v.fuel <= 0 && !out)
        this.d.log(
          s.elec
            ? tr('🔋 電池沒電了。', '🔋 The battery is empty.')
            : tr('⛽ 沒油了，車子慢慢停下來。', '⛽ Out of fuel. The vehicle rolls to a stop.'),
          '#fc8',
        );
    }
    this.acc += dt;
    if (this.acc > 0.6 && s.noise > 0) {
      this.acc = 0;
      this.d.noise(v.pos.x, v.pos.z, s.noise * (0.5 + 0.5 * Math.min(1, Math.abs(v.v) / Math.max(1, s.vmax))));
    }
    for (const a of this.d.armor()) {
      if (Math.hypot(a.x - v.pos.x, a.z - v.pos.z) < 3 + s.L * 0.3) {
        v.eng = Math.max(0, v.eng - 0.5);
        v.tyre = 0.2;
        v.v = 0;
        this.d.hurt(s.two ? 35 : 15);
        this.d.log(tr('💥 裝甲車直接撞上來！', '💥 An armored vehicle rams you!'), '#f66');
        v.pos.x -= (a.x - v.pos.x) * 0.5;
        v.pos.z -= (a.z - v.pos.z) * 0.5;
      }
    }
  }
  siphon(from: DV): string {
    const inv = this.d.inv();
    if (from.s.pedal || from.s.elec || from.s.fuelCap <= 0) return tr('這台沒有油箱', 'This vehicle has no fuel tank.');
    if (!inv.hose)
      return tr(
        `${from.s.name}：油箱還有 ${from.fuel.toFixed(1)} L——需要塑膠管才能抽油`,
        `${from.s.name}: ${from.fuel.toFixed(1)} L in the tank—a plastic hose is needed to siphon it`,
      );
    if (from.fuel < 1) return tr('油箱幾乎是空的', 'The fuel tank is almost empty.');
    const n = Math.min(Math.floor(from.fuel), 5);
    from.fuel -= n;
    inv.gas = (inv.gas || 0) + n;
    this.d.noise(from.pos.x, from.pos.z, 4);
    return tr(
      `用塑膠管抽出 ${n} L 汽油（嘴裡一股油味）`,
      `Siphoned ${n} L of gasoline through a plastic hose (leaving a taste of fuel)`,
    );
  }
  refuel(v: DV): string {
    const inv = this.d.inv();
    if (v.s.pedal || v.s.elec) return v.s.elec ? tr('電動車不能加汽油', 'Electric vehicles cannot use gasoline.') : '';
    if (!inv.gas) return '';
    const n = Math.min(inv.gas, Math.ceil(v.s.fuelCap - v.fuel));
    if (n <= 0) return tr('油箱滿了', 'The fuel tank is full.');
    v.fuel += n;
    inv.gas -= n;
    if (!inv.gas) delete inv.gas;
    return tr(`倒進 ${n} L 汽油`, `Added ${n} L of gasoline`);
  }
  repair(v: DV): string {
    const inv = this.d.inv(),
      sk = this.d.skills();
    const out: string[] = [];
    if (v.tyre < 0.9 && inv.patch) {
      v.tyre = 1;
      if (--inv.patch <= 0) delete inv.patch;
      out.push(tr('補好輪胎', 'Patched the tire'));
    }
    if (v.bat < 0.5 && inv.carbat && !v.s.pedal) {
      v.bat = 1;
      if (--inv.carbat <= 0) delete inv.carbat;
      out.push(tr('換上電瓶', 'Replaced the battery'));
    }
    if (v.eng < 0.7 && !v.s.pedal && (inv.hammer || inv.pipe)) {
      v.eng = Math.min(1, v.eng + (sk.repair ? 0.6 : 0.25));
      out.push(
        sk.repair
          ? tr('師傅手法：引擎大致修好', 'Expert repairs: engine mostly restored')
          : tr('敲敲打打，引擎好一點', 'A few makeshift repairs improve the engine'),
      );
      this.d.noise(v.pos.x, v.pos.z, 12);
    }
    return out.join('、');
  }
}
