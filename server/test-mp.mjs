// Local multiplayer integration test against `wrangler dev` (no Cloudflare account): auth, room code, 4 players, 5th rejected,
// delta stream, speed-hack clamp, contested loot, reconnect, D1 save.
import WebSocket from 'ws';
import assert from 'node:assert/strict';
const timeout = setTimeout(
  () => {
    console.error('Multiplayer test timed out');
    process.exit(1);
  },
  process.env.MP_TEST_IDLE_RECOVERY ? 180000 : 60000,
);
const B = process.argv[2] || 'http://localhost:8787';
if (process.env.MP_TEST_LOCAL_ONLY === '1') {
  const url = new URL(B);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '8787');
  assert.equal(url.pathname, '/');
  assert.equal(url.username + url.password + url.search + url.hash, '');
}
const W = B.replace('http', 'ws');
async function waitUntil(condition, label, budget = 10000) {
  const deadline = Date.now() + budget;
  while (!condition() && Date.now() < deadline) await new Promise(r => setTimeout(r, 25));
  assert.ok(condition(), `${label} timed out`);
}
function close(c) {
  if (c.ws.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise(resolve => {
    c.ws.once('close', resolve);
    c.ws.close();
  });
}
const out = {};
const post = async (p, tok) =>
  (await fetch(B + p, { method: 'POST', headers: tok ? { Authorization: 'Bearer ' + tok } : {} })).json();
const users = [];
for (let i = 0; i < 5; i++) users.push(await post('/api/auth'));
const { code } = await post('/api/rooms', users[0].token);
out.code = code;
out.noauth = (await fetch(`${B}/api/rooms/${code}/ws`)).status;
out.badroom = (await fetch(`${B}/api/rooms/ZZZZZ`)).status;
function join(u, name, x = 0) {
  return new Promise(res => {
    const ws = new WebSocket(`${W}/api/rooms/${code}/ws?token=${u.token}`);
    const c = { ws, msgs: 0, bytes: 0, deltas: 0, snaps: 0, rej: [], err: null, s: null, seq: 0, closed: null };
    ws.on('open', () => ws.send(JSON.stringify({ k: 'hello', name, role: 'courier', g: 'm', x, z: 0 })));
    ws.on('message', d => {
      const m = JSON.parse(d);
      c.msgs++;
      c.bytes += d.length;
      if (m.k === 'snap') {
        c.snaps++;
        c.s = m.s;
        res(c);
      }
      if (m.k === 'delta') {
        c.deltas++;
        for (const [id, p] of Object.entries(m.p || {})) {
          if (p) Object.assign((c.s.players[id] ||= {}), p);
          else delete c.s.players[id];
        }
      }
      if (m.k === 'rej') c.rej.push(m.why);
      if (m.k === 'err') {
        c.err = m.e;
        res(c);
      }
      if (m.tick !== undefined) ws.send(JSON.stringify({ k: 'ack', tick: m.tick }));
    });
    ws.on('close', cd => {
      c.closed = cd;
      res(c);
    });
  });
}
const cs = [];
for (let i = 0; i < 4; i++) cs.push(await join(users[i], 'P' + i, i * 2));
const fifth = await join(users[4], 'P4');
out.fifth = fifth.err || fifth.closed;
await new Promise(r => setTimeout(r, 1500));
const cmd = (c, o) => c.ws.send(JSON.stringify({ k: 'cmd', c: { seq: ++c.seq, ...o } }));
cmd(cs[0], { t: 'move', x: 0.3, z: 0 });
cmd(cs[1], { t: 'move', x: 2.3, z: 0 });
await waitUntil(
  () => cs[1].s.players[users[0].uid]?.x === 0.3 && cs[0].s.players[users[1].uid]?.x === 2.3,
  'bidirectional movement',
);
assert.equal(cs[1].s.players[users[0].uid].x, 0.3);
assert.equal(cs[0].s.players[users[1].uid].x, 2.3);
out.bidirectionalMovement = true;
for (let i = 0; i < 180; i++) cs[0].ws.send(JSON.stringify({ k: 'ack', tick: 0 }));
cmd(cs[0], { t: 'equip', weapon: 'hammer' });
cmd(cs[1], { t: 'equip', weapon: 'pipe' });
await waitUntil(
  () => cs[1].s.players[users[0].uid]?.weapon === 'hammer' && cs[0].s.players[users[1].uid]?.weapon === 'pipe',
  'bidirectional equipment',
);
assert.equal(cs[1].s.players[users[0].uid].weapon, 'hammer');
assert.equal(cs[0].s.players[users[1].uid].weapon, 'pipe');
out.weaponReplication = true;
out.ackBacklogDoesNotDropEquipment = true;
cmd(cs[0], { t: 'move', x: 80, z: 0 }); // speed hack
cmd(cs[1], { t: 'loot', id: 'b12_0', x: 2, z: 0 });
cmd(cs[2], { t: 'loot', id: 'b12_0', x: 4, z: 0 }); // both claimants are in range
cmd(cs[3], { t: 'attack', target: 0 });
await waitUntil(
  () => cs[0].rej.includes('speed') && (cs[1].rej.includes('taken') || cs[2].rej.includes('taken')),
  'speed rejection and contested loot',
);
out.rejects = cs.map(c => c.rej);
out.stream = cs.map(c => ({ snaps: c.snaps, deltas: c.deltas, avgBytes: Math.round(c.bytes / c.msgs) }));
// reconnect P1 with same token
await close(cs[1]);
const re = await join(users[1], 'P1', 2);
out.reconnect = {
  snap: re.snaps,
  players: Object.keys(re.s.players).length,
  sameId: !!re.s.players[users[1].uid],
  looted: re.s.looted,
};
// Wait for 200 authoritative ticks rather than relying on a fixed delay.
const tickDeadline = Date.now() + 30000;
do {
  await new Promise(r => setTimeout(r, 250));
  out.info = await (await fetch(`${B}/api/rooms/${code}`)).json();
} while (out.info.tick < 200 && Date.now() < tickDeadline);
await Promise.all([...cs, re].map(close));
assert.equal(out.noauth, 401);
assert.equal(out.badroom, 404);
assert.equal(out.fifth, 'room full');
assert.ok(out.rejects[0].includes('speed'));
assert.equal(out.rejects.filter(r => r.includes('taken')).length, 1);
assert.ok(out.stream.every(c => c.deltas > 0));
assert.equal(out.reconnect.sameId, true);
assert.equal(out.reconnect.players, 4);
const winner = out.reconnect.looted.b12_0;
assert.ok([users[1].uid, users[2].uid].includes(winner));
const loserIndex = winner === users[1].uid ? 2 : 1;
assert.ok(out.rejects[loserIndex].includes('taken'));
assert.ok(!out.rejects[loserIndex === 1 ? 2 : 1].includes('taken'));
assert.ok(out.info.tick >= 200);
if (process.env.MP_TEST_IDLE_RECOVERY) {
  // Wait beyond the actual server grace period: tick stops and final D1 checkpoint is written.
  await new Promise(r => setTimeout(r, 62000));
  const idle = await (await fetch(`${B}/api/rooms/${code}`)).json();
  assert.equal(idle.players, 0);
  assert.ok(idle.tick > out.info.tick);
  // The idle alarm can persist one final tick after the timer stops. Require
  // a continuous stable D1 snapshot longer than the normal checkpoint period.
  let stopped = idle;
  let stableSince = Date.now();
  const stopDeadline = Date.now() + 25000;
  while (Date.now() - stableSince < 12000 && Date.now() < stopDeadline) {
    await new Promise(r => setTimeout(r, 1000));
    const current = await (await fetch(`${B}/api/rooms/${code}`)).json();
    assert.equal(current.players, 0);
    assert.ok(current.tick >= stopped.tick);
    if (current.tick !== stopped.tick) stableSince = Date.now();
    stopped = current;
  }
  assert.ok(Date.now() - stableSince >= 12000, 'idle room did not reach a stable checkpoint');
  const restored = await join(users[1], 'P1', 2);
  assert.equal(restored.s.looted.b12_0, out.reconnect.looted.b12_0);
  restored.ws.close();
  out.noR2IdleRecovery = true;
}
clearTimeout(timeout);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
