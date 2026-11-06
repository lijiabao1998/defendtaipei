// v24.12 招牌牆: street fronts beyond the spawn blocks carry vertical blades, shop boards, split ACs and the odd big
// rooftop sign on a steel frame; the per-frame budgets still hold on desktop and phone. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot, devices } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4199);
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
  // dressing must not move anything else: no garrison lands on the spawn while the first tiles stream in
  const nearest = await p.evaluate(async () => {
    const g = window.__game;
    let m = 1e9;
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2500));
      for (const q of g.sols) if (q.state !== 'dead' && q.mesh.visible) m = Math.min(m, q.pos.distanceTo(g.player.pos));
    }
    return Math.round(m);
  });
  check(nearest >= 25, `${label}: no soldier on top of the spawn in the first 15 s (nearest ${nearest} m)`);
  const s = await p.evaluate(() => window.__game.signs());
  console.log('  ', label, JSON.stringify(s));
  check(s && s.blades > 500, `${label}: vertical blades across the core (${s?.blades})`);
  check(s && s.boards > 200, `${label}: shop boards (${s?.boards})`);
  check(s && s.bills > 10, `${label}: rooftop signs on steel frames (${s?.bills})`);
  check(s && s.acs > 200, `${label}: split ACs (${s?.acs})`);
  // a busy street well away from the spawn, in daylight
  const stats = await p.evaluate(async () => {
    const g = window.__game;
    g.setMin(11 * 60);
    const a = g.arcSpot();
    g.tp(a.mid[0] + a.nx * 2.2, a.mid[1] + a.nz * 2.2);
    await new Promise(r => setTimeout(r, 4000));
    return g.rinfo();
  });
  console.log('  ', label, 'render', JSON.stringify(stats));
  if (stats) {
    check(stats.calls <= budget.calls, `${label}: ${stats.calls} calls ≤ ${budget.calls}`);
    check(stats.tris <= budget.tris, `${label}: ${stats.tris} tris ≤ ${budget.tris}`);
  }
  if (snap) {
    await p.screenshot({ path: shot('v2412-signs-day.png'), timeout: 120000 });
    await p.evaluate(() => window.__game.setMin(21 * 60));
    await p.waitForTimeout(1500);
    await p.screenshot({ path: shot('v2412-signs-night.png'), timeout: 120000 });
  }
  await ctx.close();
}
await run({ viewport: { width: 1280, height: 800 } }, 'desktop', { calls: 800, tris: 1.05e6 }, true);
await run({ ...devices['Pixel 7'] }, 'phone', { calls: 450, tris: 0.99e6 }, false);
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
