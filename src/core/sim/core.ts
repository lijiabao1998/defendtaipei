import { ITEMS } from '../../systems/items';
// Authoritative multiplayer simulation core (v20). Pure TS, no DOM/three: runs identically in the browser
// (prediction / solo) and inside the Cloudflare Durable Object (authority). Fixed 20 Hz tick, seeded RNG,
// integer-millimetre positions so every runtime produces the same state hash.
export const TICK_HZ = 20,
  DT = 1 / TICK_HZ,
  MAX_PLAYERS = 4;
export const RUN_SPEED = 6.2,
  DRIVE_SPEED = 22,
  ATTACK_RANGE = 1.9,
  ATTACK_CD = 10,
  LOOT_RANGE = 2.2;
export type PlayerS = {
  id: string;
  name: string;
  role: string;
  g: 'm' | 'f';
  x: number;
  z: number;
  hp: number;
  cd: number;
  ack: number;
  on: boolean;
  kills: number;
  veh: boolean;
  weapon?: string;
  inv?: Record<string, number>;
};
export type EnemyS = { id: number; x: number; z: number; hp: number; hx: number; hz: number; tgt: string };
export type LootS = { x: number; z: number; items: Record<string, number> };
export type State = {
  coop?: number;
  loot?: Record<string, LootS>;
  c?: number;
  tick: number;
  seed: number;
  rng: number;
  players: Record<string, PlayerS>;
  enemies: EnemyS[];
  looted: Record<string, string>;
  log: string[];
};
export type Cmd =
  | { t: 'move'; seq: number; x: number; z: number; veh?: boolean } // client-claimed position, validated by speed
  | { t: 'use'; seq: number; item: string }
  | { t: 'equip'; seq: number; weapon: string }
  | { t: 'attack'; seq: number; target: number }
  | { t: 'loot'; seq: number; id: string; x?: number; z?: number };
export type Snapshot = { k: 'snap'; tick: number; you: string; s: State };
export type Delta = {
  k: 'delta';
  tick: number;
  base: number;
  r?: number;
  p?: Record<string, Partial<PlayerS> | null>;
  e?: Record<number, Partial<EnemyS> | null>;
  l?: Record<string, string>;
  log?: string[];
  loot?: Record<string, LootS>;
};
const mm = (v: number) => Math.round(v * 1000) / 1000;
function rnd(s: State) {
  s.rng = (s.rng * 16807) % 2147483647;
  return s.rng / 2147483647;
}
export function newState(seed: number, cx = 0, cz = 0, enemies = 10): State {
  const s: State = {
    coop: 2,
    loot: {},
    tick: 0,
    seed,
    rng: (seed % 2147483646) + 1,
    players: {},
    enemies: [],
    looted: {},
    log: [],
  };
  for (let i = 0; i < enemies; i++) {
    const a = rnd(s) * Math.PI * 2,
      d = 25 + rnd(s) * 60;
    const x = mm(cx + Math.cos(a) * d),
      z = mm(cz + Math.sin(a) * d);
    s.enemies.push({ id: i, x, z, hp: 60, hx: x, hz: z, tgt: '' });
  }
  return s;
}
export function addPlayer(
  s: State,
  id: string,
  name: string,
  role: string,
  g: 'm' | 'f',
  x: number,
  z: number,
): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'invalid position';
  if (Object.values(s.players).filter(p => p.on && p.id !== id).length >= MAX_PLAYERS) return 'room full';
  if (s.players[id]) {
    s.players[id].on = true;
    return null;
  }
  if (Object.keys(s.players).length >= 64) return 'room full';
  if (!s.c) {
    s.c = 1;
    for (const e of s.enemies) {
      e.x = mm(e.x + x);
      e.z = mm(e.z + z);
      e.hx = e.x;
      e.hz = e.z;
    }
    s.loot ||= {};
    s.loot['supply:0'] = { x: mm(x + 1), z: mm(z), items: { a9: 24, medkit: 2 } };
  } // first player anchors the patrol area
  s.players[id] = {
    id,
    name: name.slice(0, 16),
    role,
    g,
    x: mm(x),
    z: mm(z),
    hp: 100,
    cd: 0,
    ack: 0,
    on: true,
    kills: 0,
    veh: false,
    inv: { hammer: 1, pipe: 1, pistol: 1, a9: 12, medkit: 2 },
  };
  s.log.push(`${name} 加入了`);
  return null;
}
/** validate + apply one command for player pid. Returns a rejection reason or '' when accepted (possibly clamped). */
export function applyCmd(s: State, pid: string, c: Cmd): string {
  const p = s.players[pid];
  if (!p || !p.on || p.hp <= 0) return 'dead';
  if (!Number.isSafeInteger(c.seq) || c.seq <= p.ack) return 'stale';
  p.ack = c.seq;
  if (c.t === 'equip') {
    const item = ITEMS[c.weapon];
    if (c.weapon !== '' && (!item || !['melee', 'gun'].includes(item.kind))) return 'invalid weapon';
    if (c.weapon && !p.inv?.[c.weapon]) return 'not owned';
    p.weapon = c.weapon;
    return '';
  }
  if (c.t === 'move') {
    if (!isFinite(c.x) || !isFinite(c.z)) return 'nan';
    const lim = (c.veh ? DRIVE_SPEED : RUN_SPEED) * DT * 1.6 + 0.05;
    const dx = c.x - p.x,
      dz = c.z - p.z,
      d = Math.hypot(dx, dz);
    p.veh = !!c.veh;
    if (d <= lim) {
      p.x = mm(c.x);
      p.z = mm(c.z);
      return '';
    }
    p.x = mm(p.x + (dx / d) * lim);
    p.z = mm(p.z + (dz / d) * lim);
    return 'speed';
  }
  if (c.t === 'attack') {
    const e = s.enemies.find(e => e.id === c.target);
    if (!e || e.hp <= 0) return 'no target';
    if (p.cd > 0) return 'cooldown';
    const weapon = p.weapon ? ITEMS[p.weapon] : null;
    if (p.weapon && !p.inv?.[p.weapon]) return 'not owned';
    if (Math.hypot(e.x - p.x, e.z - p.z) > (weapon?.range ?? 1.1)) return 'range';
    if (weapon?.kind === 'gun') {
      if (!weapon.ammo || !p.inv?.[weapon.ammo]) return 'no ammo';
      p.inv[weapon.ammo]--;
    }
    p.cd = Math.max(1, Math.ceil((weapon?.cd ?? 0.5) * TICK_HZ));
    e.hp = Math.max(0, e.hp - (weapon?.dmg ?? 8));
    if (e.hp <= 0) {
      p.kills++;
      (s.loot ||= {})[`enemy:${e.id}`] = { x: e.x, z: e.z, items: { a9: 6, medkit: 1 } };
      s.log.push(`${p.name} 擊倒了一名哨兵`);
    }
    return '';
  }
  if (c.t === 'use') {
    const item = ITEMS[c.item];
    if (!item || item.kind !== 'med' || !p.inv?.[c.item]) return 'invalid item';
    if (p.hp >= 100) return 'full health';
    p.inv[c.item]--;
    p.hp = Math.min(100, p.hp + (item.hp || 0));
    return '';
  }
  if (c.t === 'loot') {
    if ((c.x !== undefined && !Number.isFinite(c.x)) || (c.z !== undefined && !Number.isFinite(c.z))) return 'nan';
    if (typeof c.id !== 'string' || c.id.length > 40) return 'bad id';
    if (Object.prototype.hasOwnProperty.call(s.looted, c.id)) return 'taken';
    const loot = s.loot && Object.prototype.hasOwnProperty.call(s.loot, c.id) ? s.loot[c.id] : null;
    if (!loot) return 'unknown loot';
    if (Math.hypot(loot.x - p.x, loot.z - p.z) > LOOT_RANGE) return 'range';
    for (const [item, count] of Object.entries(loot.items)) (p.inv ||= {})[item] = (p.inv[item] || 0) + count;
    s.looted[c.id] = pid;
    return '';
  }
  return 'unknown';
}
/** advance one fixed tick: enemy AI (seeded), cooldowns */
export function roomReady(s: State): boolean {
  return Object.values(s.players).filter(p => p.on).length >= 2;
}
export function step(s: State, combat = true) {
  s.tick++;
  for (const p of Object.values(s.players)) if (p.cd > 0) p.cd--;
  if (!combat) return;
  const alive = Object.values(s.players)
    .filter(p => p.on && p.hp > 0)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    let tgt: PlayerS | null = null,
      bd = 14;
    for (const p of alive) {
      const d = Math.hypot(p.x - e.x, p.z - e.z) * (p.veh ? 0.6 : 1);
      if (d < bd) {
        bd = d;
        tgt = p;
      }
    }
    e.tgt = tgt ? tgt.id : '';
    let tx = e.hx,
      tz = e.hz,
      sp = 1.2;
    if (tgt) {
      tx = tgt.x;
      tz = tgt.z;
      sp = 3.4;
    } else if (s.tick % 80 === e.id % 80) {
      e.hx = mm(e.hx + (rnd(s) - 0.5) * 6);
      e.hz = mm(e.hz + (rnd(s) - 0.5) * 6);
    }
    const dx = tx - e.x,
      dz = tz - e.z,
      d = Math.hypot(dx, dz);
    if (d > 1.1) {
      const m = Math.min(d - 1.0, sp * DT);
      e.x = mm(e.x + (dx / d) * m);
      e.z = mm(e.z + (dz / d) * m);
    } else if (tgt && s.tick % 15 === e.id % 15) {
      tgt.hp = Math.max(0, tgt.hp - 6);
      if (tgt.hp === 0) s.log.push(`${tgt.name} 倒下了`);
    }
  }
  if (s.log.length > 20) s.log.splice(0, s.log.length - 20);
}
export function clone(s: State): State {
  return JSON.parse(JSON.stringify(s));
}
export function hash(s: State) {
  const t = JSON.stringify([
    s.tick,
    s.rng,
    Object.values(s.players)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map(p => [p.id, p.x, p.z, p.hp]),
    s.enemies.map(e => [e.x, e.z, e.hp]),
    s.looted,
  ]);
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
/** delta between a base state (what the client acked) and now */
export function diff(a: State, b: State): Delta {
  const d: Delta = { k: 'delta', tick: b.tick, base: a.tick };
  if (JSON.stringify(a.loot) !== JSON.stringify(b.loot)) d.loot = b.loot;
  if (a.rng !== b.rng) d.r = b.rng;
  for (const id of new Set([...Object.keys(a.players), ...Object.keys(b.players)])) {
    const pa = a.players[id],
      pb = b.players[id];
    if (!pb) {
      (d.p ||= {})[id] = null;
      continue;
    }
    const ch: any = {};
    let n = 0;
    for (const k of Object.keys(pb) as (keyof PlayerS)[])
      if (!pa || pa[k] !== pb[k]) {
        ch[k] = pb[k];
        n++;
      }
    if (n) (d.p ||= {})[id] = ch;
  }
  for (const eb of b.enemies) {
    const ea = a.enemies.find(e => e.id === eb.id);
    const ch: any = {};
    let n = 0;
    for (const k of Object.keys(eb) as (keyof EnemyS)[])
      if (!ea || ea[k] !== eb[k]) {
        ch[k] = eb[k];
        n++;
      }
    if (n) (d.e ||= {})[eb.id] = ch;
  }
  for (const k of Object.keys(b.looted)) if (!a.looted[k]) (d.l ||= {})[k] = b.looted[k];
  if (b.log.length && JSON.stringify(a.log) !== JSON.stringify(b.log)) d.log = b.log.slice();
  return d;
}
export function patch(s: State, d: Delta) {
  s.tick = d.tick;
  if (d.loot) s.loot = d.loot;
  if (d.r !== undefined) s.rng = d.r;
  if (d.p)
    for (const [id, ch] of Object.entries(d.p)) {
      if (ch === null) delete s.players[id];
      else s.players[id] = { ...(s.players[id] || {}), ...ch } as PlayerS;
    }
  if (d.e)
    for (const [id, ch] of Object.entries(d.e)) {
      const i = s.enemies.findIndex(e => e.id === +id);
      if (ch === null) {
        if (i >= 0) s.enemies.splice(i, 1);
      } else if (i >= 0) Object.assign(s.enemies[i], ch);
      else s.enemies.push(ch as EnemyS);
    }
  if (d.l) Object.assign(s.looted, d.l);
  if (d.log) s.log = d.log;
}
