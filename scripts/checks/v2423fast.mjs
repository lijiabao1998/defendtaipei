// v24.23 hiding what is out of view must not change the picture: the same draw calls and triangles with it on and off, at
// several places, by day; things that move keep moving. argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4209);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const failed = [];
const errs = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => errs.push(String(e)));
await p.goto(url);
await pickRole(p, { g: 'f', skipIntro: true });
// settle first: rooftops arrive over the first half minute, and the numbers would move anyway
await p.waitForTimeout(25000);

const compare = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  g.setMin(11 * 60);
  const P = g.player.pos;
  const start = [P.x, P.z];
  const spots = [
    start,
    [start[0] + 45, start[1] + 10],
    [start[0] - 60, start[1] - 40],
    [start[0] + 20, start[1] - 90],
    [start[0] - 110, start[1] + 60],
  ];
  const out = [];
  for (const q of spots) {
    g.tp(q[0], q[1]);
    await wait(2500);
    g.fast.on = true;
    await wait(700);
    const on = { ...g.rinfo(), culled: g.fast.culled, roots: g.fast.roots };
    g.fast.on = false;
    await wait(700);
    const off = g.rinfo();
    g.fast.on = true;
    await wait(300);
    out.push({
      on: [on.calls, on.tris],
      off: [off.calls, off.tris],
      culled: on.culled,
      roots: on.roots,
      x: Math.round(q[0]),
      z: Math.round(q[1]),
    });
  }
  return out;
});
for (const c of compare) console.log('  ', JSON.stringify(c));
check(
  compare.every(c => c.culled > c.roots * 0.5),
  'most of the world is hidden at any one spot',
);
// the same calls and triangles, give or take what is animated or arrives in those seconds
const within = (a, b, f) => Math.abs(a - b) <= Math.max(a, b) * f;
for (const c of compare) {
  check(within(c.on[0], c.off[0], 0.03), `the same draw calls at ${c.x},${c.z} (${c.on[0]} / ${c.off[0]})`);
  check(within(c.on[1], c.off[1], 0.03), `the same triangles at ${c.x},${c.z} (${c.on[1]} / ${c.off[1]})`);
}

// things that were hidden and move come back where they should be: a vehicle far away, driven here
const moved = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const P = g.player.pos;
  const far = g.drive.list.find(v => Math.hypot(v.pos.x - P.x, v.pos.z - P.z) > 120);
  await wait(1200);
  far.pos.set(P.x + 6, 0, P.z);
  await wait(1200);
  far.g.updateWorldMatrix(true, false);
  const e = far.g.matrixWorld.elements;
  const vis = far.g.visible;
  // and a far soldier keeps its own idea of being visible
  const s = g.sols.find(q => q.state !== 'dead' && Math.hypot(q.pos.x - P.x, q.pos.z - P.z) > 150);
  const sv = s ? s.mesh.visible : true;
  return { at: [e[12] - P.x, e[14] - P.z], vis, sv };
});
console.log('  ', JSON.stringify(moved));
check(
  Math.abs(moved.at[0] - 6) < 0.2 && Math.abs(moved.at[1]) < 0.2 && moved.vis,
  'a far vehicle brought here is here and visible',
);
check(moved.sv, 'a far soldier is not hidden as far as the game can tell');

// the game hiding something that is out of view must stick when it comes back
const hid = await p.evaluate(async () => {
  const g = window.__game;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const scene = g.player.mesh.parent;
  const P = g.player.pos;
  // a building out of view, hidden by this check while it is out of view
  const q = scene.children.find(o => o.__culled && o.__b);
  if (!q) return { none: true };
  q.visible = false;
  g.tp(q.__b.x, q.__b.z);
  await wait(1500);
  const a = q.visible;
  q.visible = true;
  await wait(800);
  const c = q.visible;
  return { a, c, culled: q.__culled };
});
console.log('  ', JSON.stringify(hid));
check(!hid.none && hid.a === false, 'what the game hid stays hidden when it comes into view');
check(!hid.none && hid.c === true, 'and shows again when the game says so');

// the scope and the drone look further than the street: everything comes back for them
const scope = await p.evaluate(async () => {
  const g = window.__game;
  const before = g.fast.culled;
  g.fast.on = false;
  await new Promise(r => setTimeout(r, 500));
  const after = g.player.mesh.parent.children.filter(o => o.__culled).length;
  g.fast.on = true;
  return { before, after };
});
console.log('  ', JSON.stringify(scope));
check(scope.after === 0, 'turned off, nothing stays hidden');

console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
