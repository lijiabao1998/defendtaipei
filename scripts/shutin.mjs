// Footprints that will have no door in the game, found before the data is written.
//
// The game gives every building a door: on the street, on open ground, through a gap wide enough to squeeze by, and,
// for one that is shut in by its neighbours on every side, through a wall it shares with a neighbour that has a way
// out (src/map/district.ts, v24.28). That last search looks at the buildings of the same tile only. A part of a large
// building drawn as a footprint of its own (a stair tower between two wings of a school), whose neighbours belong to
// the next tile, is left with no door at all: a solid box. scripts/expand.mjs leaves those out.
//
// This is the game's search, on the same numbers (the tiles hold what the game reads), with no random numbers in it.
// usage: node scripts/shutin.mjs [public/data/district]   lists them for every tile of the map
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOOR_W = 1.4; // as in src/map/district.ts
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
 * the buildings of tile `key` (indices into its `b`) that are shut in and have no neighbour to go through
 * @param {(key: string) => { b: { p: number[][] }[] } | undefined} get the tiles
 */
export function shutIn(get, key) {
  const td = get(key);
  if (!td) return [];
  const [ktx, ktz] = key.split('_').map(Number);
  // footprints of this tile and its neighbours, in the order the game has them
  const near = [-1, 0, 1].flatMap(i =>
    [-1, 0, 1].flatMap(j =>
      (get(ktx + i + '_' + (ktz + j))?.b || [])
        .filter(o => o.p.length >= 3)
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
    ),
  );
  const otherAt = (x, z, self) =>
    near.some(o => o.p !== self && x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1 && pip([x, z], o.p));
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
  const foot = td.b.map(o => {
    if (o.p.length < 3) return null;
    const ar = areaOf(o.p);
    if (ar < 12 || ar > 8000) return null;
    const mx = o.p.reduce((q, v) => q + v[0], 0) / o.p.length,
      mz = o.p.reduce((q, v) => q + v[1], 0) / o.p.length;
    if (partOf(mx, mz, o.p)) return null;
    const xs = o.p.map(q => q[0]),
      zs = o.p.map(q => q[1]);
    return { p: o.p, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  });
  const hit = (x, z, self) => {
    for (let k = 0; k < foot.length; k++) {
      const f = foot[k];
      if (f && k !== self && x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && pip([x, z], f.p)) return k;
    }
    return -1;
  };
  const walls = pts => {
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
      if (pip([(a[0] + c[0]) / 2 + nx * 0.3, (a[1] + c[1]) / 2 + nz * 0.3], pts)) ((nx = -nx), (nz = -nz));
      out.push({ i, L, ux, uz, nx, nz });
    }
    return out;
  };
  // no wall with open ground outside it: neither room to spare (0.8 m and 1.4 m out) nor a gap to squeeze by
  const shut = new Set();
  foot.forEach((f, k) => {
    if (!f) return;
    const open = walls(f.p).some(w => {
      const a = f.p[w.i];
      const mx = a[0] + (w.ux * w.L) / 2,
        mz = a[1] + (w.uz * w.L) / 2;
      const free = d => !otherAt(mx + w.nx * d, mz + w.nz * d, f.p);
      return (free(0.45) && free(0.85)) || (free(0.8) && free(1.4));
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
          found.push(k);
          break search;
        }
      }
    }
    if (!found.length) break;
    for (const k of found) shut.delete(k);
  }
  return [...shut];
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
  console.log(`${n} shut in, of ${nb} footprints in ${Object.keys(ix.tiles).length} tiles`);
}
