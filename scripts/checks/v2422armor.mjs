// v24.22 captured PLA armour can be driven and fought from: a turret that traverses at its own speed, rounds along the
// barrel, boxes, reloads and barrel heat. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4208);
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

// some are left on the map
const left = await p.evaluate(() => {
  const g = window.__game;
  const P = g.player.pos;
  return g.drive.list
    .filter(v => v.gun)
    .map(v => ({ k: v.kind, d: Math.round(Math.hypot(v.pos.x - P.x, v.pos.z - P.z)) }));
});
console.log('   left on the roads:', JSON.stringify(left));
check(left.length >= 3, `armour is left on the wide roads (${left.length})`);
check(
  left.every(v => v.d > 100),
  'none of it right where you start',
);

// get in on an open street
await p.evaluate(async () => {
  const g = window.__game,
    d = g.drive;
  const sp = g.arcSpot();
  const x = sp.mid[0] + sp.nx * 9,
    z = sp.mid[1] + sp.nz * 9;
  // along the street
  const hd = Math.atan2(sp.nz, -sp.nx);
  const v = g.avSpawn('zbl08', x, z, hd);
  for (const q of g.sols)
    if (Math.hypot(q.pos.x - x, q.pos.z - z) < 140) ((q.state = 'dead'), (q.hp = 0), (q.mesh.visible = false));
  g.tp(x + 1, z);
  await new Promise(r => setTimeout(r, 800));
  window.__v = v;
  return { x, z };
});
await p.keyboard.press('KeyE');
await p.waitForTimeout(1500);
const inn2 = await p.evaluate(() => {
  const g = window.__game,
    d = g.drive,
    v = window.__v;
  return {
    msg: d.cur === v ? '' : 'not in: cur=' + (d.cur?.kind ?? null),
    cur: d.cur === v,
    guns: v.gun.guns.map(q => [q.w.name, q.ready, q.w.cd]),
    hd: v.hd,
    x: v.pos.x,
    z: v.pos.z,
    vis: g.player.mesh.visible,
    res: g.promptText?.() ?? '',
  };
});
const inn = inn2;
console.log('  ', JSON.stringify(inn));
check(inn.msg === '' && inn.cur, 'you can get in with E');
check(inn.guns.length === 2, 'autocannon and coaxial machine gun');
check(inn.guns[0][1] === 200 && inn.guns[0][2] === 0.2, '30 mm: 200 ready, about 300 rounds a minute');
check(inn.guns[1][1] === 250, '7.62 mm: a 250-round belt');
check(!inn.vis, 'you are inside the hull');

// the point on screen for a place on the map
const aim = (x, z) =>
  p.evaluate(
    ([x, z, W, H]) => {
      const g = window.__game;
      const q = g.player.pos.clone().set(x, 1, z).project(g.camera);
      return [((q.x + 1) / 2) * W, ((1 - q.y) / 2) * H];
    },
    [x, z, W, H],
  );

// the turret goes round at its own speed, not at once
const [ax, ay] = await aim(inn.x - Math.sin(inn.hd) * 18, inn.z - Math.cos(inn.hd) * 18); // right behind
await p.mouse.move(ax, ay);
const t0 = await p.evaluate(() => window.__v.tur.rotation.y);
const turn = await p.evaluate(async () => {
  const v = window.__v;
  const a0 = v.tur.rotation.y;
  const t0 = performance.now();
  await new Promise(r => setTimeout(r, 900));
  const a1 = v.tur.rotation.y;
  const dt = (performance.now() - t0) / 1000;
  for (let i = 0; i < 80; i++) await new Promise(r => setTimeout(r, 250));
  return { a0, a1, dt, a2: v.tur.rotation.y };
});
console.log('  ', JSON.stringify({ t0, ...turn }));
const off = Math.abs(Math.atan2(Math.sin(turn.a2 - Math.PI), Math.cos(turn.a2 - Math.PI)));
check(Math.abs(turn.a1 - turn.a0) < 1.1 * turn.dt + 0.05, 'the turret traverses at its own speed');
check(off < 0.25, `and ends up where you point (${off.toFixed(2)} rad off)`);

// firing uses up rounds from the box, along the barrel; a soldier on that line is hit
await p.evaluate(() => {
  const g = window.__game,
    v = window.__v;
  const yaw = v.hd + v.tur.rotation.y;
  const s = g.sols.find(q => q.state === 'dead');
  s.state = 'idle';
  s.hp = 400;
  s.mesh.visible = true;
  s.pos.set(v.pos.x + Math.sin(yaw) * 14, 0, v.pos.z + Math.cos(yaw) * 14);
  s.mesh.position.copy(s.pos);
  window.__s = s;
});
const [fx, fy] = await p.evaluate(() => [window.__s.pos.x, window.__s.pos.z]);
const [mx, my] = await aim(fx, fy);
await p.mouse.move(mx, my);
await p.waitForTimeout(1500);
const f0 = await p.evaluate(() => ({
  r: window.__v.gun.guns[0].ready,
  h: window.__v.gun.guns[0].heat,
  n: window.__game.avStat.shots,
  inv: { ...window.__game.player.inv },
}));
await p.mouse.down();
await p.waitForTimeout(2500);
await p.screenshot({ path: shot('v2422-fire.png'), timeout: 120000 });
await p.mouse.up();
const f1 = await p.evaluate(() => {
  const s = window.__s;
  const r = {
    r: window.__v.gun.guns[0].ready,
    h: window.__v.gun.guns[0].heat,
    n: window.__game.avStat.shots,
    hp: s.hp,
    dead: s.state === 'dead',
    inv: { ...window.__game.player.inv },
  };
  return r;
});
console.log(
  '  ',
  JSON.stringify({ r0: f0.r, r1: f1.r, h0: f0.h, h1: f1.h, shots: f1.n - f0.n, hp: f1.hp, dead: f1.dead }),
);
check(f1.r < f0.r, 'firing uses rounds from the box');
check(f1.h > f0.h, 'and heats the barrel');
check(f1.dead || f1.hp < 400, 'a soldier on the line of fire is hit');
check(JSON.stringify(f1.inv) === JSON.stringify(f0.inv), "the player's own gear is not touched");

// heat: at 100 % it stops until it has cooled to 45 %
const hot = await p.evaluate(() => {
  const q = window.__v.gun.guns[0];
  q.heat = 99.9;
  return q.ready;
});
await p.mouse.down();
await p.waitForTimeout(1500);
await p.mouse.up();
const hot1 = await p.evaluate(async () => {
  const q = window.__v.gun.guns[0];
  const r = { jam: q.jam, ready: q.ready, status: window.__game.avStatusNow() };
  q.heat = 46;
  for (let i = 0; i < 40 && q.jam; i++) await new Promise(r => setTimeout(r, 250));
  r.after = q.jam;
  return r;
});
console.log('  ', JSON.stringify(hot1));
check(hot1.jam, 'an overheated barrel stops the gun');
check(hot - hot1.ready <= 3, 'hardly a round more goes out');
check(hot1.status.includes('過熱') || hot1.status.includes('overheated'), 'and the status says so');
check(hot1.after === false, 'it fires again once it has cooled');

// R: a fresh box; V: the other gun
await p.keyboard.press('KeyR');
const rel = await p.evaluate(async () => {
  const q = window.__v.gun.guns[0];
  const during = { t: q.reloadT, ready: q.ready, reserve: q.reserve };
  q.reloadT = 0.4; // the real 9 s is too long for a software-rendered test
  for (let i = 0; i < 40 && q.reloadT > 0; i++) await new Promise(r => setTimeout(r, 250));
  return { during, ready: q.ready, reserve: q.reserve };
});
console.log('  ', JSON.stringify(rel));
check(rel.during.t > 8 && rel.during.ready === 0, 'R starts a nine-second box change');
check(rel.ready === 200, 'and it ends with a full box');
await p.keyboard.press('KeyV');
const sel = await p.evaluate(() => ({ sel: window.__v.gun.sel, status: window.__game.avStatusNow() }));
check(sel.sel === 1 && sel.status.includes('7.62'), 'V changes to the machine gun');
await p.keyboard.press('KeyV');

// walls stop rounds: a soldier behind a wall is safe
const wall = await p.evaluate(async () => {
  const g = window.__game,
    v = window.__v;
  const O = [v.pos.x, v.pos.z];
  // the nearest wall in any direction
  let best = null;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const ux = Math.sin(a),
      uz = Math.cos(a);
    const ray = b => {
      const f = g.shotClear(
        [O[0] + Math.sin(b) * 4, O[1] + Math.cos(b) * 4],
        [O[0] + Math.sin(b) * 44, O[1] + Math.cos(b) * 44],
      );
      return f < 1 ? 4 + 40 * f : 1e9;
    };
    const D = ray(a);
    // a real wall, not a tree trunk: the rays either side stop at about the same place
    if (D > 6 && D < 40 && Math.abs(ray(a - 0.1) - D) < 3 && Math.abs(ray(a + 0.1) - D) < 3 && (!best || D < best.D))
      best = { D, a, ux, uz };
  }
  if (!best) return null;
  const s = window.__s;
  s.state = 'idle';
  s.hp = 400;
  s.mesh.visible = true;
  s.pos.set(O[0] + best.ux * (best.D + 3), 0, O[1] + best.uz * (best.D + 3));
  s.mesh.position.copy(s.pos);
  return { D: best.D, a: best.a, x: s.pos.x, z: s.pos.z };
});
console.log('  ', JSON.stringify(wall));
check(!!wall, 'there is a wall to test against');
if (wall) {
  const [wx, wy] = await aim(wall.x, wall.z);
  await p.mouse.move(wx, wy);
  await p
    .waitForFunction(
      a => {
        const v = window.__v;
        const d = v.hd + v.tur.rotation.y - a;
        return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 0.04;
      },
      wall.a,
      { timeout: 40000, polling: 200 },
    )
    .catch(async e => {
      console.log(
        '   turret did not settle',
        JSON.stringify(
          await p.evaluate(() => {
            const v = window.__v;
            return {
              hd: v.hd,
              tur: v.tur.rotation.y,
              cur: !!window.__game.drive.cur,
              x: v.pos.x,
              z: v.pos.z,
              sel: v.gun.sel,
            };
          }),
        ),
        JSON.stringify(wall),
      );
      throw e;
    });
  await p.evaluate(s => {
    window.__s.pos.set(s.x, 0, s.z);
    window.__s.hp = 400;
    window.__shots0 = window.__game.avStat.shots;
    // soldiers walk round walls now: keep this one where the check put it, behind the wall, while the gun fires
    window.__pin = setInterval(() => {
      window.__s.pos.set(s.x, 0, s.z);
      window.__s.mesh.position.copy(window.__s.pos);
    }, 16);
  }, wall);
  await p.mouse.down();
  await p.waitForTimeout(1500);
  await p.mouse.up();
  await p.evaluate(() => clearInterval(window.__pin));
  const r = await p.evaluate(() => ({ hp: window.__s.hp, shots: window.__game.avStat.shots - window.__shots0 }));
  console.log('  ', JSON.stringify(r));
  check(r.shots > 0, 'it did fire');
  check(r.hp === 400, `the wall stops the rounds (soldier ${r.hp})`);
}

// inside, a hit takes one tenth and there is no bleeding
const shield = await p.evaluate(async () => {
  const g = window.__game;
  g.player.hp = 100;
  await new Promise(r => setTimeout(r, 300));
  g.player.hp = 50;
  g.player.bleed = true;
  await new Promise(r => setTimeout(r, 600));
  return { hp: g.player.hp, bleed: g.player.bleed };
});
console.log('  ', JSON.stringify(shield));
check(shield.hp > 90, `the hull takes most of a hit (hp ${Math.round(shield.hp)})`);
check(!shield.bleed, 'and there is no bleeding');

// it drives forward, along its nose
const go = await p.evaluate(() => {
  const g = window.__game,
    d = g.drive,
    v = window.__v;
  // somewhere with an open run towards the top of the screen, which is where W goes
  const hd = Math.atan2(-1, -1);
  const fx = Math.sin(hd),
    fz = Math.cos(hd);
  const O = [v.pos.x, v.pos.z];
  search: for (let r = 0; r < 120; r += 6)
    for (let i = 0; i < 16; i++) {
      const x = O[0] + Math.cos(i * 0.39) * r,
        z = O[1] + Math.sin(i * 0.39) * r;
      if ([0, 5, 10, 15, 20].some(k => d.blocked(v, x + fx * k, z + fz * k, hd))) continue;
      v.pos.set(x, 0, z);
      v.hd = hd;
      break search;
    }
  return { x: v.pos.x, z: v.pos.z, hd: v.hd };
});
await p.waitForTimeout(800);
await p.keyboard.down('KeyW');
await p.waitForTimeout(3500);
await p.keyboard.up('KeyW');
const went = await p.evaluate(g0 => {
  const v = window.__v;
  const dx = v.pos.x - g0.x,
    dz = v.pos.z - g0.z;
  return {
    x: v.pos.x,
    z: v.pos.z,
    moved: Math.hypot(dx, dz),
    along: dx * Math.sin(g0.hd) + dz * Math.cos(g0.hd),
    v: v.v,
    fuel: v.fuel,
  };
}, go);
console.log('  ', JSON.stringify(went));
check(went.moved > 0.5 || Math.abs(went.v) > 0.5, 'it drives');
const vp = await aim(went.x, went.z);
await p.screenshot({
  path: shot('v2422-drive.png'),
  timeout: 120000,
  clip: { x: Math.max(0, vp[0] - 160), y: Math.max(0, vp[1] - 130), width: 320, height: 260 },
});

// out again, and the player is back
await p.keyboard.press('KeyE');
await p.waitForTimeout(800);
const out = await p.evaluate(() => ({ cur: !!window.__game.drive.cur, vis: window.__game.player.mesh.visible }));
check(!out.cur && out.vis, 'you can get out');

// a crew bails out of a badly hurt vehicle, and it can be taken
const bail = await p.evaluate(async () => {
  const g = window.__game,
    A = g.armor();
  const P = g.player.pos;
  const x = P.x + 8,
    z = P.z;
  const a = A.spawn('zbd05', [
    [x, z],
    [x + 20, z],
  ]);
  a.hp = 35;
  const n0 = g.drive.list.length;
  const hit = A.hit(a.g.position.x, a.g.position.z, 10, true);
  const v = g.drive.list[g.drive.list.length - 1];
  return {
    hit,
    gone: !A.list.includes(a),
    added: g.drive.list.length - n0,
    kind: v.kind,
    gun: !!v.gun,
    nose: [Math.sin(v.hd), Math.cos(v.hd)],
  };
});
console.log('  ', JSON.stringify(bail));
check(bail.hit && bail.gone, 'badly hurt, the crew leaves the vehicle');
check(bail.added === 1 && bail.kind === 'zbd05' && bail.gun, 'and it stays there to be taken');
check(Math.abs(bail.nose[0] - 1) < 0.01, 'still facing the way it was going');

console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
