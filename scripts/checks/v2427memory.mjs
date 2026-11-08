// v24.27 packing the vertex data must not change the picture: the same views with it on and off, pixel by pixel, with the same
// world and weather (Math.random is seeded); the same draw calls and triangles; and a lot less memory. argv: [url] (default: vite preview).
import { devices } from 'playwright';
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4213);
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
/** the numbers and pictures of one run */
async function run(query, label) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(seedRandom);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(label + ': ' + String(e).slice(0, 300)));
  await p.goto(base + query);
  await pickRole(p, { g: 'f', skipIntro: true, entryTimeout: 240000 });
  // everything that arrives over the first half minute (rooftops, tiles)
  await p.waitForTimeout(32000);
  const out = { shots: {}, r: {}, label };
  for (const [name, dx, dz] of views) {
    await p.evaluate(
      async ([dx, dz]) => {
        const g = window.__game;
        const c = g.start();
        g.setMin(11 * 60);
        g.tp(c[0] + dx, c[1] + dz);
        // nothing walking through the picture
        for (const s of g.sols) s.night = s.day = true;
        await new Promise(r => setTimeout(r, 5000));
      },
      [dx, dz],
    );
    out.shots[name] = await p.screenshot({ timeout: 120000, clip: { x: 260, y: 20, width: 700, height: 600 } });
    out.r[name] = await p.evaluate(() => window.__game.rinfo());
  }
  out.mem = await p.evaluate(() => {
    const g = window.__game;
    const seen = new Set();
    let n = 0,
      v = 0;
    g.player.mesh.parent.traverse(o => {
      const q = o.geometry;
      if (!q || seen.has(q)) return;
      seen.add(q);
      for (const k in q.attributes) n += q.attributes[k].array?.byteLength || 0;
      if (q.index) n += q.index.array.byteLength;
      v += q.attributes.position?.count || 0;
    });
    let sample = null;
    g.player.mesh.parent.traverse(o => {
      if (!sample && o.geometry?.userData?.compact)
        sample = {
          normal: o.geometry.attributes.normal?.array.constructor.name,
          nsize: o.geometry.attributes.normal?.itemSize,
          color: o.geometry.attributes.color?.array.constructor.name,
          csize: o.geometry.attributes.color?.itemSize,
          uv: !!o.geometry.attributes.uv,
        };
    });
    return { mb: n / 1048576, verts: v, c: { ...g.compact }, sample };
  });
  await ctx.close();
  return out;
}
const off = await run('?nocompact=1', 'off');
const on = await run('', 'on');
console.log('   off', JSON.stringify(off.mem));
console.log('   on ', JSON.stringify(on.mem));
check(on.mem.c.meshes > 500, `meshes are packed (${on.mem.c.meshes})`);
check(on.mem.sample?.normal === 'Int8Array' && on.mem.sample?.nsize === 4, 'normals are four signed bytes');
check(
  on.mem.mb < off.mem.mb * 0.65,
  `the vertex data is much smaller (${off.mem.mb.toFixed(0)} → ${on.mem.mb.toFixed(0)} MB)`,
);
check(on.mem.c.ms < 1500, `packing is quick (${on.mem.c.ms.toFixed(0)} ms in all)`);

// the same picture, compared in a browser
const page = await b.newPage();
for (const [name] of views) {
  const onR = on.r[name],
    offR = off.r[name];
  const near = (x, y, f) => Math.abs(x - y) <= Math.max(x, y) * f;
  check(near(onR.calls, offR.calls, 0.03), `${name}: the same draw calls (${offR.calls} / ${onR.calls})`);
  check(near(onR.tris, offR.tris, 0.03), `${name}: the same triangles (${offR.tris} / ${onR.tris})`);
  const d = await page.evaluate(
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
      let over = 0,
        sum = 0;
      for (let i = 0; i < x.length; i += 4) {
        const m = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2]));
        sum += m;
        if (m > 16) over++;
      }
      return { pct: (over / (x.length / 4)) * 100, mean: sum / (x.length / 4) };
    },
    [off.shots[name].toString('base64'), on.shots[name].toString('base64')],
  );
  console.log(`   ${name}: ${d.pct.toFixed(2)}% of pixels differ visibly, mean difference ${d.mean.toFixed(2)} of 255`);
  check(d.pct < 2.5, `${name}: the same picture (${d.pct.toFixed(2)}% of pixels differ)`);
}
await page.close();

// a phone keeps fewer tiles
const ctx = await b.newContext(devices['iPhone 13']);
const q = await ctx.newPage();
q.on('pageerror', e => errs.push('phone: ' + String(e).slice(0, 300)));
await q.goto(base);
await pickRole(q, { g: 'm', skipIntro: true, entryTimeout: 240000 });
await q.waitForTimeout(25000);
const ph = await q.evaluate(() => ({
  tiles: window.__game.enterStats().district.tiles,
  r: window.__game.rinfo(),
  heap: performance.memory.usedJSHeapSize / 1048576,
}));
console.log('   phone', JSON.stringify(ph));
check(ph.tiles <= 14, `a phone keeps fewer tiles (${ph.tiles})`);
check(ph.r.calls <= 450 && ph.r.tris <= 990000, `phone: within budget (${ph.r.calls} calls, ${ph.r.tris} tris)`);
await ctx.close();
console.log('errors:', errs.length, errs.slice(0, 3));
void shot;
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
