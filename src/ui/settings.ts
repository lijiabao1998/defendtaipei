import { tr, getLanguage } from '../i18n';
// v22.4 player settings + key bindings, persisted in localStorage.
export type Quality = 'low' | 'med' | 'high';
export interface Settings {
  master: number;
  sfx: number;
  music: number;
  quality: Quality;
  lang: string;
  sens: number;
  vib: boolean;
  /** v22.7.1 portrait thumb-button size: 0.85 / 1 / 1.1 */
  btn: number;
  /** v23.1 廣播 volume + 廣播語音 on/off */
  radio: number;
  voice: boolean;
}
const SKEY = 'dt.settings';
const KKEY = 'dt.keys';
const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches;
const DEF: Settings = {
  master: 0.8,
  sfx: 1,
  music: 0.7,
  quality: coarse ? 'low' : 'high',
  lang: 'zh-TW',
  sens: 1,
  vib: true,
  btn: 1,
  radio: 0.8,
  voice: true,
};
function load<T>(k: string, d: T): T {
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') };
  } catch {
    return { ...d };
  }
}
export const SET: Settings = load(SKEY, DEF);
SET.lang = getLanguage();
export function saveSettings() {
  localStorage.setItem(SKEY, JSON.stringify(SET));
  applyVolumes();
}
export const QSCALE: Record<Quality, number> = { low: 0.5, med: 0.75, high: 1 };
export const QPIX: Record<Quality, number> = { low: 0.75, med: 1.25, high: 1.5 };

/** rebindable actions; fire = left mouse, menu = Esc are fixed */
export const ACTIONS: [id: string, label: string, def: string][] = [
  ['up', tr('前進', 'Move forward'), 'KeyW'],
  ['down', tr('後退', 'Move backward'), 'KeyS'],
  ['left', tr('向左', 'Move left'), 'KeyA'],
  ['right', tr('向右', 'Move right'), 'KeyD'],
  ['sprint', tr('奔跑（按住）', 'Sprint (hold)'), 'ShiftLeft'],
  ['sneak', tr('潛行／蹲低（切換）', 'Sneak / crouch (toggle)'), 'KeyC'],
  ['cover', tr('掩體', 'Take cover'), 'KeyG'],
  ['interact', tr('搜刮／互動', 'Loot / interact'), 'KeyE'],
  ['vault', tr('翻越矮牆／沙包', 'Vault low walls / sandbags'), 'Space'],
  ['shove', tr('推開', 'Shove'), 'KeyQ'],
  ['inv', tr('背包（I 亦可）', 'Inventory (also I)'), 'Tab'],
  ['map', tr('地圖', 'Map'), 'KeyM'],
  ['shelter', tr('避難所', 'Shelter'), 'KeyH'],
  ['barricade', tr('封門', 'Barricade door'), 'KeyB'],
  ['sleep', tr('睡覺（快轉）', 'Sleep (fast-forward)'), 'KeyZ'],
  ['light', tr('手電筒', 'Flashlight'), 'KeyF'],
  ['speed1', tr('時間 ×1', 'Time ×1'), 'Digit1'],
  ['speed2', tr('時間 ×3', 'Time ×3'), 'Digit2'],
  ['speed3', tr('時間 ×20', 'Time ×20'), 'Digit3'],
];
const KDEF = Object.fromEntries(ACTIONS.map(a => [a[0], a[2]]));
export const BIND: Record<string, string> = load(KKEY, KDEF);
const RESERVED = new Set(['Escape']);
/** key code bound to an action */
export const K = (a: string) => BIND[a];
/** does this key event code trigger the action (Shift either side for sprint, I also opens inventory) */
export function isKey(code: string, a: string) {
  const b = BIND[a];
  if (code === b) return true;
  if (a === 'sprint' && /^Shift/.test(b) && /^Shift/.test(code)) return true;
  if (a === 'inv' && code === 'KeyI' && !Object.values(BIND).includes('KeyI')) return true;
  return false;
}
export function keyName(code: string) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const m: Record<string, string> = {
    Space: tr('空白鍵', 'Space'),
    ShiftLeft: 'Shift',
    ShiftRight: tr('右 Shift', 'Right Shift'),
    ControlLeft: 'Ctrl',
    ControlRight: tr('右 Ctrl', 'Right Ctrl'),
    AltLeft: 'Alt',
    Tab: 'Tab',
    CapsLock: 'Caps',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'Enter',
    Backquote: '`',
  };
  return m[code] || code.replace(/^Numpad/, tr('數字鍵 ', 'Numpad '));
}
export const keyLabel = (a: string) => keyName(BIND[a]);
/** bind; a key already used by another action is swapped onto it so there are never two actions on one key */
export function rebind(a: string, code: string): string | null {
  if (RESERVED.has(code)) return null;
  const other = Object.keys(BIND).find(k => k !== a && BIND[k] === code);
  if (other) BIND[other] = BIND[a];
  BIND[a] = code;
  localStorage.setItem(KKEY, JSON.stringify(BIND));
  return other || null;
}
export function resetKeys() {
  Object.assign(BIND, KDEF);
  localStorage.setItem(KKEY, JSON.stringify(BIND));
}
export function conflicts() {
  const seen = new Map<string, string>();
  const bad: string[] = [];
  for (const [a, c] of Object.entries(BIND)) {
    if (seen.has(c)) bad.push(`${seen.get(c)}/${a}`);
    seen.set(c, a);
  }
  return bad;
}
/** v22.7.1 portrait thumb-button size (CSS var --pbs) */
export const applyBtnSize = () =>
  typeof document !== 'undefined' && document.documentElement.style.setProperty('--pbs', String(SET.btn || 1));
export const vibrate = (ms: number) => SET.vib && navigator.vibrate?.(ms);

// ---- volume: every AudioContext output goes through a per-context gain (music contexts are tagged) ----
const music = new WeakSet<BaseAudioContext>();
const gains = new Map<BaseAudioContext, GainNode>();
const radioCtx = new Set<BaseAudioContext>();
/** v23.1 broadcast context: master × 廣播 */
export const markRadio = (c: BaseAudioContext) => {
  radioCtx.add(c);
  applyVolumes();
};
export const markMusic = (c: BaseAudioContext) => {
  music.add(c);
  applyVolumes();
};
const vol = (c: BaseAudioContext) => SET.master * (radioCtx.has(c) ? SET.radio : music.has(c) ? SET.music : SET.sfx);
export function applyVolumes() {
  gains.forEach((g, c) => (g.gain.value = vol(c)));
}
if (typeof AudioNode !== 'undefined') {
  const orig = AudioNode.prototype.connect as any;
  (AudioNode.prototype as any).connect = function (this: AudioNode, dst: any, ...a: any[]) {
    if (dst instanceof AudioDestinationNode) {
      const c = this.context;
      let g = gains.get(c);
      if (!g) {
        g = c.createGain();
        orig.call(g, c.destination);
        gains.set(c, g);
      }
      g.gain.value = vol(c);
      if (this !== g) return orig.call(this, g, ...a);
    }
    return orig.call(this, dst, ...a);
  };
}
