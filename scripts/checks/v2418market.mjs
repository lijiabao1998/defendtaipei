// v24.18 東三水街市場 (walk the aisle, search stalls, cook what you find, shelter from the rain), and a reclaimed outer
// district that shows flags and neighbours. Budgets, shader errors, screenshots. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot, devices } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4205);
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
const M = await p.evaluate(() => window.__game.market());
check(!!M, 'the market exists');
console.log(
  '  ',
  JSON.stringify({ bays: M?.bays, stalls: M?.conts.length, first: M?.frames[0], last: M?.frames.at(-1) }),
);
check(M.bays >= 25, `a long lane of bays (${M.bays})`);
check(M.conts.length >= 10, `stalls to search (${M.conts.length})`);
check(new Set(M.conts.map(c => c.label)).size >= 5, 'several kinds of stall');
const walk = await p.evaluate(M => {
  const g = window.__game;
  for (let i = 0; i < M.frames.length - 1; i++) {
    const r = g.walkLine(M.frames[i][0], M.frames[i][1], M.frames[i + 1][0], M.frames[i + 1][1]);
    if (r !== true) return { i, r };
  }
  return null;
}, M);
check(!walk, `a clear walk down the aisle${walk ? ' blocked ' + JSON.stringify(walk) : ''}`);
const mid = M.frames[Math.floor(M.frames.length / 2)];
await p.evaluate(q => {
  const g = window.__game;
  g.setMin(9 * 60);
  g.tp(q[0], q[1]);
}, mid);
await p.waitForTimeout(4500);
await p.screenshot({ path: shot('v2418-market-day.png'), timeout: 120000 });
const inside = await p.evaluate(() => ({ indoor: window.__game.indoorHere(), r: window.__game.rinfo() }));
console.log('   render', JSON.stringify(inside.r));
check(inside.indoor, 'under the market roof you are sheltered');
const cutY = await p.evaluate(() => window.__game.cutY());
check(cutY < 10, 'walking in lifts the roof, and the lane can be seen');
check(
  inside.r.calls <= 800 && inside.r.tris <= 1.05e6,
  `desktop budget (${inside.r.calls} calls, ${inside.r.tris} tris)`,
);
const c0 = M.conts[Math.floor(M.conts.length / 2)];
const prompt = await p.evaluate(async c => {
  window.__game.tp(c.p[0], c.p[1]);
  await new Promise(r => setTimeout(r, 900));
  return document.getElementById('prompt')?.textContent || '';
}, c0);
console.log('   prompt:', prompt);
check(prompt.includes(c0.label), `a stall can be searched (${c0.label})`);
// what you find can be cooked
const cook = await p.evaluate(() => {
  const g = window.__game;
  g.addItem('cstove', 1);
  g.addItem('butane', 3);
  g.addItem('rawfish', 1);
  g.addItem('rawpork', 1);
  g.addItem('cabbage', 1);
  return {
    fish: g.cookOne('rawfish'),
    pork: g.cookOne('rawpork'),
    veg: g.cookOne('cabbage'),
    inv: { ...g.player.inv },
  };
});
check(
  cook.inv.friedfish >= 1 && cook.inv.friedpork >= 1 && cook.inv.friedcabbage >= 1,
  'fish, pork and cabbage can be cooked',
);
await p.evaluate(q => {
  const g = window.__game;
  g.tp(q[0], q[1]);
  g.setMin(21 * 60);
}, mid);
await p.waitForTimeout(2200);
await p.screenshot({ path: shot('v2418-market-night.png'), timeout: 120000 });
// a reclaimed outer district: flags and neighbours on the tiles around you
const out = await p.evaluate(async () => {
  const g = window.__game;
  const [x, z, outer] = g.sectorAt(6);
  g.setMin(11 * 60);
  g.tp(x, z);
  g.liberate(7);
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (g.reclaim().tiles > 0 && i > 6) break;
  }
  return { outer, tiles: g.reclaim().tiles, r: g.rinfo(), at: [x, z] };
});
console.log('   outer', JSON.stringify(out));
check(out.outer, 'that district is outside the core');
check(out.tiles > 0, `its tiles are dressed (${out.tiles})`);
await p.waitForTimeout(1500);
await p.screenshot({ path: shot('v2418-outer-reclaimed.png'), timeout: 120000 });
await ctx.close();
// phone: the budget in the market
const ph = await b.newContext({ ...devices['Pixel 7'] });
const q = await ph.newPage();
watch(q);
await q.goto(url);
await pickRole(q, { g: 'f', skipIntro: true });
const r2 = await q.evaluate(async c => {
  const g = window.__game;
  g.setMin(9 * 60);
  g.tp(c[0], c[1]);
  await new Promise(r => setTimeout(r, 4000));
  return g.rinfo();
}, mid);
console.log('   phone', JSON.stringify(r2));
check(r2.calls <= 450 && r2.tris <= 0.99e6, `phone budget (${r2.calls} calls, ${r2.tris} tris)`);
await ph.close();
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
