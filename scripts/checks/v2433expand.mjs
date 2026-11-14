// v24.33 the map reaches past 萬華: 中正區 and 大同區 stream in like the rest (same tiles, same walk-ups, every one of
// them entered), they have areas of their own with a garrison each, taking one back does not touch the campaign's
// count, the metro has stations there with street exits on clear pavement, and a map explored in an older save is
// still explored. argv: [url] (default: vite preview)
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4219);
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
p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
await p.goto(url);
await pickRole(p, { g: 'f', skipIntro: true });
await p.waitForTimeout(6000);

// ---- the world and its areas
const w = await p.evaluate(() => {
  const g = window.__game;
  const S = g.sectors();
  return {
    B: g.worldB(),
    S,
    // points well inside 萬華 still belong to the campaign's areas
    wan: [
      [-40, 60],
      [-600, 1100],
      [-1300, 2560],
      [300, 1990],
    ].map(q => g.sectorOf(q[0], q[1])),
    ext: [
      [1450, -540],
      [1480, 850],
      [1900, 1550],
      [700, -1820],
      [1340, -3500],
    ].map(q => S.names[g.sectorOf(q[0], q[1])]),
    stations: g.metro().map(s => ({ name: s.name, no: s.no, gates: s.gates })),
    hud: document.getElementById('street')?.textContent,
  };
});
console.log(
  '   world',
  JSON.stringify(w.B),
  'districts',
  w.S.districts.join(' '),
  'areas',
  w.S.campaign,
  '+',
  w.S.all - w.S.campaign,
);
check(w.S.districts.length === 3, `three districts are in the map (${w.S.districts.join('、')})`);
check(w.B.maxx > 3000 && w.B.minz < -4000, 'the world reaches the east of 中正 and the north of 大同');
check(w.S.campaign === 15, 'the campaign is still the fifteen areas of 萬華');
check(
  w.wan.every(i => i < 15),
  'a place in 萬華 belongs to one of them',
);
check(
  w.ext.join() === ['台北車站', '南門', '古亭', '大稻埕', '大龍峒'].join() ||
    w.ext.join() === ['Taipei Station', 'South Gate', 'Guting', 'Dadaocheng', 'Dalongdong'].join(),
  `a place in the new districts belongs to an area of its own (${w.ext.join('、')})`,
);

// ---- walk into them: tiles stream, the walk-ups are entered, the sign over the street names the area
const visits = [];
for (const [name, x, z] of [
  ['台北車站', 1460, -530],
  ['南門', 1480, 800],
  ['大稻埕', 706, -1824],
  ['大龍峒', 1340, -3480],
  ['水源', 3050, 2880],
]) {
  const r = await p.evaluate(
    async ([x, z]) => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      g.setMin(11 * 60);
      g.player.hp = 100;
      for (const q of g.sols) q.night = q.day = true;
      g.tp(x, z);
      let last = -1,
        d = null;
      for (let i = 0; i < 40; i++) {
        await wait(1000);
        g.player.hp = 100;
        d = g.enterStats().district;
        if (d.tiles >= 9 && d.n === last) break;
        last = d.n;
      }
      return { ...d, hud: document.getElementById('street')?.textContent || '', calls: g.rinfo().calls };
    },
    [x, z],
  );
  visits.push({ name, ...r });
  console.log('  ', name, JSON.stringify(r));
  await p.screenshot({ path: shot(`v2433-${visits.length}.png`), timeout: 120000 });
}
check(
  visits.every(v => v.tiles >= 9 && v.n >= 200),
  `their tiles stream in (${visits.map(v => v.n).join(' / ')} buildings around the player)`,
);
check(
  visits.every(v => v.enter >= v.n - 2),
  `and the buildings are entered like any other (${visits.map(v => v.n - v.enter).join(' / ')} without a door)`,
);
check(
  visits.every(v => v.hud.includes(v.name) || /Taipei Station|South Gate|Dadaocheng|Dalongdong|Shuiyuan/.test(v.hud)),
  'the street sign names the area the player is in',
);

// ---- a garrison holds each of the new areas; wiping one takes the area back, outside the campaign's count
const gar = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const S = g.sectors();
  const keys = [];
  for (let i = S.campaign; i < S.all; i++) keys.push(g.garrisonKey(i));
  const i = S.names.findIndex(n => n === '大稻埕' || n === 'Dadaocheng');
  const [tx, tz] = g.garrisonKey(i).split('_').map(Number);
  g.player.hp = 1e6;
  g.tp((tx + 0.5) * 200, (tz + 0.5) * 200);
  await wait(9000);
  const here = g.sols.filter(q => q.sector === i && q.state !== 'dead').length;
  const hud0 =
    document.getElementById('obj')?.textContent ||
    document.body.innerText.match(/已奪回街區[^\n]*|Districts reclaimed[^\n]*/)?.[0] ||
    '';
  const took = g.garrisonWipe(i);
  await wait(2500);
  const S2 = g.sectors();
  const txt = document.body.innerText.match(/已奪回街區[^\n]*|Districts reclaimed[^\n]*/)?.[0] || '';
  g.player.hp = 100;
  return { keys, here, took, libN: S2.libN, lib: S2.lib, i, hud0, txt, ended: !!document.querySelector('.survend') };
});
console.log('   garrison', JSON.stringify({ ...gar, keys: gar.keys.length }));
check(
  gar.keys.every(Boolean) && new Set(gar.keys).size === gar.keys.length,
  `each new area has a garrison tile of its own (${gar.keys.length})`,
);
check(gar.here >= 3, `its soldiers stand there (${gar.here})`);
check(gar.took && gar.lib.includes(gar.i), 'with the garrison gone the area is taken back');
check(
  gar.libN === 0 && /0 \/ 15/.test(gar.txt) && /外區 1|\+1 beyond/.test(gar.txt),
  `which the campaign does not count (${gar.txt.trim()})`,
);
check(!gar.ended, 'and nothing ends');

// ---- the metro: fifteen stations, every street exit of the new ones goes down and comes back up
check(w.stations.length === 15, `fifteen stations (${w.stations.length})`);
const ex = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const out = [];
  const sts = g.metro();
  for (let i = 4; i < sts.length; i++)
    for (const gt of sts[i].gates) {
      g.player.hp = 100;
      g.tp(gt.ent[0], gt.ent[1]);
      await wait(1500);
      const clear = !g.inBld(gt.ent[0], gt.ent[1]);
      g.metroUse();
      const d = [g.player.pos.x, g.player.pos.z];
      g.tp(gt.exit[0], gt.exit[1]);
      g.metroUse();
      const u = [g.player.pos.x, g.player.pos.z];
      await wait(120);
      out.push({
        shown: g.metroShown().filter(Boolean).length,
        st: sts[i].name + gt.no,
        clear,
        down: Math.hypot(d[0] - gt.inn[0], d[1] - gt.inn[1]) < 1,
        up: Math.hypot(u[0] - gt.ent[0], u[1] - gt.ent[1]) < 5,
      });
    }
  return out;
});
const badEx = ex.filter(e => !e.clear || !e.down || !e.up);
check(
  ex.length === 22 && !badEx.length,
  `the ${ex.length} street exits of the new stations go down and come back up, none inside a building (${badEx.map(e => e.st).join(' ') || 'all good'})`,
);
// (every interior carries some twenty lights: left in the scene they add up, and the fifth station lost the tab)
check(
  ex.every(e => e.shown === 0),
  'back in the street no station interior is being drawn, however many have been visited',
);
const under = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const gt = g.metro()[12].gates[0];
  g.tp(gt.ent[0], gt.ent[1]);
  await wait(800);
  g.metroUse();
  await wait(2500);
  let k = 0;
  const t0 = performance.now();
  await new Promise(res => {
    const f = () => (++k < 40 ? requestAnimationFrame(f) : res());
    requestAnimationFrame(f);
  });
  const ms = (performance.now() - t0) / 40;
  const shown = g.metroShown().filter(Boolean).length;
  return { ms: Math.round(ms), shown, built: g.metro().filter(s => s.built).length };
});
console.log('   underground', JSON.stringify(under));
await p.screenshot({ path: shot('v2433-station.png'), timeout: 120000 });
check(under.shown === 1 && under.built >= 11, `down in a station only that one is drawn (${under.built} built)`);
check(under.ms < 250, `and a frame down there is not the 900 ms it was with three of them lit (${under.ms} ms)`);
await p.evaluate(async () => {
  const g = window.__game;
  const gt = g.metro()[12].gates[0];
  g.tp(gt.exit[0], gt.exit[1]);
  g.metroUse();
  await new Promise(r => setTimeout(r, 500));
});
// a look at one from the street, and the ride menu
await p.evaluate(async () => {
  const g = window.__game;
  const gt = g.metro()[9].gates[0];
  g.tp(gt.ent[0] + 3, gt.ent[1] + 6);
  await new Promise(r => setTimeout(r, 6000));
});
await p.screenshot({ path: shot('v2433-exit.png'), timeout: 120000 });
const ride = await p.evaluate(async () => {
  const g = window.__game;
  g.openRide(0);
  await new Promise(r => setTimeout(r, 400));
  const el = document.getElementById('ride');
  const r = el.getBoundingClientRect();
  const n = el.querySelectorAll('.stops button').length;
  return { n, top: r.top, bottom: r.bottom, h: innerHeight };
});
await p.screenshot({ path: shot('v2433-ride.png'), timeout: 120000 });
await p.evaluate(() => document.getElementById('ride')?.remove());
check(
  ride.n === 14 && ride.top >= 0 && ride.bottom <= ride.h,
  `the ride menu lists the other fourteen and fits the screen (${Math.round(ride.bottom - ride.top)} of ${ride.h} px)`,
);

// ---- the paper map: what an older save had explored is still explored, in the right place
const fog = await p.evaluate(() => {
  const m = window.__game.map;
  const b = window.__game.worldB();
  const FG = Math.round(Math.sqrt(m.fogA.length));
  const cs = (Math.max(b.maxx - b.minx, b.maxz - b.minz) + 80) / FG;
  const at = (x, z) => m.fogA[Math.floor((z - m.oy) / cs) * FG + Math.floor((x - m.ox) / cs)];
  const now = at(1460, -530) > 0; // this run has been there
  // a save from before v24.33: 320 cells over 萬華 alone, one patch explored around (-600, 1100)
  const N = 320,
    ocs = 4562 / 320;
  const a = new Uint8Array(N * N);
  const ci = Math.floor((-600 + 1992) / ocs),
    cj = Math.floor((1100 + 1002) / ocs);
  for (let j = cj - 3; j <= cj + 3; j++) for (let i = ci - 3; i <= ci + 3; i++) a[j * N + i] = 255;
  let f = '';
  for (let i = 0; i < a.length; i++) f += String.fromCharCode(a[i]);
  m.load({ n: [], f: btoa(f) });
  let lit = 0;
  for (let i = 0; i < m.fogA.length; i++) if (m.fogA[i]) lit++;
  const old = {
    FG,
    at: at(-600, 1100),
    lit,
    area: Math.round(lit * cs * cs),
    was: Math.round(49 * ocs * ocs),
    far: at(1460, -530),
  };
  // and one written by this version comes back as it was
  m.reveal(2000, -3000, 60);
  m.save();
  const kept = at(2000, -3000);
  m.load(JSON.parse(localStorage.getItem('defendtaipei-map-v2')));
  return { ...old, now, kept, back: at(2000, -3000), still: at(-600, 1100) };
});
console.log('   fog', JSON.stringify(fog));
check(fog.now, 'the map has uncovered where the player has just been, far outside 萬華');
check(
  fog.at === 255 && fog.far === 0 && Math.abs(fog.area - fog.was) < fog.was * 0.35,
  `the patch an older save had explored in 萬華 is where it was, and the size it was (${fog.area} m² for ${fog.was})`,
);
check(
  fog.kept > 0 && fog.back === fog.kept && fog.still === 255,
  'and a map saved by this version comes back as it was',
);
await p.evaluate(() => window.__game.map.toggle(true));
await p.waitForTimeout(2500);
await p.screenshot({ path: shot('v2433-map.png'), timeout: 120000 });

console.log('errors:', errs.length, JSON.stringify(errs.slice(0, 3)));
check(errs.length === 0, 'no page errors');
await Promise.race([b.close(), new Promise(r => setTimeout(r, 12000))]);
srv?.stop?.();
process.exit(failed.length ? 1 : 0);
