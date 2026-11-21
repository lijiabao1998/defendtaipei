import { tr, getLanguage } from '../i18n';
import { roleById } from '../player/roles';
import type { ItemDef } from '../systems/items';
// v24.40 computer teammates: the people who start the game with you. They are the other playable roles (fictional
// people, each with their own portrait, outfit, skills and starting pack), chosen on the new-game screen. What is here
// needs nothing from the scene (the unit checks run it in node); core/main.ts moves them, draws them and fights them.
export type V2 = [number, number];
export type MatePick = { r: string; g: 'm' | 'f' };
/** how many can come: two on a computer, one on a phone (the opening scene on a phone is near its draw budget) */
export const mateMax = (mobile: boolean) => (mobile ? 1 : 2);
export const mateName = (p: MatePick) => roleById(p.r).names[p.g === 'm' ? 0 : 1];
/**
 * who a companion is to the player. A maintenance technician and a student are parent and child; two technicians of
 * opposite sex with a student among them are the child's parents; the same job is colleagues (students: classmates);
 * anyone else shares the flat.
 */
export function relation(me: MatePick, m: MatePick, party: MatePick[]): string {
  if (m.r === 'tech' && me.r === 'student') return m.g === 'm' ? tr('爸爸', 'father') : tr('媽媽', 'mother');
  if (m.r === 'student' && me.r === 'tech') return m.g === 'm' ? tr('兒子', 'son') : tr('女兒', 'daughter');
  if (m.r === 'tech' && me.r === 'tech' && m.g !== me.g && party.some(p => p.r === 'student'))
    return m.g === 'm' ? tr('先生', 'husband') : tr('太太', 'wife');
  if (m.r === me.r) return m.r === 'student' ? tr('同學', 'classmate') : tr('同事', 'colleague');
  return tr('室友', 'flatmate');
}
/** "阿財（水電師傅，你的爸爸）" */
export function mateLine(me: MatePick, m: MatePick, party: MatePick[]) {
  const R = roleById(m.r);
  const rel = relation(me, m, party);
  return getLanguage() === 'en' ? `${mateName(m)} (${R.name}, your ${rel})` : `${mateName(m)}（${R.name}，你的${rel}）`;
}
/** fire rules, as for the Beijing squad (owner, 2026-11-18): 0 hold fire unless attacked, 1 as the situation calls (default), 2 fire at will */
export type FireRule = 0 | 1 | 2;
export const ruleName = (r: FireRule) =>
  r === 0 ? tr('別開火', 'Hold fire') : r === 2 ? tr('見到就打', 'Fire at will') : tr('看情況', 'Use judgement');
/**
 * whether a teammate takes on a soldier it can see. Hold fire: only one already on it at arm's length. Use judgement: one
 * in a fight with the team, or any once the player has opened up or the teammate has been hurt (never an unaware one
 * while the player is sneaking). Fire at will: anyone in sight.
 */
export function engages(
  rule: FireRule,
  c: { foeOnUs: boolean; close: boolean; fighting: boolean; playerFired: boolean; hurt: boolean; sneaking: boolean },
) {
  if (rule === 0) return c.foeOnUs && c.close;
  if (rule === 2) return true;
  if (c.foeOnUs || c.fighting) return true;
  return (c.playerFired || c.hurt) && !c.sneaking;
}
/**
 * what a teammate eats, drinks or treats itself with from its own pack, or null. Nothing raw, nothing that needs cooking,
 * and nothing that might upset the stomach unless it is that or going without.
 */
export function pickConsumable(
  inv: Record<string, number>,
  items: Record<string, ItemDef>,
  v: { hunger: number; thirst: number; hp: number; bleed: boolean },
): string | null {
  const have = Object.keys(inv).filter(k => inv[k] > 0 && items[k] && !items[k].raw);
  const best = (score: (d: ItemDef) => number, risky: boolean) => {
    let b: string | null = null,
      bs = 0;
    for (const k of have) {
      const d = items[k];
      if ((d.risk || (d.hp || 0) < 0) && !risky) continue; // (spoiled food, unboiled rainwater: only rather than going without)
      const s = score(d);
      if (s > bs) ((bs = s), (b = k));
    }
    return b;
  };
  if (v.bleed) {
    const k = best(d => (d.stopBleed ? 1 + (d.hp || 0) / 100 : 0), true);
    if (k) return k;
  }
  if (v.thirst < 35) {
    const k = best(d => (d.thirst || 0) - Math.max(0, -(d.hunger || 0)), v.thirst < 12);
    if (k && (items[k].thirst || 0) > 0) return k;
  }
  if (v.hunger < 35) {
    const k = best(d => (d.kind === 'food' ? (d.hunger || 0) + Math.min(0, d.thirst || 0) : 0), v.hunger < 12);
    if (k && (items[k].hunger || 0) > 0) return k;
  }
  if (v.hp < 40) {
    const k = best(d => (d.kind === 'med' && !d.stopBleed ? d.hp || 0 : 0), false);
    if (k) return k;
  }
  return null;
}
/** the weapon a teammate holds: a gun with rounds for it, else the hardest-hitting thing to swing, else bare hands */
export function pickWeapon(inv: Record<string, number>, items: Record<string, ItemDef>): string {
  let gun = '',
    gs = 0,
    mel = '',
    ms = 0;
  for (const k of Object.keys(inv)) {
    const d = items[k];
    if (!d || !(inv[k] > 0)) continue;
    const loaded =
      !!d.ammo &&
      (inv[d.ammo] > 0 || Object.keys(inv).some(m => inv[m] > 0 && items[m]?.mag && items[m].ammo === d.ammo));
    if (d.kind === 'gun' && !d.at && loaded && (d.dmg || 0) * (d.range || 1) > gs)
      ((gs = (d.dmg || 0) * (d.range || 1)), (gun = k));
    if (d.kind === 'melee' && (d.dmg || 0) > ms) ((ms = d.dmg || 0), (mel = k));
  }
  return gun || mel;
}
/** what is saved of a teammate (only written when there are teammates: a save without them is byte for byte as before) */
export type MateSave = {
  r: string;
  g: 'm' | 'f';
  /** where on the map (in a car, upstairs or in a station with the player: where the player is on the map) */
  p: V2;
  hp: number;
  hu: number;
  th: number;
  fa: number;
  bl: boolean;
  inv: Record<string, number>;
  eq: string;
  k: number;
  /** 0 follow, 1 wait here */
  m: 0 | 1;
  /** fire rule */
  f: FireRule;
  /** 0 on their feet, 1 down (dt seconds left), 2 dead */
  s: 0 | 1 | 2;
  dt?: number;
  /** dead: the day they died, and how (for the ending) */
  dd?: number;
  wy?: string;
  /** with the player when saved (comes back beside them) */
  w?: 1;
};
/**
 * v24.40 where the player has walked: the teammates follow the same steps (so they take the same doors, the same gaps
 * between cars, the same low walls). Points every 0.35 m, the last 140 kept; `base` counts the points dropped, so an
 * index into the trail stays good while the trail moves on.
 */
export class Trail {
  pts: { x: number; z: number; d: number; v?: 1 }[] = [];
  base = 0;
  len = 0;
  static MAX = 140;
  reset(x: number, z: number) {
    this.base += this.pts.length;
    this.pts = [{ x, z, d: 0 }];
    this.len = 0;
  }
  /** v: this step was a vault over a low wall */
  push(x: number, z: number, v = false) {
    const last = this.pts[this.pts.length - 1];
    if (!last) return this.reset(x, z);
    const s = Math.hypot(x - last.x, z - last.z);
    if (s < 0.35 && !v) return;
    if (s > 6) return this.reset(x, z); // a jump (stairs, a station gate, a car): the steps before it lead nowhere
    this.len += s;
    this.pts.push(v ? { x, z, d: this.len, v: 1 } : { x, z, d: this.len });
    if (this.pts.length > Trail.MAX) {
      this.pts.shift();
      this.base++;
    }
  }
  get head() {
    return this.base + this.pts.length - 1;
  }
  at(i: number) {
    return this.pts[i - this.base];
  }
  has(i: number) {
    return i >= this.base && i < this.base + this.pts.length;
  }
  /** the index of the last point at least `back` metres of walking behind the newest one */
  behind(back: number) {
    const want = this.len - back;
    let lo = 0,
      hi = this.pts.length - 1;
    if (this.pts[0].d > want) return this.base;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.pts[mid].d <= want) lo = mid;
      else hi = mid - 1;
    }
    return this.base + lo;
  }
  /** the index of the point nearest to (x, z) among those the test lets through, or -1 */
  nearest(x: number, z: number, ok: (p: V2) => boolean, maxD = 6) {
    let b = -1,
      bd = maxD;
    for (let i = this.pts.length - 1; i >= 0; i--) {
      const q = this.pts[i];
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < bd && ok([q.x, q.z])) ((bd = d), (b = this.base + i));
    }
    return b;
  }
}
