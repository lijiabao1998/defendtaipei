// v24.31 snipers stand on real floors: on the real roof or at a window of the top floor. The player reaches them by the
// real stairs (they are not left hanging in the air while the player is on another floor of their building), settles it
// hand to hand, and can use the scope from up there on the real world: a soldier in the street is hit from a rooftop.
// And the light indoors: dimmer than the street by day, tubes at night. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4218);
const url = gameUrl(process.argv[2] || srv?.url).replace(/\?.*$/, '');
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => errs.push(String(e.stack || e).slice(0, 700)));
await p.goto(url);
await pickRole(p, { g: 'f', skipIntro: true, entryTimeout: 240000 });
await p.waitForTimeout(25000);

const list = await p.evaluate(() => window.__game.snp());
for (const s of list)
  console.log('  ', s.id, s.kind, 'at', s.y.toFixed(1), 'm, top floor', s.top, s.foot ? 'stairs' : 'no stairs');
const withStairs = list.filter(s => s.foot);
check(list.length >= 2, `snipers posted (${list.length})`);
check(withStairs.length >= 2, `in buildings with stairs to climb (${withStairs.length})`);
check(
  list.some(s => s.kind === 'window') && list.some(s => s.kind === 'roof'),
  'some on the roof, some at a window of the top floor',
);
check(
  list.filter(s => s.kind === 'window').every(s => s.y < s.top * 3.2 + 1 && s.y > 5),
  'the window posts are at the height of the top floor',
);

// by the stairs to each, then hand to hand
const fights = [];
for (const s of withStairs) {
  const r = await p.evaluate(async id => {
    const g = window.__game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const me = () => g.snp().find(q => q.id === id);
    const s = me();
    g.player.hp = 100;
    for (const q of g.sols) q.night = q.day = true;
    g.setMin(2 * 60); // at night he does not shoot: time to climb
    g.tp(s.foot[0], s.foot[1]);
    await wait(800);
    const want = s.kind === 'window' ? s.top : s.top + 1;
    let hung = 0;
    for (let f = 2; f <= want; f++) {
      const u0 = g.upState();
      if (u0.up) {
        if (!u0.upFoot) break;
        g.tp(u0.upFoot[0], u0.upFoot[1]);
      }
      if (!g.upToggle()) break;
      await wait(500);
      if (g.upState().f < want && me().shown) hung++;
    }
    await wait(600);
    const there = { at: g.upState().f, want, level: me().level, shown: me().shown, hung };
    const U = g.upState().off;
    g.tp(s.p[0] + U[0] + 0.5, s.p[1] + U[1] + 0.5);
    await wait(300);
    g.addItem('pipe', 1);
    g.useItem('pipe');
    await wait(200);
    for (let i = 0; i < 6 && !me().dead; i++) {
      g.melee().attack();
      await wait(900);
    }
    const dead = me().dead;
    for (let i = 0; i < 20 && g.upState().up; i++) {
      const u = g.upState();
      g.tp(u.land[0], u.land[1]);
      g.upToggle();
      await wait(120);
    }
    return { ...there, dead, down: !g.upState().up, kind: s.kind };
  }, s.id);
  console.log('  ', s.id, JSON.stringify(r));
  fights.push(r);
}
check(
  fights.every(r => r.at === r.want && r.level && r.shown),
  'the stairs lead to each of them, and he is there',
);
check(
  fights.every(r => r.hung === 0),
  'on the way up he is not drawn hanging over the cut-away floors',
);
check(
  fights.every(r => r.dead),
  `each is settled hand to hand (${fights.filter(r => r.dead).length}/${fights.length})`,
);
check(
  fights.every(r => r.down),
  'and the way down still works',
);

// the scope from a rooftop: a soldier put in the street below is hit
const sc = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  g.setMin(11 * 60);
  g.player.hp = 100;
  const c = g.start();
  const s = g
    .stairs()
    .map(s => ({ ...s, dist: Math.hypot(s.c[0] - c[0], s.c[1] - c[1]) }))
    .sort((a, b) => a.dist - b.dist)
    .find(s => s.d === 'core' && s.top >= 3);
  g.tp(s.foot[0], s.foot[1]);
  await wait(800);
  for (let i = 0; i < 12 && !g.upState().roof; i++) {
    const u = g.upState();
    if (u.up && !u.upFoot) break;
    if (u.up) g.tp(u.upFoot[0], u.upFoot[1]);
    g.upToggle();
    await wait(500);
  }
  const u = g.upState();
  if (!u.roof) return { roof: false };
  // where the player really is, and a soldier in a street below with nothing in the line of the shot: a round
  // dropping from the roof clears what stands near it, so only the low end of its path must be over open ground
  const rx = g.player.pos.x - u.off[0],
    rz = g.player.pos.z - u.off[1];
  const eye0 = u.fy + 1.55;
  let tx = 0,
    tz = 0,
    found = false;
  find: for (const d of [26, 32, 38, 44, 20])
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const x = rx + Math.sin(a) * d,
        z = rz + Math.cos(a) * d;
      if (g.roadDist(x, z) > 1.5 || g.inBld(x, z)) continue;
      let clear = true;
      for (let t = 0.05; t < 1 && clear; t += 0.02) {
        const y = eye0 + (1.0 - eye0) * t;
        if (y < u.fy + 0.5 && g.inBld(rx + (x - rx) * t, rz + (z - rz) * t)) clear = false;
      }
      if (clear) {
        tx = x;
        tz = z;
        found = true;
        break find;
      }
    }
  if (!found) return { roof: true, on: false, noTarget: true };
  const sol = g.sols.find(q => q.state !== 'dead');
  const dist = Math.hypot(tx - rx, tz - rz);
  sol.pos.set(tx, 0, tz);
  sol.night = sol.day = false;
  sol.state = 'patrol';
  sol.route = [
    [tx, tz],
    [tx, tz],
  ];
  sol.wi = 0;
  const hp0 = sol.hp;
  g.addItem('t93', 1);
  g.addItem('a762n', 10);
  g.useItem('t93');
  await wait(300);
  await wait(700);
  // wherever he has got to by now
  const ax = sol.pos.x,
    az = sol.pos.z,
    ad = Math.hypot(ax - rx, az - rz);
  const eye = u.fy + 1.55;
  const on = g.scopeOn(Math.atan2(ax - rx, az - rz), Math.atan2(1.0 - eye, ad));
  g.scopeFire();
  await wait(300);
  const out = { roof: true, on, fy: u.fy, dist, hp0, hp: sol.hp, state: sol.state };
  g.scopeOff();
  return out;
});
console.log('   scope', JSON.stringify(sc));
check(sc.roof && sc.on, 'the scope opens on a rooftop');
check(
  sc.roof && (sc.hp < sc.hp0 || sc.state === 'dead'),
  `a soldier in the street is hit from up there (${sc.hp0} → ${sc.hp})`,
);

// the light indoors
const li = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 20 && g.upState().up; i++) {
    const u = g.upState();
    g.tp(u.land[0], u.land[1]);
    g.upToggle();
    await wait(120);
  }
  const c = g.start();
  const s = g
    .stairs()
    .map(s => ({ ...s, dist: Math.hypot(s.c[0] - c[0], s.c[1] - c[1]) }))
    .sort((a, b) => a.dist - b.dist)
    .find(s => s.top >= 3);
  for (const q of g.sols) q.night = q.day = true;
  g.player.hp = 100;
  g.tp(s.foot[0], s.foot[1]);
  await wait(1200);
  g.upToggle();
  g.setMin(21 * 60);
  await wait(2500);
  return g.upState().f;
});
check(li === 2, 'a flat to look at by night');
await p.screenshot({ path: shot('v2431-night.png'), timeout: 120000 });
// lit by its tubes, the middle of the picture is far brighter than the dark city at its edge
const px = await p.evaluate(async () => {
  const im = await createImageBitmap(await (await fetch(document.querySelector('canvas').toDataURL())).blob()).catch(
    () => null,
  );
  return im ? [im.width, im.height] : null;
});
void px;
const bright = await p.screenshot({ timeout: 120000, clip: { x: 540, y: 300, width: 200, height: 140 } });
const dark = await p.screenshot({ timeout: 120000, clip: { x: 20, y: 200, width: 200, height: 140 } });
const lum = async buf =>
  p.evaluate(async s => {
    const im = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
    const q = new OffscreenCanvas(im.width, im.height).getContext('2d');
    q.drawImage(im, 0, 0);
    const d = q.getImageData(0, 0, im.width, im.height).data;
    let t = 0;
    for (let i = 0; i < d.length; i += 4) t += d[i] + d[i + 1] + d[i + 2];
    return t / (d.length / 4) / 3;
  }, buf.toString('base64'));
const lb = await lum(bright),
  ld = await lum(dark);
console.log(`   night: the flat ${lb.toFixed(0)} of 255, the city at the edge ${ld.toFixed(0)}`);
check(lb > ld * 1.8 && lb > 14, 'by night the flat is lit by its tubes while the city is dark');

console.log('errors:', errs.length);
for (const e of errs.slice(0, 3)) console.log('  ', e);
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
