// v24.10 after the blackout the street is dark except where somebody is still living: candle / camping-lamp
// windows glow warm and unsteady; and the Japanese aircraft are heard — the F-2's roar as it passes, the
// AH-64DJ's rotor while it is on station. Screenshot of a blacked-out night street. argv: [url].
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4196);
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
await pickRole(p, { g: 'm', role: 'jp', skipIntro: true });
await p.mouse.click(600, 380); // unlock audio
await p.waitForTimeout(500);
// before the blackout, at night: the candle windows are ordinary lit windows
await p.evaluate(() => window.__game.setMin(22 * 60));
await p.waitForTimeout(1500);
const on = await p.evaluate(() => window.__game.facade().candle());
// after the blackout, at night: they glow on their own
await p.evaluate(() => window.__game.setMin(window.__game.POWER_OFF + 120));
await p.waitForTimeout(2000);
const off = await p.evaluate(() => window.__game.facade().candle());
console.log('  candle (power on, power cut):', on, off);
check(on === 0, 'with power the candle windows are ordinary lit windows');
check(off > 0.4, `after the blackout they still glow (${off.toFixed(2)})`);
await p.screenshot({ path: shot('v2410-blackout-night.png') });
// aircraft sounds
const s = await p.evaluate(() => {
  const g = window.__game,
    P = g.player.pos;
  g.jpTalk();
  g.addItem('battery', 3);
  const ss = g.sols.filter(s => s.state !== 'dead').slice(0, 2);
  ss.forEach((s, i) => {
    s.pos.set(P.x + 40 + i, 0, P.z + 2);
    s.mesh.position.copy(s.pos);
  });
  g.jpCall('strike');
  g.jpTick(9);
  g.jpCall('heli');
  g.jpTick(12);
  return g.sounds();
});
console.log('  ', JSON.stringify(s));
check((s.jet || 0) >= 1, `the F-2 pass is heard (${s.jet || 0})`);
check((s.rotor || 0) >= 3, `the AH-64DJ rotor is heard (${s.rotor || 0})`);
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
