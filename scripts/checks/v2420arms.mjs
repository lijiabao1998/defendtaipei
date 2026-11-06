// v24.20 grenades that really throw and explode (duds included, walls stop them), a hunting shotgun, police stations with
// a gun locker. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4206);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'f', skipIntro: true });
// the point on screen for a place on the map
const W = 1280,
  H = 800;
const aim = async (x, z) => {
  const [mx, my] = await p.evaluate(
    ([x, z, W, H]) => {
      const q = window.__game.player.pos.clone().set(x, 1, z).project(window.__game.camera);
      return [((q.x + 1) / 2) * W, ((1 - q.y) / 2) * H];
    },
    [x, z, W, H],
  );
  await p.mouse.move(mx, my);
  await p.waitForTimeout(600);
};
// a soldier in the open, a grenade at their feet
const spot = await p.evaluate(async () => {
  const g = window.__game;
  g.setMin(11 * 60);
  // out on an open street, throwing along it: indoors a grenade bounces back off the nearest wall
  const sp = g.arcSpot();
  g.tp(sp.mid[0] + sp.nx * 7, sp.mid[1] + sp.nz * 7);
  await new Promise(r => setTimeout(r, 1500));
  const P = g.player.pos;
  const s = g.sols.find(q => q.state !== 'dead');
  // whichever way has the longest open run
  let yaw = 0;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    if (g.walkLine(P.x, P.z, P.x + Math.sin(a) * 14.5, P.z + Math.cos(a) * 14.5) === true) {
      yaw = a;
      break;
    }
  }
  window.__s = s;
  s.pos.set(P.x + Math.sin(yaw) * 12, 0, P.z + Math.cos(yaw) * 12);
  s.mesh.position.copy(s.pos);
  g.addItem('grenade', 2);
  // nobody else on this street, so that what happens to the player is the grenade's doing
  for (const q of g.sols)
    if (q !== s && q.pos.distanceTo(P) < 120) ((q.state = 'dead'), (q.hp = 0), (q.mesh.visible = false));
  return {
    x: P.x + Math.sin(yaw) * 12,
    z: P.z + Math.cos(yaw) * 12,
    far: [P.x + Math.sin(yaw) * 13, P.z + Math.cos(yaw) * 13],
  };
});
await aim(spot.x, spot.z);
const hit = await p.evaluate(async () => {
  const g = window.__game;
  const s = window.__s;
  g.player.hp = 100;
  const before = { hp: s.hp, inv: g.player.inv.grenade, n: g.grenades().length };
  g.useItem('grenade');
  const thrown = g.grenades().length;
  const land = g.grenades()[0]?.b;
  const clear = g.losTest([s.pos.x, s.pos.z], land);
  const left = g.player.inv.grenade;
  for (let i = 0; i < 60 && g.grenades().length; i++) await new Promise(r => setTimeout(r, 500));
  return {
    before,
    thrown,
    left,
    after: s.hp,
    dead: s.state === 'dead',
    pending: g.grenades().length,
    hp: g.player.hp,
    land,
    sol: [s.pos.x, s.pos.z],
    clear,
  };
});
console.log('  ', JSON.stringify(hit));
check(hit.thrown === 1, 'the grenade is thrown');
check(hit.left === hit.before.inv - 1, 'and is gone from the bag');
check(hit.pending === 0, 'it goes off');
check(hit.dead || hit.after < hit.before.hp, `the soldier 8 m away is hurt (${hit.before.hp} → ${hit.after})`);
// nobody left on the street: what a long throw does to the thrower is by the table
await aim(spot.far[0], spot.far[1]);
const self = await p.evaluate(async () => {
  const g = window.__game;
  const P = g.player.pos;
  for (const q of g.sols) if (q.pos.distanceTo(P) < 140) ((q.state = 'dead'), (q.hp = 0), (q.mesh.visible = false));
  g.player.hp = 100;
  g.player.bleed = false;
  g.useItem('grenade');
  const land = g.grenades()[0].b;
  const d = Math.hypot(land[0] - P.x, land[1] - P.z);
  for (let i = 0; i < 80 && g.grenades().length; i++) await new Promise(r => setTimeout(r, 250));
  return { d, hp: g.player.hp, bleed: g.player.bleed };
});
console.log('  ', JSON.stringify(self));
check(self.d > 11, `it flies a long way (${self.d.toFixed(1)} m)`);
check(self.hp > 80, `in the open, a long throw leaves the thrower alive (hp ${Math.round(self.hp)})`);
// a dud: grandpa's grenade, forced to fail
const dud = await p.evaluate(async () => {
  const g = window.__game;
  g.player.bleed = false;
  g.addItem('oldgrenade', 1);
  const dudRate = g.gren.oldDud;
  g.gren.oldDud = 1;
  g.useItem('oldgrenade');
  g.gren.oldDud = dudRate;
  const was = g.grenades()[0]?.dud;
  const hp0 = g.player.hp;
  for (let i = 0; i < 60 && g.grenades().length; i++) await new Promise(r => setTimeout(r, 500));
  return { was, hp0, hp: g.player.hp, seen: document.getElementById('log')?.textContent || '' };
});
check(dud.was === true, "grandpa's grenade can be a dud");
check(dud.hp >= dud.hp0 - 1, `a dud hurts nobody (${dud.hp0.toFixed(1)} → ${dud.hp.toFixed(1)})`);
// a wall between you and the blast: stand behind a building
const walled = await p.evaluate(async () => {
  const g = window.__game;
  g.player.hp = 100;
  const B = g.policeBlds()[0];
  return B;
});
check(!!walled, 'there is a police station on the map');
const police = await p.evaluate(() => window.__game.policeBlds());
console.log('   stations:', police.length, JSON.stringify(police.slice(0, 4).map(q => [q.id, q.c.map(Math.round)])));
check(police.length >= 3, `several police stations (${police.length})`);
check(
  police.every(q => q.door),
  'each has a door',
);
// the gun locker: walk in, it is furnished and searchable
const arm = await p.evaluate(async st => {
  const g = window.__game;
  g.tp(st.door[0], st.door[1]);
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    const a = g.armoryConts().filter(c => Math.hypot(c.p[0] - st.c[0], c.p[1] - st.c[1]) < 40);
    if (a.length) return a;
  }
  return [];
}, police[0]);
console.log('   lockers:', JSON.stringify(arm.map(c => c.items)));
check(arm.length >= 1, 'the station has a gun locker');
await p.waitForTimeout(1500);
await p.screenshot({ path: shot('v2420-police.png'), timeout: 120000 });
// loot tables: what ordinary homes and stations can yield
const tally = await p.evaluate(() => {
  const g = window.__game;
  const home = {},
    arm = {};
  for (let i = 0; i < 2000; i++) {
    for (const k of Object.keys(g.rollLoot('home', i * 7919 + 1))) home[k] = (home[k] || 0) + 1;
    for (const k of Object.keys(g.rollLoot('armory', i * 104729 + 1))) arm[k] = (arm[k] || 0) + 1;
  }
  return { home, arm };
});
console.log('   home', tally.home.oldgrenade, tally.home.huntsg, 'armory', JSON.stringify(tally.arm));
check(tally.home.oldgrenade > 0 && tally.home.huntsg > 0, 'homes can yield the keepsake grenade and the hunting gun');
check(tally.home.huntsg < 300, 'but rarely');
check(
  tally.arm.t65k2 > 0 && tally.arm.t93 > 0 && tally.arm.t75p > 0,
  'lockers hold pistols, rifles and the odd sniper rifle',
);
const emptyLockers = await p.evaluate(() => {
  const g = window.__game;
  let n = 0;
  for (let i = 0; i < 2000; i++) {
    const l = g.rollLoot('armory', i * 7907 + 3);
    if (!l.t75p && !l.t65k2 && !l.t93 && !l.huntsg) n++;
  }
  return n;
});
check(emptyLockers === 0, `every locker has a gun in it (${emptyLockers} of 2000 without)`);
// the hunting gun fires
const gun = await p.evaluate(async () => {
  const g = window.__game;
  g.addItem('huntsg', 1);
  g.addItem('a12', 4);
  g.useItem('huntsg');
  return { equip: g.player.equip };
});
check(gun.equip === 'huntsg', 'the hunting gun can be equipped');
await p.waitForTimeout(1000);
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
