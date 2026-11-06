import { launch, shot, pickRole, preview, gameUrl } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4182);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await p.waitForFunction(() => window.__game, null, { timeout: 120000 });
await p.screenshot({ timeout: 180000, path: shot('v7-newgame-daylength.png') });
await pickRole(p, { g: 'f' });
await p.waitForTimeout(800);
const E = f => p.evaluate(f);
const log = (...a) => console.log(...a);
log('dayh', await E(() => window.__game.dayh()));
await E(() => {
  const g = window.__game;
  g.sols.forEach(s => {
    if (s.pos.distanceTo(g.player.pos) < 60) s.pos.x += 300;
  });
  g.setTime(9 * 60);
});
let t0 = await E(() => window.__game.gm());
await p.waitForTimeout(5000);
let t1 = await E(() => window.__game.gm());
log('1x game-min per 5s real', (t1 - t0).toFixed(2));
await E(() => window.__game.setSpeed(20));
t0 = await E(() => window.__game.gm());
await p.waitForTimeout(5000);
t1 = await E(() => window.__game.gm());
log('20x game-min per 5s real', (t1 - t0).toFixed(2), 'speed', await E(() => window.__game.speed()));
await p.screenshot({ timeout: 180000, path: shot('v7-hud-speed.png') });
await E(() => {
  const g = window.__game;
  g.noise(g.player.pos.x + 8, g.player.pos.z, 30);
});
log('after noise speed', await E(() => window.__game.speed()));
await E(() => window.__game.setSpeed(3));
await E(() => {
  window.__game.player.hp -= 15;
});
await p.waitForTimeout(500);
log('after damage speed', await E(() => window.__game.speed()));
// rain + collection after water cut
await E(() => {
  const g = window.__game;
  g.setTime(4 * 1440 + 9 * 60);
  g.WX.rainNext = 0;
  g.WX.rainUntil = 0;
});
await p.waitForTimeout(1500);
await E(() => window.__game.simRain(3));
log(
  await E(() => {
    const g = window.__game;
    return JSON.stringify({
      water: g.UT.water,
      raining: g.gm() < g.WX.rainUntil,
      wet: g.WX.wet.toFixed(2),
      buckets: g.conts.filter(c => c.label === '雨水桶').map(c => c.items.rainwater || 0),
      speed: g.speed(),
    });
  }),
);
await E(() => window.__game.setSpeed(1));
await p.waitForTimeout(3000);
await p.screenshot({ timeout: 180000, path: shot('v7-rain.png') });
await E(() => {
  const g = window.__game;
  g.WX.rainUntil = 0;
  g.WX.rainNext = 1e9;
  g.WX.wet = 0;
  g.WX.amt = 0;
});
for (let i = 0; i < 4; i++) await p.mouse.wheel(0, -100);
await p.waitForTimeout(4000);
await p.screenshot({ timeout: 180000, path: shot('v7-road-after.png') });
log('parks', await E(() => JSON.stringify(window.__game.parks())));
const pk = await E(() => window.__game.parks().clusters[0]);
if (pk) {
  await E(new Function(`window.__game.tp(${pk[0]}, ${pk[1]})`));
  await p.waitForTimeout(3000);
  await p.screenshot({ timeout: 180000, path: shot('v7-park.png') });
}
await E(() => window.__game.airdrop());
await p.waitForTimeout(500);
log(
  'airdrop',
  await E(() => JSON.stringify({ ad: window.__game.UT.ad, inv: window.__game.sols.filter(s => s.timer > 500).length })),
);
await E(() => {
  const g = window.__game;
  g.tp(g.UT.ad[0] + 6, g.UT.ad[1] + 6);
});
await p.waitForTimeout(3000);
await p.screenshot({ timeout: 180000, path: shot('v7-airdrop.png') });
log('errors', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(errs.length ? 1 : 0);
