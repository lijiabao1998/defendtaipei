// v24.13 看板: wall-sized billboards on the fronts of wide streets (thick around Ximending and Zhonghua Road) and
// continuous rows of shop fascia; the budgets still hold. Daylight and night shots. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot, devices } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4200);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
async function run(ctxOpts, label, budget, snap) {
  const ctx = await b.newContext(ctxOpts);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url);
  await pickRole(p, { g: 'f', skipIntro: true });
  const s = await p.evaluate(() => window.__game.signs());
  console.log('  ', label, JSON.stringify({ ...s, wallAt: s?.wallAt?.length }));
  check(s && s.walls >= 15, `${label}: wall billboards (${s?.walls})`);
  check(s && s.boards >= 2000, `${label}: continuous shop fascia (${s?.boards} boards)`);
  // a wall billboard, in daylight, looking from the street
  const stats = await p.evaluate(async () => {
    const g = window.__game;
    const at = g.signs().wallAt[0];
    g.setMin(11 * 60);
    g.tp(at[0], at[1]);
    await new Promise(r => setTimeout(r, 4000));
    return g.rinfo();
  });
  console.log('  ', label, 'render', JSON.stringify(stats));
  check(stats.calls <= budget.calls, `${label}: ${stats.calls} calls ≤ ${budget.calls}`);
  check(stats.tris <= budget.tris, `${label}: ${stats.tris} tris ≤ ${budget.tris}`);
  if (snap) {
    await p.screenshot({ path: shot('v2413-ads-day.png'), timeout: 120000 });
    await p.evaluate(() => window.__game.setMin(21 * 60));
    await p.waitForTimeout(1500);
    await p.screenshot({ path: shot('v2413-ads-night.png'), timeout: 120000 });
  }
  await ctx.close();
}
await run({ viewport: { width: 1280, height: 800 } }, 'desktop', { calls: 800, tris: 1.05e6 }, true);
await run({ ...devices['Pixel 7'] }, 'phone', { calls: 450, tris: 0.99e6 }, false);
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
