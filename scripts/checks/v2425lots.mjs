// v24.25 the empty land looks like Taiwan: vegetable plots, fenced weeds, pay car parks, little shrines, finer trees, at no
// cost in draw calls worth speaking of, and without getting in anybody's way. argv: [url] (default: vite preview).
import { devices } from 'playwright';
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4211);
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
await p.waitForTimeout(4000);
const core = await p.evaluate(() => window.__game.lots());
console.log('  ', JSON.stringify(core));
check(core.core.cells > 60, `the core's open ground has something on it (${core.core.cells} cells)`);
check(core.core.veg > 0 && core.core.weeds > 0, 'vegetable plots and weedy lots');
check(core.core.park > 0 || core.core.corner > 0, 'and car parks or shrines');
check(core.core.slab > 0, 'and old slabs left alone');
check(core.core.veg < core.core.cells / 12, 'vegetable plots are not most of it');
check(core.core.tris < 200000, `at a price (${core.core.tris} triangles in all, drawn only where they are)`);

// walk about the open places and look
const views = await p.evaluate(async () => {
  const g = window.__game;
  g.setMin(11 * 60);
  const P = g.player.pos;
  const scene = P && g.player.mesh.parent;
  void scene;
  return true;
});
void views;

// the walls of the buildings stay reachable: a fence never stands right in front of a door
const doors = await p.evaluate(() => {
  const g = window.__game;
  let bad = 0,
    n = 0;
  for (const B of g.policeBlds()) {
    if (!B.door) continue;
    n++;
    if (g.walkLine(B.door[0], B.door[1], B.door[0] + 0.1, B.door[1] + 0.1) !== true) bad++;
  }
  return { n, bad };
});
console.log('  ', JSON.stringify(doors));
check(doors.bad === 0, 'nothing stands in a door');

// a tour of what grew, for the eye
const stops = await p.evaluate(() => window.__game.lotStops?.() ?? []);
console.log('   stops', stops.length);
let n = 0;
for (const s of stops) {
  await p.evaluate(q => {
    const g = window.__game;
    g.setMin(11 * 60);
    for (const o of g.sols)
      if (Math.hypot(o.pos.x - q.x, o.pos.z - q.z) < 60) ((o.state = 'dead'), (o.hp = 0), (o.mesh.visible = false));
    g.tp(q.x + 1, q.z + 1);
  }, s);
  await p.waitForTimeout(3000);
  await p.screenshot({ path: shot(`v2425-${s.kind}-${n++}.png`), timeout: 120000 });
}

// outer tiles get them too, and the budgets hold there
const tiles = await p.evaluate(async () => {
  const g = window.__game;
  g.setMin(11 * 60);
  const S = g.player.pos;
  g.tp(S.x + 600, S.z + 300);
  await new Promise(r => setTimeout(r, 9000));
  return { ...g.lots().tiles, r: g.rinfo() };
});
console.log('  ', JSON.stringify(tiles));
check(tiles.cells > 0, `outer tiles get them too (${tiles.cells} cells)`);
await p.screenshot({ path: shot('v2425-outer.png'), timeout: 120000 });

console.log('errors:', errs.length, errs.slice(0, 3));
await p.close();

// budgets, on a phone, at the spawn
const ctx = await b.newContext(devices['iPhone 13']);
const q = await ctx.newPage();
q.on('pageerror', e => errs.push(String(e)));
await q.goto(url);
await pickRole(q, { g: 'm', skipIntro: true });
await q.waitForTimeout(6000);
const ph = await q.evaluate(() => window.__game.rinfo());
console.log('   phone', JSON.stringify(ph));
check(ph.calls <= 450, `phone: within the draw-call budget (${ph.calls} ≤ 450)`);
check(ph.tris <= 990000, `phone: within the triangle budget (${ph.tris} ≤ 990000)`);
await ctx.close();
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
