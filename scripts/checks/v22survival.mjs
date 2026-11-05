// v22 survival layer: shelter panel + upgrades, a day tick, the moral choice, barter, night bonus; screenshots.
// argv: url outDir
import { launch, pickRole } from '../lib.mjs';
const [url, out] = process.argv.slice(2);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1100, height: 760 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'f', role: 'nurse', skipIntro: true });
await p.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
  timeout: 900000,
  polling: 2000,
});
const G = s => p.evaluate(`(()=>{const g=window.__game;${s}})()`);
const res = {};
res.home = await G(`return g.surv().home`);
await G(
  `const h=g.surv().home;g.tp(h[0],h[1]);g.addItem('plank',6);g.addItem('cloth',2);g.addItem('scrap',3);g.addItem('butane',2);g.addItem('seeds',1);g.addItem('can',3);g.openSurv('home')`,
);
await p.waitForTimeout(500);
for (const a of ['u:boards', 'u:beds', 'u:stove', 'u:planter', 'dep', 'pray'])
  await p.click(`#surv button[data-a="${a}"]`);
res.upg = await G(`return Object.keys(g.surv().upg)`);
res.stash = await G(`return g.surv().stash`);
// run three mornings
for (let i = 0; i < 3; i++) (await G(`g.setMin(g.gm()+1440)`), await p.waitForTimeout(1500));
res.day = await G(`return g.surv().day`);
await G(`g.closeSurv();g.openSurv('home')`);
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/shelter.png` });
res.group = await G(`return g.surv().group.map(x=>[x.name,x.here,Math.round(x.mood),x.dead||false])`);
await G(`g.closeSurv();g.openSurv('moral')`);
await p.waitForTimeout(300);
await p.screenshot({ path: `${out}/moral.png` });
await G(`g.closeSurv()`);
const T = await G(`return g.SV.TRADE_SPOTS[0]`);
await G(`g.tp(${T.x},${T.z});g.addItem('cig',12);g.openSurv('trade')`);
await p.waitForTimeout(3000);
await p.screenshot({ path: `${out}/barter.png` });
await p.click('#surv button[data-a="b:rice"]');
res.cigAfter = await G(`return g.player.inv.cig`);
await G(`g.closeSurv();g.setMin(g.gm()+ (22*60 - g.gm()%1440 + 1440)%1440)`);
await p.waitForTimeout(4000);
await p.screenshot({ path: `${out}/night.png` });
res.night = await G(`return g.SV.isNight(g.gm())`);
res.ending = await G(`return g.SV.endingText(g.surv())`);
console.log(JSON.stringify({ res, errs }));
await b.close();
