// v24.38 the spaces off the map, as the rest of the game sees them. Down in a station: the war aims at the street above
// it and does not reach you, the helicopters and drones look there, an airdrop lands near the exit, no bucket goes down
// there. Upstairs: what flies sees where you really are; a bucket left on a roof stays on that roof (and catches the
// rain while you are away), not on every other building's; going upstairs on the first day is not stepping out of
// home. An old save's bucket left in a station or on a roof comes back to the pack. argv: [url] (default: vite preview)
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4238);
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

// ---- the first day: up the stairs of a building is not out of the door of home
const day1 = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const before = g.exitMark();
  const c = g.start();
  const s = g
    .stairs()
    .filter(q => q.d === 'core')
    .sort((a, b) => Math.hypot(a.c[0] - c[0], a.c[1] - c[1]) - Math.hypot(b.c[0] - c[0], b.c[1] - c[1]))[0];
  g.tp(s.foot[0], s.foot[1]);
  await wait(800);
  const inside = g.exitMark();
  const went = g.upToggle();
  await wait(1500);
  const up = g.exitMark();
  const st = g.upState();
  g.tp(st.land[0], st.land[1]);
  g.upToggle();
  await wait(800);
  return { before, inside, went, up };
});
console.log('   day 1', JSON.stringify(day1));
check(
  day1.before && day1.went && day1.up === day1.inside,
  'going upstairs on the first day does not take down the arrow over the door of home',
);

// ---- down in a station
const under = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const i = g.metro().findIndex(s => s.name === '龍山寺');
  const st = g.metro()[i];
  const gt = st.gates[0];
  g.player.hp = 100;
  g.tp(gt.ent[0], gt.ent[1]);
  await wait(1500);
  g.metroUse();
  await wait(2500);
  const pos = [g.player.pos.x, g.player.pos.z];
  const ent = st.ent;
  const d = q => Math.hypot(q[0] - ent[0], q[1] - ent[1]);
  // what the log says (how far away a missile came down)
  const said = [];
  const mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => said.push(n.textContent || ''))));
  mo.observe(document.getElementById('log'), { childList: true });
  // where the war aims
  const spots = Array.from({ length: 20 }, () => d(g.warSpot(30, 130)));
  // a barrage right where the old aim fell (the interior), a missile there, and one in the street by the exit. Wait
  // until all of them are down (game time: on a slow machine the frames are capped, and it falls behind the clock)
  g.player.hp = 60;
  g.player.bleed = false;
  g.warBarrage(4, pos[0], pos[1]);
  g.warStrike('rocket', pos[0] + 3, pos[1]);
  g.warStrike('rocket', ent[0] + 60, ent[1]);
  for (let i = 0; i < 1200 && g.war().pending; i++) await wait(250);
  const pending = g.war().pending;
  const hp = g.player.hp;
  mo.disconnect();
  const hitD = said
    .map(t => /落在約 (\d+) 公尺外|hit about (\d+) m/.exec(t))
    .filter(Boolean)
    .map(m => +(m[1] || m[2]));
  const sky = g.skyAt();
  const cover = g.heliCover();
  // a bucket: not down here
  g.player.inv.bucket = (g.player.inv.bucket || 0) + 1;
  const nb = g.player.inv.bucket;
  g.useItem('bucket');
  const bucketKept = g.player.inv.bucket === nb;
  // the airdrop of day 4, if it came now
  g.airdrop();
  const drop = g.cont('airdrop');
  const dropD = drop ? d(drop.p) : null;
  // back up
  g.tp(gt.exit[0], gt.exit[1]);
  g.metroUse();
  await wait(1200);
  return {
    under: pos[1] < -20000,
    spot: Math.round(Math.max(...spots)),
    pending,
    hp: Math.round(hp),
    hitD,
    sky: Math.round(d([sky[0], sky[2]])),
    cover,
    bucketKept,
    dropD: dropD && Math.round(dropD),
  };
});
console.log('   underground', JSON.stringify(under));
check(under.under, 'the player went down into a station');
check(
  under.spot <= 131,
  `the war aims at the street above the station, not at its interior (${under.spot} m from the exit)`,
);
check(
  under.pending === 0 && under.hp >= 60,
  `shells and missiles on the street above do not reach the player below (hp ${under.hp}, ${under.pending} still in flight)`,
);
check(
  under.hitD.length === 2 && Math.max(...under.hitD) < 300,
  `the log says how far from the station a missile came down (${under.hitD.join(', ')} m)`,
);
check(under.sky < 1 && under.cover, 'what flies looks at the station exit, and finds the player under cover');
check(under.bucketKept, 'no bucket is put down in a station');
check(under.dropD !== null && under.dropD < 80, `an airdrop then lands near the station's exit (${under.dropD} m)`);

// ---- upstairs: a bucket on a roof stays on that roof
const roof = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const c = g.start();
  const all = g
    .stairs()
    .filter(q => q.d === 'core' && q.top >= 2)
    .sort((a, b) => Math.hypot(a.c[0] - c[0], a.c[1] - c[1]) - Math.hypot(b.c[0] - c[0], b.c[1] - c[1]));
  const climb = async s => {
    g.player.hp = 100;
    for (const q of g.sols) q.night = q.day = true;
    g.tp(s.foot[0], s.foot[1]);
    await wait(700);
    for (let i = 0; i < 16 && !g.upState().roof; i++) {
      const u = g.upState();
      if (u.up && u.upFoot) g.tp(u.upFoot[0], u.upFoot[1]);
      if (!g.upToggle()) break;
      await wait(700);
    }
    return g.upState().roof;
  };
  const down = async () => {
    for (let i = 0; i < 16 && g.upState().up; i++) {
      const u = g.upState();
      g.tp(u.land[0], u.land[1]);
      g.upToggle();
      await wait(150);
    }
  };
  const A = all[0],
    B = all.find(s => s.id !== A.id && Math.hypot(s.c[0] - A.c[0], s.c[1] - A.c[1]) > 30);
  const onA = await climb(A);
  // what flies sees the player where the roof really is
  const sky = g.skyAt();
  const skyD = Math.hypot(sky[0] - A.c[0], sky[2] - A.c[1]);
  const u = g.upState();
  // in the middle of the roof: a mortar round 4 m from the player, on the side away from the foot of the stairs, hurts
  // them (inside its 6 m core). It was measured from the foot of the stairs: there it is out of the core, hardly a
  // scratch. So does an FPV going off on the roof next to them; one going off in the street below does not
  g.tp(A.c[0] + u.off[0], A.c[1] + u.off[1]);
  await wait(300);
  const me = g.skyAt();
  const footD = Math.hypot(me[0] - u.anchor[0], me[2] - u.anchor[1]);
  const ax = footD > 0.5 ? (me[0] - u.anchor[0]) / footD : 1,
    az = footD > 0.5 ? (me[2] - u.anchor[1]) / footD : 0;
  const shellAt = [me[0] + ax * 4, me[2] + az * 4];
  const shellFoot = Math.hypot(shellAt[0] - u.anchor[0], shellAt[1] - u.anchor[1]);
  const hurt = async f => {
    g.player.hp = 100;
    g.player.bleed = false;
    await f();
    const h = g.player.hp;
    g.player.hp = 100;
    g.player.bleed = false;
    return Math.round(h);
  };
  const hpShell = await hurt(async () => {
    g.warStrike('mortar', shellAt[0], shellAt[1]);
    for (let i = 0; i < 1200 && g.war().pending; i++) await wait(100);
  });
  const v = g.player.pos.clone();
  const hpBlast = await hurt(async () => g.blast(v.clone().set(me[0] + 2, me[1] + 0.5, me[2]), false));
  const hpBelow = await hurt(async () => g.blast(v.clone().set(me[0] + 2, 0.5, me[2]), false));
  // a step from the stairs, in the open (the middle of this roof is under the stair hut's roof): a helicopter over the
  // roof can see the player up here now, and an AT4 fired from here reaches it
  g.tp(u.land[0] + 1.5, u.land[1] + 1.5);
  await wait(400);
  const open = g.upState().inShed === false;
  const op = g.skyAt();
  const hc = g.heli().spawn('z20');
  hc.g.position.set(op[0] + 25, op[1] + 14, op[2]);
  g.player.inv.at4 = 1;
  const heliHp = g.testATHeli('at4', hc);
  g.player.hp = 100;
  // and a bucket there
  g.player.inv.bucket = (g.player.inv.bucket || 0) + 1;
  g.useItem('bucket');
  const placed = g.pails();
  await down();
  const away = g.pails();
  // it rains while nobody is up there
  g.startRain(1, 2);
  g.simRain(10);
  const wet = g.pails().all[0]?.items.rainwater || 0;
  const onB = await climb(B);
  const onBOut = g.pails().out.length;
  await down();
  await climb(A);
  const back = g.pails();
  const u2 = g.upState();
  await down();
  return {
    onA,
    onB,
    skyD: Math.round(skyD),
    skyY: Math.round(sky[1]),
    footD: Math.round(footD),
    shellFoot: Math.round(shellFoot * 10) / 10,
    hpShell,
    hpBlast,
    hpBelow,
    heliHp,
    open,
    placed: placed.all.length,
    key: placed.all[0]?.key,
    want: 'c' + A.id,
    atD: placed.all[0] ? Math.round(Math.hypot(placed.all[0].at[0] - A.c[0], placed.all[0].at[1] - A.c[1])) : null,
    outA: placed.out.length,
    outAway: away.out.length,
    wet,
    onBOut,
    outBack: back.out.length,
    // the bucket is out where it was: its place on the map, moved to where the roof is built
    same:
      back.out[0] && placed.out[0]
        ? Math.round(
            Math.hypot(back.out[0][1][0] - placed.out[0][1][0], back.out[0][1][1] - placed.out[0][1][1]) * 100,
          ) / 100
        : null,
    fy: Math.round(u2.fy || 0),
  };
});
console.log('   roof', JSON.stringify(roof));
check(roof.onA && roof.onB, 'up on two rooftops');
check(
  roof.skyD < 40 && roof.skyY > 3,
  `up there, what flies sees the roof where it is (${roof.skyD} m from the building's middle, ${roof.skyY} m up)`,
);
check(
  roof.shellFoot > 6.5 && roof.hpShell < 80,
  `a mortar round 4 m off on the roof hurts them (hp ${roof.hpShell}; ${roof.shellFoot} m from the stairs' foot)`,
);
check(roof.hpBlast < 90, `an FPV going off on the roof next to them hurts them (hp ${roof.hpBlast})`);
check(
  roof.skyY < 7 || roof.hpBelow === 100,
  `one going off in the street ${roof.skyY} m below does not (hp ${roof.hpBelow})`,
);
check(
  roof.open && roof.heliHp <= 0,
  `an AT4 fired from the open roof hits a helicopter over it (its hp ${roof.heliHp})`,
);
check(
  roof.placed === 1 && roof.key === roof.want && roof.atD < 40 && roof.outA === 1,
  `a bucket put on the roof belongs to that building (${roof.key}, ${roof.atD} m from its middle)`,
);
check(roof.outAway === 0, 'down again, it is put away with the roof');
check(roof.wet > 0, `and catches the rain while nobody is up there (${roof.wet} of rainwater)`);
check(roof.onBOut === 0, "it is not on another building's roof");
check(roof.outBack === 1 && roof.same === 0, 'back on its own roof, it is where it was left');

// ---- the save keeps it; an old save's buckets in a station or on a roof come back to the pack
await p.evaluate(() => window.__game.save());
await p.goto(url + 'manifest.webmanifest');
await p.evaluate(() => {
  const sv = JSON.parse(localStorage.getItem('defendtaipei-save-v1'));
  sv.inv.bucket = 0;
  delete sv.inv.rainwater;
  sv.conts.push(['pb9101', { rainwater: 2 }, [24006, -3]], ['pb9102', { rainwater: 1 }, [-1150, -25996]]);
  localStorage.setItem('defendtaipei-save-v1', JSON.stringify(sv));
});
await p.evaluate(() => sessionStorage.setItem('dt.autoload', '1'));
await p.goto(url, { waitUntil: 'commit' });
await p.waitForFunction(() => window.__game?.started?.(), null, { timeout: 600000, polling: 1000 });
await p.waitForTimeout(3000);
const loaded = await p.evaluate(() => {
  const g = window.__game;
  return {
    pails: g.pails().all.length,
    rain: g.pails().all[0]?.items.rainwater || 0,
    bucket: g.player.inv.bucket || 0,
    rainwater: g.player.inv.rainwater || 0,
    left: !!g.cont('pb9101') || !!g.cont('pb9102'),
  };
});
console.log('   loaded', JSON.stringify(loaded));
check(loaded.pails === 1 && loaded.rain > 0, 'a saved game still has the bucket on its roof, with its rainwater');
check(
  loaded.bucket === 2 && loaded.rainwater === 3 && !loaded.left,
  "an old save's buckets in a station and on a roof are back in the pack, with what they caught",
);
await p.screenshot({ path: shot('v2438-loaded.png'), timeout: 120000 });

console.log('errors:', errs.length, JSON.stringify(errs.slice(0, 3)));
check(errs.length === 0, 'no page errors');
await Promise.race([b.close(), new Promise(r => setTimeout(r, 12000))]);
srv?.stop?.();
process.exit(failed.length ? 1 : 0);
