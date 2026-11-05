// v24.6 block interiors. Photos of Wanhua from above show blocks built solid: rows of 4–7 m 透天 / 公寓 behind the
// street fronts, back to back across 1.6 m 防火巷, cut every 26–40 m by a 3 m 巷 running in from the street. OSM
// leaves most block interiors in the core empty, so they read as paved plazas. This fills them: lanes are reserved
// first, then lots are placed from every street inwards, row by row (oriented to that street), wherever no
// footprint, door corridor, road, park, water or landmark is in the way. Rasterised at 1 m so it runs in a few
// hundred milliseconds over the whole core. Deterministic (own hash; the world RNG is untouched).
type P2 = [number, number];
export type BlockRoad = { p: P2[]; t: string };
export type BlockOpts = {
  bbox: [number, number, number, number];
  roadW: Record<string, number>;
  avoid?: [number, number, number, number][];
  /** polygons to keep open (parks, water, plazas) */
  open?: P2[][];
  /** farthest from a road edge a lot centre may be (m) */
  depth?: number;
  max?: number;
};
export type BlockLot = { p: P2[]; l: number; n: string; s: string; g: 1 };
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
export function blockInfill(buildings: { p: P2[]; fill?: 1 }[], roads: BlockRoad[], o: BlockOpts): BlockLot[] {
  const [bx0, bz0, bx1, bz1] = o.bbox;
  const W = Math.ceil(bx1 - bx0),
    H = Math.ceil(bz1 - bz0);
  // 1 m rasters: road (no lot may touch it), band (no lot centre this close to a road), obstacles
  const road = new Uint8Array(W * H),
    band = new Uint8Array(W * H),
    obs = new Uint8Array(W * H);
  const cell = (x: number, z: number) => {
    const i = Math.floor(x - bx0),
      k = Math.floor(z - bz0);
    return i < 0 || k < 0 || i >= W || k >= H ? -1 : k * W + i;
  };
  const capsule = (m: Uint8Array, a: P2, b: P2, r: number) => {
    const i0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - r - bx0)),
      i1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0]) + r - bx0)),
      k0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - r - bz0)),
      k1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1]) + r - bz0));
    for (let k = k0; k <= k1; k++)
      for (let i = i0; i <= i1; i++) if (segD(bx0 + i + 0.5, bz0 + k + 0.5, a, b) <= r) m[k * W + i] = 1;
  };
  const poly = (m: Uint8Array, p: P2[]) => {
    let x0 = 1e9,
      z0 = 1e9,
      x1 = -1e9,
      z1 = -1e9;
    for (const [x, z] of p)
      ((x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z)));
    const i0 = Math.max(0, Math.floor(x0 - bx0)),
      i1 = Math.min(W - 1, Math.ceil(x1 - bx0)),
      k0 = Math.max(0, Math.floor(z0 - bz0)),
      k1 = Math.min(H - 1, Math.ceil(z1 - bz0));
    for (let k = k0; k <= k1; k++)
      for (let i = i0; i <= i1; i++) if (pip([bx0 + i + 0.5, bz0 + k + 0.5], p)) m[k * W + i] = 1;
  };
  /** rectangle (centre, along-road axis u, half sizes), grown by g on every side */
  const rectQ = (cx: number, cz: number, ux: number, uz: number, hw: number, hd: number, g = 0): P2[] => {
    const nx = -uz,
      nz = ux,
      a = hw + g,
      d = hd + g;
    return [
      [cx - ux * a - nx * d, cz - uz * a - nz * d],
      [cx + ux * a - nx * d, cz + uz * a - nz * d],
      [cx + ux * a + nx * d, cz + uz * a + nz * d],
      [cx - ux * a + nx * d, cz - uz * a + nz * d],
    ];
  };
  const hwOf = (r: BlockRoad) => (o.roadW[r.t.replace('_link', '')] ?? 2.5) / 2;
  for (const r of roads)
    for (let i = 0; i < r.p.length - 1; i++) {
      capsule(road, r.p[i], r.p[i + 1], hwOf(r) + 1.2);
      capsule(band, r.p[i], r.p[i + 1], hwOf(r) + 3);
    }
  // existing footprints grown by the 1.6 m 防火巷, and the way out of every door (4 m wide, 12 m deep)
  const grow = (p: P2[], g: number): P2[] => {
    const cx = p.reduce((a, q) => a + q[0], 0) / p.length,
      cz = p.reduce((a, q) => a + q[1], 0) / p.length;
    return p.map(([x, z]) => {
      const dx = x - cx,
        dz = z - cz,
        l = Math.hypot(dx, dz) || 1;
      return [x + (dx / l) * g, z + (dz / l) * g] as P2;
    });
  };
  for (const b of buildings) {
    if (b.p.length < 3) continue;
    poly(obs, grow(b.p, 1.6));
    let di = 0,
      dl = 0;
    if (b.fill) dl = Math.hypot(b.p[1][0] - b.p[0][0], b.p[1][1] - b.p[0][1]);
    else
      for (let i = 0; i < b.p.length; i++) {
        const a = b.p[i],
          c = b.p[(i + 1) % b.p.length];
        const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (l > dl) ((dl = l), (di = i));
      }
    const a = b.p[di],
      c = b.p[(di + 1) % b.p.length];
    const L = dl || 1,
      ux = (c[0] - a[0]) / L,
      uz = (c[1] - a[1]) / L;
    const mx = (a[0] + c[0]) / 2,
      mz = (a[1] + c[1]) / 2;
    let nx = -uz,
      nz = ux;
    if (pip([mx + nx * 0.5, mz + nz * 0.5], b.p)) ((nx = -nx), (nz = -nz));
    poly(obs, [
      [mx - ux * 2 - nx * 0.5, mz - uz * 2 - nz * 0.5],
      [mx + ux * 2 - nx * 0.5, mz + uz * 2 - nz * 0.5],
      [mx + ux * 2 + nx * 12, mz + uz * 2 + nz * 12],
      [mx - ux * 2 + nx * 12, mz - uz * 2 + nz * 12],
    ]);
  }
  for (const r of o.avoid || [])
    poly(obs, [
      [r[0], r[1]],
      [r[2], r[1]],
      [r[2], r[3]],
      [r[0], r[3]],
    ]);
  for (const p of o.open || []) if (p.length >= 3) poly(obs, p);
  // lanes: a 3 m 巷 every 26–40 m, 55 m in from each side of every street with a kerb
  for (const r of roads) {
    const w = hwOf(r) * 2;
    if (w < 6) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 20) continue;
      const tx = (bx - ax) / L,
        tz = (bz - az) / L;
      for (let s = 10 + hash(ax, az) * 16; s < L - 8; s += 26 + hash(ax + s, az - s) * 14)
        for (const side of [-1, 1]) {
          const nx = -tz * side,
            nz = tx * side;
          const x0 = ax + tx * s + nx * (w / 2),
            z0 = az + tz * s + nz * (w / 2);
          poly(obs, [
            [x0 - tx * 1.5, z0 - tz * 1.5],
            [x0 + tx * 1.5, z0 + tz * 1.5],
            [x0 + tx * 1.5 + nx * 55, z0 + tz * 1.5 + nz * 55],
            [x0 - tx * 1.5 + nx * 55, z0 - tz * 1.5 + nz * 55],
          ]);
        }
    }
  }
  // candidates: march in from every road side, row by row (centre depth from the road edge, road direction)
  const depth = o.depth ?? 75;
  const cand: { x: number; z: number; d: number; ux: number; uz: number }[] = [];
  for (const r of roads) {
    const hw = hwOf(r);
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 4) continue;
      const tx = (bx - ax) / L,
        tz = (bz - az) / L;
      for (let s = 2 + hash(ax * 3, bz) * 3; s < L - 2; s += 4.6)
        for (const side of [-1, 1])
          for (let dd = 9; dd < depth; dd += 4.6) {
            const x = ax + tx * s - tz * side * (hw + dd),
              z = az + tz * s + tx * side * (hw + dd);
            const c = cell(x, z);
            if (c < 0 || band[c] || obs[c]) continue;
            cand.push({ x, z, d: dd, ux: tx, uz: tz });
          }
    }
  }
  cand.sort((a, b) => a.d - b.d);
  const clear = (q: P2[]) => {
    let x0 = 1e9,
      z0 = 1e9,
      x1 = -1e9,
      z1 = -1e9;
    for (const [x, z] of q)
      ((x0 = Math.min(x0, x)), (z0 = Math.min(z0, z)), (x1 = Math.max(x1, x)), (z1 = Math.max(z1, z)));
    if (x0 < bx0 || z0 < bz0 || x1 > bx1 || z1 > bz1) return false;
    const i0 = Math.floor(x0 - bx0),
      i1 = Math.ceil(x1 - bx0) - 1,
      k0 = Math.floor(z0 - bz0),
      k1 = Math.ceil(z1 - bz0) - 1;
    for (let k = k0; k <= k1; k++)
      for (let i = i0; i <= i1; i++) {
        const j = k * W + i;
        if ((obs[j] || road[j]) && pip([bx0 + i + 0.5, bz0 + k + 0.5], q)) return false;
      }
    return true;
  };
  const out: BlockLot[] = [];
  for (const c of cand) {
    if (o.max != null && out.length >= o.max) break;
    if (obs[cell(c.x, c.z)]) continue;
    if (hash(c.x * 0.7, c.z * 1.3) < 0.08) continue; // the odd courtyard / car park left open
    const w = 4.5 + hash(c.x, c.z * 2) * 2.5,
      d = 9 + hash(c.z, c.x * 2) * 5;
    const q = rectQ(c.x, c.z, c.ux, c.uz, w / 2, d / 2);
    if (!clear(q)) continue;
    poly(obs, rectQ(c.x, c.z, c.ux, c.uz, w / 2, d / 2, 1.6)); // 1.6 m 防火巷 to everything placed later
    const tall = hash(c.x * 3, c.z * 5);
    const l = tall < 0.08 ? 7 + Math.floor(hash(c.z * 7, c.x) * 6) : 3 + Math.floor(hash(c.x * 11, c.z * 13) * 4);
    out.push({ p: q, l, n: '', s: '', g: 1 });
  }
  return out;
}
