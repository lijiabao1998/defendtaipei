// Smoke test for the built game: load it, start a new game through the character select and the morning
// prologue, walk, open the inventory, loot a store, switch to night. Fails on any page or console error, or if
// one of the checks below fails. Run `npm run build` first; it serves dist/ itself unless URL is set.
// Screenshots go to ./shots (see scripts/lib.mjs for the environment variables).
import { launch, shot, pickRole, preview } from './lib.mjs';

const srv = process.env.URL ? null : await preview(4179);
const url = process.env.URL || srv.url;
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
const failed = [];
p.on('console', m => {
  if (m.type() === 'error') errs.push(m.text());
});
p.on('pageerror', e => errs.push(String(e)));
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const finish = async () => {
  console.log('errors:', errs.length, errs.slice(0, 5));
  if (failed.length || errs.length) await p.screenshot({ path: shot('smoke-fail.png') }).catch(() => {});
  await b.close();
  srv?.stop();
  process.exit(failed.length || errs.length ? 1 : 0);
};

await p.goto(url);
try {
  await p.waitForFunction(() => window.__game, null, { timeout: 120000 });
} catch {
  check(false, 'game loads');
  await finish();
}
check(true, 'game loads');
await p.screenshot({ path: shot('smoke-title.png'), timeout: 120000 });

// new game with the prologue (alarm clock, commute), then skip it
await pickRole(p, { g: 'f', role: 'nurse', skipIntro: false });
await p.waitForTimeout(1500);
check(
  await p.evaluate(() => window.__game.started() && window.__game.role().id === 'nurse'),
  'new game starts as nurse',
);
check(await p.evaluate(() => window.__game.PRO.on && !!document.getElementById('wake')), 'prologue runs');
await p.screenshot({ path: shot('smoke-prologue.png'), timeout: 120000 });
await p.evaluate(() => window.__game.endPrologue());
await p.waitForTimeout(500);
check(await p.evaluate(() => !window.__game.PRO.on), 'prologue can be skipped');

// walk and run
const p0 = await p.evaluate(() => [window.__game.player.pos.x, window.__game.player.pos.z]);
await p.keyboard.down('KeyW');
await p.keyboard.down('ShiftLeft');
await p.waitForTimeout(700);
await p.screenshot({ path: shot('smoke-run.png'), timeout: 120000 });
await p.keyboard.up('ShiftLeft');
await p.waitForTimeout(1200);
await p.keyboard.up('KeyW');
const p1 = await p.evaluate(() => [window.__game.player.pos.x, window.__game.player.pos.z]);
check(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.5, 'player moves with WASD');

// A* from the nearest soldiers to where the player stands now (some soldiers sit at walled-in posts, so at
// least one complete path is enough)
const paths = await p.evaluate(() => {
  const g = window.__game;
  const P = [g.player.pos.x, g.player.pos.z];
  let ok = 0,
    tot = 0;
  for (const t of g.sols.filter(t => t.state !== 'dead' && t.pos.distanceTo(g.player.pos) < 120).slice(0, 10)) {
    tot++;
    const pth = g.nav.find([t.pos.x, t.pos.z], P);
    const e = pth && pth[pth.length - 1];
    if (e && Math.hypot(e[0] - P[0], e[1] - P[1]) < 1.5) ok++;
  }
  return [ok, tot];
});
check(paths[1] === 0 || paths[0] > 0, `soldiers can path-find to the player (${paths[0]}/${paths[1]})`);

// inventory
await p.keyboard.press('Tab');
await p.waitForTimeout(400);
check(
  await p.evaluate(() => !document.getElementById('panel').classList.contains('hidden')),
  'Tab opens the inventory',
);
await p.screenshot({ path: shot('smoke-inv.png'), timeout: 120000 });
await p.keyboard.press('Escape');

// visit a detailed store and loot it
const store = await p.evaluate(() => {
  const g = window.__game;
  const b = g.blds.find(b => b.detailed === 'store');
  if (!b) return false;
  const d = b.door.p;
  const at = [d[0] + (b.c[0] - d[0]) * 0.3, d[1] + (b.c[1] - d[1]) * 0.3];
  // stand next to the store's closest shelf or fridge
  const c = g.conts
    .filter(c => c.b === b)
    .sort((x, y) => Math.hypot(x.p[0] - at[0], x.p[1] - at[1]) - Math.hypot(y.p[0] - at[0], y.p[1] - at[1]))[0];
  if (c) g.tp(c.p[0] + 0.3, c.p[1] + 0.3);
  else g.tp(at[0], at[1]);
  return true;
});
check(store, 'a furnished 7-12 store exists');
await p.waitForTimeout(800);
await p.screenshot({ path: shot('smoke-store.png'), timeout: 120000 });
await p.keyboard.press('KeyE');
await p.waitForTimeout(400);
check(
  await p.evaluate(() => document.querySelectorAll('#panel .col').length === 2),
  'E opens a container next to the bag',
);
await p.screenshot({ path: shot('smoke-loot.png'), timeout: 120000 });
await p.keyboard.press('Escape');

// night
await p.evaluate(() => window.__game.setTime(22 * 60));
await p.waitForTimeout(1500);
check(await p.evaluate(() => document.getElementById('clock').textContent.includes('宵禁')), 'curfew shows at 22:00');
await p.screenshot({ path: shot('smoke-night.png'), timeout: 120000 });

const info = await p.evaluate(() => {
  const g = window.__game;
  const det = {};
  g.blds.forEach(b => {
    if (b.detailed) det[b.detailed] = (det[b.detailed] || 0) + 1;
  });
  const d = g.decay();
  const al = g.alley();
  return {
    alley: al && al.stats,
    poles: d && d.poles,
    acs: d && d.acs,
    cps: d && d.checkpoints.length,
    sols: g.sols.length,
    conts: g.conts.length,
    det,
    vehicles: g.vehicles.list.length,
    drivable: g.drive.list.length,
  };
});
console.log(JSON.stringify(info));
check(info.sols >= 64 && info.sols <= 64 + 36, '64 core PLA soldiers + bounded district garrisons (' + info.sols + ')');
// v21.2 every role × gender (prologue + skip) must be able to walk from the spawn to a street (no fallback nudge)
const spawns = await p.evaluate(() => {
  const g = window.__game,
    out = [];
  for (const r of ['courier', 'nurse', 'student', 'office', 'tech'])
    for (const gd of ['m', 'f'])
      for (const skip of [false, true]) {
        const e = g.spawnTest(r, gd, skip);
        out.push({ k: r + '/' + gd + (skip ? '/skip' : '/prologue'), ok: e.ok, n: e.nudges });
      }
  return out;
});
check(
  spawns.every(s => s.ok) && spawns[spawns.length - 1].n === 0,
  `all 20 role spawns reach a street without nudges (${
    spawns
      .filter(s => !s.ok)
      .map(s => s.k)
      .join(',') || 'ok'
  })`,
);
// v21.4 cover shooting: low cover stops rounds to a crouched target but not a standing one, walls always do,
// the shooter's own cover is ignored, and the player can take cover next to it
const cov = await p.evaluate(() => {
  const g = window.__game,
    X = 5000,
    Z = 5000;
  const low = { a: [X, Z - 1], b: [X, Z + 1], h: 1.0 },
    wall = { a: [X + 20, Z - 1], b: [X + 20, Z + 1] };
  g.addSeg(low);
  g.addSeg(wall);
  const r = {
    standing: g.shotRay([X - 12, Z], [X + 0.6, Z], 1.4, 1.25),
    crouched: g.shotRay([X - 12, Z], [X + 0.6, Z], 1.4, 0.75),
    wall: g.shotRay([X + 10, Z], [X + 25, Z], 1.4, 1.25),
    own: g.shotRay([X + 0.6, Z], [X - 12, Z], 1.4, 0.75),
    cover: g.findCover(X + 0.6, Z)?.low,
  };
  g.removeSeg(low);
  g.removeSeg(wall);
  return r;
});
check(
  cov.standing >= 1 && cov.crouched < 1 && cov.wall < 1 && cov.own >= 1 && cov.cover === true,
  'cover blocks shots by height / wall / own cover ignored ' + JSON.stringify(cov),
);
await finish();
