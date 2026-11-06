// v24.24 helicopters: PLA machines fly over, hunt you in the open and lose you indoors, and heavy weapons bring them down;
// a Black Hawk left on an empty lot can be flown. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4210);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const W = 1280,
  H = 800;
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'f', skipIntro: true });

// ---------- the one you can fly ----------
const spots = await p.evaluate(() => {
  const g = window.__game;
  const P = g.player.pos;
  return g.heliSpots().map(q => ({ ...q, d: Math.round(Math.hypot(q.x - P.x, q.z - P.z)) }));
});
console.log('   lots:', JSON.stringify(spots));
check(spots.length >= 1, 'a Black Hawk stands on a lot somewhere');
check(
  spots.every(q => q.d > 150),
  'not right where you start',
);
const board = await p.evaluate(async sp => {
  const g = window.__game;
  g.setMin(11 * 60);
  const v = g.drive.list.find(q => q.id === sp.id);
  window.__v = v;
  const P = g.player.pos;
  // go near first: it settles on its lot when the outer blocks are there
  g.tp(v.pos.x + 30, v.pos.z);
  for (let i = 0; i < 12; i++) await new Promise(r => setTimeout(r, 500));
  // nobody near: this part is about flying
  for (const q of g.sols)
    if (Math.hypot(q.pos.x - v.pos.x, q.pos.z - v.pos.z) < 200)
      ((q.state = 'dead'), (q.hp = 0), (q.mesh.visible = false));
  v.fuel = 900;
  g.tp(v.pos.x + 5.5, v.pos.z);
  await new Promise(r => setTimeout(r, 1500));
  return { x: P.x, z: P.z };
}, spots[0]);
await p.screenshot({ path: shot('v2424-parked.png'), timeout: 120000 });
await p.keyboard.press('KeyE');
await p.waitForTimeout(1200);
const on = await p.evaluate(() => {
  const g = window.__game;
  const v = window.__v;
  return { cur: g.drive.cur === v, vis: g.player.mesh.visible, alt: v.alt, gun: !!v.gun, name: v.gun?.guns[0].w.name };
});
console.log('  ', JSON.stringify(on));
check(on.cur, 'E gets you in');
check(!on.vis, 'you are inside');
check(on.gun, 'it has a door gun');
check(on.alt === 0, 'still on the ground');

// it does not lift until the rotor is up to speed
await p.keyboard.down('KeyW');
await p.waitForTimeout(600);
const early = await p.evaluate(() => ({ alt: window.__v.alt, rotor: window.__v.rotor }));
console.log('  ', JSON.stringify(early));
check(early.rotor < 1 && early.alt < 0.1, 'the rotor has to come up to speed first');
await p.waitForFunction(() => window.__v.alt > 20, null, { timeout: 90000, polling: 200 });
const high = await p.evaluate(() => {
  const g = window.__game;
  const v = window.__v;
  return {
    alt: v.alt,
    v: v.v,
    x: v.pos.x,
    z: v.pos.z,
    y: v.g.position.y,
    zoom: g.camera.zoom,
    lift: g.camLift(),
    indoors: g.indoorHere(),
  };
});
console.log('  ', JSON.stringify(high));
check(high.alt > 20 && high.y === high.alt, 'up it goes');
await p.waitForTimeout(2500);
await p.screenshot({ path: shot('v2424-flying.png'), timeout: 120000 });
const cruising = await p.evaluate(g0 => {
  const v = window.__v;
  return {
    v: v.v,
    moved: Math.hypot(v.pos.x - g0.x, v.pos.z - g0.z),
    fuel: v.fuel,
    hd: v.hd,
    r: window.__game.rinfo(),
    fast: window.__game.fast.culled,
  };
}, high);
console.log('  ', JSON.stringify(cruising));
check(cruising.v > 10 && cruising.moved > 10, 'pushing the stick moves it');
check(cruising.r.calls <= 1500, `the wider view is affordable (${cruising.r.calls} calls, ${cruising.r.tris} tris)`);
await p.keyboard.up('KeyW');

// over a tall building it climbs by itself and clears it
const over = await p.evaluate(async () => {
  const g = window.__game;
  const v = window.__v;
  const P = g.player.pos;
  // the tallest roof near here
  let best = null;
  for (let i = -30; i <= 30; i++)
    for (let j = -30; j <= 30; j++) {
      const x = P.x + i * 8,
        z = P.z + j * 8;
      const h = g.roofAt(x, z);
      if (h > 14 && (!best || h > best.h)) best = { x, z, h };
    }
  if (!best) return { none: true };
  // straight at it, a little way off
  v.pos.x = best.x + 6;
  v.pos.z = best.z + 6;
  await new Promise(r => setTimeout(r, 200));
  let min = 1e9;
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 100));
    min = Math.min(min, v.alt - g.roofAt(v.pos.x, v.pos.z));
    v.pos.x = best.x + 1;
    v.pos.z = best.z + 1;
  }
  return { h: best.h, alt: v.alt, clear: v.alt - best.h, land: g.drive.land(v) };
});
console.log('  ', JSON.stringify(over));
if (!over.none) {
  check(over.clear >= 4, `it climbs over the roof (${over.h.toFixed(0)} m, flying at ${over.alt.toFixed(0)} m)`);
  check(over.land !== '', 'and will not land on it');
}

// land: on a lot, E brings it down, and E again gets you out
const down = await p.evaluate(async sp => {
  const v = window.__v;
  v.pos.x = sp.x;
  v.pos.z = sp.z;
  v.vx = v.vz = 0;
  await new Promise(r => setTimeout(r, 600));
  return { alt: v.alt };
}, spots[0]);
await p.keyboard.press('KeyE');
await p.waitForFunction(() => window.__v.alt === 0, null, { timeout: 90000, polling: 200 });
const landed = await p.evaluate(() => ({ cur: !!window.__game.drive.cur, alt: window.__v.alt }));
check(landed.cur && landed.alt === 0, 'E brings it down, and you are still inside');
await p.keyboard.press('KeyE');
await p.waitForTimeout(800);
const out = await p.evaluate(() => ({ cur: !!window.__game.drive.cur, vis: window.__game.player.mesh.visible }));
check(!out.cur && out.vis, 'E again gets you out');

// out of fuel it comes down by itself
const dry = await p.evaluate(async () => {
  const g = window.__game;
  const v = window.__v;
  g.drive.enter(v);
  v.rotor = 1;
  v.alt = 24;
  v.g.position.y = 24;
  v.fuel = 0.01;
  await new Promise(r => setTimeout(r, 1500));
  const a0 = v.alt;
  for (let i = 0; i < 120 && v.alt > 0.02; i++) await new Promise(r => setTimeout(r, 250));
  const res = { a0, a1: v.alt, fuel: v.fuel };
  g.drive.exit();
  g.player.mesh.visible = true;
  return res;
});
console.log('  ', JSON.stringify(dry));
check(dry.a0 < 24, 'out of fuel it starts coming down');
check(dry.a1 < 0.05, 'and reaches the ground');

// ---------- the ones that hunt you ----------
const none = await p.evaluate(async () => {
  const g = window.__game;
  g.setMin(11 * 60);
  return { n: g.heli().list.length, wanted0: 0 };
});
check(none.n === 0, 'none in the sky on the first morning');
const flyby = await p.evaluate(async () => {
  const g = window.__game;
  const H = g.heli();
  const c = H.spawn('z20');
  window.__c = c;
  const x0 = c.g.position.x,
    z0 = c.g.position.z;
  await new Promise(r => setTimeout(r, 3000));
  return { moved: Math.hypot(c.g.position.x - x0, c.g.position.z - z0), alt: c.alt, st: c.state, way: c.way.length };
});
console.log('  ', JSON.stringify(flyby));
check(flyby.moved > 5, 'a patrol flies along');
check(flyby.alt >= 24, 'above the rooftops');

// over you, in the open
const hunt = await p.evaluate(async () => {
  const g = window.__game;
  const c = window.__c;
  const P = g.player.pos;
  // on the empty lot, clear of the walls around it: nothing overhead
  const O = window.__v.pos;
  const clear = (x, z) =>
    [0, 1, 2, 3, 4, 5, 6, 7].every(i => g.roofAt(x + Math.cos(i * 0.785) * 4, z + Math.sin(i * 0.785) * 4) === 0);
  let at = [O.x + 8, O.z];
  search: for (let r = 7; r < 60; r += 3)
    for (let i = 0; i < 12; i++) {
      const x = O.x + Math.cos(i * 0.52) * r,
        z = O.z + Math.sin(i * 0.52) * r;
      if (clear(x, z)) {
        at = [x, z];
        break search;
      }
    }
  g.tp(at[0], at[1]);
  for (const q of g.sols) if (q.pos.distanceTo(P) < 140) ((q.state = 'dead'), (q.hp = 0), (q.mesh.visible = false));
  await new Promise(r => setTimeout(r, 800));
  const here = g.indoorHere();
  g.player.hp = 100;
  // an orbit around you, so that it stays in range long enough at this frame rate
  for (let i = 0; i < 120 && c.state !== 'hunt'; i++) {
    c.g.position.set(P.x + 10, c.alt, P.z + 10);
    await new Promise(r => setTimeout(r, 250));
  }
  return { here, st: c.state };
});
console.log('  ', JSON.stringify(hunt));
check(hunt.st === 'hunt', 'it sees you in the open');
await p.waitForTimeout(500);
await p.screenshot({ path: shot('v2424-hunt.png'), timeout: 120000 });
const under = await p.evaluate(async () => {
  const g = window.__game;
  const H = g.heli();
  const c = window.__c;
  const s0 = H.stats.shots;
  const t0 = performance.now();
  while (performance.now() - t0 < 40000 && H.stats.shots - s0 < 16) {
    g.player.hp = Math.max(g.player.hp, 40);
    await new Promise(r => setTimeout(r, 200));
  }
  return { shots: H.stats.shots - s0, hp: g.player.hp, st: c.state };
});
console.log('  ', JSON.stringify(under));
check(under.shots >= 8, `and opens fire (${under.shots} rounds)`);

// get indoors and it loses you
const lose = await p.evaluate(async () => {
  const g = window.__game;
  const c = window.__c;
  const B = g.policeBlds()[0];
  g.tp(B.c[0], B.c[1]);
  c.g.position.set(B.c[0] + 15, c.alt, B.c[1]);
  await new Promise(r => setTimeout(r, 800));
  const inside = g.indoorHere();
  for (let i = 0; i < 160 && c.state === 'hunt'; i++) await new Promise(r => setTimeout(r, 250));
  return { inside, st: c.state };
});
console.log('  ', JSON.stringify(lose));
check(lose.inside && lose.st === 'patrol', 'indoors it loses you and goes back to its patrol');

// a heavy gun brings it down: from a captured IFV, cursor on the helicopter
const fight = await p.evaluate(async () => {
  const g = window.__game;
  const c = window.__c;
  const x = window.__v.pos.x + 14,
    z = window.__v.pos.z + 14;
  const v = g.avSpawn('zbl08', x, z, 0);
  g.tp(x, z);
  g.drive.enter(v);
  g.player.mesh.visible = false;
  window.__iv = v;
  await new Promise(r => setTimeout(r, 400));
  c.state = 'patrol';
  c.way = [[x + 300, z + 300]];
  c.g.position.set(x + 10, 26, z - 10);
  c.vx = c.vz = 0;
  c.hp = 40;
  return { hp: c.hp };
});
const air0 = await p.evaluate(() => window.__game.avStat.airHits);
for (let i = 0; i < 40; i++) {
  // follow it with the cursor, as you would
  const [mx, my, st] = await p.evaluate(
    ([W, H]) => {
      const g = window.__game,
        c = window.__c;
      // hold it still so the check is about the gun, not about tracking it
      c.g.position.set(window.__iv.pos.x + 10, c.alt, window.__iv.pos.z - 10);
      c.vx = c.vz = 0;
      c.way = [[c.g.position.x, c.g.position.z]];
      const q = c.g.position.clone().project(g.camera);
      return [((q.x + 1) / 2) * W, ((1 - q.y) / 2) * H, c.state];
    },
    [W, H],
  );
  await p.mouse.move(mx, my);
  if (i === 6) await p.mouse.down();
  if (st === 'fall') break;
  await p.waitForTimeout(500);
}
await p.mouse.up();
const shotDown = await p.evaluate(async air0 => {
  const g = window.__game;
  const c = window.__c;
  const H = g.heli();
  return { st: c.state, hp: c.hp, airHits: g.avStat.airHits - air0, downed: H.stats.downed, list: H.list.length };
}, air0);
console.log('  ', JSON.stringify(shotDown));
check(shotDown.airHits > 0, 'the autocannon reaches it');
check(shotDown.st === 'fall', 'and it goes down');
await p.waitForTimeout(600);
await p.screenshot({ path: shot('v2424-falling.png'), timeout: 120000 });
await p.waitForFunction(() => window.__game.heli().stats.downed >= 1, null, { timeout: 60000, polling: 200 });
await p.waitForTimeout(1500);
await p.screenshot({ path: shot('v2424-wreck.png'), timeout: 120000 });
const wreck = await p.evaluate(() => {
  const g = window.__game;
  return { wrecks: g.heliStat.wrecks, fires: g.war().fires, list: g.heli().list.length };
});
console.log('  ', JSON.stringify(wreck));
check(wreck.wrecks === 1, 'it leaves a wreck');
check(wreck.fires >= 1, 'which burns');

// by night, a searchlight
await p.evaluate(async () => {
  const g = window.__game;
  const c = g.heli().spawn('z10');
  window.__n = c;
  g.setMin(1440 * 2 + 23 * 60);
  const P = g.player.pos;
  c.g.position.set(P.x + 6, c.alt, P.z + 2);
  c.state = 'hunt';
  c.huntT = 30;
  c.hp = 100;
});
await p.waitForTimeout(1500);
await p.screenshot({ path: shot('v2424-night.png'), timeout: 120000 });
const night = await p.evaluate(() => ({ beam: window.__n.beam.visible, light: window.__n.light.visible }));
check(night.beam && night.light, 'by night it has a searchlight');

// how many, by the state of the war
const counts = await p.evaluate(() => {
  const H = window.__game.heli().constructor;
  return [H.wanted(0.01), H.wanted(0.2), H.wanted(0.5), H.wanted(0.9)];
});
check(
  counts[0] === 0 && counts[1] === 1 && counts[2] === 2 && counts[3] === 3,
  `more of them as the war goes on (${counts})`,
);

console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
