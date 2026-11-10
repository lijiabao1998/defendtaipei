// v24.28 every building has a door: the whole map is visited and no footprint is left without one; rooms down to a shed have
// something to search; and a building shut in by its neighbours is entered through one of them, which a real body can walk,
// furniture and all. argv: [url] (default: vite preview). Slow: it loads every district tile.
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4214);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
await p.goto(url);
await pickRole(p, { g: 'f', skipIntro: true });
await p.waitForTimeout(4000);

const core = await p.evaluate(() => window.__game.enterStats().core);
check(core.door === core.n, `core: every footprint has a door (${core.door}/${core.n})`);

// the whole map, a stop every 600 m
const survey = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const W = g.worldB();
  const none = new Map(),
    via = new Map();
  let n = 0,
    enter = 0,
    plans = { n: 0, none: 0, empty: 0, tiny: 0 },
    stops = 0;
  for (let x = W.minx + 300; x <= W.maxx - 300; x += 600)
    for (let z = W.minz + 300; z <= W.maxz - 300; z += 600) {
      stops++;
      g.player.hp = 100;
      g.player.sleeping = true; // nobody comes for the player meanwhile
      g.tp(x, z);
      let last = -1,
        same = 0;
      for (let i = 0; i < 80 && same < 6; i++) {
        await wait(500);
        const t = g.enterStats().district.tiles;
        same = t === last ? same + 1 : 0;
        last = t;
      }
      const st = g.enterStats().district;
      n += st.n;
      enter += st.enter;
      for (const q of g.noDoors()) none.set(q.c.map(v => v.toFixed(1)).join(','), q);
      for (const v of g.viaDoors()) via.set(v.c.map(q => q.toFixed(1)).join(','), v);
      const pl = g.doorPlans();
      for (const k of ['n', 'none', 'empty', 'tiny']) plans[k] += pl[k];
    }
  g.player.sleeping = false;
  return { stops, n, enter, none: [...none.values()].slice(0, 12), noneN: none.size, via: [...via.values()], plans };
});
console.log(
  '  ',
  JSON.stringify({
    stops: survey.stops,
    n: survey.n,
    enter: survey.enter,
    noDoor: survey.noneN,
    via: survey.via.length,
    plans: survey.plans,
  }),
);
for (const q of survey.none) console.log('   no door:', JSON.stringify(q));
check(survey.n > 15000, `the whole map was visited (${survey.n} footprints over ${survey.stops} stops, with overlap)`);
check(survey.noneN === 0 && survey.enter === survey.n, `every footprint has a door (${survey.enter}/${survey.n})`);
check(survey.plans.none === 0, `every room can be planned (${survey.plans.none} of ${survey.plans.n} not)`);
check(survey.plans.empty === 0, `every room has something to search (${survey.plans.empty} empty)`);
check(survey.plans.tiny > 20, `sheds and kiosks among them (${survey.plans.tiny} under 3.4 m)`);
check(survey.via.length >= 10, `buildings shut in by their neighbours are entered through one (${survey.via.length})`);
check(
  survey.via.every(v => v.host),
  'each of those has a neighbour with a door of its own',
);

// each of those, for real: stand at the neighbour's street door with the furniture in, and walk in
let walked = 0,
  shots = 0;
const bad = [];
let done = 0;
for (const v of survey.via) {
  // a fresh page every few: crossing the map again and again is more than a tab is asked to do in play
  if (done++ % 6 === 0) {
    await p.reload();
    await pickRole(p, { g: 'f', skipIntro: true });
    await p.evaluate(() => (window.__game.player.sleeping = true));
  }
  const r = await p.evaluate(async v => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    g.player.hp = 100;
    g.tp(v.outside[0], v.outside[1]);
    // the tile, its furniture, and the navigation grid around here
    for (let i = 0; i < 60; i++) {
      await wait(250);
      const N = g.nav;
      if (
        i > 10 &&
        !N.building &&
        N.idx(v.inside[0], v.inside[1]) >= 0 &&
        Math.hypot(N.cx - v.outside[0], N.cz - v.outside[1]) < 60
      )
        break;
    }
    await wait(1500);
    const path = g.nav.find(v.outside, v.inside);
    const end = path?.[path.length - 1];
    const short = end ? Math.hypot(end[0] - v.inside[0], end[1] - v.inside[1]) : -1;
    const reached = path ? g.navWalk(path) : 0;
    return {
      ok: !!path && short < 1.3 && reached === path.length,
      short: +short.toFixed(1),
      n: path?.length ?? 0,
      reached,
    };
  }, v);
  if (r.ok) walked++;
  else bad.push({ c: v.c.map(Math.round), ...r });
  if (shots < 2 && r.ok) {
    // from inside the shut-in building, looking at its only door
    await p.evaluate(v => window.__game.tp(v.inside[0], v.inside[1]), v);
    await p.waitForTimeout(2500);
    await p.screenshot({ path: shot(`v2428-via-${shots++}.png`), timeout: 120000 });
  }
}
for (const q of bad.slice(0, 10)) console.log('   cannot walk in:', JSON.stringify(q));
check(
  walked === survey.via.length,
  `a body can walk into every one of them from the street (${walked}/${survey.via.length})`,
);

console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
