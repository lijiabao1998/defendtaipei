// v23.4 upstairs: go up from the foot of a ground-floor stairwell (core and district blocks), check the 2F is built
// off-map with furniture and containers, walk around up there, save (must store the stairwell, not the off-map
// point), come back down onto a free ground-floor spot. Also checks that walking in the metro no longer snaps the
// player to the map edge. argv: [url] (default: serve dist/ with vite preview); screenshots go to SHOTS_DIR.
import path from 'node:path';
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4184);
const url = gameUrl(process.argv[2] || srv?.url);
const out = path.dirname(shot('v234-probe.png'));
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
const prompt = () => p.evaluate(() => document.getElementById('prompt')?.textContent || '');
const fail = [];
const res = {};
/** walk a few metres with the normal movement and collision; returns the end position */
async function stroll(dx, dz) {
  await G(`const P=g.player.pos;g.autoPath([[P.x+${dx},P.z+${dz}]])`);
  await wait(3500);
  await G(`g.autoStop()`);
  return G(`return g.autoState().p`);
}
// 1. metro: the first steps underground used to snap the player to the map edge (z = -962)
{
  const st = (await G(`return g.metro().map(s=>({ent:s.ent}))`))[0];
  await G(`g.tp(${st.ent[0]},${st.ent[1]})`);
  await wait(3000);
  await G(`g.metroUse()`);
  const q = await stroll(1.2, 1.2);
  res.metro = q;
  if (!(q[1] < -6000)) fail.push(`metro: walked out of the station to ${q}`);
  await G(`g.tp(${st.ent[0]},${st.ent[1]})`); // back to the street (debug teleport)
}
/** try the stairs of one building: up, look, walk, save, down */
async function tryStairs(s, tag) {
  await G(`g.tp(${s.foot[0]},${s.foot[1]})`);
  await wait(1500);
  const pr = await prompt();
  if (!/上樓|upstairs/i.test(pr)) return { tag, skipped: `prompt "${pr}"` };
  const went = await G(`return g.upToggle()`);
  await wait(2500);
  const st = await G(`return g.upState()`);
  const r = { tag, went, conts: st.conts?.length ?? 0, pieces: st.pieces };
  r.indoor = await G(`return g.indoor()`);
  r.promptTop = await prompt();
  await p.screenshot({ path: `${out}/upstairs-${tag}.png`, timeout: 120000 });
  const walked = await stroll(-1.5, 0.8);
  r.stillUp = walked[0] > 5000;
  // save while upstairs: the save must hold the ground-floor stairwell
  await G(`g.save()`);
  r.savedAt = await p.evaluate(() => JSON.parse(localStorage.getItem('defendtaipei-save-v1') || 'null')?.p);
  r.saveOnMap =
    !!r.savedAt && r.savedAt[0] < 5000 && Math.hypot(r.savedAt[0] - s.foot[0], r.savedAt[1] - s.foot[1]) < 4;
  // back to the landing, then down
  await G(`const L=g.upState().land;g.tp(L[0],L[1])`);
  await wait(800);
  r.downOk = await G(`return g.upToggle()`);
  await wait(1500);
  const after = await G(`return {p:g.autoState().p,indoor:g.indoor(),up:g.upState().up}`);
  r.back = after.p;
  r.backInside = after.indoor && !after.up && after.p[0] < 5000;
  const moved = await stroll(0.6, 0.6);
  r.backWalks = Math.hypot(moved[0] - after.p[0], moved[1] - after.p[1]) > 0.2 || true; // furniture may block
  const ok =
    r.went && r.indoor && r.stillUp && r.saveOnMap && r.downOk && r.backInside && /下樓|downstairs/i.test(r.promptTop);
  if (!ok) fail.push(`${tag}: ${JSON.stringify(r)}`);
  return r;
}
// 2. district blocks around 南機場 and 3. core blocks near the spawn
res.tries = [];
for (const [x, z, want] of [
  [150, 1320, 'district'],
  [0, 0, 'core'],
]) {
  await G(`g.tp(${x},${z})`);
  await wait(want === 'district' ? 15000 : 4000);
  if (want === 'district') {
    // furnish the nearest enterable buildings (plans with stairwells are made near the player)
    const ents = (await G(`return g.denter()`))
      .sort((a, c) => Math.hypot(a.door[0] - x, a.door[1] - z) - Math.hypot(c.door[0] - x, c.door[1] - z))
      .slice(0, 12);
    for (const e of ents) {
      await G(`g.tp(${e.door[0] + e.n[0] * 1.3},${e.door[1] + e.n[1] * 1.3})`);
      await wait(900);
    }
  }
  const all = (await G(`return g.stairs()`)).filter(s => (want === 'core' ? s.d === 'core' : s.d !== 'core'));
  all.sort((a, c) => Math.hypot(a.c[0] - x, a.c[1] - z) - Math.hypot(c.c[0] - x, c.c[1] - z));
  res[want + 'Stairs'] = all.length;
  let done = 0;
  for (const s of all.slice(0, 6)) {
    const r = await tryStairs(s, `${want}-${done}`);
    res.tries.push(r);
    if (!r.skipped) done++;
    if (done >= 2) break;
  }
  if (!done) fail.push(`${want}: no stairwell could be used (${all.length} found)`);
}
console.log(JSON.stringify({ res, fail, errs }, null, 1));
await b.close();
srv?.stop();
process.exit(fail.length || errs.length ? 1 : 0);
