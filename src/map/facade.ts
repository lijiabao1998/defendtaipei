import { shrink } from './texq';
// Round 6: realistic windows (鋁窗/鐵窗/冷氣/雨遮), Taiwanese rooftop clutter, and to-scale sidewalks / 標線型人行道 / curb lines.
// Uses its own seeded PRNG so it never shifts the game's global rnd() sequence.
import * as THREE from 'three';
type V2 = [number, number];
export type FCtx = {
  scene: THREE.Scene;
  pip: (p: V2, pts: V2[]) => boolean;
  bldAt: (x: number, z: number) => any;
  merge: (g: THREE.BufferGeometry[]) => THREE.BufferGeometry;
  roads: { p: V2[]; t: string; n?: string }[];
  blds: any[];
  RW: Record<string, number>;
  center: V2;
  R: number;
};
const B = (x: number, y: number, z: number, tx = 0, ty = 0, tz = 0) =>
  new THREE.BoxGeometry(x, y, z).translate(tx, ty, tz);
const Cy = (r0: number, r1: number, h: number, ty = 0, seg = 10) =>
  new THREE.CylinderGeometry(r1, r0, h, seg).translate(0, ty, 0);
const strip = (g: THREE.BufferGeometry) => {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
};
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function ctex(w: number, h: number, f: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  f(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(shrink(cv));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildFacade(c: FCtx) {
  const rnd = prng(20261025);
  const { center, R } = c;
  const M = (g: THREE.BufferGeometry[]) => c.merge(g.map(strip));
  const near = (x: number, z: number, r = R) => Math.hypot(x - center[0], z - center[1]) < r;
  // ---- instanced window parts (local +z = out of the wall) ----
  type L = { m: THREE.Matrix4; c: number };
  const parts = new Map<string, { g: THREE.BufferGeometry; mat: THREE.Material; L: L[]; shadow: boolean }>();
  const def = (k: string, g: THREE.BufferGeometry, mat: THREE.Material, shadow = false) =>
    parts.set(k, { g, mat, L: [], shadow });
  const put = (k: string, x: number, y: number, z: number, ry: number, col = 0xffffff, sx = 1, sy = 1) =>
    parts.get(k)!.L.push({
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
        new THREE.Vector3(sx, sy, 1),
      ),
      c: col,
    });
  const std = (o: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, ...o });
  // sky env so the glass actually reflects something
  const envT = ctex(64, 32, g => {
    const gr = g.createLinearGradient(0, 0, 0, 32);
    gr.addColorStop(0, '#cfe0ee');
    gr.addColorStop(0.5, '#8ea4b4');
    gr.addColorStop(0.52, '#3a3a38');
    gr.addColorStop(1, '#1a1a1a');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 32);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(40,40,40,${0.4 + Math.random() * 0.4})`;
      g.fillRect(Math.random() * 64, 10 + Math.random() * 6, 3 + Math.random() * 6, 22);
    }
  });
  envT.mapping = THREE.EquirectangularReflectionMapping;
  const W = 1.7,
    H = 1.35;
  def(
    'reveal',
    new THREE.PlaneGeometry(W + 0.24, H + 0.24).translate(0, 0, 0.012),
    std({ color: 0x15181b, roughness: 1 }),
  );
  def('paneDark', new THREE.PlaneGeometry(W - 0.1, H - 0.1).translate(0, 0, 0.022), std({ roughness: 1 }));
  const litMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  def('paneLit', new THREE.PlaneGeometry(W - 0.1, H - 0.1).translate(0, 0, 0.022), litMat);
  const blindT = ctex(32, 64, g => {
    g.fillStyle = '#e8e4d8';
    g.fillRect(0, 0, 32, 64);
    g.fillStyle = 'rgba(90,85,70,.45)';
    for (let y = 0; y < 64; y += 4) g.fillRect(0, y, 32, 1);
  });
  const curtT = ctex(64, 32, g => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 64, 32);
    for (let x = 0; x < 64; x += 6) {
      const gr = g.createLinearGradient(x, 0, x + 6, 0);
      gr.addColorStop(0, 'rgba(0,0,0,.25)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,.25)');
      g.fillStyle = gr;
      g.fillRect(x, 0, 6, 32);
    }
  });
  def('curtain', new THREE.PlaneGeometry(0.75, H - 0.12).translate(0, 0, 0.028), std({ map: curtT, roughness: 1 }));
  def('blind', new THREE.PlaneGeometry(W - 0.14, 0.7).translate(0, 0, 0.029), std({ map: blindT, roughness: 1 }));
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fb4c0,
    metalness: 0.9,
    roughness: 0.08,
    envMap: envT,
    envMapIntensity: 1.1,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  def('glass', new THREE.PlaneGeometry(W / 2, H - 0.1), glassMat); // one sliding sash; placed twice at different depths
  // aluminium frame + sash rails (鋁窗)
  const fr = (w: number, h: number, t: number, d: number, z: number) => [
    B(w, t, d, 0, h / 2 - t / 2, z),
    B(w, t, d, 0, -h / 2 + t / 2, z),
    B(t, h, d, w / 2 - t / 2, 0, z),
    B(t, h, d, -w / 2 + t / 2, 0, z),
  ];
  def(
    'alu',
    M([
      ...fr(W, H, 0.06, 0.07, 0.04),
      B(0.05, H - 0.1, 0.05, -0.02, 0, 0.05),
      B(0.05, H - 0.1, 0.05, 0.03, 0, 0.065),
      B(W + 0.1, 0.05, 0.16, 0, -H / 2 - 0.04, 0.08),
    ]),
    std({ metalness: 0.6, roughness: 0.35 }),
  );
  // 鐵窗 cages: outer frame + pattern
  const cageBox = (pat: number) => {
    const w = W + 0.3,
      h = H + 0.3,
      d = 0.32,
      t = 0.035,
      gs: THREE.BufferGeometry[] = [];
    gs.push(
      ...fr(w, h, t, t, d),
      B(t, t, d, w / 2, h / 2, d / 2),
      B(t, t, d, -w / 2, h / 2, d / 2),
      B(t, t, d, w / 2, -h / 2, d / 2),
      B(t, t, d, -w / 2, -h / 2, d / 2),
      B(w, 0.02, d, 0, h / 2, d / 2),
      B(w, 0.02, d, 0, -h / 2, d / 2),
    ); // top/bottom plates
    if (pat === 0) for (let x = -w / 2 + 0.12; x < w / 2; x += 0.12) gs.push(B(0.016, h, 0.016, x, 0, d)); // straight bars
    if (pat === 1) {
      for (let x = -w / 2 + 0.15; x < w / 2; x += 0.15) gs.push(B(0.016, h, 0.016, x, 0, d));
      for (let y = -h / 2 + 0.3; y < h / 2; y += 0.3) gs.push(B(w, 0.016, 0.016, 0, y, d));
    } // grid
    if (pat === 2) {
      const n = 6;
      for (let i = -n; i <= n; i++) {
        const g = B(0.016, h * 1.42, 0.016, i * 0.28, 0, d);
        g.rotateZ(0.785).translate(0, 0, 0);
        gs.push(g.clone());
        gs.push(B(0.016, h * 1.42, 0.016, i * 0.28, 0, d).rotateZ(-0.785));
      }
    } // 花窗 diamond (clipped look)
    if (pat === 3) {
      for (let x = -w / 2 + 0.1; x < w / 2; x += 0.1) gs.push(B(0.016, h, 0.016, x, 0, d));
      for (let k = 0; k < 4; k++)
        gs.push(
          new THREE.TorusGeometry(0.16, 0.012, 4, 14).translate(-w / 2 + 0.25 + (k * (w - 0.5)) / 3, h / 2 - 0.25, d),
        );
    } // bars + 花 rings
    return M(gs);
  };
  const cageMat = std({ metalness: 0.5, roughness: 0.75 });
  for (let p = 0; p < 4; p++) def('cage' + p, cageBox(p), cageMat, true);
  def(
    'ac',
    M([
      B(0.75, 0.48, 0.5, 0, 0, 0.25),
      B(0.8, 0.03, 0.55, 0, -0.27, 0.25),
      B(0.03, 0.03, 0.55, -0.3, -0.3, 0.25).rotateX(0),
      B(0.03, 0.03, 0.55, 0.3, -0.3, 0.25),
    ]),
    std({ roughness: 0.6 }),
    true,
  );
  def('acGrill', new THREE.CircleGeometry(0.17, 12).translate(0.12, 0, 0.502), std({ color: 0x2a2a2a, roughness: 1 }));
  def(
    'awn',
    B(W + 0.5, 0.025, 0.55, 0, 0, 0.27).rotateX(0.35),
    std({ metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide }),
    true,
  );
  def(
    'board',
    M([
      B(W + 0.1, 0.22, 0.03, 0, 0.35, 0.06),
      B(W + 0.1, 0.22, 0.03, 0, -0.05, 0.06),
      B(W + 0.1, 0.22, 0.03, 0, -0.42, 0.06),
      B(0.2, H + 0.2, 0.03, 0, 0, 0.08).rotateZ(0.6),
    ]),
    std({ color: 0x9a7a4a, roughness: 1 }),
  );
  def(
    'shard',
    M([
      new THREE.ShapeGeometry(
        new THREE.Shape([
          new THREE.Vector2(-0.4, -0.6),
          new THREE.Vector2(0.4, -0.6),
          new THREE.Vector2(0.2, -0.2),
          new THREE.Vector2(-0.1, 0.1),
        ]),
      ).translate(0, 0, 0.034),
      new THREE.ShapeGeometry(
        new THREE.Shape([new THREE.Vector2(0.4, 0.6), new THREE.Vector2(0.2, 0.6), new THREE.Vector2(0.4, 0.1)]),
      ).translate(0, 0, 0.034),
    ]),
    glassMat,
  );
  const RUST = [0x5a3220, 0x6e3c22, 0x7a4a2a, 0x3a3a36, 0xd0d0c8, 0x8a8a84, 0x3d5a46];
  const LIT = [0xffd9a0, 0xfff0d8, 0xe8f4ff, 0xffc890];
  const CUR = [0xe8dcc0, 0xd890a0, 0x7aa0c8, 0xc8c8a0, 0x9a6a5a, 0xf0f0f0];
  const AWC = [0x6f8f86, 0x5f8a86, 0x7e948a, 0x6a8a80, 0x9a4a3a, 0x8a5040, 0xa85a46, 0x6f8f86, 0x9a4a3a, 0x8a9aa0]; // 灰綠/青 + 鐵紅為主
  let nWin = 0;
  const litW: { x: number; y: number; z: number }[] = [];
  for (const b of c.blds) {
    if (!b.wins || !near(b.c[0], b.c[1], R)) continue;
    // v23.9 infill row houses only get 3D window units in the closest blocks (painted windows beyond)
    if (b.fill && !near(b.c[0], b.c[1], R * 0.25)) continue;
    const style = rnd();
    const aluC = style < 0.6 ? 0xb8bcc0 : style < 0.85 ? 0x6a5a48 : 0x3a3a3a; // 銀色/茶色鋁窗/黑框
    const cagePat = Math.floor(rnd() * 4),
      cageCol = RUST[Math.floor(rnd() * RUST.length)];
    for (const w of b.wins) {
      const { x, y, z, ry } = w;
      nWin++;
      const r = rnd();
      const ox = Math.sin(ry),
        oz = Math.cos(ry);
      put('reveal', x, y, z, ry);
      if (r < 0.07) {
        put('board', x, y, z, ry);
        continue;
      } // boarded up
      const broken = r < 0.13;
      const lit = !broken && rnd() < 0.38;
      if (lit) {
        put('paneLit', x, y, z, ry, LIT[Math.floor(rnd() * LIT.length)]);
        litW.push({ x: x + ox * 0.4, y, z: z + oz * 0.4 });
      } else put('paneDark', x, y, z, ry, [0x3a4048, 0x48443c, 0x40404a][Math.floor(rnd() * 3)]);
      const cr = rnd();
      if (cr < 0.45) {
        const cc = CUR[Math.floor(rnd() * CUR.length)];
        const dx = (W / 2 - 0.37) * (rnd() < 0.5 ? 1 : -1);
        put('curtain', x + Math.cos(ry) * dx, y, z - Math.sin(ry) * dx, ry, cc);
        if (rnd() < 0.5) put('curtain', x - Math.cos(ry) * dx, y, z + Math.sin(ry) * dx, ry, cc);
      } else if (cr < 0.65) put('blind', x, y + 0.3, z, ry, 0xffffff);
      if (broken) put('shard', x, y, z, ry, 0xffffff);
      else {
        const sl = (rnd() - 0.5) * 0.5;
        const a1 = -W / 4 + Math.max(0, sl),
          a2 = W / 4 + Math.min(0, sl); // two sashes, one slid open a bit
        put('glass', x + Math.cos(ry) * a1 + ox * 0.03, y, z - Math.sin(ry) * a1 + oz * 0.03, ry, 0xffffff);
        put('glass', x + Math.cos(ry) * a2 + ox * 0.045, y, z - Math.sin(ry) * a2 + oz * 0.045, ry, 0xffffff);
      }
      put('alu', x, y, z, ry, aluC);
      if (rnd() < 0.62) put('cage' + (rnd() < 0.8 ? cagePat : Math.floor(rnd() * 4)), x, y, z, ry, cageCol);
      if (rnd() < 0.42) put('awn', x, y + H / 2 + 0.25, z, ry, AWC[Math.floor(rnd() * AWC.length)]);
      if (rnd() < 0.3) {
        const s = rnd() < 0.5 ? 1 : -1,
          dx = s * (W / 2 + 0.55);
        const ax = x + Math.cos(ry) * dx,
          az = z - Math.sin(ry) * dx;
        const ay = y - 0.35 + (rnd() < 0.5 ? 0 : 0.6);
        put('ac', ax, ay, az, ry, [0xd8d2c0, 0xe8e8e0, 0xb8b0a0][Math.floor(rnd() * 3)]);
        put('acGrill', ax, ay, az, ry);
      }
    }
  }
  const meshes: THREE.InstancedMesh[] = [];
  const col = new THREE.Color();
  parts.forEach((e, k) => {
    if (!e.L.length) return;
    const im = new THREE.InstancedMesh(e.g, e.mat, e.L.length);
    e.L.forEach((l, i) => {
      im.setMatrixAt(i, l.m);
      im.setColorAt(i, col.setHex(l.c));
    });
    im.castShadow = e.shadow;
    im.receiveShadow = !k.startsWith('glass');
    if (k === 'glass' || k === 'shard') im.renderOrder = 2;
    c.scene.add(im);
    meshes.push(im);
  });

  // ---- rooftops: 女兒牆, railings, 樓梯間, water towers, 太陽能熱水器, antennas, dishes, laundry, 頂樓菜園 ----
  let nRoof = 0;
  for (const b of c.blds) {
    if (!near(b.c[0], b.c[1], R * 1.35) || b.h < 3 || !b.roof) continue;
    const pts: V2[] = b.pts;
    const h = b.h;
    const V: { g: THREE.BufferGeometry; col: number }[] = [];
    const va = (g: THREE.BufferGeometry, col: number) => V.push({ g, col });
    const rr = prng(b.id * 7919 + 13);
    const used: V2[] = [];
    const spot = (r: number): V2 | null => {
      for (let k = 0; k < 14; k++) {
        const p: V2 = [b.minx + rr() * (b.maxx - b.minx), b.minz + rr() * (b.maxz - b.minz)];
        const ok =
          [
            [r, 0],
            [-r, 0],
            [0, r],
            [0, -r],
          ].every(([dx, dz]) => c.pip([p[0] + dx, p[1] + dz], pts)) &&
          used.every(u => Math.hypot(u[0] - p[0], u[1] - p[1]) > r + 1.0);
        if (ok) {
          used.push(p);
          return p;
        }
      }
      return null;
    };
    // parapet with tile cap (most RC roofs) + rusty railing on some
    const parH = 0.9 + rr() * 0.4,
      parC = [0xb8b0a0, 0xa89a88, 0xc8c0b0, 0x8f8a80][Math.floor(rr() * 4)];
    const rail = rr() < 0.35;
    if (rr() < 0.88)
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i],
          e = pts[(i + 1) % pts.length];
        const l = Math.hypot(e[0] - a[0], e[1] - a[1]);
        if (l < 0.3) continue;
        const ang = -Math.atan2(e[1] - a[1], e[0] - a[0]);
        const mx = (a[0] + e[0]) / 2,
          mz = (a[1] + e[1]) / 2;
        va(
          B(l + 0.2, parH, 0.2)
            .rotateY(ang)
            .translate(mx, h + parH / 2, mz),
          parC,
        );
        va(
          B(l + 0.26, 0.05, 0.28)
            .rotateY(ang)
            .translate(mx, h + parH + 0.025, mz),
          [0x8a8478, 0x6e6a62, 0xb0a890][Math.floor(rr() * 3)] /* cement / tile cap */,
        );
        if (rail) {
          va(
            B(l, 0.04, 0.04)
              .rotateY(ang)
              .translate(mx, h + parH + 0.8, mz),
            0x6a3a22,
          );
          for (let s = 0; s < l; s += 1.2) {
            const t = s / l;
            va(
              B(0.04, 0.8, 0.04).translate(a[0] + (e[0] - a[0]) * t, h + parH + 0.4, a[1] + (e[1] - a[1]) * t),
              0x6a3a22,
            );
          }
        }
      }
    const A = (b.maxx - b.minx) * (b.maxz - b.minz);
    if (A > 30 && rr() < 0.55) {
      const p = spot(1.4);
      if (p) {
        const ry = rr() * 6;
        va(
          B(2.4, 2.6, 2.6)
            .rotateY(ry)
            .translate(p[0], h + 1.3, p[1]),
          parC,
        );
        va(B(0.9, 2.0, 0.06, 0, 1.0, 1.31).rotateY(ry).translate(p[0], h, p[1]), 0x5a5048);
        va(
          B(2.6, 0.1, 2.8)
            .rotateY(ry)
            .translate(p[0], h + 2.65, p[1]),
          0x7a7a76,
        ); // 樓梯間 + door
        if (rr() < 0.6) {
          const tc = rr() < 0.5 ? 0xc8ccd0 : [0x2a6ab0, 0xe8e4d8][Math.floor(rr() * 2)];
          va(Cy(0.55, 0.55, 1.3, 0, 12).translate(p[0], h + 2.7 + 0.65 + 0.1, p[1]), tc);
        }
      }
    } // tank on top of 樓梯間
    if (rr() < 0.55) {
      const p = spot(1.0);
      if (p) {
        const st = 1.2 + rr() * 2.2,
          tc = [0xc8ccd0, 0xd0d4d8, 0x2a6ab0, 0xe8e4d8][Math.floor(rr() * 4)]; // steel-frame water tower
        for (const [ox, oz] of [
          [-0.5, -0.5],
          [0.5, -0.5],
          [0.5, 0.5],
          [-0.5, 0.5],
        ])
          va(B(0.06, st, 0.06).translate(p[0] + ox, h + st / 2, p[1] + oz), 0x5a4030);
        for (let yy = 0.5; yy < st; yy += 0.8) {
          va(B(1.06, 0.05, 0.05).translate(p[0], h + yy, p[1] - 0.5), 0x5a4030);
          va(B(1.06, 0.05, 0.05).translate(p[0], h + yy, p[1] + 0.5), 0x5a4030);
          va(B(0.05, 0.05, 1.06).translate(p[0] - 0.5, h + yy, p[1]), 0x5a4030);
          va(B(0.05, 0.05, 1.06).translate(p[0] + 0.5, h + yy, p[1]), 0x5a4030);
        }
        va(B(1.2, 0.06, 1.2).translate(p[0], h + st, p[1]), 0x5a4030);
        va(Cy(0.55, 0.55, 1.3, 0, 12).translate(p[0], h + st + 0.68, p[1]), tc);
        va(Cy(0.3, 0.05, 0.12, 0, 10).translate(p[0], h + st + 1.39, p[1]), tc);
        va(Cy(0.04, 0.04, st + 0.5, 0, 5).translate(p[0] + 0.6, h + st / 2, p[1]), 0x8a8a84);
      }
    }
    if (rr() < 0.4) {
      const p = spot(1.2);
      if (p) {
        const ry = rr() < 0.7 ? 0 : rr() * 6; // 太陽能熱水器: tilted tube collector + white tank
        const pan = B(1.9, 0.06, 1.3).rotateX(-0.55).translate(0, 0.75, 0);
        va(pan.rotateY(ry).translate(p[0], h, p[1]), 0x1a2a4a);
        for (let k = -4; k <= 4; k++)
          va(
            B(0.07, 0.08, 1.3)
              .rotateX(-0.55)
              .translate(k * 0.2, 0.79, 0)
              .rotateY(ry)
              .translate(p[0], h, p[1]),
            0x5a7090,
          );
        va(
          Cy(0.26, 0.26, 2.0, 0, 10)
            .rotateZ(Math.PI / 2)
            .translate(0, 1.25, -0.55)
            .rotateY(ry)
            .translate(p[0], h, p[1]),
          0xe8e8e0,
        );
        for (const sx of [-0.85, 0.85])
          va(B(0.05, 1.2, 0.05, sx, 0.6, 0.2).rotateY(ry).translate(p[0], h, p[1]), 0x8a8a8a);
      }
    }
    if (rr() < 0.45) {
      const p = spot(0.4);
      if (p) {
        const ah = 2.5 + rr() * 2;
        va(Cy(0.03, 0.025, ah, 0, 5).translate(p[0], h + ah / 2, p[1]), 0x9a9a96);
        const ry = rr() * 3; // TV yagi antenna
        va(
          B(1.4, 0.025, 0.025)
            .rotateY(ry)
            .translate(p[0], h + ah - 0.1, p[1]),
          0x9a9a96,
        );
        for (let k = -3; k <= 3; k++)
          va(
            B(0.02, 0.02, 0.6 - Math.abs(k) * 0.05)
              .translate(k * 0.2, 0, 0)
              .rotateY(ry)
              .translate(p[0], h + ah - 0.1, p[1]),
            0x9a9a96,
          );
        if (rr() < 0.5) {
          va(
            B(1.0, 0.02, 0.02)
              .rotateY(ry + 0.4)
              .translate(p[0], h + ah - 0.6, p[1]),
            0x8a8a86,
          );
        }
      }
    }
    if (rr() < 0.25) {
      const p = spot(0.6);
      if (p) {
        const ry = rr() * 6;
        va(
          new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, 0.9)
            .rotateX(-1.2)
            .translate(0, 0.9, 0)
            .rotateY(ry)
            .translate(p[0], h, p[1]),
          0xe0e0dc,
        );
        va(B(0.05, 0.9, 0.05, 0, 0.45, 0).translate(p[0], h, p[1]), 0x6a6a66);
      }
    } // satellite dish
    if (rr() < 0.45) {
      const p = spot(1.6);
      if (p) {
        const ry = rr() * 6,
          len = 2.4 + rr(); // laundry: two poles + two lines + clothes
        for (const s of [-1, 1])
          va(
            B(0.05, 1.8, 0.05, (s * len) / 2, 0.9, 0)
              .rotateY(ry)
              .translate(p[0], h, p[1]),
            0x8a8a8a,
          );
        for (const zz of [-0.15, 0.15])
          va(B(len, 0.015, 0.015, 0, 1.75, zz).rotateY(ry).translate(p[0], h, p[1]), 0x2a2a2a);
        for (let x = -len / 2 + 0.25; x < len / 2 - 0.2; x += 0.3 + rr() * 0.25) {
          const ch = 0.4 + rr() * 0.5;
          va(
            B(0.28 + rr() * 0.2, ch, 0.01, x, 1.75 - ch / 2, rr() < 0.5 ? -0.15 : 0.15)
              .rotateY(ry)
              .translate(p[0], h, p[1]),
            [0xe8e8e8, 0x2a4a8a, 0xc83a3a, 0xe8c040, 0x3a8a5a, 0x8a5aa0, 0x1a1a1a, 0xe8a0b0][Math.floor(rr() * 8)],
          );
        }
      }
    }
    const gardens = rr() < 0.45 ? 1 + Math.floor(rr() * 2) : 0;
    for (let g = 0; g < gardens; g++) {
      const p = spot(1.0);
      if (!p) break;
      const ry = rr() * 6; // 頂樓菜園: styrofoam boxes + pots
      for (let k = 0; k < 4 + rr() * 5; k++) {
        const ox = (rr() - 0.5) * 1.8,
          oz = (rr() - 0.5) * 1.4;
        const foam = rr() < 0.55;
        if (foam) {
          va(B(0.6, 0.3, 0.4, ox, 0.15, oz).rotateY(ry).translate(p[0], h, p[1]), 0xf0f0ea);
          va(
            B(0.52, 0.18, 0.34, ox, 0.38, oz).rotateY(ry).translate(p[0], h, p[1]),
            [0x3a7a2a, 0x5a8a3a, 0x2a5a20][Math.floor(rr() * 3)],
          );
        } else {
          va(
            Cy(0.14, 0.2, 0.3, 0.15, 8).translate(ox, 0, oz).rotateY(ry).translate(p[0], h, p[1]),
            [0xa0583a, 0x3a3a3a, 0x2a5aa8][Math.floor(rr() * 3)],
          );
          va(
            new THREE.SphereGeometry(0.25 + rr() * 0.15, 7, 5)
              .translate(ox, 0.5, oz)
              .rotateY(ry)
              .translate(p[0], h, p[1]),
            0x2a6a2a,
          );
        }
      }
      if (rr() < 0.4)
        for (const s of [-1, 1])
          va(
            B(0.03, 1.4, 0.03, s * 0.9, 0.7, 0)
              .rotateY(ry)
              .translate(p[0], h, p[1]),
            0x6a8a3a,
          );
    } // bamboo trellis
    for (let k = 0; k < 2 + rr() * 4; k++) {
      const p = spot(0.3);
      if (!p) break;
      va(
        B(0.4 + rr() * 0.4, 0.2 + rr() * 0.4, 0.3 + rr() * 0.3)
          .rotateY(rr() * 3)
          .translate(p[0], h + 0.2, p[1]),
        [0x7a6a5a, 0x3a3a3a, 0x2a5aa8, 0x9a8a70][Math.floor(rr() * 4)],
      );
    } // junk
    if (!V.length) continue;
    nRoof++;
    const gs = V.map(({ g, col }) => {
      const s = strip(g);
      const n = s.attributes.position.count;
      const cc = new THREE.Color(col);
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        a[i * 3] = cc.r;
        a[i * 3 + 1] = cc.g;
        a[i * 3 + 2] = cc.b;
      }
      s.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return s;
    });
    const me = new THREE.Mesh(c.merge(gs), roofVC);
    me.castShadow = true;
    me.receiveShadow = true;
    b.roof.add(me);
  }

  // ---- street surface: to-scale raised sidewalks (discontinuous), 綠色標線型人行道, continuous red / yellow curb lines ----
  const SWg: THREE.BufferGeometry[] = [],
    CURB: THREE.BufferGeometry[] = [],
    GREEN: THREE.BufferGeometry[] = [],
    WHITE: THREE.BufferGeometry[] = [],
    RED: THREE.BufferGeometry[] = [],
    YEL: THREE.BufferGeometry[] = [],
    ICON: THREE.BufferGeometry[] = [];
  const strip2 = (L: number, w: number, y: number, cx: number, cz: number, ang: number, hgt = 0) =>
    (hgt ? B(L, hgt, w, 0, hgt / 2, 0) : new THREE.PlaneGeometry(L, w).rotateX(-Math.PI / 2))
      .rotateY(ang)
      .translate(cx, y, cz);
  const onRoad = (x: number, z: number, self: number) =>
    c.roads.some((r, ri) => {
      if (ri === self) return false;
      const w = (c.RW[r.t.replace('_link', '')] ?? 3) / 2;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [ax, az] = r.p[i],
          [bx, bz] = r.p[i + 1];
        const dx = bx - ax,
          dz = bz - az,
          l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        if (Math.hypot(ax + dx * t - x, az + dz * t - z) < w + 0.3) return true;
      }
      return false;
    });
  const spots: Record<string, V2 | null> = { green: null, sw: null, red: null };
  const sd = (k: string, x: number, z: number) => {
    const o = spots[k];
    if (!o || Math.hypot(x - center[0], z - center[1]) < Math.hypot(o[0] - center[0], o[1] - center[1]))
      spots[k] = [x, z];
  };
  const stats = { sidewalk: 0, green: 0, red: 0, yellow: 0, none: 0 };
  c.roads.forEach((r, ri) => {
    const t = r.t.replace('_link', '');
    const w = c.RW[t] ?? 3;
    if (w < 5 || t === 'footway' || t === 'pedestrian') return;
    const rr = prng(ri * 104729 + 7);
    const big = w >= 12,
      mid = w >= 9 && !big;
    const q = rr();
    // per-road style (Taiwan reality: big roads curbed sidewalks 1.5–2.5m but broken by 騎樓/driveways; 6–10m alleys mostly nothing, some 1.0m green lane + white edge line; red no-parking only on some)
    const style = big
      ? q < 0.8
        ? 'sw'
        : 'none'
      : mid
        ? q < 0.45
          ? 'sw'
          : q < 0.75
            ? 'green'
            : 'none'
        : q < 0.35
          ? 'green'
          : 'none';
    const swW = big ? 1.5 + rr() * 1.0 : 1.2 + rr() * 0.3;
    const greenW = mid ? 1.2 : 1.0;
    const sides = style === 'green' && rr() < 0.7 ? [rr() < 0.5 ? 1 : -1] : [1, -1];
    const lineK: Record<number, string> = {};
    for (const s of [1, -1]) {
      const lq = rr();
      lineK[s] = big
        ? lq < 0.55
          ? 'red'
          : lq < 0.75
            ? 'yel'
            : ''
        : style === 'green'
          ? lq < 0.55
            ? 'yel'
            : lq < 0.7
              ? 'red'
              : ''
          : lq < 0.18
            ? 'red'
            : lq < 0.3
              ? 'yel'
              : '';
    }
    (stats as any)[style === 'sw' ? 'sidewalk' : style]++;
    if (Object.values(lineK).includes('red')) stats.red++;
    if (Object.values(lineK).includes('yel')) stats.yellow++;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 2 || !near((ax + bx) / 2, (az + bz) / 2, R * 1.8)) continue;
      const ux = (bx - ax) / L,
        uz = (bz - az) / L,
        nx = -uz,
        nz = ux,
        ang = -Math.atan2(uz, ux);
      const STEP = 2;
      for (let d = 1.0; d < L - 1.0; d += STEP) {
        const pl = Math.min(STEP, L - 1.0 - d);
        if (pl < 0.4) continue;
        const md = d + pl / 2;
        const cxm = ax + ux * md,
          czm = az + uz * md;
        for (const s of [1, -1]) {
          const ex = cxm + (nx * s * w) / 2,
            ez = czm + (nz * s * w) / 2; // road edge
          if (style === 'sw') {
            const off = w / 2 + swW / 2;
            const px = cxm + nx * s * off,
              pz = czm + nz * s * off;
            const bl = c.bldAt(px, pz) || c.bldAt(cxm + nx * s * (w / 2 + 0.2), czm + nz * s * (w / 2 + 0.2));
            if (!bl && !onRoad(px, pz, ri) && rr() > 0.06) {
              const hgt = rr() < 0.85 ? 0.15 : 0.2;
              SWg.push(strip2(pl + 0.02, swW, 0, px, pz, ang, hgt));
              sd('sw', px, pz);
              CURB.push(strip2(pl + 0.02, 0.15, 0, ex + nx * s * 0.075, ez + nz * s * 0.075, ang, hgt + 0.01));
              stats.none += 0;
            }
          }
          if (style === 'green' && sides.includes(s)) {
            const off = w / 2 - greenW / 2 - 0.05;
            const px = cxm + nx * s * off,
              pz = czm + nz * s * off;
            if (!c.bldAt(px, pz) && !onRoad(px, pz, ri)) {
              GREEN.push(strip2(pl + 0.02, greenW, 0.047, px, pz, ang));
              sd('green', px, pz);
              const wx = cxm + nx * s * (w / 2 - greenW - 0.12),
                wz = czm + nz * s * (w / 2 - greenW - 0.12);
              WHITE.push(strip2(pl + 0.02, 0.15, 0.049, wx, wz, ang));
              if (Math.floor(md / STEP) % 9 === 4)
                ICON.push(
                  new THREE.PlaneGeometry(0.7, 0.7)
                    .rotateX(-Math.PI / 2)
                    .rotateY(ang + (s > 0 ? Math.PI / 2 : -Math.PI / 2))
                    .translate(px, 0.05, pz),
                );
            }
          }
          // v19.2: curb paint moved to roads.ts (on the curb, per §168/§169)
          const lk = '';
          void lineK[s];
          if (lk) {
            const off =
              style === 'sw'
                ? w / 2 - 0.05
                : style === 'green' && sides.includes(s)
                  ? w / 2 - greenW - 0.27
                  : w / 2 - 0.12;
            const px = cxm + nx * s * off,
              pz = czm + nz * s * off;
            if (!c.bldAt(px, pz) && !onRoad(px, pz, ri)) if (lk === 'red') sd('red', px, pz);
            (lk === 'red' ? RED : YEL).push(strip2(pl + 0.02, 0.1, style === 'sw' ? 0.17 : 0.051, px, pz, ang));
          }
        }
      }
    }
  });
  const swT = ctex(64, 64, g => {
    g.fillStyle = '#8e8a80';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#6e6a62';
    g.lineWidth = 1;
    for (let i = 0; i <= 64; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.moveTo(0, i);
      g.lineTo(64, i);
      g.stroke();
    }
    for (let k = 0; k < 4; k++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '160,80,60' : '60,60,55'},.35)`;
      g.fillRect(Math.floor(Math.random() * 4) * 16, Math.floor(Math.random() * 4) * 16, 16, 16);
    }
  });
  swT.wrapS = swT.wrapT = THREE.RepeatWrapping;
  swT.repeat.set(0.5, 0.5);
  const add = (gs: THREE.BufferGeometry[], mat: THREE.Material, shadow = false) => {
    if (!gs.length) return;
    const m = new THREE.Mesh(M(gs), mat);
    m.receiveShadow = true;
    m.castShadow = shadow;
    c.scene.add(m);
  };
  // world-space UVs for sidewalk tiles
  if (SWg.length) {
    const g = M(SWg);
    const p = g.attributes.position,
      uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.5 + p.getY(i) * 0.5, p.getZ(i) * 0.5);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: swT, roughness: 0.95 }));
    m.receiveShadow = true;
    c.scene.add(m);
  }
  add(CURB, new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.9 }));
  const paint = (col: number) =>
    new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
  add(GREEN, paint(0x3f8a52));
  add(WHITE, paint(0xe8e8e0));
  add(RED, paint(0xc22222));
  add(YEL, paint(0xe0b020));
  const iconT = ctex(64, 64, g => {
    g.clearRect(0, 0, 64, 64);
    g.fillStyle = '#f0f0e8';
    g.beginPath();
    g.arc(24, 12, 6, 0, 7);
    g.fill();
    g.fillRect(19, 19, 10, 22);
    g.fillRect(19, 40, 4, 18);
    g.fillRect(25, 40, 4, 18);
    g.beginPath();
    g.arc(44, 26, 4, 0, 7);
    g.fill();
    g.fillRect(41, 31, 6, 14);
    g.fillRect(41, 45, 2.5, 12);
    g.fillRect(44.5, 45, 2.5, 12);
  });
  add(
    ICON,
    new THREE.MeshStandardMaterial({
      map: iconT,
      transparent: true,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    }),
  );
  return {
    spots,
    stats: { windows: nWin, roofs: nRoof, ...stats },
    update(night: number, pw: number) {
      litMat.color.setScalar(pw ? 0.42 + 0.58 * Math.min(1, night * 1.3) : 0.18 * (1 - night) + 0.04);
    },
  };
}
const roofVC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
