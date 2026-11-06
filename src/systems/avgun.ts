// v24.22 the guns on captured PLA armour. Ammunition, rate of fire and heat are rounded from public figures for each
// weapon and then tuned for play, so a burst feels like the real thing without pretending to be a simulation:
// the autocannon is fed from two ready boxes and cooks off its barrel in a long burst; the 105 mm is slow and loads by
// autoloader from a small carousel; the coaxial machine gun runs on long belts; the heavy machine gun on 60-round boxes.
import { tr } from '../i18n';

export type AvWeapon = {
  name: string;
  /** seconds per round */
  cd: number;
  /** rounds ready to fire, and carried in reserve */
  ready: number;
  reserve: number;
  /** seconds to bring up the next box or carousel */
  reload: number;
  /** barrel heat per round and cooling per second, in percent; at 100 it stops until it is back to 45 */
  heat: number;
  cool: number;
  dmg: number;
  /** blast radius at the point of impact; 0 = a bullet */
  splash: number;
  range: number;
  /** can it hurt armour, and how much */
  antiArmor: number;
  sound: 'mg' | 'rifle' | 'at';
  noise: number;
  /** turret traverse, radians per second */
};
export type AvLoadout = { main: AvWeapon; coax: AvWeapon | null; traverse: number };

const COAX762: AvWeapon = {
  name: tr('7.62 毫米同軸機槍', '7.62 mm coaxial MG'),
  cd: 0.086, // about 700 rounds a minute
  ready: 250,
  reserve: 1750, // about 2000 rounds carried
  reload: 6,
  heat: 0.55, // a held trigger: about 250 rounds, then the barrel has had enough
  cool: 1.75,
  dmg: 58,
  splash: 0,
  range: 70,
  antiArmor: 0,
  sound: 'mg',
  noise: 70,
};
const AC30: AvWeapon = {
  name: tr('30 毫米機砲', '30 mm autocannon'),
  cd: 0.2, // about 300 rounds a minute on the higher rate
  ready: 200,
  reserve: 200, // about 400 rounds carried
  reload: 9,
  heat: 1.6, // a held trigger: about 90 rounds
  cool: 2.5,
  dmg: 150,
  splash: 2.4,
  range: 90,
  antiArmor: 6,
  sound: 'at',
  noise: 95,
};
export const AV_LOADOUT: Record<'zbl08' | 'zbd05' | 'ztd05' | 'mengshi', AvLoadout> = {
  zbl08: { main: AC30, coax: COAX762, traverse: 1.1 },
  zbd05: { main: AC30, coax: COAX762, traverse: 1.1 },
  ztd05: {
    main: {
      name: tr('105 毫米砲', '105 mm gun'),
      cd: 7.5, // an autoloader, about 8 rounds a minute
      ready: 8,
      reserve: 37, // about 45 rounds carried
      reload: 22,
      heat: 6,
      cool: 0.5,
      dmg: 400,
      splash: 8,
      range: 120,
      antiArmor: 70,
      sound: 'at',
      noise: 150,
    },
    coax: COAX762,
    traverse: 0.7,
  },
  mengshi: {
    main: {
      name: tr('12.7 毫米重機槍', '12.7 mm heavy MG'),
      cd: 0.11, // about 550 rounds a minute
      ready: 60, // a 60-round box
      reserve: 240,
      reload: 7,
      heat: 0.7, // a held trigger: about 200 rounds
      cool: 1.9,
      dmg: 110,
      splash: 0,
      range: 85,
      antiArmor: 1,
      sound: 'mg',
      noise: 85,
    },
    coax: null,
    traverse: 1.8,
  },
};

/** one gun's live state */
export type AvGun = {
  w: AvWeapon;
  ready: number;
  reserve: number;
  heat: number;
  jam: boolean;
  reloadT: number;
  cdT: number;
};
export type AvState = { guns: AvGun[]; sel: number };
export const avState = (l: AvLoadout, supply = 1): AvState => ({
  guns: [l.main, ...(l.coax ? [l.coax] : [])].map(w => ({
    w,
    ready: w.ready,
    reserve: Math.round(w.reserve * supply),
    heat: 0,
    jam: false,
    reloadT: 0,
    cdT: 0,
  })),
  sel: 0,
});
/** advance every gun's timers; true if the selected gun can fire right now */
export function avTick(s: AvState, dt: number) {
  for (const g of s.guns) {
    g.cdT = Math.max(0, g.cdT - dt);
    g.heat = Math.max(0, g.heat - g.w.cool * dt);
    if (g.jam && g.heat <= 45) g.jam = false;
    if (g.reloadT > 0) {
      g.reloadT -= dt;
      if (g.reloadT <= 0) {
        const n = Math.min(g.w.ready, g.reserve);
        g.ready = n;
        g.reserve -= n;
      }
    }
    // an empty gun starts on the next box by itself
    if (g.ready <= 0 && g.reloadT <= 0 && g.reserve > 0) g.reloadT = g.w.reload;
  }
  const g = s.guns[s.sel];
  return g.ready > 0 && g.reloadT <= 0 && !g.jam && g.cdT <= 0;
}
/** spend a round on the selected gun */
export function avFire(s: AvState) {
  const g = s.guns[s.sel];
  g.ready--;
  g.cdT = g.w.cd;
  g.heat = Math.min(100, g.heat + g.w.heat);
  if (g.heat >= 100) g.jam = true;
  return g.w;
}
/** top off the ready box early */
export function avReload(s: AvState) {
  const g = s.guns[s.sel];
  if (g.reloadT > 0 || g.reserve <= 0 || g.ready >= g.w.ready) return false;
  g.reserve += g.ready;
  g.ready = 0;
  g.reloadT = g.w.reload;
  return true;
}
export function avStatus(s: AvState) {
  const g = s.guns[s.sel];
  const st =
    g.reloadT > 0
      ? tr(`裝填 ${g.reloadT.toFixed(0)}s`, `Loading ${g.reloadT.toFixed(0)}s`)
      : g.jam
        ? tr('槍管過熱', 'Barrel overheated')
        : '';
  return tr(
    `${g.w.name} ${g.ready}/${g.w.ready}（備彈 ${g.reserve}）槍管 ${Math.round(g.heat)}%${st ? '｜' + st : ''}`,
    `${g.w.name} ${g.ready}/${g.w.ready} (reserve ${g.reserve}) barrel ${Math.round(g.heat)}%${st ? ' | ' + st : ''}`,
  );
}
