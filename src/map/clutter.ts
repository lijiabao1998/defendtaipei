// v23.0 lived-in interiors for every enterable building that has no hand-designed fit-out (interiors.ts).
// plan(): deterministic per building (seeded by its id), cheap, run for all buildings at load → identical
// furniture / cover segments on every client. build(): merged vertex-coloured geometry, created lazily
// near the player and disposed when far (mobile safe: 2 draw calls per dressed building).
// Content: ground-floor shops (小吃店 / 機車行 / 雜貨店) or homes, a stairwell in multi-storey blocks, and
// signs of a hurried flight. All products/brands are generic (no logos, no real brands).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
type V2 = [number, number];
export type Use =
  'eatery' | 'scooter' | 'grocery' | 'home' | 'school' | 'clinic' | 'temple' | 'market' | 'police' | 'office';
/** v23.6 buildings with their own fit-out (from OSM building / amenity tags or the name) */
export const SPECIAL = new Set<Use>(['school', 'clinic', 'temple', 'market', 'police', 'office']);
/**
 * v23.6 what kind of public building a footprint is: k = OSM building=*, s = shop / amenity, n = name.
 * null for ordinary homes and shops (and for toilets, shelters, sheds and the like).
 */
export function specialKind(k = '', s = '', n = ''): Use | null {
  if (/^(toilets|shelter|parking|clock|bicycle_parking)$/.test(s)) return null;
  if (/^(roof|greenhouse|grandstand|parking|construction|hut|toilets|garage|shed|service)$/.test(k)) return null;
  if (/圖書館|郵局|銀行|區公所|里辦公處|活動中心/.test(n)) return 'office';
  const SCH = /^(school|kindergarten|college|university)$/;
  if (SCH.test(k) || SCH.test(s) || /國小|國中|高中|高職|小學|中學|學校|幼兒園|大學|學院/.test(n)) return 'school';
  if (/^(hospital|clinic)$/.test(k) || /^(hospital|clinic|doctors|dentist)$/.test(s) || /醫院|診所|衛生所|院區/.test(n))
    return 'clinic';
  if (/^(police|fire_station)$/.test(s) || /派出所|分局|警察|消防/.test(n)) return 'police';
  if (/^(temple|shrine|church|chapel)$/.test(k) || s === 'place_of_worship' || /宮|寺|廟|壇|祠|教會|禮拜堂/.test(n))
    return 'temple';
  if (s === 'marketplace' || /市場/.test(n)) return 'market';
  if (
    /^(office|commercial|government|public|hotel|train_station)$/.test(k) ||
    /^(townhall|bank|post_office|library|community_centre|social_facility|courthouse)$/.test(s)
  )
    return 'office';
  return null;
}
/** one box in piece-local space: size, colour, offset, rotation */
type Part = [
  w: number,
  h: number,
  d: number,
  c: number,
  x: number,
  y: number,
  z: number,
  ry?: number,
  rx?: number,
  rz?: number,
];
type Piece = {
  u: number;
  v: number;
  ry: number;
  parts: Part[];
  glow?: Part[];
  /** collision footprint (w × d, local) and height; 0 = walk over */
  cw: number;
  cd: number;
  ch: number;
  cont?: { label: string; loot: string };
};
export type Plan = {
  use: Use;
  O: V2;
  U: V2;
  N: V2;
  pieces: Piece[];
  decals: Part[];
  segs: { a: V2; b: V2; h: number }[];
  conts: { id: string; p: V2; label: string; loot: string; seed: number }[];
  /** v23.4 centre of the stairwell piece in the (O, U, N) frame, when one was placed (multi-storey blocks) */
  stair?: { u: number; v: number };
};
function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clutterStats = { planned: 0, built: 0, live: 0, pieces: 0, conts: 0, segs: 0 };
// ---------- furniture catalogue (piece-local: x = width, z = depth, front faces -z → into the room) ----------
const WOOD = 0x7a5534,
  DWOOD = 0x4e3422,
  RED = 0x9e2a22,
  RATTAN = 0xb48a52,
  STEEL = 0x8c9194,
  WHITE = 0xe4e2da,
  PLASTIC = [0x3f78b5, 0xd8d0c0, 0xc74a48, 0x5a9a62];
const chair = (c: number, over = false): Part[] =>
  over
    ? [
        [0.42, 0.04, 0.42, c, 0, 0.2, 0, 0, Math.PI / 2], // seat standing on edge
        [0.42, 0.45, 0.04, c, 0, 0.04, 0.2, 0, Math.PI / 2],
        [0.04, 0.42, 0.04, c, -0.18, 0.21, -0.2, 0, 0, Math.PI / 2],
      ]
    : [
        [0.42, 0.04, 0.42, c, 0, 0.45, 0],
        [0.42, 0.45, 0.04, c, 0, 0.7, 0.19],
        [0.04, 0.45, 0.04, c, -0.18, 0.22, -0.18],
        [0.04, 0.45, 0.04, c, 0.18, 0.22, -0.18],
        [0.04, 0.45, 0.04, c, -0.18, 0.22, 0.18],
        [0.04, 0.45, 0.04, c, 0.18, 0.22, 0.18],
      ];
const stool = (c: number): Part[] => [
  [0.32, 0.04, 0.32, c, 0, 0.45, 0],
  [0.26, 0.42, 0.26, c, 0, 0.22, 0],
];
const table = (w: number, d: number, c: number, h = 0.75): Part[] => [
  [w, 0.04, d, c, 0, h, 0],
  ...(
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const
  ).map(([a, b]) => [0.05, h, 0.05, STEEL, a * (w / 2 - 0.06), h / 2, b * (d / 2 - 0.06)] as Part),
];
/** generic rice cooker (no logos): two-tone cylinder approximated by stacked boxes */
const cooker = (x: number, y: number, z: number): Part[] => [
  [0.26, 0.2, 0.26, 0x6f9a7a, x, y + 0.1, z],
  [0.24, 0.05, 0.24, WHITE, x, y + 0.225, z],
  [0.06, 0.03, 0.02, 0x333333, x, y + 0.12, z - 0.135],
];
const dishes = (x: number, y: number, z: number, r: () => number): Part[] =>
  Array.from(
    { length: 2 + Math.floor(r() * 3) },
    () =>
      [0.16, 0.03, 0.16, r() < 0.5 ? WHITE : 0xd9c9a0, x + (r() - 0.5) * 0.6, y + 0.02, z + (r() - 0.5) * 0.4] as Part,
  );
const shelf = (w: number, c: number, r: () => number, goods = true): Part[] => {
  const P: Part[] = [
    [w, 1.8, 0.04, c, 0, 0.9, 0.2],
    [0.04, 1.8, 0.42, c, -w / 2, 0.9, 0],
    [0.04, 1.8, 0.42, c, w / 2, 0.9, 0],
  ];
  for (const y of [0.1, 0.55, 1.0, 1.45]) {
    P.push([w, 0.03, 0.42, c, 0, y, 0]);
    if (goods)
      for (let x = -w / 2 + 0.12; x < w / 2 - 0.1; x += 0.16 + r() * 0.1)
        if (r() < 0.6) {
          const h = 0.1 + r() * 0.25;
          P.push([
            0.12,
            h,
            0.2,
            [0xc8b48a, 0xd05a3a, 0x4a7ab0, 0xe8d24a, 0x6a9a50][Math.floor(r() * 5)],
            x,
            y + h / 2 + 0.02,
            -0.02,
          ]);
        }
  }
  return P;
};
const boxes = (r: () => number, n = 3): Part[] => {
  const P: Part[] = [];
  let y = 0;
  for (let i = 0; i < n; i++) {
    const s = 0.35 + r() * 0.25;
    P.push([s, s * 0.8, s, 0xb08a5a, (r() - 0.5) * 0.15, y + s * 0.4, (r() - 0.5) * 0.15, r() * 0.5]);
    y += s * 0.8;
  }
  return P;
};
const altar = (r: () => number): Part[] => [
  // 神明桌: tall red-brown table, a lower 八仙桌 in front, red lamps, incense pot, offerings
  [1.6, 0.06, 0.55, RED, 0, 1.05, 0.05],
  [1.6, 1.02, 0.5, DWOOD, 0, 0.51, 0.08],
  [1.2, 0.04, 0.6, RED, 0, 0.8, -0.55],
  [1.1, 0.76, 0.5, DWOOD, 0, 0.38, -0.55],
  [0.45, 0.6, 0.3, 0xc8a050, 0, 1.38, 0.12], // shrine niche
  [0.12, 0.14, 0.12, 0x8a6a40, 0, 1.15, -0.1],
  ...[-0.5, 0.5].map(x => [0.1, 0.18, 0.1, 0xe02a20, x, 1.18, 0.1] as Part),
  ...[-0.3, 0.3].map(x => [0.14, 0.08, 0.14, r() < 0.5 ? 0xe8a030 : 0xd04a2a, x, 1.12, -0.12] as Part),
];
const sofa = (c: number): Part[] => [
  [1.8, 0.4, 0.8, c, 0, 0.2, 0],
  [1.8, 0.45, 0.18, c, 0, 0.62, 0.31],
  [0.18, 0.25, 0.8, c, -0.81, 0.52, 0],
  [0.18, 0.25, 0.8, c, 0.81, 0.52, 0],
];
const rattan = (): Part[] => [
  [0.6, 0.08, 0.6, RATTAN, 0, 0.4, 0],
  [0.6, 0.5, 0.06, RATTAN, 0, 0.7, 0.27, 0, -0.15],
  [0.06, 0.25, 0.6, RATTAN, -0.28, 0.55, 0],
  [0.06, 0.25, 0.6, RATTAN, 0.28, 0.55, 0],
  [0.5, 0.36, 0.5, 0x9a7442, 0, 0.18, 0],
];
const wardrobe = (c: number, open: boolean): Part[] => [
  [1.0, 1.75, 0.55, c, 0, 0.875, 0], // plastic zip wardrobe
  [0.96, 0.04, 0.5, STEEL, 0, 1.76, 0],
  ...(open ? ([[0.5, 1.5, 0.02, c, -0.45, 0.85, -0.4, 0.9]] as Part[]) : []),
];
const chest = (open: number, r: () => number): Part[] => {
  const P: Part[] = [[0.9, 0.85, 0.48, WOOD, 0, 0.425, 0]];
  for (let i = 0; i < 3; i++) {
    const o = i < open ? 0.18 + r() * 0.15 : 0;
    P.push([0.82, 0.2, 0.44, i < open ? 0x8a6544 : DWOOD, 0, 0.17 + i * 0.25, -0.03 - o]);
  }
  return P;
};
const fridge = (open: boolean): Part[] => [
  [0.65, 1.7, 0.65, 0xd8dcd8, 0, 0.85, 0],
  open ? [0.62, 1.1, 0.05, 0xc8ccc8, -0.55, 0.95, -0.35, 1.2] : [0.03, 0.4, 0.03, 0x666666, 0.26, 1.15, -0.34],
];
const bunk = (): Part[] => [
  [0.95, 0.12, 1.95, STEEL, 0, 0.35, 0],
  [0.9, 0.12, 1.9, 0xb8c8d8, 0, 0.45, 0],
  [0.95, 0.12, 1.95, STEEL, 0, 1.45, 0],
  [0.9, 0.12, 1.9, 0xd8b8b8, 0, 1.55, 0],
  ...(
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const
  ).map(([a, b]) => [0.05, 1.9, 0.05, STEEL, a * 0.45, 0.95, b * 0.95] as Part),
];
const suitcase = (r: () => number): Part[] => {
  const c = [0x2a4a7a, 0x7a2a3a, 0x333333][Math.floor(r() * 3)];
  return [
    [0.5, 0.12, 0.7, c, 0, 0.06, 0],
    [0.5, 0.7, 0.08, c, 0, 0.38, 0.38, 0, -0.35], // lid flung open
    [0.4, 0.06, 0.5, PLASTIC[Math.floor(r() * 4)], 0.02, 0.14, -0.02, 0.2],
  ];
};
const counter = (w: number): Part[] => [
  [w, 0.95, 0.6, 0xbab2a0, 0, 0.475, 0],
  [w + 0.04, 0.04, 0.64, 0x8a8a84, 0, 0.97, 0],
];
const scooterBike = (c: number): Part[] => [
  [0.18, 0.5, 0.5, 0x222222, 0, 0.25, -0.62], // wheels (front/rear, seen edge-on)
  [0.18, 0.5, 0.5, 0x222222, 0, 0.25, 0.62],
  [0.42, 0.42, 1.25, c, 0, 0.55, 0.05],
  [0.36, 0.1, 0.55, 0x1c1c1c, 0, 0.82, 0.25],
  [0.5, 0.6, 0.12, c, 0, 0.82, -0.5],
  [0.62, 0.04, 0.04, 0x111111, 0, 1.15, -0.55],
];
const tyres = (n: number): Part[] =>
  Array.from({ length: n }, (_, i) => [0.55, 0.16, 0.55, 0x1e1e1e, 0, 0.08 + i * 0.17, 0] as Part);
const bicycle = (): Part[] => [
  [0.04, 0.6, 0.6, 0x222222, 0, 0.3, -0.5],
  [0.04, 0.6, 0.6, 0x222222, 0, 0.3, 0.5],
  [0.04, 0.04, 1.0, 0x3a6a9a, 0, 0.6, 0, 0, 0.25],
  [0.04, 0.5, 0.04, 0x3a6a9a, 0, 0.6, 0.2],
  [0.2, 0.05, 0.25, 0x111111, 0, 0.86, 0.22],
  [0.5, 0.04, 0.04, 0x111111, 0, 0.95, -0.42],
];
const shoeRack = (r: () => number): Part[] => {
  const P: Part[] = [[0.9, 0.7, 0.32, 0x9a9a92, 0, 0.35, 0]];
  for (let i = 0; i < 5; i++) P.push([0.12, 0.08, 0.26, PLASTIC[Math.floor(r() * 4)], -0.35 + i * 0.17, 0.75, 0]);
  for (let i = 0; i < 3; i++)
    if (r() < 0.7) P.push([0.12, 0.08, 0.26, 0x2a2a2a, -0.5 + r(), 0.04, -0.35 - r() * 0.3, r() * 3]); // kicked-off shoes
  return P;
};
const mailboxes = (): Part[] => {
  const P: Part[] = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 3; j++)
      P.push([0.26, 0.2, 0.18, i % 2 ? 0x8a9aa0 : 0x7a8a90, -0.42 + i * 0.28, 1.0 + j * 0.22, 0.05]);
  return P;
};
const laundry = (r: () => number): Part[] => {
  const P: Part[] = [
    [0.03, 1.5, 0.03, STEEL, -0.7, 0.75, 0],
    [0.03, 1.5, 0.03, STEEL, 0.7, 0.75, 0],
    [1.4, 0.03, 0.03, STEEL, 0, 1.5, 0],
  ];
  for (let i = 0; i < 4; i++) P.push([0.28, 0.5, 0.02, PLASTIC[Math.floor(r() * 4)], -0.5 + i * 0.33, 1.2, 0]);
  P.push([0.35, 0.3, 0.35, 0x7a4a30, 0.9, 0.15, 0.1], [0.25, 0.4, 0.25, 0x3a7a3a, 0.9, 0.5, 0.1]); // potted plant
  return P;
};
// ---------- v23.6 public-building pieces ----------
const studentDesk = (r: () => number, over: boolean): Part[] => [
  // desk facing the board (+z); its chair on the door side (-z), sometimes knocked over
  [0.6, 0.03, 0.42, 0xc8a878, 0, 0.72, 0],
  [0.56, 0.12, 0.36, 0x7a8a8c, 0, 0.64, 0.02],
  ...(
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const
  ).map(([a, c]) => [0.03, 0.7, 0.03, 0x8a9294, a * 0.27, 0.35, c * 0.18] as Part),
  ...(over
    ? ([
        [0.38, 0.03, 0.36, 0x6a8ab0, 0, 0.2, -0.5, 0, Math.PI / 2],
        [0.38, 0.4, 0.03, 0x6a8ab0, 0, 0.02, -0.32, 0, Math.PI / 2],
      ] as Part[])
    : ([
        [0.38, 0.03, 0.36, 0x6a8ab0, 0, 0.42, -0.45],
        [0.38, 0.4, 0.03, 0x6a8ab0, 0, 0.64, -0.62],
        [0.03, 0.42, 0.03, 0x8a9294, -0.17, 0.21, -0.3],
        [0.03, 0.42, 0.03, 0x8a9294, 0.17, 0.21, -0.3],
      ] as Part[])),
  ...(r() < 0.35 ? ([[0.22, 0.04, 0.3, PLASTIC[Math.floor(r() * 4)], 0.1, 0.76, 0.02, r()]] as Part[]) : []), // book
];
const blackboard = (w: number): Part[] => [
  [w, 1.1, 0.04, 0x1f3a2c, 0, 1.45, 0.2],
  [w + 0.1, 0.06, 0.06, 0x8a6a40, 0, 0.88, 0.18], // chalk ledge
  [w * 0.4, 0.02, 0.02, 0xe8e8e0, -w * 0.15, 1.6, 0.17], // chalk writing
  [w * 0.25, 0.02, 0.02, 0xe8e8e0, w * 0.1, 1.4, 0.17],
];
const teacherDesk = (): Part[] => [...table(1.4, 0.7, 0x8a6a40), [1.36, 0.6, 0.04, 0x7a5a34, 0, 0.45, 0.33]];
const locker = (c: number): Part[] => [
  [0.9, 1.8, 0.45, c, 0, 0.9, 0],
  ...[-0.3, 0, 0.3].map(x => [0.01, 1.7, 0.01, 0x3a3a3a, x + 0.15, 0.9, -0.23] as Part),
  ...[-0.3, 0, 0.3].map(x => [0.04, 0.06, 0.01, 0xd0d0d0, x, 1.0, -0.23] as Part),
];
const hospitalBed = (r: () => number): Part[] => [
  [0.95, 0.08, 2.0, 0xd8dcdc, 0, 0.5, 0], // frame
  [0.9, 0.14, 1.9, 0xb8d0e0, 0, 0.6, 0], // mattress
  [0.6, 0.1, 0.35, 0xf0f0f0, 0, 0.71, 0.75], // pillow
  [0.95, 0.5, 0.05, 0xc8ccd0, 0, 0.75, 1.0], // headboard
  ...(r() < 0.6 ? ([[0.92, 0.04, 1.1, 0x9ab8a8, 0, 0.69, -0.35, r() * 0.3]] as Part[]) : []), // blanket
  ...(
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const
  ).map(([a, c]) => [0.04, 0.46, 0.04, 0xa0a4a8, a * 0.43, 0.23, c * 0.95] as Part),
  [0.03, 1.8, 0.03, 0xa0a4a8, -0.62, 0.9, 0.7], // IV stand
  [0.12, 0.18, 0.04, 0xd8eef0, -0.62, 1.65, 0.7],
  [1.9, 1.9, 0.02, 0xa8c8b8, 0.6, 0.95, 0, Math.PI / 2], // privacy curtain along the bed
];
const medCabinet = (): Part[] => [
  [0.9, 1.8, 0.42, 0xe8ecec, 0, 0.9, 0],
  [0.84, 0.9, 0.01, 0x9fc8d8, 0, 1.3, -0.21], // glass doors
  ...[0.55, 1.0, 1.45].map(y => [0.84, 0.02, 0.38, 0xd0d4d4, 0, y, 0] as Part),
  ...[0.6, 1.05, 1.5].map(
    (y, i) => [0.1, 0.12, 0.1, [0xe05a4a, 0x4a8ae0, 0xf0c040][i], -0.2 + i * 0.2, y + 0.07, 0] as Part,
  ),
];
const wheelchair = (): Part[] => [
  [0.5, 0.05, 0.45, 0x3a3a3a, 0, 0.48, 0],
  [0.5, 0.45, 0.04, 0x3a3a3a, 0, 0.72, 0.22],
  [0.04, 0.6, 0.6, 0x555555, -0.28, 0.3, 0.05],
  [0.04, 0.6, 0.6, 0x555555, 0.28, 0.3, 0.05],
];
const templeAltar = (w: number): Part[] => [
  [w, 0.95, 0.9, 0x8a1c14, 0, 0.475, 0.2], // carved red base
  [w + 0.1, 0.06, 0.95, 0xc8a040, 0, 0.98, 0.2], // gilded top
  [w * 0.8, 1.0, 0.5, 0x6a1410, 0, 1.5, 0.35], // shrine cabinet
  [w * 0.8 + 0.1, 0.12, 0.6, 0xd8b040, 0, 2.06, 0.35], // gilded crown
  ...[-0.33, 0, 0.33].map(
    (x, i) => [0.28, i === 1 ? 0.62 : 0.5, 0.2, [0x2a2a2a, 0xc89040, 0x3a2a20][i], x * w, 1.35, 0.2] as Part,
  ), // deities
  ...[-0.5, 0.5].map(x => [0.14, 0.22, 0.14, 0xe02a20, x * w, 1.12, -0.15] as Part), // red lamps
  [w * 0.6, 0.08, 0.3, 0xe8b040, 0, 1.05, -0.12], // offerings
];
const templeLamps = (w: number): Part[] => [-0.5, 0.5].map(x => [0.1, 0.12, 0.1, 0xff5a30, x * w, 1.26, -0.15]);
const incenseBurner = (): Part[] => [
  [0.75, 0.45, 0.6, 0x6a5a30, 0, 0.62, 0], // bronze body
  [0.85, 0.06, 0.7, 0x8a7a40, 0, 0.86, 0], // rim
  [0.12, 0.25, 0.12, 0x5a4a28, -0.28, 1.0, 0], // ears
  [0.12, 0.25, 0.12, 0x5a4a28, 0.28, 1.0, 0],
  ...(
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const
  ).map(([a, c]) => [0.08, 0.4, 0.08, 0x5a4a28, a * 0.3, 0.2, c * 0.22] as Part),
  [0.6, 0.04, 0.45, 0x9a9a90, 0, 0.88, 0], // ash
];
const incenseGlow = (): Part[] =>
  [-0.12, 0, 0.12].map((x, i) => [0.012, 0.3, 0.012, 0xff6a20, x, 1.05, (i - 1) * 0.06] as Part);
const cushion = (c: number): Part[] => [[0.5, 0.14, 0.45, c, 0, 0.07, 0]];
const pillar = (): Part[] => [
  [0.38, 3.6, 0.38, 0xa82a1e, 0, 1.8, 0],
  [0.5, 0.25, 0.5, 0x5a5a52, 0, 0.125, 0], // stone base
];
const lanternGlow = (): Part[] => [[0.32, 0.4, 0.32, 0xff3a20, 0, 2.5, 0]];
const donationBox = (): Part[] => [
  [0.5, 0.6, 0.4, 0xa82018, 0, 0.3, 0],
  [0.54, 0.05, 0.44, 0xd8b040, 0, 0.62, 0],
  [0.3, 0.02, 0.04, 0x1a1a1a, 0, 0.65, 0],
];
const STALL_GOODS = [
  [0x5a9a3a, 0xe8902a, 0xc8302a, 0x9ac040], // produce
  [0xd88a8a, 0xb84a4a, 0xf0d0c0], // meat / fish
  [0xc8b088, 0xa88a5a, 0xe8e0c8], // dry goods
];
const marketStall = (r: () => number): Part[] => {
  const g = STALL_GOODS[Math.floor(r() * STALL_GOODS.length)];
  const P: Part[] = [
    [1.6, 0.8, 0.8, 0x8a8a84, 0, 0.4, 0], // steel counter
    [1.65, 0.04, 0.85, 0xb0b4b4, 0, 0.82, 0],
  ];
  for (let i = 0; i < 6; i++)
    P.push([
      0.42,
      0.14 + r() * 0.12,
      0.32,
      g[Math.floor(r() * g.length)],
      -0.55 + (i % 3) * 0.55,
      0.92,
      -0.18 + Math.floor(i / 3) * 0.38,
    ]);
  if (r() < 0.6) P.push([0.25, 0.08, 0.25, 0xd8d8d8, 0.6, 0.88, 0.3]); // scale
  P.push([0.04, 1.4, 0.04, 0x6a6a6a, -0.78, 1.5, 0.38], [0.04, 1.4, 0.04, 0x6a6a6a, 0.78, 1.5, 0.38]); // lamp poles
  return P;
};
const crates = (r: () => number): Part[] => {
  const P: Part[] = [];
  for (let i = 0; i < 2 + Math.floor(r() * 3); i++)
    P.push([
      0.5,
      0.28,
      0.36,
      [0x3a6aa8, 0xc84a3a, 0x4a9a5a][Math.floor(r() * 3)],
      (r() - 0.5) * 0.2,
      0.14 + i * 0.28,
      (r() - 0.5) * 0.2,
    ]);
  return P;
};
const officeDesk = (r: () => number): Part[] => [
  ...table(1.2, 0.65, 0xb8b0a0),
  [0.42, 0.62, 0.55, 0x8a8a84, 0.36, 0.33, 0], // drawer pedestal
  [0.46, 0.3, 0.04, 0x1a1a1a, -0.2, 0.95, 0.15], // monitor
  [0.06, 0.18, 0.06, 0x2a2a2a, -0.2, 0.84, 0.18],
  [0.4, 0.02, 0.14, 0x2a2a2a, -0.2, 0.76, -0.12], // keyboard
  ...(r() < 0.5 ? ([[0.3, 0.06, 0.22, 0xf0f0e8, 0.25, 0.79, -0.05, r()]] as Part[]) : []), // papers
  ...chair(0x2a2a3a, r() < 0.2).map(p => {
    const q = [...p] as Part;
    q[6] -= 0.55;
    return q;
  }),
];
const filingCabinet = (): Part[] => [
  [0.5, 1.3, 0.6, 0x8a9094, 0, 0.65, 0],
  ...[0.25, 0.55, 0.85, 1.15].map(y => [0.2, 0.03, 0.01, 0xd0d0d0, 0, y, -0.3] as Part),
];
const cellBars = (w: number): Part[] => {
  const P: Part[] = [
    [w, 0.06, 0.06, 0x4a4e52, 0, 2.2, 0],
    [w, 0.06, 0.06, 0x4a4e52, 0, 0.05, 0],
  ];
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += 0.14) P.push([0.025, 2.2, 0.025, 0x4a4e52, x, 1.1, 0]);
  P.push([0.6, 0.4, 1.8, 0x7a7a72, 0, 0.2, 0.95]); // bench inside
  return P;
};
// ---------- plan ----------
type Ctx = { pip: (p: V2, pts: V2[]) => boolean; onRoad: (x: number, z: number) => boolean };
/** v23.3 streamed district buildings pass their own seed and per-tile container ids */
export type PlanOpt = {
  seed?: number;
  contId?: (n: number) => string;
  /** v23.4 areas (u0, v0, u1, v1 in the plan frame) kept free of furniture, e.g. the stair opening upstairs */
  reserve?: [number, number, number, number][];
  /** v23.4 skip the ground-floor stairwell (upstairs floors draw their own stair head) */
  noStair?: boolean;
};
const seedOf = (b: any, o?: PlanOpt) => o?.seed ?? (b.id + 1) * 2654435761;
function pickUse(b: any, street: boolean, r: () => number): Use {
  if (b.kind && SPECIAL.has(b.kind)) return b.kind;
  return b.type && b.type !== 'home'
    ? 'grocery'
    : street && r() < 0.55
      ? (['eatery', 'scooter', 'grocery'] as Use[])[Math.floor(r() * 3)]
      : 'home';
}
/** the ground-floor use plan() will pick, without planning the furniture (door frame colour at tile build) */
export function useOf(b: any, street: boolean, o?: PlanOpt): Use {
  return pickUse(b, street, mulberry(seedOf(b, o)));
}
export function plan(b: any, ctx: Ctx, opt?: PlanOpt): Plan | null {
  const door = b.door;
  if (!door) return null;
  const r = mulberry(seedOf(b, opt));
  const contId = opt?.contId ?? ((n: number) => `f${b.id}_${n}`);
  const O = door.p as V2;
  const ex = door.c[0] - door.a[0],
    ez = door.c[1] - door.a[1],
    el = Math.hypot(ex, ez) || 1;
  let U: V2 = [ex / el, ez / el];
  let N: V2 = [-U[1], U[0]];
  if (!ctx.pip([O[0] + N[0] * 0.6, O[1] + N[1] * 0.6], b.pts)) N = [-N[0], -N[1]];
  // right-handed local frame (x = U, y up, z = N) so merged geometry keeps its winding
  if (Math.abs(N[0] + U[1]) > 1e-6 || Math.abs(N[1] - U[0]) > 1e-6) U = [-U[0], -U[1]];
  let umin = 1e9,
    umax = -1e9,
    D = 0;
  for (const p of b.pts) {
    const du = (p[0] - O[0]) * U[0] + (p[1] - O[1]) * U[1],
      dv = (p[0] - O[0]) * N[0] + (p[1] - O[1]) * N[1];
    umin = Math.min(umin, du);
    umax = Math.max(umax, du);
    D = Math.max(D, dv);
  }
  if (umax - umin < 3 || D < 3) return null;
  const W = (u: number, v: number): V2 => [O[0] + U[0] * u + N[0] * v, O[1] + U[1] * u + N[1] * v];
  const inside = (u: number, v: number) => ctx.pip(W(u, v), b.pts);
  const area = (b.maxx - b.minx) * (b.maxz - b.minz);
  const street = ctx.onRoad(O[0] - N[0] * 3, O[1] - N[1] * 3);
  const use = pickUse(b, street, r);
  const P: Plan = { use, O, U, N, pieces: [], decals: [], segs: [], conts: [] };
  const rects: [number, number, number, number][] = [...(opt?.reserve ?? [])];
  /** place a piece at (u, v) facing `face` (0 = toward door, 1 = side, 2 = back, 3 = other side); tries nudges */
  const put = (
    parts: Part[],
    u: number,
    v: number,
    face: number,
    cw: number,
    cd: number,
    ch: number,
    extra?: Partial<Piece>,
  ) => {
    const ry = (face * Math.PI) / 2;
    const hw = (face % 2 ? cd : cw) / 2,
      hd = (face % 2 ? cw : cd) / 2;
    for (let t = 0; t < 5; t++) {
      const uu = u + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 0.35,
        vv = v;
      if (Math.hypot(uu, vv) < 1.5 + hd) continue; // keep the doorway clear
      const cs: V2[] = [
        [uu - hw, vv - hd],
        [uu + hw, vv - hd],
        [uu + hw, vv + hd],
        [uu - hw, vv + hd],
      ];
      if (!cs.every(([a, c]) => inside(a, c)) || !inside(uu, vv)) continue;
      if (rects.some(q => uu - hw < q[2] && uu + hw > q[0] && vv - hd < q[3] && vv + hd > q[1])) continue;
      rects.push([uu - hw, vv - hd, uu + hw, vv + hd]);
      const pc: Piece = { u: uu, v: vv, ry, parts, cw, cd, ch, ...extra };
      P.pieces.push(pc);
      if (ch > 0) {
        const wc = cs.map(([a, c]) => W(a, c));
        for (let i = 0; i < 4; i++) P.segs.push({ a: wc[i], b: wc[(i + 1) % 4], h: ch });
      }
      if (pc.cont)
        P.conts.push({
          id: contId(P.conts.length),
          p: W(uu, vv),
          label: pc.cont.label,
          loot: pc.cont.loot,
          seed: Math.floor(r() * 1e9),
        });
      return true;
    }
    return false;
  };
  const back = D - 0.45,
    uL = umin + 0.5,
    uR = umax - 0.5,
    mid = (umin + umax) / 2;
  // v23.4 multi-storey blocks: reserve the stairwell corner (back right, else back left) before furnishing, so the
  // stairs to the 2F fit (the furniture used to fill that corner first in almost every building)
  let stairUV: [number, number] | null = null;
  let stairRes: [number, number, number, number] | null = null;
  if (!opt?.noStair && b.h > 6 && D > 5 && umax - umin > 5) {
    const sv = back - 1.6;
    for (const su of [uR - 0.6, uL + 0.6]) {
      const fits = [
        [0, 0],
        [-0.55, -1.15],
        [0.55, -1.15],
        [-0.55, 1.15],
        [0.55, 1.15],
        [-0.55, -2.1],
        [0.55, -2.1],
      ].every(([du, dv]) => inside(su + du, sv + dv));
      const res: [number, number, number, number] = [su - 0.6, sv - 2.1, su + 0.6, sv + 1.2];
      const free = !rects.some(q => res[0] < q[2] && res[2] > q[0] && res[1] < q[3] && res[3] > q[1]);
      if (fits && free && Math.hypot(su, sv) > 2.7) {
        stairUV = [su, sv];
        stairRes = res;
        rects.push(res);
        break;
      }
    }
  }
  const scatter = (n: number, kinds: ('cloth' | 'glass' | 'paper')[]) => {
    for (let i = 0; i < n; i++) {
      const u = umin + 0.4 + r() * (umax - umin - 0.8),
        v = 0.6 + r() * (D - 1);
      if (!inside(u, v)) continue;
      const k = kinds[Math.floor(r() * kinds.length)];
      const c = k === 'cloth' ? PLASTIC[Math.floor(r() * 4)] : k === 'glass' ? 0xbfe0e8 : 0xe8e4d0;
      const s = k === 'cloth' ? 0.35 + r() * 0.3 : k === 'glass' ? 0.06 + r() * 0.08 : 0.2 + r() * 0.1;
      P.decals.push([s, 0.012, s * (0.5 + r() * 0.6), c, u, 0.012 + i * 0.0004, v, r() * 6]);
    }
  };
  // ---- v23.6 public buildings: their own fit-out, scaled to the floor (big halls get more of it) ----
  const special = SPECIAL.has(use);
  const W2 = umax - umin;
  const many = Math.max(8, Math.min(150, Math.floor((W2 * D) / 6)));
  /** rows of pieces across the floor from v0, spacing du × dv, up to cap; f returns whether it placed one */
  const rows = (
    du: number,
    dv: number,
    v0: number,
    v1: number,
    cap: number,
    f: (u: number, v: number, i: number) => boolean,
  ) => {
    let n = 0;
    for (let v = v0; v < v1 && n < cap; v += dv)
      for (let u = umin + 0.9; u < umax - 0.7 && n < cap; u += du) if (f(u, v, n)) n++;
    return n;
  };
  if (use === 'school') {
    // classroom: board and teacher's desk on the back wall, desks in rows facing it, lockers by the door
    put(blackboard(Math.min(4, W2 - 1.2)), mid, back - 0.05, 0, Math.min(4, W2 - 1.2), 0.15, 0);
    put(teacherDesk(), mid, back - 1.2, 0, 1.4, 0.7, 0.8, { cont: { label: '講桌抽屜', loot: 'home' } });
    put(medCabinet(), uR - 0.3, back - 0.3, 0, 0.9, 0.45, 1.8, { cont: { label: '保健室藥櫃', loot: 'medshelf' } });
    rows(1.3, 1.4, 2.4, back - 2.1, many, (u, v, i) =>
      put(
        studentDesk(r, r() < 0.15),
        u + (r() - 0.5) * 0.12,
        v,
        0,
        0.62,
        1.05,
        0.75,
        i % 7 === 3 ? { cont: { label: '書包', loot: 'grocery' } } : {},
      ),
    );
    for (let u = uL + 0.5, i = 0; u < uR - 0.4; u += 0.95, i++)
      if (Math.abs(u) > 1.9)
        put(locker(0x6a7a8a), u, 0.3, 2, 0.9, 0.45, 1.8, i % 2 ? {} : { cont: { label: '置物櫃', loot: 'wardrobe' } });
    scatter(Math.min(30, Math.floor((W2 * D) / 10)), ['paper', 'paper', 'cloth']);
  } else if (use === 'clinic') {
    // ward: nurses' station by the door, medicine cabinets on the back wall, beds with curtains in rows
    put(counter(2.2), uL + 1.6, 1.9, 0, 2.2, 0.6, 1.0, { cont: { label: '護理站', loot: 'pharmacy' } });
    for (let u = uL + 0.6, i = 0; u < uR - 0.4 && i < 6; u += 1.0, i++)
      put(medCabinet(), u, back - 0.3, 0, 0.9, 0.45, 1.8, i < 3 ? { cont: { label: '藥品櫃', loot: 'medshelf' } } : {});
    rows(1.9, 2.8, 3.2, back - 1.6, many, (u, v) => put(hospitalBed(r), u, v, 0, 1.3, 2.1, 0.6));
    for (let i = 0; i < 2 + Math.floor(r() * 3); i++)
      put(wheelchair(), umin + 1 + r() * (W2 - 2), 2.2 + r() * (D - 3), Math.floor(r() * 4), 0.6, 0.6, 0.8);
    scatter(Math.min(24, Math.floor((W2 * D) / 12)), ['paper', 'glass', 'cloth']);
  } else if (use === 'temple') {
    // main hall: deity altar on the back wall, offering table, bronze incense burner, red pillars, kneelers
    const aw = Math.min(3.6, W2 - 1.4);
    put(templeAltar(aw), mid, back - 0.55, 0, aw, 1.1, 1.3, {
      glow: templeLamps(aw),
      cont: { label: '供桌', loot: 'altar' },
    });
    put(
      [...table(Math.min(2.4, aw), 0.8, 0x8a1c14, 0.85), [Math.min(2, aw - 0.3), 0.12, 0.3, 0xe8b040, 0, 0.92, 0]],
      mid,
      back - 1.9,
      0,
      Math.min(2.4, aw),
      0.8,
      0.9,
      {
        cont: { label: '供桌', loot: 'altar' },
      },
    );
    put(incenseBurner(), mid, Math.min(back - 3.4, Math.max(2.8, D * 0.45)), 0, 0.9, 0.8, 1.1, { glow: incenseGlow() });
    put(donationBox(), mid + 1.5, 2.3, 0, 0.5, 0.4, 0.7, { cont: { label: '功德箱', loot: 'altar' } });
    for (const fu of [-0.3, 0.3])
      for (const fv of [0.32, 0.68]) put(pillar(), mid + fu * W2, D * fv, 0, 0.4, 0.4, 3.6, { glow: lanternGlow() });
    rows(0.75, 0.9, back - 3.0 > 3 ? 3.0 : 2.4, back - 2.6, Math.min(40, many), (u, v) =>
      Math.abs(u - mid) < aw / 2 + 0.3 ? put(cushion(r() < 0.5 ? 0xc83a2a : 0xd8a830), u, v, 0, 0.5, 0.45, 0) : false,
    );
    scatter(Math.min(16, Math.floor((W2 * D) / 14)), ['paper']);
  } else if (use === 'market') {
    // traditional market: rows of steel stalls with produce / meat / dry goods, crates along the walls
    const loots = ['stall', 'grocery', 'breakfast', 'kitchen'];
    rows(2.3, 2.7, 2.3, back - 0.6, many, (u, v, i) =>
      put(
        marketStall(r),
        u,
        v,
        Math.floor(r() * 2) * 2,
        1.65,
        0.85,
        1.0,
        r() < 0.5 ? { cont: { label: '攤位', loot: loots[i % 4] } } : {},
      ),
    );
    for (let i = 0; i < 4 + Math.floor(W2 / 3); i++)
      put(crates(r), umin + 0.6 + r() * (W2 - 1.2), back - 0.4 - r() * 1.5, 0, 0.55, 0.45, 1.0);
    scatter(Math.min(30, Math.floor((W2 * D) / 8)), ['paper', 'cloth', 'glass']);
  } else if (use === 'police') {
    // station: front counter, desks with monitors, a holding cell and lockers at the back
    put(counter(2.4), mid, 2.2, 0, 2.4, 0.6, 1.0);
    if (W2 > 6) put(cellBars(2.2), uL + 1.4, back - 1.0, 0, 2.3, 2.0, 2.2);
    for (let u = uR - 0.5, i = 0; u > mid && i < 4; u -= 0.95, i++)
      put(
        locker(0x4a5a6a),
        u,
        back - 0.25,
        0,
        0.9,
        0.45,
        1.8,
        i < 2 ? { cont: { label: '警用置物櫃', loot: 'police' } } : {},
      );
    rows(1.9, 2.1, 3.6, back - 2.2, Math.min(24, many), (u, v, i) =>
      put(officeDesk(r), u, v, 2, 1.25, 1.3, 0.8, i % 3 === 1 ? { cont: { label: '辦公桌抽屜', loot: 'home' } } : {}),
    );
    put(filingCabinet(), uL + 0.3, D * 0.5, 1, 0.5, 0.6, 1.3, { cont: { label: '檔案櫃', loot: 'home' } });
    scatter(Math.min(24, Math.floor((W2 * D) / 10)), ['paper', 'paper', 'glass']);
  } else if (use === 'office') {
    // offices / bank / post office / library: counter by the door, desks in rows, filing cabinets on the walls
    put(counter(2.4), mid, 2.0, 0, 2.4, 0.6, 1.0);
    rows(1.9, 2.1, 3.4, back - 0.9, many, (u, v, i) =>
      put(officeDesk(r), u, v, 2, 1.25, 1.3, 0.8, i % 4 === 2 ? { cont: { label: '辦公桌抽屜', loot: 'store' } } : {}),
    );
    for (let i = 0; i < 2 + Math.floor(W2 / 4); i++)
      put(
        filingCabinet(),
        umin + 0.6 + r() * (W2 - 1.2),
        back - 0.3,
        0,
        0.5,
        0.6,
        1.3,
        i < 2 ? { cont: { label: '檔案櫃', loot: 'home' } } : {},
      );
    scatter(Math.min(30, Math.floor((W2 * D) / 8)), ['paper', 'paper', 'paper', 'glass']);
  }
  // ---- ground-floor use ----
  if (special) {
    // furnished above
  } else if (use === 'home') {
    put(altar(r), mid, back - 0.3, 0, 1.6, 1.2, 1.1, {});
    const sc = [0x5a4a3a, 0x7a6a50, 0x3a4a5a][Math.floor(r() * 3)];
    put(sofa(sc), uL + 1.0, D * 0.45, 1, 1.8, 0.8, 0.8);
    put(rattan(), uL + 0.5, D * 0.25, 1, 0.6, 0.6, 0.8);
    put(rattan(), uL + 0.5, D * 0.65, 1, 0.6, 0.6, 0.8);
    const tb = table(1.1, 0.75, WOOD);
    const tparts = [...tb, ...dishes(0, 0.77, 0, r), ...(r() < 0.8 ? cooker(0.35, 0.77, 0.15) : [])];
    put(tparts, uR - 1.2, D * 0.5, 0, 1.1, 0.75, 0.8);
    put(chair(PLASTIC[0], r() < 0.6), uR - 1.2, D * 0.5 - 0.75, 0, 0.45, 0.45, 0);
    put(chair(PLASTIC[1], r() < 0.4), uR - 0.4, D * 0.5, 3, 0.45, 0.45, 0);
    put(fridge(r() < 0.4), uR - 0.1, back - 0.4, 0, 0.65, 0.65, 1.7, { cont: { label: '冰箱', loot: 'fridge' } });
    put(wardrobe(PLASTIC[Math.floor(r() * 4)], r() < 0.5), uL + 0.2, back - 0.3, 0, 1.0, 0.55, 1.75, {
      cont: { label: '塑膠衣櫥', loot: 'home' },
    });
    put(chest(Math.floor(r() * 4), r), mid + 1.4, back - 0.25, 0, 0.9, 0.48, 0.85, {
      cont: { label: '抽屜櫃', loot: 'home' },
    });
    if (D * (umax - umin) > 45) put(bunk(), uR - 0.6, D * 0.25 + 1, 1, 0.95, 1.95, 1.6);
    if (r() < 0.75) put(suitcase(r), mid - 0.6, D * 0.4, Math.floor(r() * 4), 0.6, 0.8, 0);
    put(laundry(r), mid, 1.9, 0, 1.6, 0.4, 0); // balcony / front-room clutter by the door
    scatter(6 + Math.floor(r() * 6), ['cloth', 'cloth', 'paper']);
  } else if (use === 'eatery') {
    put(counter(2.2), uL + 1.4, 1.9, 0, 2.2, 0.6, 1.0);
    put([...table(0.6, 0.6, STEEL, 0.9), [0.5, 0.25, 0.4, 0x777777, 0, 1.05, 0]], uL + 1.2, 2.8, 0, 0.6, 0.6, 1.0); // gas burner stand
    for (let i = 0; i < 4; i++) {
      const u = mid - 1.2 + (i % 2) * 2.2,
        v = 2.4 + Math.floor(i / 2) * 1.8;
      const over = r() < 0.4;
      put([...table(0.8, 0.8, 0xc0b8a0, 0.7), ...(over ? [] : dishes(0, 0.72, 0, r))], u, v, 0, 0.8, 0.8, 0.75);
      put(stool(PLASTIC[Math.floor(r() * 4)]), u + 0.6, v, 0, 0.35, 0.35, 0);
      put(over ? chair(PLASTIC[2], true) : stool(PLASTIC[Math.floor(r() * 4)]), u - 0.6, v + 0.2, 0, 0.42, 0.42, 0);
    }
    put(fridge(r() < 0.5), uR - 0.2, back - 0.4, 0, 0.65, 0.65, 1.7, { cont: { label: '冷藏櫃', loot: 'fridge' } });
    put(shelf(1.2, STEEL, r), uL + 0.2, back - 0.3, 0, 1.2, 0.45, 1.8, { cont: { label: '調味料架', loot: 'store' } });
    scatter(5, ['paper', 'glass']);
  } else if (use === 'scooter') {
    put(scooterBike(PLASTIC[Math.floor(r() * 4)]), mid - 0.8, 2.4, 1, 0.5, 1.6, 0.9);
    if (r() < 0.7) put(scooterBike(0x9a9a9a), mid + 0.9, 2.6, 1, 0.5, 1.6, 0.9);
    put(
      [...table(1.6, 0.6, DWOOD, 0.85), [0.4, 0.2, 0.3, 0xb03020, -0.4, 0.97, 0], [0.3, 0.1, 0.2, STEEL, 0.4, 0.9, 0]],
      uR - 0.9,
      back - 0.3,
      0,
      1.6,
      0.6,
      0.9,
      {
        cont: { label: '工具台', loot: 'store' },
      },
    );
    put(tyres(3 + Math.floor(r() * 3)), uL + 0.4, back - 0.4, 0, 0.55, 0.55, 0.9);
    put(tyres(2), uL + 0.4, back - 1.1, 0, 0.55, 0.55, 0.5);
    put(shelf(1.4, 0x6a6a64, r), uL + 0.2, D * 0.5, 1, 1.4, 0.45, 1.8, { cont: { label: '零件架', loot: 'store' } });
    scatter(6, ['paper', 'glass']);
    for (let i = 0; i < 4; i++)
      P.decals.push([
        0.5 + r() * 0.5,
        0.01,
        0.4 + r() * 0.4,
        0x23201c,
        mid + (r() - 0.5) * 3,
        0.011,
        1.5 + r() * 2,
        r() * 3,
      ]); // oil stains
  } else {
    const n = Math.max(2, Math.floor((umax - umin - 1) / 1.6));
    for (let i = 0; i < n; i++)
      put(
        shelf(1.3, 0xb8b8b0, r),
        umin + 1 + i * 1.6,
        D * 0.55,
        0,
        1.3,
        0.45,
        1.8,
        i % 2 ? {} : { cont: { label: '貨架', loot: 'store' } },
      );
    put(counter(1.6), uR - 1.0, 1.9, 0, 1.6, 0.6, 1.0);
    put(fridge(r() < 0.5), uL + 0.2, back - 0.4, 0, 0.65, 0.65, 1.7, { cont: { label: '冷藏櫃', loot: 'fridge' } });
    put(boxes(r, 3), uR - 0.3, back - 0.3, 0, 0.6, 0.6, 1.2);
    scatter(8, ['paper', 'glass', 'paper']);
  }
  // fill the rest of large floors cell by cell (deep blocks are several rooms / units on the ground floor)
  let cap = special ? 0 : 46;
  for (let v = 2.2; v < D - 0.8 && cap > 0; v += 2.6)
    for (let u = umin + 1.1; u < umax - 0.8 && cap > 0; u += 2.6) {
      if (r() < 0.28) continue;
      const uu = u + (r() - 0.5) * 0.6,
        vv = v + (r() - 0.5) * 0.6,
        f = Math.floor(r() * 4),
        k = r();
      let ok: boolean;
      if (use === 'home') {
        if (k < 0.16)
          ok = put(
            [...table(1.0, 0.7, WOOD), ...dishes(0, 0.77, 0, r), ...(r() < 0.3 ? cooker(0.3, 0.77, 0.1) : [])],
            uu,
            vv,
            f,
            1.0,
            0.7,
            0.8,
          );
        else if (k < 0.3)
          ok = put(chair(PLASTIC[Math.floor(r() * 4)], r() < 0.55), uu, vv, Math.floor(r() * 4), 0.45, 0.45, 0);
        else if (k < 0.4) ok = put(sofa([0x5a4a3a, 0x6a5a48, 0x3a4a5a][Math.floor(r() * 3)]), uu, vv, f, 1.8, 0.8, 0.8);
        else if (k < 0.5) ok = put(rattan(), uu, vv, f, 0.6, 0.6, 0.8);
        else if (k < 0.6)
          ok = put(wardrobe(PLASTIC[Math.floor(r() * 4)], r() < 0.6), uu, vv, f, 1.0, 0.55, 1.75, {
            cont: { label: '塑膠衣櫥', loot: 'home' },
          });
        else if (k < 0.7)
          ok = put(chest(Math.floor(r() * 4), r), uu, vv, f, 0.9, 0.48, 0.85, {
            cont: { label: '抽屜櫃', loot: 'home' },
          });
        else if (k < 0.78) ok = put(bunk(), uu, vv, f, 0.95, 1.95, 1.6);
        else if (k < 0.86) ok = put(suitcase(r), uu, vv, f, 0.6, 0.8, 0);
        else if (k < 0.93) ok = put(boxes(r, 1 + Math.floor(r() * 3)), uu, vv, 0, 0.6, 0.6, 0.9);
        else ok = put(laundry(r), uu, vv, f, 1.6, 0.4, 0);
      } else if (k < 0.4)
        ok = put(
          shelf(1.2, 0xb8b8b0, r),
          uu,
          vv,
          f,
          1.2,
          0.45,
          1.8,
          r() < 0.4 ? { cont: { label: '貨架', loot: 'store' } } : {},
        );
      else if (k < 0.65)
        ok = put([...table(0.8, 0.8, 0xc0b8a0, 0.7), ...dishes(0, 0.72, 0, r)], uu, vv, 0, 0.8, 0.8, 0.75);
      else if (k < 0.8)
        ok = put(r() < 0.5 ? chair(PLASTIC[2], true) : stool(PLASTIC[Math.floor(r() * 4)]), uu, vv, f, 0.42, 0.42, 0);
      else if (k < 0.9) ok = put(boxes(r, 2 + Math.floor(r() * 2)), uu, vv, 0, 0.6, 0.6, 1.2);
      else ok = put(use === 'scooter' ? tyres(2 + Math.floor(r() * 4)) : boxes(r, 1), uu, vv, 0, 0.6, 0.6, 0.9);
      if (ok) cap--;
    }
  scatter(
    Math.min(30, Math.floor(((umax - umin) * D) / 12)),
    use === 'home' ? ['cloth', 'cloth', 'paper', 'glass'] : ['paper', 'glass'],
  );
  // rolling shutter, half pulled down over the doorway (corrugated: 6 thin slats), shop uses only
  if (use === 'eatery' || use === 'scooter' || use === 'grocery' || use === 'market') {
    const dw = el * 0.95;
    for (let i = 0; i < 6; i++) P.decals.push([dw, 0.09, 0.03, 0x9aa0a0 - (i % 2) * 0x080808, 0, 2.35 - i * 0.1, 0.06]);
  }
  // ---- stairwell (multi-storey blocks), in the corner reserved above; its landing stays clear ----
  if (stairUV && stairRes) {
    const [su, sv] = stairUV;
    rects.splice(rects.indexOf(stairRes), 1);
    const st: Part[] = [];
    for (let i = 0; i < 8; i++) st.push([1.0, 0.18 * (i + 1), 0.28, 0x9a968c, 0, 0.09 * (i + 1), -1.0 + i * 0.28]);
    st.push([0.04, 1.0, 2.3, STEEL, -0.52, 1.1, 0]);
    if (put(st, su, sv, 0, 1.1, 2.3, 1.2)) {
      const pc = P.pieces[P.pieces.length - 1]; // put() may have nudged it sideways
      P.stair = { u: pc.u, v: pc.v };
    }
    rects.push([su - 0.6, sv - 2.1, su + 0.6, sv - 1.15]);
    const side = su > mid ? -1 : 1; // toward the room
    put(shoeRack(r), su + side * 1.3, sv + 0.8, 0, 0.9, 0.32, 0.7);
    put(mailboxes(), su + side * 1.3, sv + 1.25, 0, 1.2, 0.15, 0);
    put(bicycle(), su + side * 1.4, sv - 0.6, 1, 0.3, 1.5, 0.8);
  }
  // ---- signs of a hurried flight: candles, bullet holes, flyers on the walls ----
  for (let i = 0; i < 2 + Math.floor(r() * 3); i++) {
    const u = umin + 0.6 + r() * (umax - umin - 1.2),
      v = 1 + r() * (D - 1.5);
    if (!inside(u, v)) continue;
    P.pieces.push({
      u,
      v,
      ry: 0,
      parts: [
        [0.05, 0.12, 0.05, 0xeee8d0, 0, 0.06, 0],
        [0.1, 0.01, 0.1, 0xd8c8a0, 0, 0.005, 0],
      ],
      glow: [[0.025, 0.04, 0.025, 0xffb040, 0, 0.14, 0]],
      cw: 0,
      cd: 0,
      ch: 0,
    });
  }
  const pts = b.pts as V2[];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      c = pts[(i + 1) % pts.length];
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (L < 1.5) continue;
    const holes = r() < 0.45 ? 1 + Math.floor(r() * 4) : 0,
      fly = r() < 0.4 ? 1 + Math.floor(r() * 3) : 0;
    for (let k = 0; k < holes + fly; k++) {
      const t = 0.15 + r() * 0.7;
      let wx = a[0] + (c[0] - a[0]) * t,
        wz = a[1] + (c[1] - a[1]) * t;
      // inward normal
      let nx = -(c[1] - a[1]) / L,
        nz = (c[0] - a[0]) / L;
      if (!ctx.pip([wx + nx * 0.3, wz + nz * 0.3], pts)) ((nx = -nx), (nz = -nz));
      wx += nx * 0.03;
      wz += nz * 0.03;
      const lu = (wx - O[0]) * U[0] + (wz - O[1]) * U[1],
        lv = (wx - O[0]) * N[0] + (wz - O[1]) * N[1];
      if (Math.hypot(lu, lv) < 1.2) continue;
      // decal: thin box whose thin axis is the wall normal (rotation from local U to wall)
      const ry = Math.atan2(nx * U[0] + nz * U[1], nx * N[0] + nz * N[1]);
      if (k < holes) P.decals.push([0.07, 0.07, 0.01, 0x1a1816, lu, 0.9 + r() * 1.0, lv, ry]);
      else
        P.decals.push([
          0.21,
          0.3,
          0.01,
          [0xe8e0c8, 0xf0d050, 0xe8a0a0, 0xc8e0f0][Math.floor(r() * 4)],
          lu,
          1.1 + r() * 0.6,
          lv,
          ry,
        ]);
    }
  }
  clutterStats.planned++;
  clutterStats.pieces += P.pieces.length;
  clutterStats.conts += P.conts.length;
  clutterStats.segs += P.segs.length;
  return P;
}
// ---------- build (lazy) ----------
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const _m = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _c = new THREE.Color();
function partGeo(p: Part, pieceM: THREE.Matrix4 | null) {
  const [w, h, d, c, x, y, z, ry = 0, rx = 0, rz = 0] = p;
  const g = new THREE.BoxGeometry(w, h, d);
  g.deleteAttribute('uv');
  _e.set(rx, ry, rz, 'YXZ');
  _m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e), new THREE.Vector3(1, 1, 1));
  if (pieceM) _m.premultiply(pieceM);
  g.applyMatrix4(_m);
  _c.setHex(c);
  const n = g.getAttribute('position').count,
    col = new Float32Array(n * 3);
  // cheap baked AO: darker toward the floor
  const pos = g.getAttribute('position');
  for (let i = 0; i < n; i++) {
    const k = 0.72 + 0.28 * Math.min(1, pos.getY(i) / 1.2);
    col[i * 3] = _c.r * k;
    col[i * 3 + 1] = _c.g * k;
    col[i * 3 + 2] = _c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export function build(P: Plan): THREE.Group {
  const G = new THREE.Group();
  // frame: local x = U, z = N, origin O
  G.matrixAutoUpdate = false;
  G.matrix.set(P.U[0], 0, P.N[0], P.O[0], 0, 1, 0, 0, P.U[1], 0, P.N[1], P.O[1], 0, 0, 0, 1);
  const geos: THREE.BufferGeometry[] = [],
    glow: THREE.BufferGeometry[] = [];
  const pm = new THREE.Matrix4();
  for (const pc of P.pieces) {
    pm.makeRotationY(pc.ry).setPosition(pc.u, 0, pc.v);
    for (const p of pc.parts) geos.push(partGeo(p, pm));
    if (pc.glow) for (const p of pc.glow) glow.push(partGeo(p, pm));
  }
  for (const p of P.decals) geos.push(partGeo(p, null));
  if (geos.length) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.receiveShadow = true;
    G.add(m);
  }
  if (glow.length) G.add(new THREE.Mesh(mergeGeometries(glow), glowMat));
  geos.forEach(g => g.dispose());
  glow.forEach(g => g.dispose());
  clutterStats.built++;
  return G;
}
export function dispose(G: THREE.Group) {
  G.traverse(o => (o as THREE.Mesh).geometry?.dispose());
  G.parent?.remove(G);
}
