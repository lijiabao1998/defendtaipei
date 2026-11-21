// v24.39 groundwork for teammates.
// - Remnant squads keep what happened to them over Continue: a fallen position stays fallen, a wounded soldier stays
//   wounded, the day's supplies stay taken, and what happens after Continue reaches the save (the squads kept the
//   survival state a new game starts with, and went on reading and writing that one after Continue replaced it).
// - A soldier wounded from a rooftop looks for the shooter where the building really is, not in the space all the
//   floors share 24 km east of the city.
// - The soldiers deal with someone besides the player when one is on their list: a stand-in placed by the check is
//   seen, gone after, fired on and struck with the rifle butt; of two in sight the nearer is taken; nothing is fired on
//   once it is down. Without one, nothing changes (no soldier is ever after anyone but the player).
// argv: [url] (default: vite preview)
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4239);
const url = gameUrl(process.argv[2] || srv?.url).replace(/\?.*$/, '');
const b = await launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 600)));
const failed = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
await p.goto(url);
await pickRole(p, { g: 'm', role: 'office', skipIntro: true, entryTimeout: 240000 });
await p.evaluate(() => window.__game.setMin(10 * 60));
await p.waitForTimeout(1500);

// ---- 1. remnant squads over Continue
const R = await p.evaluate(() => window.__game.rem());
console.log('   squads', JSON.stringify(R.squads.map(q => [q.id, q.p.map(Math.round), q.alive])));
check(R.squads.length >= 4, `four remnant squads (${R.squads.length})`);
const [q0, q1, q2, q3] = R.squads;
const before = await p.evaluate(
  async ([q0, q1, q2]) => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    // the day's supplies from the first
    g.tp(q0.p[0], q0.p[1] + 0.2);
    await wait(600);
    g.remTalk();
    const btn = [...document.querySelectorAll('#dlg button')].find(b => /補給|supplies/.test(b.textContent));
    btn?.click();
    [...document.querySelectorAll('#dlg button')].pop()?.click();
    // the second loses its last man
    g.tp(q1.p[0] + 3, q1.p[1] + 3);
    g.surv().rem[q1.id].hp = [0, 0, 0, 0];
    for (let i = 0; i < 40 && !g.surv().rem[q1.id].fallen; i++) await wait(250);
    // one of the third is wounded
    g.surv().rem[q2.id].hp[1] = 35;
    const day = g.surv().day;
    g.save();
    return { took: !!btn, day, rem: JSON.parse(JSON.stringify(g.surv().rem)) };
  },
  [q0, q1, q2],
);
console.log('   before', JSON.stringify(before));
check(before.took && before.rem[q0.id].supply === before.day, "the first squad's supplies are taken");
check(before.rem[q1.id].fallen === 1, 'the second position falls');
await p.goto(url + 'manifest.webmanifest');
await p.evaluate(() => sessionStorage.setItem('dt.autoload', '1'));
await p.goto(url, { waitUntil: 'commit' });
// the first frames of the loaded game: the men of the fallen position (the player is next to it) are drawn lying,
// not standing and then falling (looked at every frame, for 20 s after the game starts)
const firstLook = await (
  await p.waitForFunction(
    id => {
      const g = window.__game;
      if (!g?.started?.()) return false;
      window.__t39 ||= performance.now();
      const q = g.rem()?.squads.find(q => q.id === id);
      const d = q?.deadT;
      if (d && Math.max(...d) > 0) return d;
      return performance.now() - window.__t39 > 20000 ? 'never' : false;
    },
    q1.id,
    { timeout: 600000, polling: 'raf' },
  )
).jsonValue();
await p.waitForTimeout(3000);
const after = await p.evaluate(
  async ([q0, q1, q2, q3]) => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const L = g.rem().squads;
    const by = id => L.find(q => q.id === id);
    const out = {
      day: g.surv().day,
      fallen: by(q1.id).save.fallen,
      alive1: by(q1.id).alive,
      wounded: by(q2.id).save.hp[1],
      supply: by(q0.id).save.supply,
      crate: g.conts.find(c => c.id === 'remgear' + q1.id)?.label ?? null,
    };
    // the first does not hand out today's supplies again
    g.tp(q0.p[0], q0.p[1] + 0.2);
    await wait(600);
    g.remTalk();
    out.again = [...document.querySelectorAll('#dlg button')].some(b => /補給|supplies/.test(b.textContent));
    [...document.querySelectorAll('#dlg button')].pop()?.click();
    // the fallen one is a memorial
    g.tp(q1.p[0], q1.p[1] + 0.2);
    await wait(600);
    g.remTalk();
    out.memorial = /最後的陣地|Last position/.test(document.getElementById('dlg')?.textContent || '');
    [...document.querySelectorAll('#dlg button')].pop()?.click();
    // and what happens now reaches the game's state: the third hands out its supplies, the fourth falls
    g.addItem('bandage', 1);
    g.tp(q2.p[0], q2.p[1] + 0.2);
    await wait(600);
    g.remTalk();
    // (the squad itself knows it has a wounded man: there is something to bandage)
    out.bandage = [...document.querySelectorAll('#dlg button')].some(b => /包紮|Bandage/.test(b.textContent));
    [...document.querySelectorAll('#dlg button')].find(b => /補給|supplies/.test(b.textContent))?.click();
    [...document.querySelectorAll('#dlg button')].pop()?.click();
    out.supply2 = g.surv().rem[q2.id].supply;
    g.tp(q3.p[0] + 3, q3.p[1] + 3);
    g.surv().rem[q3.id].hp = [0, 0, 0, 0];
    for (let i = 0; i < 40 && !g.surv().rem[q3.id].fallen; i++) await wait(250);
    out.fallen3 = g.surv().rem[q3.id].fallen;
    out.crate3 = g.conts.some(c => c.id === 'remgear' + q3.id);
    g.save();
    const sv = JSON.parse(localStorage.getItem('defendtaipei-save-v1'));
    out.saved = { supply2: sv.surv.rem[q2.id]?.supply, fallen3: sv.surv.rem[q3.id]?.fallen };
    return out;
  },
  [q0, q1, q2, q3],
);
console.log('   after Continue', JSON.stringify(after));
check(after.fallen === 1 && after.alive1 === 0, 'after Continue the fallen position is still fallen');
check(after.memorial, 'and is still a memorial');
check(
  Array.isArray(firstLook) && firstLook.every(t => t >= 1),
  `its men are lying there from the first frame, not falling again (${JSON.stringify(firstLook)})`,
);
check(after.crate === '國軍殘部遺留裝備', `its gear crate keeps its name (${after.crate})`);
check(
  after.wounded === 35 && after.bandage,
  `the wounded soldier is still wounded (hp ${after.wounded}, someone to bandage: ${after.bandage})`,
);
check(after.supply === after.day && !after.again, "today's supplies are not handed out twice");
check(after.supply2 === after.day, 'supplies taken after Continue are kept in the game');
check(after.fallen3 === 1 && after.crate3, 'a squad that falls after Continue falls (and leaves its crate)');
check(
  after.saved.supply2 === after.day && after.saved.fallen3 === 1,
  'and both reach the save (' + JSON.stringify(after.saved) + ')',
);
const foes0 = await p.evaluate(() => window.__game.solFoes?.().filter(f => f.foe !== undefined).length ?? -1);
check(foes0 === 0, 'with no one but the player, no soldier is after anyone else');

// ---- 2. a soldier wounded from a rooftop looks for the shooter on the map
const roof = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  g.setMin(11 * 60);
  const c = g.start();
  const picks = g
    .stairs()
    .filter(s => s.d === 'core' && s.top >= 3 && s.top <= 5)
    .map(s => ({ ...s, dist: Math.hypot(s.c[0] - c[0], s.c[1] - c[1]) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 10);
  for (const s of picks) {
    g.player.hp = 1e6;
    for (const q of g.sols) q.night = q.day = true;
    g.tp(s.foot[0], s.foot[1]);
    await wait(500);
    for (let i = 0; i < 16 && !g.upState().roof; i++) {
      const u = g.upState();
      if (u.up && !u.upFoot) break;
      if (u.up) g.tp(u.upFoot[0], u.upFoot[1]);
      g.upToggle();
      await wait(220);
    }
    const u = g.upState();
    if (!u.roof) continue;
    const home = [g.player.pos.x, g.player.pos.z];
    for (const d of [20, 24, 28, 17])
      for (let k = 0; k < 24; k++) {
        const F0 = g.upFire();
        const a = (k / 24) * Math.PI * 2;
        const x = F0.real[0] + Math.sin(a) * d,
          z = F0.real[2] + Math.cos(a) * d;
        if (g.roadDist(x, z) > 1.5 || g.inBld(x, z)) continue;
        const e = F0.exit(x, z);
        if (e > 12) continue;
        const m = Math.max(0, e - 0.5);
        g.tp(home[0] + Math.sin(a) * m, home[1] + Math.cos(a) * m);
        const F = g.upFire();
        if (F.los(x, z) && F.trace(x, z).length === 0) {
          const sol = g.sols.find(q => q.state !== 'dead');
          sol.pos.set(x, 0, z);
          sol.night = sol.day = false;
          sol.state = 'patrol';
          sol.route = [
            [x, z],
            [x, z],
          ];
          sol.wi = 0;
          sol.hp = 100;
          sol.alert = 0;
          sol.post = undefined;
          // looking away: he has not seen the head at the parapet
          sol.dir = Math.atan2(z - F.real[2], x - F.real[0]);
          window.__sol = sol;
          return { ok: true, d, fy: u.fy, real: F.real, sol: [x, z], home };
        }
        g.tp(home[0], home[1]);
      }
    for (let i = 0; i < 20 && g.upState().up; i++) {
      const v = g.upState();
      g.tp(v.land[0], v.land[1]);
      g.upToggle();
      await wait(80);
    }
  }
  return { ok: false };
});
console.log('   rooftop', JSON.stringify(roof));
check(roof.ok, 'a rooftop with a clear line down to a street');
if (roof.ok) {
  await p.waitForTimeout(800);
  const scr = await p.evaluate(() => {
    const g = window.__game;
    g.addItem('t91', 1);
    g.addItem('a556n', 60);
    g.useItem('t91');
    const s = window.__sol;
    const v = g.player.pos.clone().set(s.pos.x, 1.0, s.pos.z).project(g.upCam);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  });
  await p.mouse.move(scr.x, scr.y);
  await p.waitForTimeout(300);
  const hit = await p.evaluate(async home => {
    const g = window.__game;
    const s = window.__sol;
    for (let i = 0; i < 10 && s.state !== 'dead'; i++) {
      g.player.hp = 1e6;
      const hp0 = s.hp;
      s.lastSeen = undefined;
      g.melee().attack();
      // (read at once, before a frame has passed: what the hit itself left him)
      if (s.hp < hp0 && s.state !== 'dead') {
        const r = { hp0, hp: s.hp, lastSeen: s.lastSeen, real: g.upFire().real, pos: [s.pos.x, s.pos.z] };
        // and straight back from the parapet, before a frame has passed: he has to go by what he made of the shot
        g.tp(home[0], home[1]);
        return { ...r, seesBack: g.upFire().los(s.pos.x, s.pos.z) };
      }
      await new Promise(r => setTimeout(r, 300));
      if (s.state !== 'dead') s.hp = Math.max(s.hp, 100);
    }
    return { hp: s.hp, state: s.state };
  }, roof.home);
  console.log('   wounded from the roof', JSON.stringify(hit));
  check(!!hit.lastSeen, 'a soldier in the street is wounded from the rooftop');
  if (hit.lastSeen) {
    const d = Math.hypot(hit.lastSeen[0] - hit.real[0], hit.lastSeen[1] - hit.real[2]);
    check(
      Math.abs(hit.lastSeen[0]) < 20000 && d < 3,
      `he looks for the shooter on that roof (${hit.lastSeen.map(Math.round)}, ${d.toFixed(1)} m from where the player stands)`,
    );
    await p.waitForTimeout(6000);
    const later = await p.evaluate(() => {
      const s = window.__sol;
      return { pos: [s.pos.x, s.pos.z], lastSeen: s.lastSeen ?? null, target: s.target ?? null, state: s.state };
    });
    const moved = Math.hypot(later.pos[0] - hit.pos[0], later.pos[1] - hit.pos[1]);
    console.log('   6 s later', JSON.stringify(later));
    check(!hit.seesBack, 'back from the parapet, the shooter is out of his sight');
    check(
      moved < 40 && !!(later.lastSeen || later.target) && Math.abs((later.lastSeen || later.target)[0]) < 20000,
      `six seconds later he is still after a place in the city (where he last saw him, or searching round it; moved ${moved.toFixed(1)} m)`,
    );
  }
  await p.evaluate(async () => {
    const g = window.__game;
    for (let i = 0; i < 20 && g.upState().up; i++) {
      const v = g.upState();
      g.tp(v.land[0], v.land[1]);
      g.upToggle();
      await new Promise(r => setTimeout(r, 120));
    }
  });
}

// ---- 3. someone besides the player: a stand-in
const spot = await p.evaluate(() => {
  const g = window.__game;
  const c = g.start();
  // an open stretch of street with 16 m of road on one side, the player 55 m off (out of every soldier's sight)
  for (let r = 20; r < 300; r += 6)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = c[0] + Math.cos(a) * r,
        z = c[1] + Math.sin(a) * r;
      if (g.roadDist(x, z) > 1 || g.inBld(x, z)) continue;
      for (let j = 0; j < 16; j++) {
        const b = (j / 16) * Math.PI * 2;
        const ok = [4, 8, 12, 16].every(
          d =>
            g.roadDist(x + Math.cos(b) * d, z + Math.sin(b) * d) < 2.5 &&
            !g.inBld(x + Math.cos(b) * d, z + Math.sin(b) * d),
        );
        if (ok) return { p: [x, z], b };
      }
    }
  return null;
});
check(!!spot, 'an open stretch of street for the stand-in');
const hasStandIn = await p.evaluate(() => typeof window.__game.standIn === 'function');
check(hasStandIn, 'the game has the stand-in hook');
if (spot && hasStandIn) {
  const S = await p.evaluate(async ({ p: P, b }) => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    g.setMin(11 * 60);
    g.player.hp = 1e6;
    // the player well out of the way
    let far = null;
    for (let k = 0; k < 24 && !far; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = P[0] + Math.cos(a) * 55,
        z = P[1] + Math.sin(a) * 55;
      if (!g.inBld(x, z) && g.roadDist(x, z) < 6) far = [x, z];
    }
    far ||= [P[0] + 55, P[1]];
    g.tp(far[0], far[1]);
    // every soldier but one stands down far away, so the one is the only one in this
    // (not the one wounded on the rooftop: he may still be falling back from that)
    const live = g.sols.filter(s => s.state !== 'dead');
    const s = live.find(q => q !== window.__sol) || live[0];
    for (const q of live.filter(q => q !== s)) {
      q.pos.set(P[0] + 400, 0, P[1] + 400);
      q.state = 'patrol';
      q.alert = 0;
      q.lastSeen = undefined;
    }
    const id = g.standIn(P[0], P[1]);
    const place = (q, d, dir) => {
      q.pos.set(P[0] + Math.cos(b) * d, 0, P[1] + Math.sin(b) * d);
      q.mesh.position.copy(q.pos);
      q.night = q.day = false;
      q.post = undefined;
      q.route = [
        [q.pos.x, q.pos.z],
        [q.pos.x, q.pos.z],
      ];
      q.wi = 0;
      q.hp = 100;
      q.dir = dir;
      // and nothing left over from what he was doing
      q.retreatT = 0;
      q.retreated = false;
      q.stun = 0;
      q.mHit = undefined;
      q.search = undefined;
      q.target = undefined;
      q.cov = null;
    };
    place(s, 12, b + Math.PI);
    s.state = 'patrol';
    s.alert = 0;
    s.lastSeen = undefined;
    const t0 = performance.now();
    let st = g.standIns()[0];
    while (performance.now() - t0 < 120000 && !(st.hits > 0)) {
      await wait(300);
      st = g.standIns()[0];
      if (s.state === 'dead') break;
    }
    const f = g.solFoes().find(q => q.id === s.id);
    return { id, sid: s.id, st, foe: f?.foe, state: f?.state, lastSeen: f?.lastSeen, t: performance.now() - t0 };
  }, spot);
  console.log('   stand-in', JSON.stringify(S));
  check(S.st.spotted > 0 && S.state === 'combat', 'a soldier spots the stand-in and goes into combat');
  check(S.foe === S.id, `he is after the stand-in (${S.foe})`);
  check(
    !!S.lastSeen && Math.hypot(S.lastSeen[0] - spot.p[0], S.lastSeen[1] - spot.p[1]) < 1,
    'and has its place as the last seen',
  );
  check(S.st.hits > 0 && S.st.by.includes(S.sid), `and fires on it and hits it (${S.st.hits} hits, hp ${S.st.hp})`);
  await p.screenshot({ path: shot('v2439-standin.png'), timeout: 120000 });

  // the nearer of two in sight: the player 6 m in front of him, the stand-in 12 m
  const near = await p.evaluate(async ({ p: P, b }) => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const s = g.sols.find(q => q.state !== 'dead' && Math.hypot(q.pos.x - P[0], q.pos.z - P[1]) < 30);
    if (!s) return null;
    g.player.hp = 1e6;
    g.player.sneak = false;
    s.pos.set(P[0] + Math.cos(b) * 12, 0, P[1] + Math.sin(b) * 12);
    s.state = 'patrol';
    s.alert = 0;
    s.lastSeen = undefined;
    s.dir = b + Math.PI;
    g.tp(P[0] + Math.cos(b) * 6, P[1] + Math.sin(b) * 6 + 0.01);
    const t0 = performance.now();
    let f;
    while (performance.now() - t0 < 60000) {
      await wait(300);
      g.player.hp = 1e6;
      f = g.solFoes().find(q => q.id === s.id);
      if (f?.state === 'combat' && f.foe) break;
    }
    return { foe: f?.foe, state: f?.state };
  }, spot);
  console.log('   nearer of two', JSON.stringify(near));
  check(near && near.foe === 'player', 'with the player nearer than the stand-in, he takes the player');

  // the rifle butt at arm's length, then nothing once it is down
  const butt = await p.evaluate(async ({ p: P, b }) => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const s = g.sols.find(q => q.state !== 'dead' && Math.hypot(q.pos.x - P[0], q.pos.z - P[1]) < 40);
    if (!s) return null;
    // the player back out of the way
    let far = null;
    for (let k = 0; k < 24 && !far; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = P[0] + Math.cos(a) * 55,
        z = P[1] + Math.sin(a) * 55;
      if (!g.inBld(x, z) && g.roadDist(x, z) < 6) far = [x, z];
    }
    g.tp(...(far || [P[0] + 55, P[1]]));
    const at = [P[0] + Math.cos(b) * 1.2, P[1] + Math.sin(b) * 1.2];
    s.state = 'combat';
    s.alert = 1;
    s.cov = null;
    s.covT = 99;
    s.lastSeen = P.slice();
    const t0 = performance.now();
    let st = g.standIns()[0];
    const m0 = st.melee;
    while (performance.now() - t0 < 120000 && st.melee === m0 && st.alive) {
      s.pos.set(at[0], 0, at[1]);
      s.dir = b + Math.PI;
      s.cov = null;
      g.player.hp = 1e6;
      await wait(200);
      st = g.standIns()[0];
    }
    const melee = st.melee - m0;
    // and down: no round goes into it after that
    const t1 = performance.now();
    while (performance.now() - t1 < 180000 && st.alive) {
      await wait(300);
      st = g.standIns()[0];
    }
    const hits = st.hits;
    await wait(5000);
    st = g.standIns()[0];
    return { melee, alive: st.alive, hp: st.hp, hitsAtDown: hits, hitsLater: st.hits };
  }, spot);
  console.log('   rifle butt and down', JSON.stringify(butt));
  check(butt && butt.melee > 0, 'at arm’s length he strikes it with the rifle butt');
  check(butt && !butt.alive, 'the stand-in goes down');
  check(butt && butt.hitsLater === butt.hitsAtDown, 'and nothing is fired on it once it is down');

  // and the other way round: the player 12 m in front of him, a new stand-in 6 m. First the player alone at 12 m (the
  // stand-in that went down is still on the list, so he names whom he is after), to know the player is in sight there
  const far2 = await p.evaluate(async ({ p: P, b }) => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const s = g.sols.find(q => q.state !== 'dead' && Math.hypot(q.pos.x - P[0], q.pos.z - P[1]) < 40);
    if (!s) return null;
    const face = () => {
      s.pos.set(P[0] + Math.cos(b) * 12, 0, P[1] + Math.sin(b) * 12);
      s.mesh.position.copy(s.pos);
      // (on duty now and nothing to walk back to, as the soldier of the first case: one picked by distance may be off
      // shift by day, or a sentry)
      s.night = s.day = false;
      s.post = undefined;
      s.route = [
        [s.pos.x, s.pos.z],
        [s.pos.x, s.pos.z],
      ];
      s.wi = 0;
      s.state = 'patrol';
      s.alert = 0;
      s.lastSeen = undefined;
      s.foe = undefined;
      s.cov = null;
      s.dir = b + Math.PI;
    };
    g.player.hp = 1e6;
    g.player.sneak = false;
    g.tp(P[0], P[1] + 0.01);
    face();
    const look = async () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 60000) {
        await wait(100);
        g.player.hp = 1e6;
        const f = g.solFoes().find(q => q.id === s.id);
        if (f?.state === 'combat' && f.foe) return f.foe;
        if (!f) return 'dead';
      }
      return null;
    };
    const alone = await look();
    face();
    const id = g.standIn(P[0] + Math.cos(b) * 6, P[1] + Math.sin(b) * 6);
    const both = await look();
    return { alone, id, both };
  }, spot);
  console.log('   nearer of two, the other way', JSON.stringify(far2));
  check(far2 && far2.alone === 'player', 'the player alone 12 m in front of him: he takes the player');
  check(
    far2 && far2.both === far2.id,
    `with the stand-in nearer than the player, he takes the stand-in (${far2?.both})`,
  );
}

console.log('errors:', errs.length, JSON.stringify(errs.slice(0, 3)));
check(errs.length === 0, 'no page errors');
await Promise.race([b.close(), new Promise(r => setTimeout(r, 12000))]);
srv?.stop?.();
process.exit(failed.length ? 1 : 0);
