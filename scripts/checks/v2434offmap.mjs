// v24.34 the spaces kept off the map (the metro's interiors, the upstairs floors) moved far away, because the map now
// reaches where they were. A game saved down in a station still comes back down in that station — one saved by this
// version, and one saved before the move — and what it comes back to is a station, not the dark.
// argv: [url] (default: vite preview)
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4221);
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
await p.waitForTimeout(5000);

// down into a station of the new districts
const down = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const B = g.worldB();
  const i = g.metro().findIndex(s => s.name === '中正紀念堂');
  const gt = g.metro()[i].gates[0];
  g.player.hp = 100;
  g.tp(gt.ent[0], gt.ent[1]);
  await wait(1500);
  g.metroUse();
  await wait(1500);
  g.tp(gt.inn[0] + 6, gt.inn[1] + 9); // a few steps into the concourse
  await wait(800);
  g.save();
  const sv = JSON.parse(localStorage.getItem('defendtaipei-save-v1'));
  return {
    i,
    B,
    pos: [g.player.pos.x, g.player.pos.z],
    p: sv.p,
    ov: sv.ov,
    shown: g.metroShown().filter(Boolean).length,
  };
});
console.log('   down', JSON.stringify(down));
// (v24.36: everything north of METRO_Z + 2000 counts as down in the metro, so the map has to end south of that. 2.5 km
// from where the player stands in the station is that band and the 520 m of streaming besides; it was a round 10 km
// when the map ended at 中山區, and 士林區 goes 11 km further north than that)
check(
  down.pos[1] < down.B.minz - 2500 && down.shown === 1,
  `the station is far outside the map (z ${Math.round(down.pos[1])}, the map ends at ${down.B.minz})`,
);
check(down.ov === 2 && Math.abs(down.p[1] - down.pos[1]) < 0.01, 'the save says which layout it was made in');

const back = async label => {
  await p.evaluate(() => sessionStorage.setItem('dt.autoload', '1'));
  await p.goto(url, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__game?.started?.(), null, { timeout: 600000, polling: 1000 });
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => {
    const g = window.__game;
    return {
      pos: [g.player.pos.x, g.player.pos.z],
      shown: g
        .metroShown()
        .map((v, i) => (v ? i : -1))
        .filter(i => i >= 0),
      built: g
        .metro()
        .map((s, i) => (s.built ? i : -1))
        .filter(i => i >= 0),
      calls: g.rinfo().calls,
    };
  });
  console.log('  ', label, JSON.stringify(r));
  return r;
};

// 1) a save of this version
const a = await back('this version');
check(
  Math.hypot(a.pos[0] - down.pos[0], a.pos[1] - down.pos[1]) < 1.5,
  'loaded, the player is where they saved, down in the station',
);
check(
  a.shown.length === 1 && a.shown[0] === down.i,
  'and the station is there to see (its interior is built on loading)',
);
await p.screenshot({ path: shot('v2434-loaded-underground.png'), timeout: 120000 });

// 2) a save from before the move: the stations were at z = -7000 (leave the game first: it saves as it goes)
await p.goto(url + 'manifest.webmanifest');
await p.evaluate(dz => {
  const sv = JSON.parse(localStorage.getItem('defendtaipei-save-v1'));
  delete sv.ov;
  sv.p[1] = -7000 + dz;
  localStorage.setItem('defendtaipei-save-v1', JSON.stringify(sv));
}, down.pos[1] + 26000);
const o = await back('an older save');
check(
  Math.hypot(o.pos[0] - down.pos[0], o.pos[1] - down.pos[1]) < 1.5,
  'a save made when the stations were at z = -7000 comes back in the same station',
);
check(o.shown.length === 1 && o.shown[0] === down.i, 'with the station around it');

// 3) v24.37 a save of v24.34 – v24.36: marked `ov: 1`, the stations were at z = -20000
await p.goto(url + 'manifest.webmanifest');
await p.evaluate(dz => {
  const sv = JSON.parse(localStorage.getItem('defendtaipei-save-v1'));
  sv.ov = 1;
  sv.p[1] = -20000 + dz;
  localStorage.setItem('defendtaipei-save-v1', JSON.stringify(sv));
}, down.pos[1] + 26000);
const o1 = await back('a save of v24.34');
check(
  Math.hypot(o1.pos[0] - down.pos[0], o1.pos[1] - down.pos[1]) < 1.5 && o1.shown.length === 1 && o1.shown[0] === down.i,
  'a save made when the stations were at z = -20000 comes back in the same station too',
);

// 4) v24.37 a save of v24.37 that an older version opened and saved again: marked `ov: 1`, its point where v24.37 has
// the stations. It stays there (it was moved 6 km on, into the dark)
await p.goto(url + 'manifest.webmanifest');
await p.evaluate(dz => {
  const sv = JSON.parse(localStorage.getItem('defendtaipei-save-v1'));
  sv.ov = 1;
  sv.p[1] = -26000 + dz;
  localStorage.setItem('defendtaipei-save-v1', JSON.stringify(sv));
}, down.pos[1] + 26000);
const o2 = await back('a v24.37 save saved again by v24.36');
check(
  Math.hypot(o2.pos[0] - down.pos[0], o2.pos[1] - down.pos[1]) < 1.5 && o2.shown.length === 1 && o2.shown[0] === down.i,
  'a save of this version that an older one saved again stays in its station',
);

// 5) v24.37 what else an old save holds off the map moves with it: a crate left in a station, where the crowd of an
// area taken back down there stood. A rain bucket left on a roof (the floors were at x = 20000) moved with the floors;
// v24.38 puts it back in the pack with what it caught (every building's roof is built in that one place)
await p.goto(url + 'manifest.webmanifest');
const inv0 = await p.evaluate(dz => {
  const sv = JSON.parse(localStorage.getItem('defendtaipei-save-v1'));
  const inv0 = { bucket: sv.inv.bucket || 0, rainwater: sv.inv.rainwater || 0 };
  sv.ov = 1;
  sv.p[1] = -20000 + dz;
  sv.conts.push(['pb9001', { rainwater: 3 }, [20007, 3]], ['zz9002', { water: 2 }, [-1100, -20000 + 5]]);
  sv.surv = { ...(sv.surv || {}), libAt: { 20: [-1100, -20000 + 5] } };
  localStorage.setItem('defendtaipei-save-v1', JSON.stringify(sv));
  return inv0;
}, down.pos[1] + 26000);
await back('a save of v24.36 with things off the map');
const moved = await p.evaluate(() => {
  const g = window.__game;
  return {
    bucket: g.cont('pb9001'),
    crate: g.cont('zz9002'),
    lib: g.libAt(),
    inv: { bucket: g.player.inv.bucket || 0, rainwater: g.player.inv.rainwater || 0 },
  };
});
console.log('   moved', JSON.stringify({ ...moved, inv0 }));
check(
  !moved.bucket && moved.inv.bucket === inv0.bucket + 1 && moved.inv.rainwater === inv0.rainwater + 3,
  'a rain bucket left on a roof is back in the pack, with its rainwater',
);
check(!!moved.crate && Math.abs(moved.crate.p[1] - -25995) < 0.01, 'a crate left in a station is in that station');
check(!!moved.lib && Math.abs(moved.lib[20][1] - -25995) < 0.01, "and so is where an area's crowd stood");

// and back up to the street it went down from
const up = await p.evaluate(async i => {
  const g = window.__game;
  const gt = g.metro()[i].gates[0];
  g.tp(gt.exit[0], gt.exit[1]);
  g.metroUse();
  await new Promise(r => setTimeout(r, 1500));
  return { pos: [g.player.pos.x, g.player.pos.z], ent: gt.ent, shown: g.metroShown().filter(Boolean).length };
}, down.i);
check(
  Math.hypot(up.pos[0] - up.ent[0], up.pos[1] - up.ent[1]) < 5 && up.shown === 0,
  'from there the stairs lead up to the street exit',
);

console.log('errors:', errs.length, JSON.stringify(errs.slice(0, 3)));
check(errs.length === 0, 'no page errors');
await Promise.race([b.close(), new Promise(r => setTimeout(r, 12000))]);
srv?.stop?.();
process.exit(failed.length ? 1 : 0);
