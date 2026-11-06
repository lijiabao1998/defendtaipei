// v24.16 華西街觀光夜市: a glazed arcade over the real pedestrian street, gates at both ends, a clear walk down the middle,
// stalls to search for food, within budget, lit at night until the power goes. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot, devices } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4203);
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
const H = await p.evaluate(() => window.__game.huaxi());
check(!!H, 'the arcade exists');
console.log(
  '  ',
  JSON.stringify({ bays: H?.bays, conts: H?.conts.length, first: H?.frames[0], last: H?.frames.at(-1) }),
);
check(H.bays >= 30, `a long street of bays (${H.bays})`);
check(H.conts.length >= 12, `stalls to search (${H.conts.length})`);
const FOODS = [
  'bento',
  'boiled',
  'hotnoodle',
  'mantou',
  'rice',
  'oden',
  'egg',
  'cookedrice',
  'snack',
  'roufong',
  'can',
  'driedtofu',
];
check(
  H.conts.every(c => Object.keys(c.items).some(k => FOODS.includes(k))),
  'every stall has something to eat',
);
// walking the length of the street, down the middle
const walk = await p.evaluate(H => {
  const g = window.__game;
  const F = H.frames;
  let blocked = null;
  for (let i = 0; i < F.length - 1 && !blocked; i++) {
    const r = g.walkLine(F[i][0], F[i][1], F[i + 1][0], F[i + 1][1]);
    if (r !== true) blocked = { i, r };
  }
  return blocked;
}, H);
check(!walk, `a clear walk down the middle of the street${walk ? ' blocked ' + JSON.stringify(walk) : ''}`);
// in the middle of the market, by day
const mid = H.frames[Math.floor(H.frames.length / 2)];
await p.evaluate(q => {
  const g = window.__game;
  g.setMin(11 * 60);
  g.tp(q[0], q[1]);
}, mid);
await p.waitForTimeout(4500);
await p.screenshot({ path: shot('v2416-huaxi-day.png'), timeout: 120000 });
const r1 = await p.evaluate(() => window.__game.rinfo());
console.log('   render', JSON.stringify(r1));
check(r1.calls <= 800 && r1.tris <= 1.05e6, `desktop budget (${r1.calls} calls, ${r1.tris} tris)`);
// a stall can be searched from where you stand
const c0 = H.conts[Math.floor(H.conts.length / 2)];
const prompt = await p.evaluate(async id => {
  const g = window.__game;
  const c = g.conts.find(q => q.id === id);
  g.tp(c.p[0], c.p[1]);
  await new Promise(r => setTimeout(r, 900));
  return document.getElementById('prompt')?.textContent || '';
}, c0.id);
console.log('   prompt:', prompt);
check(/攤/.test(prompt), 'a stall can be searched');
// the gate at the Guangzhou Street end
const end = H.frames.at(-1),
  ac = H.across.at(-1);
await p.evaluate(q => window.__game.tp(q[0], q[1] + 4), end);
await p.waitForTimeout(3500);
await p.screenshot({ path: shot('v2416-huaxi-gate.png'), timeout: 120000 });
void ac;
// at night, with power
await p.evaluate(q => {
  const g = window.__game;
  g.tp(q[0], q[1]);
  g.setMin(21 * 60);
}, mid);
await p.waitForTimeout(2500);
await p.screenshot({ path: shot('v2416-huaxi-night.png'), timeout: 120000 });
await ctx.close();
// phone
const ph = await b.newContext({ ...devices['Pixel 7'] });
const q = await ph.newPage();
watch(q);
await q.goto(url);
await pickRole(q, { g: 'f', skipIntro: true });
const r2 = await q.evaluate(async c => {
  const g = window.__game;
  g.setMin(11 * 60);
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
