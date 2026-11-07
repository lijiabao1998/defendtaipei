// Grid navigation with A* (8-dir) + string pulling.
// v24.26 what a body can walk. Each cell is one of three things:
//  - free: a body standing on its centre clears every wall (block = 0);
//  - no: its centre is so close to a wall that a body cannot stand anywhere in the cell (hard > 0);
//  - maybe: in between. This is what a narrow door or gap is made of: a 0.75 m gap has room for a body along one exact line that
//    cell centres may well miss. Whether a body fits somewhere in such a cell is asked of the real walls, only when a search
//    actually gets there, and remembered. They also cost more, so a search does not go that way unless it has to.
// The grid moves: it covers the ground around the player (soldiers further away are dormant anyway) instead of one fixed patch
// around the start, and a new one is built a little per frame behind the one in use. A search can also run a little per frame,
// so a long one is neither cut off (and sent into a dead end) nor felt as a hitch.
export type V2 = [number, number];
type SegLike = { a: V2; b: V2 };
export class Nav {
  w: number;
  h: number;
  ox: number;
  oz: number;
  cs: number;
  /** body radius in metres; 0 = only the cells a wall line passes through (and no cutting corners) */
  r: number;
  /** walls within r of the centre */
  block: Uint16Array;
  /** walls so close that no point of the cell can hold a body */
  hard: Uint16Array;
  /** 0 not known yet, 1 a body fits somewhere in this cell, 2 it does not */
  fit: Uint8Array;
  /** can a body stand exactly here? (from the game's own walls) */
  fitAt: ((x: number, z: number) => boolean) | null = null;
  g: Float32Array;
  from: Int32Array;
  stamp: Uint32Array;
  closed: Uint32Array;
  cur = 1;
  /** goes up whenever the window moves: a search begun before that is off */
  epoch = 0;
  stats = { finds: 0, ms: 0, worstMs: 0, slices: 0, fits: 0, rebuilds: 0, buildMs: 0, worstStepMs: 0 };
  private rh: number;
  private heapI = new Int32Array(1 << 19);
  private heapF = new Float32Array(1 << 19);
  // the search in progress
  private hn = 0;
  private si = -1;
  private ti = -1;
  private tx = 0;
  private tz = 0;
  private st = 0;
  private it = 0;
  private best = -1;
  private bestH = 0;
  private maxIter = 0;
  // the next window, being built behind the one in use
  private spare: [Uint16Array, Uint16Array] | null = null;
  private next: [Uint16Array, Uint16Array] | null = null;
  private nextO: V2 = [0, 0];
  private list: SegLike[] = [];
  private listI = 0;
  private queue: [V2, V2, number][] = [];
  constructor(minx: number, minz: number, maxx: number, maxz: number, cs = 1, r = 0) {
    this.cs = cs;
    this.r = r;
    // a body that fits anywhere in a cell is at most half a diagonal from its centre
    this.rh = Math.max(0, r - (cs * Math.SQRT2) / 2 - 0.01);
    this.ox = minx;
    this.oz = minz;
    this.w = Math.ceil((maxx - minx) / cs) + 1;
    this.h = Math.ceil((maxz - minz) / cs) + 1;
    const n = this.w * this.h;
    this.block = new Uint16Array(n);
    this.hard = new Uint16Array(r > 0 ? n : 0);
    this.fit = new Uint8Array(r > 0 ? n : 0);
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }
  get cx() {
    return this.ox + ((this.w - 1) * this.cs) / 2;
  }
  get cz() {
    return this.oz + ((this.h - 1) * this.cs) / 2;
  }
  get building() {
    return this.next !== null;
  }
  idx(x: number, z: number) {
    const i = Math.floor((x - this.ox) / this.cs),
      j = Math.floor((z - this.oz) / this.cs);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }
  /** every cell whose centre is within r of the segment, in these arrays with this origin */
  private raster(
    block: Uint16Array,
    hard: Uint16Array,
    fit: Uint8Array | null,
    ox: number,
    oz: number,
    a: V2,
    b: V2,
    d: number,
  ) {
    const cs = this.cs,
      R = this.r,
      R2 = R * R,
      H2 = this.rh * this.rh;
    const ax = a[0],
      az = a[1],
      dx = b[0] - ax,
      dz = b[1] - az;
    const l2 = dx * dx + dz * dz;
    const z0 = Math.min(az, b[1]) - R,
      z1 = Math.max(az, b[1]) + R;
    const j0 = Math.max(0, Math.floor((z0 - oz) / cs - 0.5)),
      j1 = Math.min(this.h - 1, Math.ceil((z1 - oz) / cs - 0.5));
    for (let j = j0; j <= j1; j++) {
      const zc = oz + (j + 0.5) * cs;
      // only the stretch of the segment near this row
      let xa = Math.min(ax, b[0]),
        xb = Math.max(ax, b[0]);
      if (Math.abs(dz) > 1e-6) {
        const t0 = Math.max(0, Math.min(1, (zc - R - az) / dz)),
          t1 = Math.max(0, Math.min(1, (zc + R - az) / dz));
        const x0 = ax + dx * t0,
          x1 = ax + dx * t1;
        xa = Math.min(x0, x1);
        xb = Math.max(x0, x1);
      }
      const i0 = Math.max(0, Math.floor((xa - R - ox) / cs - 0.5)),
        i1 = Math.min(this.w - 1, Math.ceil((xb + R - ox) / cs - 0.5));
      for (let i = i0; i <= i1; i++) {
        const xc = ox + (i + 0.5) * cs;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((xc - ax) * dx + (zc - az) * dz) / l2)) : 0;
        const ex = ax + dx * t - xc,
          ez = az + dz * t - zc;
        const e2 = ex * ex + ez * ez;
        if (e2 <= R2) {
          const c = j * this.w + i;
          block[c] = Math.max(0, block[c] + d);
          if (e2 <= H2) hard[c] = Math.max(0, hard[c] + d);
          if (fit) fit[c] = 0;
        }
      }
    }
  }
  markSeg(a: V2, b: V2, d: number) {
    if (this.r > 0) {
      this.raster(this.block, this.hard, this.fit, this.ox, this.oz, a, b, d);
      // the window being built takes this into account when it gets to the end of its list
      if (this.next) this.queue.push([a, b, d]);
      return;
    }
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / (this.cs * 0.3)));
    const seen = new Set<number>();
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const i = this.idx(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      if (i >= 0 && !seen.has(i)) {
        seen.add(i);
        this.block[i] = Math.max(0, this.block[i] + d);
      }
    }
  }
  /** build the grid from all these walls, right now */
  rebuild(segs: SegLike[]) {
    this.recenter(this.cx, this.cz, segs);
    this.step(1e9);
    this.stats.worstStepMs = 0; // that one was all at once, on purpose
  }
  /** start building a window centred here; the current one stays in use until step() says it is done */
  recenter(cx: number, cz: number, segs: SegLike[]) {
    if (this.next) return;
    const n =
      this.spare ??
      ([new Uint16Array(this.block.length), new Uint16Array(this.block.length)] as [Uint16Array, Uint16Array]);
    n[0].fill(0);
    n[1].fill(0);
    this.spare = null;
    this.next = n;
    this.nextO = [cx - ((this.w - 1) * this.cs) / 2, cz - ((this.h - 1) * this.cs) / 2];
    this.list = segs.slice();
    this.listI = 0;
    this.queue.length = 0;
  }
  /** carry on building for about this many milliseconds; true when there is nothing left to do */
  step(ms: number) {
    if (!this.next) return true;
    const t0 = performance.now();
    const [ox, oz] = this.nextO;
    const [nb, nh] = this.next;
    const maxx = ox + this.w * this.cs + this.r,
      maxz = oz + this.h * this.cs + this.r,
      minx = ox - this.r,
      minz = oz - this.r;
    const L = this.list;
    while (this.listI < L.length) {
      const s = L[this.listI++];
      const out =
        (s.a[0] < minx && s.b[0] < minx) ||
        (s.a[0] > maxx && s.b[0] > maxx) ||
        (s.a[1] < minz && s.b[1] < minz) ||
        (s.a[1] > maxz && s.b[1] > maxz);
      if (!out) this.raster(nb, nh, null, ox, oz, s.a, s.b, 1);
      if ((this.listI & 31) === 0 && performance.now() - t0 > ms) {
        this.noteStep(t0);
        return false;
      }
    }
    for (const [a, b, d] of this.queue) this.raster(nb, nh, null, ox, oz, a, b, d);
    this.queue.length = 0;
    this.list = [];
    this.spare = [this.block, this.hard];
    this.block = nb;
    this.hard = nh;
    this.fit.fill(0);
    this.next = null;
    this.ox = ox;
    this.oz = oz;
    this.epoch++;
    this.stats.rebuilds++;
    this.noteStep(t0);
    return true;
  }
  private noteStep(t0: number) {
    const ms = performance.now() - t0;
    this.stats.buildMs += ms;
    this.stats.worstStepMs = Math.max(this.stats.worstStepMs, ms);
  }
  /** a body standing on the centre of this cell clears every wall */
  free(i: number) {
    return i >= 0 && this.block[i] === 0;
  }
  /** can a body stand here? */
  freeAt(x: number, z: number) {
    return this.free(this.idx(x, z));
  }
  /** is there somewhere in this cell a body fits? */
  private fits(c: number) {
    if (this.block[c] === 0) return true;
    if (this.r <= 0 || this.hard[c] !== 0 || !this.fitAt) return false;
    const known = this.fit[c];
    if (known) return known === 1;
    this.stats.fits++;
    const q = this.cs / 3;
    const X = this.ox + ((c % this.w) + 0.5) * this.cs,
      Z = this.oz + (((c / this.w) | 0) + 0.5) * this.cs;
    let ok = false;
    for (let a = -1; a <= 1 && !ok; a++) for (let b = -1; b <= 1 && !ok; b++) ok = this.fitAt(X + a * q, Z + b * q);
    this.fit[c] = ok ? 1 : 2;
    return ok;
  }
  /** could a body be in this cell? */
  usableAt(x: number, z: number) {
    const c = this.idx(x, z);
    return c >= 0 && this.fits(c);
  }
  /** the usable cell nearest to this point; -1 if there is none close by, or the point is off the grid */
  nearestFree(x: number, z: number, maxR = 16) {
    const c = this.idx(x, z);
    if (c < 0) return -1;
    if (this.fits(c)) return c;
    const ci = c % this.w,
      cj = (c / this.w) | 0;
    for (let r = 1; r <= maxR; r++) {
      let best = -1,
        bd = 1e9;
      for (let dj = -r; dj <= r; dj++) {
        const edge = dj === -r || dj === r;
        for (let di = -r; di <= r; di += edge ? 1 : 2 * r) {
          const i = ci + di,
            j = cj + dj;
          if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
          const n = j * this.w + i;
          if (!this.fits(n)) continue;
          const d = (this.ox + (i + 0.5) * this.cs - x) ** 2 + (this.oz + (j + 0.5) * this.cs - z) ** 2;
          if (d < bd) ((bd = d), (best = n));
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  /** this point if a body can stand on it, or the nearest place that it can */
  snap(p: V2): V2 {
    const c = this.idx(p[0], p[1]);
    if (c < 0 || this.block[c] === 0) return p;
    const n = this.nearestFree(p[0], p[1]);
    if (n < 0) return p;
    return this.centre(n);
  }
  /** a straight walk from a to b that stays on free cells */
  clear(a: V2, b: V2) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.ceil(d / (this.cs * 0.5)) + 1;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (!this.free(this.idx(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))) return false;
    }
    return true;
  }
  private H(i: number) {
    const W = this.w;
    const dx = Math.abs((i % W) - this.tx),
      dz = Math.abs(((i / W) | 0) - this.tz);
    // a little greedy: a slightly longer path found much sooner, and it gets straightened afterwards anyway
    return (dx + dz + (1.4142 - 2) * Math.min(dx, dz)) * (this.r > 0 ? 1.2 : 1);
  }
  private push(i: number, f: number) {
    const hi = this.heapI,
      hf = this.heapF;
    if (this.hn >= hi.length - 1) return;
    let c = this.hn++;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (hf[p] <= f) break;
      hi[c] = hi[p];
      hf[c] = hf[p];
      c = p;
    }
    hi[c] = i;
    hf[c] = f;
  }
  private pop() {
    const hi = this.heapI,
      hf = this.heapF;
    const top = hi[0];
    const n = --this.hn;
    if (n > 0) {
      const li = hi[n],
        lf = hf[n];
      let c = 0;
      for (;;) {
        let m = 2 * c + 1;
        if (m >= n) break;
        if (m + 1 < n && hf[m + 1] < hf[m]) m++;
        if (hf[m] >= lf) break;
        hi[c] = hi[m];
        hf[c] = hf[m];
        c = m;
      }
      hi[c] = li;
      hf[c] = lf;
    }
    return top;
  }
  /**
   * start a search from s towards t. False if s is off the grid or nothing can be done from there. A target off the grid is aimed
   * at through the nearest point on its edge.
   */
  begin(s: V2, t: V2, maxIter = 160000) {
    this.stats.finds++;
    this.hn = 0;
    this.si = this.nearestFree(s[0], s[1]);
    const X1 = this.ox + this.w * this.cs - 0.01,
      Z1 = this.oz + this.h * this.cs - 0.01;
    this.ti = this.nearestFree(Math.max(this.ox, Math.min(X1, t[0])), Math.max(this.oz, Math.min(Z1, t[1])));
    if (this.si < 0 || this.ti < 0) return false;
    this.st = ++this.cur;
    this.tx = this.ti % this.w;
    this.tz = (this.ti / this.w) | 0;
    this.stamp[this.si] = this.st;
    this.g[this.si] = 0;
    this.from[this.si] = -1;
    const h = this.H(this.si);
    this.push(this.si, h);
    this.it = 0;
    this.best = this.si;
    this.bestH = h;
    this.maxIter = maxIter;
    return true;
  }
  /**
   * carry on for about this many milliseconds. undefined: not finished. Otherwise a path of cell centres, or null if there is
   * nowhere to go. If t cannot be reached the path goes as far towards it as there is to go.
   */
  advance(ms: number): V2[] | null | undefined {
    const t0 = performance.now();
    this.stats.slices++;
    const W = this.w,
      h = this.h;
    const { block, hard, g, stamp, closed, from, st, ti } = this;
    const cornerRule = this.r <= 0;
    const DX = DIRX,
      DZ = DIRZ;
    let done = false;
    while (this.hn > 0 && this.it++ < this.maxIter) {
      if ((this.it & 63) === 0 && performance.now() - t0 > ms) {
        this.note(t0);
        return undefined;
      }
      const c = this.pop();
      if (c === ti) {
        done = true;
        break;
      }
      if (closed[c] === st) continue;
      closed[c] = st;
      // a maybe-cell is only looked at properly when the search actually gets to it
      if (block[c] !== 0 && c !== this.si && !this.fits(c)) continue;
      const hc = this.H(c);
      if (hc < this.bestH) {
        this.bestH = hc;
        this.best = c;
      }
      const cx = c % W,
        cz = (c / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k],
          nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= W || nz >= h) continue;
        const n = nz * W + nx;
        let cost = k >= 4 ? 1.4142 : 1;
        if (block[n] !== 0) {
          if (cornerRule || hard[n] !== 0 || !this.fitAt || this.fit[n] === 2) continue;
          // narrow, and no way to know yet: costs more, so nobody squeezes through who has another way
          cost *= 1.6;
        } else if (cornerRule && k >= 4 && (block[cz * W + nx] !== 0 || block[nz * W + cx] !== 0)) continue;
        const ng = g[c] + cost;
        if (stamp[n] !== st || ng < g[n]) {
          stamp[n] = st;
          g[n] = ng;
          from[n] = c;
          this.push(n, ng + this.H(n));
        }
      }
    }
    this.note(t0);
    // unreachable: the path goes to the closest cell there was
    const end = done ? ti : this.best;
    if (end === this.si) return this.si === ti ? [this.centre(this.si)] : null;
    const out: V2[] = [];
    for (let c = end; c >= 0; c = from[c]) out.push(this.centre(c));
    out.reverse();
    return out;
  }
  private note(t0: number) {
    const ms = performance.now() - t0;
    this.stats.ms += ms;
    this.stats.worstMs = Math.max(this.stats.worstMs, ms);
  }
  /** a whole search in one go */
  find(s: V2, t: V2, maxIter = 160000): V2[] | null {
    if (!this.begin(s, t, maxIter)) return null;
    let r: V2[] | null | undefined;
    do r = this.advance(1e9);
    while (r === undefined);
    return r;
  }
  private centre(c: number): V2 {
    return [this.ox + ((c % this.w) + 0.5) * this.cs, this.oz + (((c / this.w) | 0) + 0.5) * this.cs];
  }
}
const DIRX = [1, -1, 0, 0, 1, 1, -1, -1],
  DIRZ = [0, 0, 1, -1, 1, -1, 1, -1];
/** string pulling: from each point, as far along the path as a straight line reaches */
export function smooth(path: V2[], los: (a: V2, b: V2) => boolean, reach = 24) {
  if (path.length < 3) return path;
  const out: V2[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = Math.min(path.length - 1, i + reach);
    // try the far end first, then come back in steps of a quarter of the distance
    while (j > i + 1 && !los(path[i], path[j])) j = Math.max(i + 1, j - Math.max(1, (j - i) >> 2));
    out.push(path[j]);
    i = j;
  }
  return out;
}
