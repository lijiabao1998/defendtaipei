// v24.14 奪回. An occupied core district shows the occupier's red banners; the moment it is reclaimed the title, the
// firecrackers and the neighbours' gifts arrive; the banners give way to flags and people on the street; at 06:00 the
// reclaimed districts send food to the shelter; a reloaded save restores the street without replaying the party.
// argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot, devices } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4201);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(String(e)));
// a shader that does not compile only reaches the console, and these materials have hand-written shader chunks
p.on('console', m => {
  if (m.type() === 'error' && /shader|webglprogram/i.test(m.text())) errs.push(m.text().slice(0, 300));
});
await p.goto(url);
await pickRole(p, { g: 'f', skipIntro: true });
await p.mouse.click(640, 400); // unlock audio
const s0 = await p.evaluate(() => {
  const g = window.__game;
  const r = g.reclaim();
  // the first core district with a street spot: reclaim() frees districts in index order, so this is district 0
  const at = r.s[0].spot;
  g.setMin(11 * 60);
  g.tp(at[0], at[1]);
  return { ...r, s: r.s.slice(0, 6), at };
});
console.log('  ', JSON.stringify({ ...s0, s: s0.s.map(q => [q.occ, q.free, !!q.spot]) }));
check(s0.banners > 50, `red order banners on the walls (${s0.banners})`);
check(s0.crossings > 5, `banners strung across the wide roads (${s0.crossings})`);
check(s0.flags > 100, `flags ready for the windows and roofs (${s0.flags})`);
check(s0.people > 50, `neighbours ready for the street (${s0.people})`);
check(s0.s[0].occ && !s0.s[0].free, 'occupied: banners up, no flags or crowd');
check(s0.ms < 500, `banners built quickly at boot (${s0.ms} ms)`);
await p.waitForTimeout(3500);
await p.screenshot({ path: shot('v2414-occupied.png'), timeout: 120000 });
// reclaim it
const before = await p.evaluate(() => {
  const g = window.__game;
  const inv = { ...g.player.inv };
  const mood = g.surv().group.map(q => q.mood);
  const karma = g.surv().karma;
  // the title fades after a few seconds: catch its text the moment it appears
  window.__titleSeen = '';
  new MutationObserver(() => {
    const t = document.getElementById('reclaim-title');
    if (t) window.__titleSeen = t.textContent;
  }).observe(document.body, { childList: true });
  g.liberate(1);
  return { inv, mood, karma };
});
await p.waitForFunction(() => window.__titleSeen, null, { timeout: 120000, polling: 200 });
const party = await p.evaluate(() => {
  const g = window.__game;
  return {
    title: window.__titleSeen,
    freeMs: g.reclaim().freeMs,
    inv: { ...g.player.inv },
    mood: g.surv().group.map(q => q.mood),
    karma: g.surv().karma,
    fire: g.sounds().firecrackers || 0,
    vis: g.reclaim().s[0],
  };
});
console.log('  ', party.title);
check(/奪回來了|ours again/.test(party.title), 'the title goes up');
check(party.freeMs < 1500, `a district's flags and neighbours build quickly (${party.freeMs} ms)`);
check(party.fire >= 1, `firecrackers (${party.fire})`);
const got = Object.keys(party.inv).filter(k => (party.inv[k] || 0) > (before.inv[k] || 0));
check(got.length >= 2, `the neighbours hand over supplies (${got.join(', ')})`);
check(party.karma === before.karma + 1, 'karma up');
check(
  party.mood.every((m, i) => m >= before.mood[i]),
  'the shelter is in better spirits',
);
check(!party.vis.occ && party.vis.free, 'reclaimed: banners down, flags and crowd out');
await p.waitForTimeout(2500);
await p.screenshot({ path: shot('v2414-reclaimed.png'), timeout: 120000 });
// a wall with flags on it: the flags have to be drawn, not just counted
const wall = await p.evaluate(() => window.__game.reclaim().s[0].wall);
check(!!wall, 'a flagged wall to look at');
if (wall) {
  await p.evaluate(q => window.__game.tp(q[0], q[1]), wall);
  await p.waitForTimeout(3000);
  await p.screenshot({ path: shot('v2414-flags.png'), timeout: 120000 });
}
const r1 = await p.evaluate(() => window.__game.rinfo());
const libAt = await p.evaluate(() => window.__game.surv().libAt);
check(libAt && libAt[0], `the crowd's place is remembered for the save (${JSON.stringify(libAt)})`);
console.log('   render', JSON.stringify(r1));
check(r1.calls <= 800 && r1.tris <= 1.05e6, `desktop budget (${r1.calls} calls, ${r1.tris} tris)`);
// 06:00: food from the reclaimed districts (two districts → one rice)
const dawn = await p.evaluate(async () => {
  const g = window.__game;
  g.liberate(2);
  const s = g.surv();
  s.stash.rice = 50;
  const t = (Math.floor(g.gm() / 1440) + 1) * 1440 + 6 * 60 + 1;
  let seen = '';
  const ob = new MutationObserver(() => (seen += document.getElementById('log')?.textContent || ''));
  ob.observe(document.getElementById('log'), { childList: true, subtree: true });
  g.setMin(t);
  for (let i = 0; i < 40 && !/奪回街區的街坊|reclaimed districts left/.test(seen); i++)
    await new Promise(r => setTimeout(r, 500));
  ob.disconnect();
  return { told: /奪回街區的街坊|reclaimed districts left/.test(seen), seen: seen.slice(-120) };
});
check(dawn.told, 'at 06:00 food arrives at the shelter');
// a reloaded save: the street stays reclaimed, and the party and the gifts do not happen again
const invBefore = await p.evaluate(() => {
  const g = window.__game;
  g.save();
  sessionStorage.setItem('dt.autoload', '1');
  return { ...g.player.inv };
});
await p.reload({ waitUntil: 'commit' });
await p.waitForFunction(() => window.__game?.started?.(), null, { timeout: 300000, polling: 500 });
await p.waitForTimeout(4000);
const back = await p.evaluate(() => {
  const g = window.__game;
  return {
    vis: g.reclaim().s[0],
    inv: { ...g.player.inv },
    title: !!document.getElementById('reclaim-title'),
    fire: g.sounds().firecrackers || 0,
  };
});
check(!back.vis.occ && back.vis.free, 'reloaded: the street is still reclaimed');
check(!back.title && back.fire === 0, 'reloaded: no second party');
check(JSON.stringify(back.inv) === JSON.stringify(invBefore), 'reloaded: no second gift');
await ctx.close();
// phone budget on a reclaimed street
const ph = await b.newContext({ ...devices['Pixel 7'] });
const q = await ph.newPage();
q.on('pageerror', e => errs.push(String(e)));
await q.goto(url);
await pickRole(q, { g: 'f', skipIntro: true });
const r2 = await q.evaluate(async () => {
  const g = window.__game;
  const before = g.rinfo();
  const at = g.reclaim().s[0].spot;
  g.setMin(11 * 60);
  g.tp(at[0], at[1]);
  g.liberate(1);
  await new Promise(r => setTimeout(r, 4000));
  return { before, after: g.rinfo() };
});
console.log('   phone', JSON.stringify(r2));
check(
  r2.after.calls <= 450 && r2.after.tris <= 0.99e6,
  `phone budget (${r2.after.calls} calls, ${r2.after.tris} tris)`,
);
await ph.close();
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
