// v24.17 two more landmarks you can walk into, built from photographs. 西門紅樓: an octagon of red brick banded with white
// stone, arched windows and a steep slate cap, joined to a long cross-shaped hall of craft stalls. 剝皮寮: a row of old
// shop-houses behind a brick arcade, each one a room of its own that opens to the lane behind. Shop names are invented or
// generic. Each landmark is a few merged meshes; walking in lifts the roofs, as in every other building.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type V2 = [number, number];
type Geo = THREE.BufferGeometry;
export type LandCont = { id: string; p: V2; label: string; items: Record<string, number> };
export type WalkIn = {
  /** the cut box: origin and [umin, umax, vmin, vmax] along world x and z */
  O: V2;
  ub: [number, number, number, number];
  /** under a roof, in local coordinates */
  roofAt: (x: number, z: number) => boolean;
};
const WHITE = 0xe6decb,
  STONE = 0x8f8b82,
  GLASS = 0x232a30,
  WOOD = 0x5a3320,
  FLOOR = 0xa5825e,
  SLATE = 0x4a4f55;

const tint = (g: Geo, hex: number) => {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count,
    a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) ((a[i * 3] = c.r), (a[i * 3 + 1] = c.g), (a[i * 3 + 2] = c.b));
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const merged = (L: Geo[], keep: string[]) =>
  mergeGeometries(
    L.map(g => {
      const q = g.index ? g.toNonIndexed() : g;
      for (const k of Object.keys(q.attributes)) if (!keep.includes(k)) q.deleteAttribute(k);
      return q;
    }),
  );
function canvasTex(w: number, h: number, f: (c: CanvasRenderingContext2D) => void, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  f(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const brickTex = () =>
  canvasTex(128, 128, c => {
    c.fillStyle = '#b9b0a0';
    c.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++)
      for (let k = -1; k < 4; k++) {
        const x = k * 40 + (r % 2 ? 20 : 0),
          y = r * 16;
        const v = 150 + Math.random() * 40;
        c.fillStyle = `rgb(${v},${v * 0.42},${v * 0.3})`;
        c.fillRect(x + 1, y + 1, 38, 14);
      }
    for (let i = 0; i < 200; i++) {
      c.fillStyle = `rgba(20,14,10,${Math.random() * 0.12})`;
      c.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 10, 1 + Math.random() * 4);
    }
  });
const slateTex = () =>
  canvasTex(128, 128, c => {
    c.fillStyle = '#5a6066';
    c.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++)
      for (let k = -1; k < 8; k++) {
        const x = k * 18 + (r % 2 ? 9 : 0),
          y = r * 16;
        c.fillStyle = `rgba(${Math.random() < 0.5 ? '20,24,28' : '180,190,200'},${Math.random() * 0.2})`;
        c.fillRect(x + 1, y + 1, 16, 14);
        c.fillStyle = 'rgba(15,18,22,.55)';
        c.fillRect(x, y + 14, 18, 2);
      }
  });
/** the cloth of a box scaled so that bricks stay the same size on every wall */
const scaleUV = (g: THREE.BoxGeometry, w: number, h: number, d: number, m: number) => {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * faces[f][0]) / m, (uv.getY(k) * faces[f][1]) / m);
    }
  return g;
};

type Parts = { brick: Geo[]; plain: Geo[]; slate: Geo[]; props: Geo[]; signs: Geo[] };
const parts = (): Parts => ({ brick: [], plain: [], slate: [], props: [], signs: [] });
const boxAt = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return tint(g, hex);
};
/** a brick wall from a to b with its white bands; gaps are left to the caller by building two runs */
function brickRun(P: Parts, ax: number, az: number, bx: number, bz: number, h: number, bands: number[] = [1.1, 3.7]) {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 0.05) return;
  const ry = Math.atan2(-(bz - az), bx - ax);
  const mx = (ax + bx) / 2,
    mz = (az + bz) / 2;
  const g = scaleUV(new THREE.BoxGeometry(L, h, 0.42), L, h, 0.42, 1.6);
  g.rotateY(ry);
  g.translate(mx, h / 2, mz);
  P.brick.push(tint(g, 0xffffff));
  for (const y of bands) if (y < h) P.plain.push(boxAt(L + 0.02, 0.24, 0.5, mx, y, mz, WHITE, ry));
  P.plain.push(boxAt(L + 0.04, 0.3, 0.56, mx, h, mz, WHITE, ry));
  P.plain.push(boxAt(L + 0.02, 0.5, 0.5, mx, 0.25, mz, STONE, ry));
}
/** an arched window (or a blind arch) on a wall run: dark glass, white arch and sill */
function archWindow(P: Parts, x: number, z: number, ry: number, y: number, w: number, h: number) {
  const nx = Math.sin(ry) * 0.23,
    nz = Math.cos(ry) * 0.23;
  for (const s of [1, -1]) {
    const px = x + nx * s,
      pz = z + nz * s;
    P.plain.push(boxAt(w, h, 0.05, px, y, pz, GLASS, ry));
    const ring = new THREE.TorusGeometry(w / 2, 0.09, 4, 10, Math.PI);
    ring.rotateY(ry);
    ring.translate(px, y + h / 2, pz);
    P.plain.push(tint(ring, WHITE));
    const cap = new THREE.CircleGeometry(w / 2, 10, 0, Math.PI);
    cap.rotateY(s > 0 ? ry : ry + Math.PI);
    cap.translate(px + nx * s * 0.1, y + h / 2, pz + nz * s * 0.1);
    P.plain.push(tint(cap, GLASS));
    P.plain.push(boxAt(w + 0.24, 0.1, 0.12, px, y - h / 2 - 0.04, pz, WHITE, ry));
  }
}
/** a plain pitched roof with its ridge along x (or z with rot), in slate */
function gable(P: Parts, x: number, z: number, W: number, D: number, y: number, H: number, rot = false) {
  const hw = W / 2,
    hd = D / 2;
  const pos = [
    -hw, y, hd, hw, y, hd, hw, y + H, 0, -hw, y, hd, hw, y + H, 0, -hw, y + H, 0,
    hw, y, -hd, -hw, y, -hd, -hw, y + H, 0, hw, y, -hd, -hw, y + H, 0, hw, y + H, 0,
  ]; // prettier-ignore
  const slope = Math.hypot(hd, H);
  const uv = [
    0, 0, W, 0, W, slope, 0, 0, W, slope, 0, slope,
    0, 0, W, 0, W, slope, 0, 0, W, slope, 0, slope,
  ].map(v => v / 2.2); // prettier-ignore
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  if (rot) g.rotateY(Math.PI / 2);
  g.translate(x, 0, z);
  P.slate.push(g);
  const ridge = boxAt(rot ? 0.2 : W, 0.14, rot ? W : 0.2, x, y + H + 0.04, z, WHITE);
  P.plain.push(ridge);
  // the triangular end walls, in brick
  for (const s of [-1, 1]) {
    const t = new THREE.BufferGeometry();
    const e = s * hw;
    t.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([e, y, -hd + 0.4, e, y, hd - 0.4, e, y + H - 0.1, 0], 3),
    );
    t.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, D / 1.6, 0, D / 3.2, H / 1.6], 2));
    t.computeVertexNormals();
    if (rot) t.rotateY(Math.PI / 2);
    t.translate(x, 0, z);
    P.brick.push(tint(t, 0xffffff));
  }
}
function signAtlas(texts: [string, string, string][]) {
  return canvasTex(
    1024,
    512,
    c => {
      texts.forEach(([t, bg, fg], i) => {
        const x = (i % 4) * 256,
          y = (i >> 2) * 128;
        c.fillStyle = bg;
        c.fillRect(x, y, 256, 128);
        c.strokeStyle = 'rgba(255,240,200,.55)';
        c.lineWidth = 4;
        c.strokeRect(x + 5, y + 5, 246, 118);
        c.fillStyle = fg;
        c.font = 'bold 66px serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(t, x + 128, y + 68, 232);
      });
    },
    false,
  );
}
const signAt = (P: Parts, i: number, w: number, h: number, x: number, y: number, z: number, ry: number) => {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const u0 = (i % 4) / 4,
    v0 = 1 - ((i >> 2) + 1) / 4;
  for (let q = 0; q < uv.count; q++) uv.setXY(q, u0 + uv.getX(q) / 4, v0 + uv.getY(q) / 4);
  g.rotateY(ry);
  g.translate(x, y, z);
  P.signs.push(g);
};
function finish(g: THREE.Group, P: Parts, sign: THREE.Texture) {
  const brick = new THREE.MeshStandardMaterial({
    map: brickTex(),
    roughness: 0.9,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide });
  const slate = new THREE.MeshStandardMaterial({ map: slateTex(), roughness: 0.72, side: THREE.DoubleSide });
  const props = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const signs = new THREE.MeshStandardMaterial({
    map: sign,
    emissive: 0xffffff,
    emissiveMap: sign,
    emissiveIntensity: 0.14,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  for (const m of [brick, plain, slate, signs]) m.userData.cut = true;
  const mk = (L: Geo[], m: THREE.Material, keep: string[], shadow = true) => {
    if (!L.length) return;
    const me = new THREE.Mesh(merged(L, keep), m);
    me.castShadow = shadow;
    me.receiveShadow = true;
    g.add(me);
  };
  mk(P.brick, brick, ['position', 'normal', 'uv', 'color']);
  mk(P.plain, plain, ['position', 'normal', 'color']);
  mk(P.slate, slate, ['position', 'normal', 'uv']);
  mk(P.props, props, ['position', 'normal', 'color']);
  mk(P.signs, signs, ['position', 'normal', 'uv'], false);
}

// ---------------------------------------------------------------------------------------------------------------------
/** 西門紅樓: octagon at +x, hall along x behind it, cross arms in the middle (origin as in the footprint rect) */
export function buildRedHouse(g: THREE.Group, addSeg: (a: V2, b: V2) => void) {
  const P = parts();
  const conts: LandCont[] = [];
  const seg = (ax: number, az: number, bx: number, bz: number) => addSeg([ax, az], [bx, bz]);
  const wall = (ax: number, az: number, bx: number, bz: number, h: number, bands?: number[]) => {
    brickRun(P, ax, az, bx, bz, h, bands);
    seg(ax, az, bx, bz);
  };
  const OX = 30,
    R = 11.4,
    OH = 8.2;
  // floors
  P.plain.push(tint(new THREE.CylinderGeometry(R, R, 0.1, 8).rotateY(Math.PI / 8).translate(OX, 0.04, 0), FLOOR));
  P.plain.push(boxAt(38, 0.1, 16, 0, 0.04, 0, FLOOR));
  P.plain.push(boxAt(8, 0.1, 24, 0, 0.04, 0, FLOOR));
  // ---- the octagon: eight sides, doors on +x (the front) and -x (into the hall)
  const pt = (i: number): V2 => {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    return [OX + Math.cos(a) * R, Math.sin(a) * R];
  };
  for (let i = 0; i < 8; i++) {
    const [ax, az] = pt(i),
      [bx, bz] = pt(i + 1);
    const mx = (ax + bx) / 2,
      mz = (az + bz) / 2;
    const ry = Math.atan2(-(bz - az), bx - ax);
    const front = Math.abs(mz) < 1 && mx > OX,
      back = Math.abs(mz) < 1 && mx < OX;
    if (front || back) {
      // a door 3 m wide, the wall carries on over it
      const L = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / L,
        uz = (bz - az) / L;
      const d0 = L / 2 - 1.5,
        d1 = L / 2 + 1.5;
      wall(ax, az, ax + ux * d0, az + uz * d0, OH, [1.1, 3.7, 6.4]);
      wall(ax + ux * d1, az + uz * d1, bx, bz, OH, [1.1, 3.7, 6.4]);
      const lintel = scaleUV(new THREE.BoxGeometry(3, OH - 3, 0.42), 3, OH - 3, 0.42, 1.6);
      lintel.rotateY(ry);
      lintel.translate(mx, 3 + (OH - 3) / 2, mz);
      P.brick.push(tint(lintel, 0xffffff));
      P.plain.push(boxAt(3.04, 0.24, 0.5, mx, 3.7, mz, WHITE, ry));
      P.plain.push(boxAt(3.04, 0.24, 0.5, mx, 6.4, mz, WHITE, ry));
      P.plain.push(boxAt(3.04, 0.3, 0.56, mx, OH, mz, WHITE, ry));
      archWindow(P, mx, mz, ry, 5.05, 1.2, 1.5);
      if (front) {
        // the porch over the front door, and the plaque
        P.plain.push(boxAt(1.8, 0.18, 5, mx + 0.8, 3.15, mz, 0x3a3f44));
        for (const s of [-1, 1]) P.plain.push(boxAt(0.2, 3.1, 0.2, mx + 1.6, 1.55, mz + s * 2.2, WHITE));
        signAt(P, 0, 3.4, 1.05, mx + 0.27, 4.5, mz, Math.PI / 2);
      }
    } else {
      wall(ax, az, bx, bz, OH, [1.1, 3.7, 6.4]);
      const n = 2;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const wx = ax + (bx - ax) * t,
          wz = az + (bz - az) * t;
        archWindow(P, wx, wz, ry, 2.2, 1.1, 1.6);
        archWindow(P, wx, wz, ry, 5.05, 1.1, 1.6);
      }
    }
  }
  // the steep slate cap with dormers, a little drum and a finial on top
  {
    const cap = new THREE.CylinderGeometry(R * 0.54, R * 1.04, 4.2, 8, 1, true);
    const uv = cap.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 14, uv.getY(i) * 3);
    cap.rotateY(Math.PI / 8);
    cap.translate(OX, OH + 2.15, 0);
    P.slate.push(cap);
    P.plain.push(
      tint(
        new THREE.CylinderGeometry(R * 0.54, R * 0.54, 0.16, 8).rotateY(Math.PI / 8).translate(OX, OH + 4.3, 0),
        0x6a6f75,
      ),
    );
    const drum = new THREE.CylinderGeometry(R * 0.26, R * 0.3, 1.5, 8, 1, true);
    const u2 = drum.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < u2.count; i++) u2.setXY(i, u2.getX(i) * 8, u2.getY(i));
    drum.rotateY(Math.PI / 8);
    drum.translate(OX, OH + 5.1, 0);
    P.brick.push(tint(drum, 0xffffff));
    const top = new THREE.ConeGeometry(R * 0.34, 1.5, 8);
    const u3 = top.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < u3.count; i++) u3.setXY(i, u3.getX(i) * 6, u3.getY(i) * 1.5);
    top.rotateY(Math.PI / 8);
    top.translate(OX, OH + 6.6, 0);
    P.slate.push(top);
    P.plain.push(tint(new THREE.SphereGeometry(0.18, 6, 4).translate(OX, OH + 7.45, 0), 0xc8a84a));
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const dx = OX + Math.cos(a) * R * 0.8,
        dz = Math.sin(a) * R * 0.8;
      const ry = Math.atan2(Math.cos(a), -Math.sin(a)) + Math.PI / 2;
      P.plain.push(boxAt(1.5, 1.5, 0.9, dx, OH + 1.5, dz, WHITE, ry));
      P.plain.push(boxAt(1.0, 0.95, 0.94, dx, OH + 1.45, dz, GLASS, ry));
      const r = new THREE.ConeGeometry(1.1, 0.7, 4);
      r.rotateY(Math.PI / 4 + ry);
      r.translate(dx, OH + 2.55, dz);
      P.plain.push(tint(r, SLATE));
    }
  }
  // ---- the hall: long walls with doors in the arms and at the far end
  const HH = 6.2;
  wall(-19, -8, -4, -8, HH);
  wall(4, -8, 18.8, -8, HH);
  wall(-19, 8, -4, 8, HH);
  wall(4, 8, 18.8, 8, HH);
  // the hall's end towards the octagon, either side of the door between them
  wall(19, -8, 19, -4.2, HH);
  wall(19, 4.2, 19, 8, HH);
  wall(-19, -8, -19, -1.6, HH);
  wall(-19, 1.6, -19, 8, HH);
  // the arms of the cross, each with a door at its end
  for (const s of [-1, 1]) {
    wall(-4, s * 8, -4, s * 12, HH);
    wall(4, s * 8, 4, s * 12, HH);
    wall(-4, s * 12, -1.5, s * 12, HH);
    wall(1.5, s * 12, 4, s * 12, HH);
    const lintel = scaleUV(new THREE.BoxGeometry(3, HH - 2.9, 0.42), 3, HH - 2.9, 0.42, 1.6);
    lintel.translate(0, 2.9 + (HH - 2.9) / 2, s * 12);
    P.brick.push(tint(lintel, 0xffffff));
    P.plain.push(boxAt(3.04, 0.3, 0.56, 0, HH, s * 12, WHITE));
    P.plain.push(boxAt(3.04, 0.24, 0.5, 0, 3.7, s * 12, WHITE));
    archWindow(P, -9, s * 8, 0, 3, 1.3, 2);
    archWindow(P, -14.5, s * 8, 0, 3, 1.3, 2);
    archWindow(P, 9, s * 8, 0, 3, 1.3, 2);
    archWindow(P, 14.5, s * 8, 0, 3, 1.3, 2);
    signAt(P, 1, 2.8, 0.85, 0, 4.7, s * 12.24, s > 0 ? 0 : Math.PI);
  }
  // the end door
  {
    const lintel = scaleUV(new THREE.BoxGeometry(0.42, HH - 2.9, 3.2), 0.42, HH - 2.9, 3.2, 1.6);
    lintel.translate(-19, 2.9 + (HH - 2.9) / 2, 0);
    P.brick.push(tint(lintel, 0xffffff));
    P.plain.push(boxAt(0.56, 0.3, 3.24, -19, HH, 0, WHITE));
  }
  gable(P, 0, 0, 38.8, 17.2, HH + 0.12, 3.4);
  gable(P, 0, 0, 25, 8.8, HH + 0.14, 2.6, true);
  // ---- inside: craft stalls down both long walls, the tea room in the octagon; these can be searched
  const craft: Record<string, number>[] = [
    { cloth: 2, tissue: 1 },
    { snack: 2, tea: 1 },
    { pineapple: 2, coffee: 1 },
    { battery: 1, cloth: 1 },
    { tissue: 2, milktea: 1 },
    { snack: 1, sport: 1, cig: 1 },
  ];
  let ci = 0;
  for (const s of [-1, 1])
    for (const x of [-15.5, -10.5, 10.5, 15.5]) {
      const z = s * 6.3;
      P.props.push(boxAt(3.2, 0.9, 1.3, x, 0.45, z, 0x8a6a48));
      P.props.push(boxAt(3.34, 0.07, 1.42, x, 0.93, z, 0xc8b490));
      for (const k of [-1, 0, 1]) {
        const hex = [0xc8501a, 0x2f6f8a, 0xd8a020, 0x7a3f8a, 0x4a8a4a][(ci + k + 5) % 5];
        P.props.push(boxAt(0.5, 0.26, 0.44, x + k * 0.95, 1.1, z, hex));
      }
      P.props.push(boxAt(3.2, 1.8, 0.14, x, 1.8, s * 7.72, WOOD));
      seg(x - 1.6, z - 0.65, x + 1.6, z - 0.65);
      seg(x - 1.6, z + 0.65, x + 1.6, z + 0.65);
      conts.push({ id: `lmk_r${ci}`, p: [x, z - s * 1.2], label: '文創小店', items: { ...craft[ci % craft.length] } });
      ci++;
    }
  for (const x of [-13, -7, 7, 13])
    for (const s of [-1, 1]) {
      P.plain.push(tint(new THREE.CylinderGeometry(0.13, 0.17, HH, 8).translate(x, HH / 2, s * 3.1), 0x34383c));
      seg(x - 0.17, s * 3.1, x + 0.17, s * 3.1);
    }
  for (const x of [-10, 10]) {
    P.props.push(boxAt(3.2, 0.82, 1.3, x, 0.41, 0, 0x6a4a30));
    P.props.push(boxAt(3.32, 0.06, 1.42, x, 0.85, 0, 0xc8b490));
    for (let k = 0; k < 5; k++) {
      const hex = [0xc8501a, 0xd8a020, 0x2f6f8a, 0x7a3f8a, 0x4a8a4a][k];
      P.props.push(boxAt(0.42, 0.2, 0.36, x - 1.1 + k * 0.55, 0.98, (k % 2) * 0.5 - 0.25, hex));
    }
    seg(x - 1.6, -0.65, x + 1.6, -0.65);
    seg(x - 1.6, 0.65, x + 1.6, 0.65);
  }
  // the tea room: a round counter with stools, facing the front door
  {
    const q = new THREE.CylinderGeometry(2.3, 2.3, 1, 8, 1);
    q.translate(OX, 0.5, 0);
    P.props.push(tint(q, 0x6a3f28));
    P.props.push(tint(new THREE.CylinderGeometry(2.45, 2.45, 0.08, 8).translate(OX, 1.04, 0), 0xc8b490));
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + 0.4;
      P.props.push(
        tint(
          new THREE.CylinderGeometry(0.2, 0.2, 0.5, 6).translate(OX + Math.cos(a) * 3, 0.25, Math.sin(a) * 3),
          0x8a2f1a,
        ),
      );
    }
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      seg(
        OX + Math.cos(a) * 2.3,
        Math.sin(a) * 2.3,
        OX + Math.cos(a + Math.PI / 4) * 2.3,
        Math.sin(a + Math.PI / 4) * 2.3,
      );
    }
    conts.push({
      id: 'lmk_rt',
      p: [OX + 3.1, 0.2],
      label: '紅樓茶坊',
      items: { tea: 2, coffee: 2, pineapple: 2, milktea: 1 },
    });
  }
  finish(
    g,
    P,
    signAtlas([
      ['紅  樓', '#7a1f14', '#ffe9b0'],
      ['十字樓', '#7a1f14', '#ffe9b0'],
    ]),
  );
  return {
    conts,
    walk: {
      O: [0, 0] as V2,
      ub: [-20, 42.5, -13, 13] as [number, number, number, number],
      roofAt: (x: number, z: number) =>
        Math.hypot(x - OX, z) < R || (Math.abs(x) <= 19 && Math.abs(z) <= 8) || (Math.abs(x) <= 4 && Math.abs(z) <= 12),
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
const OLD_SHOPS: [string, string, string, Record<string, number>][] = [
  ['中藥行', '#3a2a1a', '#f0dcae', { pill: 2, bandage: 1, tea: 1 }],
  ['老旅社', '#1f3a4a', '#f4efe0', { cloth: 2, water: 1, tissue: 2 }],
  ['鹹粥', '#8a2a1a', '#fff3c8', { bento: 1, cookedrice: 1, egg: 1 }],
  ['柑仔店', '#2f5a3a', '#fff3c8', { can: 1, noodle: 2, cig: 2, battery: 1 }],
  ['碾米行', '#5a4a2a', '#fff3c8', { rawrice: 3, rice: 1 }],
  ['理髮廳', '#2a3f6a', '#ffffff', { tissue: 2, cloth: 1, water: 1 }],
  ['舊書店', '#4a2a4a', '#f0e0c0', { battery: 1, snack: 1 }],
  ['布行', '#7a3a2a', '#fff3c8', { cloth: 3, bandage: 1 }],
  ['雜貨', '#3a4a5a', '#fff3c8', { mantou: 2, water: 2, cig: 1 }],
];
/** 剝皮寮: nine shop-houses in a row. +z is the arcade on the street, -z the lane behind; every unit is a room you can enter */
export function buildBopiliao(g: THREE.Group, addSeg: (a: V2, b: V2) => void) {
  const P = parts();
  const conts: LandCont[] = [];
  const seg = (ax: number, az: number, bx: number, bz: number) => addSeg([ax, az], [bx, bz]);
  const W = 5.8,
    H = 7.4,
    FRONT = 2.4,
    BACK = -5,
    ARC = 5;
  P.plain.push(boxAt(54.4, 0.2, 10.4, 0, 0.02, 0, 0x8a8478)); // above the road OSM runs through this plot
  for (let i = 0; i < 9; i++) {
    const x = i * 6 - 24;
    const x0 = x - W / 2,
      x1 = x + W / 2;
    const taller = i % 3 === 1;
    const h = taller ? H + 0.9 : H;
    // party wall (the row is closed at both ends by the same walls)
    const upper = (px: number) => {
      const q = scaleUV(new THREE.BoxGeometry(0.42, h - 3.1, ARC - FRONT), 0.42, h - 3.1, ARC - FRONT, 1.6);
      q.translate(px, 3.1 + (h - 3.1) / 2, (ARC + FRONT) / 2);
      P.brick.push(tint(q, 0xffffff));
    };
    brickRun(P, x0, BACK, x0, FRONT, h, [3.9]);
    upper(x0);
    seg(x0, BACK, x0, FRONT);
    if (i === 8) {
      brickRun(P, x1, BACK, x1, FRONT, h, [3.9]);
      upper(x1);
      seg(x1, BACK, x1, FRONT);
    }
    // the shop front, set back behind the arcade, with its door
    brickRun(P, x0, FRONT, x - 0.9, FRONT, 3.9, []);
    brickRun(P, x + 0.9, FRONT, x1, FRONT, 3.9, []);
    seg(x0, FRONT, x - 0.9, FRONT);
    seg(x + 0.9, FRONT, x1, FRONT);
    P.plain.push(boxAt(1.8, 0.8, 0.44, x, 3.5, FRONT, WOOD));
    P.plain.push(boxAt(1.2, 1.3, 0.1, x - 1.9, 1.8, FRONT + 0.24, GLASS));
    P.plain.push(boxAt(1.2, 1.3, 0.1, x + 1.9, 1.8, FRONT + 0.24, GLASS));
    // the arcade (亭仔腳): two brick piers and a round arch across the front of the bay
    for (const s of [-1, 1]) {
      const px = x + s * (W / 2 - 0.34);
      const pier = scaleUV(new THREE.BoxGeometry(0.68, 3.1, 0.68), 0.68, 3.1, 0.68, 1.6);
      pier.translate(px, 1.55, ARC);
      P.brick.push(tint(pier, 0xffffff));
      P.plain.push(boxAt(0.8, 0.14, 0.8, px, 3.12, ARC, WHITE));
      seg(px - 0.34, ARC, px + 0.34, ARC);
    }
    {
      const ring = new THREE.TorusGeometry(W / 2 - 0.68, 0.14, 4, 12, Math.PI);
      ring.translate(x, 3.15, ARC + 0.2);
      P.plain.push(tint(ring, WHITE));
      const over = scaleUV(new THREE.BoxGeometry(W, h - 3.1, 0.42), W, h - 3.1, 0.42, 1.6);
      over.translate(x, 3.1 + (h - 3.1) / 2, ARC);
      P.brick.push(tint(over, 0xffffff));
      P.plain.push(boxAt(W + 0.02, 0.24, 0.5, x, 3.95, ARC, WHITE));
      P.plain.push(boxAt(W + 0.04, 0.34, 0.6, x, h, ARC, WHITE));
      // upper-floor windows and the parapet with a little pediment on the taller units
      archWindow(P, x - 1.35, ARC, 0, 5.5, 1, 1.6);
      archWindow(P, x + 1.35, ARC, 0, 5.5, 1, 1.6);
      if (taller) {
        const ped = new THREE.ConeGeometry(1.5, 0.8, 3);
        ped.rotateX(0);
        ped.scale(1, 1, 0.14);
        ped.translate(x, h + 0.52, ARC);
        P.plain.push(tint(ped, WHITE));
      }
      signAt(P, i, 2.7, 0.78, x, 3.5, FRONT + 0.26, 0);
    }
    // the back wall with a door to the lane
    brickRun(P, x0, BACK, x - 0.7, BACK, h, [3.9]);
    brickRun(P, x + 0.7, BACK, x1, BACK, h, [3.9]);
    seg(x0, BACK, x - 0.7, BACK);
    seg(x + 0.7, BACK, x1, BACK);
    const lint = scaleUV(new THREE.BoxGeometry(1.4, h - 2.5, 0.42), 1.4, h - 2.5, 0.42, 1.6);
    lint.translate(x, 2.5 + (h - 2.5) / 2, BACK);
    P.brick.push(tint(lint, 0xffffff));
    // the first-floor ceiling and the roof
    P.plain.push(boxAt(W, 0.2, 7.4, x, 3.95, (BACK + FRONT) / 2, 0x4a3a2c));
    P.plain.push(boxAt(W, 0.16, ARC - FRONT, x, 3.1, (ARC + FRONT) / 2, 0xcfc4ac));
    gable(P, x, 0, 10.8, W + 0.3, h - 0.5, 1.9, true);
    // ---- inside: a counter and shelves; each unit can be searched
    const [, , , items] = OLD_SHOPS[i];
    P.props.push(boxAt(3, 0.9, 0.7, x, 0.45, -1.6, 0x6a4a30));
    P.props.push(boxAt(3.1, 0.06, 0.8, x, 0.93, -1.6, 0xb89a70));
    for (const s of [-1, 1]) P.props.push(boxAt(1.7, 2.3, 0.4, x + s * 1.75, 1.15, -4.5, WOOD));
    for (const k of [0, 1, 3, 4])
      P.props.push(
        boxAt(
          0.42,
          0.34,
          0.26,
          x - 1.9 + k * 0.95,
          1 + (k % 2) * 0.72,
          -4.25,
          [0xc8501a, 0xd8a020, 0x2f6f8a, 0xe8dcc0, 0x7a3f2a][k],
        ),
      );
    seg(x - 1.5, -1.95, x + 1.5, -1.95);
    seg(x - 1.5, -1.25, x + 1.5, -1.25);
    seg(x - W / 2 + 0.05, -4.3, x - 0.9, -4.3);
    seg(x + 0.9, -4.3, x + W / 2 - 0.05, -4.3);
    conts.push({ id: `lmk_b${i}`, p: [x, -0.5], label: OLD_SHOPS[i][0], items: { ...items } });
  }
  finish(g, P, signAtlas(OLD_SHOPS.map(q => [q[0], q[1], q[2]])));
  return {
    conts,
    walk: {
      O: [0, 0] as V2,
      ub: [-27.4, 27.4, -5.5, 5.6] as [number, number, number, number],
      roofAt: (x: number, z: number) => Math.abs(x) <= 27 && z >= -5 && z <= 5,
    },
  };
}
