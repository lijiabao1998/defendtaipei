// v24.26 pathfinding in narrow places. Two kinds of truth: a flood fill at 0.25 m with the game's own collision says what a body
// can really walk to, and the grid is compared with it; and real soldiers, on the real AI, walk from narrow places to places the
// flood reached, near the start and far from it. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4212);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const p = await b.newPage({ viewport: { width: 1000, height: 650 } });
p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
await p.goto(url);
await pickRole(p, { g: 'f', skipIntro: true });
await p.waitForTimeout(6000);

// shared helpers on the page
await p.evaluate(() => {
  const g = window.__game;
  const ok = (x, z) => g.walkLine(x, z, x + 0.001, z) === true;
  /** wall to wall, the narrowest way across */
  const width = (x, z) => {
    let m = 9;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      let d = 0;
      for (const sgn of [1, -1])
        for (let r = 0.25; r <= 4; r += 0.25) {
          if (ok(x + sgn * Math.cos(a) * r, z + sgn * Math.sin(a) * r)) d += 0.25;
          else break;
        }
      m = Math.min(m, d);
    }
    return m + 0.7;
  };
  const S = 0.25;
  /** everything a body can walk to from here */
  const flood = (x, z, R, cap) => {
    const N = Math.ceil(R / S);
    const key = (i, j) => (i + N) * 8192 + (j + N);
    const seen = new Set([key(0, 0)]);
    const q = [[0, 0]];
    let h = 0;
    while (h < q.length && q.length < cap) {
      const [i, j] = q[h++];
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = i + di,
          c = j + dj;
        if (Math.abs(a) > N || Math.abs(c) > N) continue;
        const k = key(a, c);
        if (seen.has(k)) continue;
        seen.add(k);
        if (ok(x + a * S, z + c * S)) q.push([a, c]);
      }
    }
    return q.map(([a, c]) => [x + a * S, z + c * S]);
  };
  let seed = 12345;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  window.__nv = { ok, width, flood, rnd };
});

if (!process.env.NAV_LIVE_ONLY) {
  // ---------- the window ----------
  const win = await p.evaluate(async () => {
    const g = window.__game;
    const N = g.nav;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const r0 = N.stats.rebuilds;
    const c = g.start();
    // (far to the east is where upstairs floors live: west and south instead)
    g.tp(c[0] - 420, c[1] + 320);
    for (let i = 0; i < 80 && (N.building || Math.hypot(N.cx - g.player.pos.x, N.cz - g.player.pos.z) > 45); i++)
      await wait(250);
    const P = g.player.pos;
    return {
      moved: N.stats.rebuilds - r0,
      on: N.idx(P.x, P.z) >= 0,
      dist: Math.hypot(N.cx - P.x, N.cz - P.z),
      worstStepMs: N.stats.worstStepMs,
      // a target off the grid is headed for, not run away from
      off: (() => {
        const a = [P.x, P.z],
          t = [P.x + 400, P.z + 30];
        const path = N.find(a, t);
        const end = path?.[path.length - 1];
        return end ? Math.hypot(end[0] - t[0], end[1] - t[1]) < Math.hypot(a[0] - t[0], a[1] - t[1]) : true;
      })(),
      none: N.find([P.x + 4000, P.z], [P.x + 4100, P.z]),
    };
  });
  console.log('  ', JSON.stringify(win));
  check(win.moved >= 1 && win.on, 'the grid follows the player');
  check(win.off, 'a target off the grid is headed for, not run away from');
  check(win.none === null, 'someone off the grid gets no path, not a wrong one');
  check(win.worstStepMs < 12, `moving it costs little per frame (${win.worstStepMs.toFixed(1)} ms at worst)`);
}
// ---------- the grid against the truth ----------
const compare = async (label, dx, dz, R) =>
  p.evaluate(
    async ([label, dx, dz, R]) => {
      const g = window.__game;
      const { ok, width, flood, rnd } = window.__nv;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const c = g.start();
      const cx = c[0] + dx,
        cz = c[1] + dz;
      g.tp(cx, cz);
      // the window has to get here, and the tiles have to come in
      for (let i = 0; i < 40; i++) {
        await wait(250);
        if (g.nav.idx(cx, cz) >= 0 && !g.nav.building && Math.hypot(g.nav.cx - cx, g.nav.cz - cz) < 45 && i > 16) break;
      }
      const t = { label, pairs: 0, none: 0, partial: 0, cross: 0, fine: 0, off: 0, seeds: 0, ms: 0, worst: 0, ex: [] };
      const seeds = [];
      for (let n = 0; n < 3000 && seeds.length < 6; n++) {
        const x = cx + (rnd() - 0.5) * 2 * R,
          z = cz + (rnd() - 0.5) * 2 * R;
        if (ok(x, z) && width(x, z) < 2.2) seeds.push([x, z]);
      }
      t.seeds = seeds.length;
      for (const [sx, sz] of seeds) {
        const reach = flood(sx, sz, 28, 26000);
        for (let n = 0; n < 40 && reach.length > 40; n++) {
          const [x, z] = reach[Math.floor(rnd() * reach.length)];
          if (Math.hypot(x - sx, z - sz) < 5) continue;
          t.pairs++;
          if (g.nav.idx(sx, sz) < 0 || g.nav.idx(x, z) < 0) {
            t.off++;
            continue;
          }
          const t0 = performance.now();
          const path = g.nav.find([sx, sz], [x, z], 200000);
          const ms = performance.now() - t0;
          t.ms += ms;
          t.worst = Math.max(t.worst, ms);
          const end = path?.[path.length - 1];
          if (!path) t.none++;
          else if (Math.hypot(end[0] - x, end[1] - z) > 1.2) {
            t.partial++;
            if (t.ex.length < 4)
              t.ex.push({
                from: [sx, sz].map(v => +v.toFixed(1)),
                to: [x, z].map(v => +v.toFixed(1)),
                got: end.map(v => +v.toFixed(1)),
                w: +width(sx, sz).toFixed(2),
              });
          } else {
            // a real body, with the real collision, sliding along whatever it meets
            const reached = g.navWalk(path);
            const bad = reached < path.length;
            if (bad && t.ex.length < 4)
              t.ex.push({ walk: path[reached].map(v => +v.toFixed(1)), n: path.length, reached });
            if (bad) t.cross++;
            else t.fine++;
          }
        }
        await wait(0);
      }
      t.ms = Math.round(t.ms);
      t.worst = Math.round(t.worst);
      return t;
    },
    [label, dx, dz, R],
  );
const report = t => {
  console.log('  ', JSON.stringify(t));
  const known = t.pairs - t.off;
  check(t.seeds > 0 && known > 40, `${t.label}: enough narrow places to judge by (${known} pairs from ${t.seeds})`);
  check(t.cross <= known * 0.02, `${t.label}: a body can walk the paths it is given (${t.cross} of ${known} not)`);
  check(
    t.none + t.partial <= known * 0.03,
    `${t.label}: it finds what is there to find (${t.none + t.partial} of ${known} missed)`,
  );
  check(t.off === 0, `${t.label}: everything is on the grid (${t.off} off it)`);
};
if (!process.env.NAV_LIVE_ONLY) {
  report(await compare('near the start', -30, -50, 45));
  report(await compare('120 m out', 120, 40, 40));
  report(await compare('300 m out', 300, 60, 40));
}

// ---------- real soldiers ----------
const live = (label, dx, dz, count) =>
  p.evaluate(
    async ([label, dx, dz, count]) => {
      const g = window.__game;
      const { ok, width, flood, rnd } = window.__nv;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const c = g.start();
      const cx = c[0] + dx,
        cz = c[1] + dz;
      g.tp(cx, cz);
      for (let i = 0; i < 40; i++) {
        await wait(250);
        if (!g.nav.building && Math.hypot(g.nav.cx - cx, g.nav.cz - cz) < 45 && i > 16) break;
      }
      const pairs = [];
      for (let n = 0; n < 3000 && pairs.length < count; n++) {
        const x = cx + (rnd() - 0.5) * 60,
          z = cz + (rnd() - 0.5) * 60;
        if (!ok(x, z) || width(x, z) > 2.2) continue;
        const far = flood(x, z, 30, 16000).filter(q => {
          const d = Math.hypot(q[0] - x, q[1] - z);
          return d > 10 && d < 28;
        });
        if (far.length) pairs.push({ a: [x, z], b: far[Math.floor(rnd() * far.length)] });
        await wait(0);
      }
      // the core's soldiers: they stay when tiles come and go
      const use = g.sols.filter(s => s.state !== 'dead' && !s.tile).slice(0, pairs.length);
      pairs.length = Math.min(pairs.length, use.length);
      // nobody else around here. Not killed: a district with nobody left in it is reclaimed, and the party stops the game.
      // Off duty both by day and by night, which is never on duty at all.
      for (const s of g.sols) if (!use.includes(s)) s.night = s.day = true;
      const n0 = { ...g.navStat };
      const nst = () => g.navStat ?? { rethink: 0, detours: 0, giveUps: 0 };
      const T = pairs.map((q, i) => {
        const s = use[i];
        s.pos.set(q.a[0], 0, q.a[1]);
        s.mesh.position.copy(s.pos);
        s.post = null;
        s.state = 'investigate';
        s.target = q.b;
        s.search = null;
        s.timer = 1e6;
        s.alert = 0;
        s.path = undefined;
        s.prog = undefined;
        s.detour = undefined;
        s.holdT = 0;
        s.night = s.day = false;
        return {
          s,
          q,
          done: 0,
          last: [q.a[0], q.a[1]],
          lastT: 0,
          worstStand: 0,
          d0: Math.hypot(q.a[0] - q.b[0], q.a[1] - q.b[1]),
        };
      });
      // just off to one side of all of it: near enough for everyone to stay awake (they sleep beyond 120 m) and on the grid, and
      // asleep, so that nobody notices and turns on the player instead of going where they are told
      g.tp(cx + 62, cz);
      const t0 = performance.now();
      const frames = [];
      let lastF = performance.now(),
        run = true;
      const tick = t => {
        frames.push(t - lastF);
        lastF = t;
        if (run) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      while (performance.now() - t0 < 60000 && T.some(t => !t.done)) {
        await wait(250);
        const now = (performance.now() - t0) / 1000;
        // an armoured car or a patrol may well find the player meanwhile, and a dead player stops the game
        g.player.hp = 100;
        g.player.bleed = false;
        g.player.sleeping = true;
        for (const t of T) {
          if (t.done) continue;
          // the check gives the orders: nobody turns on the player or heads off on a radio call
          t.s.state = 'investigate';
          t.s.target = t.q.b;
          t.s.search = null;
          t.s.timer = 1e6;
          t.s.alert = 0;
          const P = t.s.pos;
          if (Math.hypot(P.x - t.q.b[0], P.z - t.q.b[1]) < 1.6) {
            t.done = now;
            continue;
          }
          if (Math.hypot(P.x - t.last[0], P.z - t.last[1]) > 0.8) {
            t.last = [P.x, P.z];
            t.lastT = now;
          } else t.worstStand = Math.max(t.worstStand, now - t.lastT);
        }
      }
      run = false;
      g.player.sleeping = false;
      const top = [...document.querySelectorAll('#panel, .modal, #modal')]
        .filter(e => getComputedStyle(e).display !== 'none')
        .map(e => e.textContent.slice(0, 80));
      const sorted = frames.slice(5).sort((a, b) => a - b);
      const q = f => Math.round(sorted[Math.floor(sorted.length * f)] || 0);
      return {
        label,
        rows: T.map(t => ({
          d0: +t.d0.toFixed(1),
          done: +t.done.toFixed(1),
          stand: +t.worstStand.toFixed(1),
          left: +Math.hypot(t.s.pos.x - t.q.b[0], t.s.pos.z - t.q.b[1]).toFixed(1),
          a: t.q.a.map(v => +v.toFixed(1)),
          b: t.q.b.map(v => +v.toFixed(1)),
          at: [+t.s.pos.x.toFixed(1), +t.s.pos.z.toFixed(1)],
        })),
        nav: {
          rethink: nst().rethink - (n0.rethink ?? 0),
          detours: nst().detours - (n0.detours ?? 0),
          giveUps: nst().giveUps - (n0.giveUps ?? 0),
        },
        frames: { p50: q(0.5), p95: q(0.95), p99: q(0.99) },
        top,
        stats: { ...g.nav.stats },
      };
    },
    [label, dx, dz, count],
  );
let shotN = 0;
const liveReport = r => {
  const n = r.rows.length,
    got = r.rows.filter(t => t.done).length;
  console.log(
    `   ${r.label}: ${got}/${n}`,
    JSON.stringify(r.nav),
    JSON.stringify(r.frames),
    JSON.stringify(r.stats),
    r.top.length ? 'on top: ' + r.top.join(' / ') : '',
  );
  for (const t of r.rows) if (!t.done) console.log('     not there', JSON.stringify(t));
  const stood = Math.max(0, ...r.rows.map(t => t.stand));
  return { n, got, stood };
};
let totN = 0,
  totGot = 0,
  worstStand = 0;
for (const [label, dx, dz] of [
  ['near the start', -30, -50],
  ['120 m out', 120, 40],
  ['300 m out', 300, 60],
]) {
  const r = liveReport(await live(label, dx, dz, 14));
  await p.screenshot({ path: shot(`v2426-stage${shotN++}.png`), timeout: 60000 });
  console.log('   log:', await p.evaluate(() => (document.getElementById('log')?.innerText || '').slice(0, 300)));
  check(r.n >= 8, `${label}: enough soldiers tried (${r.n})`);
  totN += r.n;
  totGot += r.got;
  worstStand = Math.max(worstStand, r.stood);
}
console.log(`   in all ${totGot}/${totN}, longest anyone stood still: ${worstStand.toFixed(1)} s`);
check(totGot >= totN * 0.95, `soldiers get where they are going (${totGot}/${totN})`);
check(worstStand <= 6.5, `nobody stands stuck for long (${worstStand.toFixed(1)} s)`);

console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
