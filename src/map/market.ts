// v24.18 東三水街市場, built from a street photo: a narrow lane under a low corrugated roof with a strip of skylight,
// checker floor tiles, fluorescent tubes, numbered stalls down both sides. Vegetables, fish on ice, meat on hooks, sacks of
// rice, eggs, noodles and cooked food. What you find here is mostly raw, so it feeds the cooking loop. Stall names are
// generic. A few merged, unshadowed meshes.
import * as THREE from 'three';
import { frames, tintG, merged, type Frame } from './huaxi';

type V2 = [number, number];
type Geo = THREE.BufferGeometry;
export type MarketCont = { id: string; p: V2; label: string; items: Record<string, number> };
export type MarketDeps = {
  scene: THREE.Scene;
  road: V2[];
  crossing: (x: number, z: number) => boolean;
  addSeg: (a: V2, b: V2) => void;
};
const BAY = 3,
  HW = 3, // half width between the back walls of the stalls
  ROOF = 3.5;
type Kind = { sign: string; bg: string; goods: number[]; items: Record<string, number>[] };
const KINDS: Kind[] = [
  {
    sign: '菜攤',
    bg: '#2c7a3a',
    goods: [0x4f8a2f, 0x6aa83a, 0x3f7a2a, 0xd8d060, 0x8ab84a],
    items: [{ cabbage: 2 }, { cabbage: 1, sweetpotato: 1 }],
  },
  {
    sign: '水果攤',
    bg: '#d0641a',
    goods: [0xd8841a, 0xc8281c, 0xe8c030, 0x7ab030, 0xe88a3a],
    items: [{ canfruit: 1, banana: 2 }, { banana: 3 }],
  },
  {
    sign: '魚攤',
    bg: '#0f5f8a',
    goods: [0xc8d4dc, 0x9fb0bc, 0xe8eef2, 0xaab8c4, 0xd8e2e8],
    items: [{ rawfish: 2 }, { rawfish: 1, cracker: 1 }],
  },
  {
    sign: '肉攤',
    bg: '#8a1f1f',
    goods: [0xb8444a, 0xc85a58, 0xa83a40, 0xd8908a, 0xc8504e],
    items: [{ rawpork: 2 }, { rawpork: 1, roufong: 1 }],
  },
  {
    sign: '雜糧行',
    bg: '#8a6a2a',
    goods: [0xe8dcc0, 0xd8c8a0, 0xc8b480, 0xf0e8d0, 0xb8a070],
    items: [{ rawrice: 2, peanutcan: 1 }, { rawrice: 3 }],
  },
  {
    sign: '雞蛋行',
    bg: '#a8831a',
    goods: [0xf0e4c8, 0xe8d8b8, 0xf4ecd8, 0xe0d0a8, 0xecdcc0],
    items: [{ rawegg: 4 }, { rawegg: 3, driedtofu: 1 }],
  },
  {
    sign: '麵攤',
    bg: '#b33a14',
    goods: [0xf0e0a0, 0xe8d088, 0xf4e8b0, 0xd8c070, 0xe8d898],
    items: [
      { mianxian: 2, noodle: 1 },
      { mianxian: 1, mantou: 2 },
    ],
  },
  {
    sign: '熟食攤',
    bg: '#7a2a12',
    goods: [0xa8551a, 0xc88a3a, 0x8a3f12, 0xd8a050, 0xb86a2a],
    items: [
      { bento: 1, boiled: 1 },
      { oden: 2, mantou: 1 },
    ],
  },
];
function atlas() {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const c = cv.getContext('2d')!;
  KINDS.forEach((k, i) => {
    const x = (i % 4) * 256,
      y = (i >> 2) * 64;
    c.fillStyle = k.bg;
    c.fillRect(x, y, 256, 64);
    c.strokeStyle = 'rgba(255,240,190,.7)';
    c.lineWidth = 3;
    c.strokeRect(x + 3, y + 3, 250, 58);
    c.fillStyle = '#fff6d8';
    c.font = 'bold 42px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(k.sign, x + 128, y + 33, 236);
  });
  c.fillStyle = '#2f6f5a';
  c.fillRect(0, 256, 1024, 256);
  c.strokeStyle = '#f4e8b8';
  c.lineWidth = 12;
  c.strokeRect(10, 266, 1004, 236);
  c.fillStyle = '#fff6d8';
  c.font = 'bold 112px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('東三水街市場', 512, 386, 960);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function floorTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  for (let x = 0; x < 2; x++)
    for (let y = 0; y < 2; y++) {
      c.fillStyle = (x + y) % 2 ? '#8a8a84' : '#dcdad2';
      c.fillRect(x * 32, y * 32, 32, 32);
    }
  for (let i = 0; i < 120; i++) {
    c.fillStyle = `rgba(30,26,20,${Math.random() * 0.14})`;
    c.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random() * 7, 1 + Math.random() * 4);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function roofTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#8f9488';
  c.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 8) {
    c.fillStyle = 'rgba(30,34,30,.35)';
    c.fillRect(x, 0, 2, 64);
    c.fillStyle = 'rgba(230,235,220,.2)';
    c.fillRect(x + 3, 0, 2, 64);
  }
  for (let i = 0; i < 40; i++) {
    c.fillStyle = `rgba(90,64,40,${Math.random() * 0.2})`;
    c.fillRect(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 10, 2 + Math.random() * 16);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildMarket(d: MarketDeps) {
  let rs = 0x3a1b7;
  const r = () => (rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296;
  const F = frames(d.road, BAY);
  const body: Geo[] = [],
    goods: Geo[] = [],
    lamps: Geo[] = [],
    floor: Geo[] = [],
    roof: Geo[] = [],
    signs: Geo[] = [];
  const conts: MarketCont[] = [];
  const bx = (f: Frame, w: number, h: number, dp: number, a: number, y: number, l: number, hex: number) => {
    const g = new THREE.BoxGeometry(w, h, dp);
    g.translate(a, y, l);
    g.rotateY(f.ry);
    g.translate(f.x, 0, f.z);
    return tintG(g, hex);
  };
  const at = (f: Frame, a: number, l: number): V2 => [f.x + f.nx * a + f.ux * l, f.z + f.nz * a + f.uz * l];
  const place = (g: Geo, f: Frame) => {
    g.rotateY(f.ry);
    g.translate(f.x, 0, f.z);
    return g;
  };
  F.forEach((f, i) => {
    const next = F[i + 1];
    if (!next) return;
    const len = Math.hypot(next.x - f.x, next.z - f.z);
    // floor
    {
      const g = new THREE.PlaneGeometry(HW * 2, len + 0.02).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * 6, (uv.getY(q) * len) / 1);
      g.translate(0, 0.03, len / 2);
      floor.push(place(g, f));
    }
    // the low corrugated roof: two sheets with a strip of skylight between them, and the frame that carries them
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(HW - 0.45, len + 0.02).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * 3, uv.getY(q) * 2);
      g.rotateZ(s * 0.12);
      g.translate(s * (0.45 + (HW - 0.45) / 2), ROOF - 0.18 + 0.17, len / 2);
      roof.push(place(g, f));
      body.push(bx(f, 0.1, ROOF, 0.1, s * HW, ROOF / 2, 0, 0x4a5058));
      const [px, pz] = at(f, s * HW, 0);
      d.addSeg([px - 0.08, pz], [px + 0.08, pz]);
    }
    body.push(bx(f, HW * 2, 0.09, 0.09, 0, ROOF - 0.04, 0, 0x4a5058));
    body.push(bx(f, 0.06, 0.06, len, 0.45, ROOF + 0.14, len / 2, 0x4a5058));
    body.push(bx(f, 0.06, 0.06, len, -0.45, ROOF + 0.14, len / 2, 0x4a5058));
    // a tube along each side of the aisle
    if (i % 2 === 0)
      for (const s of [-1, 1]) lamps.push(bx(f, 0.09, 0.05, 1.3, s * 1.05, ROOF - 0.26, len / 2, 0xf2fbff));
    // ---- a stall on each side
    for (const s of [-1, 1]) {
      const [cx, cz] = at(f, s * (HW + 1.1), len / 2);
      if (i === 0 || !F[i + 2] || d.crossing(cx, cz)) continue;
      const k = Math.floor(r() * KINDS.length);
      const K = KINDS[k];
      // back wall
      body.push(bx(f, 0.2, ROOF, len, s * HW, ROOF / 2, len / 2, [0xc8c2b4, 0xb8b4a8, 0xd2ccbe][Math.floor(r() * 3)]));
      d.addSeg(at(f, s * HW, 0), at(f, s * HW, len));
      // the board overhead, facing the aisle
      {
        const cell = [(k % 4) / 4, 1 - ((k >> 2) + 1) / 8, 1 / 4, 1 / 8];
        const g = new THREE.PlaneGeometry(len * 0.92, 0.5);
        const uv = g.attributes.uv as THREE.BufferAttribute;
        for (let q = 0; q < uv.count; q++) uv.setXY(q, cell[0] + uv.getX(q) * cell[2], cell[1] + uv.getY(q) * cell[3]);
        g.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
        g.translate(s * (HW - 1.32), ROOF - 0.62, len / 2);
        signs.push(place(g, f));
      }
      body.push(bx(f, 0.05, 0.04, len * 0.8, s * (HW - 1.32), ROOF - 0.33, len / 2, 0x4a5058));
      lamps.push(bx(f, 0.07, 0.04, len * 0.6, s * (HW - 0.7), ROOF - 0.4, len / 2, 0xf2fbff));
      // the counter, sloping towards the aisle, heaped with what the stall sells
      if (i % 2 === 1 || k % 2 === 0) {
        const a = s * (HW - 0.82);
        body.push(bx(f, 1.2, 0.8, len * 0.92, a, 0.4, len / 2, k === 2 ? 0xdfe6ea : 0x8a8f94));
        body.push(bx(f, 1.3, 0.05, len * 0.96, a, 0.82, len / 2, k === 2 ? 0xf2f6f8 : 0x6a5a40));
        for (let n = 0; n < 12; n++) {
          const hex = K.goods[Math.floor(r() * K.goods.length)];
          const q =
            k === 4
              ? new THREE.CylinderGeometry(0.15, 0.18, 0.34, 6)
              : k === 2
                ? new THREE.BoxGeometry(0.34, 0.06, 0.1)
                : new THREE.SphereGeometry(0.08 + r() * 0.05, 5, 3);
          q.translate(a + (r() - 0.5) * 0.9, 0.9 + (k === 4 ? 0.1 : 0), 0.3 + r() * (len - 0.6));
          goods.push(tintG(place(q, f), hex));
        }
        // meat hangs from a rail
        if (k === 3)
          for (let n = 0; n < 3; n++)
            goods.push(
              tintG(
                place(new THREE.BoxGeometry(0.2, 0.5, 0.1).translate(s * (HW - 0.5), 2.0, 0.6 + n * 0.9), f),
                0xb8444a,
              ),
            );
        const c0 = at(f, a, 0.1),
          c1 = at(f, a, len - 0.1);
        const ox = f.nx * s * -0.6,
          oz = f.nz * s * -0.6;
        d.addSeg([c0[0] + ox, c0[1] + oz], [c1[0] + ox, c1[1] + oz]);
        conts.push({
          id: `sm${i}_${s > 0 ? 1 : 0}`,
          p: at(f, s * (HW - 1.85), len / 2),
          label: K.sign,
          items: { ...K.items[Math.floor(r() * K.items.length)] },
        });
      }
    }
  });
  // ---- a board over each end of the lane
  for (const f of [F[0], F[F.length - 1]]) {
    for (const s of [-1, 1]) body.push(bx(f, 0.18, ROOF + 1, 0.18, s * (HW + 0.1), (ROOF + 1) / 2, 0, 0x2a3a34));
    body.push(bx(f, HW * 2 + 0.3, 1.02, 0.14, 0, ROOF + 0.45, 0, 0x2f6f5a));
    for (const side of [-1, 1]) {
      const g = new THREE.PlaneGeometry(HW * 2, 0.92);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q), uv.getY(q) * 0.5);
      if (side < 0) g.rotateY(Math.PI);
      g.translate(0, ROOF + 0.45, side * 0.09);
      signs.push(place(g, f));
    }
  }
  // ---- meshes
  const tex = atlas();
  const signMat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.14,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x808080 });
  const fTex = floorTex();
  const floorMat = new THREE.MeshStandardMaterial({
    map: fTex,
    roughness: 0.6,
    emissive: 0xf4f6ee,
    emissiveMap: fTex,
    emissiveIntensity: 0,
  });
  const add = (g: Geo, m: THREE.Material, receive = true) => {
    const me = new THREE.Mesh(g, m);
    me.castShadow = false;
    me.receiveShadow = receive;
    d.scene.add(me);
    return me;
  };
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  bodyMat.userData.cut = true;
  lampMat.userData.cut = true;
  add(merged(body, ['position', 'normal', 'color']), bodyMat);
  add(
    merged(goods, ['position', 'normal', 'color']),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
  );
  add(merged(signs, ['position', 'normal', 'uv']), signMat);
  add(merged(lamps, ['position', 'normal', 'color']), lampMat, false);
  add(merged(floor, ['position', 'normal', 'uv']), floorMat);
  const roofMat = new THREE.MeshStandardMaterial({
    map: roofTex(),
    roughness: 0.8,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  roofMat.userData.cut = true;
  add(merged(roof, ['position', 'normal', 'uv']), roofMat);
  return {
    conts,
    bays: F.length,
    /** walking in lifts the roof and whatever hides the lane from the camera, as in any building (occlusion.ts) */
    cut(x: number, z: number) {
      if (!this.covers(x, z)) return null;
      const a = F[0],
        b = F[F.length - 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      return {
        O: [a.x, a.z] as V2,
        U: [(b.x - a.x) / L, (b.z - a.z) / L] as V2,
        ub: [-2.5, L + 2.5, -HW + 0.8, HW + 0.8] as [number, number, number, number],
      };
    },
    /** under the market roof */
    covers(x: number, z: number) {
      return F.some(f => Math.hypot(f.x - x, f.z - z) < HW + 1.2);
    },
    update(night: number) {
      signMat.emissiveIntensity = 0.14 + night * 0.85;
      lampMat.color.setScalar(0.5 + night * 0.6);
      floorMat.emissiveIntensity = night * 0.4;
    },
    frames: F.map(f => [f.x, f.z] as V2),
  };
}
