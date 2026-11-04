// v23.3 enterable district buildings: count them per loaded tile, walk in through a street door with the normal
// movement + collision, check the interior is furnished (containers, indoors), screenshot outside / inside, then
// walk back out to the street. argv: [url] (default: serve dist/ with vite preview); screenshots go to SHOTS_DIR.
import path from 'node:path';
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4183);
const url = gameUrl(process.argv[2] || srv?.url);
const out = path.dirname(shot('v233-probe.png'));
const b = await launch();
const p = await b.newPage({ viewport: { width: 1100, height: 700 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'f', role: 'nurse', skipIntro: true });
await p.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
  timeout: 900000,
  polling: 2000,
});
const G = s => p.evaluate(`(()=>{const g=window.__game;${s}})()`);
const wait = ms => p.waitForTimeout(ms);
/** follow waypoints with the normal movement (slow under software rendering): poll until there or stuck */
async function walk(pts) {
  await G(`g.autoPath(${JSON.stringify(pts)})`);
  const end = pts[pts.length - 1];
  let last = null,
    still = 0;
  for (let t = 0; t < 60; t++) {
    await wait(500);
    const s = await G(`const s=g.autoState();return {p:s.p,indoor:g.indoor()}`);
    if (Math.hypot(s.p[0] - end[0], s.p[1] - end[1]) < 0.35) return { ...s, ok: true };
    if (last && Math.hypot(s.p[0] - last[0], s.p[1] - last[1]) < 0.02) {
      if (++still > 6) return { ...s, ok: false };
    } else still = 0;
    last = s.p;
  }
  await G(`g.autoStop()`);
  return { ...(await G(`const s=g.autoState();return {p:s.p,indoor:g.indoor()}`)), ok: false };
}
const res = { spots: {}, walks: [] };
const fail = [];
for (const [n, x, z] of [
  ['wanda', -600, 1100],
  ['nanjichang', 150, 1320],
]) {
  await G(`g.tp(${x},${z})`);
  await wait(15000);
  const list = await G(`return g.denter()`);
  const tiles = new Set(list.map(e => e.key));
  res.spots[n] = { enterable: list.length, tiles: tiles.size };
  if (!list.length) {
    fail.push(`${n}: no enterable buildings`);
    continue;
  }
  // nearest door to the spot
  list.sort((a, c) => Math.hypot(a.door[0] - x, a.door[1] - z) - Math.hypot(c.door[0] - x, c.door[1] - z));
  for (const e of list.slice(0, 3)) {
    const [dx, dz] = e.door,
      [nx, nz] = e.n;
    const outP = [dx - nx * 2.2, dz - nz * 2.2],
      inP = [dx + nx * 1.3, dz + nz * 1.3]; // the planner keeps ~1.5 m behind the door clear
    await G(`g.tp(${outP[0]},${outP[1]})`);
    await wait(1500);
    const before = await G(`return g.indoor()`);
    const st = await walk([[dx, dz], inP]);
    await wait(1200); // furniture builds every 0.3 s near the player
    const after = (await G(`return g.denter()`)).find(q => q.key === e.key && q.bi === e.bi);
    const w = {
      key: e.key,
      bi: e.bi,
      use: e.use,
      outsideIndoor: before,
      reached: st.ok,
      indoor: st.indoor,
      live: after?.live,
      conts: after?.conts,
    };
    // walk back out through the same door
    const back = await walk([[dx, dz], outP]);
    w.backOut = back.ok && !back.indoor;
    res.walks.push(w);
    if (!w.reached || !w.indoor || !w.live || w.outsideIndoor || !w.backOut)
      fail.push(`${n} ${e.key}#${e.bi}: ${JSON.stringify(w)}`);
  }
  // screenshots of the first one: outside the door, inside (cut view)
  const e = list[0];
  const [dx, dz] = e.door,
    [nx, nz] = e.n;
  await G(`g.tp(${dx - nx * 2.2},${dz - nz * 2.2})`);
  await wait(2500);
  await p.screenshot({ path: `${out}/${n}-door.png`, timeout: 120000 });
  await G(`g.tp(${dx + nx * 2.4},${dz + nz * 2.4})`);
  await wait(2500);
  await p.screenshot({ path: `${out}/${n}-inside.png`, timeout: 120000 });
}
const clut = await G(`return g.clutter().stats`);
console.log(JSON.stringify({ res, clut, fail, errs }, null, 1));
await b.close();
srv?.stop();
process.exit(fail.length || errs.length ? 1 : 0);
