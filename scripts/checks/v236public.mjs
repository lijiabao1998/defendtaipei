// v23.6 public buildings: schools, hospitals, temples, markets, police / fire stations and offices get their own
// fit-out. For each kind, find one in the streamed district data (OSM building / amenity tags), walk to a spot just
// inside its street door, and check it is furnished with that kind's containers; screenshot the interior.
// Core buildings named like 醫院 / 宮 / 派出所 are checked from the core list. argv: [url] (default: vite preview).
import fs from 'node:fs';
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4186);
const url = gameUrl(process.argv[2] || srv?.url);
// candidate district buildings per kind, from the tile data (same rules as clutter.ts specialKind, roughly)
const KIND = {
  school: b => b.k === 'school' || /國小|國中|高中|學校/.test(b.n || ''),
  clinic: b => b.k === 'hospital' || b.s === 'hospital' || /醫院|診所/.test(b.n || ''),
  temple: b => b.k === 'temple' || b.s === 'place_of_worship',
  market: b => b.s === 'marketplace' || /市場/.test(b.n || ''),
  office: b => /^(office|commercial|government)$/.test(b.k || ''),
};
const LABEL = {
  school: '講桌抽屜|置物櫃|書包|保健室藥櫃',
  clinic: '護理站|藥品櫃',
  temple: '供桌|功德箱',
  market: '攤位',
  office: '辦公桌抽屜|檔案櫃',
  police: '警用置物櫃|辦公桌抽屜|檔案櫃',
};
const dir = 'public/data/district/';
const cand = {};
for (const f of fs.readdirSync(dir)) {
  if (!/^-?\d+_-?\d+\.json$/.test(f)) continue;
  for (const b of JSON.parse(fs.readFileSync(dir + f)).b) {
    const c = b.p.reduce((a, q) => [a[0] + q[0] / b.p.length, a[1] + q[1] / b.p.length], [0, 0]);
    for (const [k, t] of Object.entries(KIND)) if (t(b)) (cand[k] ||= []).push(c);
  }
}
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
await G(`g.setTime(720)`);
const fail = [];
const res = {};
// district kinds
for (const kind of Object.keys(KIND)) {
  const list = (cand[kind] || []).slice(0, 4);
  let done = null;
  for (const [x, z] of list) {
    await G(`g.tp(${x + 12},${z + 12})`);
    await wait(12000);
    const ents = (await G(`return g.denter()`)).filter(e => e.kind === kind);
    if (!ents.length) continue;
    ents.sort((a, c) => Math.hypot(a.c[0] - x, a.c[1] - z) - Math.hypot(c.c[0] - x, c.c[1] - z));
    const e = ents[0];
    await G(`g.tp(${e.door[0] + e.n[0] * 1.3},${e.door[1] + e.n[1] * 1.3})`);
    await wait(2500);
    const conts = await G(
      `return g.conts.filter(c=>c.id.startsWith('t${e.key}:')&&+c.id.split(':')[1]>=${1000 + e.bi * 64}&&+c.id.split(':')[1]<${1064 + e.bi * 64}).map(c=>c.label)`,
    );
    const live = (await G(`return g.denter()`)).find(q => q.key === e.key && q.bi === e.bi)?.live;
    done = { at: e.key + '#' + e.bi, live, indoor: await G(`return g.indoor()`), conts };
    await p.screenshot({ path: shot(`public-${kind}.png`), timeout: 120000 });
    break;
  }
  res[kind] = done || 'none enterable among candidates';
  if (!done) fail.push(`${kind}: no enterable building found`);
  else if (!done.live || !done.indoor || !done.conts.some(l => new RegExp(LABEL[kind]).test(l)))
    fail.push(`${kind}: ${JSON.stringify(done)}`);
}
// core kinds (named buildings): furnished with their own containers
await G(`g.tp(0,0)`);
await wait(3000);
const core = await G(`return g.coreKinds()`);
res.core = core.reduce((a, q) => ((a[q.kind] = (a[q.kind] || 0) + 1), a), {});
const pc = core.find(q => q.kind === 'police') || core.find(q => q.kind === 'clinic') || core[0];
if (pc) {
  await G(`g.tp(${pc.inside[0]},${pc.inside[1]})`);
  await wait(2500);
  res.coreVisit = { kind: pc.kind, conts: pc.conts, indoor: await G(`return g.indoor()`) };
  await p.screenshot({ path: shot(`public-core-${pc.kind}.png`), timeout: 120000 });
  if (!pc.conts.some(l => new RegExp(LABEL[pc.kind]).test(l)))
    fail.push(`core ${pc.kind}: ${JSON.stringify(pc.conts)}`);
} else fail.push('core: no public building with a fit-out');
console.log(JSON.stringify({ res, fail, errs }, null, 1));
await b.close();
srv?.stop();
process.exit(fail.length || errs.length ? 1 : 0);
