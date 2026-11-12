// v24.30 upstairs is drawn where it really is: the real world is rendered under and around the floor (a first pass
// with the camera moved to where the floor really is), every building with stairs can be climbed to its rooftop, and
// the floors are flats with rooms and furniture that is actually drawn. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4217);
const url = gameUrl(process.argv[2] || srv?.url).replace(/\?.*$/, '');
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
await p.goto(url);
await pickRole(p, { g: 'f', skipIntro: true, entryTimeout: 240000 });
await p.waitForTimeout(25000);

// a dozen buildings near the start, core and district: all the way up, floor by floor
const runs = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  g.setMin(11 * 60);
  const c = g.start();
  const all = g
    .stairs()
    .map(s => ({ ...s, dist: Math.hypot(s.c[0] - c[0], s.c[1] - c[1]) }))
    .sort((a, b) => a.dist - b.dist);
  const picks = [...all.filter(s => s.d === 'core').slice(0, 9), ...all.filter(s => s.d !== 'core').slice(0, 3)];
  const out = [];
  for (const s of picks) {
    g.player.hp = 100;
    for (const q of g.sols) q.night = q.day = true;
    g.tp(s.foot[0], s.foot[1]);
    await wait(700);
    const r = { d: s.d, top: s.top, floors: [], roof: null };
    for (let f = 2; f <= s.top + 1; f++) {
      const u0 = g.upState();
      if (u0.up) {
        if (!u0.upFoot) break;
        g.tp(u0.upFoot[0], u0.upFoot[1]);
      }
      if (!g.upToggle()) break;
      await wait(900);
      const u = g.upState();
      const row = {
        f: u.f,
        roof: u.roof,
        fy: u.fy,
        np: u.np,
        conts: u.conts.length,
        furnX: u.furnX,
        world: g.upDraw.calls,
      };
      if (u.roof) r.roof = row;
      else r.floors.push(row);
    }
    // and down again
    for (let i = 0; i < 16 && g.upState().up; i++) {
      const u = g.upState();
      g.tp(u.land[0], u.land[1]);
      g.upToggle();
      await wait(120);
    }
    r.down = !g.upState().up;
    out.push(r);
  }
  return out;
});
for (const r of runs)
  console.log(
    '  ',
    r.d.padEnd(10),
    'top',
    r.top,
    'floors',
    r.floors.map(f => `${f.f}:${f.np}p/${f.conts}c`).join(' '),
    'roof',
    r.roof ? `at ${r.roof.fy.toFixed(1)} m` : 'NO',
  );
const floors = runs.flatMap(r => r.floors);
check(runs.length >= 10, `buildings climbed (${runs.length})`);
check(
  runs.every(r => r.floors.length === r.top - 1),
  `every floor is reached (${runs.filter(r => r.floors.length === r.top - 1).length}/${runs.length})`,
);
check(
  runs.every(r => r.roof),
  `every one of them has a way onto its rooftop (${runs.filter(r => r.roof).length}/${runs.length})`,
);
check(
  runs.every(r => r.down),
  'and a way back down to the street',
);
check(
  floors.every(f => f.world > 100),
  `the real world is drawn under each floor (${Math.min(...floors.map(f => f.world))}+ draw calls in the first pass)`,
);
check(
  floors.every(f => f.np >= 6),
  `each floor is furnished (${Math.min(...floors.map(f => f.np))}–${Math.max(...floors.map(f => f.np))} pieces)`,
);
check(
  floors.every(f => f.conts >= 1),
  `and has something to search (${Math.min(...floors.map(f => f.conts))}+ containers)`,
);
check(
  floors.every(f => f.furnX > 5000),
  'the furniture is drawn on its floor, not at the map origin',
);
check(
  runs.filter(r => r.roof).every(r => r.roof.fy > 5 && r.roof.np === 0),
  'the rooftop is at the height of the roof, in the open',
);

// a picture of each, for the eye
const pics = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const c = g.start();
  const s = g
    .stairs()
    .map(s => ({ ...s, dist: Math.hypot(s.c[0] - c[0], s.c[1] - c[1]) }))
    .sort((a, b) => a.dist - b.dist)
    .find(s => s.d === 'core' && s.top >= 3);
  g.tp(s.foot[0], s.foot[1]);
  await wait(800);
  g.upToggle();
  await wait(2500);
  return g.upState().f;
});
await p.screenshot({ path: shot('v2430-floor.png'), timeout: 120000 });
check(pics === 2, 'a second floor to look at');
await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 12 && !g.upState().roof; i++) {
    const u = g.upState();
    if (!u.upFoot) break;
    g.tp(u.upFoot[0], u.upFoot[1]);
    g.upToggle();
    await wait(600);
  }
  await wait(2000);
});
await p.screenshot({ path: shot('v2430-roof.png'), timeout: 120000 });

console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
