import { tr } from '../i18n';
// Project-Zomboid-style paper map rendered from the same OpenStreetMap data as the 3D world (© OpenStreetMap contributors, ODbL).
// Fog of war, player notes, intel markers, 奪回/佔領 sector tint. Street names come from OSM `name` tags; no house numbers.
import { readMapSave, writeMapSave, type MapSave } from '../systems/save';

type V2 = [number, number];
export type MapBld = { pts: V2[]; type: string; n?: string };
export type MapRoad = { p: V2[]; t: string; n?: string };
export type MapDeps = {
  blds: MapBld[];
  roads: MapRoad[];
  bounds: { minx: number; maxx: number; minz: number; maxz: number };
  /** v21: named 萬華 areas (nearest-anchor regions) */
  sectors: { n: string; x: number; z: number }[];
  sectorOf: (x: number, z: number) => number;
  sectorName: (i: number) => string;
  /** v21: whole-district overlay (admin boundary, water, parks, landmarks) + lazily loaded footprints/roads */
  district?: {
    boundary: V2[][];
    water: V2[][];
    park: { p: V2[] }[];
    river: number[][];
    landmarks: { n: string; x: number; z: number }[];
    /** v24.33 the name of each ring of the boundary */
    districts?: string[];
    /** v24.35 woodland, and airfields (lawn, paving, runway paint) */
    wood?: V2[][];
    air?: { lawn: V2[][]; paved: V2[][]; marks: V2[][] };
    more?: () => Promise<{ b: number[][]; r: MapRoad[] }>;
  };
  /** v24.33 metro stations (their first street exit) */
  stations?: { n: string; x: number; z: number }[];
  liberated: () => Set<number>;
  player: () => { x: number; z: number; rot: number };
  parks: V2[];
  outposts: () => V2[];
  evac: () => V2 | null;
  home: () => V2 | null;
};
const DISTRICT_NAME: Record<string, string> = {
  萬華區: tr('萬華區', 'Wanhua'),
  中正區: tr('中正區', 'Zhongzheng'),
  大同區: tr('大同區', 'Datong'),
  大安區: tr('大安區', "Da'an"),
  中山區: tr('中山區', 'Zhongshan'),
  松山區: tr('松山區', 'Songshan'),
  信義區: tr('信義區', 'Xinyi'),
};
type Note = { x: number; z: number; k: string; t?: string; intel?: boolean; id?: string };
const KINDS: Record<string, [string, string]> = {
  sup: [tr('補給', 'Supplies'), '#2f7d3a'],
  dng: [tr('危險', 'Danger'), '#c0281c'],
  evac: [tr('撤離', 'Evacuation'), '#1f5fae'],
  safe: [tr('安全屋', 'Safe house'), '#b07a12'],
  intel: [tr('情報', 'Intel'), '#7a2a9a'],
  out: [tr('佔領軍據點', 'Occupation outpost'), '#8a1010'],
};
const ZONE = (b: MapBld) => {
  const n = b.n || '';
  if (/寺|宮|廟|殿|祠|堂/.test(n)) return '#c9a35a';
  if (/醫院|診所|醫學|衛生/.test(n) || b.type === 'pharmacy') return '#e0a0a8';
  if (/市場|夜市|商場|百貨|商圈/.test(n) || b.type === 'store') return '#d7b98a';
  if (/學|校|國小|國中/.test(n)) return '#c8c0a0';
  if (/廠|倉/.test(n)) return '#a8a4b0';
  if (b.type === 'police') return '#9cb0d0';
  return '#bdb6a2';
};
const FG = 448; // v24.33: the map is 5.4 × 7.9 km now (was 320 cells over the 3 × 4.5 km of 萬華)
/** the fog grid of a save made before v24.33: 320 cells over 萬華 alone */
const OLD_FOG = [-1992, -1002, 4562 / 320, 320];
export class GameMap {
  el: HTMLDivElement;
  cv: HTMLCanvasElement;
  base: HTMLCanvasElement;
  fog: HTMLCanvasElement;
  fogA: Uint8Array;
  notes: Note[] = [];
  open = false;
  S = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches ? 2048 : 3072;
  extraB: number[][] = [];
  extraR: MapRoad[] = [];
  secCv?: HTMLCanvasElement;
  secKey = '';
  k = 1;
  ox = 0;
  oy = 0;
  zoom = 1;
  panX = 0;
  panY = 0;
  dirty = true;
  menu?: HTMLDivElement;
  constructor(public d: MapDeps) {
    const b = d.bounds;
    const w = b.maxx - b.minx + 80,
      h = b.maxz - b.minz + 80;
    this.k = this.S / Math.max(w, h);
    this.ox = b.minx - 40;
    this.oy = b.minz - 40;
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = this.S;
    this.drawBase();
    this.fog = document.createElement('canvas');
    this.fog.width = this.fog.height = FG;
    this.fogA = new Uint8Array(FG * FG);
    try {
      const s = readMapSave();
      if (s) this.load(s);
    } catch {
      /* fresh */
    }
    this.el = document.createElement('div');
    this.el.id = 'gmap';
    this.el.className = 'hidden';
    this.el.innerHTML = `<div class="mhead"><b>${tr('萬華 · 生存者地圖', 'Wanhua · Survivor map')}</b><span class="mhint">${tr('拖曳平移・滾輪／雙指縮放・點一下加註記', 'Drag to pan · Scroll / pinch to zoom · Tap to add a note')}</span><button class="mz" data-z="1.4">＋</button><button class="mz" data-z="0.7">－</button><button class="mc">${tr('置中', 'Center')}</button><button class="mall">${tr('全區', 'Whole district')}</button><button class="mx">${tr('關閉 (M)', 'Close (M)')}</button></div><div class="mleg"></div><div class="mcred">© OpenStreetMap contributors (ODbL)</div>`;
    this.cv = document.createElement('canvas');
    this.el.appendChild(this.cv);
    document.body.appendChild(this.el);
    this.el.querySelector('.mleg')!.innerHTML =
      [
        ['#2e6e8e', tr('淡水河', 'Tamsui River')],
        ['#bdb6a2', tr('住宅', 'Residential')],
        ['#d7b98a', tr('商業／市場', 'Shops / markets')],
        ['#c9a35a', tr('寺廟', 'Temples')],
        ['#7fa860', tr('公園', 'Parks')],
        ['#e0a0a8', tr('醫療', 'Medical')],
        ['#a8a4b0', tr('工業／倉庫', 'Industry / warehouses')],
        ['rgba(60,170,70,.5)', tr('已奪回', 'Liberated')],
        ['rgba(200,40,30,.45)', tr('佔領中', 'Occupied')],
      ]
        .map(([c, t]) => `<i style="background:${c}"></i>${t}`)
        .join(' ') +
      ' ' +
      Object.entries(KINDS)
        .map(([, [t, c]]) => `<em style="color:${c}">●</em>${t}`)
        .join(' ');
    (this.el.querySelector('.mx') as HTMLElement).onclick = () => this.toggle(false);
    (this.el.querySelector('.mall') as HTMLElement).onclick = () => this.fit();
    (this.el.querySelector('.mc') as HTMLElement).onclick = () => {
      this.center();
    };
    this.el
      .querySelectorAll('.mz')
      .forEach(
        z =>
          ((z as HTMLElement).onclick = () =>
            this.zoomAt(+(z as HTMLElement).dataset.z!, innerWidth / 2, innerHeight / 2)),
      );
    this.input();
  }
  /**
   * v24.33 take the notes and the fog of a save. The grid a save was made on travels with it; one from another grid
   * (an older, smaller map) is laid over the new one, so what was explored stays explored.
   */
  load(s: MapSave) {
    const b = this.d.bounds;
    this.notes = s.n || [];
    this.fogA.fill(0);
    const f = atob(s.f || '');
    const g = s.g ?? OLD_FOG;
    const cs = (Math.max(b.maxx - b.minx, b.maxz - b.minz) + 80) / FG;
    if (g[0] === this.ox && g[1] === this.oy && g[3] === FG && Math.abs(g[2] - cs) < 1e-6)
      for (let i = 0; i < f.length && i < FG * FG; i++) this.fogA[i] = f.charCodeAt(i);
    else
      for (let j = 0; j < FG; j++)
        for (let i = 0; i < FG; i++) {
          const oi = Math.floor((this.ox + (i + 0.5) * cs - g[0]) / g[2]),
            oj = Math.floor((this.oy + (j + 0.5) * cs - g[1]) / g[2]);
          if (oi >= 0 && oj >= 0 && oi < g[3] && oj < g[3] && oj * g[3] + oi < f.length)
            this.fogA[j * FG + i] = f.charCodeAt(oj * g[3] + oi);
        }
    this.dirty = true;
  }
  wx(x: number) {
    return (x - this.ox) * this.k;
  }
  wy(z: number) {
    return (z - this.oy) * this.k;
  }
  drawBase() {
    const c = this.base.getContext('2d')!,
      S = this.S,
      d = this.d;
    c.fillStyle = '#e8dfc8';
    c.fillRect(0, 0, S, S); // paper
    for (let i = 0; i < 1600; i++) {
      c.fillStyle = `rgba(120,100,70,${Math.random() * 0.05})`;
      c.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 8, 2 + Math.random() * 8);
    }
    // 淡水河 along the west edge (the world's river side is x < bounds.minx)
    const poly = (p: V2[]) => {
      c.beginPath();
      p.forEach(([x, z], i) => (i ? c.lineTo(this.wx(x), this.wy(z)) : c.moveTo(this.wx(x), this.wy(z))));
      c.closePath();
    };
    const D = d.district;
    // outside 萬華區: neighbouring districts (grey wash); 淡水河・新店溪 along the west/south boundary
    c.fillStyle = D ? '#cfc8b6' : '#7fb0c4';
    c.fillRect(0, 0, S, S);
    if (D) {
      c.fillStyle = '#e8dfc8';
      for (const b of D.boundary) {
        poly(b);
        c.fill();
      }
      c.fillStyle = '#7fb0c4';
      for (const [ax, az, bx, bz, w, nx, nz] of D.river) {
        const o = 140; // outward half-width (district.ts RIVER_W)
        poly([
          [ax + nx * w, az + nz * w],
          [bx + nx * w, bz + nz * w],
          [bx - nx * o, bz - nz * o],
          [ax - nx * o, az - nz * o],
        ]);
        c.fill();
      }
      for (const w of D.water) {
        poly(w);
        c.fill();
      }
      // v24.35 woodland (darker than the parks, which lie in it), inside the districts only
      if (D.wood?.length) {
        c.save();
        c.beginPath();
        for (const b of D.boundary) {
          b.forEach(([x, z], i) => (i ? c.lineTo(this.wx(x), this.wy(z)) : c.moveTo(this.wx(x), this.wy(z))));
          c.closePath();
        }
        c.clip();
        c.fillStyle = '#6f9a5c';
        for (const w of D.wood) {
          poly(w);
          c.fill();
        }
        c.restore();
      }
      c.fillStyle = '#7fa860';
      for (const pk of D.park) {
        poly(pk.p);
        c.fill();
      }
      // v24.35 an airfield: its lawns, what is paved, the paint of the runway
      if (D.air) {
        for (const [list, col] of [
          [D.air.lawn, '#a9c48a'],
          [D.air.paved, '#9a9aa0'],
          [D.air.marks, '#f4f2ea'],
        ] as [V2[][], string][]) {
          c.fillStyle = col;
          for (const q of list) {
            poly(q);
            c.fill();
          }
        }
      }
    } else {
      c.fillStyle = '#e8dfc8';
      c.fillRect(this.wx(d.bounds.minx + 2), 0, S, S);
    }
    const rx = this.wx(d.bounds.minx + 2);
    c.save();
    const rs = D?.river.length ? D.river.reduce((a, q) => (q[1] < a[1] ? q : a)) : null; // northern-most river edge
    if (rs) c.translate(this.wx(rs[0] - rs[5] * 60), this.wy(rs[1] + 200));
    else c.translate(Math.max(60, rx * 0.45), S / 2);
    c.rotate(-Math.PI / 2);
    c.fillStyle = '#1e4e6e';
    c.font = 'italic bold 44px serif';
    c.textAlign = 'center';
    c.fillText(tr('淡 水 河', 'Tamsui River'), 0, 0);
    c.restore();
    for (const p of d.parks) {
      c.fillStyle = '#7fa860';
      c.beginPath();
      c.arc(this.wx(p[0]), this.wy(p[1]), 3.2 * this.k, 0, 7);
      c.fill();
    }
    const RW: Record<string, number> = {
      primary: 14,
      secondary: 12,
      tertiary: 10,
      residential: 7,
      service: 4,
      living_street: 5,
      footway: 2,
      pedestrian: 4,
    };
    for (const b of this.extraB) {
      c.fillStyle = '#c4bda9';
      c.beginPath();
      for (let i = 0; i < b.length; i += 2)
        i ? c.lineTo(this.wx(b[i]), this.wy(b[i + 1])) : c.moveTo(this.wx(b[i]), this.wy(b[i + 1]));
      c.closePath();
      c.fill();
    }
    for (const pass of [0, 1])
      for (const r of [...this.extraR, ...d.roads]) {
        const w = (RW[r.t] ?? 5) * this.k;
        c.strokeStyle = pass ? (w > 9 * this.k ? '#f4efe2' : '#efe9da') : '#8c8576';
        c.lineWidth = w + (pass ? 0 : 2.5);
        c.lineCap = c.lineJoin = 'round';
        c.beginPath();
        r.p.forEach(([x, z], i) => (i ? c.lineTo(this.wx(x), this.wy(z)) : c.moveTo(this.wx(x), this.wy(z))));
        c.stroke();
      }
    for (const b of d.blds) {
      c.fillStyle = ZONE(b);
      c.strokeStyle = '#6a6252';
      c.lineWidth = 1.2;
      c.beginPath();
      b.pts.forEach(([x, z], i) => (i ? c.lineTo(this.wx(x), this.wy(z)) : c.moveTo(this.wx(x), this.wy(z))));
      c.closePath();
      c.fill();
      c.stroke();
    }
    // street names along the longest segment of each named way (one label per name)
    const seen = new Set<string>();
    const named = [...d.roads, ...this.extraR].filter(r => r.n).sort((a, b) => len(b.p) - len(a.p));
    c.font = 'bold 22px "Noto Sans TC", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const r of named) {
      if (seen.has(r.n!)) continue;
      let bi = 0,
        bl = 0;
      for (let i = 0; i < r.p.length - 1; i++) {
        const l = Math.hypot(r.p[i + 1][0] - r.p[i][0], r.p[i + 1][1] - r.p[i][1]);
        if (l > bl) {
          bl = l;
          bi = i;
        }
      }
      if (bl * this.k < r.n!.length * 20) continue;
      seen.add(r.n!);
      const [a, b2] = [r.p[bi], r.p[bi + 1]];
      let ang = Math.atan2(b2[1] - a[1], b2[0] - a[0]);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      c.save();
      c.translate(this.wx((a[0] + b2[0]) / 2), this.wy((a[1] + b2[1]) / 2));
      c.rotate(ang);
      c.lineWidth = 5;
      c.strokeStyle = '#efe9da';
      c.strokeText(r.n!, 0, 0);
      c.fillStyle = '#3a3428';
      c.fillText(r.n!, 0, 0);
      c.restore();
    }
    // 萬華區 boundary + landmarks
    if (D) {
      c.setLineDash([16, 8]);
      c.strokeStyle = 'rgba(120,40,30,.7)';
      c.lineWidth = 4;
      for (const b of D.boundary) {
        poly(b);
        c.stroke();
      }
      c.setLineDash([]);
      c.font = 'bold 26px "Noto Sans TC", serif';
      for (const l of D.landmarks) {
        c.fillStyle = '#8a1f1a';
        c.beginPath();
        c.arc(this.wx(l.x), this.wy(l.z), 8, 0, 7);
        c.fill();
        c.lineWidth = 5;
        c.strokeStyle = '#efe9da';
        c.strokeText('⛩ ' + l.n, this.wx(l.x), this.wy(l.z) - 22);
        c.fillText('⛩ ' + l.n, this.wx(l.x), this.wy(l.z) - 22);
      }
      // v24.33 the name of each district, large and faint across it
      if (D.districts && D.boundary.length > 1) {
        c.font = 'bold 84px "Noto Sans TC", serif';
        c.textAlign = 'center';
        c.fillStyle = 'rgba(120,40,30,.2)';
        D.boundary.forEach((ring, i) => {
          const n = D.districts![i];
          if (!n) return;
          let x = 0,
            z = 0;
          for (const q of ring) ((x += q[0] / ring.length), (z += q[1] / ring.length));
          c.fillText(DISTRICT_NAME[n] ?? n, this.wx(x), this.wy(z));
        });
      }
    }
    c.setLineDash([]);
    // v24.33 metro stations
    c.textAlign = 'center';
    c.font = 'bold 20px "Noto Sans TC", sans-serif';
    for (const st of d.stations ?? []) {
      const x = this.wx(st.x),
        y = this.wy(st.z);
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(x, y, 9, 0, 7);
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = '#e8681c';
      c.stroke();
      c.lineWidth = 4;
      c.strokeStyle = '#efe9da';
      c.strokeText(st.n, x, y + 28);
      c.fillStyle = '#1f5a3a';
      c.fillText(st.n, x, y + 28);
    }
  }
  reveal(x: number, z: number, r = 38) {
    const b = this.d.bounds;
    const cs = (Math.max(b.maxx - b.minx, b.maxz - b.minz) + 80) / FG;
    const gx = (x - this.ox) / cs,
      gz = (z - this.oy) / cs,
      gr = r / cs;
    let ch = false;
    for (let j = Math.max(0, Math.floor(gz - gr)); j <= Math.min(FG - 1, Math.ceil(gz + gr)); j++)
      for (let i = Math.max(0, Math.floor(gx - gr)); i <= Math.min(FG - 1, Math.ceil(gx + gr)); i++) {
        const dd = Math.hypot(i - gx, j - gz) / gr;
        if (dd > 1) continue;
        const v = Math.min(255, Math.round((1 - dd) * 600));
        if (v > this.fogA[j * FG + i]) {
          this.fogA[j * FG + i] = v;
          ch = true;
        }
      }
    if (ch) this.dirty = true;
    return ch;
  }
  revealRect(x0: number, z0: number, x1: number, z1: number) {
    for (let x = x0; x < x1; x += 20) for (let z = z0; z < z1; z += 20) this.reveal(x, z, 30);
  }
  intel(id: string, x: number, z: number, k: string, t: string) {
    if (this.notes.some(n => n.id === id)) return;
    this.notes.push({ x, z, k, t, intel: true, id });
    this.dirty = true;
    this.save();
  }
  save() {
    let f = '';
    for (let i = 0; i < this.fogA.length; i++) f += String.fromCharCode(this.fogA[i]);
    try {
      const b = this.d.bounds;
      writeMapSave({
        n: this.notes,
        f: btoa(f),
        g: [this.ox, this.oy, (Math.max(b.maxx - b.minx, b.maxz - b.minz) + 80) / FG, FG],
      });
    } catch {
      /* quota */
    }
  }
  reset() {
    this.notes = [];
    this.fogA.fill(0);
    this.save();
  }
  private asked = false;
  /**
   * v24.34 the footprints and streets of the districts (3 MB of them by now, forty thousand buildings to draw) are
   * fetched when the map is first opened. They used to come in as the game started, whether the map was looked at or not.
   */
  private loadMore() {
    if (this.asked) return;
    this.asked = true;
    this.d.district?.more?.().then(m => {
      this.extraB = m.b;
      this.extraR = m.r;
      this.drawBase();
      this.dirty = true;
    });
  }
  toggle(on = !this.open) {
    this.open = on;
    this.el.classList.toggle('hidden', !on);
    if (on) {
      this.loadMore();
      this.resize();
      this.center();
    } else this.menu?.remove();
  }
  resize() {
    this.cv.width = innerWidth * Math.min(devicePixelRatio, 2);
    this.cv.height = innerHeight * Math.min(devicePixelRatio, 2);
    this.cv.style.width = innerWidth + 'px';
    this.cv.style.height = innerHeight + 'px';
    this.dirty = true;
  }
  center() {
    const p = this.d.player();
    const r = this.cv.width / innerWidth;
    this.zoom = Math.max(this.zoom, 0.6);
    this.panX = innerWidth / 2 - this.wx(p.x) * this.zoom * 1;
    this.panY = innerHeight / 2 - this.wy(p.z) * this.zoom;
    void r;
    this.dirty = true;
  }
  /** whole 萬華區 in view */
  fit() {
    this.zoom = Math.min(innerWidth, innerHeight - 60) / this.S;
    this.panX = (innerWidth - this.S * this.zoom) / 2;
    this.panY = 50;
    this.dirty = true;
  }
  zoomAt(f: number, sx: number, sy: number) {
    const z2 = Math.min(4, Math.max(0.12, this.zoom * f));
    f = z2 / this.zoom;
    this.panX = sx - (sx - this.panX) * f;
    this.panY = sy - (sy - this.panY) * f;
    this.zoom = z2;
    this.dirty = true;
  }
  toWorld(sx: number, sy: number): V2 {
    return [(sx - this.panX) / this.zoom / this.k + this.ox, (sy - this.panY) / this.zoom / this.k + this.oy];
  }
  input() {
    const ps = new Map<number, [number, number]>();
    let moved = 0,
      pinch = 0;
    this.cv.style.touchAction = 'none';
    this.cv.addEventListener('pointerdown', e => {
      ps.set(e.pointerId, [e.clientX, e.clientY]);
      moved = 0;
      this.cv.setPointerCapture(e.pointerId);
      this.menu?.remove();
    });
    this.cv.addEventListener('pointermove', e => {
      const o = ps.get(e.pointerId);
      if (!o) return;
      if (ps.size === 2) {
        const [a, b] = [...ps.values()];
        const d0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
        ps.set(e.pointerId, [e.clientX, e.clientY]);
        const [c2, d2] = [...ps.values()];
        const d1 = Math.hypot(c2[0] - d2[0], c2[1] - d2[1]);
        if (d0 > 0) this.zoomAt(d1 / d0, (c2[0] + d2[0]) / 2, (c2[1] + d2[1]) / 2);
        pinch = 1;
        moved = 99;
        return;
      }
      const dx = e.clientX - o[0],
        dy = e.clientY - o[1];
      moved += Math.abs(dx) + Math.abs(dy);
      this.panX += dx;
      this.panY += dy;
      ps.set(e.pointerId, [e.clientX, e.clientY]);
      this.dirty = true;
    });
    const up = (e: PointerEvent) => {
      if (!ps.has(e.pointerId)) return;
      ps.delete(e.pointerId);
      if (moved < 6 && !pinch) this.tap(e.clientX, e.clientY);
      if (!ps.size) pinch = 0;
    };
    this.cv.addEventListener('pointerup', up);
    this.cv.addEventListener('pointercancel', e => ps.delete(e.pointerId));
    this.cv.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        this.zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
      },
      { passive: false },
    );
  }
  tap(sx: number, sy: number) {
    const [x, z] = this.toWorld(sx, sy);
    const hit = this.notes.findIndex(n => Math.hypot(n.x - x, n.z - z) * this.k * this.zoom < 16);
    const m = document.createElement('div');
    m.className = 'mmenu';
    m.style.left = Math.min(sx, innerWidth - 170) + 'px';
    m.style.top = Math.min(sy, innerHeight - 200) + 'px';
    if (hit >= 0) {
      const n = this.notes[hit];
      m.innerHTML = `<b style="color:${KINDS[n.k][1]}">${KINDS[n.k][0]}</b>${n.t ? `<p>${n.t}</p>` : ''}`;
      if (!n.intel) {
        const b = document.createElement('button');
        b.textContent = tr('刪除註記', 'Delete note');
        b.onclick = () => {
          this.notes.splice(hit, 1);
          this.save();
          m.remove();
          this.dirty = true;
        };
        m.appendChild(b);
      }
    } else
      for (const k of ['sup', 'dng', 'evac', 'safe']) {
        const b = document.createElement('button');
        b.innerHTML = `<em style="color:${KINDS[k][1]}">●</em> ${KINDS[k][0]}`;
        b.onclick = () => {
          this.notes.push({ x, z, k });
          this.save();
          m.remove();
          this.dirty = true;
        };
        m.appendChild(b);
      }
    this.el.appendChild(m);
    this.menu = m;
  }
  update() {
    const p = this.d.player();
    if (this.reveal(p.x, p.z)) {
      if (Math.random() < 0.02) this.save();
    }
    if (this.open) this.draw();
  }
  draw() {
    const c = this.cv.getContext('2d')!,
      r = this.cv.width / innerWidth,
      d = this.d;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#2a2620';
    c.fillRect(0, 0, this.cv.width, this.cv.height);
    c.setTransform(r * this.zoom, 0, 0, r * this.zoom, r * this.panX, r * this.panY);
    c.drawImage(this.base, 0, 0);
    const b = d.bounds,
      L = d.liberated();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const key = [...L].sort().join(',');
    if (!this.secCv || key !== this.secKey) {
      // low-res nearest-anchor raster, tinted by 奪回/佔領 state
      // v24.33 finer (the map is nearly twice as long), and only where there is a district: the tint and the lines
      // between areas no longer run out across the land that is not in the map
      const N = 320,
        cv = (this.secCv ||= document.createElement('canvas'));
      const rings = d.district?.boundary;
      const inMap = (x: number, z: number) => {
        if (!rings) return true;
        for (const r of rings) {
          let c = false;
          for (let a = 0, b = r.length - 1; a < r.length; b = a++)
            if (
              r[a][1] > z !== r[b][1] > z &&
              x < ((r[b][0] - r[a][0]) * (z - r[a][1])) / (r[b][1] - r[a][1]) + r[a][0]
            )
              c = !c;
          if (c) return true;
        }
        return false;
      };
      cv.width = cv.height = N;
      const sc = cv.getContext('2d')!,
        im = sc.createImageData(N, N);
      const cs = this.S / this.k / N;
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const x = this.ox + (i + 0.5) * cs,
            z = this.oy + (j + 0.5) * cs;
          const o = (j * N + i) * 4;
          if (!inMap(x, z)) continue; // (left transparent)
          const si = d.sectorOf(x, z),
            e = d.sectorOf(x + cs, z) !== si || d.sectorOf(x, z + cs) !== si;
          const lib = L.has(si);
          im.data.set(e ? [110, 70, 50, 120] : lib ? [60, 170, 70, 44] : [200, 40, 30, 32], o);
        }
      sc.putImageData(im, 0, 0);
      this.secKey = key;
    }
    c.imageSmoothingEnabled = false;
    c.drawImage(this.secCv, 0, 0, this.S, this.S);
    d.sectors.forEach((q, s) => {
      c.font = 'bold 34px "Noto Sans TC", sans-serif';
      c.lineWidth = 6;
      c.strokeStyle = 'rgba(239,233,218,.85)';
      const t = `${d.sectorName(s)}（${L.has(s) ? tr('已奪回', 'Liberated') : tr('佔領中', 'Occupied')}）`;
      c.strokeText(t, this.wx(q.x), this.wy(q.z));
      c.fillStyle = L.has(s) ? 'rgba(30,110,40,.9)' : 'rgba(150,30,20,.85)';
      c.fillText(t, this.wx(q.x), this.wy(q.z));
    });
    // fog of war
    if (this.dirty) {
      const fc = this.fog.getContext('2d')!;
      const im = fc.createImageData(FG, FG);
      for (let i = 0; i < FG * FG; i++) {
        im.data[i * 4] = 34;
        im.data[i * 4 + 1] = 30;
        im.data[i * 4 + 2] = 26;
        im.data[i * 4 + 3] = 255 - Math.min(255, this.fogA[i]) * 0.92;
      }
      fc.putImageData(im, 0, 0);
      this.dirty = false;
    }
    c.imageSmoothingEnabled = true;
    c.drawImage(this.fog, 0, 0, this.S, this.S);
    const pin = (x: number, z: number, col: string, t?: string, sq = false) => {
      const X = this.wx(x),
        Y = this.wy(z),
        R = 9 / this.zoom;
      c.fillStyle = col;
      c.strokeStyle = '#fff';
      c.lineWidth = 2.5 / this.zoom;
      c.beginPath();
      if (sq) c.rect(X - R, Y - R, R * 2, R * 2);
      else c.arc(X, Y, R, 0, 7);
      c.fill();
      c.stroke();
      if (t) {
        c.font = `bold ${15 / this.zoom}px sans-serif`;
        c.lineWidth = 4 / this.zoom;
        c.strokeStyle = '#efe9da';
        c.strokeText(t, X, Y - R * 2);
        c.fillStyle = col;
        c.fillText(t, X, Y - R * 2);
      }
    };
    for (const n of this.notes) pin(n.x, n.z, KINDS[n.k][1], n.intel ? n.t?.slice(0, 10) : KINDS[n.k][0], n.intel);
    const ev = d.evac();
    if (ev && this.notes.some(n => n.k === 'evac' && n.intel))
      pin(ev[0], ev[1], KINDS.evac[1], tr('撤離點', 'Evacuation point'), true);
    const hm = d.home();
    if (hm) pin(hm[0], hm[1], KINDS.safe[1], tr('起點', 'Starting point'));
    const p = d.player();
    const X = this.wx(p.x),
      Y = this.wy(p.z),
      R = 13 / this.zoom;
    c.save();
    c.translate(X, Y);
    c.rotate(-p.rot + Math.PI);
    c.fillStyle = '#ffd040';
    c.strokeStyle = '#000';
    c.lineWidth = 2 / this.zoom;
    c.beginPath();
    c.moveTo(0, -R);
    c.lineTo(R * 0.7, R * 0.8);
    c.lineTo(0, R * 0.4);
    c.lineTo(-R * 0.7, R * 0.8);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
}
const len = (p: V2[]) => {
  let s = 0;
  for (let i = 0; i < p.length - 1; i++) s += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
  return s;
};
