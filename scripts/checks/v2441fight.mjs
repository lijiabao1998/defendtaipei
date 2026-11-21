// v24.41 computer teammates in a fight (behind ?mates=1).
// - The soldiers see a teammate as they see the player (the same range, cover, sneaking), go after them and fire on
//   them; the teammate is hurt, bleeds, says so, and goes down at nothing left (and nobody fires on someone down).
// - A teammate fights back by the fire rule: hold fire (only one on them at arm's length), use judgement (one in a fight
//   with the team, or once the player or they have been shot at), fire at will. A gun from where they stand, anything
//   else to swing by closing in (from behind on one who has not seen them: a sneak attack).
// - A soldier a teammate hits goes after that teammate; one they down counts as theirs, not the player's. The same for
//   the ROC remnants and the JSDF: a soldier they hit looks for them, not for the player, and theirs are not the player's.
// - Blasts reach the teammates as they reach the player (shells, grenades, a crashing helicopter, the FPV and bombs).
// - A teammate with a bandage or a medical kit runs to one who is down and brings them back.
// argv: [url] (default: vite preview)
import { launch, preview, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4241);
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
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 600)));
await p.goto(url);
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

// an open stretch of street with 16 m of road on one side (as v2439base)
const spot = await p.evaluate(() => {
  const g = window.__game;
  const c = g.start();
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
check(!!spot, 'an open stretch of street');

/** one soldier, the rest stood down far away; the player 55 m off; the teammates as the case needs */
const stage = (P, b, o) =>
  p.evaluate(
    async ({ P, b, o }) => {
      const g = window.__game;
      g.setMin(11 * 60);
      g.player.hp = 1e6;
      let far = null;
      for (let k = 0; k < 24 && !far; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = P[0] + Math.cos(a) * 55,
          z = P[1] + Math.sin(a) * 55;
        if (!g.inBld(x, z) && g.roadDist(x, z) < 6) far = [x, z];
      }
      far ||= [P[0] + 55, P[1]];
      // (the teammates wait where they are put: not carried along with the player)
      g.mateSet(0, { mode: 1 });
      g.mateSet(1, { mode: 1 });
      g.tp(far[0], far[1]);
      await new Promise(r => setTimeout(r, 400));
      const live = g.sols.filter(s => s.state !== 'dead');
      const s = live[0];
      for (const q of live.slice(1)) {
        q.pos.set(P[0] + 400, 0, P[1] + 400);
        q.state = 'patrol';
        q.alert = 0;
        q.lastSeen = undefined;
        q.foe = undefined;
      }
      s.pos.set(P[0] + Math.cos(b) * o.d, 0, P[1] + Math.sin(b) * o.d);
      s.mesh.position.copy(s.pos);
      s.night = s.day = false;
      s.post = undefined;
      s.route = [
        [s.pos.x, s.pos.z],
        [s.pos.x, s.pos.z],
      ];
      s.wi = 0;
      s.hp = o.hp ?? 100;
      s.dir = o.facing ? b + Math.PI : b;
      Object.assign(s, {
        retreatT: 0,
        retreated: false,
        stun: 0,
        mHit: undefined,
        search: undefined,
        target: undefined,
        cov: null,
      });
      s.state = 'patrol';
      s.alert = 0;
      s.lastSeen = undefined;
      s.foe = undefined;
      window.__s = s;
      // the first teammate on the spot, the second well away
      g.mateTp(0, P[0], P[1]);
      g.mateTp(1, far[0] + 2, far[1]);
      g.mateSet(0, { hp: 100, bleed: false, rule: o.rule ?? 1, inv: o.inv ?? {} });
      return { sid: s.id, far };
    },
    { P, b, o },
  );

if (spot) {
  // ---- 1. on the soldiers' list; seen, gone after and fired on as the player is
  if (run(1)) {
    await stage(spot.p, spot.b, { d: 12, facing: true, rule: 0, inv: { water: 1 } });
    const A = await p.evaluate(async () => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const s = window.__s;
      const said = [];
      const mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => said.push(n.textContent || ''))));
      mo.observe(document.getElementById('log'), { childList: true });
      const t0 = performance.now();
      while (performance.now() - t0 < 90000 && !(g.mates()[0].hp < 100)) await wait(300);
      mo.disconnect();
      const f = g.solFoes().find(q => q.id === s.id);
      return { list: g.standIns().map(q => q.id), foe: f?.foe, state: f?.state, hp: g.mates()[0].hp, said };
    });
    console.log('   seen', JSON.stringify(A));
    check(A.list.join() === 'mate0,mate1', 'both teammates are on the soldiers’ list');
    check(A.state === 'combat' && A.foe === 'mate0', 'a soldier spots the teammate and goes after him');
    check(A.hp < 100, `and hits him (${Math.round(A.hp)})`);
    check(
      A.said.some(t => /阿財：「(被發現了|我中彈|我被打到)/.test(t)),
      'who says so',
    );
  }
}

if (spot) {
  // ---- 2. fighting back with a gun (use judgement: the soldier is on him); the soldier he hits goes after him,
  // and the one he downs is his
  if (run(2)) {
    await stage(spot.p, spot.b, { d: 12, facing: true, rule: 1, inv: { t91: 1, a556n: 60 }, hp: 150 });
    const B = await p.evaluate(async () => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const s = window.__s;
      const k0 = g.player.kills;
      const t0 = performance.now();
      let hitBy = null;
      while (performance.now() - t0 < 120000 && s.state !== 'dead') {
        await wait(200);
        g.mateSet(0, { hp: 100 });
        if (!hitBy && s.hp < 150 && s.state !== 'dead')
          hitBy = { foe: s.foe, lastSeen: s.lastSeen, mate: g.mates()[0].at };
      }
      const st = g.mateStats();
      return {
        dead: s.state === 'dead',
        kills: g.mates()[0].kills,
        pk: g.player.kills - k0,
        hitBy,
        shots: st.shots,
        hits: st.hits,
        equip: g.mates()[0].equip,
        left: g.mates()[0].inv.a556n,
      };
    });
    console.log('   gun', JSON.stringify(B));
    check(B.equip === 't91' && B.shots > 0, `he fires back with the rifle (${B.shots} shots)`);
    check(B.left < 60, 'and uses his rounds');
    check(
      !!B.hitBy &&
        B.hitBy.foe === 'mate0' &&
        Math.hypot(B.hitBy.lastSeen[0] - B.hitBy.mate[0], B.hitBy.lastSeen[1] - B.hitBy.mate[1]) < 1.5,
      'the soldier he hits goes after him (where he is)',
    );
    check(
      B.dead && B.kills === 1 && B.pk === 0,
      `the soldier he downs is his, not the player's (${B.kills} / ${B.pk})`,
    );
  }

  // ---- 3. hold fire: a soldier in a fight a few metres off is left alone
  if (run(3)) {
    await stage(spot.p, spot.b, { d: 9, facing: false, rule: 0, inv: { t91: 1, a556n: 60 } });
    const C = await p.evaluate(async () => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const s = window.__s;
      const shots0 = g.mateStats().shots;
      // in a fight, but with someone else (he is told the player is where he looks)
      s.state = 'combat';
      s.alert = 1;
      s.lastSeen = [s.pos.x + Math.cos(s.dir) * 20, s.pos.z + Math.sin(s.dir) * 20];
      await wait(5000);
      return { shots: g.mateStats().shots - shots0, hp: s.hp };
    });
    console.log('   hold fire', JSON.stringify(C));
    check(C.shots === 0 && C.hp === 100, 'told to hold fire, he does not open up on a soldier busy elsewhere');
  }

  // ---- 4. fire at will with something to swing: he closes in on one who has not seen him and strikes from behind
  if (run(4)) {
    await stage(spot.p, spot.b, { d: 5, facing: false, rule: 2, inv: { pipe: 1 }, hp: 90 });
    const D = await p.evaluate(async () => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const s = window.__s;
      const b0 = g.mateStats().blows;
      const t0 = performance.now();
      while (performance.now() - t0 < 30000 && s.state !== 'dead') await wait(200);
      return { dead: s.state === 'dead', blows: g.mateStats().blows - b0, kills: g.mates()[0].kills };
    });
    console.log('   melee', JSON.stringify(D));
    check(D.blows >= 1 && D.dead, `with the pipe, from behind: down in ${D.blows} blow(s)`);
  }

  // ---- 5. down: nobody fires on him; the nurse runs over with her bandages and brings him back
  if (run(5)) {
    await stage(spot.p, spot.b, { d: 40, facing: false, rule: 0, inv: {} });
    const E = await p.evaluate(async ({ p: P, b }) => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      // (the nurse 10 m up the open street)
      g.mateTp(1, P[0] + Math.cos(b) * 10, P[1] + Math.sin(b) * 10);
      g.mateSet(1, { mode: 0 });
      g.mateDown(0);
      const t0 = performance.now();
      while (performance.now() - t0 < 30000 && g.mates()[0].st === 1) await wait(200);
      return {
        st: g.mates()[0].st,
        hp: g.mates()[0].hp,
        by: g.mateStats().aided,
        list: g.standIns().find(q => q.id === 'mate0'),
      };
    }, spot);
    console.log('   aid', JSON.stringify(E));
    check(E.st === 0 && E.hp > 0 && E.by >= 1, 'the nurse runs over and brings him back');
  }

  // ---- 6. a shell landing beside him hurts him as it would the player
  if (run(6)) {
    const F = await p.evaluate(async P => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      g.mateUp(0);
      g.mateTp(0, P[0], P[1]);
      g.mateSet(0, { hp: 100, bleed: false });
      g.shellAt(P[0] + 3, P[1]);
      await wait(3000);
      return g.mates()[0];
    }, spot.p);
    console.log('   shell', JSON.stringify({ hp: F.hp, bleed: F.bleed, st: F.st }));
    check(F.hp < 100 && F.st !== 2, `a mortar round three metres off hurts him (${Math.round(F.hp)})`);
  }

  // ---- 7. the ROC remnants: a soldier they hit looks for them, and theirs are not the player's
  if (run(7)) {
    const R = await p.evaluate(async () => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const q = g.rem().squads.find(q => q.alive > 0);
      // the teammates wait well away; a soldier with nothing left over from before (no post to walk back to)
      g.mateSet(0, { mode: 1, rule: 0 });
      g.mateSet(1, { mode: 1, rule: 0 });
      g.tp(q.p[0] + 30, q.p[1] + 30);
      await wait(500);
      const s = g.sols.find(s => s.state !== 'dead' && !s.post && !s.tile) || g.sols.find(s => s.state !== 'dead');
      const k0 = g.player.kills;
      const shots0 = g.rem().stats.shots;
      // a spot out in front that the squad has a clear line to (over their sandbags, as they see it)
      let at = [q.p[0] + Math.cos(q.ang) * 15, q.p[1] + Math.sin(q.ang) * 15];
      look: for (const d of [12, 15, 10, 18, 14, 20, 8])
        for (const o of [0, 2, -2, 4, -4]) {
          const c = [
            q.p[0] + Math.cos(q.ang) * d - Math.sin(q.ang) * o,
            q.p[1] + Math.sin(q.ang) * d + Math.cos(q.ang) * o,
          ];
          if (!g.inBld(c[0], c[1]) && g.shotRay(q.p, c, 1.5, 1.4, 2.6) > 0.98) {
            at = c;
            break look;
          }
        }
      s.pos.set(at[0], 0, at[1]);
      Object.assign(s, {
        hp: 300,
        state: 'patrol',
        alert: 0,
        lastSeen: undefined,
        foe: undefined,
        post: undefined,
        route: [at, at],
        wi: 0,
        target: undefined,
        search: undefined,
        night: false,
        day: false,
      });
      // every frame: the moment he is hit, what he makes of it
      const first = await new Promise(res => {
        const t0 = performance.now();
        const f = () => {
          if (s.hp < 300) return res({ hp: s.hp, lastSeen: s.lastSeen ?? null, foe: s.foe ?? null });
          if (performance.now() - t0 > 40000) return res(null);
          requestAnimationFrame(f);
        };
        f();
      });
      const seen = first?.lastSeen ? Math.hypot(first.lastSeen[0] - q.p[0], first.lastSeen[1] - q.p[1]) : null;
      s.hp = 1;
      const t1 = performance.now();
      while (performance.now() - t1 < 40000 && s.state !== 'dead') await wait(100);
      const st = g.rem().stats;
      return {
        rs: { upd: st.updates, inRange: st.inRange, sighted: st.sighted },
        sp: [s.pos.x, s.pos.z],
        q: q.p,
        P: [g.player.pos.x, g.player.pos.z],
        vis: s.mesh.visible,
        first,
        seen,
        dead: s.state === 'dead',
        pk: g.player.kills - k0,
        shots: g.rem().stats.shots - shots0,
        id: s.id,
      };
    });
    console.log('   remnants', JSON.stringify(R));
    check(
      R.seen !== null && R.seen < 6,
      `a soldier the remnants hit looks for them (${R.seen?.toFixed(1)} m from their position)`,
    );
    check(R.dead && R.pk === 0, 'and one they down is not counted as the player’s');
  }
}
check(!errs.length, `no page errors (${errs.join(' | ')})`);
await p.screenshot({ path: shot('v2441-fight.png') });
await Promise.race([b.close(), new Promise(r => setTimeout(r, 12000))]);
srv?.stop();
console.log(failed.length ? `\n${failed.length} FAILED:\n- ${failed.join('\n- ')}` : '\nall passed');
process.exit(failed.length ? 1 : 0);
