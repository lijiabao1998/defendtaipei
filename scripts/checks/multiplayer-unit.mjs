import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
async function load(file) {
  const out = await build({ entryPoints: [file], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
}
const data = new Map();
globalThis.localStorage = {
  getItem: k => data.get(k) || null,
  setItem: (k, v) => data.set(k, v),
  removeItem: k => data.delete(k),
};
const s = await load('src/systems/save.ts');
const keys = [s.GAME_SAVE_KEY, s.DISTRICT_TILES_KEY, s.ROAD_TILES_KEY, s.MAP_SAVE_KEY];
keys.forEach(k => data.set(k, 'sentinel'));
s.setMultiplayerSession(true);
s.clearSave();
s.clearRoadTiles();
s.writeSave({});
s.writeDistrictTiles({});
s.writeRoadTiles({});
s.writeMapSave({ n: [], f: '' });
assert.ok(keys.every(k => data.get(k) === 'sentinel'));
s.setMultiplayerSession(false);
s.clearSave();
assert.equal(data.has(s.GAME_SAVE_KEY), false);
const core = await load('src/core/sim/core.ts');
const state = core.newState(1);
assert.equal(core.addPlayer(state, 'a', 'A', 'courier', 'm', Infinity, 0), 'invalid position');
core.addPlayer(state, 'a', 'A', 'courier', 'm', 0, 0);
assert.equal(core.applyCmd(state, 'a', { t: 'move', seq: Infinity, x: 0, z: 0 }), 'stale');
assert.equal(core.applyCmd(state, 'a', { t: 'loot', seq: 1, id: 'loot', x: NaN, z: 0 }), 'nan');
assert.deepEqual(state.looted, {});
console.log('PASS: multiplayer save isolation, solo writes restored, invalid position/sequence/loot rejected');
// Client delta baseline regression: later deltas may refer to an older acknowledged tick.
globalThis.sessionStorage = localStorage;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ token: 'test' }) });
class Socket {
  readyState = 1;
  sent = [];
  constructor() {
    Socket.last = this;
  }
  send(s) {
    this.sent.push(JSON.parse(s));
  }
  close() {
    this.readyState = 3;
  }
}
globalThis.WebSocket = Socket;
const { Net } = await load('src/net/net.ts');
const net = new Net('http://example.test');
await net.join('ABCDE', { name: 'A', role: 'courier', g: 'm', x: 0, z: 0 });
const ws = Socket.last;
const first = core.newState(1, 0, 0, 0);
core.addPlayer(first, 'a', 'A', 'courier', 'm', 0, 0);
ws.onmessage({ data: JSON.stringify({ k: 'snap', tick: 0, you: 'a', s: first }) });
ws.onmessage({ data: JSON.stringify({ k: 'delta', base: 0, tick: 1, p: { a: { x: 1 } } }) });
ws.onmessage({ data: JSON.stringify({ k: 'delta', base: 0, tick: 2, p: { a: { z: 2 } } }) });
assert.equal(net.s.players.a.x, 0);
assert.equal(net.s.players.a.z, 2);
ws.onmessage({ data: JSON.stringify({ k: 'delta', base: 900, tick: 901 }) });
assert.equal(net.s.tick, 2);
assert.equal(ws.sent.at(-1).tick, -1);
const beforeEquip = ws.sent.length;
net.equip('hammer');
assert.equal(ws.sent.length, beforeEquip + 1);
net.equip('hammer');
assert.equal(ws.sent.length, beforeEquip + 1);
net.lastEquipAt = -Infinity;
net.equip('hammer');
assert.equal(ws.sent.length, beforeEquip + 2);
net.s.players.a.weapon = 'hammer';
net.lastEquipAt = -Infinity;
net.equip('hammer');
assert.equal(ws.sent.length, beforeEquip + 2);
console.log('PASS: equipment retries until server confirmation with one-second throttle');
net.leave();
assert.equal(net.s, null);
assert.equal(net.states.size, 0);
console.log('PASS: exact acknowledged delta baseline, resync on missing baseline, leave cleanup');

const items = await load('src/systems/items.ts');
assert.equal(items.ITEMS.hammer.kind, 'melee');
assert.ok(items.ITEMS.hammer.dmg > 0);
assert.equal(core.applyCmd(state, 'a', { t: 'equip', seq: 2, weapon: 'hammer' }), '');
assert.equal(state.players.a.weapon, 'hammer');
assert.equal(core.applyCmd(state, 'a', { t: 'equip', seq: 3, weapon: 'water' }), 'invalid weapon');
assert.equal(state.players.a.weapon, 'hammer');
console.log('PASS: hammer is equippable and non-weapons cannot be replicated as equipment');
const waiting = core.newState(7, 0, 0, 1);
core.addPlayer(waiting, 'host', 'Host', 'courier', 'm', 0, 0);
Object.assign(waiting.enemies[0], { x: 0, z: 0, hx: 0, hz: 0 });
for (let i = 0; i < 400; i++) core.step(waiting, core.roomReady(waiting));
assert.equal(waiting.players.host.hp, 100);
assert.equal(waiting.tick, 400);
core.addPlayer(waiting, 'guest', 'Guest', 'courier', 'm', 1, 0);
for (let i = 0; i < 30; i++) core.step(waiting, core.roomReady(waiting));
assert.ok(waiting.players.host.hp < 100);
waiting.players.guest.on = false;
const frozenHp = waiting.players.host.hp;
for (let i = 0; i < 30; i++) core.step(waiting, core.roomReady(waiting));
assert.equal(waiting.players.host.hp, frozenHp);
console.log('PASS: waiting for two loaded players freezes combat, join resumes, disconnect pauses');
// No-card deployment: final close checkpoint survives a new Room instance without R2.
const { Room } = await load('server/src/room.ts');
let savedRoom;
const db = {
  prepare: () => ({
    bind: (...args) => ({
      run: async () => {
        savedRoom = { state: args[2] };
      },
      first: async () => savedRoom,
    }),
  }),
};
const room = new Room({}, { DB: db });
room.code = 'ABCDE';
room.s = core.newState(17);
room.s.looted.kept = 'player';
await room.tick();
assert.ok(savedRoom);
assert.equal(room.timer, null);
const coldRoom = new Room({}, { DB: db });
await coldRoom.load('ABCDE');
assert.equal(coldRoom.s.looted.kept, 'player');
assert.equal(coldRoom.s.tick, room.s.tick);
const failingArchiveRoom = new Room(
  {},
  {
    DB: db,
    ARCHIVE: {
      put: async () => {
        throw Error('offline');
      },
    },
  },
);
failingArchiveRoom.code = 'ABCDE';
failingArchiveRoom.s = coldRoom.s;
await failingArchiveRoom.tick();
assert.ok(savedRoom);
console.log('PASS: no-R2 final checkpoint, cold Room restore, optional archive failure isolation');
const coldAlarmRoom = new Room({ storage: { get: async () => 'ABCDE' } }, { DB: db });
await coldAlarmRoom.alarm();
assert.equal(coldAlarmRoom.s.looted.kept, 'player');
assert.equal(coldAlarmRoom.timer, null);
console.log('PASS: durable idle alarm restores checkpoint after Room eviction');
// Co-op v2: authoritative inventories, ammunition, contested known loot and durable survivors.
const coop = core.newState(42, 0, 0, 1);
core.addPlayer(coop, 'a', 'A', 'courier', 'm', 0, 0);
core.addPlayer(coop, 'b', 'B', 'courier', 'm', 1, 0);
let seq = 0;
const command = c => core.applyCmd(coop, 'a', { ...c, seq: ++seq });
assert.equal(command({ t: 'equip', weapon: 'rifle' }), 'not owned');
assert.equal(command({ t: 'equip', weapon: 'pistol' }), '');
Object.assign(coop.enemies[0], { x: 8, z: 0, hp: 60 });
assert.equal(command({ t: 'attack', target: 0 }), '');
assert.equal(coop.players.a.inv.a9, 11);
assert.equal(coop.enemies[0].hp, 12);
assert.equal(command({ t: 'attack', target: 0 }), 'cooldown');
assert.equal(coop.players.a.inv.a9, 11);
for (let i = 0; i < 8; i++) core.step(coop, false);
assert.equal(command({ t: 'attack', target: 0 }), '');
assert.equal(coop.enemies[0].hp, 0);
assert.equal(coop.players.a.kills, 1);
assert.ok(coop.loot['enemy:0']);
assert.equal(command({ t: 'attack', target: 0 }), 'no target');
assert.equal(coop.players.a.kills, 1);
assert.equal(command({ t: 'loot', id: 'invented', x: 0, z: 0 }), 'unknown loot');
assert.equal(command({ t: 'loot', id: '__proto__', x: 0, z: 0 }), 'unknown loot');
assert.equal(command({ t: 'loot', id: 'enemy:0', x: 0, z: 0 }), 'range');
assert.equal(command({ t: 'loot', id: 'supply:0' }), '');
assert.equal(coop.players.a.inv.a9, 34);
assert.equal(core.applyCmd(coop, 'b', { t: 'loot', id: 'supply:0', seq: 1 }), 'taken');
assert.equal(coop.players.b.inv.a9, 12);
coop.players.a.hp = 40;
assert.equal(command({ t: 'use', item: 'medkit' }), '');
assert.equal(coop.players.a.hp, 75);
assert.equal(coop.players.a.inv.medkit, 3);
coop.players.a.inv.a9 = 0;
coop.players.a.cd = 0;
coop.enemies[0].hp = 60;
assert.equal(command({ t: 'attack', target: 0 }), 'no ammo');
assert.equal(coop.enemies[0].hp, 60);
const baseline = core.clone(coop);
coop.players.a.inv.a9 = 7;
coop.loot.extra = { x: 1, z: 2, items: { medkit: 1 } };
const replica = core.clone(baseline);
core.patch(replica, core.diff(baseline, coop));
assert.deepEqual(replica, coop);
for (const p of Object.values(coop.players)) p.on = false;
const retained = new Room({ storage: { get: async () => 'COOP2' } }, { DB: db });
retained.code = 'COOP2';
retained.s = coop;
await retained.alarm();
const cold = new Room({}, { DB: db });
await cold.load('COOP2');
core.addPlayer(cold.s, 'a', 'A', 'courier', 'm', 999, 999);
assert.equal(cold.s.players.a.inv.a9, 7);
assert.equal(cold.s.players.a.hp, 75);
assert.equal(cold.s.players.a.x, 0);
assert.equal(cold.s.players.a.ack, seq);
assert.equal(cold.s.looted['supply:0'], 'a');
for (const id of ['c', 'd', 'e']) assert.equal(core.addPlayer(cold.s, id, id, 'courier', 'm', 0, 0), null);
assert.equal(core.addPlayer(cold.s, 'f', 'F', 'courier', 'm', 0, 0), 'room full');
assert.equal(core.addPlayer(cold.s, 'b', 'B', 'courier', 'm', 0, 0), 'room full');
console.log(
  'PASS: co-op weapon ownership/damage/ammo/cooldown, known contested loot, medkits, deltas, durable identity and active capacity',
);

// Low-FPS snapshots reconcile between frames: send only after local motion/collision resolves.
const gameSource = readFileSync('src/core/main.ts', 'utf8');
assert.ok(gameSource.indexOf('  netFrame(dt);') > gameSource.indexOf('      collideDoors(player.pos);'));
console.log('PASS: multiplayer movement publication follows local movement/collision resolution');

// Static renderer wiring contracts; real performance and visual quality still require browser evidence.
const renderSource = readFileSync('src/core/main.ts', 'utf8');
const settingsSource = readFileSync('src/ui/settings.ts', 'utf8');
assert.match(renderSource, /antialias: SET\.quality !== 'low'/);
assert.match(renderSource, /renderer\.shadowMap\.enabled = SET\.quality !== 'low'/);
assert.match(settingsSource, /QPIX[^=]*= \{ low: 0\.75, med: 1\.25, high: 1\.5 \}/);
console.log('PASS: low rendering budget wiring; medium/high pixel budgets retained (not a performance measurement)');
