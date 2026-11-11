// v24.29 a district tile's copy of its vertex data is let go once the graphics card has it, and given back the moment the
// tile unloads (or, for what is replaced while it is built, straight away). None of it may change the picture: the same
// views with it on and off, pixel by pixel (Math.random is seeded); the same after going far away and coming back, when
// everything here was unloaded and built again; the same after the graphics context is lost and restored; and nothing may
// read a copy that is gone (the on run has ?releasecheck=1, which throws if anything does). argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4216);
const base = gameUrl(process.argv[2] || srv?.url).replace(/\?.*$/, '');
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const seedRandom = () => {
  let s = 987654321;
  Math.random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const views = [
  ['start', 0, 0],
  ['street', 95, 60],
  ['lots', -35, 150],
];
const mb = n => Math.round(n / 1048576);
const clip = { x: 260, y: 20, width: 700, height: 600 };
async function look(p, dx, dz) {
  await p.evaluate(
    async ([dx, dz]) => {
      const g = window.__game;
      const c = g.start();
      g.setMin(11 * 60);
      g.player.hp = 100;
      g.tp(c[0] + dx, c[1] + dz);
      // nothing walking through the picture
      for (const s of g.sols) s.night = s.day = true;
      await new Promise(r => setTimeout(r, 5000));
    },
    [dx, dz],
  );
  return { shot: await p.screenshot({ timeout: 120000, clip }), r: await p.evaluate(() => window.__game.rinfo()) };
}
async function run(query, label, away) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(seedRandom);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(label + ': ' + String(e).slice(0, 400)));
  await p.goto(base + query);
  await pickRole(p, { g: 'f', skipIntro: true, entryTimeout: 240000 });
  // everything that arrives over the first half minute (rooftops, tiles)
  await p.waitForTimeout(32000);
  const out = { v: {}, label };
  for (const [name, dx, dz] of views) out.v[name] = await look(p, dx, dz);
  out.rel = await p.evaluate(() => ({ ...window.__game.release, reads: window.__game.release.reads.length }));
  if (away) {
    // far enough that every tile here goes, and then home again
    out.away = await p.evaluate(async () => {
      const g = window.__game;
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const c = g.start();
      const settle = async () => {
        let last = -1,
          same = 0;
        for (let i = 0; i < 80 && same < 6; i++) {
          await wait(500);
          const t = g.enterStats().district.tiles;
          same = t === last ? same + 1 : 0;
          last = t;
        }
      };
      const before = g.release.freedBytes;
      g.player.hp = 100;
      g.tp(c[0] - 700, c[1] + 2200);
      await settle();
      const freed = g.release.freedBytes - before;
      g.player.hp = 100;
      g.tp(c[0], c[1]);
      await settle();
      await wait(6000);
      // nothing still in the world may be something that was given back
      let stale = 0,
        meshes = 0;
      g.scene.traverse(o => {
        if (!o.geometry) return;
        meshes++;
        if (o.geometry.userData.freed) stale++;
      });
      return { freed, stale, meshes };
    });
    out.back = await look(p, 0, 0);
    // the graphics context is lost and comes back (a phone that put the page aside), out among district tiles: the card's
    // copy went with it, so the tiles are built again
    await look(p, -790, 1570);
    await p.waitForTimeout(12000);
    out.ctxBefore = await look(p, -790, 1570);
    out.ctxUp = await p.evaluate(() => window.__game.release.bytes);
    out.ctx = await p.evaluate(async () => {
      const cv = [...document.querySelectorAll('canvas')].sort((a, c) => c.width * c.height - a.width * a.height)[0];
      const gl = cv.getContext('webgl2') || cv.getContext('webgl');
      const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return null;
      const loads = window.__game.enterStats().district.tiles;
      ext.loseContext();
      await new Promise(r => setTimeout(r, 1500));
      const lost = gl.isContextLost();
      ext.restoreContext();
      await new Promise(r => setTimeout(r, 25000));
      return { lost, back: !gl.isContextLost(), tiles: [loads, window.__game.enterStats().district.tiles] };
    });
    out.ctxAfter = await look(p, -790, 1570);
    out.rel2 = await p.evaluate(() => ({ ...window.__game.release, reads: window.__game.release.reads }));
  }
  await ctx.close();
  return out;
}
const off = await run('?norelease=1', 'off', false);
const on = await run('?releasecheck=1', 'on', true);
console.log('   off', JSON.stringify(off.rel));
console.log('   on ', JSON.stringify(on.rel), JSON.stringify(on.away));
check(off.rel.attrs === 0 && off.rel.held === 0, '?norelease=1 keeps everything');
check(
  on.rel.bytes > 8 * 1048576,
  `what has been drawn of the district tiles is let go (${mb(on.rel.bytes)} MB in ${on.rel.attrs} arrays)`,
);
check(on.rel.heldBytes > 50 * 1048576, `what has not been drawn yet keeps its copy (${mb(on.rel.heldBytes)} MB)`);
check(
  on.away.freed > 100 * 1048576,
  `vertex data is given back at once as tiles go and new ones are built (${mb(on.away.freed)} MB on going away)`,
);
// (the on run is in ?releasecheck=1, where every array given back is also wired to report readers: not the place to time it)
console.log(`   time spent letting go and giving back, in check mode: ${Math.round(on.rel2.ms)} ms`);
check(on.away.stale === 0, `nothing still in the world was given back (${on.away.stale} of ${on.away.meshes} meshes)`);
check(on.rel2.reads.length === 0, `nothing reads a copy that is gone (${on.rel2.reads.length})`);
for (const r of on.rel2.reads.slice(0, 5)) console.log('   read:', r.slice(0, 300));

// the same picture, compared in a browser
const page = await b.newPage();
const diff = (a, c) =>
  page.evaluate(
    async ([a, c]) => {
      const load = async s => createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
      const [A, C] = await Promise.all([load(a), load(c)]);
      const data = im => {
        const q = new OffscreenCanvas(im.width, im.height).getContext('2d');
        q.drawImage(im, 0, 0);
        return q.getImageData(0, 0, im.width, im.height).data;
      };
      const x = data(A),
        y = data(C);
      let over = 0;
      for (let i = 0; i < x.length; i += 4)
        if (Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2])) > 16) over++;
      return (over / (x.length / 4)) * 100;
    },
    [a.toString('base64'), c.toString('base64')],
  );
const near = (x, y, f) => Math.abs(x - y) <= Math.max(x, y) * f;
for (const [name] of views) {
  const A = off.v[name],
    C = on.v[name];
  check(
    near(A.r.calls, C.r.calls, 0.03) && near(A.r.tris, C.r.tris, 0.03),
    `${name}: the same draw calls and triangles (${A.r.calls}/${C.r.calls}, ${A.r.tris}/${C.r.tris})`,
  );
  const d = await diff(A.shot, C.shot);
  check(d < 2.5, `${name}: the same picture (${d.toFixed(2)}% of pixels differ)`);
}
{
  const d = await diff(on.v.start.shot, on.back.shot);
  check(
    near(on.v.start.r.tris, on.back.r.tris, 0.05),
    `home again: the same triangles (${on.v.start.r.tris}/${on.back.r.tris})`,
  );
  check(d < 4, `home again after everything unloaded: the same picture (${d.toFixed(2)}% of pixels differ)`);
}
console.log('   context', JSON.stringify(on.ctx), mb(on.ctxUp), 'MB let go before it');
check(on.ctx?.lost && on.ctx?.back, 'the graphics context was lost and came back');
check(
  on.ctxUp > on.rel.bytes,
  `district tiles had let go of vertex data there (${mb(on.ctxUp - on.rel.bytes)} MB more)`,
);
check(
  near(on.ctxBefore.r.tris, on.ctxAfter.r.tris, 0.03),
  `after the context came back: the same triangles (${on.ctxBefore.r.tris}/${on.ctxAfter.r.tris})`,
);
{
  const d = await diff(on.ctxBefore.shot, on.ctxAfter.shot);
  check(d < 4, `after the context came back: the same picture (${d.toFixed(2)}% of pixels differ)`);
}
await page.close();
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
