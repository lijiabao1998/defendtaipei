// v24.21 the war gets worse: distant gunfire, shelling, and now and then a rocket or a missile, with blast radii that feel
// like the warhead. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4207);
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

// the level rises with time, and the first day is only gunfire
const quiet = await p.evaluate(() => {
  const g = window.__game;
  const lv = m => {
    g.setMin(m);
    g.warTickNow(0.001);
    return g.war().level;
  };
  const levels = [lv(8 * 60), lv(1440 * 2), lv(1440 * 4), lv(1440 * 8)];
  lv(8 * 60);
  const s0 = g.war().shells,
    r0 = g.war().rockets + g.war().missiles,
    gf0 = g.war().gunfire;
  for (let i = 0; i < 6; i++) g.warTickNow(700);
  return {
    levels,
    shells: g.war().shells - s0,
    big: g.war().rockets + g.war().missiles - r0,
    gun: g.war().gunfire - gf0,
  };
});
console.log('  ', JSON.stringify(quiet));
check(quiet.levels[0] < 0.05, `the first morning is quiet (${quiet.levels[0].toFixed(2)})`);
check(quiet.levels[1] > quiet.levels[0] && quiet.levels[2] > quiet.levels[1], 'it gets worse with time');
check(quiet.levels[3] >= 0.99, `about a week in it is at its worst (${quiet.levels[3].toFixed(2)})`);
check(quiet.shells === 0 && quiet.big === 0, 'nothing falls on the first morning');
check(quiet.gun >= 3, `but gunfire is heard in the distance (${quiet.gun})`);

// later on, things do fall by themselves; not while asleep
const later = await p.evaluate(() => {
  const g = window.__game;
  g.setMin(1440 * 7);
  g.player.sleeping = true;
  const a = { s: g.war().shells, b: g.war().rockets + g.war().missiles };
  for (let i = 0; i < 5; i++) g.warTickNow(700);
  const asleep = g.war().shells - a.s + (g.war().rockets + g.war().missiles - a.b);
  g.player.sleeping = false;
  for (let i = 0; i < 8; i++) g.warTickNow(700);
  const res = {
    asleep,
    shells: g.war().shells - a.s,
    big: g.war().rockets + g.war().missiles - a.b,
    pending: g.war().pending,
  };
  return res;
});
console.log('  ', JSON.stringify(later));
check(later.asleep === 0, 'nothing falls while you sleep');
check(later.shells > 0, `a week in there are barrages (${later.shells} shells)`);
check(later.big > 0, `and rockets or missiles (${later.big})`);
// let those land far from what the next part measures
await p.waitForFunction(() => window.__game.war().pending === 0, null, { timeout: 240000, polling: 500 });

// the weapons, big to small
const W = await p.evaluate(() => {
  const g = window.__game;
  const f = {};
  for (const k of Object.keys(g.WAR))
    f[k] = {
      ...g.WAR[k],
      at20: g.weaponDmg(g.WAR[k], 20),
      at40: g.weaponDmg(g.WAR[k], 40),
      far: g.weaponDmg(g.WAR[k], g.WAR[k].wound + 1),
    };
  return f;
});
check(
  W.mortar.core < W.rocket.core && W.rocket.core < W.cruise.core && W.cruise.core < W.srbm.core,
  'bigger warhead, bigger lethal radius',
);
check(
  W.mortar.wound < W.rocket.wound && W.rocket.wound < W.cruise.wound && W.cruise.wound < W.srbm.wound,
  'and a wider wounding ring',
);
check(W.mortar.at40 === 0 && W.srbm.at40 > 40, 'at 40 m a mortar is nothing and a ballistic missile is not');
check(
  Object.values(W).every(w => w.far === 0),
  'outside the ring there is no damage',
);

// a strike in the open: a soldier inside the lethal radius dies, one far away does not, the player is hurt by what the table says
const strike = await p.evaluate(async () => {
  const g = window.__game;
  g.setMin(1440 * 3 + 11 * 60);
  const sp = g.arcSpot();
  g.tp(sp.mid[0] + sp.nx * 7, sp.mid[1] + sp.nz * 7);
  await new Promise(r => setTimeout(r, 1500));
  const P = g.player.pos;
  // (not from a district tile: those leave when the tile does)
  const live = g.sols.filter(q => q.state !== 'dead' && !q.tile);
  const a = live[0],
    c = live[1];
  const yaw = Math.atan2(sp.nx, sp.nz);
  const x = P.x + Math.sin(yaw) * 40,
    z = P.z + Math.cos(yaw) * 40;
  for (const q of g.sols)
    if (q !== a && q !== c && q.pos.distanceTo(P) < 140) ((q.state = 'dead'), (q.hp = 0), (q.mesh.visible = false));
  a.pos.set(x + 10, 0, z);
  a.mesh.position.copy(a.pos);
  c.pos.set(x + 110, 0, z);
  c.mesh.position.copy(c.pos);
  g.player.hp = 100;
  g.player.bleed = false;
  const n0 = g.war().missiles;
  g.warStrike('srbm', x, z);
  const hpC0 = c.hp;
  const pend = g.war().pending;
  // the ring is up: photograph it, then wait for the impact
  return { x, z, pend, n: g.war().missiles - n0, hpC0, dmg: g.weaponDmg(g.WAR.srbm, 40), aid: a.id, cid: c.id };
});
check(strike.pend >= 1 && strike.n === 1, 'a missile is on its way');
await p.waitForTimeout(500);
await p.screenshot({ path: shot('v2421-ring.png'), timeout: 120000 });
const after = await p.evaluate(async st => {
  const g = window.__game;
  const a = g.sols.find(q => q.id === st.aid),
    c = g.sols.find(q => q.id === st.cid);
  for (let i = 0; i < 240 && g.war().pending; i++) await new Promise(r => setTimeout(r, 250));
  const res = {
    pending: g.war().pending,
    aDead: a.state === 'dead',
    cHp: c.hp,
    hp: g.player.hp,
    fires: g.war().fires,
    craters: g.war().craters,
  };
  return res;
}, strike);
console.log('  ', JSON.stringify({ ...after, want: strike.dmg }));
await p.waitForTimeout(800);
await p.screenshot({ path: shot('v2421-impact.png'), timeout: 120000 });
check(after.pending === 0, 'it lands');
check(after.aDead, 'a soldier 10 m from it is dead');
check(after.cHp === strike.hpC0, 'a soldier 110 m from it is untouched');
const lost = 100 - after.hp;
check(
  lost >= strike.dmg * 0.5 - 1 && lost <= strike.dmg + 6,
  `40 m away in the open hurts by the table (${Math.round(lost)} of ${Math.round(strike.dmg)})`,
);
check(after.fires >= 1, 'the crater keeps burning');
check(after.craters >= 1, 'and is counted');

// indoors the walls take most of it
const inside = await p.evaluate(async () => {
  const g = window.__game;
  const B = g.policeBlds()[0];
  g.tp(B.c[0], B.c[1]);
  await new Promise(r => setTimeout(r, 1200));
  const here = g.indoorHere();
  const P = g.player.pos;
  g.player.hp = 100;
  g.player.bleed = false;
  for (const q of g.sols) if (q.pos.distanceTo(P) < 140) ((q.state = 'dead'), (q.hp = 0), (q.mesh.visible = false));
  g.warStrike('srbm', P.x + 40, P.z);
  for (let i = 0; i < 240 && g.war().pending; i++) await new Promise(r => setTimeout(r, 250));
  return { here, hp: g.player.hp, dmg: g.weaponDmg(g.WAR.srbm, 40) };
});
console.log('  ', JSON.stringify(inside));
check(inside.here, 'the player is indoors');
check(
  100 - inside.hp <= inside.dmg * 0.25 + 2,
  `indoors only about a quarter gets through (${Math.round(100 - inside.hp)} of ${Math.round(inside.dmg)})`,
);

// a barrage: all of it comes down, the rings go away
const bar = await p.evaluate(async () => {
  const g = window.__game;
  const P = g.player.pos;
  const n0 = g.war().shells;
  g.warBarrage(3, P.x + 60, P.z);
  const up = g.war().pending;
  for (let i = 0; i < 240 && g.war().pending; i++) await new Promise(r => setTimeout(r, 250));
  return { up, n: g.war().shells - n0, pending: g.war().pending, rings: g.blastFx.warns.filter(w => w.on).length };
});
console.log('  ', JSON.stringify(bar));
check(bar.up === 3 && bar.n === 3, 'a barrage is three shells');
check(bar.pending === 0 && bar.rings === 0, 'all landed, no ring left on the ground');

// for the eye: a cruise missile on screen, by day
await p.evaluate(async () => {
  const g = window.__game;
  const sp = g.arcSpot();
  g.tp(sp.mid[0] + sp.nx * 7, sp.mid[1] + sp.nz * 7);
  g.setMin(1440 * 3 + 11 * 60);
  await new Promise(r => setTimeout(r, 1000));
  const P = g.player.pos;
  g.player.hp = 1000;
  g.warStrike('cruise', P.x - 14, P.z + 14);
});
await p.waitForTimeout(1200);
await p.screenshot({ path: shot('v2421-ring.png'), timeout: 120000 });
await p.waitForFunction(() => window.__game.war().pending === 0, null, { timeout: 120000, polling: 50 });
await p.screenshot({ path: shot('v2421-impact.png'), timeout: 120000 });
await p.waitForTimeout(2500);
await p.screenshot({ path: shot('v2421-after.png'), timeout: 120000 });
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
