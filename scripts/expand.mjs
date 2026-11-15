// Offline preprocessing (v24.33): add neighbouring districts to the streamed map.
// scripts/district.mjs built 萬華區 from one extract and cannot be run again without moving everything it made
// (its frontage infill draws from one random stream, and OSM has been edited since). So this script only ADDS:
// buildings and roads of the new districts are appended to public/data/district (new tiles, and the far half of
// the tiles on the old boundary), road detail is appended to public/data/tiles the same way, and the index, the
// paper map and the river get the new parts. What is already there is not rewritten, so the tile ids that saved
// games refer to stay what they were.
//
// Input: one Overpass JSON (out geom) per district — its admin relation, building / highway / railway / water /
// park / landuse ways, building and park multipolygons — and the relation of the city (out body), whose member
// ways mark the edges that are the river.
// A river that runs through a district (基隆河 in 中山區) is a multipolygon of its own: give those relations with
// --water. Its water is drawn, nothing is built in it, and its banks are walls except under the bridges. Every run
// with --water cuts those rivers again, to the box of all the districts they were ever cut for, and makes the banks
// again: a river that was cut at the edge of 中山區 goes on when 松山區 is added.
// --wood: woodland (natural=wood, landuse=forest; ways and multipolygons). The hillsides of 信義區 are a third of the
// district; without it they are bare ground. Kept where it touches a district, drawn green and planted by the game.
// An airfield in a district (aeroway=*, with the district's extract: 松山機場) becomes ix.air: its aprons, runway and
// taxiways as paved ground, its grass as lawn without trees, the runway's paint. Nothing is generated inside it.
// Usage: node scripts/expand.mjs --city raw-city.json [--water raw-water.json] [--wood raw-wood.json] raw-中正區.json …
// Same local projection as public/data/wanhua.json. Data © OpenStreetMap contributors, ODbL.
import fs from 'fs';
const T = 200;
const args = process.argv.slice(2);
const ci = args.indexOf('--city');
const cityFile = ci >= 0 ? args.splice(ci, 2)[1] : null;
const wi = args.indexOf('--water');
const waterFile = wi >= 0 ? args.splice(wi, 2)[1] : null;
const fi = args.indexOf('--wood');
const woodFile = fi >= 0 ? args.splice(fi, 2)[1] : null;
const lat0 = (25.0365 + 25.0455) / 2,
  lon0 = (121.4975 + 121.5085) / 2;
const kx = 111320 * Math.cos((lat0 * Math.PI) / 180),
  ky = 110540;
const P = g => [Math.round((g.lon - lon0) * kx * 10) / 10, Math.round(-(g.lat - lat0) * ky * 10) / 10];
const core = {
  x0: (121.4975 - lon0) * kx,
  x1: (121.5085 - lon0) * kx,
  z0: -(25.0455 - lat0) * ky,
  z1: -(25.0365 - lat0) * ky,
};
const inCore = (x, z) => x > core.x0 && x < core.x1 && z > core.z0 && z < core.z1;
const tk = (x, z) => Math.floor(x / T) + '_' + Math.floor(z / T);
const cen = p => p.reduce((a, q) => [a[0] + q[0] / p.length, a[1] + q[1] / p.length], [0, 0]);
const simpR = (p, e) => {
  if (p.length < 8) return p;
  const h = p.length >> 1;
  return [...simp(p.slice(0, h + 1), e).slice(0, -1), ...simp(p.slice(h), e)];
};
function simp(p, e) {
  if (p.length < 3) return p;
  let m = 0,
    i0 = 0;
  const [a, b] = [p[0], p[p.length - 1]];
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    L = Math.hypot(dx, dz) || 1;
  for (let i = 1; i < p.length - 1; i++) {
    const d = Math.abs((p[i][0] - a[0]) * dz - (p[i][1] - a[1]) * dx) / L;
    if (d > m) ((m = d), (i0 = i));
  }
  return m > e ? [...simp(p.slice(0, i0 + 1), e).slice(0, -1), ...simp(p.slice(i0), e)] : [a, b];
}
const pip = (pt, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i],
      [xj, zj] = poly[j];
    if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const polyArea = p =>
  Math.abs(p.reduce((a, q, i) => a + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0) / 2);
const segDist = (x, z, a, b) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
};
const RW = {
  trunk: 18,
  primary: 16,
  secondary: 12,
  tertiary: 9,
  residential: 6,
  unclassified: 6,
  living_street: 5,
  service: 4,
  pedestrian: 6,
  footway: 2.5,
  path: 2,
  steps: 2,
  cycleway: 2.5,
};

// ---------------------------------------------------------------- what is already there
const DD = 'public/data/district',
  RD = 'public/data/tiles';
const ix = JSON.parse(fs.readFileSync(`${DD}/index.json`, 'utf8'));
ix.districts ||= ['萬華區'];
const paper = JSON.parse(fs.readFileSync(`${DD}/map.json`, 'utf8'));
const tiles = new Map(); // key -> { b, r, nb0, nr0 } (existing ones are loaded, and only ever appended to)
for (const k of Object.keys(ix.tiles)) {
  const t = JSON.parse(fs.readFileSync(`${DD}/${k}.json`, 'utf8'));
  tiles.set(k, { ...t, nb0: t.b.length, nr0: t.r.length });
}
const tile = k => tiles.get(k) || tiles.set(k, { b: [], r: [], nb0: 0, nr0: 0 }).get(k);
const core0 = JSON.parse(fs.readFileSync('public/data/wanhua.json', 'utf8'));
const G = 20;
const gput = (m, x0, z0, x1, z1, v) => {
  for (let x = Math.floor(x0 / G); x <= Math.floor(x1 / G); x++)
    for (let z = Math.floor(z0 / G); z <= Math.floor(z1 / G); z++)
      (m.get(x + ',' + z) || m.set(x + ',' + z, []).get(x + ',' + z)).push(v);
};
const gnear = (m, x, z) => {
  const out = [];
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) out.push(...(m.get(Math.floor(x / G) + i + ',' + (Math.floor(z / G) + j)) || []));
  return out;
};
const segG = new Map(), // road segments [a, b, half width]
  bG = new Map(), // building footprints
  cG = new Map(); // building centres (to tell a building that is already there)
const addB = p => {
  const xs = p.map(q => q[0]),
    zs = p.map(q => q[1]);
  gput(bG, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), p);
  const c = cen(p);
  gput(cG, c[0], c[1], c[0], c[1], c);
};
const addS = (a, b, w) =>
  gput(segG, Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), [a, b, w]);
for (const t of tiles.values()) {
  for (const b of t.b) addB(b.p);
  for (const r of t.r)
    for (let i = 0; i < r.p.length - 1; i++) addS(r.p[i], r.p[i + 1], (RW[r.t.replace('_link', '')] || 4) / 2);
}
for (const b of core0.buildings) if (b.pts || b.p) addB(b.pts || b.p);
for (const r of core0.roads)
  for (let i = 0; i < r.p.length - 1; i++) addS(r.p[i], r.p[i + 1], (RW[r.t.replace('_link', '')] || 4) / 2);
/** a segment that is already drawn: its middle lies on a road that runs the same way */
const haveSeg = (a, b) => {
  const mx = (a[0] + b[0]) / 2,
    mz = (a[1] + b[1]) / 2;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  for (const [p, q] of gnear(segG, mx, mz)) {
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    if (Math.abs(((b[0] - a[0]) * (q[0] - p[0]) + (b[1] - a[1]) * (q[1] - p[1])) / (L * l)) < 0.9) continue;
    if (segDist(mx, mz, p, q) < 1.5) return true;
  }
  return false;
};
const cityWays = new Set();
if (cityFile)
  for (const e of JSON.parse(fs.readFileSync(cityFile, 'utf8')).elements)
    for (const m of e.members || []) if (m.type === 'way') cityWays.add(m.ref);

// ---------------------------------------------------------------- the new districts
const oldRings = ix.boundary.slice();
const eq = (a, b) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
/** ways (lists of points) joined end to end into rings; what does not close is returned open */
const joinWays = ws => {
  ws = ws.slice();
  const out = [];
  while (ws.length) {
    let ring = ws.shift();
    for (let grow = true; grow && !eq(ring[0], ring[ring.length - 1]);) {
      grow = false;
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i],
          end = ring[ring.length - 1];
        if (eq(w[0], end)) ring = ring.concat(w.slice(1));
        else if (eq(w[w.length - 1], end)) ring = ring.concat(w.slice(0, -1).reverse());
        else continue;
        ws.splice(i, 1);
        grow = true;
        break;
      }
    }
    out.push(ring);
  }
  return out;
};
/** Sutherland–Hodgman against the four sides of a box */
const clipBox = (poly, box) => {
  const sides = [
    [q => q[0] >= box[0], (a, b) => [box[0], a[1] + ((b[1] - a[1]) * (box[0] - a[0])) / (b[0] - a[0])]],
    [q => q[0] <= box[2], (a, b) => [box[2], a[1] + ((b[1] - a[1]) * (box[2] - a[0])) / (b[0] - a[0])]],
    [q => q[1] >= box[1], (a, b) => [a[0] + ((b[0] - a[0]) * (box[1] - a[1])) / (b[1] - a[1]), box[1]]],
    [q => q[1] <= box[3], (a, b) => [a[0] + ((b[0] - a[0]) * (box[3] - a[1])) / (b[1] - a[1]), box[3]]],
  ];
  for (const [inside, cut] of sides) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) out.push(cut(a, b));
    }
    poly = out;
    if (poly.length < 3) return [];
  }
  return poly.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
};
const boxOf = (pts, box = [1e9, 1e9, -1e9, -1e9]) => {
  for (const q of pts)
    box = [Math.min(box[0], q[0]), Math.min(box[1], q[1]), Math.max(box[2], q[0]), Math.max(box[3], q[1])];
  return box;
};
/** the districts of this run, before anything is made of them: their rings (the woods and the rivers are cut to them) */
const coming = [];
for (const file of args) {
  const rel = JSON.parse(fs.readFileSync(file, 'utf8')).elements.find(
    e => e.type === 'relation' && e.tags?.boundary === 'administrative',
  );
  if (ix.districts.includes(rel.tags.name)) continue;
  for (const ring of joinWays(rel.members.filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry.map(P))))
    if (ring.length > 10) coming.push(ring);
}
/** rings of the big water added in this run: their banks become walls at the end */
const rivers = [];
if (waterFile && coming.length) {
  // the part of them that lies over the districts (a river goes on for kilometres either way). The box grows with
  // every run; what was cut to the smaller box of an earlier run is taken out and cut again.
  // (the first such run, v24.34, did not write its box down: it was the box of 大安區 and 中山區)
  const before =
    ix.rbox ||
    (() => {
      const b = boxOf([...ix.boundary[3], ...ix.boundary[4]]);
      return [b[0] - 120, b[1] - 120, b[2] + 120, b[3] + 120];
    })();
  let box = boxOf(coming.flat());
  box = [
    Math.min(before[0], box[0] - 120),
    Math.min(before[1], box[1] - 120),
    Math.max(before[2], box[2] + 120),
    Math.max(before[3], box[3] + 120),
  ];
  ix.rbox = box.map(Math.round);
  const same = (o, c) => Math.hypot(cen(o)[0] - cen(c)[0], cen(o)[1] - cen(c)[1]) < 2;
  let recut = 0;
  for (const e of JSON.parse(fs.readFileSync(waterFile, 'utf8')).elements) {
    if (e.type !== 'relation' || !(e.tags?.natural === 'water' || e.tags?.waterway === 'riverbank')) continue;
    for (let ring of joinWays(e.members.filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry.map(P)))) {
      if (ring.length < 4) continue;
      if (eq(ring[0], ring[ring.length - 1])) ring = ring.slice(0, -1);
      const sr = simpR(ring, 2);
      const c = clipBox(sr, box);
      if (c.length < 4) continue;
      if (!ix.water.some(o => same(o, c))) {
        const old = clipBox(sr, before);
        const i = old.length < 4 ? -1 : ix.water.findIndex(o => same(o, old));
        if (i >= 0) (ix.water.splice(i, 1), recut++);
        ix.water.push(c);
      }
      if (polyArea(c) > 20000) rivers.push(c);
    }
  }
  ix.banks = []; // (all of them are made again at the end, from the rivers as they are now)
  console.log(
    'water from relations:',
    rivers.length,
    'river(s)',
    rivers.map(r => Math.round(polyArea(r))),
    'cut again:',
    recut,
  );
}
// ---- woodland: what touches a district (one already in the map, or one of this run), cut to the box of them all
if (woodFile) {
  ix.wood ||= [];
  const all = [...ix.boundary, ...coming];
  const b0 = boxOf(all.flat());
  const box = [b0[0] - 40, b0[1] - 40, b0[2] + 40, b0[3] + 40];
  const touches = p => p.some(q => all.some(r => pip(q, r))) || all.some(r => r.some(q => pip(q, p)));
  let n = 0,
    m2 = 0;
  for (const e of JSON.parse(fs.readFileSync(woodFile, 'utf8')).elements) {
    const t = e.tags || {};
    if (!(t.natural === 'wood' || t.landuse === 'forest')) continue;
    const ws =
      e.type === 'relation'
        ? e.members.filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry.map(P))
        : e.geometry
          ? [e.geometry.map(P)]
          : [];
    for (let ring of joinWays(ws)) {
      if (ring.length < 4 || !eq(ring[0], ring[ring.length - 1])) continue;
      ring = ring.slice(0, -1);
      if (polyArea(ring) < 400) continue; // (a clump of trees: the parks and the lots have those already)
      const c = clipBox(simpR(ring, 4), box);
      if (c.length < 4 || polyArea(c) < 400 || !touches(c)) continue;
      const cc = cen(c);
      if (ix.wood.some(o => Math.hypot(cen(o)[0] - cc[0], cen(o)[1] - cc[1]) < 2)) continue; // already there
      ix.wood.push(c.map(q => [Math.round(q[0]), Math.round(q[1])]));
      n++;
      m2 += polyArea(c);
    }
  }
  console.log('woodland:', n, 'polygons,', Math.round(m2 / 1e4) / 100, 'km² (with what lies outside the districts)');
}
const newRoads = []; // { t, n, p, b }: the kept runs of each way (for road detail and the paper map)
const report = [];
for (const file of args) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rel = raw.elements.find(e => e.type === 'relation' && e.tags?.boundary === 'administrative');
  const name = rel.tags.name;
  if (ix.districts.includes(name)) {
    console.log(name, 'is already in the map: skipped');
    continue;
  }
  // ---- its boundary: rings, and which of their edges are the edge of the city (here: the river)
  const rings = [],
    cityLines = [];
  {
    const ws = rel.members.filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry.map(P));
    for (const m of rel.members)
      if (m.role === 'outer' && m.geometry && cityWays.has(m.ref)) cityLines.push(m.geometry.map(P));
    const eq = (a, b) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
    while (ws.length) {
      let ring = ws.shift();
      for (let grow = true; grow && !eq(ring[0], ring[ring.length - 1]);) {
        grow = false;
        for (let i = 0; i < ws.length; i++) {
          const w = ws[i],
            end = ring[ring.length - 1];
          if (eq(w[0], end)) ring = ring.concat(w.slice(1));
          else if (eq(w[w.length - 1], end)) ring = ring.concat(w.slice(0, -1).reverse());
          else continue;
          ws.splice(i, 1);
          grow = true;
          break;
        }
      }
      if (ring.length > 10) {
        const h = ring.length >> 1;
        rings.push([...simp(ring.slice(0, h + 1), 4).slice(0, -1), ...simp(ring.slice(h), 4)]);
      }
    }
  }
  const inNew = (x, z) => rings.some(r => pip([x, z], r));
  const inOld = (x, z) => oldRings.some(r => pip([x, z], r));
  const st = { name, buildings: 0, dupB: 0, inside: 0, over: 0, thin: 0, round: 0, roads: 0, generated: 0, river: 0 };
  // an airfield: the outline of the aerodrome, what is paved (polygons, and lines with a width), and its lawns
  const air = { ring: null, aprons: [], lines: [] };
  const grass = [];
  const myRoads = [];
  const water = [],
    park = [],
    landuse = [];
  // footprints are gathered first and taken largest first, so that of two that overlap the larger is the one kept
  const cands = [];
  const footprint = (p, t) => {
    if (p.length < 4) return;
    const pp = p.slice(0, -1);
    cands.push({ p: pp, t, a: polyArea(pp) });
  };
  const take = ({ p: pp, t, a }) => {
    const c = cen(pp);
    if (inCore(c[0], c[1]) || inOld(c[0], c[1])) return; // the core and 萬華 have their own
    if (gnear(cG, c[0], c[1]).some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) < 3)) return void st.dupB++;
    // the same building drawn twice, a part of a building drawn over it, a kiosk inside a hall: one footprint only
    if ((bG.get(Math.floor(c[0] / G) + ',' + Math.floor(c[1] / G)) || []).some(o => pip(c, o))) return void st.inside++;
    // a row of houses drawn twice a few metres apart: the two footprints lie half over each other, neither has its
    // middle in the other, and the one behind has no wall left for a door. The larger was taken first; this one goes.
    {
      const xs = pp.map(q => q[0]),
        zs = pp.map(q => q[1]);
      const step = Math.max(1.5, Math.sqrt(a) / 8);
      let mine = 0,
        over = 0;
      for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
        for (let z = Math.min(...zs) + step / 2; z < Math.max(...zs); z += step) {
          if (!pip([x, z], pp)) continue;
          mine++;
          if ((bG.get(Math.floor(x / G) + ',' + Math.floor(z / G)) || []).some(o => pip([x, z], o))) over++;
        }
      if (mine >= 6 && over > mine * 0.4) return void st.over++;
    }
    // a wall mapped as a building (long, and too thin to stand in) is not one
    {
      let li = 0,
        L = 0;
      pp.forEach((q, i) => {
        const n = pp[(i + 1) % pp.length];
        const l = Math.hypot(n[0] - q[0], n[1] - q[1]);
        if (l > L) ((L = l), (li = i));
      });
      const q = pp[li],
        n = pp[(li + 1) % pp.length];
      const ux = (n[0] - q[0]) / (L || 1),
        uz = (n[1] - q[1]) / (L || 1);
      const off = pp.map(v => (v[0] - q[0]) * -uz + (v[1] - q[1]) * ux);
      const along = pp.map(v => (v[0] - q[0]) * ux + (v[1] - q[1]) * uz);
      const wd = Math.max(...off) - Math.min(...off),
        ln = Math.max(...along) - Math.min(...along);
      if (wd < 1.6 && ln > 6) return void st.thin++;
      // a round tower or pavilion, drawn with sides shorter than a door: the same ground as an octagon (or a
      // square, when it is small), so that one of its sides can take a door
      if (L < 1.7) {
        st.round++;
        if (a >= 14) {
          const R = Math.sqrt(a / 2.8284);
          pp = Array.from({ length: 8 }, (_, k) => [
            Math.round((c[0] + Math.cos((k + 0.5) * 0.7854) * R) * 10) / 10,
            Math.round((c[1] + Math.sin((k + 0.5) * 0.7854) * R) * 10) / 10,
          ]);
        } else {
          const h = Math.max(1.2, Math.sqrt(a) / 2);
          pp = [
            [-h, -h],
            [h, -h],
            [h, h],
            [-h, h],
          ].map(([x, z]) => [Math.round((c[0] + x) * 10) / 10, Math.round((c[1] + z) * 10) / 10]);
        }
      }
    }
    const lv = +t['building:levels'] || Math.round((parseFloat(t.height) || 0) / 3.3) || 0;
    tile(tk(c[0], c[1])).b.push({
      p: pp,
      l: lv,
      n: t.name || undefined,
      k: t.building !== 'yes' ? t.building : undefined,
      s: t.shop || t.amenity || undefined,
    });
    addB(pp);
    st.buildings++;
  };
  for (const e of raw.elements) {
    const t = e.tags || {};
    if (e.type === 'relation') {
      if (t.boundary) continue;
      if (t.aeroway === 'aerodrome') {
        const rs = joinWays(e.members.filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry.map(P)))
          .filter(r => r.length > 3 && eq(r[0], r[r.length - 1]))
          .sort((x, y) => polyArea(y) - polyArea(x));
        if (rs.length) air.ring = simpR(rs[0].slice(0, -1), 2);
        continue;
      }
      // multipolygons: the outer rings of a building with a courtyard, or of a park
      for (const m of e.members || []) {
        if (m.role !== 'outer' || !m.geometry || m.geometry.length < 4) continue;
        const p = m.geometry.map(P);
        if (Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) > 0.5) continue; // not closed
        if (t.building) footprint(p, t);
        else if (t.leisure === 'park') park.push({ n: t.name || undefined, p: simpR(p, 2) });
      }
      continue;
    }
    if (!e.geometry) continue;
    const p = e.geometry.map(P);
    const name = t.name || '';
    if (t.building) footprint(p, t);
    else if (t.aeroway) {
      const closed = p.length > 3 && eq(p[0], p[p.length - 1]);
      if (/^(apron|helipad)$/.test(t.aeroway) && closed) {
        if (polyArea(p) > 150) air.aprons.push(simpR(p.slice(0, -1), 1));
      } else if (/^(runway|stopway|taxiway)$/.test(t.aeroway) && !closed && p.length > 1)
        air.lines.push({ k: t.aeroway, w: +t.width || (t.aeroway === 'taxiway' ? (t.ref ? 23 : 18) : 45), p });
    } else if (t.highway) {
      if (/^(motorway|motorway_link|construction|proposed|platform|corridor|elevator|bus_stop)$/.test(t.highway))
        continue;
      if (t.tunnel === 'yes' || t.layer < 0) continue;
      // keep the stretches that are not drawn yet: outside the core, outside 萬華, not already in a tile
      let run = null;
      const flush = () => {
        if (run && run.p.length > 1) myRoads.push(run);
        run = null;
      };
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i],
          b = p[i + 1];
        const mx = (a[0] + b[0]) / 2,
          mz = (a[1] + b[1]) / 2;
        if (inCore(mx, mz) || inOld(mx, mz) || haveSeg(a, b)) {
          flush();
          continue;
        }
        (run ||= { t: t.highway, n: name || undefined, b: t.bridge ? 1 : undefined, p: [a] }).p.push(b);
      }
      flush();
    } else if (t.railway) {
      if (t.tunnel !== 'yes' && /^(rail|light_rail)$/.test(t.railway)) ix.rail.push(simp(p, 3));
    } else if (t.natural === 'water' || t.waterway === 'riverbank' || t.water) water.push(simpR(p, 3));
    else if (t.landuse === 'grass') {
      // (a strip of lawn smaller than a parking space is not worth an entry that every tile looks at)
      if (polyArea(p) >= 60) grass.push({ n: name || undefined, p: simpR(p, 2) });
    } else if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'pitch')
      park.push({ n: name || undefined, p: simpR(p, 2) });
    else if (t.landuse) landuse.push({ t: t.landuse, p: simpR(p, 3) });
  }
  cands.sort((x, y) => y.a - x.a);
  for (const cand of cands) take(cand);
  // open ground that is already in the index (a park on the old boundary) is not added twice
  const fresh = (list, q) => {
    const c = cen(q);
    return !list.some(o => {
      const d = cen(o.p || o);
      return Math.hypot(d[0] - c[0], d[1] - c[1]) < 2;
    });
  };
  for (const w of water) if (w.length > 3 && fresh(ix.water, w)) ix.water.push(w);
  // (a park or a lawn whose middle is outside every district belongs to the neighbour: an airfield's grass, say)
  const mine = q => {
    const c = cen(q);
    return inNew(c[0], c[1]) || inOld(c[0], c[1]);
  };
  // ---- the airfield. Lawn inside the aerodrome is lawn (no trees on an airfield); the rest of the grass is park.
  const lawn = [];
  for (const q of grass) {
    const c = cen(q.p);
    if (air.ring && pip(c, air.ring)) lawn.push(q.p);
    else park.push(q);
  }
  if (air.ring) {
    /** a line with a width, as a polygon (the line may bend: the corners are mitred by the mean of the two normals) */
    const strip = (p, w, off = 0) => {
      const L = [],
        R = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[Math.max(0, i - 1)],
          b = p[Math.min(p.length - 1, i + 1)];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = -(b[1] - a[1]) / l,
          nz = (b[0] - a[0]) / l;
        L.push([p[i][0] + nx * (off + w / 2), p[i][1] + nz * (off + w / 2)]);
        R.push([p[i][0] + nx * (off - w / 2), p[i][1] + nz * (off - w / 2)]);
      }
      return [...L, ...R.reverse()].map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
    };
    /** the stretch of a line from s to e metres along it */
    const part = (p, s, e) => {
      const out = [];
      let d = 0;
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i],
          b = p[i + 1],
          l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const at = t => [a[0] + ((b[0] - a[0]) * (t - d)) / l, a[1] + ((b[1] - a[1]) * (t - d)) / l];
        if (l > 0 && e > d && s < d + l) {
          if (!out.length) out.push(at(Math.max(s, d)));
          out.push(at(Math.min(e, d + l)));
        }
        d += l;
      }
      return out;
    };
    const len = p => p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0);
    const paved = [...air.aprons],
      marks = [];
    for (const l of air.lines) {
      const p = simp(l.p, 0.5);
      paved.push(strip(p, l.w));
      if (l.k !== 'runway') continue;
      const L = len(p);
      // the paint of a runway: edge lines, the dashed centre line, the bars of each threshold, the aiming points
      for (const sd of [1, -1]) marks.push(strip(p, 0.9, sd * (l.w / 2 - 2)));
      for (let d = 90; d + 30 < L - 90; d += 60) marks.push(strip(part(p, d, d + 30), 0.9));
      for (const [s, e] of [
        [6, 36],
        [L - 36, L - 6],
      ])
        for (let k = 0; k < 12; k++)
          marks.push(strip(part(p, s, e), 1.8, (k - 5.5) * (l.w / 14) + (k < 6 ? -1.5 : 1.5)));
      for (const d of [300, L - 345]) for (const sd of [1, -1]) marks.push(strip(part(p, d, d + 45), 6, sd * 9));
    }
    ix.air ||= { ring: [], paved: [], lawn: [], marks: [] };
    ix.air.ring.push(air.ring);
    ix.air.paved.push(...paved);
    ix.air.lawn.push(...lawn);
    ix.air.marks.push(...marks);
    st.air = { paved: paved.length, lawn: lawn.length, marks: marks.length, m2: Math.round(polyArea(air.ring)) };
  }
  for (const q of park) if (q.p.length > 3 && mine(q.p) && fresh(ix.park, q.p)) ix.park.push(q);
  // (the land-use polygons are read by the core's block infill only, which never looks this far out: they are used
  // below to keep generated flats off graves, barracks and fields, and are not written to the index any more)
  // ---- roads into tiles (runs split by the tile of each segment's middle, as district.mjs does)
  for (const r of myRoads) {
    let run = null,
      rk = null;
    for (let i = 0; i < r.p.length - 1; i++) {
      const k = tk((r.p[i][0] + r.p[i + 1][0]) / 2, (r.p[i][1] + r.p[i + 1][1]) / 2);
      if (k !== rk) {
        if (run) tile(rk).r.push(run);
        run = { t: r.t, p: [r.p[i]], n: r.n, b: r.b };
        rk = k;
      }
      run.p.push(r.p[i + 1]);
    }
    if (run) (tile(rk).r.push(run), st.roads++);
  }
  // (only now do the new roads count as drawn: a way is never taken for a copy of itself)
  for (const r of myRoads)
    for (let i = 0; i < r.p.length - 1; i++) addS(r.p[i], r.p[i + 1], (RW[r.t.replace('_link', '')] || 4) / 2);
  newRoads.push(...myRoads);
  // ---- the river: the edges of the district that are the edge of the city. The boundary runs down the middle of
  // the water; its half-width on the land side is held back so it never covers a mapped building or road.
  const river = [];
  {
    const feats = [];
    for (const t of tiles.values()) {
      for (const b of t.b) for (const q of b.p) if (inNew(q[0], q[1])) feats.push(q);
      for (const r of t.r)
        if (!r.b && !/^(footway|path|steps|cycleway|motorway)/.test(r.t))
          for (const q of r.p) if (inNew(q[0], q[1])) feats.push(q);
    }
    for (const b of rings)
      for (let i = 0; i < b.length; i++) {
        const a = b[i],
          c = b[(i + 1) % b.length];
        const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (L < 1) continue;
        const mx = (a[0] + c[0]) / 2,
          mz = (a[1] + c[1]) / 2;
        if (!cityLines.some(l => l.some((q, j) => j && segDist(mx, mz, l[j - 1], q) < 8))) continue;
        let nx = (c[1] - a[1]) / L,
          nz = -(c[0] - a[0]) / L; // outward
        if (pip([mx + nx * 3, mz + nz * 3], b)) ((nx = -nx), (nz = -nz));
        let w = 150;
        const dx = c[0] - a[0],
          dz = c[1] - a[1];
        for (const q of feats) {
          const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / (L * L)));
          const d = Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dz * t);
          if (d < w + 15) w = Math.max(20, d - 15);
        }
        river.push([a[0], a[1], c[0], c[1], Math.round(w), Math.round(-nx * 100) / 100, Math.round(-nz * 100) / 100]);
      }
    ix.river.push(...river);
    st.river = river.length;
  }
  const nearRiver = (x, z) => ix.river.some(([ax, az, bx, bz, w]) => segDist(x, z, [ax, az], [bx, bz]) < w + 8);
  // ---- infill: OSM maps only part of the buildings, so empty road frontage gets walk-up footprints
  // (deterministic, flagged g:1), exactly as district.mjs does for 萬華, from this district's own stream
  {
    // (with their boxes: there are a thousand of them and tens of thousands of places to try)
    const blockers = [
      ...ix.water,
      ...ix.park.map(q => q.p),
      ...(ix.wood || []),
      ...(ix.air?.ring || []),
      ...landuse
        .filter(q => /^(military|cemetery|farmland|allotments|forest|railway|recreation_ground)$/.test(q.t))
        .map(q => q.p),
    ].map(p => {
      const xs = p.map(q => q[0]),
        zs = p.map(q => q[1]);
      return { p, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    });
    const clear = (x, z, r) => {
      for (const [a, b, w] of gnear(segG, x, z)) if (segDist(x, z, a, b) < w + r) return false;
      for (const p of bG.get(Math.floor(x / G) + ',' + Math.floor(z / G)) || []) if (pip([x, z], p)) return false;
      return true;
    };
    let rs = 1;
    for (const ch of name) rs = (rs * 31 + ch.codePointAt(0)) % 2147483647;
    const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
    for (const r of myRoads) {
      if (!/^(residential|tertiary|secondary|unclassified|living_street|primary)$/.test(r.t) || r.b) continue;
      const w = RW[r.t] / 2;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [a, b] = [r.p[i], r.p[i + 1]];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 10) continue;
        const ux = (b[0] - a[0]) / L,
          uz = (b[1] - a[1]) / L;
        for (const sd of [1, -1]) {
          const nx = -uz * sd,
            nz = ux * sd;
          for (let s = 5; s + 5 < L; s += 9 + Math.floor(rnd() * 3)) {
            const wd = 7 + rnd() * 3,
              dp = 9 + rnd() * 6,
              off = w + 1.6;
            const cx = a[0] + ux * s + nx * (off + dp / 2),
              cz = a[1] + uz * s + nz * (off + dp / 2);
            if (inCore(cx, cz) || inOld(cx, cz) || !inNew(cx, cz)) continue;
            if (blockers.some(b => cx > b.x0 && cx < b.x1 && cz > b.z0 && cz < b.z1 && pip([cx, cz], b.p))) continue;
            if (nearRiver(cx, cz)) continue;
            const cs = [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ].map(([i, j]) => [cx + ux * (wd / 2) * i + nx * (dp / 2) * j, cz + uz * (wd / 2) * i + nz * (dp / 2) * j]);
            if (!clear(cx, cz, 1) || !cs.every(q => clear(q[0], q[1], 0.3))) continue;
            if (gnear(cG, cx, cz).some(q => pip(q, cs))) continue; // (it would stand over a small building)
            const pp = cs.map(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
            tile(tk(cx, cz)).b.push({ p: pp, l: 3 + Math.floor(rnd() * 3), g: 1 });
            addB(pp);
            st.generated++;
          }
        }
      }
    }
  }
  ix.boundary.push(...rings);
  oldRings.push(...rings);
  ix.districts.push(name);
  ix.generated += st.generated;
  report.push(st);
}

// ---------------------------------------------------------------- write the district tiles, the index, the paper map
let wrote = 0,
  grew = 0;
for (const [k, t] of tiles) {
  if (t.b.length === t.nb0 && t.r.length === t.nr0) continue;
  t.nb0 || t.nr0 ? grew++ : wrote++;
  fs.writeFileSync(`${DD}/${k}.json`, JSON.stringify({ b: t.b, r: t.r }));
  ix.tiles[k] = [t.b.length, t.r.length];
}
let mx = [1e9, 1e9, -1e9, -1e9];
for (const r of ix.boundary)
  for (const [x, z] of r) mx = [Math.min(mx[0], x), Math.min(mx[1], z), Math.max(mx[2], x), Math.max(mx[3], z)];
ix.bbox = mx.map(Math.round);
for (const t of tiles.values()) for (const b of t.b.slice(t.nb0)) paper.b.push(b.p.flat().map(Math.round));
for (const r of newRoads)
  if (/^(trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)/.test(r.t))
    paper.r.push({
      t: r.t.replace('_link', ''),
      n: r.n,
      p: simp(r.p, 2).map(q => [Math.round(q[0]), Math.round(q[1])]),
    });
fs.writeFileSync(`${DD}/map.json`, JSON.stringify(paper));
// the banks of the rivers added in this run: walls along the water, open where a bridge crosses
if (rivers.length) {
  const bridges = [];
  for (const t of tiles.values())
    for (const r of t.r)
      if (r.b)
        for (let i = 0; i < r.p.length - 1; i++)
          bridges.push([r.p[i], r.p[i + 1], (RW[r.t.replace('_link', '')] || 4) / 2]);
  const BG2 = new Map();
  for (const b of bridges)
    gput(
      BG2,
      Math.min(b[0][0], b[1][0]) - 12,
      Math.min(b[0][1], b[1][1]) - 12,
      Math.max(b[0][0], b[1][0]) + 12,
      Math.max(b[0][1], b[1][1]) + 12,
      b,
    );
  const under = (x, z) =>
    (BG2.get(Math.floor(x / G) + ',' + Math.floor(z / G)) || []).some(([a, b, w]) => segDist(x, z, a, b) < w + 2.5);
  const inAny = (x, z) => ix.boundary.some(r => pip([x, z], r));
  ix.banks ||= [];
  let nb = 0;
  for (const ring of rivers)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.5) continue;
      const n = Math.max(1, Math.ceil(L / 2));
      let run = null;
      for (let k = 0; k <= n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n,
          z = a[1] + ((b[1] - a[1]) * k) / n;
        const wall = !under(x, z) && inAny(x, z);
        if (wall) ((run ||= [x, z, x, z]), ((run[2] = x), (run[3] = z)));
        if ((!wall || k === n) && run) {
          if (Math.hypot(run[2] - run[0], run[3] - run[1]) > 0.5)
            (ix.banks.push(run.map(v => Math.round(v * 10) / 10)), nb++);
          run = null;
        }
      }
    }
  console.log('bank walls:', nb, 'bridge segments:', bridges.length);
}
fs.writeFileSync(`${DD}/index.json`, JSON.stringify(ix));

// ---------------------------------------------------------------- road detail (as scripts/tiles.mjs), new roads only
const W = RW;
const CL = {
  trunk: 'main',
  primary: 'main',
  secondary: 'main',
  tertiary: 'street',
  residential: 'lane',
  unclassified: 'lane',
  living_street: 'alley',
  service: 'alley',
  pedestrian: 'ped',
  footway: 'foot',
  path: 'foot',
  steps: 'foot',
  cycleway: 'foot',
};
const rix = JSON.parse(fs.readFileSync(`${RD}/index.json`, 'utf8'));
const rt = new Map();
for (const k of rix.tiles) {
  const t = JSON.parse(fs.readFileSync(`${RD}/${k}.json`, 'utf8'));
  t.clip ||= [];
  rt.set(k, { ...t, n0: [t.segs.length, t.nodes.length, t.clip.length] });
}
const rtile = k => {
  if (!rt.has(k)) {
    const [tx, tz] = k.split('_').map(Number);
    rt.set(k, {
      tx,
      tz,
      seed: ((tx * 73856093) ^ (tz * 19349663)) >>> 0,
      segs: [],
      nodes: [],
      clip: [],
      n0: [0, 0, 0],
    });
  }
  return rt.get(k);
};
// road numbers go on from the highest one in use (a second run must not hand out the numbers of the first)
let riBase = 200000;
for (const t of rt.values()) for (const g of t.segs) if (g[6] >= riBase) riBase = g[6] + 1;
const S = [];
newRoads.forEach((r, i) => {
  const ri = riBase + i;
  const t = r.t.replace('_link', '');
  const w = W[t] ?? 3,
    c = CL[t] ?? 'foot';
  for (let j = 0; j < r.p.length - 1; j++) {
    const [ax, az] = r.p[j],
      [bx, bz] = r.p[j + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.5) continue;
    S.push({ ax, az, bx, bz, L, ux: (bx - ax) / L, uz: (bz - az) / L, w, c, ri, n: r.n || '', f: 0 });
  }
});
// overlapping ways (dual carriageways, links, duplicates), looked up through a grid: the district is too big for all pairs
const M = S.filter(s => s.c === 'main' || s.c === 'street').sort((a, b) => b.w - a.w || b.L - a.L);
M.forEach((s, i) => (s.i = i));
const MG = new Map();
const HG = 60;
for (const s of M)
  for (let x = Math.floor(Math.min(s.ax, s.bx) / HG) - 1; x <= Math.floor(Math.max(s.ax, s.bx) / HG) + 1; x++)
    for (let z = Math.floor(Math.min(s.az, s.bz) / HG) - 1; z <= Math.floor(Math.max(s.az, s.bz) / HG) + 1; z++)
      (MG.get(x + ',' + z) || MG.set(x + ',' + z, []).get(x + ',' + z)).push(s);
let dual = 0,
  dup = 0;
for (const s of M) {
  if (s.f === 2) continue;
  const mx = (s.ax + s.bx) / 2,
    mz = (s.az + s.bz) / 2;
  const near = (MG.get(Math.floor(mx / HG) + ',' + Math.floor(mz / HG)) || []).slice().sort((a, b) => a.i - b.i);
  for (const o of near) {
    if (o === s || o.ri === s.ri || o.f === 2) continue;
    if (Math.abs(s.ux * o.ux + s.uz * o.uz) < 0.94) continue;
    const rx = mx - o.ax,
      rz = mz - o.az,
      t = rx * o.ux + rz * o.uz;
    if (t < -2 || t > o.L + 2) continue;
    const lat = rx * -o.uz + rz * o.ux;
    const al = Math.abs(lat);
    if (al > ((s.w + o.w) / 2) * 0.95) continue;
    if (al < Math.max(2.5, Math.min(s.w, o.w) * 0.35) && o.i < s.i) {
      s.f = 2;
      dup++;
      break;
    }
    if (al >= Math.max(2.5, Math.min(s.w, o.w) * 0.35)) {
      const side = Math.sign(lat * (s.ux * o.ux + s.uz * o.uz)) || 1;
      if (!s.f) {
        s.f = side > 0 ? 3 : 4;
        s.ow = Math.min(s.w, al * 2);
        dual++;
      }
    }
  }
}
S.forEach(s =>
  rtile(tk((s.ax + s.bx) / 2, (s.az + s.bz) / 2)).segs.push([
    +s.ax.toFixed(2),
    +s.az.toFixed(2),
    +s.bx.toFixed(2),
    +s.bz.toFixed(2),
    s.w,
    s.c,
    s.ri,
    s.n,
    s.f,
    +(s.ow || s.w).toFixed(1),
  ]),
);
// junctions of vehicle roads. The roads that were already there take part (a new side street meets an old avenue
// on the boundary), but a junction that the old tiles already have is not made twice.
const q = p => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
const nodes = new Map();
const arm = (p, o, w, ri, fresh) => {
  const k = q(p);
  const n = nodes.get(k) || { x: p[0], z: p[1], arms: [], w: 0, fresh: false };
  n.w = Math.max(n.w, w);
  n.fresh ||= fresh;
  const dx = o[0] - p[0],
    dz = o[1] - p[1],
    L = Math.hypot(dx, dz);
  if (L > 0.5) n.arms.push([dx / L, dz / L, w, ri]);
  nodes.set(k, n);
};
newRoads.forEach((r, i) => {
  const t = r.t.replace('_link', '');
  const w = W[t] ?? 3;
  if ((CL[t] ?? 'foot') === 'foot' || CL[t] === 'ped' || w < 4) return;
  for (let j = 0; j < r.p.length - 1; j++) {
    arm(r.p[j], r.p[j + 1], w, riBase + i, true);
    arm(r.p[j + 1], r.p[j], w, riBase + i, true);
  }
});
const oldNodes = [];
for (const t of rt.values()) {
  for (const n of t.nodes.slice(0, t.n0[1])) oldNodes.push(n);
  for (const s of t.segs.slice(0, t.n0[0])) {
    if (s[5] === 'foot' || s[5] === 'ped' || s[4] < 4) continue;
    arm([s[0], s[1]], [s[2], s[3]], s[4], s[6], false);
    arm([s[2], s[3]], [s[0], s[1]], s[4], s[6], false);
  }
}
const J = [...nodes.values()].filter(
  n => (n.arms.length >= 3 || new Set(n.arms.map(a => a[3])).size >= 2) && new Set(n.arms.map(a => a[3])).size >= 2,
);
const JG = new Map();
const JH = 40;
for (const n of J) {
  const k = Math.floor(n.x / JH) + ',' + Math.floor(n.z / JH);
  (JG.get(k) || JG.set(k, []).get(k)).push(n);
}
const used = new Set();
let clusters = 0;
for (const n of J.sort((a, b) => b.w - a.w)) {
  if (used.has(n)) continue;
  const C = [n];
  used.add(n);
  for (let k = 0; k < C.length; k++)
    for (let gx = -1; gx <= 1; gx++)
      for (let gz = -1; gz <= 1; gz++)
        for (const m of JG.get(Math.floor(C[k].x / JH) + gx + ',' + (Math.floor(C[k].z / JH) + gz)) || [])
          if (!used.has(m) && Math.hypot(m.x - C[k].x, m.z - C[k].z) < Math.max(C[k].w, m.w) * 0.9 + 2) {
            used.add(m);
            C.push(m);
          }
  if (!C.some(c => c.fresh)) continue; // an old junction, untouched
  const x = C.reduce((a, c) => a + c.x, 0) / C.length,
    z = C.reduce((a, c) => a + c.z, 0) / C.length;
  const rad = Math.max(...C.map(c => Math.hypot(c.x - x, c.z - z) + c.w / 2));
  if (oldNodes.some(o => Math.hypot(o[0] - x, o[1] - z) < Math.max(o[4] || 0, rad) + 2)) continue; // already there
  const w = Math.max(...C.map(c => c.w));
  const arms = [];
  for (const c of C)
    for (const a of c.arms) {
      if (
        C.some(
          o =>
            o !== c &&
            Math.hypot(o.x - c.x, o.z - c.z) > 0.5 &&
            ((o.x - c.x) * a[0] + (o.z - c.z) * a[1]) / Math.hypot(o.x - c.x, o.z - c.z) > 0.97,
        )
      )
        continue;
      const e = arms.find(b => b[0] * a[0] + b[1] * a[1] > 0.86);
      if (e) {
        if (a[2] > e[2]) e[2] = a[2];
        continue;
      }
      arms.push([a[0], a[1], a[2]]);
    }
  clusters++;
  rtile(tk(x, z)).nodes.push([
    +x.toFixed(2),
    +z.toFixed(2),
    +w.toFixed(1),
    arms.map(a => [+a[0].toFixed(3), +a[1].toFixed(3), a[2]]),
    +rad.toFixed(2),
  ]);
  // clip circle (markings stop before the zebra), registered in every tile it can touch
  const R = rad + 6;
  for (let gx = Math.floor((x - R - 30) / T); gx <= Math.floor((x + R + 30) / T); gx++)
    for (let gz = Math.floor((z - R - 30) / T); gz <= Math.floor((z + R + 30) / T); gz++) {
      const kk = gx + '_' + gz;
      if (rt.has(kk) || kk === tk(x, z)) rtile(kk).clip.push([+x.toFixed(2), +z.toFixed(2), +R.toFixed(2)]);
    }
}
let rw = 0,
  rg = 0;
for (const [k, t] of rt) {
  const { n0, ...body } = t;
  if (t.segs.length === n0[0] && t.nodes.length === n0[1] && t.clip.length === n0[2]) continue;
  if (!t.segs.length && !t.nodes.length) continue; // only a clip circle from next door: nothing to draw it on
  n0[0] || n0[1] ? rg++ : rw++;
  fs.writeFileSync(`${RD}/${k}.json`, JSON.stringify(body));
  if (!rix.tiles.includes(k)) rix.tiles.push(k);
}
fs.writeFileSync(`${RD}/index.json`, JSON.stringify(rix));
const size = d => fs.readdirSync(d).reduce((a, f) => a + fs.statSync(`${d}/${f}`).size, 0);
console.log(report);
console.log({
  districtTiles: { new: wrote, grown: grew, total: Object.keys(ix.tiles).length },
  roadTiles: { new: rw, grown: rg, total: rix.tiles.length, segs: S.length, junctions: clusters, dual, dup },
  bbox: ix.bbox,
  kB: { district: Math.round(size(DD) / 1024), roads: Math.round(size(RD) / 1024) },
});
