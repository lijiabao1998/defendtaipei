// v24.6 density and its budget.
// - big static meshes are split into cells at boot (core) and when a district tile loads (meshes and static
//   instanced meshes), so off-screen parts are culled
// - the core's empty block interiors are filled with walk-ups behind the street fronts (district streamer): they
//   are enterable like every district building, and the spawn / main-road views stay within budget on desktop
//   and on a phone viewport
// argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot, devices } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4193);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const failed = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const errs = [];
const run = async (ctxOpt, label, budget) => {
  const ctx = await b.newContext(ctxOpt);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url);
  await pickRole(p, { g: 'm', role: 'office', skipIntro: true });
  await p.evaluate(() => window.__game.setMin(10 * 60));
  // wait for the core-area tiles around the spawn (block interiors live in them)
  await p
    .waitForFunction(() => window.__game.enterStats().district.n > 20, null, { timeout: 120000, polling: 500 })
    .catch(() => {});
  await p.waitForTimeout(2500);
  const s = await p.evaluate(() => ({
    r: window.__game.rinfo(),
    blocks: window.__game.blocks(),
    chunks: window.__game.chunks(),
    d: window.__game.enterStats().district,
  }));
  console.log(`  ${label} spawn`, JSON.stringify(s));
  check(
    s.r.calls <= budget.calls && s.r.tris <= budget.tris,
    `${label}: spawn view within budget (${s.r.calls} calls ≤ ${budget.calls}, ${s.r.tris} tris ≤ ${budget.tris})`,
  );
  await p.screenshot({ path: shot(`v246-${label}-spawn.png`), timeout: 180000 });
  const rp = await p.evaluate(() => window.__game.roadPt());
  await p.evaluate(q => window.__game.tp(q[0], q[1]), rp);
  await p.waitForTimeout(3000);
  const r2 = await p.evaluate(() => window.__game.rinfo());
  check(
    r2.calls <= budget.calls && r2.tris <= budget.tris,
    `${label}: main road within budget (${r2.calls} calls, ${r2.tris} tris)`,
  );
  await p.screenshot({ path: shot(`v246-${label}-road.png`), timeout: 180000 });
  await ctx.close();
  return s;
};
const desk = await run({ viewport: { width: 1280, height: 800 } }, 'desktop', { calls: 800, tris: 1.05e6 });
check(desk.blocks.n > 600, `block interiors filled (${desk.blocks.n} walk-ups, ${desk.blocks.ms} ms)`);
check(desk.blocks.ms < 1500, 'block infill is quick at boot');
check(
  desk.chunks && desk.chunks.meshes > 0,
  `big merged meshes split into cells (${desk.chunks && desk.chunks.pieces} pieces)`,
);
check(desk.d.n > 20 && desk.d.enter === desk.d.n, `the new buildings are enterable (${desk.d.enter}/${desk.d.n})`);
// phones: triangles are the GPU cost (30 % under v23.9); draw calls may run a little higher than v23.9's 350
await run({ ...devices['Pixel 7'] }, 'phone', { calls: 450, tris: 0.99e6 });
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
