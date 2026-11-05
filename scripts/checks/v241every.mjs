// v24.1 every building enterable, every floor searchable.
// - core: every footprint has a door; (nearly) every door has a furnished plan; multi-storey blocks have stairs
// - district: every footprint of the loaded tiles is enterable (street door, else a back door on a free side)
// - floors: in a 3F+ walk-up, climb 1F → 2F → 3F by the upper flight, check each floor has its own containers,
//   then come back down floor by floor
// - budget: the spawn view stays within v23.9.0's draw calls / triangles (desktop)
// argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4188);
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
await pickRole(p, { g: 'm', role: 'office', skipIntro: true });
await p.evaluate(() => window.__game.setMin(10 * 60));
await p.waitForTimeout(2500);
const r0 = await p.evaluate(() => window.__game.rinfo());
const s0 = await p.evaluate(() => window.__game.enterStats());
console.log('  spawn', JSON.stringify(r0), JSON.stringify(s0.core));
check(s0.core.door === s0.core.n, `core: every footprint has a door (${s0.core.door}/${s0.core.n})`);
check(s0.core.plan === s0.core.door, `core: every door leads to a furnished plan (${s0.core.plan}/${s0.core.door})`);
check(
  s0.core.empty <= s0.core.plan * 0.02,
  `core: (nearly) every plan has something to search (${s0.core.empty} empty)`,
);
check(s0.core.stair > 381, `core: more stairwells than v23.9 (${s0.core.stair}, was 381)`);
check(r0.calls <= 800 && r0.tris <= 1.05e6, `spawn view within budget (${r0.calls} calls, ${r0.tris} tris)`);

// district tiles around a few points outside the core
let dn = 0,
  de = 0;
for (const [x, z] of [
  [0, 700],
  [300, -800],
  [-800, 300],
]) {
  await p.evaluate(([x, z]) => window.__game.tp(x, z), [x, z]);
  // tiles stream in over a few seconds (software WebGL in CI is slow): wait for footprints, then a little more
  await p
    .waitForFunction(() => window.__game.enterStats().district.n > 0, null, { timeout: 60000, polling: 500 })
    .catch(() => {});
  await p.waitForTimeout(3000);
  const d = await p.evaluate(() => window.__game.enterStats().district);
  console.log('  district at', x, z, JSON.stringify(d));
  dn = Math.max(dn, d.n);
  de = Math.max(de, d.enter);
  check(d.n > 0 && d.enter === d.n, `district at ${x},${z}: every footprint enterable (${d.enter}/${d.n})`);
}

// floors: back to the spawn block, pick a core walk-up of 3+ storeys with stairs
await p.evaluate(() => window.__game.tp(window.__game.start()[0], window.__game.start()[1]));
await p.waitForTimeout(2500);
const st = await p.evaluate(() => {
  const g = window.__game;
  const P = [g.player.pos.x, g.player.pos.z];
  return g
    .stairs()
    .filter(s => s.d === 'core' && s.top >= 3)
    .sort((a, b) => Math.hypot(a.c[0] - P[0], a.c[1] - P[1]) - Math.hypot(b.c[0] - P[0], b.c[1] - P[1]))[0];
});
check(!!st, `a core walk-up with 3+ storeys and stairs (${st && st.id}, ${st && st.top} storeys)`);
if (st) {
  await p.evaluate(f => window.__game.tp(f[0], f[1]), st.foot);
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__game.upToggle());
  await p.waitForTimeout(800);
  const f2 = await p.evaluate(() => window.__game.upState());
  check(f2.up && f2.f === 2 && f2.conts.length > 0, `1F → 2F (${f2.conts.length} containers)`);
  check(!!f2.upFoot, '2F has a flight up to 3F');
  await p.evaluate(q => window.__game.tp(q[0], q[1]), f2.upFoot);
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__game.upToggle());
  await p.waitForTimeout(800);
  const f3 = await p.evaluate(() => window.__game.upState());
  await p.screenshot({ path: shot('v241-3f.png') });
  const ids2 = new Set(f2.conts.map(c => c[0]));
  check(f3.up && f3.f === 3 && f3.conts.length > 0, `2F → 3F (${f3.conts.length} containers)`);
  check(
    f3.conts.every(c => !ids2.has(c[0])),
    `3F containers are its own (e.g. ${f3.conts[0] && f3.conts[0][0]} vs ${f2.conts[0] && f2.conts[0][0]})`,
  );
  check(f3.top === st.top, `top floor is the building's storeys (${f3.top})`);
  await p.evaluate(q => window.__game.tp(q[0], q[1]), f3.land);
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__game.upToggle());
  await p.waitForTimeout(800);
  const back2 = await p.evaluate(() => window.__game.upState());
  check(back2.up && back2.f === 2, '3F → 2F by the landing');
  await p.evaluate(q => window.__game.tp(q[0], q[1]), back2.land);
  await p.waitForTimeout(400);
  await p.evaluate(() => window.__game.upToggle());
  await p.waitForTimeout(800);
  const g1 = await p.evaluate(() => window.__game.upState());
  check(!g1.up, '2F → ground floor');
}
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
