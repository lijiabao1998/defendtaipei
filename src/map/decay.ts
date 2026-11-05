// 破・無序感: decay & disorder dressing for the detailed spawn blocks (all procedural, all parody text).
import * as THREE from 'three';
type V2 = [number, number];
export type DCtx = {
  scene: THREE.Scene;
  rnd: () => number;
  pip: (p: V2, pts: V2[]) => boolean;
  bldAt: (x: number, z: number) => any;
  addSeg: (s: { a: V2; b: V2 }, low?: boolean) => void;
  merge: (g: THREE.BufferGeometry[]) => THREE.BufferGeometry;
  roads: { p: V2[]; t: string; n?: string }[];
  blds: any[];
  RW: Record<string, number>;
  center: V2;
  R: number;
  doors: V2[];
};
const VSIGNS = [
  '永和豆漿',
  '阿婆麵線',
  '大眾牙科',
  '金鳳銀樓',
  '好運彩券',
  '手機維修',
  '當舖',
  '家庭理髮',
  '歡唱KTV',
  '仁心診所',
  '升學補習班',
  '汽車美容',
  '老中醫',
  '明亮眼鏡',
  '大同電器',
  '萬華旅社',
  '腳底按摩',
  '永興五金',
  '水電行',
  '金麥麵包',
  '平價藥局',
  '牛肉麵',
  '滷肉飯',
  '冷氣維修',
  '配鎖匙',
  '佛具香舖',
  '文昌書局',
  '洗衣店',
  '網咖',
  '老茶行',
  '刻印',
  '快速沖印',
];
const HSIGNS = [
  '萬華大旅社',
  '阿財小吃部',
  '順發機車行',
  '金好運彩券行',
  '小林鐘錶眼鏡',
  '大三元海產',
  '新光電器行',
  '鼎好當舖',
  '來來理容院',
  '福氣自助餐',
  '老王牛肉麵',
  '永樂布莊',
  '金牌刺青',
  '華西藥房',
  '吉祥金紙',
  '阿榮修鞋',
  '美而美早餐',
  '德昌五金',
  '好鄰居診所',
  '青草茶專賣',
  '宏亮通訊',
  '大東山珠寶',
  '平安堂中藥',
  '大發影印',
];
const BG = [
  '#a8221e',
  '#20344f',
  '#c9971c',
  '#5a2a7a',
  '#2a6a3a',
  '#d8d2c0',
  '#e8b818',
  '#1a1a1a',
  '#b84a1a',
  '#2a5a8a',
  '#f2f2f2',
  '#8a1a3a',
];
function mkCanvas(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')!] as const;
}
function grime(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k = 1) {
  for (let i = 0; i < 40 * k; i++) {
    c.fillStyle = `rgba(30,22,10,${Math.random() * 0.18})`;
    c.fillRect(x + Math.random() * w, y + Math.random() * h, 1 + Math.random() * 6, 1 + Math.random() * 4);
  }
  for (let i = 0; i < 4 * k; i++) {
    const sx = x + Math.random() * w;
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(90,50,20,.35)');
    g.addColorStop(1, 'rgba(90,50,20,0)');
    c.fillStyle = g;
    c.fillRect(sx, y + Math.random() * h * 0.3, 1 + Math.random() * 3, h * (0.3 + Math.random() * 0.7));
  }
}
function signAtlas() {
  const [cv, c] = mkCanvas(1024, 1024);
  VSIGNS.forEach((t, i) => {
    const x = (i % 16) * 64,
      y = Math.floor(i / 16) * 256;
    const bg = BG[i % BG.length];
    c.fillStyle = bg;
    c.fillRect(x, y, 64, 256);
    c.strokeStyle = 'rgba(255,255,255,.5)';
    c.lineWidth = 3;
    c.strokeRect(x + 4, y + 4, 56, 248);
    const light = bg === '#f2f2f2' || bg === '#d8d2c0' || bg === '#e8b818';
    c.fillStyle = light ? '#a01a10' : '#fff3c8';
    const ch = [...t];
    const fs = Math.min(46, 230 / ch.length);
    c.font = `bold ${fs}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    ch.forEach((s, k) => c.fillText(s, x + 32, y + 128 + (k - (ch.length - 1) / 2) * fs * 1.02));
    grime(c, x, y, 64, 256, 1.2);
    if (Math.random() < 0.25) {
      c.fillStyle = 'rgba(20,20,20,.85)';
      c.beginPath();
      c.moveTo(x, y + 180);
      c.lineTo(x + 40, y + 256);
      c.lineTo(x, y + 256);
      c.fill();
    }
  });
  HSIGNS.forEach((t, i) => {
    const x = (i % 4) * 256,
      y = 512 + Math.floor(i / 4) * 64;
    const bg = BG[(i * 5 + 3) % BG.length];
    c.fillStyle = bg;
    c.fillRect(x, y, 256, 64);
    c.strokeStyle = 'rgba(0,0,0,.4)';
    c.lineWidth = 4;
    c.strokeRect(x + 2, y + 2, 252, 60);
    const light = bg === '#f2f2f2' || bg === '#d8d2c0' || bg === '#e8b818';
    c.fillStyle = light ? '#1a1a8a' : '#fff6d0';
    c.font = `bold ${Math.min(40, 230 / [...t].length)}px sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(t, x + 128, y + 34);
    grime(c, x, y, 256, 64, 1);
  });
  // traffic / street sign cells (bottom rows, 128x128): no-parking, no-entry, 30, warning, pedestrian, P
  const cells: ((c: CanvasRenderingContext2D, x: number, y: number) => void)[] = [
    (c, x, y) => {
      c.fillStyle = '#1d4fa8';
      circ(c, x, y, 58);
      c.strokeStyle = '#d22';
      c.lineWidth = 14;
      c.beginPath();
      c.arc(x + 64, y + 64, 52, 0, 7);
      c.stroke();
      c.beginPath();
      c.moveTo(x + 28, y + 28);
      c.lineTo(x + 100, y + 100);
      c.stroke();
    },
    (c, x, y) => {
      c.fillStyle = '#d22';
      circ(c, x, y, 60);
      c.fillStyle = '#fff';
      c.fillRect(x + 22, y + 54, 84, 20);
    },
    (c, x, y) => {
      c.fillStyle = '#fff';
      circ(c, x, y, 60);
      c.strokeStyle = '#d22';
      c.lineWidth = 12;
      c.beginPath();
      c.arc(x + 64, y + 64, 52, 0, 7);
      c.stroke();
      c.fillStyle = '#111';
      c.font = 'bold 56px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('30', x + 64, y + 68);
    },
    (c, x, y) => {
      c.fillStyle = '#d22';
      c.beginPath();
      c.moveTo(x + 64, y + 6);
      c.lineTo(x + 124, y + 118);
      c.lineTo(x + 4, y + 118);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.moveTo(x + 64, y + 30);
      c.lineTo(x + 104, y + 106);
      c.lineTo(x + 24, y + 106);
      c.fill();
      c.fillStyle = '#111';
      c.font = 'bold 60px sans-serif';
      c.textAlign = 'center';
      c.fillText('!', x + 64, y + 102);
    },
    (c, x, y) => {
      c.fillStyle = '#1d4fa8';
      c.fillRect(x + 6, y + 6, 116, 116);
      c.fillStyle = '#fff';
      c.font = 'bold 30px sans-serif';
      c.textAlign = 'center';
      c.fillText('行人', x + 64, y + 56);
      c.fillText('穿越道', x + 64, y + 96);
    },
    (c, x, y) => {
      c.fillStyle = '#1d4fa8';
      c.fillRect(x + 6, y + 6, 116, 116);
      c.fillStyle = '#fff';
      c.font = 'bold 90px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('P', x + 64, y + 68);
    },
    (c, x, y) => {
      c.fillStyle = '#f2f2f2';
      c.fillRect(x + 6, y + 30, 116, 68);
      c.fillStyle = '#d22';
      c.font = 'bold 22px sans-serif';
      c.textAlign = 'center';
      c.fillText('禁止臨時停車', x + 64, y + 60);
      c.fillStyle = '#111';
      c.font = '16px sans-serif';
      c.fillText('違者拖吊', x + 64, y + 86);
    },
    (c, x, y) => {
      c.fillStyle = '#e8c018';
      c.fillRect(x + 6, y + 30, 116, 68);
      c.fillStyle = '#111';
      c.font = 'bold 26px sans-serif';
      c.textAlign = 'center';
      c.fillText('施工中', x + 64, y + 62);
      c.font = '16px sans-serif';
      c.fillText('請改道', x + 64, y + 88);
    },
  ];
  cells.forEach((f, i) => {
    const x = i * 128,
      y = 896;
    f(c, x, y);
    grime(c, x, y, 128, 128, 0.6);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function circ(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  c.arc(x + 64, y + 64, r, 0, 7);
  c.fill();
}
// UV helpers into atlas
const vCell = (i: number) => [
  ((i % 16) * 64) / 1024,
  1 - (Math.floor(i / 16) * 256 + 256) / 1024,
  64 / 1024,
  256 / 1024,
];
const hCell = (i: number) => [
  ((i % 4) * 256) / 1024,
  1 - (512 + Math.floor(i / 4) * 64 + 64) / 1024,
  256 / 1024,
  64 / 1024,
];
const tCell = (i: number) => [(i * 128) / 1024, 0, 128 / 1024, 128 / 1024];
function setUV(g: THREE.BufferGeometry, cell: number[]) {
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, cell[0] + uv.getX(k) * cell[2], cell[1] + uv.getY(k) * cell[3]);
  return g;
}
function color(g: THREE.BufferGeometry, hex: number, j = 0.06) {
  const n = g.attributes.position.count;
  const c = new THREE.Color(hex);
  const a = new Float32Array(n * 3);
  const v0 = 1 - j + Math.random() * j * 2;
  for (let i = 0; i < n; i++) {
    const v = v0 * (1 - j * 0.5 + Math.random() * j);
    a[i * 3] = c.r * v;
    a[i * 3 + 1] = c.g * v;
    a[i * 3 + 2] = c.b * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const B = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
  g.rotateZ(rz);
  g.rotateX(rx);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function buildDecay(c: DCtx) {
  const { rnd, center, R } = c;
  const V: THREE.BufferGeometry[] = [],
    WIRE: THREE.BufferGeometry[] = [],
    SIGN: THREE.BufferGeometry[] = [],
    PUD: THREE.BufferGeometry[] = [],
    HOLE: THREE.BufferGeometry[] = [];
  const near = (x: number, z: number, r = R) => Math.hypot(x - center[0], z - center[1]) < r;
  const freeAt = (x: number, z: number, pad = 0.6) =>
    !c.bldAt(x, z) &&
    !c.bldAt(x + pad, z) &&
    !c.bldAt(x - pad, z) &&
    !c.bldAt(x, z + pad) &&
    !c.bldAt(x, z - pad) &&
    !c.doors.some(d => Math.hypot(d[0] - x, d[1] - z) < 3.2);
  const segs: { a: V2; b: V2; w: number; ux: number; uz: number; L: number; road: any }[] = [];
  for (const r of c.roads) {
    const w = c.RW[r.t.replace('_link', '')] ?? 3;
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i],
        b = r.p[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 3 || !near((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;
      segs.push({ a, b, w, ux: (b[0] - a[0]) / L, uz: (b[1] - a[1]) / L, L, road: r });
    }
  }
  const wire = (p0: THREE.Vector3, p1: THREE.Vector3, sag: number, r = 0.02) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const p = p0.clone().lerp(p1, t);
      p.y -= sag * 4 * t * (1 - t);
      pts.push(p);
    }
    WIRE.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, r, 3, false));
  };
  const coil = (x: number, y: number, z: number) => {
    const pts: THREE.Vector3[] = [];
    const rr = 0.25 + rnd() * 0.25;
    const turns = 2 + rnd() * 3;
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * turns * Math.PI * 2;
      pts.push(
        new THREE.Vector3(
          x + Math.cos(a) * rr + i * 0.004,
          y - Math.abs(Math.sin(a)) * rr * 1.2 - i * 0.005,
          z + Math.sin(a) * rr * 0.5,
        ),
      );
    }
    WIRE.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.018, 3, false));
  };
  // ---------- 電線桿 utility poles + tangled wires ----------
  const poleTops: { pts: THREE.Vector3[]; x: number; z: number }[][] = [];
  for (const s of segs) {
    if (s.w < 4) continue;
    const side = (s.road.n?.length ?? 1) % 2 ? 1 : -1;
    const nx = -s.uz,
      nz = s.ux;
    const chain: { pts: THREE.Vector3[]; x: number; z: number }[] = [];
    for (let d = 3 + rnd() * 6; d < s.L - 2; d += 15 + rnd() * 8) {
      const off = s.w / 2 + 0.5;
      const x = s.a[0] + s.ux * d + nx * off * side,
        z = s.a[1] + s.uz * d + nz * off * side;
      if (!freeAt(x, z, 0.3)) continue;
      const H = 8.5 + rnd() * 1.5,
        tx = (rnd() - 0.5) * 0.08,
        tz = (rnd() - 0.5) * 0.08;
      const ry = Math.atan2(s.ux, s.uz);
      V.push(
        color(
          place(new THREE.CylinderGeometry(0.12, 0.17, H, 8).translate(0, H / 2, 0), x, 0, z, 0, tx, tz),
          0x9a968c,
          0.1,
        ),
      );
      const top = (h: number) => new THREE.Vector3(x + Math.sin(tz) * -h, h, z + Math.sin(tx) * h);
      const P: THREE.Vector3[] = [];
      const arms = [H - 0.4, H - 1.3];
      for (const ah of arms) {
        const t = top(ah);
        V.push(color(place(B(1.9, 0.1, 0.1), t.x, t.y, t.z, ry), 0x5a5a58));
        for (const k of [-0.85, -0.3, 0.3, 0.85]) {
          const px = t.x + Math.cos(ry) * k * 0 + Math.sin(ry + Math.PI / 2) * k,
            pz = t.z + Math.cos(ry + Math.PI / 2) * k;
          V.push(color(place(new THREE.CylinderGeometry(0.035, 0.045, 0.14, 6), px, t.y + 0.12, pz), 0xe8e4d8, 0.02));
          P.push(new THREE.Vector3(px, t.y + 0.16, pz));
        }
      }
      for (let k = 0; k < 4; k++)
        P.push(top(5.4 + k * 0.28).add(new THREE.Vector3((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3))); // telecom bundle
      if (rnd() < 0.4) {
        const t = top(H - 2.6);
        const ox = Math.sin(ry + Math.PI / 2) * 0.35,
          oz = Math.cos(ry + Math.PI / 2) * 0.35;
        V.push(color(place(new THREE.CylinderGeometry(0.26, 0.26, 0.85, 10), t.x + ox, t.y, t.z + oz), 0x7c8a7a, 0.05));
        V.push(
          color(place(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 10), t.x + ox, t.y + 0.45, t.z + oz), 0x55605a),
        );
      }
      if (rnd() < 0.55) coil(top(5.8).x, 5.8, top(5.8).z);
      if (rnd() < 0.5) {
        const t = top(4.2);
        V.push(color(place(B(0.5, 0.65, 0.22), t.x + nx * -0.2 * side, 3.6, t.z + nz * -0.2 * side, ry), 0x6a6e64));
      } // junction box
      if (rnd() < 0.5) {
        for (let k = 0; k < 2 + rnd() * 3; k++) {
          const y = 1.2 + rnd() * 1.6;
          V.push(
            color(
              place(
                B(0.34, 0.5, 0.02),
                x + nx * -0.17 * side,
                y,
                z + nz * -0.17 * side,
                ry + (rnd() - 0.5) * 0.2,
                0,
                (rnd() - 0.5) * 0.25,
              ),
              [0xe8e4c8, 0xf0d040, 0xffffff, 0xd8a0a0][k % 4],
              0.08,
            ),
          );
        }
      } // stuck-on flyers
      // crooked street signs cluster near the pole
      if (rnd() < 0.5) {
        const sx = x + s.ux * 1.2,
          sz = z + s.uz * 1.2;
        const lean = (rnd() - 0.5) * 0.3;
        V.push(
          color(
            place(
              new THREE.CylinderGeometry(0.04, 0.04, 3, 6).translate(0, 1.5, 0),
              sx,
              0,
              sz,
              0,
              lean,
              (rnd() - 0.5) * 0.25,
            ),
            0x8a8e92,
          ),
        );
        const n = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const g = setUV(new THREE.PlaneGeometry(0.62, 0.62), tCell(Math.floor(rnd() * 8)));
          const g2 = g.clone();
          g2.rotateY(Math.PI);
          const both = c.merge([g, g2]);
          SIGN.push(
            place(
              both,
              sx,
              2.6 - k * 0.68,
              sz + lean * (2.6 - k * 0.68),
              ry + Math.PI / 2 + (rnd() - 0.5) * 0.9,
              (rnd() - 0.5) * 0.15,
              (rnd() - 0.5) * 0.35,
            ),
          );
        }
      }
      chain.push({ pts: P, x, z });
    }
    poleTops.push(chain);
  }
  for (const ch of poleTops)
    for (let i = 0; i < ch.length - 1; i++) {
      const A = ch[i],
        Bp = ch[i + 1];
      if (Math.hypot(A.x - Bp.x, A.z - Bp.z) > 35) continue;
      A.pts.forEach((p, k) => {
        if (rnd() < 0.85) wire(p, Bp.pts[k], 0.3 + rnd() * 0.9, k >= 8 ? 0.03 : 0.018);
      });
      for (let k = 0; k < 3; k++)
        wire(
          A.pts[8 + Math.floor(rnd() * 4)],
          Bp.pts[8 + Math.floor(rnd() * 4)].clone().add(new THREE.Vector3(0, (rnd() - 0.5) * 0.5, 0)),
          0.8 + rnd() * 1.4,
          0.022,
        );
    }
  // drop wires pole → building facades (and across the street)
  const allPoles = poleTops.flat();
  for (const p of allPoles) {
    const k = 2 + Math.floor(rnd() * 4);
    for (let i = 0; i < k; i++) {
      const ang = rnd() * Math.PI * 2,
        dist = 5 + rnd() * 9;
      const tx = p.x + Math.cos(ang) * dist,
        tz = p.z + Math.sin(ang) * dist;
      const b = c.bldAt(tx, tz);
      if (!b && rnd() < 0.7) continue;
      wire(
        p.pts[8 + (i % 4)],
        new THREE.Vector3(tx, Math.min(b ? b.h - 0.5 : 4.5, 3.5 + rnd() * 4), tz),
        0.4 + rnd() * 1.2,
        0.016,
      );
    }
  }
  for (let i = 0; i < allPoles.length; i++) {
    const p = allPoles[i];
    const q = allPoles[(i + 3 + Math.floor(rnd() * 5)) % allPoles.length];
    if (q && Math.hypot(p.x - q.x, p.z - q.z) < 26 && rnd() < 0.6) wire(p.pts[9], q.pts[10], 1 + rnd() * 1.5, 0.02);
  }
  // ---------- facades: signboards, AC units w/ drips, rusty 鐵窗 cages, laundry ----------
  const acs: THREE.Vector3[] = [];
  for (const b of c.blds) {
    if (!near(b.c[0], b.c[1], R * 0.85) || b.h < 4) continue;
    const pts: V2[] = b.pts;
    for (let i = 0; i < pts.length; i++) {
      // v23.9 infill row houses: side walls are party walls, dress only the street front and the back
      if (b.fill && i !== 0) continue;
      const a = pts[i],
        e = pts[(i + 1) % pts.length];
      const L = Math.hypot(e[0] - a[0], e[1] - a[1]);
      if (L < 2.5) continue;
      const ux = (e[0] - a[0]) / L,
        uz = (e[1] - a[1]) / L;
      let nx = -uz,
        nz = ux;
      const m: V2 = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2];
      if (c.pip([m[0] + nx * 0.5, m[1] + nz * 0.5], pts)) {
        nx = -nx;
        nz = -nz;
      }
      if (c.bldAt(m[0] + nx * 4, m[1] + nz * 4)) continue;
      const street = !c.bldAt(m[0] + nx * 8, m[1] + nz * 8);
      const fy = Math.atan2(nx, nz);
      // vertical signs, perpendicular to the facade, overlapping & crooked
      if (street)
        for (let d = 0.8 + rnd(); d < L - 0.6; d += 1.3 + rnd() * 2) {
          if (rnd() < 0.3) continue;
          const w = 0.55 + rnd() * 0.35,
            h = 1.6 + rnd() * Math.min(2.4, b.h - 5);
          if (h < 1.2) continue;
          const y = 3.4 + rnd() * Math.max(0.1, b.h - 3.6 - h) + h / 2;
          const off = 0.3 + w / 2 + rnd() * 0.2;
          const g = setUV(B(0.1, h, w), vCell(Math.floor(rnd() * VSIGNS.length)));
          SIGN.push(
            place(
              g,
              a[0] + ux * d + nx * off,
              y,
              a[1] + uz * d + nz * off,
              fy + (rnd() - 0.5) * 0.12,
              0,
              rnd() < 0.12 ? (rnd() - 0.5) * 0.6 : (rnd() - 0.5) * 0.06,
            ),
          );
          V.push(
            color(
              place(
                B(0.05, 0.05, off),
                a[0] + ux * d + (nx * off) / 2,
                y + h / 2 - 0.1,
                a[1] + uz * d + (nz * off) / 2,
                fy,
              ),
              0x5a3a24,
            ),
          );
        }
      // horizontal boards over the arcade
      if (street && rnd() < 0.8) {
        const n = 1 + Math.floor(rnd() * 2);
        for (let k = 0; k < n; k++) {
          const w = Math.min(L * 0.7, 2.5 + rnd() * 2.5);
          const g = setUV(new THREE.PlaneGeometry(w, w / 4), hCell(Math.floor(rnd() * HSIGNS.length)));
          const d = w / 2 + rnd() * Math.max(0.01, L - w);
          SIGN.push(
            place(
              g,
              a[0] + ux * d + nx * (0.16 + k * 0.03),
              2.9 + k * 0.5 + rnd() * 0.3,
              a[1] + uz * d + nz * (0.16 + k * 0.03),
              fy,
              0,
              (rnd() - 0.5) * 0.08,
            ),
          );
        }
      }
      // per floor: AC, cages, laundry
      for (let y = 3.6; y < b.h - 0.8; y += 3)
        for (let d = 1.0; d < L - 1; d += 2.6 + rnd()) {
          const x0 = a[0] + ux * d,
            z0 = a[1] + uz * d;
          const r0 = rnd();
          if (r0 < 0.35) {
            const p = new THREE.Vector3(x0 + nx * 0.32, y - 0.9 + rnd() * 0.3, z0 + nz * 0.32);
            V.push(
              color(
                place(B(0.8, 0.55, 0.45), p.x, p.y, p.z, fy),
                [0xd8d2c0, 0xb8b4a8, 0xe0dccc][Math.floor(rnd() * 3)],
                0.12,
              ),
            );
            V.push(
              color(
                place(
                  new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12),
                  p.x + nx * 0.23,
                  p.y,
                  p.z + nz * 0.23,
                  fy,
                  Math.PI / 2,
                ),
                0x3a3a3a,
              ),
            );
            V.push(color(place(B(0.04, 0.04, 0.5), p.x - ux * 0.3, p.y - 0.3, p.z - uz * 0.3, fy), 0x6a3a1c));
            acs.push(p);
            V.push(
              color(
                place(B(0.12, 1.4 + rnd() * 1.4, 0.01), p.x - nx * 0.31, p.y - 1.2, p.z - nz * 0.31, fy),
                0x3a3428,
                0.2,
              ),
            );
          } // drip stain
          else if (r0 < 0.6 && d + 1.2 < L) {
            const cx = x0 + ux * 0.6 + nx * 0.28,
              cz = z0 + uz * 0.6 + nz * 0.28,
              cw = 1.9,
              ch = 1.5;
            const rust = 0x6e3e20;
            for (const yy of [y - 1.6, y - 0.1])
              V.push(
                color(place(B(cw, 0.05, 0.5), cx, yy, cz, fy + (Math.PI / 2) * 0 + 0, 0, 0).rotateY(0), rust, 0.15),
              );
            for (let q = -cw / 2; q <= cw / 2 + 0.01; q += 0.13)
              V.push(
                color(
                  place(B(0.025, ch, 0.025), cx + Math.cos(fy) * q, y - 0.85, cz - Math.sin(fy) * q),
                  rnd() < 0.3 ? 0x8a4a22 : rust,
                  0.2,
                ),
              );
            if (rnd() < 0.6) {
              V.push(
                color(
                  place(B(cw + 0.4, 0.03, 0.03), cx + nx * 0.35, y - 0.5, cz + nz * 0.35, fy + Math.PI / 2),
                  0xb0b0b0,
                ),
              );
              for (let q = 0; q < 2 + rnd() * 4; q++) {
                const s = -0.9 + q * 0.42 + rnd() * 0.1;
                V.push(
                  color(
                    place(
                      B(0.32, 0.45 + rnd() * 0.3, 0.02),
                      cx + Math.cos(fy) * s + nx * 0.36,
                      y - 0.8,
                      cz - Math.sin(fy) * s + nz * 0.36,
                      fy,
                    ),
                    [0xe8e8e8, 0x3a6aa8, 0xc83a3a, 0xe8d050, 0x2a2a2a, 0x8ab88a][Math.floor(rnd() * 6)],
                    0.1,
                  ),
                );
              }
            }
          }
        }
    }
  }
  // ---------- street clutter: trash, debris, burnt cars, sandbags, barricades, checkpoints, potholes, puddles ----------
  const blobShape = (r: number) => {
    const sh = new THREE.Shape();
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2,
        rr = r * (0.7 + rnd() * 0.5);
      i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    return g;
  };
  const sandbagRow = (x: number, z: number, ang: number, len: number, rows = 3) => {
    const ux = Math.cos(ang),
      uz = Math.sin(ang);
    for (let r = 0; r < rows; r++)
      for (let d = -len / 2 + (r % 2) * 0.25; d < len / 2; d += 0.5) {
        const g = new THREE.SphereGeometry(0.28, 8, 5);
        g.scale(1, 0.42, 0.6);
        V.push(
          color(
            place(g, x + ux * d, 0.1 + r * 0.2, z + uz * d, -ang + (rnd() - 0.5) * 0.2),
            [0x8a7a58, 0x7a6c4c, 0x9a8a68][Math.floor(rnd() * 3)],
            0.1,
          ),
        );
      }
    c.addSeg({ a: [x - (ux * len) / 2, z - (uz * len) / 2], b: [x + (ux * len) / 2, z + (uz * len) / 2] }, true);
  };
  const jersey = (x: number, z: number, ang: number) => {
    const g = B(1.9, 0.8, 0.5);
    V.push(color(place(g, x, 0.4, z, -ang), 0xb8b4aa, 0.08));
    V.push(color(place(B(1.9, 0.2, 0.7), x, 0.1, z, -ang), 0xa8a49a));
    const ux = Math.cos(ang) * 0.95,
      uz = Math.sin(ang) * 0.95;
    c.addSeg({ a: [x - ux, z - uz], b: [x + ux, z + uz] }, true);
  };
  const aframe = (x: number, z: number, ang: number) => {
    for (const y of [0.5, 0.85])
      for (let k = 0; k < 4; k++)
        V.push(
          color(
            place(
              B(0.38, 0.16, 0.04),
              x + Math.cos(ang) * (k - 1.5) * 0.38,
              y,
              z + Math.sin(ang) * (k - 1.5) * 0.38,
              -ang,
            ),
            k % 2 ? 0xd8d8d8 : 0xc82a1e,
          ),
        );
    for (const s of [-0.7, 0.7]) {
      V.push(color(place(B(0.05, 1, 0.05), x + Math.cos(ang) * s, 0.5, z + Math.sin(ang) * s, -ang, 0.25), 0x444444));
      V.push(color(place(B(0.05, 1, 0.05), x + Math.cos(ang) * s, 0.5, z + Math.sin(ang) * s, -ang, -0.25), 0x444444));
    }
    c.addSeg(
      {
        a: [x - Math.cos(ang) * 0.75, z - Math.sin(ang) * 0.75],
        b: [x + Math.cos(ang) * 0.75, z + Math.sin(ang) * 0.75],
      },
      true,
    );
  };
  const burntCar = (x: number, z: number, ang: number) => {
    const ry = -ang + Math.PI / 2;
    const tilt = (rnd() - 0.5) * 0.12;
    const add = (g: THREE.BufferGeometry, col: number, y: number, dx = 0, dz = 0) => {
      g.translate(dx, 0, dz);
      V.push(color(place(g, x, y, z, ry, tilt, (rnd() - 0.5) * 0.06), col, 0.25));
    };
    add(B(1.8, 0.6, 4.3), 0x2a2420, 0.45);
    add(B(1.6, 0.55, 2.2), 0x1e1a18, 1.0, 0, -0.2);
    add(B(1.82, 0.12, 1.2), 0x5a3018, 0.8, 0, 1.4);
    add(B(1.5, 0.05, 2.0), 0x101010, 1.3, 0, -0.2);
    for (const [wx, wz] of [
      [-0.85, 1.3],
      [0.85, 1.3],
      [-0.85, -1.35],
      [0.85, -1.35],
    ]) {
      const g = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10);
      g.rotateZ(Math.PI / 2);
      add(g, 0x3a2a20, 0.2, wx, wz);
    }
    const ux = Math.sin(ry),
      uz = Math.cos(ry),
      nx = Math.cos(ry),
      nz = -Math.sin(ry);
    const cs: V2[] = [
      [-0.95, -2.2],
      [0.95, -2.2],
      [0.95, 2.2],
      [-0.95, 2.2],
    ].map(([a, b2]) => [x + a * nx + b2 * ux, z + a * nz + b2 * uz] as V2);
    for (let q = 0; q < 4; q++) c.addSeg({ a: cs[q], b: cs[(q + 1) % 4] });
    for (let k = 0; k < 6; k++)
      HOLE.push(place(blobShape(0.6 + rnd()), x + (rnd() - 0.5) * 3, 0.03, z + (rnd() - 0.5) * 4));
  };
  const trash = (x: number, z: number) => {
    const n = 3 + Math.floor(rnd() * 6);
    for (let k = 0; k < n; k++) {
      const g = new THREE.SphereGeometry(0.25 + rnd() * 0.15, 7, 5);
      g.scale(1, 0.75, 0.9);
      V.push(
        color(
          place(g, x + (rnd() - 0.5) * 1.4, 0.18 + (k > 3 ? 0.25 : 0), z + (rnd() - 0.5) * 1.4, rnd() * 6),
          [0x1a1a1a, 0x2a3a6a, 0xe8e0c8, 0x3a7a3a, 0xd8c848][Math.floor(rnd() * 5)],
          0.15,
        ),
      );
    }
    for (let k = 0; k < 6; k++)
      V.push(
        color(
          place(
            B(0.2 + rnd() * 0.3, 0.01, 0.15 + rnd() * 0.3),
            x + (rnd() - 0.5) * 3,
            0.03,
            z + (rnd() - 0.5) * 3,
            rnd() * 6,
          ),
          [0xf0f0e8, 0xc8b898, 0xd84030, 0x6a8ac8][Math.floor(rnd() * 4)],
        ),
      );
  };
  const debris = (x: number, z: number) => {
    for (let k = 0; k < 10; k++)
      V.push(
        color(
          place(
            B(0.1 + rnd() * 0.45, 0.06 + rnd() * 0.2, 0.1 + rnd() * 0.4),
            x + (rnd() - 0.5) * 2.6,
            0.06,
            z + (rnd() - 0.5) * 2.6,
            rnd() * 6,
            (rnd() - 0.5) * 0.4,
            (rnd() - 0.5) * 0.4,
          ),
          [0x8a8680, 0xa09888, 0x6a5040, 0xb8b0a0][Math.floor(rnd() * 4)],
          0.15,
        ),
      );
    for (let k = 0; k < 3; k++)
      V.push(
        color(
          place(
            B(1.2 + rnd(), 0.04, 0.12),
            x + (rnd() - 0.5) * 2,
            0.08,
            z + (rnd() - 0.5) * 2,
            rnd() * 6,
            0,
            (rnd() - 0.5) * 0.3,
          ),
          0x7a5a34,
        ),
      );
  };
  const checkpoints: V2[] = [];
  const bigSegs = segs.filter(s => s.w >= 6).sort(() => rnd() - 0.5);
  for (const s of bigSegs) {
    if (checkpoints.length >= 2) break;
    const mx = (s.a[0] + s.b[0]) / 2,
      mz = (s.a[1] + s.b[1]) / 2;
    const dc = Math.hypot(mx - center[0], mz - center[1]);
    if (dc < 35 || dc > R * 0.8 || checkpoints.some(q => Math.hypot(q[0] - mx, q[1] - mz) < 50)) continue;
    const ang = Math.atan2(s.uz, s.ux),
      nx = -s.uz,
      nz = s.ux;
    checkpoints.push([mx, mz]);
    for (const sd of [-1, 1]) {
      const ex = mx + nx * (s.w / 2 - 1.2) * sd,
        ez = mz + nz * (s.w / 2 - 1.2) * sd;
      sandbagRow(ex, ez, ang, 3.2);
      sandbagRow(ex - s.ux * 1.6 + nx * 0.8 * -sd, ez - s.uz * 1.6 + nz * 0.8 * -sd, ang + Math.PI / 2, 1.6, 2);
    }
    for (let k = -1; k <= 1; k += 2)
      jersey(mx + s.ux * 4 * k + nx * k * 1.2, mz + s.uz * 4 * k + nz * k * 1.2, ang + Math.PI / 2);
    // boom barrier + booth + barbed wire + floodlight
    const bx = mx + nx * (s.w / 2 - 0.5),
      bz = mz + nz * (s.w / 2 - 0.5);
    V.push(color(place(B(1.4, 2.3, 1.4), bx + s.ux * 2.5, 1.15, bz + s.uz * 2.5, -ang), 0x56603e, 0.06));
    V.push(color(place(B(1.6, 0.08, 1.6), bx + s.ux * 2.5, 2.33, bz + s.uz * 2.5, -ang), 0x3a4228));
    {
      const ux = s.ux * 2.5,
        uz = s.uz * 2.5;
      const cs: V2[] = [
        [-0.7, -0.7],
        [0.7, -0.7],
        [0.7, 0.7],
        [-0.7, 0.7],
      ].map(([p, q]) => [bx + ux + p * s.ux + q * nx, bz + uz + p * s.uz + q * nz] as V2);
      for (let q = 0; q < 4; q++) c.addSeg({ a: cs[q], b: cs[(q + 1) % 4] });
    }
    for (let k = 0; k < Math.floor(s.w * 0.6); k++)
      V.push(
        color(
          place(B(0.5, 0.08, 0.08), bx - nx * (0.4 + k * 0.5), 1.0, bz - nz * (0.4 + k * 0.5), -ang + Math.PI / 2),
          k % 2 ? 0xffffff : 0xd8281c,
        ),
      );
    V.push(
      color(
        place(new THREE.CylinderGeometry(0.06, 0.08, 5, 6).translate(0, 2.5, 0), bx - s.ux * 3, 0, bz - s.uz * 3),
        0x4a4a4a,
      ),
    );
    V.push(color(place(B(0.6, 0.4, 0.3), bx - s.ux * 3 - nx * 0.3, 4.9, bz - s.uz * 3 - nz * 0.3, -ang), 0x2a2a2a));
    for (const sd of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      const L = 6;
      for (let i = 0; i <= 120; i++) {
        const t = i / 120,
          a = t * 28 * Math.PI;
        pts.push(
          new THREE.Vector3(
            mx + s.ux * (t - 0.5) * L * 0 + nx * sd * (s.w / 2 + 0.6) + Math.cos(ang) * (t - 0.5) * L,
            0.4 + Math.sin(a) * 0.35,
            mz + nz * sd * (s.w / 2 + 0.6) + Math.sin(ang) * (t - 0.5) * L + Math.cos(a) * 0.35,
          ),
        );
      }
      WIRE.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.012, 3, false));
    }
    trash(mx + nx * (s.w / 2 + 1.5), mz + nz * (s.w / 2 + 1.5));
  }
  for (const s of segs) {
    const nx = -s.uz,
      nz = s.ux;
    for (let d = 2 + rnd() * 6; d < s.L - 2; d += 7 + rnd() * 10) {
      const x0 = s.a[0] + s.ux * d,
        z0 = s.a[1] + s.uz * d;
      const sd = rnd() < 0.5 ? 1 : -1;
      const ex = x0 + nx * (s.w / 2 + 0.2) * sd,
        ez = z0 + nz * (s.w / 2 + 0.2) * sd;
      const r0 = rnd();
      if (checkpoints.some(q => Math.hypot(q[0] - x0, q[1] - z0) < 9)) continue;
      if (r0 < 0.3) {
        if (freeAt(ex, ez, 0.8)) trash(ex, ez);
      } else if (r0 < 0.45) {
        if (freeAt(ex, ez, 0.8)) debris(ex, ez);
      } else if (r0 < 0.5 && s.w >= 6) {
        const cx = x0 + nx * (s.w / 2 - 1.3) * sd,
          cz = z0 + nz * (s.w / 2 - 1.3) * sd;
        if (freeAt(cx, cz, 2.4)) burntCar(cx, cz, Math.atan2(s.uz, s.ux) + (rnd() - 0.5) * 0.5);
      } else if (r0 < 0.56) {
        if (freeAt(ex, ez, 1.2))
          sandbagRow(
            ex - nx * sd * 0.6,
            ez - nz * sd * 0.6,
            Math.atan2(s.uz, s.ux) + (rnd() - 0.5) * 0.4,
            2 + rnd() * 2,
            2 + Math.floor(rnd() * 2),
          );
      } else if (r0 < 0.6 && s.w <= 7) {
        const cx = x0,
          cz = z0;
        if (freeAt(cx, cz, 1)) {
          rnd() < 0.5
            ? aframe(cx + nx * 1.2, cz + nz * 1.2, Math.atan2(nz, nx))
            : jersey(cx + nx * 1.4 * sd, cz + nz * 1.4 * sd, Math.atan2(nz, nx) + (rnd() - 0.5) * 0.4);
        }
      }
      if (rnd() < 0.3) {
        const px = x0 + nx * (rnd() - 0.5) * s.w * 0.8,
          pz = z0 + nz * (rnd() - 0.5) * s.w * 0.8;
        HOLE.push(place(blobShape(0.2 + rnd() * 0.3), px, 0.035, pz));
        if (rnd() < 0.6) PUD.push(place(blobShape(0.5 + rnd() * 1.4), px + (rnd() - 0.5), 0.045, pz + (rnd() - 0.5)));
      }
      if (rnd() < 0.15)
        PUD.push(
          place(blobShape(1 + rnd() * 1.6), x0 + nx * (s.w / 2 - 0.8) * sd, 0.045, z0 + nz * (s.w / 2 - 0.8) * sd),
        );
    }
  }
  // ---------- build meshes ----------
  let pudMat: THREE.MeshStandardMaterial | null = null;
  const meshes: THREE.Mesh[] = [];
  const add = (g: THREE.BufferGeometry[], m: THREE.Material, shadow = true) => {
    if (!g.length) return null;
    for (const x of g)
      for (const k of Object.keys(x.attributes))
        if (!['position', 'normal', 'uv', 'color'].includes(k)) x.deleteAttribute(k);
    const me = new THREE.Mesh(c.merge(g.map(x => (x.index ? x.toNonIndexed() : x))), m);
    me.castShadow = shadow;
    me.receiveShadow = true;
    c.scene.add(me);
    meshes.push(me);
    return me;
  };
  for (const g of PUD.concat(HOLE)) {
    g.deleteAttribute('uv');
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  add(V, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 }));
  add(WIRE, new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7 }), false); // overhead cables: no shadow scribbles on the asphalt
  const atlas = signAtlas();
  const signMat = new THREE.MeshStandardMaterial({
    map: atlas,
    emissive: 0xffffff,
    emissiveMap: atlas,
    emissiveIntensity: 0.12,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  add(SIGN, signMat);
  add(
    HOLE,
    new THREE.MeshStandardMaterial({
      color: 0x34343a,
      roughness: 1,
      transparent: true,
      opacity: 0.6,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    false,
  );
  add(
    PUD,
    (pudMat = new THREE.MeshStandardMaterial({
      color: 0x46525c,
      roughness: 0.06,
      metalness: 0.6,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    })),
    false,
  );
  // AC drips (pooled points near player)
  const ND = 48;
  const dg = new THREE.BufferGeometry();
  const dp = new Float32Array(ND * 3);
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const drops = new THREE.Points(
    dg,
    new THREE.PointsMaterial({ color: 0xa8c8e0, size: 0.06, transparent: true, opacity: 0.8 }),
  );
  drops.frustumCulled = false;
  c.scene.add(drops);
  const dsrc: THREE.Vector3[] = [];
  const dv = new Float32Array(ND);
  let dt0 = 0;
  return {
    setWet: (w: number) => {
      if (pudMat) pudMat.opacity = 0.1 + w * 0.7;
    },
    checkpoints,
    polePos: allPoles.map(p => [p.x, p.z] as [number, number]),
    poles: allPoles.length,
    acs: acs.length,
    update(dt: number, night: number, px: number, pz: number) {
      signMat.emissiveIntensity = 0.12 + night * 0.85;
      dt0 -= dt;
      if (dt0 <= 0) {
        dt0 = 1;
        dsrc.length = 0;
        acs
          .filter(a => Math.abs(a.x - px) < 30 && Math.abs(a.z - pz) < 30)
          .slice(0, 16)
          .forEach(a => dsrc.push(a));
      }
      for (let i = 0; i < ND; i++) {
        if (!dsrc.length) {
          dp[i * 3 + 1] = -10;
          continue;
        }
        dv[i] += dt * 9.8;
        dp[i * 3 + 1] -= dv[i] * dt;
        if (dp[i * 3 + 1] < 0.02) {
          const s = dsrc[i % dsrc.length];
          dp[i * 3] = s.x;
          dp[i * 3 + 1] = s.y - 0.3 - Math.random() * 2.5;
          dp[i * 3 + 2] = s.z;
          dv[i] = Math.random() * 2;
        }
      }
      dg.attributes.position.needsUpdate = true;
    },
  };
}
