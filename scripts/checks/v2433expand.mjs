// v24.33 – v24.37 the map reaches past 萬華: the other eleven districts of the city stream in like the rest (same tiles, same walk-ups, every one of
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
      [4400, -80],
      [4480, -4300],
      [5450, -2050],
      [6300, 400],
      [2700, -8500],
      [10950, -2920],
      [3800, 5300],
      [10500, -1250],
      [1250, -8150],
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
check(w.S.districts.length === 12, `all twelve districts are in the map (${w.S.districts.join('、')})`);
check(
  w.B.maxx > 16000 && w.B.minz < -18500 && w.B.maxz > 8500,
  'the world reaches the east of 南港, the north of 北投 and the south of 文山',
);
check(w.S.campaign === 15, 'the campaign is still the fifteen areas of 萬華');
check(
  w.wan.every(i => i < 15),
  'a place in 萬華 belongs to one of them',
);
check(
  w.ext.join() ===
    [
      '台北車站',
      '南門',
      '古亭',
      '大稻埕',
      '大龍峒',
      '東區',
      '大直',
      '民生社區',
      '信義計畫區',
      '天母',
      '東湖',
      '景美',
      '南港車站',
      '石牌',
    ].join() ||
    w.ext.join() ===
      [
        'Taipei Station',
        'South Gate',
        'Guting',
        'Dadaocheng',
        'Dalongdong',
        'East District',
        'Dazhi',
        'Minsheng Community',
        'Xinyi Centre',
        'Tianmu',
        'Donghu',
        'Jingmei',
        'Nangang Station',
        'Shipai',
      ].join(),
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
  ['東區', 4400, -80],
  ['通化街', 5100, 1000],
  ['行天宮', 3040, -2050],
  ['大直', 4480, -4300],
  ['民生社區', 5450, -2050],
  ['饒河街', 7450, -1050],
  ['信義計畫區', 6300, 400],
  ['吳興街', 6050, 1550],
  ['士林夜市', 2100, -5200],
  ['天母', 2700, -8500],
  ['內湖科學園區', 7500, -3500],
  ['東湖', 10950, -2920],
  ['景美', 3800, 5300],
  ['木柵', 7000, 4900],
  ['南港車站', 10500, -1250],
  ['石牌', 1250, -8150],
  ['新北投', 50, -10600],
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
  visits.every(
    v =>
      v.hud.includes(v.name) ||
      /Taipei Station|South Gate|Dadaocheng|Dalongdong|Shuiyuan|East District|Tonghua|Xingtian|Dazhi|Minsheng|Raohe|Xinyi Centre|Wuxing|Night Market|Tianmu|Technology Park|Donghu|Jingmei|Muzha|Nangang Station|Shipai|Xinbeitou/.test(
        v.hud,
      ),
  ),
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

// ---- v24.37 every area outside the core has an outpost to take back: a garrison tile whose roads were all footpaths
// (a park: 青年公園, one of the campaign's fifteen; 大安森林公園; 萬芳…) had none, and its area could never be taken
const posts = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const S = g.sectors();
  // (out of the middle of 大稻埕's garrison first: its dead flags are written, but its soldiers still shoot)
  g.tp(0, 0);
  await wait(500);
  // the areas outside the core whose garrison tile has no road for vehicles: their outposts stand on a footpath
  const foot = [];
  for (let i = 0; i < S.all; i++) {
    if (!g.sectorAt(i)[2]) continue; // (in the core box: its soldiers stand in the streets of 萬華)
    const k = g.garrisonKey(i);
    const t = await (await fetch(`data/district/${k}.json`)).json();
    if (!t.r.some(r => r.p.length >= 2 && !/foot|path|steps|cycle|service/.test(r.t))) foot.push(i);
  }
  const here = {},
    inside = [];
  let died = false;
  for (const i of foot) {
    const [tx, tz] = g.garrisonKey(i).split('_').map(Number);
    g.tp((tx + 0.5) * 200 + 60, (tz + 0.5) * 200 + 60);
    let n = 0;
    for (let w = 0; w < 120 && n < 5; w++) {
      await wait(250);
      g.player.hp = 100; // (the garrison shoots: kept alive, and asked whether it is)
      if (g.dead()) break;
      n = g.sols.filter(q => q.sector === i && q.state !== 'dead').length;
    }
    if (g.dead()) {
      died = true;
      break;
    }
    here[S.names[i]] = n;
    for (const q of g.posts(g.garrisonKey(i)) || []) if (q.sector === i && q.inside) inside.push(S.names[i]);
  }
  g.tp(0, 0);
  await wait(500);
  return { foot: foot.length, here, inside, died };
});
console.log('   outposts', JSON.stringify(posts));
check(!posts.died, 'the player stays alive among the garrisons (the game would stop, and the rest prove nothing)');
check(
  posts.foot >= 9 && Object.keys(posts.here).length === posts.foot && Object.values(posts.here).every(n => n >= 5),
  `the outposts on footpaths are there, 青年公園's among them (${JSON.stringify(posts.here)})`,
);
check(posts.inside.length === 0, `and none of their posts stands in a building (${posts.inside.join('、') || 'none'})`);

// ---- v24.37 the land of a district goes to the areas added with it: the anchors of 文山, 南港 and 北投 took a hundred
// tiles of 士林, 大安, 信義 and 內湖, and in an old save streets taken back were occupied again
const sets = await p.evaluate(() => {
  const g = window.__game;
  const ix = g.district.ix;
  const S = g.sectors();
  const first37 = S.names.indexOf('景美');
  const pip = (x, z, r) => {
    let c = false;
    for (let a = 0, b = r.length - 1; a < r.length; b = a++)
      if (r[a][1] > z !== r[b][1] > z && x < ((r[b][0] - r[a][0]) * (z - r[a][1])) / (r[b][1] - r[a][1]) + r[a][0])
        c = !c;
    return c;
  };
  let n = 0;
  const wrong = [];
  for (const k of Object.keys(ix.tiles)) {
    const [tx, tz] = k.split('_').map(Number);
    const x = (tx + 0.5) * ix.T,
      z = (tz + 0.5) * ix.T;
    if (x > -555 && x < 555 && z > -497 && z < 497) continue; // (the core box: the campaign's)
    const ring = ix.boundary.findIndex(r => pip(x, z, r));
    if (ring < 1) continue;
    n++;
    const i = g.sectorOf(x, z);
    const ok = ring >= ix.districts.indexOf('文山區') ? i >= first37 : i >= S.campaign && i < first37;
    if (!ok) wrong.push(`${k}:${S.names[i]}`);
  }
  return { n, first37, wrong: wrong.slice(0, 8), nw: wrong.length };
});
console.log('   sets', JSON.stringify(sets));
check(
  sets.n > 6000 && sets.first37 === 95 && sets.nw === 0,
  `every tile of a district is in an area added with that district (${sets.n} tiles)`,
);

// ---- the metro: fifteen stations, every street exit of the new ones goes down and comes back up
check(w.stations.length === 73, `seventy-three stations (${w.stations.length})`);
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
      // (the interiors are hidden on the next frame: waited for, up to 1.5 s, rather than a fixed 120 ms)
      let shown = 1;
      for (let w = 0; w < 30 && shown; w++) {
        await wait(50);
        shown = g.metroShown().filter(Boolean).length;
      }
      out.push({
        shown,
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
  ex.length === 138 && !badEx.length,
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
check(under.shown === 1 && under.built >= 69, `down in a station only that one is drawn (${under.built} built)`);
check(under.ms < 250, `and a frame down there is not the 900 ms it was with three of them lit (${under.ms} ms)`);
// v24.37 the paper map opened down there shows the street above the station (it showed nothing: the interiors are 7 km
// north of the map), and the sign names the station
const umap = await p.evaluate(async () => {
  const g = window.__game,
    m = g.map;
  const st = g.metro()[12];
  m.toggle(true);
  await new Promise(r => setTimeout(r, 900));
  const [cx, cz] = m.toWorld(innerWidth / 2, innerHeight / 2);
  const off = Math.hypot(cx - st.ent[0], cz - st.ent[1]);
  m.toggle(false);
  await new Promise(r => setTimeout(r, 1200));
  return { off: Math.round(off), street: document.getElementById('street')?.textContent || '', name: st.name };
});
console.log('   map underground', JSON.stringify(umap));
check(umap.off < 30, `opened down in a station, the map shows the street above it (${umap.off} m from its exit)`);
check(umap.street.includes(umap.name), `and the street sign names the station (${umap.street.trim()})`);
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
  ride.n === 72 && ride.top >= 0 && ride.bottom <= ride.h,
  `the ride menu lists the other seventy-two and fits the screen (${Math.round(ride.bottom - ride.top)} of ${ride.h} px)`,
);

// ---- 基隆河 runs through 中山區: its banks are walls, and a bridge is mapped over it
const river = await p.evaluate(async () => {
  const g = window.__game;
  const ix = await (await fetch('data/district/index.json')).json();
  const pip = (x, z, r) => {
    let c = false;
    for (let a = 0, b = r.length - 1; a < r.length; b = a++)
      if (r[a][1] > z !== r[b][1] > z && x < ((r[b][0] - r[a][0]) * (z - r[a][1])) / (r[b][1] - r[a][1]) + r[a][0])
        c = !c;
    return c;
  };
  const area = r =>
    Math.abs(r.reduce((s, q, i) => s + q[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * q[1], 0) / 2);
  const riv = ix.water.reduce((a, r) => (area(r) > area(a) ? r : a));
  // from the land side of each long bank wall, straight at the water (v24.37 of every river that runs through the city,
  // 景美溪, 新店溪 above 景美 and 基隆河 at 汐止 as well, outside the districts too)
  const big = ix.water.filter(r => area(r) > 20000);
  const wetAt = (x, z) => big.find(r => pip(x, z, r));
  let tried = 0,
    wet = 0;
  for (const [ax, az, bx, bz] of ix.banks) {
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 30) continue;
    const mx = (ax + bx) / 2,
      mz = (az + bz) / 2;
    let nx = -(bz - az) / L,
      nz = (bx - ax) / L;
    if (!wetAt(mx + nx * 4, mz + nz * 4)) ((nx = -nx), (nz = -nz));
    const w = wetAt(mx + nx * 4, mz + nz * 4);
    if (!w || wetAt(mx - nx * 5, mz - nz * 5)) continue;
    // (from inside the world: outside it a body is put back on its edge, wherever that is)
    const WB = g.worldB();
    const sx = mx - nx * 5,
      sz = mz - nz * 5;
    if (sx < WB.minx + 1 || sx > WB.maxx - 1 || sz < WB.minz + 1 || sz > WB.maxz - 1) continue;
    tried++;
    const e = g.pushLine(mx - nx * 5, mz - nz * 5, mx + nx * 8, mz + nz * 8);
    if (pip(e[0], e[1], w)) wet++;
  }
  // v24.37 along the edge of the world where a river runs out of it (基隆河 at 汐止, its shore is outside the world)
  const WB2 = g.worldB();
  let edgeTried = 0,
    edgeWet = 0;
  for (const r of big)
    for (let z = WB2.minz + 2; z < WB2.maxz - 2; z += 4) {
      const x = WB2.maxx - 0.5;
      if (!pip(x, z, r)) continue;
      // from land just beside the water on the world's edge, along the edge into it
      for (const dz of [-1, 1]) {
        let lz = z;
        for (let k = 0; k < 60 && pip(x, lz, r); k++) lz += dz * 2;
        if (pip(x, lz, r) || wetAt(x, lz)) continue;
        edgeTried++;
        const e = g.pushLine(x, lz, x, lz - dz * 12);
        if (pip(e[0], e[1], r)) edgeWet++;
      }
      break;
    }
  // v24.37 from 景美's riverside, out of the city where its boundary crosses the river, and into 景美溪
  const j1 = g.pushLine(3190, 4150, 3110, 4195);
  const j2 = g.pushLine(j1[0], j1[1], 3080, 4250);
  const jingmei = !!wetAt(j2[0], j2[1]);
  // the strips (the river on the city's boundary drawn as a band) of the new districts are where that river is:
  // 新店溪 at 文山's north-west corner, 淡水河 at 關渡; 南港's edge is land and 基隆河
  const sd = (q, a, b) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l2));
    return Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dz * t);
  };
  const by = (q, r) => r.some((a, i) => sd(q, a, r[(i + 1) % r.length]) < 20);
  const mids = ix.river.map(([ax, az, bx, bz]) => [(ax + bx) / 2, (az + bz) / 2]);
  const ring = n => ix.boundary[ix.districts.indexOf(n)];
  const strips = {
    文山: mids.filter(q => by(q, ring('文山區'))).filter(q => !(q[0] < 3100 && q[1] < 4100)).length,
    南港: mids.filter(q => by(q, ring('南港區'))).length,
    北投: mids.filter(q => by(q, ring('北投區'))).filter(q => !(q[0] < -4000)).length,
    關渡: mids.filter(q => by(q, ring('北投區'))).length,
  };
  // and a bridge: a road that is flagged as one, with a point over the water
  let bridge = null;
  for (const k of Object.keys(ix.tiles)) {
    const [tx, tz] = k.split('_').map(Number);
    if (bridge || tx < 14 || tx > 28 || tz < -24 || tz > -15) continue;
    const t = await (await fetch(`data/district/${k}.json`)).json();
    for (const r of t.r) {
      if (!r.b || !/^(primary|secondary|tertiary)$/.test(r.t)) continue;
      if (r.p.some(q => pip(q[0], q[1], riv))) bridge = { n: r.n, t: r.t };
    }
  }
  return {
    area: Math.round(area(riv)),
    banks: ix.banks.length,
    tried,
    wet,
    bridge,
    jingmei,
    j2,
    strips,
    edgeTried,
    edgeWet,
  };
});
console.log('   river', JSON.stringify(river));
check(
  river.area > 500000 && river.banks > 100,
  `the river is water (${river.area} m²) with banks (${river.banks} walls)`,
);
check(river.tried > 20 && river.wet === 0, `nobody walks into a river from its bank (${river.tried} places tried)`);
check(
  !river.jingmei,
  `nor out of the city and into 景美溪 where the city's edge crosses it (stopped at ${river.j2.map(Math.round)})`,
);
check(
  river.edgeTried > 0 && river.edgeWet === 0,
  `nor along the edge of the world where 基隆河 runs out of it (${river.edgeTried} tried)`,
);
check(
  river.strips.文山 === 0 && river.strips.南港 === 0 && river.strips.北投 === 0 && river.strips.關渡 > 3,
  `the new districts' edge is a river band only along 新店溪 and at 關渡; ridges and 基隆河 are not (${JSON.stringify(river.strips)})`,
);
check(!!river.bridge, `a bridge is mapped over it (${river.bridge?.n || river.bridge?.t})`);

// ---- v24.35 松山機場: the runway is paved and painted, nothing is planted or generated on the airfield, and a
// body can run the length of it; the hillside of 信義區 is a wood with trees in it
const field = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ix = await (await fetch('data/district/index.json')).json();
  const pip = (x, z, r) => {
    let c = false;
    for (let a = 0, b = r.length - 1; a < r.length; b = a++)
      if (r[a][1] > z !== r[b][1] > z && x < ((r[b][0] - r[a][0]) * (z - r[a][1])) / (r[b][1] - r[a][1]) + r[a][0])
        c = !c;
    return c;
  };
  const area = r =>
    Math.abs(r.reduce((s, q, i) => s + q[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * q[1], 0) / 2);
  const settle = async (x, z) => {
    g.player.hp = 100;
    g.tp(x, z);
    let last = -1;
    for (let i = 0; i < 40; i++) {
      await wait(1000);
      const d = g.enterStats().district;
      if (d.tiles >= 9 && d.tiles === last) break;
      last = d.tiles;
    }
  };
  /** the trees of the tile at (x, z), counted where they are drawn */
  const trees = (x, z) => {
    let n = 0;
    const t = g.scene.getObjectByName('tile:' + Math.floor(x / 200) + '_' + Math.floor(z / 200));
    t?.traverse(o => {
      if (o.isInstancedMesh && /^forest:/.test(o.name) && !/grate|bench|plamp/.test(o.name)) n += o.count;
    });
    return { n, tile: !!t };
  };
  // the runway is the longest paved strip
  const runway = ix.air.paved.reduce((a, r) => (area(r) > area(a) ? r : a));
  // (a strip: one side out, the other side back — its ends are the middles of the first and the last pair)
  const h = runway.length / 2;
  const e0 = [(runway[0][0] + runway[2 * h - 1][0]) / 2, (runway[0][1] + runway[2 * h - 1][1]) / 2],
    e1 = [(runway[h - 1][0] + runway[h][0]) / 2, (runway[h - 1][1] + runway[h][1]) / 2];
  const len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
  const at = d => [e0[0] + ((e1[0] - e0[0]) * d) / len, e0[1] + ((e1[1] - e0[1]) * d) / len];
  const from = at(900),
    to = at(1500);
  await settle(from[0], from[1]);
  const end = g.pushLine(from[0], from[1], to[0], to[1]);
  // the trees drawn in the tiles around, the ones that stand inside the airfield
  const onField = { n: 0, tiles: g.enterStats().district.tiles };
  g.scene.traverse(o => {
    if (!o.isInstancedMesh || !/^forest:/.test(o.name) || /grate|bench|plamp|shrub/.test(o.name)) return;
    const m = o.instanceMatrix.array;
    for (let i = 0; i < o.count; i++) if (ix.air.ring.some(r => pip(m[i * 16 + 12], m[i * 16 + 14], r))) onField.n++;
  });
  // footprints generated along the streets: none of them stands inside an airfield
  let gen = 0;
  for (const k of Object.keys(ix.tiles)) {
    const [tx, tz] = k.split('_').map(Number);
    const bx = [tx * 200, tz * 200, tx * 200 + 200, tz * 200 + 200];
    if (
      !ix.air.ring.some(r =>
        r.some(q => q[0] > bx[0] - 200 && q[0] < bx[2] + 200 && q[1] > bx[1] - 200 && q[1] < bx[3] + 200),
      )
    )
      continue;
    const t = await (await fetch(`data/district/${k}.json`)).json();
    for (const b of t.b) {
      if (!b.g) continue;
      const c = b.p.reduce((a, q) => [a[0] + q[0] / b.p.length, a[1] + q[1] / b.p.length], [0, 0]);
      if (ix.air.ring.some(r => pip(c[0], c[1], r))) gen++;
    }
  }
  // a tile deep in the wood of 象山 (v24.36: the woods are in the tiles, `w`)
  const wt = await (await fetch('data/district/35_8.json')).json();
  const wood = (wt.w || []).some(r => pip(7100, 1700, r));
  await settle(7100, 1700);
  const inWood = trees(7100, 1700);
  // v24.36 陽明山: a tile that holds nothing but wood exists and is planted like the rest; and the ridge that is the
  // city's boundary up there is not a river (only the stretch along 淡水河 is)
  const only = Object.entries(ix.tiles)
    .filter(([k, v]) => v[0] === 0 && v[1] === 0)
    .map(([k]) => k.split('_').map(Number))
    .filter(([tx, tz]) => tz < -55 && tx > 20 && tx < 40);
  let deep = null;
  for (const [tx, tz] of only) {
    const t = await (await fetch(`data/district/${tx}_${tz}.json`)).json();
    const full = (t.w || []).reduce((a, r) => a + area(r), 0);
    if (full > 30000) {
      deep = { tx, tz, m2: Math.round(full) };
      break;
    }
  }
  let deepTrees = null;
  if (deep) {
    await settle(deep.tx * 200 + 100, deep.tz * 200 + 100);
    deepTrees = trees(deep.tx * 200 + 100, deep.tz * 200 + 100);
  }
  const ridge = ix.river.filter(q => (q[1] + q[3]) / 2 < -9500 && (q[0] + q[2]) / 2 > 1000).length;
  const tamsui = ix.river.filter(q => (q[1] + q[3]) / 2 < -4500 && (q[0] + q[2]) / 2 < 0).length;
  return {
    runway: { len: Math.round(len), m2: Math.round(area(runway)) },
    paved: ix.air.paved.length,
    marks: ix.air.marks.length,
    lawn: ix.air.lawn.length,
    ran: Math.round(Math.hypot(end[0] - from[0], end[1] - from[1])),
    want: Math.round(Math.hypot(to[0] - from[0], to[1] - from[1])),
    onField,
    gen,
    woodTiles: Object.keys(ix.tiles).length,
    inIndex: !!ix.wood,
    wood,
    inWood,
    only: only.length,
    deep,
    deepTrees,
    ridge,
    tamsui,
  };
});
console.log('   airfield and wood', JSON.stringify(field));
await p.screenshot({ path: shot('v2435-wood.png'), timeout: 120000 });
check(
  field.runway.len > 2400 && field.runway.m2 > 120000 && field.marks > 40 && field.lawn > 10,
  `松山機場 has its runway (${field.runway.len} m), ${field.paved} paved areas, paint and lawns`,
);
check(
  field.ran > field.want - 3,
  `a body runs ${field.ran} m down the runway and meets nothing (${field.want} m asked)`,
);
check(
  field.onField.tiles >= 9 && field.onField.n < 12,
  `nothing is planted on the airfield (${field.onField.n} trees inside it, ${field.onField.tiles} tiles loaded around)`,
);
check(field.gen === 0, `no flats were generated inside the airfield (${field.gen})`);
check(
  field.wood && !field.inIndex && field.inWood.tile && field.inWood.n >= 25,
  `the hillside of 象山 is a wood, with trees (${field.inWood.n} in the tile the player stands in)`,
);
check(
  !!field.deep && field.deepTrees?.tile && field.deepTrees.n >= 40,
  `up on 陽明山 a tile that holds nothing but wood is there and is planted (${field.deepTrees?.n} trees in ${field.deep?.tx}_${field.deep?.tz}; ${field.only} such tiles up there)`,
);
check(
  field.ridge === 0 && field.tamsui > 10,
  `the ridge that is the city's boundary is land; the stretch along 淡水河 by 社子 is river (${field.tamsui} edges)`,
);
await p.evaluate(async () => {
  const g = window.__game;
  g.player.hp = 100;
  g.tp(5000, -2850);
  await new Promise(r => setTimeout(r, 9000));
});
await p.screenshot({ path: shot('v2435-airfield.png'), timeout: 120000 });

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
    cell: Math.round(cs * cs),
    at: at(-600, 1100),
    lit,
    area: Math.round(lit * cs * cs),
    was: Math.round(49 * ocs * ocs),
    far: at(1460, -530),
  };
  // v24.37 on foot (38 m around the player) in the middle of a cell of the city-wide grid (62 m): that cell is
  // uncovered. Measured to the corners of the cells, as it was, nothing was.
  const mid = [m.ox + (Math.floor((3000 - m.ox) / cs) + 0.5) * cs, m.oy + (Math.floor((-4000 - m.oy) / cs) + 0.5) * cs];
  m.reveal(mid[0], mid[1]);
  const foot = at(mid[0], mid[1]);
  // and one written by this version comes back as it was
  m.reveal(2000, -3000, 60);
  m.save();
  const kept = at(2000, -3000);
  m.load(JSON.parse(localStorage.getItem('defendtaipei-map-v2')));
  return { ...old, now, foot, kept, back: at(2000, -3000), still: at(-600, 1100) };
});
console.log('   fog', JSON.stringify(fog));
check(fog.now, 'the map has uncovered where the player has just been, far outside 萬華');
check(
  // (the grid is coarser the larger the map: a patch a hundred metres across is one to four cells of it by now)
  fog.at === 255 && fog.far === 0 && Math.abs(fog.area - fog.was) < Math.max(fog.was * 0.35, fog.cell * 2.2),
  `the patch an older save had explored in 萬華 is where it was, and the size it was (${fog.area} m² for ${fog.was})`,
);
check(fog.foot === 255, 'a person on foot uncovers the cell of the map they stand in, in the middle of it too');
check(
  fog.kept > 0 && fog.back === fog.kept && fog.still === 255,
  'and a map saved by this version comes back as it was',
);
await p.evaluate(() => window.__game.map.toggle(true));
await p.waitForTimeout(2500);
await p.screenshot({ path: shot('v2433-map.png'), timeout: 120000 });

// ---- v24.37 the paper map close up: 28 km of city on one canvas is 9 m to the pixel, so past a certain zoom what is
// in view is drawn again at the size of the screen — once for a view, not once a frame
const near = await p.evaluate(async () => {
  const g = window.__game,
    m = g.map;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !m.extraB.length; i++) await wait(500);
  await wait(1500);
  m.fit();
  await wait(600);
  const d0 = m.nearStats.draws; // (it opened on the player, close enough to have been drawn already)
  await wait(600);
  const far = { s: m.k * m.zoom, drawn: m.nearStats.draws - d0 };
  // in on 東區 (忠孝東路), to 0.8 px to the metre
  const goto = (x, z, s) => {
    m.zoom = s / m.k;
    m.panX = innerWidth / 2 - m.wx(x) * m.zoom;
    m.panY = innerHeight / 2 - m.wy(z) * m.zoom;
    m.dirty = true;
  };
  m.revealRect(3400, -1100, 7400, 900); // (so that the screenshot shows the map, and not the fog over it)
  goto(4400, -80, 0.8);
  await wait(900);
  const a = { ...m.nearStats };
  await wait(900);
  const same = m.nearStats.draws;
  m.panX -= 60; // a small drag stays inside what was drawn
  await wait(600);
  const dragged = m.nearStats.draws;
  m.panX -= innerWidth; // a long one does not
  await wait(600);
  const moved = m.nearStats.draws;
  for (let i = 0; i < 40; i++) m.zoomAt(1.3, innerWidth / 2, innerHeight / 2);
  await wait(600);
  // the lines between areas: stretches of the bisectors of their anchors, none longer than an area is wide
  const lines = m.secLines.map(q => Math.hypot(q[2] - q[0], q[3] - q[1]));
  return {
    far,
    d0,
    a,
    same,
    dragged,
    moved,
    closest: m.k * m.zoom,
    k: m.k,
    loaded: m.extraB.length,
    lines: lines.length,
    longest: Math.round(Math.max(...lines)),
  };
});
console.log('   close up', JSON.stringify(near));
await p.screenshot({ path: shot('v2437-map-near.png'), timeout: 120000 });
check(
  near.far.s < 0.3 && near.far.drawn === 0,
  `the whole city in view is the paper alone (${near.far.s.toFixed(3)} px to the metre)`,
);
check(
  near.a.draws === near.d0 + 1 && near.a.blds > 800 && near.a.streets > 100,
  `zoomed in on 東區 the view is drawn again, sharp (${near.a.blds} footprints, ${near.a.streets} streets, ${near.a.ms} ms)`,
);
check(
  near.same === near.a.draws && near.dragged === near.a.draws && near.moved === near.a.draws + 1,
  'once for a view: not again each frame nor for a small drag, again when the view has left it',
);
check(near.closest > 1.5, `and the map goes in to ${near.closest.toFixed(2)} px to the metre however large it is`);
check(
  near.lines > 150 && near.longest < 9000,
  `the areas are parted by lines (${near.lines}, the longest ${near.longest} m), not by darker cells of the tint`,
);

// ---- v24.37 the lines between areas end where the map does, and part the campaign's areas from the others where they
// meet in 中正區; the main streets have their names between the whole city and close up; the close-up layer is drawn
// again for a new pixel ratio, and is not drawn again while the zoom changes, only when it settles; the district index
// is the one this build was made with
const over = await p.evaluate(async () => {
  const g = window.__game,
    m = g.map,
    ix = g.district.ix;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const pip = (x, z, r) => {
    let c = false;
    for (let a = 0, b = r.length - 1; a < r.length; b = a++)
      if (r[a][1] > z !== r[b][1] > z && x < ((r[b][0] - r[a][0]) * (z - r[a][1])) / (r[b][1] - r[a][1]) + r[a][0])
        c = !c;
    return c;
  };
  const inMap = (x, z) => ix.boundary.some(r => pip(x, z, r));
  const L = m.secLines || [];
  let outside = 0;
  for (const [ax, az, bx, bz] of L) {
    const l = Math.hypot(bx - ax, bz - az) || 1,
      d = Math.min(2, l / 2);
    const ux = (bx - ax) / l,
      uz = (bz - az) / l;
    if (
      ![
        [ax + ux * d, az + uz * d],
        [bx - ux * d, bz - uz * d],
        [(ax + bx) / 2, (az + bz) / 2],
      ].every(q => inMap(q[0], q[1]))
    )
      outside++;
  }
  const core = L.filter(q => Math.abs(q[0] - 555) < 0.5 && Math.abs(q[2] - 555) < 0.5).reduce(
    (s, q) => s + Math.abs(q[3] - q[1]),
    0,
  );
  const goto = (x, z, s) => {
    m.zoom = s / m.k;
    m.panX = innerWidth / 2 - m.wx(x) * m.zoom;
    m.panY = innerHeight / 2 - m.wy(z) * m.zoom;
  };
  m.toggle(true);
  goto(3000, -500, 0.2);
  await wait(600);
  const mid = m.overStats.names;
  goto(4400, -80, 0.8);
  await wait(800);
  const d0 = m.nearStats.draws;
  m.cv.width = Math.round(innerWidth * 1.5);
  m.cv.height = Math.round(innerHeight * 1.5);
  await wait(500);
  const dpr = { redrawn: m.nearStats.draws === d0 + 1, r: m.nearView.r };
  m.resize();
  await wait(500);
  const d1 = m.nearStats.draws;
  for (let i = 0; i < 6; i++) m.zoomAt(1.05, innerWidth / 2, innerHeight / 2);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const during = m.nearStats.draws - d1;
  await wait(600);
  const after = m.nearStats.draws - d1;
  return {
    lines: L.length,
    outside,
    core: Math.round(core),
    mid,
    dpr,
    during,
    after,
    stale: g.district.stale,
    v: g.dataV(),
  };
});
console.log('   over', JSON.stringify(over));
await p.screenshot({ path: shot('v2437-map-lines.png'), timeout: 120000 });
check(over.lines > 150 && over.outside === 0, `every line between areas lies in the map (${over.lines} lines)`);
check(over.core > 600, `the campaign's areas are parted from the others along the core box in 中正區 (${over.core} m)`);
check(over.mid > 5, `between the whole city and close up the main streets have their names (${over.mid} drawn)`);
check(over.dpr.redrawn && Math.abs(over.dpr.r - 1.5) < 0.01, 'a new pixel ratio draws the close-up layer again for it');
check(
  over.during === 0 && over.after === 1,
  `zooming, the close-up layer is drawn once, when the zoom settles (${over.during} while, ${over.after} after)`,
);
check(
  over.stale === false && /^[0-9a-f]{12}$/.test(over.v),
  `the district index is the one this build was made with (data ${over.v})`,
);

console.log('errors:', errs.length, JSON.stringify(errs.slice(0, 3)));
check(errs.length === 0, 'no page errors');
await Promise.race([b.close(), new Promise(r => setTimeout(r, 12000))]);
srv?.stop?.();
process.exit(failed.length ? 1 : 0);
