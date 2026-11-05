import { tr } from '../i18n';
// Playable roles (fictional people). Each has a male/female faceless 白面人 outfit, spawn, destination, skills and starting pack.
export type Skills = {
  medic?: number;
  repair?: number;
  lockpick?: boolean;
  ride?: number;
  streets?: boolean;
  carry?: number;
  /** sleep recovery multiplier: fatigue (the 精神 bar) recovers this many times faster while sleeping */
  rest?: number;
};
export type Role = {
  id: string;
  name: string;
  age: [number, number];
  names: [string, string];
  blurb: string;
  spawn: 'home' | 'hospital' | 'scooter';
  dest: 'school' | 'office' | 'hospital' | 'delivery' | 'site';
  destLabel: string;
  skills: Skills;
  inv: Record<string, number>;
  look: { m: any; f: any };
  perks: string[];
};
const L = (top: number, bottom: number, o: any = {}) => ({ hair: 0x1a1410, top, bottom, shoes: 0xe8e8e8, ...o });
export const ROLES: Role[] = [
  {
    id: 'office',
    name: tr('上班族', 'Office worker'),
    age: [31, 29],
    names: [tr('志偉', 'Zhiwei'), tr('雅婷', 'Yating')],
    blurb: tr('每天搭捷運到西門町的辦公大樓上班', 'Takes the MRT to an office building in Ximending every day.'),
    spawn: 'home',
    dest: 'office',
    destLabel: tr('公司（辦公大樓）', 'Workplace (office building)'),
    skills: { carry: 1 },
    inv: { coffee: 1, water: 1, noodle: 1 },
    perks: [tr('背包正常', 'Standard backpack'), tr('起點：自家', 'Starts at home')],
    look: {
      m: L(0xeef0f4, 0x262a34, { jacket: 0x262a34, shoes: 0x111111 }),
      f: L(0xf2eee6, 0x3a3f4a, { jacket: 0x3a3f4a, shoes: 0x111111 }),
    },
  },
  {
    id: 'student',
    name: tr('學生', 'Student'),
    age: [17, 16],
    names: [tr('冠宇', 'Guanyu'), tr('欣妤', 'Xinyu')],
    blurb: tr('高中生，早上騎腳踏車去學校', 'A high school student who cycles to school each morning.'),
    spawn: 'home',
    dest: 'school',
    destLabel: tr('學校', 'School'),
    skills: { carry: 1.1, rest: 1.5 },
    inv: { snack: 2, sport: 1, water: 1 },
    perks: [tr('體力恢復快', 'Faster recovery'), tr('背包稍大（書包）', 'Slightly larger backpack (schoolbag)')],
    look: { m: L(0xf6f6f6, 0x1e2a50, { shoes: 0x222222 }), f: L(0xf6f6f6, 0x1e2a50, { shoes: 0x222222 }) },
  },
  {
    id: 'courier',
    name: tr('外送員', 'Delivery rider'),
    age: [32, 26],
    names: [tr('阿明', 'A-Ming'), tr('佳琪', 'Jiaqi')],
    blurb: tr(
      '機車就停在巷口，閉著眼都認得萬華的巷子',
      "Your scooter is parked at the alley entrance. You know Wanhua's lanes by heart.",
    ),
    spawn: 'scooter',
    dest: 'delivery',
    destLabel: tr('外送取餐點', 'Delivery pickup point'),
    skills: { ride: 1.25, streets: true, carry: 0.75 },
    inv: { water: 1, cupnoodle: 1, knife: 1 },
    perks: [
      tr('熟悉街道（地圖全開）', 'Knows the streets (full map revealed)'),
      tr('騎車更快', 'Faster riding'),
      tr('背包小', 'Small backpack'),
    ],
    look: { m: L(0x3a7a5a, 0x2a2a30, { jacket: 0x2f6a4c }), f: L(0x3a7a5a, 0x2a2a30, { jacket: 0x2f6a4c }) },
  },
  {
    id: 'nurse',
    name: tr('護理師', 'Nurse'),
    age: [29, 27],
    names: [tr('柏翰', 'Bohan'), tr('小雯', 'Xiaowen')],
    blurb: tr('值完夜班在醫院宿舍醒來', 'Wakes up in the hospital dorm after a night shift.'),
    spawn: 'hospital',
    dest: 'hospital',
    destLabel: tr('醫院急診', 'Hospital emergency room'),
    skills: { medic: 2 },
    inv: { bandage: 4, pill: 2, medkit: 1, water: 1 },
    perks: [
      tr('醫療技能：包紮效果加倍', 'Medical skill: double bandage effectiveness'),
      tr('起點：醫院宿舍', 'Starts at the hospital dorm'),
    ],
    look: { m: L(0x5a9ab0, 0x5a9ab0, { shoes: 0xf4f4f4 }), f: L(0xd890a8, 0xd890a8, { shoes: 0xf4f4f4 }) },
  },
  {
    id: 'tech',
    name: tr('水電師傅', 'Maintenance technician'),
    age: [45, 41],
    names: [tr('阿財', 'A-Cai'), tr('淑芬', 'Shufen')],
    blurb: tr(
      '修電修水、開鎖接線都會，今天要去工地',
      'Skilled in plumbing, wiring, lockpicking and hot-wiring. Heading to a worksite today.',
    ),
    spawn: 'home',
    dest: 'site',
    destLabel: tr('工地', 'Construction site'),
    skills: { repair: 2, lockpick: true },
    inv: { hammer: 1, pipe: 1, plank: 2, water: 1 },
    perks: [
      tr('修理：無線電只需 1 顆電池', 'Repair: radios need only 1 battery'),
      tr('開鎖／接線發動', 'Lockpicking / hot-wiring'),
      tr('工具箱', 'Toolbox'),
    ],
    look: { m: L(0x5a6a7a, 0x3a4048), f: L(0x6a7a8a, 0x3a4048) },
  },
  // v24.4 a Japanese resident of Wanhua (fictional): knows where the JSDF liaison is hiding from the start
  {
    id: 'jp',
    name: tr('日籍駐在員', 'Japanese expat engineer'),
    age: [36, 33],
    names: [tr('佐藤健太', 'Kenta Sato'), tr('高木美咲', 'Misaki Takagi')],
    blurb: tr(
      '日商公司派駐台北的工程師，在萬華住了五年，台語聽得懂一點',
      'An engineer posted to Taipei by a Japanese company; five years in Wanhua, understands a little Taiwanese.',
    ),
    spawn: 'home',
    dest: 'office',
    destLabel: tr('公司（辦公大樓）', 'Workplace (office building)'),
    skills: { carry: 1 },
    inv: { cracker: 1, water: 1, battery: 1 },
    perks: [
      tr('會說日語：一開始就知道自衛隊連絡官在哪', 'Speaks Japanese: knows where the JSDF liaison is from the start'),
      tr('多帶一顆電池', 'Carries a spare battery'),
    ],
    look: {
      m: L(0xdfe4e8, 0x2b2f3a, { jacket: 0x4a5260, shoes: 0x1a1a1a }),
      f: L(0xf0ece4, 0x4a4038, { jacket: 0x7a6a58, shoes: 0x2a2220 }),
    },
  },
];
export const roleById = (id?: string) => ROLES.find(r => r.id === id) || ROLES[2];
