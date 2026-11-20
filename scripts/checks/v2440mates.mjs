// v24.40 computer teammates chosen at the start (behind ?mates=1).
// - The new-game screen offers the other roles (your own only as the other sex), two on a computer and one on a phone;
//   the summary names them and who they are to you.
// - They wake beside you with their own packs, follow your steps out of the home (the same door), stand looking the way
//   you came when you stop, sneak when you sneak, come along up the stairs and back down, into the metro and out, ride
//   in the car and get out beside you; anyone left behind is never left in a space off the map.
// - They eat and drink from their own pack, treat their own bleeding, ask when they have nothing; down, a bandage brings
//   them back within 60 s, and after that they are gone and their pack lies where they fell.
// - Their skills are the team's while they are near (repair, hot-wiring, a nurse's bandaging); a courier among them
//   knows every street.
// - T: everyone waits / follows again; held, the fire rule. Their pack in the inventory panel: hand things over, take
//   things back.
// - Saved and loaded with the game, beside the player again. Without anyone chosen nothing changes: the same save, the
//   same shared random numbers.
// argv: [url] (default: vite preview)
import { launch, preview, gameUrl, shot, devices } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4240);
const base = gameUrl(process.argv[2] || srv?.url).replace(/\?.*$/, '');
const url = base + '?mates=1';
const b = await launch();
const failed = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const run = n => !ONLY.length || ONLY.includes(String(n));

/** the title screen, step by step with real clicks on the cards: role, then the people who come with you */
async function start(p, { g = 'm', role = 'office', mates = [], skipIntro = true } = {}) {
  await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
  await p.evaluate(() => window.__newGame());
  await p.waitForSelector('.ch', { state: 'visible', timeout: 600000 });
  return p.evaluate(
    ([g, role, mates, skip]) => {
      const box = document.getElementById('skipintro');
      box.checked = skip;
      box.dispatchEvent(new Event('change'));
      window.__selG(g);
      document.querySelector(`.ch[data-r="${role}"]`).click();
      document.getElementById('startgo').click(); // → step 2
      const cards = [...document.querySelectorAll('#matesel .mc')].map(c => ({
        r: c.dataset.r,
        dis: [...c.querySelectorAll('.mg button')].filter(x => x.disabled).map(x => x.dataset.g),
      }));
      for (const m of mates) {
        document.querySelector(`#matesel .mc[data-r="${m.r}"] .mg button[data-g="${m.g}"]`)?.click();
        document.querySelector(`#matesel .mc[data-r="${m.r}"]`).click(); // (the cards are drawn again on every click)
      }
      const head = document.querySelector('#matesel .mates-head small')?.textContent || '';
      const on = [...document.querySelectorAll('#matesel .mc.on')].map(c => c.dataset.r);
      document.getElementById('startgo').click(); // → step 3
      const sum = document.querySelector('#selection-summary .selection-mates')?.textContent || '';
      document.getElementById('startgo').click();
      return { cards, head, on, sum };
    },
    [g, role, mates, skipIntro],
  );
}
/** nobody stands on anyone: each teammate at least 0.6 m from the player and from the other */
const apart = (ms, P) =>
  ms.every(m => Math.hypot(m.p[0] - P[0], m.p[1] - P[1]) > 0.6) &&
  ms.every((m, i) => ms.every((o, j) => i === j || Math.hypot(m.p[0] - o.p[0], m.p[1] - o.p[1]) > 0.6));
const entered = p =>
  p.waitForFunction(() => window.__game?.started() && !document.getElementById('entry-loading'), null, {
    timeout: 240000,
  });

// ---- 1. the new-game screen, a new game with two, following out of the home
let page;
if (run(1)) {
  const p = (page = await b.newPage({ viewport: { width: 1280, height: 800 } }));
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 600)));
  await p.goto(url);
  const sel = await start(p, {
    g: 'm',
    role: 'tech',
    mates: [
      { r: 'student', g: 'f' },
      { r: 'tech', g: 'f' },
      { r: 'nurse', g: 'f' },
    ],
  });
  console.log('   selection', JSON.stringify(sel));
  check(sel.cards.length === 6, `six cards, one per role (${sel.cards.length})`);
  check(
    sel.cards.find(c => c.r === 'tech')?.dis.join() === 'm' && sel.cards.filter(c => c.dis.length).length === 1,
    'your own role is offered only as the other sex',
  );
  check(sel.on.join() === 'student,tech', `two at most on a computer (${sel.on})`);
  check(/最多 2 位/.test(sel.head), 'a third says to deselect someone first');
  check(
    /欣妤/.test(sel.sum) && /女兒/.test(sel.sum) && /淑芬/.test(sel.sum) && /太太/.test(sel.sum),
    `the summary names them and who they are (${sel.sum})`,
  );
  await entered(p);
  await p.waitForTimeout(1500);
  const s0 = await p.evaluate(() => {
    const g = window.__game;
    return { m: g.mates(), P: [g.player.pos.x, g.player.pos.z], home: g.surv().home, ms: g.mateStats() };
  });
  console.log('   spawn', JSON.stringify(s0.m.map(m => [m.name, m.p.map(Math.round), m.inv, m.equip])));
  check(s0.m.length === 2, 'two teammates in the game');
  check(
    s0.m.every(m => Math.hypot(m.p[0] - s0.P[0], m.p[1] - s0.P[1]) < 4),
    'they wake beside the player',
  );
  check(apart(s0.m, s0.P), 'each in their own spot (not on the player, not on each other)');
  check(
    s0.m[0].inv.snack === 2 && s0.m[1].inv.hammer === 1,
    'each with their own starting pack (the student’s snacks, the technician’s hammer)',
  );
  check(
    s0.m[1].equip === 'pipe' || s0.m[1].equip === 'hammer',
    `the technician holds a tool to swing (${s0.m[1].equip})`,
  );
  await p.screenshot({ path: shot('v2440-1-wake.png') });
  // out of the home: the player walks the way out (real movement and collision, opening the home door), then shuts the
  // door behind them while the teammates are still inside: they open it, come through and close it again
  await p.evaluate(() => window.__game.autoWalk());
  const walk = await p.evaluate(async () => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const key = code => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    };
    const door = g.autoState().door;
    let shut = null;
    for (let i = 0; i < 200; i++) {
      await wait(150);
      const a = g.autoState();
      if (a.cd) key('KeyE');
      if (!shut && door && !a.inBld && Math.hypot(a.p[0] - door[0], a.p[1] - door[1]) > 0.9) {
        const inside = g.mates().filter(m => g.inBld(m.p[0], m.p[1])).length;
        g.doorSet(door[0], door[1], false);
        shut = { inside };
      }
      if (a.i >= a.n) break;
    }
    await wait(4000);
    const a = g.autoState();
    return { a, m: g.mates(), ms: g.mateStats(), shut, door: door && g.doorsNear(door[0], door[1], 0.5)[0] };
  });
  console.log(
    '   walk',
    JSON.stringify({ n: walk.a.n, inBld: walk.a.inBld, ms: walk.ms, shut: walk.shut, door: walk.door }),
  );
  check(!walk.a.inBld, 'the player is out in the street');
  check(
    walk.m.every(m => Math.hypot(m.p[0] - walk.a.p[0], m.p[1] - walk.a.p[1]) < 5),
    `both followed the player out (${walk.m.map(m => Math.hypot(m.p[0] - walk.a.p[0], m.p[1] - walk.a.p[1]).toFixed(1))} m)`,
  );
  check(
    walk.m.every(m => m.space === 'street'),
    'both are in the street',
  );
  check(
    walk.shut?.inside > 0 && walk.ms.doors >= 1,
    `the door shut on them: they opened it (${JSON.stringify(walk.shut)}, opened ${walk.ms.doors})`,
  );
  check(walk.ms.closed >= 1 && walk.door && !walk.door.open, `and closed it again behind them (${walk.ms.closed})`);
  check(walk.ms.teleports === 0, `nobody had to be put back beside the player (${walk.ms.teleports})`);
  await p.screenshot({ path: shot('v2440-1-out.png') });
  check(!errs.length, `no page errors (${errs.join(' | ')})`);
}

// ---- 2. their pace and their stance: they sneak when the player sneaks, and keep up
if (run(2) && page) {
  const p = page;
  const st = await p.evaluate(async () => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    g.player.sneak = true;
    const P = [g.player.pos.x, g.player.pos.z];
    g.autoPath([
      [P[0] + 6, P[1]],
      [P[0] + 6, P[1] + 0.1],
    ]);
    await wait(1500);
    const sneak = g.mates().map(m => [m.sneak, m.anim]);
    await wait(5000);
    g.player.sneak = false;
    await wait(2500);
    return { sneak, P2: [g.player.pos.x, g.player.pos.z], m: g.mates() };
  });
  console.log('   stance', JSON.stringify({ sneak: st.sneak }));
  check(
    st.sneak.every(([s, a]) => s && a === 'sneak'),
    'they crouch and sneak while the player sneaks',
  );
  check(
    st.m.every(m => Math.hypot(m.p[0] - st.P2[0], m.p[1] - st.P2[1]) < 4.5),
    `and keep up (${st.m.map(m => Math.hypot(m.p[0] - st.P2[0], m.p[1] - st.P2[1]).toFixed(1))} m)`,
  );
}

// ---- 3. up the stairs and down again; one told to wait stays in the street, one left upstairs comes down
if (run(3) && page) {
  const p = page;
  const S = await p.evaluate(async () => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const c = [g.player.pos.x, g.player.pos.z];
    const s = g
      .stairs()
      .filter(q => q.d === 'core')
      .sort((a, b) => Math.hypot(a.c[0] - c[0], a.c[1] - c[1]) - Math.hypot(b.c[0] - c[0], b.c[1] - c[1]))[0];
    g.player.hp = 100;
    g.tp(s.foot[0], s.foot[1]); // (whoever follows within 6 m comes along)
    await wait(1500);
    const atFoot = g.mates().map(m => Math.hypot(m.p[0] - s.foot[0], m.p[1] - s.foot[1]));
    // the second is told to wait, a few metres off
    g.mateSet(1, { mode: 1 });
    const q = g.mates()[1].p;
    const away = [s.foot[0] + (q[0] - s.foot[0]) * 3, s.foot[1] + (q[1] - s.foot[1]) * 3];
    g.mateTp(1, away[0], away[1]);
    await wait(300);
    const went = g.upToggle();
    await wait(1500);
    const u = g.upState();
    const up = g.mates();
    // upstairs the first is where the floor really is on the map, not in the space all floors share
    const real = [g.player.pos.x - u.off[0], g.player.pos.z - u.off[1]];
    // the first is told to wait up here, and the player goes down
    g.mateSet(0, { mode: 1 });
    g.tp(u.land[0], u.land[1]);
    await wait(300);
    g.upToggle();
    await wait(1500);
    const down = g.mates();
    g.mateSet(0, { mode: 0 });
    g.mateSet(1, { mode: 0 });
    await wait(4000);
    return { went, atFoot, up, real, down, after: g.mates(), Pa: [g.player.pos.x, g.player.pos.z], ms: g.mateStats() };
  });
  console.log(
    '   stairs',
    JSON.stringify({
      atFoot: S.atFoot,
      up: S.up.map(m => [m.space, m.at.map(Math.round)]),
      real: S.real.map(Math.round),
      down: S.down.map(m => [m.space, m.p.map(Math.round)]),
      ms: S.ms,
    }),
  );
  check(
    S.atFoot.every(d => d < 5 && d > 0.6),
    'carried along to the foot of the stairs (beside it, not on it)',
  );
  check(S.went && S.up[0].space === 'up', 'the one following comes up the stairs');
  check(
    Math.hypot(S.up[0].at[0] - S.real[0], S.up[0].at[1] - S.real[1]) < 4,
    'upstairs, where they are on the map is where the floor really is',
  );
  check(S.up[1].space === 'street', 'the one told to wait stays in the street');
  check(
    S.down.every(m => m.space === 'street' && m.p[0] < 15000),
    'nobody is left upstairs once the player is down (the one waiting up there comes down too)',
  );
  check(S.ms.outOf >= 1, `(the one left upstairs was brought down: ${S.ms.outOf})`);
  check(
    S.after.every(m => Math.hypot(m.p[0] - S.Pa[0], m.p[1] - S.Pa[1]) < 5) && apart(S.after, S.Pa),
    `told to follow again, both are with the player (${S.after.map(m => Math.hypot(m.p[0] - S.Pa[0], m.p[1] - S.Pa[1]).toFixed(1))} m)`,
  );
}

// ---- 3b. floor after floor: a step up the stairs inside a building is short, but they still come along each floor,
// and come back down with the player
if (run(3) && page) {
  const p = page;
  const F = await p.evaluate(async () => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const c = [g.player.pos.x, g.player.pos.z];
    const s = g
      .stairs()
      .filter(q => q.d === 'core' && q.top >= 3)
      .sort((a, b) => Math.hypot(a.c[0] - c[0], a.c[1] - c[1]) - Math.hypot(b.c[0] - c[0], b.c[1] - c[1]))[0];
    if (!s) return null;
    g.mateSet(0, { mode: 0 });
    g.mateSet(1, { mode: 0 });
    g.tp(s.foot[0], s.foot[1]);
    await wait(1500);
    const floors = [];
    for (let i = 0; i < 3; i++) {
      const u = g.upState();
      if (u.up && u.upFoot) g.tp(u.upFoot[0], u.upFoot[1]);
      await wait(400);
      if (!g.upToggle()) break;
      await wait(1200);
      const v = g.upState();
      floors.push({ f: v.f, roof: v.roof, m: g.mates().map(m => m.space) });
      if (v.roof || v.f >= 3) break;
    }
    // and down again, floor by floor
    for (let i = 0; i < 12 && g.upState().up; i++) {
      const v = g.upState();
      g.tp(v.land[0], v.land[1]);
      await wait(300);
      g.upToggle();
      await wait(900);
    }
    await wait(1500);
    return { floors, down: g.mates(), P: [g.player.pos.x, g.player.pos.z], jumps: g.mateStats().jumps };
  });
  console.log('   floors', JSON.stringify(F && { floors: F.floors, down: F.down.map(m => m.space), jumps: F.jumps }));
  if (F) {
    check(
      F.floors.length >= 2 && F.floors.every(q => q.m.every(s => s === 'up')),
      `floor after floor, both come along (${JSON.stringify(F.floors)})`,
    );
    check(
      F.down.every(m => m.space === 'street' && Math.hypot(m.p[0] - F.P[0], m.p[1] - F.P[1]) < 5),
      'and come back down with the player',
    );
  }
}

// ---- 4. into the metro and out again
if (run(4) && page) {
  const p = page;
  const M = await p.evaluate(async () => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const st = g.metro().find(s => s.name === '龍山寺');
    const gt = st.gates[0];
    g.tp(gt.ent[0], gt.ent[1]);
    await wait(1500);
    const near = g.mates().map(m => Math.hypot(m.p[0] - gt.ent[0], m.p[1] - gt.ent[1]));
    g.metroUse();
    await wait(2000);
    const under = g.mates();
    const Pu = [g.player.pos.x, g.player.pos.z];
    g.tp(gt.exit[0], gt.exit[1]);
    await wait(500);
    g.metroUse();
    await wait(2000);
    return { near, under, Pu, out: g.mates(), Po: [g.player.pos.x, g.player.pos.z] };
  });
  console.log(
    '   metro',
    JSON.stringify({
      near: M.near,
      under: M.under.map(m => [m.space, m.at.map(Math.round)]),
      out: M.out.map(m => [m.space, m.p.map(Math.round)]),
    }),
  );
  check(
    M.under.every(m => m.space === 'metro'),
    'both go down into the station with the player',
  );
  check(apart(M.under, M.Pu), 'each in their own spot down there');
  check(
    M.under.every(m => m.at[1] > -20000),
    'underground, where they are on the map is the street exit above',
  );
  check(
    M.out.every(m => m.space === 'street' && Math.hypot(m.p[0] - M.Po[0], m.p[1] - M.Po[1]) < 5) && apart(M.out, M.Po),
    'and come back up with the player',
  );
}

// ---- 5. a car: both get in (three seats beside the driver), and out beside the player; a motorbike takes one
if (run(5) && page) {
  const p = page;
  const V = await p.evaluate(async () => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const key = code => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    };
    // (out in the open: E by a door opens the door before it gets anyone out of a vehicle)
    const P0 = [g.player.pos.x, g.player.pos.z];
    let P = P0;
    for (let k = 0; k < 400; k++) {
      const q = [P0[0] + ((k * 7) % 41) - 20, P0[1] + ((k * 13) % 41) - 20];
      const ok = [0, 1, 2, 3].every(j => !g.inBld(q[0] + (j % 2) * 3 - 1.5, q[1] + (j >> 1) * 3 - 1.5));
      if (ok && !g.doorsNear(q[0], q[1], 5).length && g.roadDist(q[0], q[1]) < 3) {
        P = q;
        break;
      }
    }
    g.tp(P[0], P[1]);
    await wait(1500);
    const v = g.drive.spawn('sedan', P[0] + 2.5, P[1], 0, Math.random, {
      key: true,
      fuel: 20,
      tyre: 1,
      eng: 1,
      bat: 1,
    });
    g.tp(v.pos.x - 1.4, v.pos.z);
    await wait(1200);
    key('KeyE');
    await wait(800);
    const inCar = { cur: !!g.drive.cur, m: g.mates().map(m => [m.space, m.visible]) };
    key('KeyE');
    await wait(1200);
    const out = { cur: !!g.drive.cur, m: g.mates(), P: [g.player.pos.x, g.player.pos.z] };
    // a motorbike: one behind the rider, the other waits
    const mb = g.drive.spawn('scooter', g.player.pos.x + 2, g.player.pos.z + 2, 0, Math.random, {
      key: true,
      fuel: 5,
      tyre: 1,
      eng: 1,
      bat: 1,
    });
    g.tp(mb.pos.x - 1, mb.pos.z);
    await wait(1200);
    key('KeyE');
    await wait(800);
    const bike = g.mates().map(m => m.space);
    // the one without a seat waits where they were while the player rides off, and is not put beside them
    const stay = g.mates().find(m => m.space !== 'car');
    const tp0 = g.mateStats().teleports;
    g.drive.cur.pos.x += 30;
    await wait(2000);
    const waited = g.mates().find(m => m.id === stay.id);
    key('KeyE');
    await wait(1500);
    const off = !g.drive.cur;
    await wait(1500);
    const still = g.mates().find(m => m.id === stay.id);
    const far = Math.hypot(still.p[0] - g.player.pos.x, still.p[1] - g.player.pos.z);
    // back near them: they follow again
    g.tp(stay.p[0] + 3, stay.p[1]);
    await wait(2500);
    const back = g.mates().find(m => m.id === stay.id);
    return {
      inCar,
      out,
      bike,
      ms: g.mateStats(),
      off,
      after: g.mates().map(m => m.space),
      moved: Math.hypot(still.p[0] - stay.p[0], still.p[1] - stay.p[1]),
      waitedMoved: Math.hypot(waited.p[0] - stay.p[0], waited.p[1] - stay.p[1]),
      far,
      tps: g.mateStats().teleports - tp0,
      back: [back.mode, Math.hypot(back.p[0] - g.player.pos.x, back.p[1] - g.player.pos.z)],
    };
  });
  console.log('   vehicles', JSON.stringify({ inCar: V.inCar, bike: V.bike, boarded: V.ms.boarded }));
  check(
    V.inCar.cur && V.inCar.m.every(([s, vis]) => s === 'car' && !vis),
    'both get into the car with the player (and are not drawn)',
  );
  check(
    !V.out.cur &&
      V.out.m.every(
        m => m.space === 'street' && m.visible && Math.hypot(m.p[0] - V.out.P[0], m.p[1] - V.out.P[1]) < 4.5,
      ) &&
      apart(V.out.m, V.out.P),
    'and get out beside the player',
  );
  check(V.bike.filter(s => s === 'car').length === 1, `a motorbike takes one behind the rider (${V.bike})`);
  check(V.off && V.after.every(s => s === 'street'), 'off the motorbike, both on foot again');
  check(
    V.waitedMoved < 1 && V.moved < 1 && V.far > 20 && V.tps === 0,
    `the one left behind waits where they were (moved ${V.moved.toFixed(1)} m; the player ${V.far.toFixed(0)} m off)`,
  );
  check(V.back[1] < 6, `and follows again once the player is back (${V.back[1].toFixed(1)} m)`);
}

// ---- 6. eating, drinking and bleeding: from their own pack; with nothing, they ask
if (run(6) && page) {
  const p = page;
  const V = await p.evaluate(async () => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const said = [];
    const mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => said.push(n.textContent || ''))));
    mo.observe(document.getElementById('log'), { childList: true });
    const used0 = g.mateStats().used;
    g.mateSet(0, { hunger: 20 }); // (the student has her snacks)
    g.sim(100); // (five seconds of the game, stepped: a busy machine does not shorten them)
    const ate = { used: g.mateStats().used - used0, hunger: g.mates()[0].hunger, inv: g.mates()[0].inv };
    g.mateGiveTo(1, 'bandage', 1);
    g.mateSet(1, { bleed: true });
    g.sim(100);
    const band = { bleed: g.mates()[1].bleed, left: g.mates()[1].inv.bandage || 0 };
    g.mateSet(0, { hunger: 10, inv: {} });
    g.sim(100);
    await wait(300);
    mo.disconnect();
    g.mateSet(0, { hunger: 80, thirst: 80 });
    return { ate, band, said };
  });
  console.log('   vitals', JSON.stringify(V));
  check(V.ate.used >= 1 && V.ate.hunger > 20, 'hungry, they eat from their own pack');
  check(!V.band.bleed && V.band.left === 0, 'bleeding, they bandage themselves');
  check(
    V.said.some(t => /欣妤：「我好餓/.test(t)),
    'with nothing to eat, they ask the player for something',
  );
}

// ---- 7. a second game: an office worker with a technician and a nurse. Their skills while they are near.
if (run(7)) {
  await page?.close(); // (one game at a time)
  const p = (page = await b.newPage({ viewport: { width: 1280, height: 800 } }));
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 600)));
  await p.goto(url);
  await start(p, {
    g: 'm',
    role: 'office',
    mates: [
      { r: 'tech', g: 'm' },
      { r: 'nurse', g: 'f' },
    ],
  });
  await entered(p);
  await p.waitForTimeout(2000);
  const K = await p.evaluate(async () => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const said = [];
    const mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => said.push(n.textContent || ''))));
    mo.observe(document.getElementById('log'), { childList: true });
    const near = { lock: g.mateSkill('lockpick'), repair: g.mateSkill('repair'), medic: g.mateSkill('medic') };
    // the nurse treats the player (twice as well)
    g.player.hp = 40;
    g.addItem('bandage', 1);
    g.useItem('bandage');
    const hp = g.player.hp;
    // both told to wait, and the player walks off: the skills stay with them
    const P = [g.player.pos.x, g.player.pos.z];
    g.mateSet(0, { mode: 1 });
    g.mateSet(1, { mode: 1 });
    g.mateTp(0, P[0] + 40, P[1]);
    g.mateTp(1, P[0] + 40, P[1] + 1);
    await wait(500);
    const far = { lock: g.mateSkill('lockpick'), repair: g.mateSkill('repair'), medic: g.mateSkill('medic') };
    g.mateTp(0, P[0] + 1.2, P[1]);
    g.mateTp(1, P[0], P[1] + 1.2);
    g.mateSet(0, { mode: 0 });
    g.mateSet(1, { mode: 0 });
    mo.disconnect();
    return { near, far, hp, said, fog: g.fogLit() };
  });
  console.log('   skills', JSON.stringify(K));
  check(K.near.lock === true && K.near.repair === 2, 'the technician beside you: lockpicking, hot-wiring and repairs');
  check(
    K.near.medic === 2 && Math.round(K.hp) === 40 + 2 * 5,
    `the nurse beside you treats you twice as well (${K.hp})`,
  );
  check(
    K.said.some(t => /小雯幫你處理傷口/.test(t)),
    'and says so',
  );
  check(!K.far.lock && !K.far.repair && !K.far.medic, 'far off, their skills are not yours');
  check(!errs.length, `no page errors (${errs.join(' | ')})`);
}

// ---- 8. T and the panel: everyone waits / follows; held, the fire rule; handing things over and taking them back
if (run(8) && page) {
  const p = page;
  await p.keyboard.press('KeyT');
  await p.waitForTimeout(300);
  const wait1 = await p.evaluate(() => window.__game.mates().map(m => m.mode));
  await p.keyboard.press('KeyT');
  await p.waitForTimeout(300);
  const follow = await p.evaluate(() => window.__game.mates().map(m => m.mode));
  await p.keyboard.down('KeyT');
  await p.waitForTimeout(700);
  await p.keyboard.up('KeyT');
  await p.waitForTimeout(300);
  const rule = await p.evaluate(() => window.__game.mates().map(m => [m.mode, m.rule]));
  console.log('   T', JSON.stringify({ wait1, follow, rule }));
  check(
    wait1.every(m => m === 1),
    'T: everyone waits',
  );
  check(
    follow.every(m => m === 0),
    'T again: everyone follows',
  );
  check(
    rule.every(([m, r]) => m === 0 && r === 2),
    'T held: the fire rule changes (and nobody stops following)',
  );
  const X = await p.evaluate(async () => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    g.mateTp(0, g.player.pos.x + 1, g.player.pos.z);
    g.addItem('can', 1);
    g.matePanel(0);
    await wait(300);
    const title = document.getElementById('loot-items-title')?.textContent || '';
    const giveBtn = [...document.querySelectorAll('#inventory-items .it')].find(
      b => b.dataset.item === 'inventory-items:can',
    );
    const giveLabel = giveBtn?.querySelector('.item-action')?.textContent;
    giveBtn?.click();
    await wait(200);
    const gave = { mate: g.mates()[0].inv.can || 0, me: g.player.inv.can || 0 };
    const takeBtn = [...document.querySelectorAll('#loot-items .it')].find(b => b.dataset.item === 'loot-items:hammer');
    takeBtn?.click();
    await wait(200);
    const took = { mate: g.mates()[0].inv.hammer || 0, me: g.player.inv.hammer || 0, equip: g.mates()[0].equip };
    const foot = [...document.querySelectorAll('#panel .inventory-actions button')].map(b => b.textContent);
    document.getElementById('inventory-close')?.click();
    return { title, giveLabel, gave, took, foot };
  });
  console.log('   panel', JSON.stringify(X));
  check(/阿財/.test(X.title) && /水電師傅/.test(X.title), `the panel shows the teammate's pack (${X.title})`);
  check(X.giveLabel === '給' && X.gave.mate === 1 && X.gave.me === 0, 'a can of food handed over');
  check(X.took.me === 1 && X.took.mate === 0 && X.took.equip === 'pipe', 'the hammer taken back (he holds the pipe)');
  check(
    X.foot.some(t => /在這裡等|跟著我/.test(t)) && X.foot.some(t => /開火/.test(t)),
    'the orders are under their pack',
  );
}

// ---- 9. saved and loaded: as they were, beside the player again
if (run(9) && page) {
  const p = page;
  const before = await p.evaluate(async () => {
    const g = window.__game;
    g.mateSet(1, { mode: 1, hunger: 33 });
    g.save();
    return { m: JSON.parse(localStorage.getItem('defendtaipei-save-v1')).m, mates: g.mates() };
  });
  console.log('   saved', JSON.stringify(before.m.map(m => [m.r, m.g, m.m, m.f, Math.round(m.hu), m.w])));
  await p.goto(base + 'manifest.webmanifest');
  await p.evaluate(() => sessionStorage.setItem('dt.autoload', '1'));
  await p.goto(url, { waitUntil: 'commit' });
  await entered(p);
  await p.waitForTimeout(2000);
  const after = await p.evaluate(() => {
    const g = window.__game;
    return { m: g.mates(), P: [g.player.pos.x, g.player.pos.z] };
  });
  check(before.m?.length === 2 && before.m[0].r === 'tech' && before.m[1].g === 'f', 'the save has both');
  check(
    after.m.length === 2 &&
      after.m[0].name === '阿財' &&
      after.m[1].name === '小雯' &&
      after.m[0].rule === 2 &&
      after.m[1].mode === 1 &&
      Math.round(after.m[1].hunger) === 33 &&
      after.m[0].inv.can === 1,
    'loaded, they are as they were (pack, orders, hunger)',
  );
  check(
    after.m.every(m => Math.hypot(m.p[0] - after.P[0], m.p[1] - after.P[1]) < 5) && apart(after.m, after.P),
    'and beside the player again',
  );
}

// ---- 10. down: a bandage within 60 s brings them back; too late, they are gone and their pack lies there
if (run(10) && page) {
  const p = page;
  const D = await p.evaluate(async () => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const key = code => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    };
    g.mateSet(1, { mode: 0 });
    g.addItem('bandage', 1);
    const P = [g.player.pos.x, g.player.pos.z];
    g.mateTp(0, P[0] + 1, P[1]);
    g.mateDown(0);
    await wait(600);
    const prompt = document.getElementById('prompt').textContent;
    const down = g.mates()[0];
    key('KeyE');
    await wait(400);
    const saved = g.mates()[0];
    const inv1 = g.mates()[1].inv;
    g.mateDown(1);
    g.mateSet(1, { downT: 1 });
    g.sim(40);
    await wait(300);
    const gone = g.mates()[1];
    const pack = g.cont('mategear1');
    return { prompt, down: down.st, saved: [saved.st, saved.hp], gone: gone.st, pack, inv1, standIns: g.standIns() };
  });
  console.log('   down', JSON.stringify(D));
  check(D.down === 1 && /救阿財/.test(D.prompt), `down, the prompt says to save him (${D.prompt})`);
  check(D.saved[0] === 0 && D.saved[1] > 0, 'a bandage brings him back to his feet');
  check(D.gone === 2, 'left too long, she is gone');
  check(
    D.pack && Object.keys(D.inv1).every(k => D.pack.items[k] === D.inv1[k]),
    'and her pack lies where she fell, with everything in it',
  );
}

// ---- 11. without anyone chosen nothing changes: no teammates, no new key in the save, nobody else on the soldiers' list
if (run(11)) {
  const res = [];
  for (const u of [base, url]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(u);
    await start(p, { g: 'f', role: 'nurse', mates: [] });
    await entered(p);
    await p.waitForTimeout(1500);
    res.push(
      await p.evaluate(() => {
        const g = window.__game;
        g.save();
        const sv = JSON.parse(localStorage.getItem('defendtaipei-save-v1'));
        return { mates: g.mates().length, keys: Object.keys(sv).join(), others: g.standIns().length };
      }),
    );
    await p.close();
  }
  console.log('   alone', JSON.stringify(res));
  check(
    res.every(r => r.mates === 0 && r.others === 0),
    'nobody chosen: no teammates, nobody else on the list',
  );
  check(res[0].keys === res[1].keys && !/(^|,)m(,|$)/.test(res[0].keys), 'and the save has the same fields as before');
}

// ---- 12. a phone: one at most, the 隊 button, and the opening scene within its draw budget
if (run(12)) {
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 600)));
  await p.goto(url);
  const sel = await start(p, {
    g: 'f',
    role: 'nurse',
    mates: [
      { r: 'courier', g: 'm' },
      { r: 'student', g: 'm' },
    ],
  });
  await entered(p);
  await p.waitForTimeout(6000);
  const R = await p.evaluate(() => {
    const g = window.__game;
    const tb = document.getElementById('teambtn');
    const r = tb?.getBoundingClientRect();
    const joy = document.getElementById('joy')?.getBoundingClientRect();
    const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const others = ['pbact', 'pbsec', 'equip', 'menubtn', 'pmapbtn'].map(id => [
      id,
      hit(r, document.getElementById(id)?.getBoundingClientRect()),
    ]);
    return {
      n: g.mates().length,
      btn: !!tb && getComputedStyle(tb).display !== 'none' && r.width > 30,
      onJoy: hit(r, joy),
      others,
      rinfo: g.rinfo(),
      draw: g.mateDraw(),
      fog: g.fogLit(),
    };
  });
  console.log('   phone', JSON.stringify({ on: sel.on, ...R }));
  check(sel.on.length === 1, 'a phone takes one');
  check(R.n === 1 && R.btn, 'the 隊 button is there');
  check(!R.onJoy && R.others.every(([, h]) => !h), `and covers no other control (${JSON.stringify(R.others)})`);
  check(
    R.draw.on - R.draw.off <= 20,
    `a teammate on a phone is a light figure: ${R.draw.on - R.draw.off} draw calls (the opening scene ${R.rinfo.calls})`,
  );
  check(R.fog > 200, `a courier among them knows every street (${R.fog} cells of the map)`);
  // the button opens the teammate's pack
  await p.tap('#teambtn');
  await p.waitForTimeout(600);
  const open = await p.evaluate(
    () =>
      !document.getElementById('panel').classList.contains('hidden') &&
      document.getElementById('loot-items-title')?.textContent,
  );
  check(/阿明/.test(open || ''), `tapping it opens his pack (${open})`);
  check(!errs.length, `no page errors (${errs.join(' | ')})`);
  await ctx.close();
}

// ---- 13. the opening: the card names who comes with you, and they follow you to work
if (run(13)) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(url);
  await start(p, { g: 'm', role: 'student', mates: [{ r: 'tech', g: 'f' }], skipIntro: false });
  await entered(p);
  const card = await p.evaluate(() => document.querySelector('#wake .wake-mates')?.textContent || '');
  await p.waitForTimeout(8000);
  const O = await p.evaluate(() => {
    const g = window.__game;
    return { pro: g.PRO.on, m: g.mates(), P: [g.player.pos.x, g.player.pos.z] };
  });
  console.log('   opening', JSON.stringify({ card, pro: O.pro }));
  check(/淑芬/.test(card) && /媽媽/.test(card), `the opening card says she is with you (${card})`);
  check(O.m.length === 1 && Math.hypot(O.m[0].p[0] - O.P[0], O.m[0].p[1] - O.P[1]) < 6, 'and she is with you');
  await p.close();
}

await Promise.race([b.close(), new Promise(r => setTimeout(r, 12000))]);
srv?.stop();
console.log(failed.length ? `\n${failed.length} FAILED:\n- ${failed.join('\n- ')}` : '\nall passed');
process.exit(failed.length ? 1 : 0);
