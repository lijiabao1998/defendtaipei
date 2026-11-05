// v23.9 street-frontage infill near the spawn. OSM maps only ~500 footprints in the 1.1 km core, so most Wanhua
// blocks read as empty lots. Real 萬華 streets are walls of narrow 透天 / 公寓 fronts (4–7 m wide, 10–16 m deep),
// so empty frontage along mapped roads is filled with row-house lots of that size. Only gaps are filled: lots never
// overlap an OSM footprint, a carriageway/alley, a landmark rect or the space in front of an OSM building's door.
// Deterministic (own hash, the world RNG is untouched).
type P2 = [number, number];
export type InfillRoad = { p: P2[]; t: string };
export type InfillOpts = {
  cx: number;
  cz: number;
  /** fill radius around (cx, cz) */
  r: number;
  roadW: Record<string, number>;
  /** keep-out rects [x0, z0, x1, z1] */
  avoid?: [number, number, number, number][];
  max?: number;
};
const FRONT = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service']);
const hash = (a: number, b: number) => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
function pip(p: P2, pts: P2[]) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i],
      [xj, zj] = pts[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function segD(px: number, pz: number, a: P2, b: P2) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L2));
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}
const C = 16;
class Grid<T> {
  m = new Map<number, T[]>();
  add(x0: number, z0: number, x1: number, z1: number, v: T) {
    for (let x = Math.floor(x0 / C); x <= Math.floor(x1 / C); x++)
      for (let z = Math.floor(z0 / C); z <= Math.floor(z1 / C); z++) {
        const k = x * 100003 + z;
        (this.m.get(k) || this.m.set(k, []).get(k)!).push(v);
      }
  }
  near(x0: number, z0: number, x1: number, z1: number) {
    const s = new Set<T>();
    for (let x = Math.floor(x0 / C); x <= Math.floor(x1 / C); x++)
      for (let z = Math.floor(z0 / C); z <= Math.floor(z1 / C); z++)
        for (const v of this.m.get(x * 100003 + z) || []) s.add(v);
    return s;
  }
}
/** Returns new row-house footprints ({ p, l, n:'', s:'', fill:1 }) to append to the OSM building list. */
export function frontageInfill(buildings: { p: P2[] }[], roads: InfillRoad[], o: InfillOpts) {
  const bg = new Grid<P2[]>();
  const box = (p: P2[]) => {
    let x0 = 1e9,
      z0 = 1e9,
      x1 = -1e9,
      z1 = -1e9;
    for (const [x, z] of p)
      ((x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z)));
    return [x0, z0, x1, z1] as const;
  };
  const og = new Grid<P2[]>();
  for (const b of buildings) {
    const [x0, z0, x1, z1] = box(b.p);
    bg.add(x0, z0, x1, z1, b.p);
    og.add(x0, z0, x1, z1, b.p);
    // keep the street in front of the OSM door (longest edge midpoint, as buildMap places it) open
    let dl = 0,
      di = 0;
    for (let i = 0; i < b.p.length; i++) {
      const a = b.p[i],
        c = b.p[(i + 1) % b.p.length];
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l > dl) ((dl = l), (di = i));
    }
    const a = b.p[di],
      c = b.p[(di + 1) % b.p.length];
    const mx = (a[0] + c[0]) / 2,
      mz = (a[1] + c[1]) / 2;
    // a 4 m wide, 12 m deep corridor out of the door (the street or lane it opens onto may be unmapped)
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    const ux = (c[0] - a[0]) / L,
      uz = (c[1] - a[1]) / L;
    let nx = -uz,
      nz = ux;
    if (pip([mx + nx * 0.5, mz + nz * 0.5], b.p)) ((nx = -nx), (nz = -nz));
    const W = 2,
      D = 12;
    const cor: P2[] = [
      [mx - ux * W - nx * 0.5, mz - uz * W - nz * 0.5],
      [mx + ux * W - nx * 0.5, mz + uz * W - nz * 0.5],
      [mx + ux * W + nx * D, mz + uz * W + nz * D],
      [mx - ux * W + nx * D, mz - uz * W + nz * D],
    ];
    const [cx0, cz0, cx1, cz1] = box(cor);
    bg.add(cx0, cz0, cx1, cz1, cor);
  }
  for (const r of o.avoid || []) {
    const [x0, z0, x1, z1] = r;
    bg.add(x0, z0, x1, z1, [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ]);
  }
  const rg = new Grid<{ a: P2; b: P2; hw: number }>();
  for (const r of roads) {
    const hw = (o.roadW[r.t.replace('_link', '')] ?? 2.5) / 2;
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i],
        b = r.p[i + 1];
      rg.add(
        Math.min(a[0], b[0]) - hw,
        Math.min(a[1], b[1]) - hw,
        Math.max(a[0], b[0]) + hw,
        Math.max(a[1], b[1]) + hw,
        {
          a,
          b,
          hw,
        },
      );
    }
  }
  const out: { p: P2[]; l: number; n: string; s: string; fill: 1 }[] = [];
  const ok = (q: P2[]) => {
    const [x0, z0, x1, z1] = box(q);
    const m = 1.1; // sidewalk / alley clearance
    for (const s of rg.near(x0 - 10, z0 - 10, x1 + 10, z1 + 10)) {
      // sample the lot's edges + centre against every nearby road centreline
      for (let i = 0; i < 4; i++)
        for (let k = 0; k <= 4; k++) {
          const a = q[i],
            c = q[(i + 1) % 4];
          const px = a[0] + ((c[0] - a[0]) * k) / 4,
            pz = a[1] + ((c[1] - a[1]) * k) / 4;
          if (segD(px, pz, s.a, s.b) < s.hw + m) return false;
        }
      const cx = (x0 + x1) / 2,
        cz = (z0 + z1) / 2;
      if (segD(cx, cz, s.a, s.b) < s.hw + m) return false;
    }
    // 防火巷: keep a walkable gap to OSM buildings (their doors may open onto an unmapped lane)
    const G = 1.6;
    for (const p of og.near(x0 - G, z0 - G, x1 + G, z1 + G))
      for (let i = 0; i < 4; i++)
        for (let k = 0; k <= 4; k++) {
          const a = q[i],
            c = q[(i + 1) % 4];
          const px = a[0] + ((c[0] - a[0]) * k) / 4,
            pz = a[1] + ((c[1] - a[1]) * k) / 4;
          for (let j = 0; j < p.length; j++) if (segD(px, pz, p[j], p[(j + 1) % p.length]) < G) return false;
        }
    for (const p of bg.near(x0, z0, x1, z1)) {
      for (const v of p) if (pip(v, q)) return false;
      for (let i = 0; i < 4; i++)
        for (let k = 0; k <= 4; k++)
          for (let j = 0; j <= 4; j++) {
            const a = q[0],
              ux = (q[1][0] - a[0]) / 4,
              uz = (q[1][1] - a[1]) / 4,
              vx = (q[3][0] - a[0]) / 4,
              vz = (q[3][1] - a[1]) / 4;
            if (pip([a[0] + ux * k + vx * j, a[1] + uz * k + vz * j], p)) return false;
          }
    }
    return true;
  };
  const max = o.max ?? 400;
  if (max <= 0) return out;
  // nearest streets first, so the cap is spent around the spawn
  const md = (r: InfillRoad) => Math.min(...r.p.map(q => Math.hypot(q[0] - o.cx, q[1] - o.cz)));
  const order = roads.map((r, i) => [r, i + 1, md(r)] as const).sort((a, b) => a[2] - b[2]);
  for (const [r, ri] of order) {
    if (!FRONT.has(r.t.replace('_link', ''))) continue;
    const hw = (o.roadW[r.t.replace('_link', '')] ?? 3) / 2;
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i],
        b = r.p[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 8) continue;
      const ux = (b[0] - a[0]) / L,
        uz = (b[1] - a[1]) / L;
      for (const side of [1, -1]) {
        const nx = -uz * side,
          nz = ux * side;
        const off = hw + 1.6; // sidewalk / 騎樓 strip
        let s = 2.5,
          n = 0;
        while (s < L - 2.5) {
          const h1 = hash(ri * 31 + i, s * 7 + side),
            h2 = hash(ri * 17 + i * 3, s * 5 - side);
          const w = 4.2 + h1 * 2.8;
          if (s + w > L - 2.5) break;
          let placed = false;
          // deepest lot that fits, then shallower
          for (const d of [8 + h2 * 8, 9, 6.5]) {
            const p0: P2 = [a[0] + ux * s + nx * off, a[1] + uz * s + nz * off];
            const q: P2[] = [
              p0,
              [p0[0] + ux * w, p0[1] + uz * w],
              [p0[0] + ux * w + nx * d, p0[1] + uz * w + nz * d],
              [p0[0] + nx * d, p0[1] + nz * d],
            ];
            const mx = p0[0] + (ux * w + nx * d) / 2,
              mz = p0[1] + (uz * w + nz * d) / 2;
            if (Math.hypot(mx - o.cx, mz - o.cz) > o.r) break;
            if (ok(q)) {
              // round + shrink a hair so neighbouring lots share no wall coplanar overlap
              const e = 0.06;
              const qq: P2[] = [
                [q[0][0] + ux * e, q[0][1] + uz * e],
                [q[1][0] - ux * e, q[1][1] - uz * e],
                [q[2][0] - ux * e, q[2][1] - uz * e],
                [q[3][0] + ux * e, q[3][1] + uz * e],
              ].map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100] as P2);
              // edge 0 (q0 -> q1) is the street front: buildMap puts the door and shop sign there
              const lv = hash(ri + n, i + s) < 0.55 ? 3 + Math.floor(hash(s, ri) * 2) : 4 + Math.floor(hash(ri, s) * 3);
              out.push({ p: qq, l: lv, n: '', s: '', fill: 1 });
              bg.add(...(box(qq) as [number, number, number, number]), qq);
              if (out.length >= max) return out;
              placed = true;
              n++;
              s += w;
              break;
            }
          }
          if (!placed) s += 1.5;
        }
      }
    }
  }
  return out;
}
