// v24.17 the Red House and Bopiliao are places you can walk into: clear routes through every door, something to search in
// every room, roofs that lift, shelter under them, budgets. No shader errors. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot, devices } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4204);
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
const L = await p.evaluate(() => window.__game.landmarks());
const R = L.list.find(q => q.kind === 'redhouse'),
  B = L.list.find(q => q.kind === 'bopiliao');
const rc = L.conts.filter(c => c.id.startsWith('lmk_r')),
  bc = L.conts.filter(c => c.id.startsWith('lmk_b'));
check(rc.length === 9, `Red House: eight craft stalls and the tea room (${rc.length})`);
check(bc.length === 9, `Bopiliao: nine shops to search (${bc.length})`);
check(
  L.conts.every(c => Object.keys(c.items).length > 0),
  'none of them is empty',
);
console.log('   not placed in the world:', JSON.stringify(L.ghosts));
const walkFrom = (O, a, c, d, e) =>
  p.evaluate(q => window.__game.walkLine(q[0], q[1], q[2], q[3]), [O.x + a, O.z + c, O.x + d, O.z + e]);
const routes = [
  ['Red House: in through the front door', R, 44, 0.6, 35, 0.6],
  ['Red House: round the counter', R, 34.5, 3.6, 24, 3.6],
  ['Red House: to the hall door', R, 24, 3.6, 21, 0.6],
  ['Red House: through into the hall', R, 21, 0.6, 16, 0.6],
  ['Red House: down the hall, past the display tables', R, 16, 1.5, -15, 1.5],
  ['Red House: out of the end door', R, -15, 1.5, -21, 0.2],
  ['Red House: out through the north arm', R, 0, 0, 0, -13.5],
  ['Red House: out through the south arm', R, 0, 0, 0, 13.5],
];
for (let i = 0; i < 9; i++) {
  const x = i * 6 - 24;
  // the last unit looks onto a neighbour's wall: come along the arcade, one continuous walk, to its door
  if (i < 8) routes.push([`Bopiliao ${i}: to the arcade`, B, x, 6.5, x, 3.4]);
  else routes.push([`Bopiliao ${i}: along the arcade from next door`, B, 18, 3.8, 24, 3.8]);
  routes.push([`Bopiliao ${i}: through the door to the counter`, B, x, 3.4, x, -0.6]);
  routes.push([`Bopiliao ${i}: round the counter`, B, x + 2.2, -0.6, x + 2.2, -3.4]);
  routes.push([`Bopiliao ${i}: out the back door`, B, x, -3.4, x, -6.5]);
}
for (const [name, O, a, c, d, e] of routes) {
  const r = await walkFrom(O, a, c, d, e);
  check(r === true, `${name}${r === true ? '' : ' blocked at ' + JSON.stringify(r)}`);
}
const slot = await walkFrom(R, 21, 7.5, 18, 6.5);
check(slot !== true, 'no gap between the hall and the octagon');
const wall = await walkFrom(R, 30, -13, 30, -9);
check(wall !== true, 'the octagon wall stops you');
// Red House from outside, then inside
await p.evaluate(q => {
  const g = window.__game;
  g.setMin(11 * 60);
  g.tp(q.x + 47, q.z + 3);
}, R);
await p.waitForTimeout(4000);
await p.screenshot({ path: shot('v2417-redhouse.png'), timeout: 120000 });
const out = await p.evaluate(() => ({
  cut: window.__game.cutY(),
  indoor: window.__game.indoorHere(),
  r: window.__game.rinfo(),
}));
console.log('   render', JSON.stringify(out.r));
check(out.cut > 1000 && !out.indoor, 'outside: roofs on, not indoors');
check(out.r.calls <= 800 && out.r.tris <= 1.05e6, `desktop budget (${out.r.calls} calls, ${out.r.tris} tris)`);
await p.evaluate(q => window.__game.tp(q.x + 2, q.z + 3), R);
await p.waitForTimeout(2500);
await p.screenshot({ path: shot('v2417-redhouse-inside.png'), timeout: 120000 });
const inn = await p.evaluate(() => ({ cut: window.__game.cutY(), indoor: window.__game.indoorHere() }));
check(inn.cut < 10 && inn.indoor, 'in the hall: the roof lifts and you are indoors');
// a stall can be searched
const c0 = rc[2];
const pr = await p.evaluate(async c => {
  window.__game.tp(c.p[0], c.p[1]);
  await new Promise(r => setTimeout(r, 900));
  return document.getElementById('prompt')?.textContent || '';
}, c0);
console.log('   prompt:', pr);
check(/文創|Craft/.test(pr), 'a craft stall can be searched');
// Bopiliao
await p.evaluate(q => window.__game.tp(q.x, q.z + 11), B);
await p.waitForTimeout(3500);
await p.screenshot({ path: shot('v2417-bopiliao.png'), timeout: 120000 });
await p.evaluate(q => window.__game.tp(q.x, q.z - 0.6), B);
await p.waitForTimeout(2500);
await p.screenshot({ path: shot('v2417-bopiliao-inside.png'), timeout: 120000 });
const bi = await p.evaluate(() => ({
  cut: window.__game.cutY(),
  indoor: window.__game.indoorHere(),
  prompt: document.getElementById('prompt')?.textContent || '',
}));
console.log('   prompt:', bi.prompt);
check(bi.cut < 10 && bi.indoor, 'in a shop: the roof lifts and you are indoors');
check(bi.prompt.includes('搜刮') || /Search/i.test(bi.prompt), 'the shop can be searched');
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
    g.tp(c[0], c[1]);
    await new Promise(r => setTimeout(r, 4000));
    return g.rinfo();
  },
  [R.x + 47, R.z + 3],
);
console.log('   phone', JSON.stringify(r2));
check(r2.calls <= 450 && r2.tris <= 0.99e6, `phone budget (${r2.calls} calls, ${r2.tris} tris)`);
await ph.close();
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
