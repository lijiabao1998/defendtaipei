// v24.5 the stopped traffic: during the morning-commute prologue the streets are moving (no wreckage, no walls);
// once it ends, cars / taxis / buses sit abandoned in the lanes, scooters fill the kerbs, barriers and litter, and
// the vehicles are solid low cover. All of it instanced per 80 m cell: the spawn view stays within the v23.9 budget.
// Screenshots: a main road and the spawn street. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4192);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
const failed = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
await p.goto(url);
await pickRole(p, { g: 'f', role: 'office', skipIntro: false });
await p.waitForTimeout(1500);
const pro = await p.evaluate(() => window.__game.wreck());
check(!pro.visible && !pro.live, 'during the prologue the streets are still moving (no wreckage, no walls)');
await p.evaluate(() => window.__game.endPrologue());
await p.waitForTimeout(1500);
await p.evaluate(() => window.__game.setMin(10 * 60));
await p.waitForTimeout(1500);
const w = await p.evaluate(() => window.__game.wreck());
console.log('  ', JSON.stringify(w));
check(w.visible && w.live, 'after the prologue: wreckage shown and solid');
check(w.cars > 800 && w.buses > 20 && w.burnt > 20, `abandoned cars ${w.cars}, buses ${w.buses}, burnt ${w.burnt}`);
check(w.kerbScooters > 2000, `kerbside scooter rows (${w.kerbScooters})`);
check(w.barriers > 50 && w.debris > 3000, `barriers ${w.barriers}, litter ${w.debris}`);
check(w.segs > 4000, `vehicles and barriers are cover (${w.segs} wall segments)`);
const r0 = await p.evaluate(() => window.__game.rinfo());
check(r0.calls <= 800 && r0.tris <= 1.05e6, `spawn view within budget (${r0.calls} calls, ${r0.tris} tris)`);
await p.screenshot({ path: shot('v245-spawn.png') });
const rp = await p.evaluate(() => window.__game.roadPt());
await p.evaluate(q => window.__game.tp(q[0], q[1]), rp);
await p.waitForTimeout(2500);
const r1 = await p.evaluate(() => window.__game.rinfo());
check(r1.calls <= 800 && r1.tris <= 1.05e6, `main road view within budget (${r1.calls} calls, ${r1.tris} tris)`);
await p.screenshot({ path: shot('v245-mainroad.png') });
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
