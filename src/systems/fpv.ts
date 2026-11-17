import { tr } from '../i18n';
import { SET } from '../ui/settings';
// FPV kamikaze drone (pilot view w/ analog video look + OSD) and PLA recon drones.
import * as THREE from 'three';
type V2 = [number, number];
export type DroneDeps = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  player: () => THREE.Vector3;
  blocked: (x: number, z: number, y: number) => boolean;
  los: (a: V2, b: V2) => boolean;
  jammers: () => V2[];
  explode: (p: THREE.Vector3, fromAbove: boolean) => void;
  log: (m: string, c?: string) => void;
  mobile: boolean;
  wind: () => number;
  surf: (x: number, z: number) => number;
};
function stick(parent: HTMLElement, side: 'l' | 'r') {
  const J = document.createElement('div');
  J.className = 'fstick ' + side;
  const K = document.createElement('div');
  K.className = 'fknob';
  J.appendChild(K);
  parent.appendChild(J);
  const st = { x: 0, y: 0, id: -1, el: J };
  const R = 55;
  let cx = 0,
    cy = 0;
  const upd = (e: PointerEvent) => {
    let dx = e.clientX - cx,
      dy = e.clientY - cy;
    const L = Math.hypot(dx, dy);
    if (L > R) {
      dx *= R / L;
      dy *= R / L;
    }
    st.x = dx / R;
    st.y = dy / R;
    K.style.transform = `translate(${dx}px,${dy}px)`;
  };
  J.addEventListener('pointerdown', e => {
    e.preventDefault();
    const b = J.getBoundingClientRect();
    cx = b.left + b.width / 2;
    cy = b.top + b.height / 2;
    st.id = e.pointerId;
    J.setPointerCapture(e.pointerId);
    upd(e);
  });
  J.addEventListener('pointermove', e => {
    if (e.pointerId === st.id) upd(e);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== st.id) return;
    st.id = -1;
    st.x = 0;
    if (side === 'r') st.y = 0;
    K.style.transform = side === 'l' ? `translate(0px,${st.y * R}px)` : '';
  }; // throttle stick does not spring back
  J.addEventListener('pointerup', end);
  J.addEventListener('pointercancel', end);
  return st;
}

// ---- Flight model v14 ----------------------------------------------------------------------------------------
// Concepts re-implemented (no code copied) from lijiabao1998/Physical-Fpv-Simulator: per-motor thrust ∝ ω²,
// rotor spool dynamics, battery OCV(SOC) with internal-resistance sag, body-frame quadratic drag, rate controller +
// 4-motor mixer, fixed 240 Hz physics step, stick deadzone/expo. Added here: Betaflight-style rates (RC rate, super
// rate, expo), airmode, ground effect (Cheeseman–Bennett), prop-wash / vortex-ring on descent, crash bounces.
const PH = 1 / 240,
  MASS = 0.85,
  ARM = 0.078,
  TMAX = 9.5,
  KQ = 0.016,
  I = new THREE.Vector3(0.0045, 0.008, 0.0045),
  PROP_R = 0.0635;
const CDA = new THREE.Vector3(0.022, 0.04, 0.026),
  CAP_AH = 0.75,
  R_INT = 0.032,
  IMAX_M = 24,
  UPTILT = THREE.MathUtils.degToRad(30);
const MOT: [number, number, number][] = [
  [ARM, -ARM, -1],
  [-ARM, -ARM, 1],
  [ARM, ARM, 1],
  [-ARM, ARM, -1],
]; // x, z (−z = nose), prop spin sign
export function bfRate(x: number, rc: number, sup: number, ex: number) {
  const a = Math.abs(x);
  const c = x * a * a * a * ex + x * (1 - ex);
  let r = 200 * rc * c;
  if (sup) r *= 1 / THREE.MathUtils.clamp(1 - Math.abs(c) * sup, 0.01, 1);
  return THREE.MathUtils.degToRad(r);
}
const RATES = { rp: [1.0, 0.7, 0.25], yaw: [1.0, 0.6, 0.0] } as const;
const dz = (v: number, d = 0.04) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
const VSH = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const FSH = `uniform sampler2D tScene; uniform sampler2D tOsd; uniform float uT, uSig, uRoll, uBW, uGhost, uTear, uShake; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 px(vec2 uv){ vec3 c = texture2D(tScene, uv).rgb; vec4 o = texture2D(tOsd, uv); return mix(c, o.rgb, o.a); }
void main(){
  vec2 uv = vUv; float bad = 1. - uSig; float line = floor(uv.y * 288.);
  uv.y = fract(uv.y + uRoll);                                   // vertical sync loss: picture rolls
  float bandId = floor(uv.y * 18. + uT * 9.); float band = step(1. - bad * bad * .85, h(vec2(bandId, floor(uT * 25.))));  // breakup bars
  uv.x += (h(vec2(line, floor(uT * 60.))) - .5) * (.002 + .012 * bad * bad) + band * (h(vec2(bandId, uT)) - .5) * .12 + uTear * sin(uv.y * 40. + uT * 30.) * .01;
  uv += vec2(h(vec2(uT, 1.)) - .5, h(vec2(uT, 2.)) - .5) * uShake;
  vec3 c = px(uv);
  vec3 g = px(uv - vec2(uGhost, 0.)); c = c * (1. - min(.45, uGhost * 30.)) + g * min(.45, uGhost * 30.);   // multipath echo
  vec3 cs = px(uv + vec2(.006, 0.)); float Y = dot(c, vec3(.299, .587, .114)); vec3 ch = cs - dot(cs, vec3(.299, .587, .114));
  c = vec3(Y) + ch * 1.15 * (1. - uBW);                         // narrow chroma bandwidth / colour-killer dropout
  #include <tonemapping_fragment>
  float n = h(uv * vec2(420., 288.) + fract(uT * 13.7) * 91.); float amt = clamp(.035 + bad * bad * .9, 0., .97) * (.7 + .3 * h(vec2(line, uT)));
  c = mix(c, vec3(n), amt); c = mix(c, vec3(h(vec2(line * .37, uT * 3.))), band * .75);
  c *= .9 + .1 * sin(vUv.y * 288. * 3.14159); vec2 d = vUv - .5; c *= 1. - dot(d, d) * .85;
  gl_FragColor = vec4(c, 1.);
  #include <colorspace_fragment>
}`;
export class FPV {
  active = false;
  cam = new THREE.PerspectiveCamera(105, 1, 0.05, 900);
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  q = new THREE.Quaternion();
  w = new THREE.Vector3();
  thr = 0;
  soc = 1;
  volt = 16.8;
  amps = 0;
  mah = 0;
  rpm = [0, 0, 0, 0];
  sig = 1;
  rssi = -40;
  lostT = 0;
  t = 0;
  acc = 0;
  integ = new THREE.Vector3();
  stickRP = [0, 0];
  bumps = 0;
  turtleT = 0;
  wash = 0;
  ghost = 0;
  roll = 0;
  bwT = 0;
  tear = 0;
  shake = 0;
  warn = '';
  el: HTMLDivElement;
  dvr: HTMLDivElement;
  keys: Record<string, boolean> = {};
  md = [0, 0];
  ls?: ReturnType<typeof stick>;
  rs?: ReturnType<typeof stick>;
  onEnd: (why: string) => void = () => {};
  audio?: { ctx: AudioContext; o: OscillatorNode; g: GainNode };
  rt: THREE.WebGLRenderTarget;
  osdCv: HTMLCanvasElement;
  osdTex: THREE.CanvasTexture;
  mat: THREE.ShaderMaterial;
  quad: THREE.Scene;
  qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  get batt() {
    return this.soc * 100;
  }
  constructor(public d: DroneDeps) {
    this.el = document.createElement('div');
    this.el.id = 'fpv';
    this.dvr = document.createElement('div');
    this.dvr.className = 'dvr';
    this.el.append(this.dvr);
    document.body.appendChild(this.el);
    if (d.mobile) {
      this.ls = stick(this.el, 'l');
      this.rs = stick(this.el, 'r');
      this.ls.y = 0.05;
    }
    this.rt = new THREE.WebGLRenderTarget(400, 288, { type: THREE.HalfFloatType });
    this.osdCv = document.createElement('canvas');
    this.osdCv.width = 420;
    this.osdCv.height = 288;
    this.osdTex = new THREE.CanvasTexture(this.osdCv);
    this.osdTex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VSH,
      fragmentShader: FSH,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
      uniforms: {
        tScene: { value: this.rt.texture },
        tOsd: { value: this.osdTex },
        uT: { value: 0 },
        uSig: { value: 1 },
        uRoll: { value: 0 },
        uBW: { value: 0 },
        uGhost: { value: 0 },
        uTear: { value: 0 },
        uShake: { value: 0 },
      },
    });
    this.quad = new THREE.Scene();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    m.frustumCulled = false;
    this.quad.add(m);
    addEventListener('keydown', e => {
      if (!this.active) return;
      this.keys[e.code] = true;
      if (e.code === 'Escape') this.end(tr('你放棄了操控，無人機墜毀', 'You abandoned control. The drone crashed.'));
    });
    addEventListener('keyup', e => {
      this.keys[e.code] = false;
    });
    addEventListener('mousemove', e => {
      if (this.active) {
        this.md[0] += e.movementX;
        this.md[1] += e.movementY;
      }
    });
  }
  launch(onEnd: (why: string) => void) {
    const P = this.d.player();
    // (v24.38 from where the player stands: on a roof, the roof's height)
    this.pos.set(P.x, (P.y || 0) + 1.6, P.z);
    this.vel.set(0, 0, 0);
    this.w.set(0, 0, 0);
    this.q.setFromEuler(new THREE.Euler(0, Math.PI * 0.75, 0, 'YXZ'));
    this.thr = 0.55;
    this.soc = 1;
    this.mah = 0;
    this.rpm = [0.4, 0.4, 0.4, 0.4];
    this.sig = 1;
    this.lostT = 0;
    this.t = 0;
    this.acc = 0;
    this.integ.set(0, 0, 0);
    this.stickRP = [0, 0];
    this.bumps = 0;
    this.turtleT = 0;
    this.roll = 0;
    this.onEnd = onEnd;
    this.active = true;
    document.body.classList.add('fpvon');
    this.resize();
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 180;
      const g = ctx.createGain();
      g.gain.value = 0.03;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      o.connect(f);
      f.connect(g);
      g.connect(ctx.destination);
      o.start();
      this.audio = { ctx, o, g };
    } catch {
      /* no audio */
    }
    this.d.log(
      this.d.mobile
        ? tr(
            'FPV 起飛！左搖桿油門／偏航、右搖桿俯仰／滾轉（ACRO 模式，不會自動回正）',
            'FPV launched! Left stick: throttle/yaw. Right stick: pitch/roll. ACRO mode does not self-level.',
          )
        : tr(
            'FPV 起飛！W/S 油門、滑鼠俯仰／滾轉、A/D 偏航（ACRO 模式，不會自動回正）。Esc 放棄',
            'FPV launched! W/S: throttle. Mouse: pitch/roll. A/D: yaw. ACRO mode does not self-level. Esc: abandon.',
          ),
      '#9cf',
    );
  }
  resize() {
    const a = innerWidth / innerHeight;
    this.cam.aspect = a;
    this.cam.fov = a < 1 ? 118 : 100;
    this.cam.updateProjectionMatrix();
    const H = a < 1 ? Math.round(300 / a) : 288,
      W = a < 1 ? 300 : Math.round(288 * a);
    this.rt.setSize(W, H);
    this.osdCv.width = a < 1 ? 420 : W;
    this.osdCv.height = a < 1 ? Math.round(420 / a) : H;
  }
  end(why: string) {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('fpvon');
    if (this.audio) {
      this.audio.o.stop();
      this.audio.ctx.close();
      this.audio = undefined;
    }
    this.onEnd(why);
  }
  render(r: THREE.WebGLRenderer) {
    const u = this.mat.uniforms;
    u.uT.value = this.t;
    u.uSig.value = this.sig;
    u.uRoll.value = this.roll;
    u.uBW.value = this.bwT > 0 ? 1 : 0;
    u.uGhost.value = this.ghost;
    u.uTear.value = this.tear;
    u.uShake.value = this.shake;
    r.setRenderTarget(this.rt);
    r.render(this.d.scene, this.cam);
    r.setRenderTarget(null);
    r.render(this.quad, this.qcam);
  }
  inputs(dt: number) {
    const k = this.keys;
    let roll = 0,
      pitch = 0,
      yaw = 0;
    if (this.d.mobile && this.ls && this.rs) {
      this.thr = THREE.MathUtils.clamp((1 - this.ls.y) / 2, 0, 1);
      yaw = dz(this.ls.x);
      roll = dz(this.rs.x);
      pitch = dz(-this.rs.y);
    } else {
      // mouse acts as a self-centring right stick; keys as integrated throttle (like a non-centring gimbal)
      const s = this.stickRP;
      s[0] = THREE.MathUtils.clamp(s[0] + this.md[0] * 0.006 * SET.sens, -1, 1);
      s[1] = THREE.MathUtils.clamp(s[1] - this.md[1] * 0.006 * SET.sens, -1, 1);
      this.md[0] = this.md[1] = 0;
      const dec = Math.exp(-dt * 5);
      s[0] *= dec;
      s[1] *= dec;
      roll = s[0] + (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
      pitch = s[1] + (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0);
      yaw = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
      this.thr = THREE.MathUtils.clamp(this.thr + ((k.KeyW ? 0.9 : 0) - (k.KeyS ? 0.9 : 0)) * dt, 0, 1);
    }
    roll = THREE.MathUtils.clamp(roll, -1, 1);
    pitch = THREE.MathUtils.clamp(pitch, -1, 1);
    // stick → target body rates (three.js body axes: +x pitch-up, +y yaw-left, +z roll-left)
    return new THREE.Vector3(-bfRate(pitch, ...RATES.rp), -bfRate(yaw, ...RATES.yaw), -bfRate(roll, ...RATES.rp));
  }
  step(h: number, target: THREE.Vector3) {
    // rate PID → mixer with airmode
    const e = target.clone().sub(this.w);
    this.integ.addScaledVector(e, h).clampScalar(-1.5, 1.5);
    const up = (axis: number, kp: number, ki: number) =>
      THREE.MathUtils.clamp(kp * e.getComponent(axis) + ki * this.integ.getComponent(axis), -0.35, 0.35);
    const uP = up(0, 0.022, 0.06),
      uY = up(1, 0.06, 0.1),
      uR = up(2, 0.022, 0.06);
    let cmd = MOT.map(([x, z, s]) => this.thr + uP * -Math.sign(z) + uR * Math.sign(x) + uY * s);
    const hi = Math.max(...cmd),
      lo = Math.min(...cmd);
    if (hi > 1) cmd = cmd.map(c => c - (hi - 1));
    else if (lo < 0 && this.thr > 0.02) cmd = cmd.map(c => c - lo);
    cmd = cmd.map(c => THREE.MathUtils.clamp(c, 0, 1));
    // motor spool lag (rotor inertia): faster up than down
    for (let i = 0; i < 4; i++) {
      const tau = cmd[i] > this.rpm[i] ? 0.03 : 0.05;
      this.rpm[i] += (cmd[i] - this.rpm[i]) * Math.min(1, h / tau);
    }
    // battery: OCV(SOC) − I·R sag; thrust ∝ (ω·V)²
    const ocv = 4 * (3.1 + 1.1 * this.soc);
    this.amps = this.rpm.reduce((a, r) => a + IMAX_M * r * r * r, 0) + 0.6;
    this.volt = ocv - this.amps * R_INT;
    this.soc = Math.max(0, this.soc - (h * this.amps) / (CAP_AH * 3600));
    this.mah += (h * this.amps) / 3.6;
    const up3 = new THREE.Vector3(0, 1, 0).applyQuaternion(this.q);
    const vs = this.d.wind();
    const air = this.vel
      .clone()
      .sub(new THREE.Vector3(vs + Math.sin(this.t * 0.7) * vs * 0.6, 0, Math.cos(this.t * 0.5) * vs * 0.5));
    const hAG = Math.max(0.05, this.pos.y - this.d.surf(this.pos.x, this.pos.z));
    const ge = 1 / Math.max(0.6, 1 - (PROP_R / (4 * hAG)) ** 2); // ground effect
    const axial = air.dot(up3),
      lateral = Math.sqrt(Math.max(0, air.lengthSq() - axial * axial));
    this.wash = THREE.MathUtils.clamp((-axial - 1.5) / 5, 0, 1) * THREE.MathUtils.clamp(1 - lateral / 7, 0, 1); // descending into own wash
    const vEff = Math.min(1.12, (this.volt / 15.8) ** 2) * ge * (1 - 0.28 * this.wash);
    const T = this.rpm.map(r => TMAX * r * r * vEff);
    // torques (body frame)
    const tau = new THREE.Vector3();
    MOT.forEach(([x, z, s], i) => {
      tau.x += -z * T[i];
      tau.z += x * T[i];
      tau.y += s * KQ * T[i];
    });
    if (this.wash > 0)
      tau.add(
        new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.3, Math.random() - 0.5).multiplyScalar(
          this.wash * 0.09,
        ),
      );
    tau.addScaledVector(this.w, -0.0015);
    this.w.x += (tau.x / I.x) * h;
    this.w.y += (tau.y / I.y) * h;
    this.w.z += (tau.z / I.z) * h;
    const dq = new THREE.Quaternion(this.w.x * h * 0.5, this.w.y * h * 0.5, this.w.z * h * 0.5, 1);
    this.q.multiply(dq).normalize();
    // forces: thrust along body up, quadratic drag in body frame, gravity
    const qi = this.q.clone().invert();
    const vb = air.clone().applyQuaternion(qi);
    const fb = new THREE.Vector3(
      -0.5 * 1.225 * CDA.x * vb.x * Math.abs(vb.x),
      T.reduce((a, b) => a + b, 0) - 0.5 * 1.225 * CDA.y * vb.y * Math.abs(vb.y),
      -0.5 * 1.225 * CDA.z * vb.z * Math.abs(vb.z),
    );
    const F = fb.applyQuaternion(this.q);
    F.y -= MASS * 9.81;
    this.vel.addScaledVector(F, h / MASS);
    const prev = this.pos.clone();
    this.pos.addScaledVector(this.vel, h);
    return prev;
  }
  collide(prev: THREE.Vector3): string | null {
    const p = this.pos;
    const ground = p.y < 0.12;
    const hit = ground || this.d.blocked(p.x, p.z, p.y);
    if (!hit) return null;
    const sp = this.vel.length();
    const above = this.vel.y < -3 && -this.vel.y > Math.hypot(this.vel.x, this.vel.z) * 0.6;
    if (sp > 4.5 || this.bumps >= 3) {
      this.d.explode(p.clone(), above);
      return tr('撞擊引爆！', 'Impact detonation!');
    }
    // low-speed bump: reflect along the blocked axis, lose energy, tumble
    this.bumps++;
    if (ground || !this.d.blocked(p.x, p.z, prev.y)) {
      this.vel.y = Math.abs(this.vel.y) * 0.3;
      this.vel.x *= 0.6;
      this.vel.z *= 0.6;
      p.y = Math.max(prev.y, 0.13);
    } else {
      const bx = this.d.blocked(p.x, prev.z, p.y),
        bz = this.d.blocked(prev.x, p.z, p.y);
      if (bx) this.vel.x *= -0.3;
      if (bz) this.vel.z *= -0.3;
      if (!bx && !bz) this.vel.multiplyScalar(-0.3);
      p.x = prev.x;
      p.z = prev.z;
    }
    this.w.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14));
    this.d.log(
      tr(`碰撞（${sp.toFixed(1)} m/s）——引信未觸發`, `Collision (${sp.toFixed(1)} m/s). Fuse did not trigger.`),
      '#ccc',
    );
    return null;
  }
  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const target = this.inputs(dt);
    this.acc += dt;
    let prev = this.pos.clone();
    while (this.acc >= PH) {
      this.acc -= PH;
      prev = this.step(PH, target);
      const r = this.collide(prev);
      if (r) return this.end(r);
    }
    // turtle: upside-down resting on the ground
    const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(this.q).y;
    if (this.pos.y < 0.4 && upY < 0.2 && this.vel.length() < 1) {
      this.turtleT += dt;
      if (this.turtleT > 2.5) return this.end(tr('無人機翻覆，無法再起飛', 'Drone overturned. Unable to take off.'));
    } else this.turtleT = 0;
    // signal: 5.8 GHz free-space path loss + building blockage + jammers + fast fading → RSSI dBm
    const P = this.d.player();
    // (v24.38 from up on a roof the pilot stands P.y up: what blocks the link is what rises above the line from them to
    // the drone, sampled along it. Their own roof is under it, other buildings still count. In the street, the walls)
    const oy = (P.y || 0) + 1.5;
    const dist = Math.max(1, Math.hypot(this.pos.x - P.x, this.pos.z - P.z, this.pos.y - oy));
    let rssi = 28 - (20 * Math.log10(dist) + 20 * Math.log10(5800) - 27.55);
    let blocked = false;
    if (this.pos.y < 28) {
      if (!(P.y > 0)) blocked = !this.d.los([P.x, P.z], [this.pos.x, this.pos.z]);
      else {
        const n = Math.min(200, Math.ceil(Math.hypot(this.pos.x - P.x, this.pos.z - P.z) / 3));
        for (let i = 1; i < n && !blocked; i++) {
          const t = i / n;
          const h = this.d.surf(P.x + (this.pos.x - P.x) * t, P.z + (this.pos.z - P.z) * t);
          blocked = h > oy + (this.pos.y - oy) * t;
        }
      }
    }
    if (blocked) rssi -= 22;
    for (const j of this.d.jammers()) {
      const dj = Math.hypot(this.pos.x - j[0], this.pos.z - j[1]);
      rssi -= THREE.MathUtils.clamp(40 - dj * 0.45, 0, 40);
    }
    rssi += (Math.random() - 0.5) * 6 * (0.3 + this.ghost * 60);
    this.rssi += (rssi - this.rssi) * Math.min(1, dt * 4);
    const s = THREE.MathUtils.clamp((this.rssi + 92) / 30, 0, 1);
    this.sig += (s - this.sig) * Math.min(1, dt * 5);
    if (this.sig < 0.06) {
      this.lostT += dt;
      if (this.lostT > 1.2)
        return this.end(
          this.d.jammers().some(j => Math.hypot(this.pos.x - j[0], this.pos.z - j[1]) < 70)
            ? tr('訊號被解放軍干擾站壓制——圖傳中斷', 'PLA jammer suppressed the signal. Video link lost.')
            : tr('訊號中斷（距離太遠或被建築遮擋）', 'Signal lost: out of range or blocked by buildings.'),
        );
    } else this.lostT = 0;
    if (this.soc <= 0.03 || 4 * (3.1 + 1.1 * this.soc) < 13.0 || this.volt < 10.2)
      return this.end(
        tr('電池耗盡（低電壓斷電），無人機墜落', 'Battery depleted (low-voltage cutoff). The drone is falling.'),
      );
    // video impairments
    let near = 0;
    for (const [dx, dzz] of [
      [10, 0],
      [-10, 0],
      [0, 10],
      [0, -10],
    ])
      if (this.d.blocked(this.pos.x + dx, this.pos.z + dzz, this.pos.y)) near++;
    this.ghost +=
      ((near ? 0.004 + near * 0.0025 : 0.0015) * (0.7 + Math.random() * 0.6) - this.ghost) * Math.min(1, dt * 3);
    if (this.sig < 0.28) this.roll = (this.roll + dt * (0.28 - this.sig) * 6) % 1;
    else if (this.roll > 0)
      this.roll = this.roll > 0.5 ? Math.min(1, this.roll + dt * 4) % 1 : Math.max(0, this.roll - dt * 4);
    if (this.sig < 0.35 && Math.random() < dt * 3 * (0.35 - this.sig) * 6) this.bwT = 0.25 + Math.random() * 0.4;
    this.bwT -= dt;
    this.tear = this.sig < 0.4 ? (0.4 - this.sig) * (Math.random() < 0.3 ? 1 : 0.2) : 0;
    this.shake = this.wash * 0.004 + (this.bumps && this.t % 1 < 0.1 ? 0.003 : 0);
    // camera with uptilt
    this.cam.position.copy(this.pos);
    this.cam.quaternion
      .copy(this.q)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), UPTILT));
    this.cam.updateMatrixWorld();
    if (this.audio) {
      const rp = this.rpm.reduce((a, b) => a + b) / 4;
      this.audio.o.frequency.value = 120 + rp * 420 + this.wash * 30 * Math.random();
      this.audio.g.gain.value = 0.015 + rp * 0.05;
    }
    this.osd();
  }
  osd() {
    const c = this.osdCv.getContext('2d')!,
      W = this.osdCv.width,
      H = this.osdCv.height;
    c.clearRect(0, 0, W, H);
    const F = Math.min(H / 288, W / 420);
    c.font = `bold ${Math.round(13 * F)}px "Courier New", monospace`;
    c.lineWidth = 3 * F;
    c.strokeStyle = '#000';
    c.fillStyle = '#fff';
    c.textBaseline = 'top';
    const tx = (s: string, x: number, y: number, al: CanvasTextAlign = 'left') => {
      c.textAlign = al;
      c.strokeText(s, x, y);
      c.fillText(s, x, y);
    };
    const m = 12 * F,
      L = 16 * F,
      P = this.d.player();
    const e = new THREE.Euler().setFromQuaternion(this.q, 'YXZ');
    const cell = this.volt / 4;
    const blink = this.t % 0.8 < 0.45;
    tx(`▮ ${this.volt.toFixed(1)}V`, m, m);
    tx(`${this.amps.toFixed(1)}A ${Math.round(this.mah)}mAh`, m, m + L);
    tx('DEFEND-TPE', W / 2, m, 'center');
    tx(`RSSI ${Math.round(this.sig * 99)} ${Math.round(this.rssi)}dBm`, W - m, m, 'right');
    tx(`LQ ${this.lostT > 0 ? '0' : Math.min(100, Math.round(60 + this.sig * 45))}`, W - m, m + L, 'right');
    // artificial horizon + crosshair (Betaflight style)
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(e.z);
    const py = THREE.MathUtils.clamp((e.x + UPTILT) * 140 * F, -H / 3, H / 3);
    c.fillStyle = '#fff';
    c.strokeStyle = '#000';
    for (let i = -4; i <= 4; i++) {
      if (Math.abs(i) < 1) continue;
      c.strokeRect(i * 18 * F - 5 * F, py - 1 * F, 10 * F, 2 * F);
      c.fillRect(i * 18 * F - 5 * F, py - 1 * F, 10 * F, 2 * F);
    }
    c.restore();
    c.fillStyle = '#fff';
    tx('-+-', W / 2, H / 2 - 6 * F, 'center');
    tx(`${Math.round(this.vel.length() * 3.6)}K`, W / 2 - 80 * F, H / 2 - 6 * F, 'right');
    tx(`${this.pos.y.toFixed(1)}M`, W / 2 + 80 * F, H / 2 - 6 * F);
    const hd = Math.hypot(P.x - this.pos.x, P.z - this.pos.z),
      hb = Math.atan2(P.x - this.pos.x, P.z - this.pos.z) - e.y + Math.PI;
    const ar = '↑↗→↘↓↙←↖'[((Math.round(-hb / (Math.PI / 4)) % 8) + 8) % 8];
    tx(`${ar} ${Math.round(hd)}M`, W / 2, H - m - L * 2, 'center');
    tx('ACRO', m, H - m - L * 2);
    tx(`THR ${Math.round(this.thr * 100)}`, m, H - m - L);
    tx(
      `ON ${Math.floor(this.t / 60)
        .toString()
        .padStart(2, '0')}:${Math.floor(this.t % 60)
        .toString()
        .padStart(2, '0')}`,
      W - m,
      H - m - L,
      'right',
    );
    tx(`${cell.toFixed(2)}V/C`, W - m, H - m - L * 2, 'right');
    const w: string[] = [];
    if (cell < 3.5) w.push('LOW VOLTAGE');
    if (this.sig < 0.3) w.push('RSSI LOW');
    if (this.wash > 0.3) w.push('PROPWASH');
    if (this.lostT > 0) w.push('FAILSAFE');
    this.warn = w.join(' ');
    if (w.length && blink) tx(w[0], W / 2, H / 2 + 34 * F, 'center');
    tx('ARMED', W / 2, m + L, 'center');
    this.osdTex.needsUpdate = true;
    // goggle-side DVR overlay (not affected by the analog link)
    this.dvr.innerHTML = `<span class="rec">● REC</span> ${Math.floor(this.t / 60)
      .toString()
      .padStart(2, '0')}:${(this.t % 60).toFixed(0).padStart(2, '0')}　R1 5658MHz　RSSI ${Math.round(this.sig * 100)}%`;
  }
}

// ---------- PLA recon drones circling overhead ----------
