// v22.11 PLA squad AI: roles/flank callouts, wounded retreat, radio pull, coordinated search points, grenade
// on a camping player. argv: url outDir
import { launch, pickRole } from '../lib.mjs';
import fs from 'node:fs';
const [url = 'http://localhost:4173/defendtaipei/', out = 'shots/v2211'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
// (v24.39 through lib's pickRole: since the role select asks for its staged confirmation, one click on 開始 no longer
// started the game and this check timed out before it began)
await pickRole(p, { g: 'f', role: 'nurse', skipIntro: true, entryTimeout: 240000 });
await p.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
  timeout: 180000,
});
const R = {};
await p.evaluate(() => window.__game.endPrologue?.());
await p.waitForTimeout(1500);
// pure helpers: deterministic
R.pure = await p.evaluate(() => {
  const { SQ } = window.__game.ai();
  const m = [5, 2, 9, 7].map((id, i) => ({ id, x: i * 3, z: 0 }));
  const a = SQ.squads(m).map(g => g.map(q => q.id)),
    b2 = SQ.squads(m.slice().reverse()).map(g => g.map(q => q.id));
  return {
    squads: a,
    sameOrder: JSON.stringify(a) === JSON.stringify(b2),
    roles: [0, 1, 2, 3].map(i => SQ.roleOf(i, 4)),
    flank: SQ.flankPoint([0, 0], [10, 0], 1),
    search: SQ.searchPoints([0, 0], 1, 3, null, () => true).map(q => q.map(v => +v.toFixed(2))),
    gren: [0, 2, 4, 6].map(d => Math.round(SQ.grenadeDmg(d))),
  };
});
// live squad: 3 soldiers 12 m east of the player, in combat
const setup = () =>
  p.evaluate(() => {
    const G = window.__game,
      A = G.ai(),
      pl = G.player;
    const live = A.sols.filter(s => s.state !== 'dead' && !s.post && !s.night).slice(0, 3);
    live.forEach((s, i) => {
      s.pos.set(pl.pos.x + 12, 0, pl.pos.z + (i - 1) * 2);
      s.state = 'combat';
      s.alert = 1;
      s.hp = 100;
      s.retreated = false;
      s.lastSeen = [pl.pos.x, pl.pos.z];
    });
    pl.hp = 1e6; // test only: survive the firefight
    window.__sq = live;
    return live.map(s => s.id);
  });
R.ids = await setup();
console.log(JSON.stringify(R));
await p.waitForTimeout(4000);
R.squad = await p.evaluate(() => ({
  roles: window.__sq.map(s => [s.id, s.role, s.slot, s.sqN, s.state]),
  stats: { ...window.__game.ai().stats },
}));
await p.screenshot({ path: `${out}/squad.png` });
// wounded retreat
R.retreat = await p.evaluate(async () => {
  const s = window.__sq.find(q => q.state !== 'dead');
  if (!s) return 'all dead';
  const pl = window.__game.player;
  s.hp = 30;
  const d0 = s.pos.distanceTo(pl.pos);
  const t0 = performance.now();
  while (!s.retreated && performance.now() - t0 < 30000) await new Promise(r => setTimeout(r, 300));
  await new Promise(r => setTimeout(r, 6000));
  return { d0, d1: s.pos.distanceTo(pl.pos), retreated: s.retreated, stat: window.__game.ai().stats.retreat };
});
// radio: a contact pulls idle soldiers within 45 m
R.radio = await p.evaluate(() => {
  const G = window.__game,
    A = G.ai(),
    pl = G.player;
  const idle = A.sols.filter(s => s.state === 'patrol' && !s.post && !s.night && !window.__sq.includes(s)).slice(0, 2);
  idle.forEach((s, i) => s.pos.set(pl.pos.x - 20, 0, pl.pos.z + i * 3));
  const src = window.__sq.find(s => s.state !== 'dead');
  A.radio([pl.pos.x, pl.pos.z], src, '測試');
  return { pulled: idle.map(s => [s.state, s.target && s.target.map(v => +v.toFixed(1))]), stat: A.stats.radio };
});
// grenade: hide the player in the home building while the squad knows the spot
R.gren = await p.evaluate(async () => {
  const G = window.__game,
    A = G.ai(),
    st = G.autoState();
  const h = st.home || null;
  if (h) G.tp(h[0], h[1]);
  const pl = G.player;
  window.__sq.forEach((s, i) => {
    if (s.state === 'dead') return;
    s.pos.set(pl.pos.x + 9, 0, pl.pos.z + i * 2);
    s.state = 'combat';
    s.retreatT = 0;
    s.lastSeen = [pl.pos.x, pl.pos.z];
  });
  A.setGrenCd(0);
  A.SQ.AI.grenCamp = 1.5; // test: headless frames are slow (dt capped at 50 ms)
  const t0 = performance.now();
  while (performance.now() - t0 < 120000 && G.ai().stats.grenades < 1) {
    window.__sq.forEach(s => s.state !== 'dead' && ((s.state = 'combat'), (s.lastSeen = [pl.pos.x, pl.pos.z])));
    await new Promise(r => setTimeout(r, 500));
  }
  return {
    home: !!h,
    inBld: G.inBld(pl.pos.x, pl.pos.z),
    grenades: G.ai().stats.grenades,
    live: G.ai().grens.length,
    campMax: G.ai().stats.campMax,
  };
});
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/grenade.png` });
await p.waitForFunction(() => window.__game.ai().grens.length === 0, null, { timeout: 180000 });
R.after = await p.evaluate(() => ({
  ...window.__game.ai().stats,
  grens: window.__game.ai().grens.map(g => [g.t, g.fuse]),
  hp: window.__game.player.hp,
}));
R.errs = errs;
console.log(JSON.stringify(R));
await b.close();
