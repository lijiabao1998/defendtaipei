// v24.42 computer teammates in the rest of the world, and for everyone (no ?mates=1 needed).
// - The new-game screen offers them without any URL parameter (?mates=0 leaves the picker out).
// - The recon drone reports a teammate in the open as it would the player; a helicopter spots, circles and fires on
//   one. (The snipers and the armour have no section here.)
// - Someone down keeps the time at normal speed.
// - The evacuation takes whoever is with the player, and says who stayed.
// The review before going live (sections 6–9):
// - 6. One downed in a crash lies beside the car and is drawn there (not where they got in); one bleeding out in a
//   helicopter in the air hangs on until it lands, then is lifted out beside it.
// - 7. One waiting on streets that are not loaded is not seen from the sky; called (T), they come back to the player.
// - 8. T calls those left behind (it does not tell them to wait).
// - 9. On 360 and 320 px phones the 男/女 buttons stay inside each companion's card.
// argv: [url] (default: vite preview)
import { launch, preview, gameUrl, shot, devices } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4242);
const base = gameUrl(process.argv[2] || srv?.url).replace(/\?.*$/, '');
const b = await launch();
const failed = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const run = n => !ONLY.length || ONLY.includes(String(n));

// ---- 1. the picker is there without any URL parameter, and ?mates=0 leaves it out
if (run(1)) {
  const res = [];
  for (const u of [base, base + '?mates=0']) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await p.goto(u);
    await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
    res.push(
      await p.evaluate(() => {
        window.__newGame();
        document.getElementById('startgo').click();
        return document.querySelectorAll('#matesel .mc').length;
      }),
    );
    await p.close();
  }
  console.log('   picker', JSON.stringify(res));
  check(res[0] === 6, 'the new-game screen offers the companions without ?mates=1');
  check(res[1] === 0, 'and ?mates=0 leaves them out');
}

if ([2, 3, 4, 5].some(run)) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 600)));
  await p.goto(base);
  await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
  await p.evaluate(() => {
    window.__newGame();
    window.__game.go(false, 'm', 'office', true, [
      { r: 'tech', g: 'm' },
      { r: 'nurse', g: 'f' },
    ]);
  });
  await p.waitForFunction(() => window.__game?.started() && !document.getElementById('entry-loading'), null, {
    timeout: 240000,
  });
  await p.waitForTimeout(2000);
  // an open spot in the street, the player indoors at home (out of the sky's sight)
  const open = await p.evaluate(() => {
    const g = window.__game;
    const c = g.start();
    for (let r = 20; r < 300; r += 6)
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = c[0] + Math.cos(a) * r,
          z = c[1] + Math.sin(a) * r;
        if (g.roadDist(x, z) > 1 || g.inBld(x, z)) continue;
        if ([0, 1, 2, 3].every(j => !g.inBld(x + [2.5, -2.5, 0, 0][j], z + [0, 0, 2.5, -2.5][j]))) return [x, z];
      }
    return null;
  });
  check(!!open, 'an open spot in the street');
  const say = () =>
    p.evaluate(() => {
      window.__said = [];
      const mo = new MutationObserver(ms =>
        ms.forEach(m => m.addedNodes.forEach(n => window.__said.push(n.textContent || ''))),
      );
      mo.observe(document.getElementById('log'), { childList: true });
    });
  await say();

  // ---- 2. the recon drone reports a teammate in the open
  if (run(2) && open) {
    const D = await p.evaluate(async P => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      g.player.hp = 1e6;
      g.mateSet(0, { mode: 1, rule: 0 });
      g.mateSet(1, { mode: 1, rule: 0 });
      g.mateTp(0, P[0], P[1]);
      g.mateTp(1, P[0] + 1.5, P[1]);
      const R = g.recon();
      if (!R?.list?.length) return { none: true };
      const d = R.list[0];
      d.c = [P[0], P[1]];
      d.r = 3;
      d.cd = 0;
      d.spot = 0;
      for (const q of R.list.slice(1)) q.c = [P[0] + 900, P[1] + 900];
      const t0 = performance.now();
      while (performance.now() - t0 < 20000 && !window.__said.some(t => /無人機發現你的隊友/.test(t))) await wait(200);
      return { said: window.__said.filter(t => /無人機/.test(t)) };
    }, open);
    console.log('   drone', JSON.stringify(D));
    check(!D.none && D.said.some(t => /無人機發現你的隊友/.test(t)), 'the recon drone reports a teammate in the open');
  }

  // ---- 3. a helicopter spots, circles and fires on a teammate in the open
  if (run(3) && open) {
    const H = await p.evaluate(async P => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const recon = g.recon();
      for (const q of recon?.list ?? []) q.c = [P[0] + 900, P[1] + 900];
      g.setMin(11 * 60);
      const H = g.heli();
      if (!H) return { none: true };
      if (!H.list.length) H.spawn('z20');
      const c = H.list[0];
      for (const q of H.list.slice(1)) q.g.position.set(P[0] + 2000, 40, P[1] + 2000);
      c.g.position.set(P[0] + 10, 30, P[1]);
      c.state = 'patrol';
      c.spot = 0;
      g.mateSet(0, { hp: 100 });
      const t0 = performance.now();
      let hp = 100;
      while (performance.now() - t0 < 40000) {
        await wait(250);
        g.mateSet(1, { hp: 100 });
        hp = Math.min(hp, g.mates()[0].hp);
        if (c.state === 'hunt' && hp < 100) break;
        if (c.state === 'patrol') c.g.position.set(P[0] + 10, c.g.position.y, P[1]);
      }
      return { state: c.state, tgt: c.tgt, hp, said: window.__said.filter(t => /發現/.test(t)) };
    }, open);
    console.log('   helicopter', JSON.stringify(H));
    check(!H.none && H.state === 'hunt' && /^mate/.test(H.tgt || ''), 'a helicopter spots a teammate and hunts him');
    check(H.hp < 100, `and its gun hits him (${Math.round(H.hp)})`);
  }

  // ---- 4. someone down: no sleep, no fast-forward
  if (run(4)) {
    const S = await p.evaluate(() => {
      const g = window.__game;
      // (first with nobody down, so that it is the one down who keeps it at normal speed, not a soldier nearby)
      g.setSpeed(20);
      const free = g.speed();
      g.setSpeed(1);
      g.mateDown(1);
      g.setSpeed(20);
      const sp = g.speed();
      g.mateUp(1);
      g.setSpeed(1);
      return { free, sp };
    });
    console.log('   down', JSON.stringify(S));
    check(S.free === 20 && S.sp === 1, `with someone down, time stays at normal speed (${S.free} → ${S.sp})`);
  }

  // ---- 5. the evacuation takes whoever is with the player
  if (run(5)) {
    const E = await p.evaluate(async () => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const P = [g.player.pos.x, g.player.pos.z];
      g.mateUp(0);
      g.mateTp(0, P[0] + 1, P[1]);
      g.mateTp(1, P[0] + 60, P[1]);
      g.evacNow?.('boat');
      for (let i = 0; i < 120 && !document.getElementById('evacend'); i++) await wait(500);
      return document.getElementById('evacend')?.textContent || '';
    });
    console.log('   evacuation', JSON.stringify(E.slice(0, 300)));
    check(
      /同行的人/.test(E) && /阿財/.test(E) && /留在萬華：小雯/.test(E),
      'the evacuation takes him along and says she stayed',
    );
  }
  check(!errs.length, `no page errors (${errs.join(' | ')})`);
  await p.screenshot({ path: shot('v2442-world.png') });
  await p.close();
}

// ---- 6–8 the review before going live, on a new game of their own
if ([6, 7, 8].some(run)) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 600)));
  await p.goto(base);
  await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
  await p.evaluate(() => {
    window.__newGame();
    window.__game.go(false, 'm', 'office', true, [
      { r: 'tech', g: 'm' },
      { r: 'nurse', g: 'f' },
    ]);
  });
  await p.waitForFunction(() => window.__game?.started() && !document.getElementById('entry-loading'), null, {
    timeout: 240000,
  });
  await p.waitForTimeout(2000);
  // room for a helicopter in the street (nothing built within 8 m)
  const lot = await p.evaluate(() => {
    const g = window.__game;
    g.player.hp = 1e6;
    const c = g.start();
    for (let r = 20; r < 400; r += 6)
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = c[0] + Math.cos(a) * r,
          z = c[1] + Math.sin(a) * r;
        if (g.roadDist(x, z) > 1 || g.inBld(x, z)) continue;
        if ([0, 1, 2, 3, 4, 5, 6, 7].every(j => !g.inBld(x + Math.cos(j * 0.785) * 8, z + Math.sin(j * 0.785) * 8)))
          return [x, z];
      }
    return null;
  });
  check(!!lot, 'a clear spot in the street');
  const said = () =>
    p.evaluate(() => {
      window.__said = [];
      new MutationObserver(ms =>
        ms.forEach(m => m.addedNodes.forEach(n => window.__said.push(n.textContent || ''))),
      ).observe(document.getElementById('log'), { childList: true });
    });
  await said();

  // ---- 6. downed riding: beside the vehicle, and drawn there; in the air they hang on until it lands
  if (run(6) && lot) {
    const R = await p.evaluate(async P => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const key = code => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      };
      const near = () =>
        g.mates().map(m => ({
          st: m.st,
          space: m.space,
          hp: Math.round(m.hp),
          dP: +Math.hypot(m.p[0] - g.player.pos.x, m.p[1] - g.player.pos.z).toFixed(1),
          drawnOff: +Math.hypot(m.rp[0] - m.p[0], m.rp[1] - m.p[1]).toFixed(1),
          visible: m.visible,
        }));
      // (the game is stepped where time matters: a busy machine draws fewer frames, not less of the game)
      g.mateSet(0, { mode: 0, rule: 0 });
      g.mateSet(1, { mode: 0, rule: 0 });
      g.tp(P[0], P[1]);
      await wait(1000);
      g.mateTp(0, P[0] + 1, P[1] + 1);
      g.mateTp(1, P[0] - 1, P[1] + 1);
      g.sim(10);
      // a car 40 m from where they got in, and a crash that takes them down (not the player: their hp is capped at 100)
      const car = g.drive.spawn('sedan', P[0] + 2.5, P[1], 0, Math.random, {
        key: true,
        fuel: 20,
        tyre: 1,
        eng: 1,
        bat: 1,
      });
      g.tp(car.pos.x - 1.4, car.pos.z);
      g.sim(10);
      key('KeyE');
      g.sim(10);
      const rode = g.mates().map(m => m.space);
      car.pos.x += 40;
      g.sim(20);
      g.player.hp = 100;
      g.mateSet(0, { hp: 20 });
      g.mateSet(1, { hp: 20 });
      g.drive.d.hurt(30);
      g.sim(10);
      const crash = near();
      const alive = g.player.hp > 0;
      key('KeyE');
      g.sim(20);
      g.mateUp(0);
      g.mateUp(1);
      g.player.hp = 100;
      // a helicopter: in, up to 24 m, one bleeds out on board (her pack emptied: she cannot treat herself)
      const h = g.drive.spawn('uh60', P[0], P[1], 0, Math.random, { key: true, fuel: 600, tyre: 1, eng: 1, bat: 1 });
      g.tp(h.pos.x, h.pos.z);
      g.sim(5);
      g.mateTp(0, h.pos.x + 1, h.pos.z + 1);
      g.mateTp(1, h.pos.x - 1, h.pos.z + 1);
      g.sim(10);
      key('KeyE');
      g.sim(10);
      const flew = { cur: g.drive.cur?.s?.air === true, m: g.mates().map(m => m.space) };
      h.alt = 24;
      g.sim(10);
      g.mateSet(1, { hp: 0.5, bleed: true, inv: {} });
      g.sim(60); // (three seconds of the game, bleeding 0.6 a second)
      const air = { alt: Math.round(h.alt ?? 0), m: near() };
      // down on the ground: lifted out beside it
      h.landing = true;
      h.alt = 0;
      g.sim(80); // (held at 1 hp in the air: under two seconds to bleed out once landed)
      const landed = near();
      const why = window.__said.filter(t => /倒下/.test(t));
      return { rode, crash, alive, flew, air, landed, why };
    }, lot);
    console.log('   riding', JSON.stringify(R));
    check(
      R.rode.every(s => s === 'car'),
      'both ride in the car',
    );
    check(
      R.alive && R.crash.every(m => m.st === 1 && m.space === 'street' && m.dP < 5 && m.drawnOff < 0.5 && m.visible),
      'downed in a crash 40 m on, they lie beside the car and are drawn there',
    );
    check(R.flew.cur && R.flew.m.every(s => s === 'car'), 'both fly in the helicopter');
    check(
      R.air.alt > 10 && R.air.m[1].st === 0 && R.air.m[1].space === 'car',
      `bleeding out 24 m up, she hangs on (${JSON.stringify(R.air.m[1])})`,
    );
    check(
      R.landed[1].st === 1 && R.landed[1].space === 'street' && R.landed[1].dP < 6 && R.landed[1].drawnOff < 0.5,
      `landed, she is lifted out beside it, down (${JSON.stringify(R.landed[1])})`,
    );
  }

  // ---- 7. waiting on streets that are not loaded: not seen from the sky; called, they come back
  if (run(7) && lot) {
    const W = await p.evaluate(async P => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      if (g.drive.cur) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
        await wait(1500);
      }
      g.mateUp(0);
      g.mateUp(1);
      g.tp(P[0], P[1]);
      await wait(1000);
      // somewhere on the map whose streets are not loaded
      let far = null;
      for (let r = 900; r < 4000 && !far; r += 150)
        for (let k = 0; k < 16 && !far; k++) {
          const a = (k / 16) * Math.PI * 2;
          const x = P[0] + Math.cos(a) * r,
            z = P[1] + Math.sin(a) * r;
          if (!g.mateGround(x, z)) far = [x, z];
        }
      if (!far) return { none: true };
      g.mateSet(0, { mode: 1 });
      g.mateSet(1, { mode: 1 });
      g.mateTp(0, far[0], far[1]);
      g.mateTp(1, P[0] + 2, P[1]);
      g.sim(10);
      const ids = g.mates().map(m => m.id);
      const out = g.matesOut();
      const tp0 = g.mateStats().teleports;
      g.mateKey();
      g.sim(10);
      const m0 = g.mates()[0];
      return {
        far: far.map(Math.round),
        ids,
        out,
        modes: g.mates().map(m => m.mode),
        dP: +Math.hypot(m0.p[0] - g.player.pos.x, m0.p[1] - g.player.pos.z).toFixed(1),
        tps: g.mateStats().teleports - tp0,
      };
    }, lot);
    console.log('   unloaded', JSON.stringify(W));
    check(!W.none, 'a spot on the map that is not loaded');
    if (!W.none) {
      check(
        !W.out.includes(W.ids[0]) && W.out.includes(W.ids[1]),
        'the one on streets not loaded is not out in the open',
      );
      check(W.modes.every(m => m === 0) && W.dP < 15 && W.tps >= 1, `called, he comes back to the player (${W.dP} m)`);
    }
  }

  // ---- 8. T calls those left behind
  if (run(8)) {
    const T = await p.evaluate(async () => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      g.mateUp(0);
      g.mateUp(1);
      g.mateSet(0, { mode: 0, left: true });
      g.mateSet(1, { mode: 0, left: true });
      window.__said = [];
      g.mateKey();
      await wait(300);
      const called = g.mates().map(m => [m.mode, m.left]);
      const said = window.__said.filter(t => /跟上了|在這裡等你/.test(t));
      g.mateKey();
      await wait(300);
      const then = g.mates().map(m => m.mode);
      return { called, then, said };
    });
    console.log('   T', JSON.stringify(T));
    check(
      T.called.every(([m, l]) => m === 0 && !l) && T.said.length === 1 && /跟上了/.test(T.said[0]),
      'T calls those left behind (“跟上了”)',
    );
    check(
      T.then.every(m => m === 1),
      'and the next T tells them to wait',
    );
  }
  check(!errs.length, `no page errors (${errs.join(' | ')})`);
  await p.screenshot({ path: shot('v2442-review.png') });
  await p.close();
}

// ---- 9. narrow phones: the 男/女 buttons stay inside each card
if (run(9)) {
  const res = [];
  for (const width of [360, 320]) {
    const ctx = await b.newContext({ ...devices['Pixel 7'], viewport: { width, height: 740 } });
    const p = await ctx.newPage();
    await p.goto(base);
    await p.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
    res.push(
      await p.evaluate(w => {
        window.__newGame();
        document.getElementById('startgo').click();
        const cards = [...document.querySelectorAll('#matesel .mc')];
        let worst = -1e9;
        for (const c of cards) {
          const cr = c.getBoundingClientRect();
          for (const bt of c.querySelectorAll('.mg button')) {
            const r = bt.getBoundingClientRect();
            worst = Math.max(worst, r.right - cr.right, cr.left - r.left);
          }
        }
        return { w, n: cards.length, worst: +worst.toFixed(1), page: document.documentElement.scrollWidth };
      }, width),
    );
    await ctx.close();
  }
  console.log('   narrow', JSON.stringify(res));
  check(
    res.every(r => r.n === 6 && r.worst <= 0.5),
    `on 360 and 320 px phones the 男/女 buttons stay inside the cards (${res.map(r => r.worst).join(', ')})`,
  );
}
await Promise.race([b.close(), new Promise(r => setTimeout(r, 12000))]);
srv?.stop();
console.log(failed.length ? `\n${failed.length} FAILED:\n- ${failed.join('\n- ')}` : '\nall passed');
process.exit(failed.length ? 1 : 0);
