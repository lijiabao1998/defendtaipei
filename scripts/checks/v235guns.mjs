// v23.5 guns: every gun item shows its own model in the hand; sustained full-auto fire builds heat (muzzle climb,
// braced stance), throws spent cases and lights the muzzle; natural healing is faster when fed and watered.
// Close-up screenshots of a few silhouettes and of a burst. argv: [url] (default: serve dist/ with vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4185);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'm', role: 'courier', skipIntro: true });
await p.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
  timeout: 900000,
  polling: 2000,
});
const G = s => p.evaluate(`(()=>{const g=window.__game;${s}})()`);
const wait = ms => p.waitForTimeout(ms);
const fail = [];
const res = {};
// 0. natural healing first, while it is quiet: faster when food and water are both ≥ 80, none while bleeding
const rate = async (hu, th, bl) => G(`const P=g.player;P.hunger=${hu};P.thirst=${th};P.bleed=${bl};return g.regen()`);
res.regen = {
  full: await rate(95, 95, false),
  fed: await rate(60, 60, false),
  hungry: await rate(40, 90, false),
  bleeding: await rate(95, 95, true),
};
if (!(res.regen.full > res.regen.fed && res.regen.fed > 0 && res.regen.hungry === 0 && res.regen.bleeding === 0))
  fail.push(`regen tiers wrong ${JSON.stringify(res.regen)}`);
await G(`const P=g.player;P.hp=60;P.hunger=95;P.thirst=95;P.bleed=false`);
await wait(1500);
res.moodle = await p.evaluate(() => document.getElementById('stats')?.textContent || '');
if (!/回血中|Healing/.test(res.moodle)) fail.push(`no healing indicator in "${res.moodle}"`);
{
  const hp0 = await G(`return g.player.hp`);
  let hp1 = hp0;
  for (let i = 0; i < 40 && hp1 <= hp0 + 0.5; i++) {
    await G(`g.setSpeed(20)`);
    await wait(1000);
    hp1 = await G(`return g.player.hp`);
  }
  await G(`g.setSpeed(1)`);
  res.healed = +(hp1 - hp0).toFixed(1);
  if (!(hp1 > hp0 + 0.5)) fail.push(`no healing over time (${hp0} → ${hp1})`);
}
// an open street at midday, zoomed right in (test-only zoom; the game camera is unchanged)
const [rx, rz] = await G(`return g.roadPt()`);
await G(`g.tp(${rx},${rz})`);
await G(`g.setTime(720)`);
await wait(2500);
await G(`g.zoomTo(7)`);
await p.mouse.move(700, 350);
await wait(800);
// 1. every gun item has a model in the hand
const GUNS = [
  'pistol',
  'qsz92',
  't75p',
  'rifle',
  'qbz191',
  't91',
  't65k2',
  'qbz95',
  'qbu191',
  'qbu88',
  't93',
  'qjy88',
  't75saw',
  'qcw05',
  'qbs09',
  'kestrel',
  'at4',
  'jav',
];
res.models = {};
for (const k of GUNS) {
  await G(`g.addItem('${k}',1);g.equipSet('${k}')`);
  await wait(400);
  const st = await G(`return g.gun()`);
  res.models[k] = st.fam;
  if (!st.model || st.kind !== k) fail.push(`${k}: no model in hand (${JSON.stringify(st)})`);
  if (['qsz92', 't91', 'qbz95', 't93', 'qjy88', 'qbs09', 'kestrel'].includes(k))
    await p.screenshot({ path: shot(`gun-${k}.png`), timeout: 120000 });
}
// 2. full-auto burst with the QJY-88: heat climbs, cases fly, the light flashes
await G(`g.addItem('qjy88',1);g.addItem('a556',300);g.equipSet('qjy88')`);
await wait(500);
const before = await G(`return g.gun()`);
await p.mouse.down();
let peak = 0,
  burstShot = false;
for (let i = 0; i < 10; i++) {
  await wait(250);
  const st = await G(`return g.gun()`);
  peak = Math.max(peak, st.heat);
  if (!burstShot && i === 5) {
    await p.screenshot({ path: shot('gun-burst.png'), timeout: 120000 });
    burstShot = true;
  }
}
await p.mouse.up();
const after = await G(`return g.gun()`);
res.burst = {
  shots: after.shots - before.shots,
  cases: after.cases - before.cases,
  flashes: after.flashes - before.flashes,
  peakHeat: +peak.toFixed(2),
  liveCases: after.live,
};
if (res.burst.shots < 4) fail.push(`burst: only ${res.burst.shots} shots`);
if (peak < 0.5) fail.push(`burst: heat only reached ${peak}`);
if (res.burst.cases < 3 || after.live < 1) fail.push(`burst: no spent cases (${JSON.stringify(res.burst)})`);
if (res.burst.flashes < 3) fail.push(`burst: no muzzle light (${res.burst.flashes})`);
// heat cools once the trigger is released (game time runs slower than wall time under software rendering)
res.cooled = 1;
for (let i = 0; i < 40 && res.cooled > 0.05; i++) {
  await wait(500);
  res.cooled = +(await G(`return g.gun().heat`)).toFixed(2);
}
if (res.cooled > 0.05) fail.push(`heat did not cool down (${res.cooled})`);
console.log(JSON.stringify({ res, fail, errs }, null, 1));
await b.close();
srv?.stop();
process.exit(fail.length || errs.length ? 1 : 0);
