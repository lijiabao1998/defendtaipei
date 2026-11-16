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
  /** v24.37 the areas are three sets of nearest-anchor regions: the 萬華 campaign's [0, sets[0]), those of the districts
   * of v24.33 – v24.36 [sets[0], sets[1]) and those of v24.37 [sets[1], …); areaSet tells which set a point is in */
  sets?: [number, number];
  areaSet?: (x: number, z: number) => number;
  /** v24.37 the core box: the campaign's areas reach past 萬華's boundary inside it */
  core?: { minx: number; maxx: number; minz: number; maxz: number };
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
    more?: () => Promise<{ b: number[][]; r: MapRoad[]; w?: V2[][] }>;
  };
  /** v24.33 metro stations (their first street exit) */
  stations?: { n: string; x: number; z: number }[];
  liberated: () => Set<number>;
  /** (v24.37 under: down in a station, where x, z is the street above it: nothing is uncovered there) */
  player: () => { x: number; z: number; rot: number; under?: boolean };
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
  士林區: tr('士林區', 'Shilin'),
  內湖區: tr('內湖區', 'Neihu'),
  文山區: tr('文山區', 'Wenshan'),
  南港區: tr('南港區', 'Nangang'),
  北投區: tr('北投區', 'Beitou'),
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
/** v24.37 px to the metre past which the view is drawn again, sharp (drawNear) */
const NEAR = 0.3;
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
    // v24.37 the core's streets and their names close up from the first open (they were drawn only once map.json had
    // come, and not at all if it did not)
    this.bucket();
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
      // v24.35 woodland (darker than the parks, which lie in it), inside the districts only. Since v24.36 it comes
      // with the footprints, when the map is first opened (the woods of 陽明山 are not something to load at the start)
      const woods = D.wood ?? this.extraW;
      if (woods?.length) {
        c.save();
        c.beginPath();
        for (const b of D.boundary) {
          b.forEach(([x, z], i) => (i ? c.lineTo(this.wx(x), this.wy(z)) : c.moveTo(this.wx(x), this.wy(z))));
          c.closePath();
        }
        c.clip();
        c.fillStyle = '#6f9a5c';
        for (const w of woods) {
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
    // v24.37 with the districts, what is written on the map and the lines of the boundaries are drawn with the frame
    // (drawOver), at the size of the screen: on the paper they were magnified with it, fourteen times at the closest,
    // and the name of a station was a green cloud across three streets
    if (!D) {
      const rx = this.wx(d.bounds.minx + 2);
      c.save();
      c.translate(Math.max(60, rx * 0.45), S / 2);
      c.rotate(-Math.PI / 2);
      c.fillStyle = '#1e4e6e';
      c.font = 'italic bold 44px serif';
      c.textAlign = 'center';
      c.fillText(tr('淡 水 河', 'Tamsui River'), 0, 0);
      c.restore();
    }
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
    // (street names: close up they are drawn with the view, drawNear)
    const named = D ? [] : [...d.roads, ...this.extraR].filter(r => r.n).sort((a, b) => len(b.p) - len(a.p));
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
    c.setLineDash([]);
    // v24.33 metro stations
    c.textAlign = 'center';
    c.font = 'bold 20px "Noto Sans TC", sans-serif';
    for (const st of D ? [] : (d.stations ?? [])) {
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
    // v24.37 with the whole city on the grid a cell is 62 m, and a person on foot uncovers 38 m around them. A cell
    // was measured from its corner: when the radius is shorter than the way from the middle of a cell to its
    // corners, walking through the middle of a cell uncovered nothing at all. A cell is measured from its middle (as
    // it is drawn), and the one the point is in is always uncovered.
    const ci = Math.floor(gx),
      cj = Math.floor(gz);
    let ch = false;
    for (let j = Math.max(0, Math.floor(gz - gr - 0.5)); j <= Math.min(FG - 1, Math.ceil(gz + gr)); j++)
      for (let i = Math.max(0, Math.floor(gx - gr - 0.5)); i <= Math.min(FG - 1, Math.ceil(gx + gr)); i++) {
        const here = i === ci && j === cj;
        const dd = Math.hypot(i + 0.5 - gx, j + 0.5 - gz) / gr;
        if (dd > 1 && !here) continue;
        const v = here ? 255 : Math.min(255, Math.round((1 - dd) * 600));
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
  private extraW: V2[][] | null = null;
  /**
   * v24.34 the footprints and streets of the districts (3 MB of them by now, forty thousand buildings to draw) are
   * fetched when the map is first opened. They used to come in as the game started, whether the map was looked at or not.
   */
  private loadMore() {
    if (this.asked) return;
    this.asked = true;
    this.d.district
      ?.more?.()
      .then(m => {
        this.extraB = m.b;
        this.extraR = m.r;
        this.extraW = m.w ?? null;
        this.bucket();
        this.drawBase();
        this.dirty = true;
      })
      .catch(() => {
        this.asked = false; // (tried again the next time the map is opened)
      });
  }
  toggle(on = !this.open) {
    this.open = on;
    this.el.classList.toggle('hidden', !on);
    if (on) {
      this.loadMore();
      this.resize();
      this.center();
    } else {
      this.menu?.remove();
      this.dropNear();
    }
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
    // (v24.37: by the ground, not by the canvas — 0.4 px to the metre, which is the 0.6 it was when the map was 萬華)
    this.zoom = Math.max(this.zoom, 0.4 / this.k);
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
    // v24.37 as close as 1.6 px to the metre whatever the size of the map (close up it is drawn again: drawNear)
    const z2 = Math.min(Math.max(4, 1.6 / this.k), Math.max(0.12, this.zoom * f));
    f = z2 / this.zoom;
    if (f !== 1) this.zoomT = performance.now();
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
  // ---- v24.37 close up. The paper is one canvas for the whole city: 28 km of it on 3072 px is 9 m to the pixel,
  // which is a blur as soon as it is magnified. Past NEAR px to the metre what is in view is drawn again at the size
  // of the screen, into a canvas a little larger than the view that is kept until the view leaves it or the zoom
  // changes (the map is redrawn every frame while it is open). It covers the paper: the ground (the districts, the
  // rivers and the water, the woods, the parks, the airfield), the streets, the footprints and the street names. (It
  // used to be the streets and the footprints alone, over the paper, whose blurred road edges and outlines showed
  // through between them as dark bands.)
  private near: HTMLCanvasElement | null = null;
  /** what the cache holds: the ground it covers, the px to the metre (s) and device px to the CSS px (r) it was drawn
   * for, and q < 1 when it was drawn smaller than that (a canvas is kept under 16 million pixels: WebKit leaves a
   * larger one blank) */
  private nearView = { x0: 0, z0: 0, x1: 0, z1: 0, s: 0, r: 0, q: 1 };
  private bG: Map<string, number[]> | null = null;
  private rG: Map<string, number[]> | null = null;
  /** the boxes of the parks, the water, the woods and the core's roads (what is drawn close up is what is in view) */
  private landBox: { park: number[][]; water: number[][]; wood: number[][]; road: number[][] } | null = null;
  /** when the zoom last changed: while it is changing the cache is drawn scaled, and again sharp when it settles */
  private zoomT = 0;
  nearStats = { draws: 0, blds: 0, roads: 0, streets: 0, ms: 0 };
  /** how many streets' names drawOver wrote in the last frame (below NEAR) */
  overStats = { names: 0 };
  /** the streets' names for the zoom between the whole city and NEAR: per name and square kilometre, its longest
   * straight stretch (drawOver draws those that fit on the screen) */
  private farNames: { n: string; x: number; z: number; a: number; l: number }[] = [];
  private nameW = new Map<string, number>();
  private bucket() {
    const G = 400;
    const put = (m: Map<string, number[]>, x0: number, z0: number, x1: number, z1: number, i: number) => {
      for (let x = Math.floor(x0 / G); x <= Math.floor(x1 / G); x++)
        for (let z = Math.floor(z0 / G); z <= Math.floor(z1 / G); z++) {
          const k = x + ',' + z;
          (m.get(k) || m.set(k, []).get(k)!).push(i);
        }
    };
    const box = (pts: V2[]) => {
      let x0 = 1e9,
        z0 = 1e9,
        x1 = -1e9,
        z1 = -1e9;
      for (const [x, z] of pts) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
      return [x0, z0, x1, z1];
    };
    this.bG = new Map();
    this.rG = new Map();
    this.extraB.forEach((b, i) => {
      let x0 = 1e9,
        z0 = 1e9,
        x1 = -1e9,
        z1 = -1e9;
      for (let j = 0; j < b.length; j += 2) {
        if (b[j] < x0) x0 = b[j];
        if (b[j] > x1) x1 = b[j];
        if (b[j + 1] < z0) z0 = b[j + 1];
        if (b[j + 1] > z1) z1 = b[j + 1];
      }
      put(this.bG!, x0, z0, x1, z1, i);
    });
    this.extraR.forEach((r, i) => {
      const [x0, z0, x1, z1] = box(r.p);
      put(this.rG!, x0, z0, x1, z1, i);
    });
    const D = this.d.district;
    this.landBox = {
      park: (D?.park ?? []).map(q => box(q.p)),
      water: (D?.water ?? []).map(box),
      wood: (D?.wood ?? this.extraW ?? []).map(box),
      road: this.d.roads.map(q => box(q.p)),
    };
    // the names for the middle zoom
    const best = new Map<string, { n: string; x: number; z: number; a: number; l: number }>();
    for (const rd of [...this.d.roads, ...this.extraR]) {
      // (the main roads: every street with a long enough stretch, at this zoom, is a page of names)
      if (!rd.n || !/^(trunk|primary|secondary|tertiary)/.test(rd.t)) continue;
      for (let i = 0; i < rd.p.length - 1; i++) {
        const a = rd.p[i],
          b = rd.p[i + 1];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (l < 60) continue;
        const x = (a[0] + b[0]) / 2,
          z = (a[1] + b[1]) / 2;
        const key = rd.n + ',' + Math.floor(x / 1000) + ',' + Math.floor(z / 1000);
        if (l <= (best.get(key)?.l ?? 0)) continue;
        let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;
        best.set(key, { n: rd.n, x, z, a: ang, l });
      }
    }
    this.farNames = [...best.values()].sort((p, q) => q.l - p.l);
    this.dropNear();
  }
  /** let the cache go (it is as large as 2¼ screens) */
  private dropNear() {
    if (this.near) this.near.width = this.near.height = 0;
    this.near = null;
  }
  /** the width of a street's name at 12.5 CSS px */
  private nameWidth(t: string) {
    let w = this.nameW.get(t);
    if (w === undefined) {
      const c = (GameMap.measure ||= document.createElement('canvas').getContext('2d')!);
      c.font = 'bold 12.5px "Noto Sans TC", sans-serif';
      this.nameW.set(t, (w = c.measureText(t).width));
    }
    return w;
  }
  private static measure: CanvasRenderingContext2D | null = null;
  /**
   * v24.37 the ground in world coordinates, under the current transform, for what lies in the box bx: the paper, the
   * districts, the river along the boundary and the water, the woods (inside the districts), the parks, the airfield.
   * The same as drawBase draws on the paper, before the streets.
   */
  private paintLand(n: CanvasRenderingContext2D, bx: number[]) {
    const D = this.d.district,
      lb = this.landBox!;
    const hit = (b: number[]) => b[2] >= bx[0] && b[0] <= bx[2] && b[3] >= bx[1] && b[1] <= bx[3];
    const poly = (p: V2[]) => {
      n.beginPath();
      p.forEach(([x, z], i) => (i ? n.lineTo(x, z) : n.moveTo(x, z)));
      n.closePath();
    };
    // only where the paper is (outside it the map is dark)
    const px0 = this.ox,
      pz0 = this.oy,
      px1 = this.ox + this.S / this.k,
      pz1 = this.oy + this.S / this.k;
    n.save();
    n.beginPath();
    n.rect(px0, pz0, px1 - px0, pz1 - pz0);
    n.clip();
    n.fillStyle = D ? '#cfc8b6' : '#7fb0c4';
    n.fillRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]);
    if (D) {
      n.fillStyle = '#e8dfc8';
      for (const ring of D.boundary) {
        poly(ring);
        n.fill();
      }
      n.fillStyle = '#7fb0c4';
      for (const [ax, az, bx2, bz, w, nx, nz] of D.river) {
        const o = 140; // outward half-width (district.ts RIVER_W)
        if (Math.max(ax, bx2) + 160 < bx[0] || Math.min(ax, bx2) - 160 > bx[2]) continue;
        if (Math.max(az, bz) + 160 < bx[1] || Math.min(az, bz) - 160 > bx[3]) continue;
        poly([
          [ax + nx * w, az + nz * w],
          [bx2 + nx * w, bz + nz * w],
          [bx2 - nx * o, bz - nz * o],
          [ax - nx * o, az - nz * o],
        ]);
        n.fill();
      }
      D.water.forEach((w, i) => {
        if (!hit(lb.water[i])) return;
        poly(w);
        n.fill();
      });
      const woods = D.wood ?? this.extraW;
      if (woods?.length) {
        n.save();
        n.beginPath();
        for (const ring of D.boundary) {
          ring.forEach(([x, z], i) => (i ? n.lineTo(x, z) : n.moveTo(x, z)));
          n.closePath();
        }
        n.clip();
        n.fillStyle = '#6f9a5c';
        woods.forEach((w, i) => {
          if (lb.wood[i] && !hit(lb.wood[i])) return;
          poly(w);
          n.fill();
        });
        n.restore();
      }
      n.fillStyle = '#7fa860';
      D.park.forEach((pk, i) => {
        if (!hit(lb.park[i])) return;
        poly(pk.p);
        n.fill();
      });
      if (D.air)
        for (const [list, col] of [
          [D.air.lawn, '#a9c48a'],
          [D.air.paved, '#9a9aa0'],
          [D.air.marks, '#f4f2ea'],
        ] as [V2[][], string][]) {
          n.fillStyle = col;
          for (const q of list) {
            poly(q);
            n.fill();
          }
        }
    } else {
      n.fillStyle = '#e8dfc8';
      n.fillRect(this.d.bounds.minx + 2, bx[1], bx[2] - this.d.bounds.minx - 2, bx[3] - bx[1]);
    }
    n.fillStyle = '#7fa860';
    for (const p of this.d.parks) {
      if (p[0] < bx[0] - 4 || p[0] > bx[2] + 4 || p[1] < bx[1] - 4 || p[1] > bx[3] + 4) continue;
      n.beginPath();
      n.arc(p[0], p[1], 3.2, 0, 7);
      n.fill();
    }
    n.restore();
  }
  /** called under the view transform, after the paper; leaves the transform as it found it */
  private drawNear(c: CanvasRenderingContext2D, r: number) {
    const s = this.k * this.zoom; // screen px to the metre
    if (s < NEAR || !this.bG || !this.rG || !this.landBox || !this.d.district) return;
    const [vx0, vz0] = this.toWorld(0, 0),
      [vx1, vz1] = this.toWorld(innerWidth, innerHeight);
    const v = this.nearView;
    // while the zoom is changing (a pinch, a trackpad, the wheel) the cache is drawn scaled: each step of the zoom
    // drew it all again (75–360 ms on a large screen near NEAR), so a pinch redrew it on every frame
    if (this.near && v.r === r && v.s !== s && s / v.s > 0.5 && s / v.s < 2 && performance.now() - this.zoomT < 150)
      return this.blit(c, r, s);
    if (!this.near || v.s !== s || v.r !== r || vx0 < v.x0 || vz0 < v.z0 || vx1 > v.x1 || vz1 > v.z1) {
      const t0 = performance.now();
      // (a margin of a quarter of the view, less where that would pass 16 million pixels; past it even with no margin,
      // as on a 5K screen, drawn smaller and stretched)
      const view = (vx1 - vx0) * (vz1 - vz0) * (s * r) ** 2;
      const m = Math.max(0, Math.min(0.25, (Math.sqrt(16e6 / view) - 1) / 2));
      const mx = (vx1 - vx0) * m,
        mz = (vz1 - vz0) * m;
      const W = (vx1 - vx0 + 2 * mx) * s * r,
        H = (vz1 - vz0 + 2 * mz) * s * r;
      const q = Math.min(1, Math.sqrt(16e6 / (W * H)));
      Object.assign(v, { x0: vx0 - mx, z0: vz0 - mz, x1: vx1 + mx, z1: vz1 + mz, s, r, q });
      const cv = (this.near ||= document.createElement('canvas'));
      cv.width = Math.ceil(W * q);
      cv.height = Math.ceil(H * q);
      const n = cv.getContext('2d')!;
      const k = s * r * q; // canvas px to the metre
      n.setTransform(k, 0, 0, k, -v.x0 * k, -v.z0 * k);
      const vb = [v.x0, v.z0, v.x1, v.z1];
      this.paintLand(n, vb);
      const G = 400;
      const ids = (m: Map<string, number[]>) => {
        const out = new Set<number>();
        for (let x = Math.floor(v.x0 / G); x <= Math.floor(v.x1 / G); x++)
          for (let z = Math.floor(v.z0 / G); z <= Math.floor(v.z1 / G); z++)
            for (const i of m.get(x + ',' + z) || []) out.add(i);
        return out;
      };
      const RW: Record<string, number> = {
        trunk: 16,
        primary: 14,
        secondary: 12,
        tertiary: 10,
        residential: 7,
        unclassified: 7,
        service: 4,
        living_street: 5,
        footway: 2,
        pedestrian: 4,
      };
      const lb = this.landBox;
      const ext = [...ids(this.rG)].map(i => this.extraR[i]);
      const rs = ext.concat(
        this.d.roads.filter(
          (_, i) => lb.road[i][2] >= v.x0 && lb.road[i][0] <= v.x1 && lb.road[i][3] >= v.z0 && lb.road[i][1] <= v.z1,
        ),
      );
      n.lineCap = n.lineJoin = 'round';
      for (const pass of [0, 1])
        for (const rd of rs) {
          const w = RW[rd.t] ?? 5;
          n.strokeStyle = pass ? (w > 9 ? '#f4efe2' : '#efe9da') : '#8c8576';
          n.lineWidth = Math.max(w, 1.2 / k) + (pass ? 0 : 1.6 / k);
          n.beginPath();
          rd.p.forEach(([x, z], i) => (i ? n.lineTo(x, z) : n.moveTo(x, z)));
          n.stroke();
        }
      const bs = ids(this.bG);
      n.fillStyle = '#c4bda9';
      n.strokeStyle = '#9a927e';
      n.lineWidth = 0.8 / k;
      for (const i of bs) {
        const b = this.extraB[i];
        n.beginPath();
        for (let j = 0; j < b.length; j += 2) j ? n.lineTo(b[j], b[j + 1]) : n.moveTo(b[j], b[j + 1]);
        n.closePath();
        n.fill();
        n.stroke();
      }
      n.strokeStyle = '#6a6252';
      n.lineWidth = 1.2 / k;
      for (const b of this.d.blds) {
        const q0 = b.pts[0];
        if (q0[0] < v.x0 - 80 || q0[0] > v.x1 + 80 || q0[1] < v.z0 - 80 || q0[1] > v.z1 + 80) continue;
        n.fillStyle = ZONE(b);
        n.beginPath();
        b.pts.forEach(([x, z], i) => (i ? n.lineTo(x, z) : n.moveTo(x, z)));
        n.closePath();
        n.fill();
        n.stroke();
      }
      // street names: on the longest stretch of each street within every 300 px of the screen, over all the cache (it
      // was only what was in view, and a small drag showed streets with no names), so they stay where they are when
      // the cache is drawn again at the same zoom; where they fit, measured (the names are Chinese: an em a character)
      const hw = 60 / s,
        cell = 300 / s;
      const best = new Map<string, [V2, V2, number, string]>();
      for (const rd of rs) {
        if (!rd.n) continue;
        for (let i = 0; i < rd.p.length - 1; i++) {
          const a = rd.p[i],
            b = rd.p[i + 1];
          const mx2 = (a[0] + b[0]) / 2,
            mz2 = (a[1] + b[1]) / 2;
          if (mx2 < v.x0 + hw || mx2 > v.x1 - hw || mz2 < v.z0 + hw || mz2 > v.z1 - hw) continue;
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const key = rd.n + ',' + Math.floor(mx2 / cell) + ',' + Math.floor(mz2 / cell);
          if (l > (best.get(key)?.[2] ?? 0)) best.set(key, [a, b, l, rd.n]);
        }
      }
      const fs = 12.5 * r * q;
      n.setTransform(1, 0, 0, 1, 0, 0);
      n.font = `bold ${fs}px "Noto Sans TC", sans-serif`;
      n.textAlign = 'center';
      n.textBaseline = 'middle';
      n.lineWidth = 3 * r * q;
      n.strokeStyle = 'rgba(239,233,218,.9)';
      n.fillStyle = '#4a4436';
      const placed = new Map<string, V2[]>();
      const order = [...best.entries()].sort((p, o) => o[1][2] - p[1][2] || (p[0] < o[0] ? -1 : 1)).map(e => e[1]);
      for (const [a, b, l, t] of order) {
        if (l * s < this.nameWidth(t) + 6) continue;
        const X = ((a[0] + b[0]) / 2 - v.x0) * k,
          Y = ((a[1] + b[1]) / 2 - v.z0) * k;
        const mine = placed.get(t) || placed.set(t, []).get(t)!;
        if (mine.some(o => Math.hypot(o[0] - X, o[1] - Y) < 250 * r * q)) continue;
        mine.push([X, Y]);
        let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        if (ang > Math.PI / 2) ang -= Math.PI;
        if (ang < -Math.PI / 2) ang += Math.PI;
        n.save();
        n.translate(X, Y);
        n.rotate(ang);
        n.strokeText(t, 0, 0);
        n.fillText(t, 0, 0);
        n.restore();
      }
      this.nearStats = {
        draws: this.nearStats.draws + 1,
        blds: bs.size,
        roads: rs.length,
        streets: ext.length,
        ms: Math.round(performance.now() - t0),
      };
    }
    this.blit(c, r, s);
  }
  /** the cache onto the map: pixel for pixel when it can be (no resampling, so the names do not shimmer), else scaled */
  private blit(c: CanvasRenderingContext2D, r: number, s: number) {
    const v = this.nearView;
    const dx = ((v.x0 - this.ox) * s + this.panX) * r,
      dy = ((v.z0 - this.oy) * s + this.panY) * r;
    const exact = v.s === s && v.r === r && v.q === 1;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = !exact;
    if (exact) c.drawImage(this.near!, Math.round(dx), Math.round(dy));
    else c.drawImage(this.near!, dx, dy, (v.x1 - v.x0) * s * r, (v.z1 - v.z0) * s * r);
    c.restore();
  }
  /** v24.37 the lines between areas, [ax, az, bx, bz] in the world (made once: they do not change as areas are taken) */
  secLines: number[][] | null = null;
  /**
   * v24.37 the lines between areas. An area is what lies nearest to its anchor among the anchors of its set (the 萬華
   * campaign's, those of the districts of v24.33 – v24.36, those of v24.37: deps.areaSet), so the line between two of
   * them is a stretch of the perpendicular bisector of their anchors. How far along it the two stay the nearest pair
   * follows from the other anchors of the set; where along that the land is in the map and in the set is found by
   * walking it, and the ends to a metre. (The lines were the raster's own cells, darker, and then stretches the raster
   * had seen, padded: up to 60 m past the city's edge or a cell short of it.) Where the campaign's areas meet the others
   * away from any district's boundary, along the edge of the core box in 中正區, a line is drawn too.
   */
  private between(): number[][] {
    const d = this.d,
      S = d.sectors;
    const set = d.areaSet ?? (() => 0);
    const [n1, n2] = d.sets ?? [S.length, S.length];
    const ranges = [
      [0, n1],
      [n1, n2],
      [n2, S.length],
    ];
    const inMap = this.inMapFn();
    const at = (x: number, z: number, k: number) => (k === 0 ? inMap(x, z) && set(x, z) === 0 : set(x, z) === k);
    const B = d.bounds;
    const out: number[][] = [];
    const STEP = 20;
    for (let k = 0; k < 3; k++) {
      const [i0, i1] = ranges[k];
      for (let a = i0; a < i1; a++)
        for (let b = a + 1; b < i1; b++) {
          const A = S[a],
            Q = S[b];
          const L = Math.hypot(Q.x - A.x, Q.z - A.z);
          if (L < 1e-6) continue;
          const ux = -(Q.z - A.z) / L,
            uz = (Q.x - A.x) / L; // along the bisector
          const mx = (A.x + Q.x) / 2,
            mz = (A.z + Q.z) / 2;
          // how far along it these two are the nearest: for a point M + t·u and a third anchor C of the same set,
          // |P − A|² ≤ |P − C|² is 2t u·(C − A) ≤ |C − M|² − |A − M|²
          let lo = -1e9,
            hi = 1e9;
          const am = (A.x - mx) ** 2 + (A.z - mz) ** 2;
          for (let c = i0; c < i1 && lo < hi; c++) {
            if (c === a || c === b) continue;
            const C = S[c];
            const q = 2 * (ux * (C.x - A.x) + uz * (C.z - A.z)),
              w = (C.x - mx) ** 2 + (C.z - mz) ** 2 - am;
            if (Math.abs(q) < 1e-9) {
              if (w < 0) hi = -1e9;
            } else if (q > 0) hi = Math.min(hi, w / q);
            else lo = Math.max(lo, w / q);
          }
          // and within the box of the map
          for (const [p, dp, m0, m1] of [
            [mx, ux, B.minx, B.maxx],
            [mz, uz, B.minz, B.maxz],
          ]) {
            if (Math.abs(dp) < 1e-9) {
              if (p < m0 || p > m1) hi = -1e9;
              continue;
            }
            const ta = (m0 - p) / dp,
              tb = (m1 - p) / dp;
            lo = Math.max(lo, Math.min(ta, tb));
            hi = Math.min(hi, Math.max(ta, tb));
          }
          if (lo >= hi) continue;
          const ok = (t: number) => at(mx + ux * t, mz + uz * t, k);
          const push = (t0: number, t1: number) => {
            if (t1 - t0 > 0.5) out.push([mx + ux * t0, mz + uz * t0, mx + ux * t1, mz + uz * t1]);
          };
          let pt = lo,
            po = ok(lo),
            start = lo;
          for (let t = lo + STEP; ; t += STEP) {
            const tt = Math.min(t, hi);
            const o = ok(tt);
            if (o !== po) {
              let t0 = pt,
                t1 = tt;
              for (let it = 0; it < 6; it++) {
                const m = (t0 + t1) / 2;
                if (ok(m) === po) t0 = m;
                else t1 = m;
              }
              const e = (t0 + t1) / 2;
              if (o) start = e;
              else push(start, e);
            }
            pt = tt;
            po = o;
            if (tt >= hi) break;
          }
          if (po) push(start, hi);
        }
    }
    // the edge of the core box where it reaches into 中正區: the campaign's areas on the inside, the others outside
    const C = d.core;
    if (C && d.district)
      for (const [ax, az, bx, bz, nx, nz] of [
        [C.minx, C.minz, C.maxx, C.minz, 0, -1],
        [C.maxx, C.minz, C.maxx, C.maxz, 1, 0],
        [C.maxx, C.maxz, C.minx, C.maxz, 0, 1],
        [C.minx, C.maxz, C.minx, C.minz, -1, 0],
      ]) {
        const len = Math.hypot(bx - ax, bz - az);
        const on = (t: number) => {
          const x = ax + ((bx - ax) * t) / len,
            z = az + ((bz - az) * t) / len;
          return at(x - nx, z - nz, 0) && set(x + nx, z + nz) !== 0;
        };
        /** where `on` changes between t0 (as `was`) and t1, to a few centimetres */
        const edge = (t0: number, t1: number, was: boolean) => {
          for (let it = 0; it < 7; it++) {
            const m = (t0 + t1) / 2;
            if (on(m) === was) t0 = m;
            else t1 = m;
          }
          return (t0 + t1) / 2;
        };
        let start = -1,
          prev = 0,
          po = on(0);
        if (po) start = 0;
        for (let t = 5; ; t += 5) {
          const tt = Math.min(t, len);
          const o = on(tt);
          if (o && !po) start = edge(prev, tt, false);
          if ((!o || tt >= len) && start >= 0 && (po || o)) {
            const e = o ? tt : edge(prev, tt, true);
            if (e - start > 0.5)
              out.push([
                ax + ((bx - ax) * start) / len,
                az + ((bz - az) * start) / len,
                ax + ((bx - ax) * e) / len,
                az + ((bz - az) * e) / len,
              ]);
            start = -1;
          }
          prev = tt;
          po = o;
          if (tt >= len) break;
        }
      }
    return out;
  }
  /** a point in one of the districts (anywhere when the map is 萬華's alone) */
  private inMapFn() {
    const rings = this.d.district?.boundary;
    if (!rings) return () => true;
    const boxes = rings.map(r => {
      let bx = [1e9, 1e9, -1e9, -1e9];
      for (const [x, z] of r) bx = [Math.min(bx[0], x), Math.min(bx[1], z), Math.max(bx[2], x), Math.max(bx[3], z)];
      return bx;
    });
    return (x: number, z: number) => {
      for (let ri = 0; ri < rings.length; ri++) {
        const r = rings[ri],
          bx = boxes[ri];
        if (x < bx[0] || x > bx[2] || z < bx[1] || z > bx[3]) continue;
        let c = false;
        for (let a = 0, b = r.length - 1; a < r.length; b = a++)
          if (r[a][1] > z !== r[b][1] > z && x < ((r[b][0] - r[a][0]) * (z - r[a][1])) / (r[b][1] - r[a][1]) + r[a][0])
            c = !c;
        if (c) return true;
      }
      return false;
    };
  }
  private ringC: V2[] | null = null;
  private ringB: number[][] | null = null;
  /**
   * v24.37 what is written on the map, and its lines: the boundaries of the districts, the lines between areas, the
   * river's name, the names of the districts, the streets' names below NEAR, the landmarks, the stations. Drawn with
   * the frame, under the view transform: as large as they were on the paper while the map is far away, no larger than
   * reads well close up.
   */
  private drawOver(c: CanvasRenderingContext2D, areaNames: () => void) {
    const D = this.d.district;
    if (!D) return false;
    const z = this.zoom,
      s = this.k * z;
    const [vx0, vz0] = this.toWorld(0, 0),
      [vx1, vz1] = this.toWorld(innerWidth, innerHeight);
    const inView = (x: number, y: number, m: number) => x > vx0 - m && x < vx1 + m && y > vz0 - m && y < vz1 + m;
    /** a size on the paper, held to so many px of the screen */
    const px = (paper: number, screen: number) => Math.min(paper, screen / z);
    c.save();
    c.lineCap = 'butt';
    c.lineJoin = 'round';
    c.setLineDash([px(16, 9), px(8, 5)]);
    c.strokeStyle = 'rgba(120,40,30,.7)';
    c.lineWidth = px(4, 2.2);
    this.ringB ||= D.boundary.map(ring => {
      let bx = [1e9, 1e9, -1e9, -1e9];
      for (const [x, y] of ring) bx = [Math.min(bx[0], x), Math.min(bx[1], y), Math.max(bx[2], x), Math.max(bx[3], y)];
      return bx;
    });
    // only the stretches in view, each dashed from where the ring's pattern has got to (lineDashOffset), so the dashes
    // stay put as the map moves: a ring is up to 56 km long, ten thousand dashes a frame close up
    const pad = 30 / s;
    const wx0 = vx0 - pad,
      wz0 = vz0 - pad,
      wx1 = vx1 + pad,
      wz1 = vz1 + pad;
    D.boundary.forEach((ring, i) => {
      const bx = this.ringB![i];
      if (bx[2] < wx0 || bx[0] > wx1 || bx[3] < wz0 || bx[1] > wz1) return; // (not in view)
      let acc = 0,
        open = false;
      for (let j = 0; j < ring.length; j++) {
        const a = ring[j],
          b = ring[(j + 1) % ring.length];
        const seen =
          Math.max(a[0], b[0]) >= wx0 &&
          Math.min(a[0], b[0]) <= wx1 &&
          Math.max(a[1], b[1]) >= wz0 &&
          Math.min(a[1], b[1]) <= wz1;
        if (seen) {
          if (!open) {
            c.beginPath();
            c.lineDashOffset = acc;
            c.moveTo(this.wx(a[0]), this.wy(a[1]));
            open = true;
          }
          c.lineTo(this.wx(b[0]), this.wy(b[1]));
        } else if (open) {
          c.stroke();
          open = false;
        }
        acc += Math.hypot(b[0] - a[0], b[1] - a[1]) * this.k;
      }
      if (open) c.stroke();
    });
    c.setLineDash([]);
    c.lineDashOffset = 0;
    c.strokeStyle = 'rgba(110,70,50,.5)';
    c.lineWidth = px(2.4, 1.5);
    c.beginPath();
    for (const [ax, az, bx, bz] of this.secLines ?? []) {
      if (Math.max(ax, bx) < wx0 || Math.min(ax, bx) > wx1 || Math.max(az, bz) < wz0 || Math.min(az, bz) > wz1)
        continue;
      c.moveTo(this.wx(ax), this.wy(az));
      c.lineTo(this.wx(bx), this.wy(bz));
    }
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // 淡水河, along the northern-most stretch of the river on the boundary that runs north–south with the water to the
    // west (since 北投 the northern-most of all is an east–west stretch at 關渡, and the name stood on the land there)
    const rs = D.river.filter(q => q[5] >= 0.85).reduce<number[] | null>((a, q) => (!a || q[1] < a[1] ? q : a), null);
    if (rs) {
      c.save();
      c.translate(this.wx(rs[0] - rs[5] * 60), this.wy(rs[1] + 200));
      c.rotate(-Math.PI / 2);
      c.fillStyle = '#1e4e6e';
      c.font = `italic bold ${px(44, 26)}px serif`;
      c.fillText(tr('淡 水 河', 'Tamsui River'), 0, 0);
      c.restore();
    }
    // the name of each district, large and faint across it
    if (D.districts && D.boundary.length > 1) {
      this.ringC ||= D.boundary.map(ring => {
        let x = 0,
          y = 0;
        for (const q of ring) ((x += q[0] / ring.length), (y += q[1] / ring.length));
        return [x, y] as V2;
      });
      c.font = `bold ${px(84, 64)}px "Noto Sans TC", serif`;
      c.fillStyle = 'rgba(120,40,30,.2)';
      D.boundary.forEach((_, i) => {
        const n = D.districts![i];
        if (n) c.fillText(DISTRICT_NAME[n] ?? n, this.wx(this.ringC![i][0]), this.wy(this.ringC![i][1]));
      });
    }
    // the streets' names between the whole city and NEAR (past it they are drawn close up): the longest straight
    // stretch of each street in each square kilometre, where the name fits on it on the screen
    this.overStats.names = 0;
    if (s < NEAR && s > 0.03) {
      const f = 12.5 / z;
      c.font = `bold ${f}px "Noto Sans TC", sans-serif`;
      c.lineWidth = 3 / z;
      c.strokeStyle = 'rgba(239,233,218,.9)';
      c.fillStyle = '#4a4436';
      const placed = new Map<string, V2[]>();
      for (const q of this.farNames) {
        if (q.l * s < 30) break; // (longest first: none of the rest fits either)
        if (!inView(q.x, q.z, q.l / 2)) continue;
        if (q.l * s < this.nameWidth(q.n) + 6) continue;
        const mine = placed.get(q.n) || placed.set(q.n, []).get(q.n)!;
        if (mine.some(o => Math.hypot(o[0] - q.x, o[1] - q.z) * s < 250)) continue;
        mine.push([q.x, q.z]);
        c.save();
        c.translate(this.wx(q.x), this.wy(q.z));
        c.rotate(q.a);
        c.strokeText(q.n, 0, 0);
        c.fillText(q.n, 0, 0);
        c.restore();
        this.overStats.names++;
      }
    }
    areaNames();
    // landmarks
    {
      const R = px(8, 5),
        f = px(26, 14);
      c.font = `bold ${f}px "Noto Sans TC", serif`;
      c.lineWidth = f / 5.2;
      c.strokeStyle = '#efe9da';
      c.fillStyle = '#8a1f1a';
      for (const l of D.landmarks) {
        if (!inView(l.x, l.z, 300)) continue;
        const X = this.wx(l.x),
          Y = this.wy(l.z);
        c.beginPath();
        c.arc(X, Y, R, 0, 7);
        c.fill();
        if (f * z < 7) continue;
        c.strokeText('⛩ ' + l.n, X, Y - f * 0.85);
        c.fillText('⛩ ' + l.n, X, Y - f * 0.85);
      }
    }
    // metro stations
    {
      const R = px(9, 6.5),
        f = px(20, 13);
      c.font = `bold ${f}px "Noto Sans TC", sans-serif`;
      for (const st of this.d.stations ?? []) {
        if (!inView(st.x, st.z, 300)) continue;
        const X = this.wx(st.x),
          Y = this.wy(st.z);
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(X, Y, R, 0, 7);
        c.fill();
        c.lineWidth = px(4, 2.6);
        c.strokeStyle = '#e8681c';
        c.stroke();
        if (f * z < 7) continue;
        c.lineWidth = f / 5;
        c.strokeStyle = '#efe9da';
        c.strokeText(st.n, X, Y + R + f * 0.95);
        c.fillStyle = '#1f5a3a';
        c.fillText(st.n, X, Y + R + f * 0.95);
      }
    }
    c.restore();
    return true;
  }
  update() {
    const p = this.d.player();
    if (!p.under && this.reveal(p.x, p.z)) {
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
    this.drawNear(c, r);
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
      const inMap = this.inMapFn();
      cv.width = cv.height = N;
      const sc = cv.getContext('2d')!,
        im = sc.createImageData(N, N);
      const cs = this.S / this.k / N;
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const x = this.ox + (i + 0.5) * cs,
            z = this.oy + (j + 0.5) * cs;
          if (!inMap(x, z)) continue; // (left transparent)
          const si = d.sectorOf(x, z);
          im.data.set(L.has(si) ? [60, 170, 70, 44] : [200, 40, 30, 32], (j * N + i) * 4);
        }
      sc.putImageData(im, 0, 0);
      this.secKey = key;
    }
    // (v24.37 smoothed: the tint is 86 m to a cell with the whole city on it, and the lines are lines now)
    c.imageSmoothingEnabled = true;
    c.drawImage(this.secCv, 0, 0, this.S, this.S);
    this.secLines ||= this.between();
    // v24.36 ninety-five areas on a map twenty kilometres long: their names are sized to the ground as they were when
    // the map was 萬華 alone (a name is about as wide as its area), and are left out while that is too small to read
    // (v24.37 and no larger than 30 px on the screen, however close)
    const areaNames = () => {
      const fpx = Math.min(34 * Math.min(1, this.k / 0.67), 30 / this.zoom);
      const [ax0, az0] = this.toWorld(0, 0),
        [ax1, az1] = this.toWorld(innerWidth, innerHeight);
      const span = (fpx * 8) / this.k; // (half the width of a long name, in metres)
      if (fpx * this.zoom >= 10)
        d.sectors.forEach((q, s) => {
          if (q.x < ax0 - span || q.x > ax1 + span || q.z < az0 - span || q.z > az1 + span) return;
          c.font = `bold ${fpx}px "Noto Sans TC", sans-serif`;
          c.lineWidth = fpx / 5.5;
          c.strokeStyle = 'rgba(239,233,218,.85)';
          const t = `${d.sectorName(s)}（${L.has(s) ? tr('已奪回', 'Liberated') : tr('佔領中', 'Occupied')}）`;
          c.strokeText(t, this.wx(q.x), this.wy(q.z));
          c.fillStyle = L.has(s) ? 'rgba(30,110,40,.9)' : 'rgba(150,30,20,.85)';
          c.fillText(t, this.wx(q.x), this.wy(q.z));
        });
    };
    if (this.drawOver(c, areaNames) === false) areaNames();
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
