// v24.42 computer teammates in the rest of the world, and for everyone (no ?mates=1 needed).
// - The new-game screen offers them without any URL parameter (?mates=0 leaves the picker out).
// - The recon drone reports a teammate in the open as it would the player; a helicopter spots, circles and fires on
//   one. (The snipers and the armour have no section here.)
// - Someone down keeps the time at normal speed.
// - The evacuation takes whoever is with the player, and says who stayed.
// argv: [url] (default: vite preview)
import { launch, preview, gameUrl, shot } from '../lib.mjs';
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
await Promise.race([b.close(), new Promise(r => setTimeout(r, 12000))]);
srv?.stop();
console.log(failed.length ? `\n${failed.length} FAILED:\n- ${failed.join('\n- ')}` : '\nall passed');
process.exit(failed.length ? 1 : 0);
