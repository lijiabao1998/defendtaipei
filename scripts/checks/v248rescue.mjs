// v24.8 樓上有人在求救: at 09:00 a text message names a street and a floor; the family is on that floor of a
// walk-up near the (roughly) marked spot. Climb the stairs floor by floor, find them, talk: they head for the
// shelter (an away group member comes with them), karma and spirits go up, and they hand over a little food.
// argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4195);
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
await pickRole(p, { g: 'f', role: 'nurse', skipIntro: true });
await p.evaluate(() => window.__game.setMin(9 * 60 + 5));
await p.waitForTimeout(2500);
const r0 = await p.evaluate(() => window.__game.rescue());
console.log('  ', JSON.stringify(r0));
check(!!r0.R && r0.R.f >= 2, `a call for help at 09:00 (floor ${r0.R && r0.R.f}, near ${r0.R && r0.R.street})`);
const here0 = await p.evaluate(() => window.__game.surv().group.filter(g => g.here).length);
// climb to that floor
const st = await p.evaluate(id => window.__game.stairs().find(s => s.d === 'core' && s.id === id), r0.R?.bid);
check(!!st, 'the walk-up has stairs');
if (st) {
  await p.evaluate(f => window.__game.tp(f[0], f[1]), st.foot);
  await p.waitForTimeout(500);
  await p.evaluate(() => window.__game.upToggle());
  await p.waitForTimeout(600);
  for (let i = 0; i < 12; i++) {
    const u = await p.evaluate(() => window.__game.upState());
    if (!u.up || u.f >= r0.R.f || !u.upFoot) break;
    await p.evaluate(q => window.__game.tp(q[0], q[1]), u.upFoot);
    await p.waitForTimeout(300);
    await p.evaluate(() => window.__game.upToggle());
    await p.waitForTimeout(600);
  }
  const u = await p.evaluate(() => window.__game.upState());
  check(u.up && u.f === r0.R.f, `climbed to floor ${u.f}`);
  const r1 = await p.evaluate(() => window.__game.rescue());
  check(!!r1.npc, 'someone is up here');
  await p.screenshot({ path: shot('v248-found.png') });
  if (r1.npc) {
    await p.evaluate(q => window.__game.tp(q[0] + 0.6, q[1]), r1.npc);
    await p.waitForTimeout(300);
    const ok = await p.evaluate(() => window.__game.rescueTalk());
    const r2 = await p.evaluate(() => ({
      R: window.__game.rescue().R,
      here: window.__game.surv().group.filter(g => g.here).length,
      dlg: document.getElementById('dlg')?.textContent || '',
    }));
    check(ok && r2.R.done === 1, 'they are rescued');
    check(r2.here === here0 + 1, `a group member joins the shelter (${here0} → ${r2.here})`);
    check(/避難所|shelter/.test(r2.dlg), 'rescue dialogue');
  }
}
// next morning a new call (and nothing failed, since this one was done)
await p.evaluate(() => window.__game.setMin(24 * 60 + 9 * 60 + 5));
await p.waitForTimeout(2500);
const r3 = await p.evaluate(() => window.__game.rescue());
check(r3.R && r3.R.day === 1 && !r3.R.done, 'a new call the next morning');
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
