// v24.0 Taipei daylight: the morning is daylight (not a third of it, as under the old sin curve), midday is flat,
// dusk is warm, and it is fully dark before the 20:00 curfew. Lighting only: isNight() still flips at 20:00 / 06:00.
// Screenshots at 05:50, 07:30, 12:00, 17:40, 18:50 and 21:00. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4187);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
const failed = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
await p.goto(url);
await pickRole(p, { g: 'm', role: 'office', skipIntro: true });
const at = async (h, m, name) => {
  await p.evaluate(t => window.__game.setMin(t), h * 60 + m);
  await p.waitForTimeout(700);
  const L = await p.evaluate(() => window.__game.light());
  await p.screenshot({ path: shot(`v240-${name}.png`) });
  console.log(`  ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, JSON.stringify(L));
  return L;
};
const dawn = await at(5, 50, '0550');
const morning = await at(7, 30, '0730');
const noon = await at(12, 0, '1200');
const dusk = await at(17, 40, '1740');
const blue = await at(18, 50, '1850');
const night = await at(21, 0, '2100');
check(morning.day > 0.95, `07:30 is daylight (day ${morning.day.toFixed(2)}, was 0.35 under the sin curve)`);
check(noon.day === 1 && noon.warm === 0, '12:00 is flat daylight with no warm tint');
check(dawn.day > 0.2 && dawn.day < 0.8 && dawn.warm > 0, '05:50 is a warm dawn');
check(dusk.warm > 0.5 && dusk.day > 0.6, '17:40 is golden hour (warm, still light)');
check(blue.day < 0.4 && blue.day > 0, '18:50 is blue hour');
check(night.day === 0 && night.warm === 0, '21:00 is full night');
check(await p.evaluate(() => window.__game.dayh !== undefined), 'game hooks intact');
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
