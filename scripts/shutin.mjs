// Footprints that will have no door in the game, found before the data is written.
//
// The game gives every building a door: on the street, on open ground, through a gap wide enough to squeeze by, and,
// for one that is shut in by its neighbours on every side, through a wall it shares with a neighbour that has a way
// out (src/map/district.ts, v24.28). That last search looks at the buildings of the same tile only. A part of a large
// building drawn as a footprint of its own (a stair tower between two wings of a school), whose neighbours belong to
// the next tile, is left with no door at all: a solid box. scripts/expand.mjs leaves those out.
//
// This is the game's search, on the same numbers (the tiles hold what the game reads), with no random numbers in it
// (v24.37: as the game does it, to the letter). Where the game draws a random number (the place of a door along its
// wall) every place is tried: a footprint is reported only when no door the game could give it would pass the game's
// own tests. So what it reports certainly has no door; it can miss one that the game leaves without (a door into a
// neighbour on every wall the game happens to try): the door survey of a release is still the proof.
// (Near 萬華's core the game also adds the core's footprints to a tile: they are not in the tiles, and not used here.)
// usage: node scripts/shutin.mjs [public/data/district]   lists them for every tile of the map
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// as in src/map/district.ts
const DOOR_W = 1.4,
  ENTER_MIN = 1.2;
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
const pip = (pt, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i],
      [xj, zj] = poly[j];
    if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
};
const areaOf = p => {
  let ar = 0;
  for (let q = 0; q < p.length; q++) ar += p[q][0] * p[(q + 1) % p.length][1] - p[(q + 1) % p.length][0] * p[q][1];
  return Math.abs(ar / 2);
};

/**
 * What the game sees around the buildings of tile `key`: the footprints of it and its neighbours, the roads, and the
 * game's tests on them. `skip` is a footprint (its point list) to take as not there.
 */
function scene(get, key, skip) {
  const td = get(key);
  if (!td) return null;
  const [ktx, ktz] = key.split('_').map(Number);
  const tiles = [-1, 0, 1].flatMap(i => [-1, 0, 1].map(j => get(ktx + i + '_' + (ktz + j))));
  // footprints of this tile and its neighbours, in the order the game has them
  const near = tiles.flatMap(t =>
    (t?.b || [])
      .filter(o => o.p.length >= 3 && o.p !== skip)
      .map(o => {
        const xs = o.p.map(q => q[0]),
          zs = o.p.map(q => q[1]);
        return {
          p: o.p,
          x0: Math.min(...xs),
          x1: Math.max(...xs),
          z0: Math.min(...zs),
          z1: Math.max(...zs),
          ar: areaOf(o.p),
        };
      }),
  );
  // (the footprints by 8 m cells: every place along every wall is tried, and asks this a few hundred times)
  const C = 8,
    cells = new Map();
  for (const o of near)
    for (let x = Math.floor(o.x0 / C); x <= Math.floor(o.x1 / C); x++)
      for (let z = Math.floor(o.z0 / C); z <= Math.floor(o.z1 / C); z++)
        (cells.get(x + ',' + z) || cells.set(x + ',' + z, []).get(x + ',' + z)).push(o);
  const otherAt = (x, z, self) =>
    (cells.get(Math.floor(x / C) + ',' + Math.floor(z / C)) || []).some(
      o => o.p !== self && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && pip([x, z], o.p),
    );
  const partOf = (x, z, self) => {
    const me = near.findIndex(o => o.p === self);
    const mine = me < 0 ? 0 : near[me].ar;
    return near.some(
      (o, k) =>
        o.p !== self &&
        (o.ar > mine || (o.ar === mine && k < me)) &&
        x > o.x0 &&
        x < o.x1 &&
        z > o.z0 &&
        z < o.z1 &&
        pip([x, z], o.p),
    );
  };
  // the roads (the game's roadDist: the ones of the tiles it has fetched; here all nine, so more walls count as a
  // street and more doors are possible)
  const G = 20,
    rgrid = new Map();
  for (const t of tiles)
    for (const r of t?.r || []) {
      const w = (RW[r.t.replace('_link', '')] ?? 3) / 2;
      for (let i = 0; i < r.p.length - 1; i++) {
        const a = r.p[i],
          b = r.p[i + 1];
        for (let x = Math.floor(Math.min(a[0], b[0]) / G); x <= Math.floor(Math.max(a[0], b[0]) / G); x++)
          for (let z = Math.floor(Math.min(a[1], b[1]) / G); z <= Math.floor(Math.max(a[1], b[1]) / G); z++)
            (rgrid.get(x + ',' + z) || rgrid.set(x + ',' + z, []).get(x + ',' + z)).push([a, b, w]);
      }
    }
  const roadDist = (x, z) => {
    let best = 1e9;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const [a, b, w] of rgrid.get(Math.floor(x / G) + i + ',' + (Math.floor(z / G) + j)) || []) {
          const dx = b[0] - a[0],
            dz = b[1] - a[1],
            l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
          best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) - w);
        }
    return best;
  };
  const foot = td.b.map(o => {
    if (o.p.length < 3 || o.p === skip) return null;
    const ar = areaOf(o.p);
    if (ar < 12 || ar > 8000) return null;
    const mx = o.p.reduce((q, v) => q + v[0], 0) / o.p.length,
      mz = o.p.reduce((q, v) => q + v[1], 0) / o.p.length;
    if (partOf(mx, mz, o.p)) return null;
    const xs = o.p.map(q => q[0]),
      zs = o.p.map(q => q[1]);
    return { p: o.p, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  });
  return { td, near, otherAt, roadDist, foot };
}

/** planEnter's walls (district.ts): length, outward normal, street, open ground outside the middle (2, 1 or 0) */
function edgesOf(S, pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      c = pts[(i + 1) % pts.length];
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (L < DOOR_W + 0.2) continue;
    const ux = (c[0] - a[0]) / L,
      uz = (c[1] - a[1]) / L;
    let nx = uz,
      nz = -ux;
    const mx = (a[0] + c[0]) / 2,
      mz = (a[1] + c[1]) / 2;
    if (pip([mx + nx * 0.3, mz + nz * 0.3], pts)) ((nx = -nx), (nz = -nz));
    const free = d => !S.otherAt(mx + nx * d, mz + nz * d, pts);
    const street = S.roadDist(mx + nx * 3, mz + nz * 3) <= 3;
    const open = free(0.8) && free(1.4) ? 2 : free(0.45) && free(0.85) ? 1 : 0;
    out.push({ i, L, ux, uz, nx, nz, mx, mz, street, open });
  }
  return out;
}

/** doorAt (district.ts): does a door on wall `ei`, `t0` along it, pass the game's tests? (`given`: a party door,
 * which skips doorOk) */
function doorOk(S, pts, ei, t0, given) {
  const a = pts[ei],
    c = pts[(ei + 1) % pts.length];
  const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const ux = (c[0] - a[0]) / L,
    uz = (c[1] - a[1]) / L;
  const O = [a[0] + ux * (t0 + DOOR_W / 2), a[1] + uz * (t0 + DOOR_W / 2)];
  let N = [-uz, ux];
  if (!pip([O[0] + N[0] * 0.6, O[1] + N[1] * 0.6], pts)) N = [uz, -ux];
  if (!pip([O[0] + N[0] * 0.6, O[1] + N[1] * 0.6], pts)) return false; // door not inside
  const U = [N[1], -N[0]];
  let umin = 1e9,
    umax = -1e9,
    vmax = -1e9;
  for (const q of pts) {
    const du = (q[0] - O[0]) * U[0] + (q[1] - O[1]) * U[1],
      dv = (q[0] - O[0]) * N[0] + (q[1] - O[1]) * N[1];
    umin = Math.min(umin, du);
    umax = Math.max(umax, du);
    vmax = Math.max(vmax, dv);
  }
  if (umax - umin < ENTER_MIN || vmax < ENTER_MIN) return false; // thin
  if (given) return true;
  // doorOk: not into a neighbour, 0.8 m out and 0.8 m in
  return !S.otherAt(O[0] - N[0] * 0.8, O[1] - N[1] * 0.8, pts) && !S.otherAt(O[0] + N[0] * 0.8, O[1] + N[1] * 0.8, pts);
}

/** could the game give this footprint a door other than through a party wall? Every place the game might pick is
 * tried: the longest street wall (or, without one, the longest wall with room outside), then the walls with room
 * outside, anywhere along them. */
function ownDoor(S, pts) {
  const edges = edgesOf(S, pts);
  let best = null,
    back = null;
  for (const e of edges) {
    if (e.L < 2.4) continue;
    if (e.L >= 3.6 && e.street) {
      if (!best || e.L > best.L) best = e;
      continue;
    }
    if (e.open === 2 && (!back || e.L > back.L)) back = e;
  }
  const tried = [];
  if (best) tried.push([best, 0.7, 0.7 + Math.max(0, best.L - DOOR_W - 1.4)]);
  else if (back) tried.push([back, 0.7, 0.7 + Math.max(0, back.L - DOOR_W - 1.4)]);
  for (const e of edges) {
    const rank = e.street && e.open ? 3 : e.open;
    if (rank <= 0) continue;
    const slack = e.L - DOOR_W;
    tried.push(slack < 1.4 ? [e, slack / 2, slack / 2] : [e, 0.7, slack - 0.7]);
  }
  for (const [e, t0, t1] of tried) {
    const n = Math.max(1, Math.ceil((t1 - t0) / 0.05));
    for (let j = 0; j <= n; j++) if (doorOk(S, pts, e.i, t0 + ((t1 - t0) * j) / n, false)) return true;
  }
  return false;
}

/**
 * the buildings of tile `key` (indices into its `b`) that the game leaves without a door: shut in, with no party wall
 * the game finds (or one it cannot use), and no other door it could give
 * @param {(key: string) => { b: { p: number[][] }[], r: { t: string, p: number[][] }[] } | undefined} get the tiles
 * @param {string} key
 * @param {number[][]} [skip] a footprint to take as not there
 */
export function shutIn(get, key, skip) {
  const S = scene(get, key, skip);
  if (!S) return [];
  const { foot, otherAt } = S;
  const hit = (x, z, self) => {
    for (let k = 0; k < foot.length; k++) {
      const f = foot[k];
      if (f && k !== self && x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && pip([x, z], f.p)) return k;
    }
    return -1;
  };
  const walls = pts => edgesOf(S, pts).map(e => ({ i: e.i, L: e.L, ux: e.ux, uz: e.uz, nx: e.nx, nz: e.nz }));
  // shut in: no wall whose middle has ground free 0.45 m and 0.85 m out (the game's test, district.ts)
  const shut = new Set();
  foot.forEach((f, k) => {
    if (!f) return;
    const open = walls(f.p).some(w => {
      const a = f.p[w.i];
      const mx = a[0] + (w.ux * w.L) / 2,
        mz = a[1] + (w.uz * w.L) / 2;
      return !otherAt(mx + w.nx * 0.45, mz + w.nz * 0.45, f.p) && !otherAt(mx + w.nx * 0.85, mz + w.nz * 0.85, f.p);
    });
    if (!open) shut.add(k);
  });
  const along = (k, d0, d1) =>
    foot[k].p.some((a, i, pts) => {
      const c = pts[(i + 1) % pts.length];
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (L < DOOR_W) return false;
      const ux = (c[0] - a[0]) / L,
        uz = (c[1] - a[1]) / L;
      return [d0, d1].every(q => {
        const t = (q[0] - a[0]) * ux + (q[1] - a[1]) * uz;
        const off = Math.abs((q[0] - a[0]) * uz - (q[1] - a[1]) * ux);
        return off < 0.35 && t > 0.05 && t < L - 0.05;
      });
    });
  // outwards from the buildings that have a way out, a ring at a time
  const party = new Map();
  const shut0 = new Set(shut);
  for (let round = 0; round < 5 && shut.size; round++) {
    const found = [];
    for (const k of shut) {
      const f = foot[k];
      const ws = walls(f.p).sort((a, c) => c.L - a.L);
      search: for (const w of ws) {
        const a = f.p[w.i];
        const slack = w.L - DOOR_W;
        for (const t0 of slack < 0.5 ? [slack / 2] : [slack / 2, 0.2, slack - 0.2, slack * 0.25, slack * 0.75]) {
          const d0 = [a[0] + w.ux * t0, a[1] + w.uz * t0],
            d1 = [a[0] + w.ux * (t0 + DOOR_W), a[1] + w.uz * (t0 + DOOR_W)];
          const ox = (d0[0] + d1[0]) / 2,
            oz = (d0[1] + d1[1]) / 2;
          const B = hit(ox + w.nx * 0.3, oz + w.nz * 0.3, k);
          if (B < 0 || shut.has(B)) continue;
          if (
            hit(d0[0] + w.nx * 0.3, d0[1] + w.nz * 0.3, k) !== B ||
            hit(d1[0] + w.nx * 0.3, d1[1] + w.nz * 0.3, k) !== B
          )
            continue;
          if (hit(ox + w.nx * 0.9, oz + w.nz * 0.9, k) !== B) continue;
          if (!pip([ox - w.nx * 0.6, oz - w.nz * 0.6], f.p) || !along(B, d0, d1)) continue;
          found.push([k, { edge: w.i, t0 }]);
          break search;
        }
      }
    }
    if (!found.length) break;
    for (const [k, d] of found) {
      shut.delete(k);
      party.set(k, d);
    }
  }
  // what the game then does with each of them (planEnter): its own door first, the party door last
  const out = [];
  for (const k of shut0) {
    const pts = foot[k].p;
    if (ownDoor(S, pts)) continue;
    const pd = party.get(k);
    if (pd && doorOk(S, pts, pd.edge, pd.t0, true)) continue;
    out.push(k);
  }
  return out;
}

/**
 * v24.37 would taking footprint `skip` away leave a building of tile `key` with its door into the ground it stood on?
 * That ground is shut in on every side (it is why it is taken away). The wall the game puts a building's door on is
 * the longest wall onto a street, or without one the longest with room outside, or else the first of the walls with
 * room outside (planEnter): when that wall now looks onto that ground, the door would open into a hole nobody can
 * reach. Returns the indices of such buildings. (Only the wall is certain; where along it the door goes is a random
 * number, and the game may still pass it over for a neighbour in the way: the door survey is the proof.)
 */
export function opensOnto(get, key, skip) {
  const S = scene(get, key, skip);
  if (!S) return [];
  const out = [];
  S.foot.forEach((f, k) => {
    if (!f) return;
    const edges = edgesOf(S, f.p);
    let pick = null;
    for (const e of edges) if (e.L >= 3.6 && e.street && (!pick || e.L > pick.L)) pick = e;
    if (!pick) for (const e of edges) if (e.L >= 2.4 && e.open === 2 && (!pick || e.L > pick.L)) pick = e;
    if (!pick) {
      const rank = e => (e.street && e.open ? 3 : e.open);
      pick = edges.filter(e => rank(e) > 0).sort((a, c) => rank(c) - rank(a) || c.L - a.L)[0] ?? null;
    }
    if (pick && pip([pick.mx + pick.nx * 0.85, pick.mz + pick.nz * 0.85], skip)) out.push(k);
  });
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const DD = process.argv[2] || 'public/data/district';
  const ix = JSON.parse(fs.readFileSync(`${DD}/index.json`, 'utf8'));
  const tiles = new Map();
  const get = k => {
    if (!tiles.has(k)) tiles.set(k, k in ix.tiles ? JSON.parse(fs.readFileSync(`${DD}/${k}.json`, 'utf8')) : undefined);
    return tiles.get(k);
  };
  let n = 0,
    nb = 0;
  for (const k of Object.keys(ix.tiles)) {
    nb += get(k).b.length;
    for (const bi of shutIn(get, k)) {
      const p = get(k).b[bi].p;
      n++;
      console.log(
        `${k}#${bi}`,
        Math.round(areaOf(p)) + ' m²',
        'at',
        Math.round(p.reduce((q, v) => q + v[0], 0) / p.length),
        Math.round(p.reduce((q, v) => q + v[1], 0) / p.length),
      );
    }
  }
  console.log(`${n} without a door, of ${nb} footprints in ${Object.keys(ix.tiles).length} tiles`);
}
