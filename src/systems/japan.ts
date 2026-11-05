import * as THREE from 'three';
import { tr, getLanguage } from '../i18n';
// v24.4 日本支援 (fictional): a JSDF liaison's field radio calls three kinds of help over Wanhua —
//  • C-2 transport: one pass overhead, a supply crate on a parachute (Japanese weapons, ammunition, rations)
//  • F-2 strike pair: bombs on the densest group of PLA soldiers 18–150 m from the player
//  • AH-64DJ gunship: circles the player for 45 s firing its 30 mm gun at PLA soldiers in the open
// Each call takes one battery for the radio and has a cooldown. Aircraft are low-poly props (one material each)
// that fly in game space; damage goes through the same hooks as everything else (blast / hit). Callsigns, units
// and the people involved are fictional.
type V2 = [number, number];
type Foe = { pos: THREE.Vector3; state: string; hp: number };
export type JpKind = 'drop' | 'strike' | 'heli';
export type JpDeps = {
  scene: THREE.Scene;
  player: () => THREE.Vector3;
  foes: () => Foe[];
  hit: (f: Foe, dmg: number) => void;
  blast: (p: THREE.Vector3) => void;
  /** a free spot near (x, z) for the crate to land on */
  freeNear: (p: V2) => V2;
  /** the crate has landed at p */
  landed: (p: V2) => void;
  log: (msg: string, col?: string, cls?: string) => void;
  noise: (x: number, z: number, r: number) => void;
  gunSound: (dist: number) => void;
  boomSound: (dist: number) => void;
};
export const JP_COOLDOWN: Record<JpKind, number> = { drop: 360, strike: 300, heli: 240 };
const T = (zh: string, en: string) => (getLanguage() === 'en' ? en : zh);
let ROUNDEL: THREE.Texture | null = null;
/** 日の丸 roundel (red disc, thin white ring) on a transparent square */
function roundel() {
  if (ROUNDEL) return ROUNDEL;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(32, 32, 30, 0, 7);
  g.fill();
  g.fillStyle = '#c8102e';
  g.beginPath();
  g.arc(32, 32, 25, 0, 7);
  g.fill();
  ROUNDEL = new THREE.CanvasTexture(c);
  ROUNDEL.colorSpace = THREE.SRGBColorSpace;
  return ROUNDEL;
}
const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2 });
const box = (g: THREE.Group, m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = true;
  g.add(b);
  return b;
};
function decal(g: THREE.Group, s: number, x: number, y: number, z: number, rx: number, ry = 0) {
  const d = new THREE.Mesh(
    new THREE.PlaneGeometry(s, s),
    new THREE.MeshBasicMaterial({ map: roundel(), transparent: true, depthWrite: false }),
  );
  d.position.set(x, y, z);
  d.rotation.set(rx, ry, 0);
  g.add(d);
}
/** F-2 (blue sea camouflage), nose along +z, ~15 m */
function makeF2() {
  const g = new THREE.Group();
  const m = mat(0x3f5f86),
    dk = mat(0x2a3e5a);
  box(g, m, 1.3, 1.2, 13);
  box(g, dk, 0.8, 0.6, 2.2, 0, 0.6, 3.2); // canopy
  const wing = new THREE.Shape([
    new THREE.Vector2(-5.2, -3.6),
    new THREE.Vector2(0, 2.4),
    new THREE.Vector2(5.2, -3.6),
  ]);
  const wg = new THREE.Mesh(new THREE.ShapeGeometry(wing).rotateX(-Math.PI / 2), m);
  wg.material.side = THREE.DoubleSide;
  wg.position.y = 0.1;
  wg.castShadow = true;
  g.add(wg);
  box(g, m, 0.15, 2.4, 2.2, 0, 1.4, -5.2); // fin
  box(g, dk, 1.0, 1.0, 0.4, 0, 0, -6.6); // nozzle
  decal(g, 1.4, -3.0, 0.16, -1.8, -Math.PI / 2);
  decal(g, 1.4, 3.0, 0.16, -1.8, -Math.PI / 2);
  return g;
}
/** C-2 transport (grey), high wing, T-tail, ~44 m */
function makeC2() {
  const g = new THREE.Group();
  const m = mat(0x8a9096),
    dk = mat(0x5e646a);
  box(g, m, 4.4, 4.4, 38);
  box(g, m, 44, 0.5, 5.4, 0, 2.2, 1.5); // wing
  box(g, dk, 1.6, 1.8, 4.2, -7, 1.2, 2.2); // engines
  box(g, dk, 1.6, 1.8, 4.2, 7, 1.2, 2.2);
  box(g, m, 0.4, 7, 5, 0, 5, -17); // fin
  box(g, m, 15, 0.4, 3.6, 0, 8.4, -18); // T-tail
  decal(g, 2.6, -14, 2.5, 1.5, -Math.PI / 2);
  decal(g, 2.6, 14, 2.5, 1.5, -Math.PI / 2);
  return g;
}
/** AH-64DJ (olive drab), rotor on top, ~17 m */
function makeAH64() {
  const g = new THREE.Group();
  const m = mat(0x4a5236),
    dk = mat(0x2a2e22);
  box(g, m, 1.4, 2.0, 6.5, 0, 0, 1.2);
  box(g, dk, 1.0, 0.9, 1.8, 0, 0.8, 3.2); // tandem canopy
  box(g, m, 0.5, 0.6, 7.5, 0, 0.3, -5.5); // tail boom
  box(g, m, 0.15, 2.0, 1.4, 0, 1.0, -9); // tail fin
  box(g, m, 4.4, 0.25, 1.0, 0, -0.1, 0.6); // stub wings
  box(g, dk, 0.35, 0.35, 1.5, 0, -1.1, 3.8); // 30 mm chin gun
  decal(g, 0.9, 0.3, 0.3, -6, 0, Math.PI / 2);
  const rotor = new THREE.Group();
  box(rotor, dk, 14.6, 0.06, 0.5);
  box(rotor, dk, 0.5, 0.06, 14.6);
  rotor.position.y = 1.6;
  rotor.name = 'rotor';
  g.add(rotor);
  return g;
}
/** parachute + crate (descending supply drop) */
function makeChute() {
  const g = new THREE.Group();
  const can = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9, side: THREE.DoubleSide }),
  );
  can.position.y = 5;
  g.add(can);
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.3), mat(0x55603a));
  crate.position.y = 0.55;
  crate.castShadow = true;
  g.add(crate);
  return g;
}
type Craft = {
  kind: JpKind;
  g: THREE.Group;
  t: number;
  /** straight pass: start, end, speed; or orbit centre */
  a: THREE.Vector3;
  b: THREE.Vector3;
  v: number;
  done?: boolean;
  dropped?: boolean;
  target?: V2;
  gunT?: number;
  chute?: THREE.Group;
  land?: V2;
};
export class JapanSupport {
  cd: Record<JpKind, number> = { drop: 0, strike: 0, heli: 0 };
  crafts: Craft[] = [];
  stats = { drops: 0, landed: 0, strikes: 0, bombs: 0, heliShots: 0, heliHits: 0 };
  constructor(private d: JpDeps) {}
  ready(k: JpKind) {
    return this.cd[k] <= 0;
  }
  /** the densest PLA group 18–150 m away (most soldiers within 12 m of one of them) */
  private strikeTarget(): V2 | null {
    const P = this.d.player();
    const live = this.d
      .foes()
      .filter(f => f.state !== 'dead')
      .filter(f => {
        const r = Math.hypot(f.pos.x - P.x, f.pos.z - P.z);
        return r > 18 && r < 150;
      });
    let best: Foe | null = null,
      bn = 0;
    for (const f of live) {
      const n = live.filter(o => Math.hypot(o.pos.x - f.pos.x, o.pos.z - f.pos.z) < 12).length;
      if (n > bn) ((bn = n), (best = f));
    }
    return best ? [best.pos.x, best.pos.z] : null;
  }
  /** returns a log line (and starts the mission) or a refusal */
  call(k: JpKind): { ok: boolean; msg: string } {
    const d = this.d,
      P = d.player();
    if (!this.ready(k))
      return {
        ok: false,
        msg: T(
          `📻 「了解，下一架次 ${Math.ceil(this.cd[k])} 秒後才能出動。」`,
          `📻 “Understood. The next sortie can launch in ${Math.ceil(this.cd[k])} seconds.”`,
        ),
      };
    const dir = new THREE.Vector3(1, 0, 0.35).normalize();
    if (k === 'strike') {
      const tg = this.strikeTarget();
      if (!tg)
        return {
          ok: false,
          msg: T(
            '📻 「目標未確認——附近 18～150 公尺內沒有發現解放軍。」',
            '📻 “No target confirmed — no PLA soldiers 18–150 m from you.”',
          ),
        };
      const c = new THREE.Vector3(tg[0], 42, tg[1]);
      this.launch({
        kind: k,
        g: makeF2(),
        t: 0,
        a: c.clone().addScaledVector(dir, -380),
        b: c.clone().addScaledVector(dir, 380),
        v: 75,
        target: tg,
      });
      // wingman, offset and a little behind
      const w = makeF2();
      const off = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(14);
      this.launch({
        kind: k,
        g: w,
        t: 0,
        a: c.clone().addScaledVector(dir, -420).add(off),
        b: c.clone().addScaledVector(dir, 340).add(off),
        v: 75,
      });
      this.stats.strikes++;
      this.cd.strike = JP_COOLDOWN.strike;
      d.noise(P.x, P.z, 60);
      return {
        ok: true,
        msg: T(
          '📻 「こちらスピア・ワン、目標確認。投下まで六秒。」（槍隊一號：目標確認，六秒後投彈——離開那裡！）',
          '📻 “Spear One, target confirmed. Release in six seconds.” — get clear!',
        ),
      };
    }
    if (k === 'heli') {
      const c = new THREE.Vector3(P.x, 18, P.z);
      this.launch({ kind: k, g: makeAH64(), t: 0, a: c.clone().addScaledVector(dir, -220), b: c, v: 32, gunT: 0 });
      this.cd.heli = JP_COOLDOWN.heli;
      d.noise(P.x, P.z, 60);
      return {
        ok: true,
        msg: T(
          '📻 「アパッチ、現着まで七秒。頭を下げて。」（阿帕契七秒後到場，壓低身子！）',
          '📻 “Apache on station in seven seconds. Keep your head down.”',
        ),
      };
    }
    const c = new THREE.Vector3(P.x, 70, P.z);
    this.launch({
      kind: 'drop',
      g: makeC2(),
      t: 0,
      a: c.clone().addScaledVector(dir, -500),
      b: c.clone().addScaledVector(dir, 500),
      v: 48,
      land: d.freeNear([P.x + dir.x * 22, P.z + dir.z * 22]),
    });
    this.stats.drops++;
    this.cd.drop = JP_COOLDOWN.drop;
    return {
      ok: true,
      msg: T(
        '📻 「C-2、投下準備よし。」（C-2 運輸機十秒後通過，空投箱帶紅色煙霧落地。）',
        '📻 “C-2, ready to drop.” The transport passes over in about ten seconds; the crate comes down on a parachute.',
      ),
    };
  }
  private launch(c: Craft) {
    c.g.position.copy(c.a);
    c.g.lookAt(c.b.x, c.a.y, c.b.z);
    this.d.scene.add(c.g);
    this.crafts.push(c);
  }
  update(dt: number) {
    for (const k of Object.keys(this.cd) as JpKind[]) this.cd[k] = Math.max(0, this.cd[k] - dt);
    const d = this.d,
      P = d.player();
    for (const c of this.crafts) {
      c.t += dt;
      if (c.kind === 'heli') this.heli(c, dt, P);
      else {
        const L = c.a.distanceTo(c.b);
        const s = Math.min(1, (c.t * c.v) / L);
        c.g.position.lerpVectors(c.a, c.b, s);
        // bombs at the closest approach to the target (three along the track)
        if (c.kind === 'strike' && c.target && !c.dropped && s >= 0.5) {
          c.dropped = true;
          const dir = new THREE.Vector3().subVectors(c.b, c.a).setY(0).normalize();
          [-6, 0, 6].forEach((o, i) =>
            setTimeout(
              () => {
                const p = new THREE.Vector3(c.target![0] + dir.x * o, 0, c.target![1] + dir.z * o);
                d.blast(p);
                d.boomSound(Math.hypot(p.x - P.x, p.z - P.z));
                this.stats.bombs++;
              },
              250 + i * 220,
            ),
          );
          d.log(T('💥 F-2 投彈命中！', '💥 F-2 bombs on target!'), '#ffb070');
        }
        if (c.kind === 'drop' && c.land && !c.dropped && s >= 0.5) {
          c.dropped = true;
          c.chute = makeChute();
          c.chute.position.set(c.land[0], 60, c.land[1]);
          d.scene.add(c.chute);
        }
        if (s >= 1) c.done = true;
      }
      if (c.chute) {
        c.chute.position.y = Math.max(0, c.chute.position.y - dt * 7);
        c.chute.rotation.y += dt * 0.4;
        if (c.chute.position.y <= 0) {
          d.scene.remove(c.chute);
          c.chute = undefined;
          d.landed(c.land!);
          this.stats.landed++;
          d.log(
            T(
              '🪂 日本空投箱落地了（紅色煙霧處）：自衛隊的武器、彈藥和戰鬥糧食。',
              '🪂 The Japanese supply crate is down (red smoke): JSDF weapons, ammunition and field rations.',
            ),
            '#9fd',
          );
        }
      }
    }
    for (const c of this.crafts)
      if (c.done && !c.chute) {
        d.scene.remove(c.g);
        c.g.traverse(o => (o as THREE.Mesh).geometry?.dispose());
      }
    this.crafts = this.crafts.filter(c => !(c.done && !c.chute));
  }
  /** fly in, orbit the player for 45 s firing on PLA soldiers within 55 m, then leave */
  private heli(c: Craft, dt: number, P: THREE.Vector3) {
    const rot = c.g.getObjectByName('rotor');
    if (rot) rot.rotation.y += dt * 28;
    const d = this.d;
    const inbound = c.t * c.v < c.a.distanceTo(c.b);
    const leaving = c.t > 52;
    if (inbound) {
      const s = (c.t * c.v) / c.a.distanceTo(c.b);
      c.g.position.lerpVectors(c.a, c.b, s);
      return;
    }
    if (leaving) {
      c.g.position.y += dt * 6;
      c.g.position.x += dt * 40;
      if (c.t > 60) c.done = true;
      return;
    }
    const ang = (c.t - 7) * 0.35;
    const cx = P.x + Math.cos(ang) * 22,
      cz = P.z + Math.sin(ang) * 22;
    c.g.position.set(cx, 18, cz);
    c.g.lookAt(P.x + Math.cos(ang + 0.3) * 22, 18, P.z + Math.sin(ang + 0.3) * 22);
    c.gunT = (c.gunT ?? 0) - dt;
    if (c.gunT > 0) return;
    c.gunT = 0.9;
    const tg = d
      .foes()
      .filter(f => f.state !== 'dead' && Math.hypot(f.pos.x - cx, f.pos.z - cz) < 55)
      .sort((a, b) => Math.hypot(a.pos.x - cx, a.pos.z - cz) - Math.hypot(b.pos.x - cx, b.pos.z - cz))[0];
    if (!tg) return;
    this.stats.heliShots++;
    d.gunSound(Math.hypot(cx - P.x, cz - P.z));
    this.tracer(c.g.position, tg.pos);
    if (Math.random() < 0.6) {
      d.hit(tg, 45);
      this.stats.heliHits++;
    }
  }
  private tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const g = new THREE.BufferGeometry().setFromPoints([a.clone(), new THREE.Vector3(b.x, 0.8, b.z)]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd070, transparent: true, opacity: 0.9 }));
    this.d.scene.add(l);
    setTimeout(() => {
      this.d.scene.remove(l);
      g.dispose();
    }, 120);
  }
  /** cooldown summary for the radio panel */
  status() {
    return (['drop', 'strike', 'heli'] as JpKind[]).map(k => ({ k, cd: Math.ceil(this.cd[k]) }));
  }
}
export const JP_LABEL: Record<JpKind, string> = {
  drop: tr('請求空投（C-2 運輸機）', 'Request an airdrop (C-2 transport)'),
  strike: tr('呼叫戰機轟炸（F-2）', 'Call an F-2 air strike'),
  heli: tr('呼叫直升機掩護（AH-64DJ）', 'Call AH-64DJ gunship cover'),
};
