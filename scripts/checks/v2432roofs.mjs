// v24.32 rooftops and the street. The tin houses on a roof are walked into by their doors and are furnished rooms (the
// roof lifts off the one the player stands in); on a long roof they take a share of it, not all of it; what stands on a
// roof is solid, on district roofs too. A head at the parapet is seen from the street and shot at, and the player
// shoots down into the street. At night, with the power on, windows are lit. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4219);
const url = gameUrl(process.argv[2] || srv?.url).replace(/\?.*$/, '');
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 600)));
await p.goto(url);
await pickRole(p, { g: 'f', skipIntro: true, entryTimeout: 240000 });
await p.waitForTimeout(30000);

// ---- the roofs of the core near the start
const roofs = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  g.setMin(11 * 60);
  const c = g.start();
  const picks = g
    .stairs()
    .filter(s => s.d === 'core' && s.top >= 3)
    .map(s => ({ ...s, dist: Math.hypot(s.c[0] - c[0], s.c[1] - c[1]) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 22);
  const out = [];
  for (const s of picks) {
    g.player.hp = 100;
    for (const q of g.sols) q.night = q.day = true;
    g.tp(s.foot[0], s.foot[1]);
    await wait(500);
    for (let i = 0; i < 16 && !g.upState().roof; i++) {
      const u = g.upState();
      if (u.up && !u.upFoot) break;
      if (u.up) g.tp(u.upFoot[0], u.upFoot[1]);
      g.upToggle();
      await wait(220);
    }
    const u = g.upState();
    if (!u.roof) continue;
    const r = {
      sheds: u.sheds.length,
      area: Math.round(u.cover.area),
      share: +u.cover.share.toFixed(2),
      np: u.np,
      conts: u.conts.length,
      solid: u.solid,
      inside: 0,
    };
    for (const h of u.sheds) {
      g.tp(h[0], h[1]);
      await wait(250);
      if (g.upState().inShed) r.inside++;
    }
    out.push(r);
    for (let i = 0; i < 20 && g.upState().up; i++) {
      const v = g.upState();
      g.tp(v.land[0], v.land[1]);
      g.upToggle();
      await wait(80);
    }
  }
  return out;
});
for (const r of roofs) console.log('  ', JSON.stringify(r));
const withSheds = roofs.filter(r => r.sheds > 0);
check(roofs.length >= 16, `rooftops reached (${roofs.length})`);
check(withSheds.length >= 6, `with tin houses that can be walked into (${withSheds.length})`);
check(
  withSheds.every(r => r.inside === r.sheds),
  'standing in one is being indoors (its roof lifts off)',
);
check(
  withSheds.filter(r => r.np >= 3).length >= withSheds.length * 0.7,
  `they are furnished rooms (${withSheds.map(r => r.np).join(' ')} pieces)`,
);
check(withSheds.filter(r => r.conts >= 1).length >= withSheds.length * 0.7, 'with something to search');
check(
  roofs.every(r => r.share <= (r.area < 110 ? 0.85 : r.area < 220 ? 0.62 : 0.48)),
  `a long roof is not one tin house from end to end (largest share ${Math.max(...roofs.map(r => r.share))}, on big roofs ${Math.max(0, ...roofs.filter(r => r.area >= 220).map(r => r.share))})`,
);
check(
  roofs.some(r => r.solid > 0),
  `what stands on a roof is solid (${roofs.reduce((a, r) => a + r.solid, 0)} things on ${roofs.filter(r => r.solid).length} roofs)`,
);

// ---- and out in the districts: the same houses and the same solid clutter on the roofs of streamed tiles
const droofs = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const c = g.start();
  const at = [c[0] - 790, c[1] + 1570];
  g.player.hp = 100;
  g.tp(at[0], at[1]);
  await wait(22000);
  for (const q of g.sols) q.night = q.day = true;
  const picks = g
    .stairs()
    .filter(s => s.d !== 'core' && s.top >= 3)
    .map(s => ({ ...s, dist: Math.hypot(s.c[0] - at[0], s.c[1] - at[1]) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 12);
  const out = [];
  for (const s of picks) {
    g.player.hp = 100;
    g.tp(s.foot[0], s.foot[1]);
    await wait(500);
    for (let i = 0; i < 16 && !g.upState().roof; i++) {
      const u = g.upState();
      if (u.up && !u.upFoot) break;
      if (u.up) g.tp(u.upFoot[0], u.upFoot[1]);
      g.upToggle();
      await wait(220);
    }
    const u = g.upState();
    if (!u.roof) continue;
    const r = { sheds: u.sheds.length, solid: u.solid, np: u.np, inside: 0 };
    for (const h of u.sheds) {
      g.tp(h[0], h[1]);
      await wait(250);
      if (g.upState().inShed) r.inside++;
    }
    out.push(r);
    for (let i = 0; i < 20 && g.upState().up; i++) {
      const v = g.upState();
      g.tp(v.land[0], v.land[1]);
      g.upToggle();
      await wait(80);
    }
  }
  g.tp(c[0], c[1]);
  await wait(9000);
  return out;
});
console.log('   district roofs:', JSON.stringify(droofs));
check(droofs.length >= 4, `district rooftops reached (${droofs.length})`);
check(
  droofs.some(r => r.solid > 0),
  `what stands on a district roof is solid too (${droofs.reduce((a, r) => a + r.solid, 0)} things)`,
);
check(
  droofs.every(r => r.inside === r.sheds),
  `and its tin houses are walked into the same way (${droofs.reduce((a, r) => a + r.sheds, 0)} of them)`,
);

// ---- fire both ways between a rooftop and the street
const fire = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  g.setMin(11 * 60);
  const c = g.start();
  const picks = g
    .stairs()
    .filter(s => s.d === 'core' && s.top >= 3 && s.top <= 5)
    .map(s => ({ ...s, dist: Math.hypot(s.c[0] - c[0], s.c[1] - c[1]) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 10);
  for (const s of picks) {
    g.player.hp = 100;
    for (const q of g.sols) q.night = q.day = true;
    g.tp(s.foot[0], s.foot[1]);
    await wait(500);
    for (let i = 0; i < 16 && !g.upState().roof; i++) {
      const u = g.upState();
      if (u.up && !u.upFoot) break;
      if (u.up) g.tp(u.upFoot[0], u.upFoot[1]);
      g.upToggle();
      await wait(220);
    }
    const u = g.upState();
    if (!u.roof) continue;
    const home = [g.player.pos.x, g.player.pos.z];
    // a spot in a street, the parapet on that side, and a clear line between the two
    for (const d of [20, 24, 28, 17])
      for (let k = 0; k < 24; k++) {
        const F0 = g.upFire();
        const a = (k / 24) * Math.PI * 2;
        const x = F0.real[0] + Math.sin(a) * d,
          z = F0.real[2] + Math.cos(a) * d;
        if (g.roadDist(x, z) > 1.5 || g.inBld(x, z)) continue;
        const e = F0.exit(x, z);
        if (e > 12) continue;
        const m = Math.max(0, e - 0.5);
        g.tp(home[0] + Math.sin(a) * m, home[1] + Math.cos(a) * m);
        const F = g.upFire();
        if (F.los(x, z) && F.trace(x, z).length === 0) {
          const sol = g.sols.find(q => q.state !== 'dead');
          sol.pos.set(x, 0, z);
          sol.night = sol.day = false;
          sol.state = 'patrol';
          sol.route = [
            [x, z],
            [x, z],
          ];
          sol.wi = 0;
          sol.hp = 100;
          sol.alert = 0;
          sol.dir = Math.atan2(F.real[2] - z, F.real[0] - x);
          window.__sol = sol;
          const shots0 = g.coverStats.enemyShots;
          let seen = false;
          for (let i = 0; i < 40; i++) {
            await wait(400);
            g.player.hp = 100;
            if (sol.state === 'combat') seen = true;
            if (g.coverStats.enemyShots > shots0 + 1) break;
          }
          return { ok: true, d, fy: u.fy, seen, shots: g.coverStats.enemyShots - shots0, state: sol.state };
        }
        g.tp(home[0], home[1]);
      }
    for (let i = 0; i < 20 && g.upState().up; i++) {
      const v = g.upState();
      g.tp(v.land[0], v.land[1]);
      g.upToggle();
      await wait(80);
    }
  }
  return { ok: false };
});
console.log('   up from the street:', JSON.stringify(fire));
check(fire.ok, 'a rooftop with a clear line down to a street');
check(fire.ok && fire.seen, 'a soldier in the street sees the head at the parapet');
check(fire.ok && fire.shots >= 2, `and fires up at it (${fire.shots} rounds)`);
if (fire.ok) {
  await p.screenshot({ path: shot('v2432-fire.png'), timeout: 120000 });
  const scr = await p.evaluate(() => {
    const g = window.__game;
    g.addItem('t91', 1);
    g.addItem('a556n', 60);
    g.useItem('t91');
    const s = window.__sol;
    s.hp = 100;
    const v = g.player.pos.clone().set(s.pos.x, 1.0, s.pos.z).project(g.upCam);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  });
  check(scr.x > 5 && scr.x < 1275 && scr.y > 5 && scr.y < 795, 'he is in the picture, seen from the roof');
  await p.mouse.move(scr.x, scr.y);
  await p.waitForTimeout(300);
  const back = await p.evaluate(async () => {
    const g = window.__game;
    const s = window.__sol;
    const hp0 = s.hp;
    for (let i = 0; i < 8 && s.state !== 'dead'; i++) {
      g.player.hp = 100;
      g.melee().attack();
      await new Promise(r => setTimeout(r, 260));
    }
    return { hp0, hp: s.hp, state: s.state, shot: g.upFire().shot, sol: [s.pos.x, s.pos.z].map(Math.round) };
  });
  console.log('   down from the roof:', JSON.stringify(back));
  check(
    back.hp < back.hp0 || back.state === 'dead',
    `the player's rounds reach him in the street (${back.hp0} → ${back.hp})`,
  );
}

// ---- windows lit at night, while there is power
const lit = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 20 && g.upState().up; i++) {
    const v = g.upState();
    g.tp(v.land[0], v.land[1]);
    g.upToggle();
    await wait(80);
  }
  for (const q of g.sols) q.night = q.day = true;
  g.player.hp = 100;
  const c = g.start();
  g.tp(c[0] + 95, c[1] + 60);
  g.setMin(12 * 60);
  await wait(1500);
  const day = g.lit().k;
  g.setMin(21 * 60 + 30);
  await wait(2500);
  return { day, night: g.lit().k, mats: g.lit().mats, power: g.UT.power };
});
console.log('   lit windows', JSON.stringify(lit));
check(lit.mats >= 3, `wall materials carry lit windows (${lit.mats})`);
check(lit.day === 0 && lit.night > 0.5, `dark by day, lit at night (${lit.day} → ${lit.night.toFixed(2)})`);
await p.screenshot({ path: shot('v2432-night.png'), timeout: 120000 });
const off = await p.evaluate(async () => {
  const g = window.__game;
  const was = g.UT.power;
  g.UT.power = false;
  await new Promise(r => setTimeout(r, 1500));
  const k = g.lit().k;
  g.UT.power = was;
  return k;
});
check(off === 0, 'and dark again when the power is cut');

console.log('errors:', errs.length);
for (const e of errs.slice(0, 3)) console.log('  ', e);
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
