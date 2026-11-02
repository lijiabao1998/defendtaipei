// v21.5 screenshots: district walk-ups (rear stairs / cages / ACs / signs) and an enterable building (v23.3).
// argv: url outDir
import { launch, pickRole } from '../lib.mjs';
const [url, out] = process.argv.slice(2);
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
const res = {};
for (const [n, x, z] of [
  ['walkups-1', -600, 1100],
  ['walkups-2', 150, 1320],
  ['walkups-3', -900, 600],
]) {
  await G(`g.tp(${x},${z})`);
  await p.waitForTimeout(15000);
  await p.screenshot({ path: `${out}/${n}.png`, timeout: 120000 });
  // v23.3: the single ground-floor rooms became whole enterable buildings (see v233enter.mjs); stand inside one
  const rc = await G(`return g.denter().map(e=>[e.key+'#'+e.bi,[e.door[0]+e.n[0]*1.3,e.door[1]+e.n[1]*1.3]])`);
  res[n] = rc.length;
  if (rc.length && !res.room) {
    res.room = rc[0];
    const [px, pz] = rc[0][1];
    await G(`g.tp(${px},${pz})`);
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `${out}/room.png`, timeout: 120000 });
  }
}
// visible sandbag cover with the player crouched behind it
await G(`const P=g.player.pos;g.tp(150,1320);`);
await p.waitForTimeout(3000);
await G(`const P=g.player.pos;g.sandbags(P.x+0.9,P.z,1.57,5);g.toggleCover();`);
await p.waitForTimeout(2000);
await p.screenshot({ path: `${out}/sandbag-cover.png`, timeout: 120000 });
console.log(JSON.stringify({ res, errs }));
await b.close();
