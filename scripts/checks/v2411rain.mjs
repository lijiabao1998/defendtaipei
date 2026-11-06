// v24.11 台北的雨. An afternoon downpour on a 騎樓 street: rings where the drops land, a water curtain pouring
// off the arcade beam, the clear umbrella over the player (closed while firing, folded under the arcade), the
// lightning flash before the thunder; then, without the umbrella, getting soaked — and sneezing at night.
// argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4198);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1200, height: 760 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
const failed = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
await p.goto(url);
await pickRole(p, { g: 'm', role: 'courier', skipIntro: true });
// stand on the pavement in front of the nearest arcade, an umbrella in the bag, 16:00, downpour
const A = await p.evaluate(() => {
  const g = window.__game;
  const a = g.arcSpot();
  if (!a) return null;
  g.tp(a.mid[0] + a.nx * 2.2, a.mid[1] + a.nz * 2.2);
  g.addItem('umbrella', 1);
  g.setMin(16 * 60);
  g.startRain(1, 3);
  return a;
});
check(!!A, `an arcade front to stand by (${A?.n ?? 0} fronts)`);
await p.waitForTimeout(2500);
const s1 = await p.evaluate(() => ({ fx: window.__game.rainfx(), st: window.__game.rainState() }));
console.log('  ', JSON.stringify(s1));
check(s1.fx.splash > 10, `drops splash on the street (${s1.fx.splash})`);
check(s1.fx.drips > 40, `water pours off the arcade beam (${s1.fx.drips} streaks)`);
check(s1.st.umb, 'the umbrella is open over the player');
await p.screenshot({ path: shot('v2411-downpour.png'), timeout: 120000 });
// close-up for the art: the umbrella and the water curtain
await p.evaluate(() => {
  const c = window.__game.camera;
  c.userData.z0 = c.zoom;
  c.zoom *= 2.6;
  c.updateProjectionMatrix();
});
await p.waitForTimeout(1200);
await p.screenshot({ path: shot('v2411-umbrella.png'), timeout: 120000 });
await p.evaluate(() => {
  const c = window.__game.camera;
  c.zoom = c.userData.z0;
  c.updateProjectionMatrix();
});
// firing closes it for a moment
const fire = await p.evaluate(async () => {
  const g = window.__game;
  g.player.rig.shootT = 0.14;
  await new Promise(r => setTimeout(r, 250));
  const closed = !g.rainState().umb;
  await new Promise(r => setTimeout(r, 2200));
  return { closed, again: g.rainState().umb };
});
check(fire.closed && fire.again, `closed while firing, open again after (${JSON.stringify(fire)})`);
// under the arcade: folded, and you dry off
const under = await p.evaluate(async a => {
  const g = window.__game;
  g.tp(a.mid[0] - a.nx * 1.8, a.mid[1] - a.nz * 1.8);
  await new Promise(r => setTimeout(r, 600));
  const s0 = g.soakSim(1, 0, 0);
  g.soakSim(40, 0.05, 0.05);
  return { umb: g.rainState().umb, before: s0, after: g.soakSim(1, 0, 0) };
}, A);
check(!under.umb, 'under the arcade the umbrella is folded');
check(
  under.after <= under.before,
  `under the arcade you do not get wetter (${under.before.toFixed(2)} → ${under.after.toFixed(2)})`,
);
// lightning: flash first, thunder after
const lt = await p.evaluate(async () => {
  const g = window.__game;
  const t0 = g.sounds().thunder || 0,
    f0 = g.rainfx().flash;
  g.lightning();
  let peak = 0;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => requestAnimationFrame(r));
    peak = Math.max(peak, Number(document.getElementById('lightning').style.opacity) || 0);
  }
  return { flashes: g.rainfx().flash - f0, peak, t0 };
});
check(lt.flashes >= 1 && lt.peak > 0.05, `the lightning flashes (${JSON.stringify(lt)})`);
// without the umbrella, out in the downpour: soaked, the moodle, and at night a sneeze
const soak = await p.evaluate(async a => {
  const g = window.__game;
  delete g.player.inv.umbrella;
  g.tp(a.mid[0] + a.nx * 2.2, a.mid[1] + a.nz * 2.2);
  await new Promise(r => setTimeout(r, 600));
  const s = g.soakSim(8, 0.05, 0.05); // 0.4 h
  await new Promise(r => setTimeout(r, 800));
  const mood = document.getElementById('stats').textContent;
  g.setMin(23 * 60);
  g.startRain(1, 3);
  g.soakSim(400, 0.05, 0.0002); // 20 s at night, still soaked
  return { s, mood, sneezes: g.rainState().sneezes };
}, A);
check(soak.s >= 0.6, `soaked without an umbrella (${soak.s.toFixed(2)})`);
check(/濕透|Soaked/.test(soak.mood), 'the 濕透 moodle shows');
check(soak.sneezes >= 1, `soaked at night you sneeze (${soak.sneezes})`);
// drizzle: fewer, fainter drops and no thunder
const dz = await p.evaluate(async () => {
  const g = window.__game;
  g.setMin(9 * 60);
  g.startRain(0.4, 3);
  await new Promise(r => setTimeout(r, 1500));
  return { ...g.rainState(), drips: g.rainfx().drips };
});
check(dz.amt < 0.5 && dz.drips < s1.fx.drips, `a drizzle is lighter (${dz.amt.toFixed(2)}, ${dz.drips} streaks)`);
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
