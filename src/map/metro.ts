// v21.6 / v22.1 北都地下鐵 BEIDU METRO — a fictional metro (own identity: 橘 #e8681c + 深綠 #1f5a3a, 艋舺橘線,
// own station numbers and pictograms). Layout/feel follows a typical underground island-platform station:
// multi-exit street entrances (canopy, stairs, stopped escalator, lift), a B1 concourse split into unpaid and
// paid areas by the gate line + glass fence, and a B2 island platform with full-height screen doors.
// War state: power is out (emergency lights only, flickering), escalators stopped, refugees sleeping on
// cardboard in the concourse, dropped bags, scooters dumped at the entrances.
// The interiors are built lazily the first time someone goes down (streamed) far off the map (METRO_Z); geometry is merged
// per material, and every random choice comes from a per-station seed, so all players see the same station.
// B1 and B2 are laid out side by side on one plane (B1 north, B2 south) joined by the stair/escalator banks;
// camera-side walls are cut down low so the interior reads from the fixed camera.
import * as THREE from 'three';
import { translateLabel } from '../labels';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { V2, Seg } from '../core/world';

export const METRO_ORANGE = 0xe8681c,
  METRO_GREEN = 0x1f5a3a;
export type Gate = { ent: V2; out: V2; inn: V2; exit: V2; no: number };
export type Station = {
  name: string;
  no: number;
  ent: V2;
  out: V2;
  inn: V2;
  exit: V2;
  gates: Gate[];
  loot: { id: string; p: V2; type: string }[];
  shops: Shop[];
  built: boolean;
};
/** e: the two street exits, where they were worked out beforehand (stations outside the core: its buildings are not
 * loaded when the stations are made, so a clear stretch of pavement was found offline, from the tile data) */
export const STATIONS: { name: string; x: number; z: number; e?: V2[] }[] = [
  { name: '龍山寺', x: -300, z: 420 },
  { name: '西門', x: 420, z: -180 },
  { name: '萬大', x: -260, z: 1500 },
  { name: '華江', x: -1250, z: 760 },
  // v24.33 中正區 and 大同區. The places are real; the network, its line and its numbers are ours.
  {
    name: '小南門',
    x: 787,
    z: 564,
    e: [
      [784.1, 566.7],
      [824.1, 587.5],
    ],
  },
  {
    name: '中正紀念堂',
    x: 1467,
    z: 807,
    e: [
      [1446.7, 744.2],
      [1499.2, 895],
    ],
  },
  {
    name: '古亭',
    x: 1989,
    z: 1579,
    e: [
      [1999.2, 1566.6],
      [1995.6, 1621.5],
    ],
  },
  {
    name: '公館',
    x: 3153,
    z: 2883,
    e: [
      [3145.6, 2860.2],
      [3189.8, 2903.7],
    ],
  },
  {
    name: '善導寺',
    x: 2060,
    z: -416,
    e: [
      [2054.5, -392.6],
      [2094, -390],
    ],
  },
  {
    name: '台北車站',
    x: 1460,
    z: -580,
    e: [
      [1448.3, -554.5],
      [1457.1, -520.2],
    ],
  },
  {
    name: '北門',
    x: 739,
    z: -928,
    e: [
      [672.3, -1005.2],
      [863.2, -883.7],
    ],
  },
  {
    name: '大橋頭',
    x: 978,
    z: -2454,
    e: [
      [981.3, -2451.7],
      [1009.5, -2449.9],
    ],
  },
  {
    name: '民權西路',
    x: 1654,
    z: -2415,
    e: [
      [1656.7, -2399.2],
      [1684.9, -2398.5],
    ],
  },
  {
    name: '雙連',
    x: 1785,
    z: -1839,
    e: [
      [1785.7, -1835.1],
      [1816.1, -1838.8],
    ],
  },
  {
    name: '圓山',
    x: 1728,
    z: -3362,
    e: [
      [1723.3, -3403.7],
      [1714.1, -3338.8],
    ],
  },
  // v24.34 大安區 and 中山區 (and four of the exits above, moved to pavement that the map now has)
  {
    name: '東門',
    x: 2648,
    z: 791,
    e: [
      [2630.7, 865],
      [2609, 917.3],
    ],
  },
  {
    name: '大安森林公園',
    x: 3256,
    z: 822,
    e: [
      [3259.3, 824.3],
      [3287.4, 845],
    ],
  },
  {
    name: '大安',
    x: 4090,
    z: 848,
    e: [
      [4078.2, 858.8],
      [4112.7, 878],
    ],
  },
  {
    name: '忠孝新生',
    x: 3009,
    z: -143,
    e: [
      [3026.8, -164.6],
      [3073.5, -154.1],
    ],
  },
  {
    name: '忠孝復興',
    x: 4112,
    z: -60,
    e: [
      [4098.7, -47.8],
      [4127.2, -27.3],
    ],
  },
  {
    name: '忠孝敦化',
    x: 4688,
    z: -56,
    e: [
      [4641.7, -28.2],
      [4695.6, -111.8],
    ],
  },
  {
    name: '信義安和',
    x: 5016,
    z: 870,
    e: [
      [5019.6, 879.3],
      [5048.2, 880.1],
    ],
  },
  {
    name: '科技大樓',
    x: 4081,
    z: 1647,
    e: [
      [4065.5, 1642.9],
      [4097.9, 1683.3],
    ],
  },
  {
    name: '六張犁',
    x: 5055,
    z: 1899,
    e: [
      [5054.2, 1925],
      [5091, 1936.8],
    ],
  },
  {
    name: '台電大樓',
    x: 2542,
    z: 2247,
    e: [
      [2533.7, 2265.2],
      [2587.4, 2259.1],
    ],
  },
  {
    name: '中山',
    x: 1754,
    z: -1285,
    e: [
      [1773.5, -1295.2],
      [1855.7, -1212.7],
    ],
  },
  {
    name: '松江南京',
    x: 3029,
    z: -1217,
    e: [
      [3011.3, -1200.8],
      [3010.2, -1172.2],
    ],
  },
  {
    name: '行天宮',
    x: 3042,
    z: -2035,
    e: [
      [3042, -2035],
      [3058.9, -1998.7],
    ],
  },
  {
    name: '中山國小',
    x: 2380,
    z: -2396,
    e: [
      [2378.2, -2411.9],
      [2411.4, -2373],
    ],
  },
  {
    name: '南京復興',
    x: 4132,
    z: -1198,
    e: [
      [4124.3, -1200],
      [4124.4, -1166.1],
    ],
  },
  {
    name: '中山國中',
    x: 4155,
    z: -2176,
    e: [
      [4139.6, -2166.7],
      [4140, -2132.6],
    ],
  },
  {
    name: '大直',
    x: 4482,
    z: -4296,
    e: [
      [4489.4, -4292.9],
      [4461.9, -4284.3],
    ],
  },
  {
    name: '劍南路',
    x: 5310,
    z: -4847,
    e: [
      [5311.6, -4864.9],
      [5346.2, -4817.6],
    ],
  },
  // v24.35 松山區 and 信義區
  {
    name: '台北小巨蛋',
    x: 4891,
    z: -1181,
    e: [
      [4889.4, -1194.9],
      [4925.7, -1163],
    ],
  },
  {
    name: '南京三民',
    x: 6183,
    z: -1153,
    e: [
      [6186.1, -1135.3],
      [6215.8, -1130.8],
    ],
  },
  {
    name: '松山',
    x: 7511,
    z: -1003,
    e: [
      [7517.6, -1015.4],
      [7555, -977],
    ],
  },
  {
    name: '松山機場',
    x: 4903,
    z: -2441,
    e: [
      [4858.2, -2463.1],
      [4935.7, -2369],
    ],
  },
  {
    name: '國父紀念館',
    x: 5520,
    z: -30,
    e: [
      [5528.4, -21.4],
      [5572.6, -19.2],
    ],
  },
  {
    name: '市政府',
    x: 6364,
    z: -14,
    e: [
      [6359, 7.4],
      [6395.4, 9],
    ],
  },
  {
    name: '永春',
    x: 7333,
    z: 14,
    e: [
      [7373.6, -35.5],
      [7405.4, -32.4],
    ],
  },
  {
    name: '象山',
    x: 6733,
    z: 899,
    e: [
      [6719.7, 928.1],
      [6836.1, 888.8],
    ],
  },
  {
    name: '世貿',
    x: 5995,
    z: 887,
    e: [
      [5994.6, 901],
      [6025.1, 906],
    ],
  },
  // v24.36 士林區 and 內湖區
  {
    name: '劍潭',
    x: 2217,
    z: -4785,
    e: [
      [2231, -4785],
      [2250.8, -4753],
    ],
  },
  {
    name: '士林',
    x: 2345,
    z: -5803,
    e: [
      [2357.4, -5809.5],
      [2369.6, -5773.7],
    ],
  },
  {
    name: '芝山',
    x: 1969,
    z: -6854,
    e: [
      [1983, -6854],
      [1991, -6820.8],
    ],
  },
  {
    name: '西湖',
    x: 6487,
    z: -4553,
    e: [
      [6421.3, -4570.4],
      [6570.8, -4531.2],
    ],
  },
  {
    name: '港墘',
    x: 7282,
    z: -4319,
    e: [
      [7297.1, -4295.4],
      [7322.5, -4282.9],
    ],
  },
  {
    name: '文德',
    x: 8264,
    z: -4151,
    e: [
      [8222.1, -4153.5],
      [8301.7, -4132.1],
    ],
  },
  {
    name: '內湖',
    x: 9197,
    z: -4698,
    e: [
      [9213.5, -4686.7],
      [9191.4, -4666.4],
    ],
  },
  {
    name: '大湖公園',
    x: 10019,
    z: -4727,
    e: [
      [10000.2, -4720.3],
      [10052.6, -4705],
    ],
  },
  {
    name: '葫洲',
    x: 10526,
    z: -3497,
    e: [
      [10554, -3497],
      [10576.7, -3453.8],
    ],
  },
  {
    name: '東湖',
    x: 10954,
    z: -2920,
    e: [
      [10943.5, -2932.1],
      [10940, -2865.1],
    ],
  },
];
const LINE = '艋舺橘線';

function prng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, rep = false) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** our logo: white disc, orange ring, green 北 */
function logo(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(x, y, r, 0, 7);
  c.fill();
  c.lineWidth = r * 0.22;
  c.strokeStyle = '#e8681c';
  c.beginPath();
  c.arc(x, y, r * 0.86, 0, 7);
  c.stroke();
  c.fillStyle = '#1f5a3a';
  c.font = `900 ${r * 1.05}px sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('北', x, y + r * 0.05);
}
/** station number badge: an orange rounded square with a circled numeral (our own style) */
function badge(c: CanvasRenderingContext2D, x: number, y: number, s: number, no: number) {
  c.fillStyle = '#e8681c';
  c.beginPath();
  c.roundRect(x - s / 2, y - s / 2, s, s, s * 0.25);
  c.fill();
  c.fillStyle = '#fff';
  c.font = `800 ${s * 0.62}px sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('橘' + no, x, y + s * 0.04);
}
const TX = new Map<string, THREE.Texture>();
const tex = (k: string, f: () => THREE.Texture) => TX.get(k) || (TX.set(k, f()), TX.get(k)!);
const nameTex = (name: string, no: number) =>
  tex('n' + name, () =>
    canvasTex(512, 128, c => {
      c.fillStyle = '#1f5a3a';
      c.fillRect(0, 0, 512, 128);
      c.fillStyle = '#e8681c';
      c.fillRect(0, 110, 512, 18);
      logo(c, 60, 56, 42);
      badge(c, 452, 56, 76, no);
      c.fillStyle = '#fff';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.font = '700 44px sans-serif';
      c.fillText(name, 118, 44);
      c.font = '400 20px sans-serif';
      c.fillText(`北都地下鐵・${LINE}`, 120, 88);
    }),
  );
/** hanging directional sign: dark green, white text, simple arrow */
const dirTex = (t: string, arrow: string) =>
  tex('d' + t + arrow, () =>
    canvasTex(512, 96, c => {
      c.fillStyle = '#123a26';
      c.fillRect(0, 0, 512, 96);
      c.fillStyle = '#e8681c';
      c.fillRect(0, 0, 10, 96);
      c.fillStyle = '#fff';
      c.font = '700 46px sans-serif';
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillText(arrow, 24, 50);
      c.font = '600 38px sans-serif';
      c.fillText(t, 92, 50);
    }),
  );
/** our pictograms (simple geometric figures, not anyone else's set) */
const picto = (k: 'wc' | 'lift' | 'info' | 'fire') =>
  tex('p' + k, () =>
    canvasTex(128, 128, c => {
      c.fillStyle = k === 'fire' ? '#c62a1e' : '#1f5a3a';
      c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#fff';
      c.strokeStyle = '#fff';
      c.lineWidth = 8;
      if (k === 'wc') {
        for (const [x, tri] of [
          [38, false],
          [90, true],
        ] as const) {
          c.beginPath();
          c.arc(x, 30, 10, 0, 7);
          c.fill();
          if (tri) {
            c.beginPath();
            c.moveTo(x, 44);
            c.lineTo(x - 20, 100);
            c.lineTo(x + 20, 100);
            c.fill();
          } else c.fillRect(x - 12, 44, 24, 60);
        }
        c.fillRect(62, 20, 4, 90);
      } else if (k === 'lift') {
        c.strokeRect(24, 18, 80, 92);
        c.beginPath();
        c.moveTo(44, 54);
        c.lineTo(54, 38);
        c.lineTo(64, 54);
        c.moveTo(64, 74);
        c.lineTo(74, 90);
        c.lineTo(84, 74);
        c.stroke();
      } else if (k === 'info') {
        c.font = '900 92px serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('i', 64, 68);
      } else {
        c.font = '900 40px sans-serif';
        c.textAlign = 'center';
        c.fillText('滅火器', 64, 78);
      }
    }),
  );
const POSTERS = [
  ['停電期間', '請沿綠色緊急照明', '往出口移動'],
  ['防空疏散點', '本站 B1 大廳', '請保持通道淨空'],
  ['尋人', '阿明，西園路', '平安請回家'],
  ['互助站', '米・水・藥', '能給就給，能拿就拿'],
];
const posterTex = (i: number) =>
  tex('ps' + i, () =>
    canvasTex(128, 180, c => {
      c.fillStyle = ['#f3ead2', '#e8681c', '#fff', '#d8e6d0'][i];
      c.fillRect(0, 0, 128, 180);
      c.fillStyle = '#1f5a3a';
      c.fillRect(0, 0, 128, 26);
      logo(c, 18, 13, 10);
      c.fillStyle = '#111';
      c.textAlign = 'center';
      POSTERS[i].forEach((t, k) => {
        c.font = `${k ? 600 : 800} ${k ? 15 : 22}px sans-serif`;
        c.fillText(t, 64, 62 + k * 34);
      });
    }),
  );
const boardTex = () =>
  tex('board', () =>
    canvasTex(512, 96, c => {
      c.fillStyle = '#0a0a0a';
      c.fillRect(0, 0, 512, 96);
      c.fillStyle = '#ff8a2a';
      c.font = '600 34px monospace';
      c.textBaseline = 'middle';
      c.fillText('往 新莊口　－－:－－', 16, 30);
      c.fillStyle = '#e44';
      c.fillText('全線停駛　請勿進入軌道', 16, 72);
    }),
  );
const mapTex = (name: string, no: number) =>
  tex('map' + name, () =>
    canvasTex(256, 192, c => {
      c.fillStyle = '#f4f1e8';
      c.fillRect(0, 0, 256, 192);
      c.fillStyle = '#1f5a3a';
      c.fillRect(0, 0, 256, 28);
      c.fillStyle = '#fff';
      c.font = '700 18px sans-serif';
      c.fillText(`${name}站 出口位置圖`, 10, 20);
      c.strokeStyle = '#bbb';
      c.lineWidth = 6;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(0, 50 + i * 30);
        c.lineTo(256, 40 + i * 32);
        c.stroke();
      }
      c.fillStyle = '#e8681c';
      c.fillRect(40, 100, 176, 22);
      for (const [x, y, n] of [
        [52, 70, 1],
        [200, 150, 2],
      ]) {
        c.beginPath();
        c.arc(x, y, 12, 0, 7);
        c.fill();
        c.fillStyle = '#fff';
        c.font = '700 14px sans-serif';
        c.fillText(String(n), x - 4, y + 5);
        c.fillStyle = '#e8681c';
      }
      badge(c, 230, 170, 30, no);
    }),
  );
const terrazzo = () =>
  tex('terr', () => {
    const t = canvasTex(
      256,
      256,
      c => {
        const r = prng(9);
        c.fillStyle = '#cfc8ba';
        c.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 1400; i++) {
          c.fillStyle = ['#8a8274', '#e9e3d6', '#6a6458', '#b49a7a'][Math.floor(r() * 4)];
          c.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
        }
        c.strokeStyle = '#a49c8c';
        c.strokeRect(0, 0, 256, 256);
      },
      true,
    );
    t.repeat.set(12, 5);
    return t;
  });
const wallTile = () =>
  tex('wtile', () => {
    const t = canvasTex(
      128,
      128,
      c => {
        c.fillStyle = '#e4e1d8';
        c.fillRect(0, 0, 128, 128);
        c.strokeStyle = '#c8c3b6';
        for (let i = 0; i <= 128; i += 32) {
          c.beginPath();
          c.moveTo(i, 0);
          c.lineTo(i, 128);
          c.moveTo(0, i);
          c.lineTo(128, i);
          c.stroke();
        }
        c.fillStyle = '#e8681c';
        c.fillRect(0, 96, 128, 8);
      },
      true,
    );
    return t;
  });
const stoneTex = () =>
  tex('stone', () => {
    const t = canvasTex(
      128,
      128,
      c => {
        const r = prng(3);
        c.fillStyle = '#9d9a92';
        c.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 500; i++) {
          c.fillStyle = r() < 0.5 ? '#8c8981' : '#aeaba3';
          c.fillRect(r() * 128, r() * 128, 2, 2);
        }
        c.strokeStyle = '#7d7a73';
        c.strokeRect(0, 0, 128, 128);
      },
      true,
    );
    t.repeat.set(34, 4);
    return t;
  });

const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });
const M = {
  wall: std(0xe9e6de),
  green: std(METRO_GREEN),
  orange: std(METRO_ORANGE, { roughness: 0.5 }),
  yellow: std(0xf5c400),
  tactile: std(0xe8b800, { roughness: 0.9 }),
  steel: std(0xb8bcc0, { metalness: 0.6, roughness: 0.35 }),
  black: std(0x1b1c1e),
  glass: std(0x9fd0d8, { transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false }),
  train: std(0xeef0f2, { metalness: 0.3, roughness: 0.35 }),
  win: std(0x1d2a30, { roughness: 0.2 }),
  seat: std(0x2f7a52),
  prio: std(0xc87a2a),
  void: std(0x070809, { roughness: 1 }),
  dark: std(0x3a3c40, { roughness: 0.9 }),
  rail: std(0x6a6058, { metalness: 0.5 }),
  ballast: std(0x2a2826, { roughness: 1 }),
  card: std(0xa98a5a, { roughness: 1 }),
  blanket: std(0x8a3a3a, { roughness: 1 }),
  blanket2: std(0x3a5a8a, { roughness: 1 }),
  red: std(0xc62a1e),
  white: std(0xf4f4f0),
  wood: std(0x7a5a3a),
  emerg: new THREE.MeshBasicMaterial({ color: 0x5aff8a }),
  lamp: new THREE.MeshBasicMaterial({ color: 0x3a3a34 }),
  lampOn: new THREE.MeshBasicMaterial({ color: 0xfff1c8 }),
  // v22.2 track / tunnel / live-state materials (power-dependent ones are recoloured in setPower)
  conc: std(0x6c6a66, { roughness: 0.95 }),
  sleeper: std(0x8e8b84, { roughness: 0.9 }),
  railTop: std(0xc9ccd0, { metalness: 0.8, roughness: 0.25 }),
  cover: std(0xd8cfa8, { roughness: 0.8 }),
  flood: std(0xd9a400, { metalness: 0.4, roughness: 0.5 }),
  tunnel: std(0x26282a, { roughness: 1 }),
  tlamp: new THREE.MeshBasicMaterial({ color: 0xfff1c8 }),
  sigR: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  sigG: new THREE.MeshBasicMaterial({ color: 0x2aff6a }),
  paddle: std(0xe8681c, { transparent: true, opacity: 0.85, roughness: 0.3 }),
};
const BOX = new THREE.BoxGeometry(1, 1, 1);

/** merges every box into one mesh per material */
class Builder {
  b = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(public g: THREE.Group) {}
  box(m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
    const geo = BOX.clone();
    geo.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + sy / 2, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
        new THREE.Vector3(sx, sy, sz),
      ),
    );
    if (!this.b.has(m)) this.b.set(m, []);
    this.b.get(m)!.push(geo);
  }
  plane(t: THREE.Texture, x: number, y: number, z: number, w: number, h: number, ry = 0, basic = true) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      basic ? new THREE.MeshBasicMaterial({ map: t, side: 2 }) : new THREE.MeshStandardMaterial({ map: t, side: 2 }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.g.add(m);
    return m;
  }
  floor(t: THREE.Texture, x: number, z: number, w: number, d: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    m.receiveShadow = true;
    this.g.add(m);
  }
  done() {
    for (const [m, gs] of this.b) {
      const mesh = new THREE.Mesh(mergeGeometries(gs), m);
      mesh.receiveShadow = true;
      mesh.castShadow = m !== M.glass;
      this.g.add(mesh);
      gs.forEach(x => x.dispose());
    }
    this.b.clear();
  }
}

export type MetroDeps = {
  scene: THREE.Scene;
  addSeg: (s: Seg, low?: boolean) => void;
  snap: (x: number, z: number) => V2;
  removeSeg: (s: Seg) => void;
};
/**
 * v24.34 where the interiors are kept: far north of anything the map will reach. They were at z = -7000, and the
 * north of 中山區 (z = -5645) comes close to that.
 */
export const METRO_Z = -20000;
/** a point that is down in the metro, not on the map */
export const inMetro = (z: number) => z < METRO_Z + 2000;
const OXZ = (i: number) => [-1200 + i * 240, METRO_Z] as const;
export const stationOrigin = OXZ;
// interior layout constants (local)
const EXITS = [-17, 17]; // B1 exit passages (x)
const BANKS = [-12, 12]; // stair/escalator banks B1 → B2 (x centre, 4.4 m wide)
const lights: { l: THREE.PointLight; base: number; ph: number }[] = [];

function scooter(b: Builder, x: number, z: number, ry: number, r: () => number) {
  const col = [M.red, M.white, M.green, M.dark][Math.floor(r() * 4)];
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const P = (u: number) => [x + c * u, z - s * u] as const;
  b.box(M.black, ...([P(-0.6)[0], 0, P(-0.6)[1]] as [number, number, number]), 0.35, 0.35, 0.12, ry);
  b.box(M.black, ...([P(0.6)[0], 0, P(0.6)[1]] as [number, number, number]), 0.35, 0.35, 0.12, ry);
  b.box(col, x, 0.25, z, 1.3, 0.35, 0.42, ry);
  b.box(col, P(0.55)[0], 0.3, P(0.55)[1], 0.2, 0.7, 0.4, ry);
  b.box(M.black, P(-0.15)[0], 0.6, P(-0.15)[1], 0.6, 0.12, 0.34, ry);
}

/** surface entrance: canopy + stairs + stopped escalator + lift, facing -z (open side) */
function entrance(
  scene: THREE.Scene,
  addSeg: MetroDeps['addSeg'],
  st: Station,
  ex: number,
  ez: number,
  no: number,
  r: () => number,
) {
  const g = new THREE.Group();
  g.position.set(ex, 0, ez);
  scene.add(g);
  const b = new Builder(g);
  b.box(M.green, -2.2, 0, 0.2, 0.15, 2.8, 4.4);
  b.box(M.green, 2.2, 0, 0.2, 0.15, 2.8, 4.4);
  b.box(M.green, 0, 0, 2.4, 4.5, 2.8, 0.15);
  b.box(M.glass, 0, 2.8, 0.2, 4.8, 0.08, 4.8);
  b.box(M.green, 0, 2.8, -2.1, 4.8, 0.2, 0.15);
  b.box(M.orange, 0, 2.6, -2.15, 4.6, 0.12, 0.05);
  // stairs (left) and stopped escalator (right) going down into the dark
  for (let k = 0; k < 7; k++) {
    b.box(M.dark, -0.9, -k * 0.05, -1.2 + k * 0.5, 1.8, 0.04, 0.5);
    b.box(M.black, 1.0, -k * 0.05, -1.2 + k * 0.5, 1.2, 0.04, 0.5);
  }
  b.box(M.steel, 0.3, 0, 0.4, 0.12, 0.95, 3.6);
  b.box(M.black, 1.7, 0, 0.4, 0.2, 0.95, 3.6);
  b.box(M.steel, 1.7, 0.95, 0.4, 0.24, 0.05, 3.6);
  // the lift tower beside the canopy
  b.box(M.green, 3.6, 0, 0.8, 1.6, 0.2, 1.6);
  b.box(M.glass, 3.6, 0.2, 0.8, 1.5, 2.6, 1.5);
  b.box(M.green, 3.6, 2.8, 0.8, 1.7, 0.25, 1.7);
  b.box(M.steel, 3.6, 0.2, 0.8, 0.9, 2.2, 0.9);
  // dumped scooters + a dropped bag
  for (let k = 0; k < 2 + Math.floor(r() * 3); k++) scooter(b, -4 - r() * 3, -2 + r() * 4, r() * 6, r);
  b.box(M.blanket2, 1 + r(), 0, -3 - r(), 0.45, 0.3, 0.3, r() * 3);
  b.done();
  const sm = b.plane(nameTex(st.name, st.no), 0, 3.25, -2.2, 3.6, 0.9, Math.PI);
  sm.scale.x = 1;
  const ex2 = canvasTex(64, 64, c => {
    c.fillStyle = '#e8681c';
    c.beginPath();
    c.arc(32, 32, 30, 0, 7);
    c.fill();
    c.fillStyle = '#fff';
    c.font = '800 38px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(no), 32, 34);
  });
  b.plane(ex2, -1.9, 3.25, -2.21, 0.6, 0.6, Math.PI);
  b.plane(picto('lift'), 3.6, 2.4, 0.03, 0.5, 0.5, Math.PI);
  const pole = tex('pole', () => canvasTex(128, 128, c => logo(c, 64, 64, 58)));
  b.plane(pole, -2.9, 3.0, -2.2, 0.9, 0.9, Math.PI);
  addSeg({ a: [ex - 2.2, ez - 2], b: [ex - 2.2, ez + 2.4] });
  addSeg({ a: [ex + 2.2, ez - 2], b: [ex + 2.2, ez + 2.4] });
  addSeg({ a: [ex - 2.2, ez + 2.4], b: [ex + 2.2, ez + 2.4] });
  addSeg({ a: [ex + 2.8, ez], b: [ex + 4.4, ez + 1.6] });
}

/** builds the surface entrances now and returns stations; interiors come from ensureInterior() */
export function buildMetro(d: MetroDeps): Station[] {
  DEPS = d;
  return STATIONS.map((st, i) => {
    const [OX, OZ] = OXZ(i);
    const r = prng(1000 + i * 77);
    const gates: Gate[] = [];
    const S: Station = {
      name: st.name,
      no: i + 3,
      ent: [0, 0],
      out: [0, 0],
      inn: [0, 0],
      exit: [0, 0],
      gates,
      loot: [],
      built: false,
      shops: stationShops(i),
    };
    // two street exits per station, ~45 m apart
    (
      st.e ?? [
        [st.x, st.z],
        [st.x + 34, st.z + 26],
      ]
    ).forEach(([ax, az], k) => {
      const [ex, ez] = st.e ? [ax, az] : d.snap(ax, az);
      entrance(d.scene, d.addSeg, S, ex, ez, k + 1, r);
      gates.push({
        no: k + 1,
        ent: [ex, ez],
        out: [ex, ez - 3.4],
        inn: [OX + EXITS[k], OZ - 4],
        exit: [OX + EXITS[k], OZ - 8.5],
      });
    });
    Object.assign(S, { ent: gates[0].ent, out: gates[0].out, inn: gates[0].inn, exit: gates[0].exit });
    S.loot = [
      { id: `m${i}:0`, p: [OX - 20, OZ + 0.5], type: 'store' }, // kiosk
      { id: `m${i}:1`, p: [OX + 16, OZ + 1.8], type: 'pharmacy' }, // service counter first-aid
      { id: `m${i}:2`, p: [OX - 6, OZ - 3.5], type: 'home' }, // refugee bundle
      { id: `m${i}:3`, p: [OX + 8, OZ + 21.4], type: 'store' }, // dropped on the platform
      { id: `m${i}:4`, p: [OX - 20, OZ + 26.6], type: 'home' }, // by the seats
      { id: `m${i}:5`, p: [OX + 21, OZ + 8], type: 'home' }, // lockers
      { id: `m${i}:6`, p: [OX + 20, OZ + 0.5], type: 'pharmacy' }, // pharmacy shelves (only after the power cut)
      { id: `m${i}:7`, p: [OX - 5, OZ + 9.4], type: 'store' }, // bakery kiosk
      { id: `m${i}:8`, p: [OX + 5, OZ + 9.4], type: 'store' }, // phone / flower kiosk
    ];
    // collision is cheap, register it now so loot and walls are consistent before the meshes stream in
    SEGS[i] = interiorSegs(d.addSeg, OX, OZ);
    return S;
  });
}

type SegState = { jam: Seg[]; maint: Seg[]; gap: Seg; on: boolean | null };
const SEGS: SegState[] = [];
const CABS = [-10.4, -8, -6.4, -4.8, -3.2, -1.6, 0, 1.6, 3.2, 4.8, 6.4, 8]; // gate cabinet x positions
function interiorSegs(addSeg: MetroDeps['addSeg'], OX: number, OZ: number): SegState {
  const W = (ax: number, az: number, bx: number, bz: number, low = false) =>
    addSeg({ a: [OX + ax, OZ + az], b: [OX + bx, OZ + bz] }, low);
  // a seg that is created but not registered (power-dependent)
  const S = (ax: number, az: number, bx: number, bz: number): Seg => ({
    a: [OX + ax, OZ + az],
    b: [OX + bx, OZ + bz],
    h: 1.0,
  });
  // B1 concourse x∈[-24,24] z∈[-6,12], exit passages north at x = ±17
  W(-24, -6, -19.2, -6);
  W(-14.8, -6, 14.8, -6);
  W(19.2, -6, 24, -6);
  for (const x of EXITS) {
    W(x - 2.2, -6, x - 2.2, -10);
    W(x + 2.2, -6, x + 2.2, -10);
    W(x - 2.2, -10, x + 2.2, -10, true);
  }
  W(-24, -6, -24, 12);
  W(24, -6, 24, 12);
  // gate line z = 4: glass fence + gate cabinets. The middle lanes jam shut only when the power is out
  // (toggled in setPower); the wide accessible gate is the west-most lane x∈[-10.4,-8]
  W(-24, 4, -10.6, 4, true);
  W(8.4, 4, 24, 4, true);
  for (const x of CABS) W(x, 3.1, x, 4.9, true);
  const jam: Seg[] = [];
  for (let k = -3; k <= 2; k++) jam.push(S(k * 1.6 + 0.2, 4, k * 1.6 + 1.4, 4));
  // B1 south wall with the two bank openings, bank corridors over the north track
  W(-24, 12, -14.2, 12);
  W(-9.8, 12, 9.8, 12);
  W(14.2, 12, 24, 12);
  for (const x of BANKS) {
    W(x - 2.2, 12, x - 2.2, 20);
    W(x + 2.2, 12, x + 2.2, 20);
  }
  // B2 island platform x∈[-34,34] z∈[20,28]; screen doors both sides (north side open at the banks)
  // end walls stop at z = 26.5: the strip z∈[26.5,28] is the maintenance gate down to the south track
  for (const sx of [-1, 1]) {
    W(sx * 34, 20, sx * 34, 26.5);
    // walkable tunnel stub (only reachable through the maintenance gate while the power is out),
    // ending at the closed steel flood gate at x = ±46.5
    W(sx * 34, 26.5, sx * 46.5, 26.5);
    W(sx * 28, 32.8, sx * 46.5, 32.8);
    W(sx * 46.5, 26.5, sx * 46.5, 32.8);
    W(sx * 28, 28, sx * 28, 28.6);
    W(sx * 28, 31.6, sx * 28, 32.8);
  }
  const maint = [S(-34, 26.5, -34, 28), S(34, 26.5, 34, 28)];
  W(-34, 20, -14.2, 20);
  W(-9.8, 20, 9.8, 20);
  W(14.2, 20, 34, 20);
  // south screen doors: while the power is out one door pair is jammed open at x = 0 into the parked train
  W(-34, 28, -1, 28);
  W(1, 28, 34, 28);
  const gap = S(-1, 28, 1, 28);
  // parked train body z∈[28.6, 31.6], door gap at x∈[-1, 1] (only reachable when it is parked)
  W(-28, 28.6, -1, 28.6);
  W(1, 28.6, 28, 28.6);
  W(-28, 31.6, 28, 31.6);
  W(-28, 28.6, -28, 31.6);
  W(28, 28.6, 28, 31.6);
  // pillars on the island (they carry the roof beam)
  for (let x = -28; x <= 28; x += 8)
    if (Math.abs(Math.abs(x) - 12) > 3) (W(x - 0.4, 24, x + 0.4, 24), W(x, 23.6, x, 24.4));
  // v22.3 shops: walls, glass fronts (door gap z∈[-0.6,0.8]), counters, shelves, kiosks, vending machines
  for (const sx of [-1, 1]) {
    W(sx * 18.6, -3, sx * 24, -3);
    W(sx * 18.6, 3, sx * 24, 3, true);
    W(sx * 18.6, -3, sx * 18.6, -0.6);
    W(sx * 18.6, 0.8, sx * 18.6, 3);
    W(sx * 18.8, -1.95, sx * 21.2, -1.95, true);
    W(sx * 18.8, -1.25, sx * 21.2, -1.25, true);
    W(sx * 18.8, -1.95, sx * 18.8, -1.25, true);
    for (const gx of [22.0, 20.8])
      (W(sx * gx, -0.4, sx * gx, 2.4, true), W(sx * (gx - 0.3), -0.4, sx * (gx + 0.3), -0.4, true));
    W(sx * 23.0, -2.8, sx * 23.0, 2.8);
  }
  for (const kx of [-5, 5]) {
    W(kx - 1.6, 8.9, kx + 1.6, 8.9, true);
    W(kx - 1.6, 8.9, kx - 1.6, 11.4, true);
    W(kx + 1.6, 8.9, kx + 1.6, 11.4, true);
  }
  W(9.7, -4.6, 14.3, -4.6, true);
  W(-1.7, 10.6, 0.5, 10.6, true);
  W(23.2, 5.7, 23.2, 8.4);
  const st: SegState = { jam, maint, gap, on: null };
  return st;
}

/** builds a station interior the first time it is needed (lazy streaming) */
/** v24.33 the interior of each station that has been built */
const GROUPS: (THREE.Group | undefined)[] = [];
/**
 * v24.33 only the station the player is in is drawn. Each interior carries some twenty point lights, and three.js
 * counts every visible light into every material on screen: with the interiors left in the scene, the third station
 * visited brought a frame from 40 ms to 900 ms, and the fifth lost the tab. (Stations are 240 m apart.)
 */
function showOnly(px: number, pz: number) {
  for (let i = 0; i < GROUPS.length; i++) {
    const g = GROUPS[i];
    if (!g) continue;
    const [OX, OZ] = OXZ(i);
    g.visible = Math.abs(px - OX) < 115 && pz - OZ > -45 && pz - OZ < 75;
  }
}
export const metroShown = () => GROUPS.map(g => !!g?.visible);
export function ensureInterior(scene: THREE.Scene, S: Station, i: number) {
  if (S.built) return;
  S.built = true;
  const [OX, OZ] = OXZ(i);
  const r = prng(5000 + i * 131);
  const g = new THREE.Group();
  g.position.set(OX, 0, OZ);
  scene.add(g);
  GROUPS[i] = g;
  const b = new Builder(g);
  // the black void around everything (rock / tunnel)
  b.box(M.void, 0, -0.62, 12, 150, 0.6, 80);
  // ===== B1 concourse =====
  b.floor(terrazzo(), 0, 3, 48, 18);
  const tw = new THREE.MeshStandardMaterial({ map: wallTile(), roughness: 0.6 });
  const wall = (x: number, z: number, sx: number, sz: number, h: number) => b.box(tw, x, 0, z, sx, h, sz);
  // north wall (far side, full height, tiled) with the exit passages
  wall(-21.6, -6, 4.8, 0.3, 3.4);
  wall(0, -6, 29.6, 0.3, 3.4);
  wall(21.6, -6, 4.8, 0.3, 3.4);
  wall(-24, 3, 0.3, 18, 3.4);
  wall(24, 3, 0.3, 18, 1.2); // camera side: cut low
  // soffit with recessed (dead) lights along the far wall, green emergency lights over the exits
  b.box(M.white, 0, 3.1, -5.2, 48, 0.3, 1.6);
  for (let x = -22; x <= 22; x += 2.5) b.box(M.lamp, x, 3.08, -5.2, 0.9, 0.02, 0.4);
  for (const x of EXITS) {
    b.box(M.emerg, x, 2.7, -5.85, 0.8, 0.25, 0.05);
    // exit passage: stairs + stopped escalator up to the street
    for (let k = 0; k < 6; k++) {
      b.box(M.dark, x - 0.9, 0, -6.4 - k * 0.6, 2.0, 0.04 + k * 0.05, 0.6);
      b.box(M.black, x + 1.2, 0, -6.4 - k * 0.6, 1.4, 0.04 + k * 0.05, 0.6);
    }
    b.box(M.steel, x + 0.35, 0, -8, 0.1, 1.0, 4);
    b.box(M.orange, x - 2.1, 0, -8, 0.1, 1.0, 4);
    b.box(M.orange, x + 2.1, 0, -8, 0.1, 1.0, 4);
  }
  // lift in the unpaid area
  b.box(M.glass, 0, 0, -4.9, 2, 3, 1.8);
  b.box(M.steel, 0, 0, -5.6, 1.2, 2.4, 0.2);
  b.box(M.green, 0, 3, -4.9, 2.1, 0.2, 1.9);
  // ticket vending machines (orange face) + add-value machines (green)
  for (let k = 0; k < 4; k++) {
    b.box(M.green, -13 + k * 1.3, 0, -5.4, 1.1, 1.8, 0.8);
    b.box(M.orange, -13 + k * 1.3, 1.1, -4.99, 0.8, 0.45, 0.02);
    b.box(M.black, -13 + k * 1.3, 0.8, -4.99, 0.25, 0.08, 0.02);
  }
  for (let k = 0; k < 2; k++) {
    b.box(M.dark, 7 + k * 1.3, 0, -5.4, 1.0, 1.7, 0.7);
    b.box(M.green, 7 + k * 1.3, 1.1, -5.04, 0.7, 0.35, 0.02);
  }
  // service counter at the gate line (paid / unpaid both sides)
  b.box(M.green, 13, 0, 4, 5, 1.1, 1.2);
  b.box(M.glass, 13, 1.1, 4, 5, 1.3, 0.05);
  b.box(M.white, 13, 2.4, 4, 5.2, 0.15, 1.3);
  // gates: steel cabinets with an orange cap, our own card-reader pad and LED panels at both ends, and
  // orange flap paddles (live meshes, see setPower / metroTick); the west lane is the wide accessible gate
  for (const x of CABS) {
    b.box(M.steel, x, 0, 4, 0.3, 0.95, 1.8);
    b.box(M.orange, x, 0.95, 4, 0.32, 0.06, 1.8);
    b.box(M.black, x, 1.01, 3.4, 0.24, 0.015, 0.34);
    b.box(M.black, x, 1.01, 4.6, 0.24, 0.015, 0.34);
    b.box(M.dark, x, 0, 4, 0.34, 0.08, 1.84);
  }
  // glass fence between the gates and the walls
  for (const [a, c] of [
    [-24, -10.6],
    [8.4, 10.5],
    [15.5, 24],
  ]) {
    b.box(M.glass, (a + c) / 2, 0, 4, c - a, 1.4, 0.05);
    b.box(M.steel, (a + c) / 2, 1.4, 4, c - a, 0.05, 0.08);
  }
  // v22.3 shops, kiosks, vending machines (fictional brands)
  buildRetail(g, b, i);
  // lockers in the paid area
  for (let a = 0; a < 3; a++) for (let c = 0; c < 4; c++) b.box(M.steel, 23.5, a * 0.6, 6 + c * 0.55, 0.5, 0.56, 0.52);
  // benches
  for (const x of [-18, -14, 18]) (b.box(M.wood, x, 0.4, 9, 2.2, 0.08, 0.5), b.box(M.steel, x, 0, 9, 2.0, 0.4, 0.1));
  // refugees: cardboard + bedding along the walls of the unpaid area, dropped bags, debris
  for (let k = 0; k < 9; k++) {
    const x = -22 + k * 2.6 + r() * 0.6,
      z = -4.2 + (k % 2) * 3.6 + r();
    if (Math.abs(x) < 1.6 || Math.abs(x - 7.6) < 2 || x < -18.2) continue;
    b.box(M.card, x, 0, z, 1.0, 0.02, 2.0, r() * 0.3);
    if (r() < 0.75) b.box(r() < 0.5 ? M.blanket : M.blanket2, x, 0.02, z + 0.2, 0.9, 0.12, 1.4, r() * 0.4);
    if (r() < 0.6) b.box(M.dark, x + 0.4, 0, z - 0.9, 0.4, 0.3, 0.3, r() * 2);
  }
  for (let k = 0; k < 14; k++)
    b.box(
      r() < 0.5 ? M.card : M.dark,
      -22 + r() * 44,
      0,
      -3 + r() * 14,
      0.2 + r() * 0.5,
      0.06,
      0.2 + r() * 0.4,
      r() * 3,
    );
  // ===== banks down to B2 (stairs + stopped escalator), crossing over the north track =====
  for (const x of BANKS) {
    b.box(tw, x - 2.2, 0, 16, 0.2, 1.0, 8);
    b.box(tw, x + 2.2, 0, 16, 0.2, 1.0, 8);
    for (let k = 0; k < 14; k++) {
      b.box(M.dark, x - 1, 0, 12.3 + k * 0.55, 2.2, 0.08 - k * 0.004, 0.55);
      b.box(M.black, x + 1.2, 0, 12.3 + k * 0.55, 1.4, 0.08 - k * 0.004, 0.55);
    }
    b.box(M.steel, x + 0.4, 0, 16, 0.1, 1.0, 8);
  }
  // B1 south wall (camera side → low)
  wall(-19.1, 12, 9.8, 0.3, 0.9);
  wall(0, 12, 19.6, 0.3, 0.9);
  wall(19.1, 12, 9.8, 0.3, 0.9);
  // ===== tracks: concrete trackbed, sleepers, running rails, covered third rail, drainage trough,
  // track lamps; both run on into the tunnels (x = ±110) =====
  track(b, 16, -1);
  track(b, 30.1, 1);
  // ===== B2 island platform =====
  b.floor(stoneTex(), 0, 24, 68, 8);
  b.box(M.tactile, 0, 0.015, 20.5, 68, 0.01, 0.5);
  b.box(M.tactile, 0, 0.015, 27.5, 68, 0.01, 0.5);
  // full-height screen doors: north (far side, fixed glass) and south (train side, live sliding leaves)
  for (const z of [20, 28]) {
    for (let k = -15; k <= 15; k++) {
      const c = k * 2.2;
      if (z === 20 && BANKS.some(q => Math.abs(c - q) < 2.6)) continue;
      b.box(M.steel, c - 1.1, 0, z, 0.1, 2.6, 0.12);
      if (z === 20 || !DOORS.includes(c)) b.box(M.glass, c, 0, z, 2.0, 2.4, 0.04);
      b.box(M.green, c, 2.4, z, 2.2, 0.2, 0.16);
      b.box(M.green, c - 0.6, 0.016, z + (z === 20 ? 1.1 : -1.1), 0.2, 0.01, 1.0);
      b.box(M.green, c + 0.6, 0.016, z + (z === 20 ? 1.1 : -1.1), 0.2, 0.01, 1.0);
      b.box(M.orange, c, 0.016, z + (z === 20 ? 0.9 : -0.9), 0.6, 0.01, 0.12);
    }
    b.box(M.steel, 34.1, 0, z, 0.1, 2.6, 0.12);
  }
  // pillars (carry the roof beam) with name panels, extinguisher cabinets, CCTV
  b.box(M.orange, 0, 3.2, 24, 68, 0.3, 0.5);
  for (let x = -28; x <= 28; x += 8) {
    if (Math.abs(Math.abs(x) - 12) <= 3) continue;
    b.box(M.green, x, 0, 24, 0.8, 3.2, 0.8);
    b.box(M.red, x + 0.42, 0.6, 24, 0.06, 0.8, 0.5);
    b.box(M.black, x, 2.9, 24.5, 0.15, 0.15, 0.3);
  }
  // seats incl. a priority area (warm orange seats + its own sign)
  for (const [x, prio] of [
    [-24, false],
    [-4, false],
    [4, true],
    [24, false],
  ] as const) {
    b.box(prio ? M.prio : M.seat, x, 0.42, 25.5, 2.4, 0.08, 0.5);
    b.box(M.steel, x, 0, 25.5, 2.2, 0.42, 0.1);
  }
  // dropped stuff on the platform
  for (let k = 0; k < 6; k++)
    b.box([M.blanket2, M.dark, M.card][k % 3], -30 + r() * 60, 0, 21.5 + r() * 5, 0.5, 0.3, 0.35, r() * 3);
  // B2 end walls (low on the camera side), with the maintenance gate gap z∈[26.5,28]
  wall(-34, 23.25, 0.3, 6.5, 1.0);
  wall(34, 23.25, 0.3, 6.5, 1.0);
  for (const sx of [-1, 1]) portal(b, tw, sx);
  b.done();
  // ===== textured planes: signs, maps, posters, boards =====
  const NT = nameTex(S.name, S.no);
  b.plane(NT, -8, 2.3, -5.83, 3.6, 0.9);
  b.plane(NT, 8, 2.3, -5.83, 3.6, 0.9);
  for (let x = -28; x <= 28; x += 8) if (Math.abs(Math.abs(x) - 12) > 3) b.plane(NT, x, 2.1, 23.58, 1.6, 0.4);
  b.plane(dirTex('往月台', '↓'), -12, 2.7, 8, 2.6, 0.5);
  b.plane(dirTex('往月台', '↓'), 12, 2.7, 8, 2.6, 0.5);
  b.plane(dirTex('出口 1', '↖'), -12, 2.7, 0, 2.6, 0.5);
  b.plane(dirTex('出口 2', '↗'), 12, 2.7, 0, 2.6, 0.5);
  b.plane(dirTex('出口・往大廳', '↑'), -12, 2.7, 22, 2.6, 0.5);
  b.plane(dirTex('出口・往大廳', '↑'), 12, 2.7, 22, 2.6, 0.5);
  b.plane(mapTex(S.name, S.no), -3.8, 1.6, -5.83, 1.6, 1.2);
  b.plane(picto('wc'), 20, 2.4, -5.83, 0.6, 0.6);
  b.plane(picto('info'), 13, 2.75, 3.9, 0.5, 0.5);
  b.plane(picto('lift'), 1.3, 2.4, -5.83, 0.5, 0.5);
  b.plane(posterTex(0), -2, 1.5, -5.83, 0.7, 1.0);
  b.plane(posterTex(1), 4, 1.5, -5.83, 0.7, 1.0);
  b.plane(posterTex(2), -23.83, 1.5, 6, 0.7, 1.0, Math.PI / 2);
  b.plane(posterTex(3), -23.83, 1.5, 9, 0.7, 1.0, Math.PI / 2);
  const kt = tex('kiosk', () =>
    canvasTex(256, 48, c => {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, 256, 48);
      c.fillStyle = '#e8681c';
      c.font = '800 30px sans-serif';
      c.fillText('巷口便利站', 46, 34);
      c.fillStyle = '#1f5a3a';
      c.fillRect(0, 40, 256, 8);
    }),
  );
  void kt;
  b.plane(picto('fire'), 3.4, 0.9, 24.42, 0.4, 0.4);
  const D = buildDyn(g, i);
  for (const x of [-20, 20]) {
    b.plane(boardTex(), x, 2.75, 20.6, 2.6, 0.5);
    b.plane(D.board.tex, x, 2.75, 27.4, 2.6, 0.5);
  }
  const pr = tex('prio', () =>
    canvasTex(128, 64, c => {
      c.fillStyle = '#c87a2a';
      c.fillRect(0, 0, 128, 64);
      c.fillStyle = '#fff';
      c.font = '700 26px sans-serif';
      c.textAlign = 'center';
      c.fillText('博愛座', 64, 42);
    }),
  );
  b.plane(pr, 4, 1.3, 25.78, 1.0, 0.5);
  // emergency lighting only (power out) — flickers in metroTick
  for (const [x, y, z, base] of [
    [-14, 2.8, -2, 5],
    [14, 2.8, 6, 4],
    [-20, 2.8, 24, 4],
    [10, 2.8, 25, 5],
    [-14, 2.4, 30.1, 6],
    [14, 2.4, 30.1, 6],
  ]) {
    const l = new THREE.PointLight(0xffd9a0, base, 22, 1.4);
    l.position.set(x, y, z);
    g.add(l);
    lights.push({ l, base, ph: r() * 10 });
    const e = new THREE.Mesh(BOX, M.lampOn);
    e.scale.set(0.5, 0.08, 0.2);
    e.position.set(x, y + 0.3, z);
    g.add(e);
  }
}
// ===== v22.2: tracks, tunnel portals, live gates / screen doors / day-1 train service =====
const DOORS = [-19.8, -13.2, -6.6, 0, 6.6, 13.2, 19.8]; // train door / live screen-door bay centres (x)
const TL = 56; // train length

/** one track: concrete trackbed, twin-block sleepers, running rails, covered third rail, drainage trough,
 * track lamps — runs on to x = ±110 inside the tunnels */
function track(b: Builder, z: number, side: number) {
  const L = 220;
  b.box(M.conc, 0, -0.62, z, L, 0.59, 4.4);
  b.box(M.black, 0, -0.034, z, L, 0.01, 0.34); // drainage trough
  b.box(M.dark, 0, -0.036, z, L, 0.008, 0.5);
  for (let x = -L / 2; x <= L / 2; x += 0.65)
    for (const dz of [-0.72, 0.72]) b.box(M.sleeper, x, -0.035, z + dz, 0.3, 0.06, 0.78);
  for (const dz of [-0.72, 0.72]) {
    b.box(M.rail, 0, -0.03, z + dz, L, 0.11, 0.07);
    b.box(M.railTop, 0, 0.08, z + dz, L, 0.025, 0.08);
  }
  // third rail on the outer side with its insulators and protective cover
  const tz = z + side * 1.55;
  for (let x = -L / 2; x <= L / 2; x += 4) b.box(M.cover, x, -0.03, tz, 0.12, 0.12, 0.12);
  b.box(M.steel, 0, 0.09, tz, L, 0.07, 0.08);
  b.box(M.cover, 0, 0.17, tz, L, 0.03, 0.24);
  b.box(M.cover, 0, 0.1, tz + side * 0.11, L, 0.08, 0.02);
  // track lamps along the trackbed edge (lit while the power is on)
  for (let x = -L / 2 + 3; x <= L / 2; x += 6) b.box(M.tlamp, x, -0.02, z + side * 2.05, 0.3, 0.12, 0.08);
  if (side > 0) b.box(M.tunnel, 0, -0.05, 32.95, L, 1.05, 0.3); // outer tunnel wall (camera side → low)
}

/** tunnel portals at one platform end (sx = ±1): arch lintels with our orange/green ring over both tracks,
 * dark tunnel walls, ribs, track lamps, signals, a covered tunnel beyond x = ±47 and the maintenance gate */
function portal(b: Builder, tw: THREE.Material, sx: number) {
  const X = (v: number) => sx * v;
  for (const [zc, w] of [
    [29.65, 6.3],
    [16, 8],
  ] as const) {
    b.box(tw, X(34.15), 2.5, zc, 0.3, 1.1, w);
    b.box(M.orange, X(34.15 - 0.17), 2.55, zc, 0.04, 0.16, w);
    b.box(M.green, X(34.15 - 0.17), 2.75, zc, 0.04, 0.1, w);
    b.box(M.dark, X(34.15 - 0.17), 2.5, zc, 0.04, 0.05, w);
  }
  // rock between the two tunnels, north tunnel outer wall, covered tunnel roof
  b.box(M.tunnel, X(72.25), 0, 23.05, 76.5, 2.7, 6.9);
  b.box(M.tunnel, X(67), 0, 12.3, 86, 2.7, 0.6);
  b.box(M.tunnel, X(81), 2.7, 22.4, 58, 0.25, 21.6); // covered tunnel from x = ±52 hides trains in transit
  // tunnel ring ribs + track lamps on the walls
  for (let x = 36; x <= 46; x += 3.3) {
    b.box(M.dark, X(x), 0, 26.62, 0.25, 2.7, 0.14);
    b.box(M.dark, X(x), 0, 32.78, 0.25, 1.1, 0.14);
    b.box(M.dark, X(x), 0, 19.48, 0.25, 2.7, 0.14);
    b.box(M.dark, X(x), 0, 12.62, 0.25, 2.7, 0.14);
    b.box(M.tlamp, X(x + 1.6), 2.2, 26.62, 0.4, 0.12, 0.1);
    b.box(M.tlamp, X(x + 1.6), 2.2, 12.62, 0.4, 0.12, 0.1);
  }
  // signals at the tunnel mouths (black head, red + green aspects)
  for (const [z, f] of [
    [26.75, 1],
    [19.35, -1],
  ] as const) {
    b.box(M.black, X(35.2), 1.6, z, 0.36, 0.8, 0.16);
    b.box(M.sigR, X(35.2), 2.1, z + f * 0.09, 0.16, 0.16, 0.02);
    b.box(M.sigG, X(35.2), 1.8, z + f * 0.09, 0.16, 0.16, 0.02);
    b.box(M.steel, X(35.2), 0, z, 0.08, 1.6, 0.08);
  }
  // maintenance gate posts + steps, cable cabinet behind the parked train end
  b.box(M.steel, X(34), 0, 26.5, 0.12, 1.2, 0.12);
  b.box(M.steel, X(34), 0, 28, 0.12, 1.2, 0.12);
  b.box(M.yellow, X(34), 0.005, 27.25, 0.3, 0.01, 1.5);
  b.box(M.dark, X(28.3), 0, 32.2, 0.6, 1.1, 1.1);
}

const cardTex = () =>
  tex('card', () =>
    canvasTex(64, 64, c => {
      c.fillStyle = '#111';
      c.fillRect(0, 0, 64, 64);
      c.strokeStyle = '#e8681c';
      c.lineWidth = 5;
      for (const r of [10, 19, 28]) {
        c.beginPath();
        c.arc(14, 50, r, -1.4, -0.2);
        c.stroke();
      }
      c.fillStyle = '#1f5a3a';
      c.fillRect(34, 36, 22, 16);
    }),
  );
const ledTex = (k: 'go' | 'x' | 'off') =>
  tex('led' + k, () =>
    canvasTex(64, 48, c => {
      c.fillStyle = '#050505';
      c.fillRect(0, 0, 64, 48);
      if (k === 'off') return;
      c.fillStyle = k === 'go' ? '#3aff7a' : '#ff3a2a';
      c.font = '900 40px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(k === 'go' ? '↑' : '✕', 32, 26);
    }),
  );
const LED = {
  go: new THREE.MeshBasicMaterial({ map: ledTex('go'), side: 2 }),
  x: new THREE.MeshBasicMaterial({ map: ledTex('x'), side: 2 }),
  off: new THREE.MeshBasicMaterial({ map: ledTex('off'), side: 2 }),
};
const hazTex = () =>
  tex('haz', () =>
    canvasTex(256, 128, c => {
      for (let k = -4; k < 12; k++) {
        c.fillStyle = k % 2 ? '#111' : '#e8b800';
        c.beginPath();
        c.moveTo(k * 32, 128);
        c.lineTo(k * 32 + 32, 128);
        c.lineTo(k * 32 + 96, 0);
        c.lineTo(k * 32 + 64, 0);
        c.fill();
      }
      c.fillStyle = '#111';
      c.fillRect(30, 38, 196, 52);
      c.fillStyle = '#fff';
      c.font = '800 26px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('防水閘門・關閉', 128, 64);
    }),
  );
const maintTex = () =>
  tex('maint', () =>
    canvasTex(256, 64, c => {
      c.fillStyle = '#e8b800';
      c.fillRect(0, 0, 256, 64);
      c.fillStyle = '#111';
      c.font = '800 28px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('維修通道・非請勿入', 128, 33);
    }),
  );

type Part = { m: THREE.Object3D; x0: number };
type Leaf = { ps: Part[]; dir: number; w: number; c: number };
type Dyn = {
  i: number;
  train: THREE.Group;
  tdoors: Leaf[];
  psd: Leaf[];
  paddles: { m: THREE.Object3D; dir: number; lane: number; cx: number; rot: number }[];
  leds: THREE.Mesh[];
  flood: { m: THREE.Object3D; y0: number }[];
  maint: { m: THREE.Object3D; sx: number }[];
  board: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; txt: string };
  tl: THREE.PointLight[];
  phase: string;
};
const DYN: Dyn[] = [];
let DEPS: MetroDeps | null = null;
const bx = (m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
  const o = new THREE.Mesh(BOX, m);
  o.scale.set(sx, sy, sz);
  o.position.set(x, y + sy / 2, z);
  o.castShadow = m !== M.glass;
  return o;
};

/** the live (state-changing) parts of a station: train, door leaves, gate paddles + LEDs, flood gates, board */
function buildDyn(g: THREE.Group, i: number): Dyn {
  // ---- train (own group, moves along the south track) ----
  const train = new THREE.Group();
  train.position.z = 0;
  g.add(train);
  const tb = new Builder(train);
  const gaps = (z: number, y: number, h: number, d: number, m: THREE.Material) => {
    let a = -TL / 2;
    for (const c of [...DOORS, TL / 2 + 0.7]) {
      const e = c - 0.7;
      if (e > a) tb.box(m, (a + e) / 2, y, z, e - a, h, d);
      a = c + 0.7;
    }
  };
  gaps(28.65, 0, 1.4, 0.1, M.train);
  gaps(28.59, 0.55, 0.16, 0.02, M.orange);
  gaps(28.59, 0.75, 0.06, 0.02, M.green);
  tb.box(M.train, 0, 0, 31.55, TL, 1.4, 0.1);
  tb.box(M.green, -TL / 2, 0, 30.1, 0.6, 2.4, 3);
  tb.box(M.green, TL / 2, 0, 30.1, 0.6, 2.4, 3);
  tb.box(M.win, -TL / 2 - 0.31, 1.2, 30.1, 0.02, 0.8, 2.2);
  tb.box(M.win, TL / 2 + 0.31, 1.2, 30.1, 0.02, 0.8, 2.2);
  tb.box(M.lampOn, -TL / 2 - 0.31, 0.5, 29.1, 0.02, 0.15, 0.3);
  tb.box(M.lampOn, -TL / 2 - 0.31, 0.5, 31.1, 0.02, 0.15, 0.3);
  tb.box(M.red, TL / 2 + 0.31, 0.5, 29.1, 0.02, 0.15, 0.3);
  tb.box(M.red, TL / 2 + 0.31, 0.5, 31.1, 0.02, 0.15, 0.3);
  tb.box(M.train, 0, 0, 30.1, TL, 0.03, 2.8); // light floor so the car reads from above
  tb.box(M.orange, 0, 0.035, 30.1, TL, 0.005, 0.5);
  tb.box(M.orange, 0, 1.4, 28.65, TL, 0.08, 0.14);
  tb.box(M.orange, 0, 1.4, 31.55, TL, 0.08, 0.14);
  for (let c = -2; c <= 1; c++) tb.box(M.black, (c + 0.5) * 14, 0, 30.1, 0.15, 1.6, 2.9); // car gangways
  for (let j = 0; j < 8; j++) {
    const x = -23.1 + j * 6.6;
    tb.box(M.win, x, 0.85, 28.58, 2.6, 0.45, 0.02);
    tb.box(M.seat, x, 0, 31.1, 3.6, 0.45, 0.6);
  }
  for (const c of DOORS) {
    tb.box(M.steel, c, 1.3, 30.1, 0.05, 0.05, 2.8);
    tb.box(M.steel, c, 0, 30.1, 0.04, 1.3, 0.04);
    tb.box(M.black, c, 0.04, 28.75, 1.4, 0.01, 0.22);
  }
  tb.done();
  const tl: THREE.PointLight[] = [];
  for (const x of [-14, 14]) {
    const l = new THREE.PointLight(0xfff4dc, 0, 20, 1.3);
    l.position.set(x, 2.2, 30.1);
    train.add(l);
    tl.push(l);
  }
  const tdoors: Leaf[] = [];
  for (const c of DOORS)
    for (const dir of [-1, 1]) {
      const m = bx(M.orange, c + dir * 0.35, 0, 28.63, 0.7, 1.4, 0.07);
      const w = bx(M.win, c + dir * 0.35, 0.75, 28.59, 0.4, 0.5, 0.02);
      train.add(m, w);
      tdoors.push({
        ps: [
          { m, x0: m.position.x },
          { m: w, x0: w.position.x },
        ],
        dir,
        w: 0.7,
        c,
      });
    }
  // ---- platform screen doors (south) ----
  const psd: Leaf[] = [];
  for (const c of DOORS)
    for (const dir of [-1, 1]) {
      const gl = bx(M.glass, c + dir * 0.5, 0, 28, 1.0, 2.4, 0.04);
      const fr = bx(M.steel, c + dir * 0.03, 0, 28, 0.06, 2.4, 0.06);
      const st = bx(M.orange, c + dir * 0.5, 1.1, 28.03, 1.0, 0.08, 0.02);
      g.add(gl, fr, st);
      psd.push({ ps: [gl, fr, st].map(m => ({ m, x0: m.position.x })), dir, w: 0.95, c });
    }
  // ---- gate paddles + LEDs + card readers ----
  const paddles: Dyn['paddles'] = [];
  for (let j = 0; j < CABS.length - 1; j++) {
    const a = CABS[j] + 0.15,
      e = CABS[j + 1] - 0.15,
      L = (e - a) / 2 - 0.03;
    for (const [hx, dir] of [
      [a, 1],
      [e, -1],
    ] as const) {
      const piv = new THREE.Group();
      piv.position.set(hx, 0.35, 4);
      const p = new THREE.Mesh(BOX, M.paddle);
      p.scale.set(L, 0.55, 0.03);
      p.position.set((dir * L) / 2, 0.275, 0);
      piv.add(p);
      g.add(piv);
      paddles.push({ m: piv, dir, lane: j, cx: (CABS[j] + CABS[j + 1]) / 2, rot: 0 });
    }
  }
  const leds: THREE.Mesh[] = [];
  for (const x of CABS) {
    for (const [z, ry] of [
      [3.09, Math.PI],
      [4.91, 0],
    ] as const) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.18), LED.off);
      l.position.set(x, 0.75, z);
      l.rotation.y = ry;
      g.add(l);
      leds.push(l);
    }
    for (const z of [3.4, 4.6]) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshBasicMaterial({ map: cardTex() }));
      r.rotation.x = -Math.PI / 2;
      r.position.set(x, 1.03, z);
      g.add(r);
    }
  }
  // wide accessible gate marker (our own simple wheel pictogram on the floor)
  {
    const t = tex('acc', () =>
      canvasTex(64, 64, c => {
        c.fillStyle = '#1f5a3a';
        c.fillRect(0, 0, 64, 64);
        c.strokeStyle = '#fff';
        c.lineWidth = 5;
        c.beginPath();
        c.arc(30, 40, 14, 0, 7);
        c.stroke();
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(30, 14, 6, 0, 7);
        c.fill();
        c.fillRect(27, 20, 6, 18);
      }),
    );
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: t }));
    f.rotation.x = -Math.PI / 2;
    f.position.set(-9.2, 0.02, 2.6);
    g.add(f);
  }
  // ---- flood gates (down = closed while the power is out; sunk into the trackbed while trains run) ----
  const flood: Dyn['flood'] = [];
  const maint: Dyn['maint'] = [];
  for (const sx of [-1, 1]) {
    const fg = new THREE.Group();
    fg.add(bx(M.flood, sx * 46.5, 0, 29.65, 0.4, 2.6, 6.3));
    for (let k = 0; k < 3; k++) fg.add(bx(M.steel, sx * 46.5 - sx * 0.22, 0.4 + k * 0.8, 29.65, 0.04, 0.1, 6.3));
    const hp = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 2.1),
      new THREE.MeshBasicMaterial({ map: hazTex(), side: 2 }),
    );
    hp.position.set(sx * 46.5 - sx * 0.25, 1.3, 29.65);
    hp.rotation.y = Math.PI / 2;
    fg.add(hp);
    g.add(fg);
    flood.push({ m: fg, y0: 0 });
    // maintenance gate leaf, hinged at z = 26.5
    const mg = new THREE.Group();
    mg.position.set(sx * 34, 0, 26.5);
    const leaf = bx(M.steel, 0, 0.1, 0.75, 0.05, 1.0, 1.4);
    const bar = bx(M.yellow, 0, 0.6, 0.75, 0.07, 0.08, 1.4);
    const sg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.33),
      new THREE.MeshBasicMaterial({ map: maintTex(), side: 2 }),
    );
    sg.position.set(-sx * 0.05, 0.85, 0.75);
    sg.rotation.y = Math.PI / 2;
    mg.add(leaf, bar, sg);
    g.add(mg);
    maint.push({ m: mg, sx });
  }
  // ---- live departure board ----
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 96;
  const btex = new THREE.CanvasTexture(cv);
  btex.colorSpace = THREE.SRGBColorSpace;
  const D: Dyn = {
    i,
    train,
    tdoors,
    psd,
    paddles,
    leds,
    flood,
    maint,
    board: { ctx: cv.getContext('2d')!, tex: btex, txt: '' },
    tl,
    phase: '',
  };
  DYN.push(D);
  return D;
}

/** v22.2 deterministic day-1 timetable (same for every player: driven by the shared game clock).
 * Cycle 12 game-min per station, offset 3 min per station: arrive (2), doors open (0.4), dwell, close (0.4),
 * depart into the east tunnel (2), empty track. */
export const SVC_CYCLE = 12;
export type Svc = {
  phase: 'in' | 'opening' | 'open' | 'closing' | 'out' | 'none';
  x: number;
  doors: number;
  next: number;
};
export function svc(i: number, gm: number): Svc {
  const p = (((gm + i * 3) % SVC_CYCLE) + SVC_CYCLE) % SVC_CYCLE;
  if (p < 2) return { phase: 'in', x: -80 * (1 - p / 2) ** 2, doors: 0, next: 0 };
  if (p < 2.4) return { phase: 'opening', x: 0, doors: (p - 2) / 0.4, next: 0 };
  if (p < 6) return { phase: 'open', x: 0, doors: 1, next: 0 };
  if (p < 6.4) return { phase: 'closing', x: 0, doors: 1 - (p - 6) / 0.4, next: 0 };
  if (p < 8.4) return { phase: 'out', x: 80 * ((p - 6.4) / 2) ** 2, doors: 0, next: SVC_CYCLE - p };
  return { phase: 'none', x: 999, doors: 0, next: SVC_CYCLE - p };
}
/** the next station along the line for the departure boards */
export const nextStation = (i: number) => STATIONS[(i + 1) % STATIONS.length].name;

let AC: AudioContext | null = null;
export const metroStats = { chimes: 0, power: null as boolean | null };
/** two-tone door chime (ours: a falling major third on open, falling fourth on close) */
function chime(open: boolean) {
  metroStats.chimes++;
  try {
    AC ||= new AudioContext();
    if (AC.state === 'suspended') AC.resume();
    const n = AC.currentTime;
    (open ? [784, 622] : [698, 523]).forEach((f, k) => {
      const o = AC!.createOscillator(),
        gn = AC!.createGain(),
        t0 = n + k * 0.32;
      o.type = 'sine';
      o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      o.connect(gn).connect(AC!.destination);
      o.start(t0);
      o.stop(t0 + 0.7);
    });
  } catch {
    /* audio unavailable */
  }
}

function setPower(on: boolean) {
  metroStats.power = on;
  M.tlamp.color.set(on ? 0xfff1c8 : 0x34332e);
  M.sigG.color.set(on ? 0x2aff6a : 0x123018);
  M.sigR.color.set(on ? 0x5a1410 : 0x5a1410);
  M.lamp.color.set(on ? 0xfff1c8 : 0x3a3a34);
}
function applySegs(st: SegState, on: boolean) {
  if (!DEPS || st.on === on) return;
  const { addSeg, removeSeg } = DEPS;
  if (on) {
    if (st.on === false) st.jam.forEach(removeSeg);
    st.maint.forEach(s => addSeg(s, true));
    addSeg(st.gap, true);
  } else {
    if (st.on === true) (st.maint.forEach(removeSeg), removeSeg(st.gap));
    st.jam.forEach(s => addSeg(s, true));
  }
  st.on = on;
}
function drawBoard(D: Dyn, txt: string, l2: string, warn: boolean) {
  if (D.board.txt === txt + l2) return;
  D.board.txt = txt + l2;
  const c = D.board.ctx;
  c.fillStyle = '#0a0a0a';
  c.fillRect(0, 0, 512, 96);
  c.font = '600 34px monospace';
  c.textBaseline = 'middle';
  c.fillStyle = warn ? '#e44' : '#ff8a2a';
  c.fillText(txt, 16, 30);
  c.fillStyle = warn ? '#e44' : '#7fdc8a';
  c.font = '600 26px monospace';
  c.fillText(l2, 16, 72);
  D.board.tex.needsUpdate = true;
}

/** per-frame: emergency-light flicker (power out), gates, screen doors, the day-1 trains and the boards */
export function metroTick(t: number, gm = 0, power = false, px = 0, pz = 0) {
  showOnly(px, pz);
  for (const L of lights) {
    const f = Math.sin(t * 13 + L.ph) * Math.sin(t * 3.1 + L.ph * 2);
    L.l.intensity = power ? L.base * 1.3 : L.base * (f > 0.93 ? 0.15 : 0.85 + 0.15 * Math.sin(t * 40 + L.ph));
  }
  if (metroStats.power !== power) setPower(power);
  retailTick(power);
  SEGS.forEach(s => applySegs(s, power));
  for (const D of DYN) {
    const [OX, OZ] = OXZ(D.i);
    const lx = px - OX,
      lz = pz - OZ;
    const here = Math.abs(lx) < 60 && lz > -12 && lz < 40;
    const v: Svc = power ? svc(D.i, gm) : { phase: 'open', x: 0, doors: 1, next: 0 };
    D.train.visible = v.phase !== 'none';
    D.train.position.x = v.x;
    D.tl.forEach(l => (l.intensity = power && D.train.visible ? 7 : 0));
    // doors: in service all pairs move together; parked (power out) only the middle pair is jammed open
    const op = (c: number) => (power ? v.doors : c === 0 ? 1 : 0);
    for (const lf of [...D.tdoors, ...D.psd]) for (const p of lf.ps) p.m.position.x = p.x0 + lf.dir * lf.w * op(lf.c);
    if (power && here && D.phase && D.phase !== v.phase) {
      const op0 = D.phase === 'opening' || D.phase === 'open',
        op1 = v.phase === 'opening' || v.phase === 'open';
      if (op0 !== op1) chime(op1);
    }
    D.phase = v.phase;
    // gates: powered → paddles swing open for whoever walks up; dead → middle lanes jammed shut
    for (const p of D.paddles) {
      const jam = p.lane >= 3 && p.lane <= 8;
      const want = power ? Math.abs(lx - p.cx) < 0.9 && Math.abs(lz - 4) < 1.6 : !jam;
      p.rot += ((want ? -p.dir * 1.45 : 0) - p.rot) * 0.2;
      p.m.rotation.y = p.rot;
    }
    D.leds.forEach((l, k) => {
      const lane = Math.floor(k / 2);
      l.material = power ? LED.go : lane >= 3 && lane <= 8 && k % 2 === 0 ? LED.x : LED.off;
    });
    for (const f of D.flood) f.m.position.y = power ? -3.4 : 0;
    for (const m of D.maint) m.m.rotation.y = power ? 0 : m.sx * 1.2;
    const nx = nextStation(D.i);
    if (!power) drawBoard(D, '往 －－　－－:－－', '全線停駛　請勿進入軌道', true);
    else if (v.phase === 'in') drawBoard(D, `往 ${nx}　列車進站`, '請退至黃線後方', false);
    else if (v.phase === 'opening' || v.phase === 'open') drawBoard(D, `往 ${nx}　請上車`, `${LINE}　按 E 搭乘`, false);
    else if (v.phase === 'closing') drawBoard(D, `往 ${nx}　車門關閉`, '請勿強行上下車', false);
    else drawBoard(D, `往 ${nx}　${Math.max(1, Math.ceil(v.next - 0.01))} 分`, `下一班列車　${LINE}`, false);
  }
}

// ===== v22.3 in-station retail (all fictional brands): convenience store, pharmacy, bakery/coffee kiosk,
// phone-accessory/flower kiosk, vending machines and coin lockers. Day 1: lit, staffed, buy with the wallet;
// after the power cut: shutters half down, shelves looted, dead machines that can be pried open. =====
export type ShopKind = 'cvs' | 'pharm' | 'bakery' | 'flower' | 'vdrink' | 'vsnack' | 'vumb' | 'locker';
export type Shop = { id: string; kind: ShopKind; name: string; p: V2; stock: [string, number][]; vend: boolean };
const SHOP_DEF: { kind: ShopKind; name: string; x: number; z: number; stock: [string, number][] }[] = [
  {
    kind: 'cvs',
    name: '巷口便利站',
    x: -20,
    z: -0.9,
    stock: [
      ['rice', 35],
      ['bento', 85],
      ['egg', 15],
      ['oden', 40],
      ['noodle', 45],
      ['water', 20],
      ['tea', 25],
      ['coffee', 35],
      ['battery', 60],
      ['tissue', 30],
      ['umbrella', 150],
    ],
  },
  {
    kind: 'pharm',
    name: '安心藥局',
    x: 20,
    z: -0.9,
    stock: [
      ['bandage', 60],
      ['pill', 120],
      ['medkit', 450],
      ['mask', 80],
      ['tissue', 30],
      ['sport', 25],
    ],
  },
  {
    kind: 'bakery',
    name: '橘子烘焙・咖啡',
    x: -5,
    z: 8.3,
    stock: [
      ['bread', 35],
      ['pineapple', 40],
      ['coffee', 55],
      ['soymilk', 30],
      ['milktea', 60],
    ],
  },
  {
    kind: 'flower',
    name: '小巷花坊・手機配件',
    x: 5,
    z: 8.3,
    stock: [
      ['powerbank', 590],
      ['battery', 60],
      ['umbrella', 150],
    ],
  },
  {
    kind: 'vdrink',
    name: '飲料販賣機',
    x: 10.2,
    z: -4.5,
    stock: [
      ['water', 20],
      ['tea', 25],
      ['sport', 25],
      ['coffee', 30],
    ],
  },
  {
    kind: 'vdrink',
    name: '飲料販賣機',
    x: 11.4,
    z: -4.5,
    stock: [
      ['water', 20],
      ['soymilk', 25],
      ['milktea', 35],
    ],
  },
  {
    kind: 'vsnack',
    name: '零食販賣機',
    x: 12.6,
    z: -4.5,
    stock: [
      ['snack', 30],
      ['pineapple', 35],
      ['cupnoodle', 40],
    ],
  },
  {
    kind: 'vumb',
    name: '雨傘・口罩販賣機',
    x: 13.8,
    z: -4.5,
    stock: [
      ['umbrella', 199],
      ['mask', 80],
    ],
  },
  {
    kind: 'vdrink',
    name: '飲料販賣機',
    x: -1.2,
    z: 10.5,
    stock: [
      ['water', 20],
      ['tea', 25],
      ['sport', 25],
    ],
  },
  {
    kind: 'vsnack',
    name: '零食販賣機',
    x: 0,
    z: 10.5,
    stock: [
      ['snack', 30],
      ['cupnoodle', 40],
    ],
  },
  { kind: 'locker', name: '投幣置物櫃', x: 22.7, z: 7.1, stock: [] },
];
export function stationShops(i: number): Shop[] {
  const [OX, OZ] = OXZ(i);
  return SHOP_DEF.map((d, k) => ({
    id: `s${i}:${k}`,
    kind: d.kind,
    name: translateLabel(d.name),
    p: [OX + d.x, OZ + d.z] as V2,
    stock: d.stock,
    vend: d.kind[0] === 'v' || d.kind === 'locker',
  }));
}
/** deterministic loot from a pried machine / locker (same for every player) */
export function pryLoot(s: Shop): Record<string, number> {
  let h = 7;
  for (const ch of s.id) h = (h * 31 + ch.charCodeAt(0)) % 2147483647;
  const r = prng(h + 99);
  const out: Record<string, number> = {};
  const pool =
    s.kind === 'locker'
      ? ['cig', 'battery', 'cloth', 'bandage', 'powerbank', 'scrap', 'pill', 'umbrella', 'can']
      : s.stock.map(x => x[0]);
  const n = s.kind === 'locker' ? 1 + Math.floor(r() * 3) : 2 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const it = pool[Math.floor(r() * pool.length)];
    out[it] = (out[it] || 0) + 1;
  }
  return out;
}
const R_ = {
  vendLit: new THREE.MeshBasicMaterial({ color: 0xf4fbff }),
  fridgeLit: new THREE.MeshBasicMaterial({ color: 0xdff4ff }),
  shopLit: new THREE.MeshBasicMaterial({ color: 0xfff6dc }),
  skin: std(0xd9b89a),
  apronO: std(0xe8681c),
  apronG: std(0x1f5a3a),
  pants: std(0x2a2c30),
  shutter: std(0x9aa0a6, { metalness: 0.5, roughness: 0.5 }),
  vbodyO: std(0xd95a14, { roughness: 0.5 }),
  vbodyG: std(0x2a6a48, { roughness: 0.5 }),
  vbodyB: std(0x3a5a8a, { roughness: 0.5 }),
};
const GOODS = [0xe8681c, 0x2f7a52, 0xc62a1e, 0xf5c400, 0x3a5a8a, 0xf4f4f0, 0x8a3a8a, 0x3aa0c0].map(c => std(c));
const signTex = (t: string, bg: string, fg: string) =>
  tex('sg' + t, () =>
    canvasTex(512, 80, c => {
      c.fillStyle = bg;
      c.fillRect(0, 0, 512, 80);
      c.fillStyle = fg;
      c.font = '800 46px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(t, 256, 42);
    }),
  );
const shutterTex = () =>
  tex('shut', () =>
    canvasTex(
      128,
      128,
      c => {
        for (let y = 0; y < 128; y += 8) {
          c.fillStyle = y % 16 ? '#8c9298' : '#a9afb5';
          c.fillRect(0, y, 128, 8);
        }
        c.fillStyle = '#c62a1e';
        c.font = '800 20px sans-serif';
        c.textAlign = 'center';
        c.fillText('暫停營業', 64, 70);
      },
      false,
    ),
  );
type RDyn = {
  i: number;
  on: THREE.Group;
  off: THREE.Group;
  shutters: { m: THREE.Object3D; up: number; half: number }[];
  lights: THREE.PointLight[];
  fronts: Map<string, THREE.Object3D>;
};
const RDYN: RDyn[] = [];
let PRIED: Set<string> = new Set();
export const setPried = (s: Set<string>) => (PRIED = s);

/** a faceless bald clerk */
function clerk(apron: THREE.Material, x: number, z: number, ry: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  const legs = bx(R_.pants, 0, 0, 0, 0.36, 0.8, 0.22);
  const body = bx(apron, 0, 0.8, 0, 0.46, 0.62, 0.28);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), R_.skin);
  head.position.y = 1.62;
  const arms = bx(R_.skin, 0, 0.95, 0.05, 0.62, 0.12, 0.14);
  g.add(legs, body, head, arms);
  return g;
}

/** static + live retail geometry for one station */
function buildRetail(g: THREE.Group, b: Builder, i: number) {
  const r = prng(7000 + i * 53);
  const on = new THREE.Group(),
    off = new THREE.Group();
  g.add(on, off);
  const bOn = new Builder(on),
    bOff = new Builder(off);
  const goods = (bb: Builder, x: number, y: number, z: number, len: number, along: 'x' | 'z', fill: number) => {
    for (let u = -len / 2 + 0.1; u < len / 2; u += 0.16) {
      if (r() > fill) continue;
      const m = GOODS[Math.floor(r() * GOODS.length)];
      const h = 0.12 + r() * 0.14;
      if (along === 'x') bb.box(m, x + u, y, z, 0.12, h, 0.22);
      else bb.box(m, x, y, z + u, 0.22, h, 0.12);
    }
  };
  const fallen = (x: number, z: number, n: number) => {
    for (let k = 0; k < n; k++)
      bOff.box(GOODS[k % GOODS.length], x + (r() - 0.5) * 2.4, 0, z + (r() - 0.5) * 2.4, 0.2, 0.08, 0.14, r() * 3);
  };
  const shutters: RDyn['shutters'] = [];
  const shutter = (x: number, z: number, w: number, ry: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 1.5),
      new THREE.MeshStandardMaterial({ map: shutterTex(), side: 2 }),
    );
    m.position.set(x, 3.4, z);
    m.rotation.y = ry;
    g.add(m);
    shutters.push({ m, up: 3.4, half: 1.95 });
  };
  const lights: THREE.PointLight[] = [];
  const lamp = (x: number, z: number) => {
    const l = new THREE.PointLight(0xfff2d8, 0, 9, 1.4);
    l.position.set(x, 2.4, z);
    g.add(l);
    lights.push(l);
  };
  // --- walk-in shops on both sides of the unpaid area (convenience store west, pharmacy east) ---
  for (const sx of [-1, 1]) {
    const X = (v: number) => sx * v;
    const cvs = sx < 0;
    b.box(M.wall, X(21.2), 0, -3, 5.2, 2.8, 0.2);
    b.box(M.wall, X(21.2), 0, 3, 5.2, 1.0, 0.2);
    b.floor(stoneTex(), X(21.2), 0, 5.2, 6);
    // glass shop front with a door gap z∈[-0.6,0.8], fascia sign above
    b.box(M.glass, X(18.6), 0, -1.8, 0.05, 2.6, 2.4);
    b.box(M.glass, X(18.6), 0, 1.9, 0.05, 2.6, 2.2);
    b.box(M.steel, X(18.6), 0, -0.6, 0.08, 2.6, 0.08);
    b.box(M.steel, X(18.6), 0, 0.8, 0.08, 2.6, 0.08);
    b.box(cvs ? M.orange : M.green, X(18.6), 2.6, 0, 0.25, 0.5, 6.1);
    b.plane(
      cvs ? signTex('巷口便利站', '#ffffff', '#e8681c') : signTex('安心藥局', '#1f5a3a', '#ffffff'),
      X(18.45),
      2.85,
      0,
      4.2,
      0.6,
      (sx * Math.PI) / 2,
    );
    b.box(cvs ? M.orange : M.green, X(18.4), 0.004, 0.1, 0.6, 0.01, 1.4); // door mat
    // wall fridges (cvs) / medicine wall (pharmacy) on the back wall
    b.box(M.steel, X(23.4), 0, 0, 0.7, 2.2, 5.6);
    b.box(cvs ? R_.fridgeLit : R_.shopLit, X(23.04), 0.2, 0, 0.02, 1.8, 5.4);
    bOff.box(M.dark, X(23.03), 0.2, 0, 0.02, 1.8, 5.4);
    for (let s = 0; s < 4; s++) {
      b.box(M.steel, X(23.1), 0.3 + s * 0.45, 0, 0.5, 0.03, 5.4);
      goods(bOn, X(23.0), 0.33 + s * 0.45, 0, 5.2, 'z', 0.95);
      goods(bOff, X(23.0), 0.33 + s * 0.45, 0, 5.2, 'z', 0.12);
    }
    for (let k = -2; k <= 2; k++) b.box(M.steel, X(23.05), 0.2, k * 1.1, 0.04, 1.8, 0.04); // fridge door frames
    // gondola shelves (two rows)
    for (const gx of [22.0, 20.8]) {
      b.box(M.steel, X(gx), 0, 1.0, 0.6, 1.5, 2.8);
      for (let s = 0; s < 3; s++) {
        b.box(M.white, X(gx), 0.2 + s * 0.45, 1.0, 0.7, 0.03, 2.8);
        for (const f of [-0.25, 0.25]) {
          goods(bOn, X(gx) + f, 0.23 + s * 0.45, 1.0, 2.6, 'z', 0.9);
          goods(bOff, X(gx) + f, 0.23 + s * 0.45, 1.0, 2.6, 'z', 0.1);
        }
      }
    }
    // counter + till; hot-food case (cvs) / dispensary glass (pharmacy)
    b.box(cvs ? M.orange : M.green, X(20), 0, -1.6, 2.4, 1.0, 0.7);
    b.box(M.white, X(20), 1.0, -1.6, 2.5, 0.04, 0.8);
    b.box(M.black, X(19.3), 1.04, -1.6, 0.35, 0.25, 0.3);
    b.box(M.glass, X(20.5), 1.04, -1.6, 1.0, 0.5, 0.6);
    b.box(R_.shopLit, X(20.5), 1.05, -1.6, 0.9, 0.02, 0.5);
    if (cvs)
      for (let k = 0; k < 6; k++) bOn.box(k % 2 ? M.card : M.yellow, X(20.15 + k * 0.13), 1.08, -1.6, 0.1, 0.1, 0.1);
    b.box(M.steel, X(21.2), 0, -2.75, 4.6, 1.8, 0.35); // back shelf (cigarettes-style rack / medicine rack)
    goods(bOn, X(21.2), 1.82, -2.75, 4.4, 'x', 0.9);
    on.add(clerk(cvs ? R_.apronO : R_.apronG, X(20), -2.25, 0));
    fallen(X(21), 0.5, 14);
    lamp(X(21), 0);
    b.box(M.lamp, X(21.2), 2.75, 0, 3, 0.04, 0.3);
    shutter(X(18.5), 0, 6, Math.PI / 2);
  }
  // --- kiosks in the paid area: bakery/coffee (west), phone accessories + flowers (east) ---
  for (const [kx, bake] of [
    [-5, true],
    [5, false],
  ] as const) {
    b.box(bake ? M.wood : M.green, kx, 0, 9.3, 3.2, 1.0, 0.8);
    b.box(M.white, kx, 1.0, 9.3, 3.3, 0.04, 0.9);
    b.box(M.glass, kx - 0.6, 1.04, 9.3, 1.6, 0.45, 0.7);
    b.box(R_.shopLit, kx - 0.6, 1.05, 9.3, 1.5, 0.02, 0.6);
    b.box(M.dark, kx, 0, 11.3, 3.4, 2.4, 0.3); // back panel
    b.box(bake ? M.orange : M.green, kx, 2.4, 11.3, 3.4, 0.4, 0.35);
    b.plane(
      bake ? signTex('橘子烘焙・咖啡', '#e8681c', '#ffffff') : signTex('小巷花坊・手機配件', '#1f5a3a', '#ffffff'),
      kx,
      2.6,
      11.12,
      3.3,
      0.5,
      Math.PI,
    );
    b.box(M.steel, kx, 0, 11.0, 3.2, 1.2, 0.3);
    if (bake) {
      for (let k = 0; k < 8; k++) bOn.box(M.card, kx - 1.2 + k * 0.17, 1.08, 9.3, 0.14, 0.08, 0.2);
      b.box(M.black, kx + 1.0, 1.04, 9.4, 0.5, 0.55, 0.45); // coffee machine
      b.box(M.steel, kx + 1.0, 1.4, 9.15, 0.4, 0.1, 0.05);
      goods(bOn, kx, 1.22, 11.0, 3.0, 'x', 0.8);
    } else {
      // flower buckets + phone cases on a pegboard
      for (let k = 0; k < 5; k++) {
        b.box(M.steel, kx - 1.4 + k * 0.32, 0, 8.6, 0.26, 0.35, 0.26);
        bOn.box(GOODS[k % 4], kx - 1.4 + k * 0.32, 0.35, 8.6, 0.3, 0.3, 0.3);
        bOff.box(M.dark, kx - 1.4 + k * 0.32, 0.35, 8.6, 0.22, 0.12, 0.22);
      }
      for (let k = 0; k < 10; k++)
        bOn.box(GOODS[(k + 3) % 8], kx - 1.3 + (k % 5) * 0.6, 1.4 + Math.floor(k / 5) * 0.45, 11.13, 0.2, 0.35, 0.03);
    }
    on.add(clerk(bake ? R_.apronO : R_.apronG, kx, 10.35, Math.PI));
    fallen(kx, 9.3, 5);
    lamp(kx, 9.6);
    shutter(kx, 8.88, 3.3, 0);
  }
  // --- vending machines ---
  const fronts = new Map<string, THREE.Object3D>();
  SHOP_DEF.forEach((d, k) => {
    if (d.kind[0] !== 'v') return;
    const face = d.z < 0 ? 1 : -1; // facing +z on the north wall, -z on the south wall
    const zc = d.z - face * 0.55;
    const body = d.kind === 'vdrink' ? (k % 2 ? R_.vbodyG : R_.vbodyO) : d.kind === 'vsnack' ? R_.vbodyB : R_.vbodyG;
    b.box(body, d.x, 0, zc, 1.0, 1.85, 0.75);
    b.box(R_.vendLit, d.x, 1.5, zc + face * 0.38, 0.8, 0.22, 0.01); // lit header panel
    b.box(M.black, d.x, 0.15, zc + face * 0.38, 0.6, 0.22, 0.02); // dispense slot
    b.box(M.black, d.x + 0.38, 0.75, zc + face * 0.38, 0.1, 0.4, 0.02); // coin / card panel
    // front glass door (opens when pried) with bottle rows behind
    const fr = bx(M.glass, 0, 0, 0, 0.72, 1.0, 0.03);
    const piv = new THREE.Group();
    piv.position.set(d.x - 0.42, 0.42, zc + face * 0.39);
    fr.position.set(0.36, 0.5, 0);
    piv.add(fr);
    g.add(piv);
    fronts.set(`s${i}:${k}`, piv);
    b.box(R_.vendLit, d.x - 0.06, 0.42, zc + face * 0.33, 0.7, 1.0, 0.01);
    for (let row = 0; row < 3; row++)
      for (let c = 0; c < 6; c++)
        b.box(GOODS[(row * 3 + c + k) % 8], d.x - 0.36 + c * 0.12, 0.5 + row * 0.33, zc + face * 0.3, 0.07, 0.2, 0.07);
    for (let c = 0; c < 6; c++) b.box(M.lampOn, d.x - 0.36 + c * 0.12, 0.47, zc + face * 0.36, 0.05, 0.02, 0.02);
    if (d.kind === 'vumb')
      b.plane(
        signTex('雨傘・口罩', '#3a5a8a', '#fff'),
        d.x,
        1.62,
        zc + face * 0.385,
        0.8,
        0.13,
        face > 0 ? 0 : Math.PI,
      );
  });
  // lockers: coin slots + little lit number panels
  for (let a = 0; a < 3; a++)
    for (let c = 0; c < 4; c++) b.box(R_.vendLit, 23.24, 0.42 + a * 0.6, 6 + c * 0.55, 0.01, 0.06, 0.12);
  bOn.done();
  bOff.done();
  RDYN.push({ i, on, off, shutters, lights, fronts });
}

function retailTick(power: boolean) {
  R_.vendLit.color.set(power ? 0xf4fbff : 0x1c1e20);
  R_.fridgeLit.color.set(power ? 0xdff4ff : 0x1a1c1e);
  R_.shopLit.color.set(power ? 0xfff6dc : 0x1c1c1a);
  for (const D of RDYN) {
    D.on.visible = power;
    D.off.visible = !power;
    for (const s of D.shutters) s.m.position.y = power ? s.up : s.half;
    D.lights.forEach(l => (l.intensity = power ? 5 : 0));
    for (const [id, f] of D.fronts) f.rotation.y = PRIED.has(id) ? -1.3 : 0;
  }
}
