// v24.7 the sounds of a Taipei evening.
// - 19:00 on the first evenings the garbage truck plays 《給愛麗絲》 coming up the street (log line once a day)
// - once the power is cut it never comes again: at 19:00 the silence is told instead
// - near a temple: bell, 木魚 and chanting; in a downpour: thunder
// Audio needs a user gesture: the check clicks the page first. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4194);
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
await p.mouse.click(550, 350); // unlock the audio contexts
await p.waitForTimeout(800);
// the HUD log keeps 8 lines and fades them: collect everything that appears in it
await p.evaluate(() => {
  window.__logSeen = '';
  new MutationObserver(() => (window.__logSeen += document.getElementById('log')?.textContent || '')).observe(
    document.getElementById('log'),
    { childList: true, subtree: true },
  );
});
const logText = () => p.evaluate(() => window.__logSeen + (document.getElementById('log')?.textContent || ''));
// day 1, 19:00: the truck
await p.evaluate(() => window.__game.setMin(19 * 60 + 1));
await p.waitForTimeout(4000);
const s1 = await p.evaluate(() => window.__game.sounds());
const l1 = await logText();
console.log('  ', JSON.stringify(s1));
check((s1.garbage_truck || 0) > 0, `the garbage truck plays at 19:00 (${s1.garbage_truck || 0} phrases)`);
check(/給愛麗絲|Für Elise/.test(l1), 'and it is told once (log line)');
// after the blackout: silence at 19:00
await p.evaluate(() => window.__game.setMin(window.__game.POWER_OFF + 1440 + 5)); // day 4, 19:05 (a day after the cut)
await p.waitForTimeout(2500);
const t0 = (await p.evaluate(() => window.__game.sounds())).garbage_truck || 0;
await p.waitForTimeout(2500);
const t1 = (await p.evaluate(() => window.__game.sounds())).garbage_truck || 0;
const l2 = await logText();
check(t1 === t0, 'after the blackout the truck does not come');
check(/沒有來|did not come/.test(l2), 'and the silence is told');
// a temple: walk up to the nearest one
const tp = await p.evaluate(() => {
  const g = window.__game;
  const k = g.coreKinds().find(q => q.kind === 'temple');
  return k ? k.inside : null;
});
if (tp) {
  await p.evaluate(q => window.__game.tp(q[0], q[1]), tp);
  await p.evaluate(() => window.__game.setMin(10 * 60));
  await p
    .waitForFunction(() => (window.__game.sounds().temple || 0) > 0, null, { timeout: 90000, polling: 1000 })
    .catch(() => {});
}
const s3 = await p.evaluate(() => window.__game.sounds());
check(!!tp && (s3.temple || 0) > 0, `temple bell and chanting nearby (${s3.temple || 0}, ${s3.templeD} m)`);
// a downpour: thunder
await p.evaluate(() => {
  window.__game.setMin(15 * 60 + 5); // the first downpour is due from 15:00
  window.__game.simRain(4);
});
await p
  .waitForFunction(() => (window.__game.sounds().thunder || 0) > 0, null, { timeout: 90000, polling: 1000 })
  .catch(() => {});
const s4 = await p.evaluate(() => window.__game.sounds());
check((s4.thunder || 0) > 0, `thunder in the rain (${s4.thunder || 0})`);
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
