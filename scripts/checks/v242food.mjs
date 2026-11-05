// v24.2 the food loop: what there is to eat in Taipei, and what you have to do to eat it.
// - raw rice / dried vermicelli cannot be eaten; with a 卡式爐 + butane can they cook into a meal (one can each)
// - the stove picks what is needed: boils rainwater when thirst is the problem
// - unboiled rainwater / raw eggs can upset your stomach (risk)
// - after a day without power, fresh food rolled in containers is spoiled, and half of what you carry rots at 06:00
// - the shelter's gas stove runs on butane and cooks a bag of rice (or vermicelli) for the whole group
// argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4189);
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
await pickRole(p, { g: 'f', role: 'nurse', skipIntro: true });
const r = await p.evaluate(() => {
  const g = window.__game,
    P = g.player,
    out = {};
  const inv = () => ({ ...P.inv });
  // raw rice without a stove: refused, nothing consumed
  for (const k of Object.keys(P.inv)) delete P.inv[k];
  g.addItem('rawrice', 1);
  g.useItem('rawrice');
  out.noStove = inv();
  // with the stove and two cans: rice cooks, then the stove boils rainwater when thirsty
  g.addItem('cstove', 1);
  g.addItem('butane', 2);
  g.useItem('rawrice');
  out.cooked = inv();
  g.addItem('rainwater', 1);
  P.thirst = 10;
  P.hunger = 90;
  g.useItem('cstove');
  out.boiled = inv();
  g.addItem('mianxian', 1);
  out.noGas = g.cookOne('mianxian');
  // eating the cooked rice fills you up
  P.hunger = 20;
  g.useItem('cookedrice');
  out.hungerAfter = P.hunger;
  // risk: drink unboiled rainwater many times, count the stomach cramps
  let hp0 = 0,
    cramps = 0;
  for (let i = 0; i < 60; i++) {
    P.hp = 100;
    hp0 = P.hp;
    g.addItem('rainwater', 1);
    g.useItem('rainwater');
    if (P.hp < hp0) cramps++;
  }
  out.cramps = cramps;
  // spoilage of rolled loot: a counter before the blackout vs a day after it
  const tally = () => {
    const t = { fresh: 0, rotten: 0 };
    for (let sd = 1; sd <= 40; sd++)
      for (const [k, n] of Object.entries(g.rollLoot('counter', sd * 7919)))
        if (k === 'rotten') t.rotten += n;
        else if (['egg', 'oden', 'rice', 'bento'].includes(k)) t.fresh += n;
    return t;
  };
  g.setMin(10 * 60);
  out.counterFresh = tally();
  g.setMin(g.POWER_OFF + 1440 + 60);
  out.counterLate = tally();
  // carried food rots at 06:00
  for (const k of Object.keys(P.inv)) delete P.inv[k];
  g.addItem('bento', 4);
  g.addItem('can', 3);
  g.spoilCarried();
  out.carried = inv();
  out.stove = g.surv().upg ? Object.keys(g.surv().upg) : null;
  return out;
});
console.log('  ', JSON.stringify(r));
check(r.noStove.rawrice === 1, 'raw rice is not eaten without a stove');
check(!r.cooked.rawrice && r.cooked.cookedrice === 1 && r.cooked.butane === 1, 'stove + butane cooks rice (one can)');
check(!r.boiled.rainwater && r.boiled.boiled === 1 && !r.boiled.butane, 'thirsty: the stove boils rainwater first');
check(r.noGas === false, 'no butane left: nothing cooks');
check(r.hungerAfter >= 69, `a pot of rice fills you up (hunger ${Math.round(r.hungerAfter)})`);
check(r.cramps > 5 && r.cramps < 45, `unboiled rainwater sometimes upsets the stomach (${r.cramps}/60)`);
check(
  r.counterFresh.fresh > 40 && r.counterFresh.rotten === 0 && r.counterLate.fresh === 0 && r.counterLate.rotten > 10,
  `a day after the blackout, counter food is spoiled (40 counters: ${JSON.stringify(r.counterFresh)} → ${JSON.stringify(r.counterLate)})`,
);
check(
  r.carried.bento === 2 && r.carried.rotten === 2 && r.carried.can === 3,
  'carried fresh food rots by half, cans keep',
);
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
