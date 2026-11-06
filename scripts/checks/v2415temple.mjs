// v24.15 the great temple is a place you can walk into: a clear route from the square through the front door and
// round the burner to every altar, roofs that lift when you go in, shelter under the roofs but not in the courtyard,
// things to search, and fewer draw calls than the solid block it replaced. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot, devices } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4202);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const watch = p => {
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => {
    if (m.type() === 'error' && /shader|webglprogram/i.test(m.text())) errs.push(m.text().slice(0, 300));
  });
};
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
watch(p);
await p.goto(url);
await pickRole(p, { g: 'f', skipIntro: true });
const T = await p.evaluate(() => window.__game.temple());
console.log('  ', JSON.stringify({ tris: T.tris, meshes: T.meshes, at: T.at, conts: T.conts.length }));
check(T.meshes === 4, 'the whole temple is four meshes');
check(T.tris < 60000, `a sensible weight (${T.tris} tris)`);
const altars = T.conts.filter(c => c.label === '供桌'),
  boxes = T.conts.filter(c => c.label === '功德箱');
check(altars.length === 4, `offering tables to search (${altars.length})`);
check(boxes.length === 2, `donation boxes to search (${boxes.length})`);
check(
  T.conts.every(c => Object.keys(c.items).length > 0),
  'none of them is empty',
);
const X = T.at.x,
  Z = T.at.z;
// the routes on foot, in temple coordinates (front is +z)
const walk = (a, c, d, e) =>
  p.evaluate(q => window.__game.walkLine(q[0], q[1], q[2], q[3]), [X + a, Z + c, X + d, Z + e]);
const routes = [
  ['square → through the front door', 1.5, 34, 1.5, 11],
  ['arch → square', 4, 40, 4, 30],
  ['courtyard → past the burner → main hall altar', 1.5, 11, 1.5, -2.4],
  ['courtyard → down the side → rear hall', 11.3, 11, 11.3, -13],
  ['rear hall → rear altars', 11.3, -14, -11.3, -14],
  ['side door of the front hall', -7, 24, -7, 14],
];
for (const [name, a, c, d, e] of routes) {
  const r = await walk(a, c, d, e);
  check(r === true, `${name}${r === true ? '' : ' blocked at ' + JSON.stringify(r)}`);
}
const w1 = await walk(-8, 30, 8, 30);
check(w1 === true, 'the square in front is clear');
const wall = await walk(-16.5, 0, -14, 0);
check(wall !== true, 'the outer wall still stops you');
// outside, in daylight
await p.evaluate(
  q => {
    const g = window.__game;
    g.setMin(11 * 60);
    g.tp(q[0], q[1] + 23);
  },
  [X, Z],
);
await p.waitForTimeout(4000);
await p.screenshot({ path: shot('v2415-temple-day.png'), timeout: 120000 });
const rOut = await p.evaluate(() => window.__game.rinfo());
console.log('   render outside', JSON.stringify(rOut));
check(rOut.calls <= 800 && rOut.tris <= 1.05e6, `desktop budget (${rOut.calls} calls, ${rOut.tris} tris)`);
const out = await p.evaluate(() => ({ cut: window.__game.cutY(), indoor: window.__game.indoorHere() }));
check(out.cut > 1000, 'outside: the roofs are on');
check(!out.indoor, 'outside: not indoors');
// in the courtyard: roofs off, open to the sky
await p.evaluate(q => window.__game.tp(q[0] + 3, q[1] + 8.4), [X, Z]);
await p.waitForTimeout(2500);
await p.screenshot({ path: shot('v2415-temple-inside.png'), timeout: 120000 });
const yard = await p.evaluate(() => ({ cut: window.__game.cutY(), indoor: window.__game.indoorHere() }));
check(yard.cut < 10, 'inside the walls: the roofs lift');
check(!yard.indoor, 'in the courtyard you are under the sky');
// in the main hall: a roof over you, and the altar in reach
await p.evaluate(q => window.__game.tp(q[0], q[1] - 2.2), [X, Z]);
await p.waitForTimeout(800);
const hall = await p.evaluate(() => ({
  indoor: window.__game.indoorHere(),
  prompt: document.getElementById('prompt')?.textContent || '',
}));
console.log('   prompt:', hall.prompt);
check(hall.indoor, 'in the main hall you are indoors');
check(/供桌|Offering/.test(hall.prompt), 'the offering table can be searched');
// night
await p.evaluate(
  q => {
    const g = window.__game;
    g.tp(q[0], q[1] + 23);
    g.setMin(21 * 60);
  },
  [X, Z],
);
await p.waitForTimeout(2500);
await p.screenshot({ path: shot('v2415-temple-night.png'), timeout: 120000 });
await ctx.close();
// phone
const ph = await b.newContext({ ...devices['Pixel 7'] });
const q = await ph.newPage();
watch(q);
await q.goto(url);
await pickRole(q, { g: 'f', skipIntro: true });
const r2 = await q.evaluate(
  async c => {
    const g = window.__game;
    g.setMin(11 * 60);
    g.tp(c[0], c[1] + 23);
    await new Promise(r => setTimeout(r, 4000));
    return g.rinfo();
  },
  [X, Z],
);
console.log('   phone', JSON.stringify(r2));
check(r2.calls <= 450 && r2.tris <= 0.99e6, `phone budget (${r2.calls} calls, ${r2.tris} tris)`);
await ph.close();
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
