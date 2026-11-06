// v22.6 procedural audio + v22.8 recorded CC0 gunshots (public/sfx/gun, see CREDITS.md). Two shared contexts:
// SFX (settings → 音效) and AMB (ambience / rain / shelter life, tagged with markMusic → 音樂／環境).
import { markMusic } from '../ui/settings';

let SFX: AudioContext | null = null;
let AMB: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
function ctx(amb = false): AudioContext | null {
  try {
    if (amb) {
      if (!AMB) markMusic((AMB = new AudioContext()));
      return AMB;
    }
    return (SFX ||= new AudioContext());
  } catch {
    return null;
  }
}
/** mobile browsers start contexts suspended: resume on the first touch / click / key */
export function unlockAudio() {
  const go = () => {
    ctx()?.resume();
    loadGunSamples();
    loadBoomSamples();
    ctx(true)?.resume();
  };
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) addEventListener(ev, go, { passive: true });
}
export const sfxCtx = () => ctx();
/** v24.7 the ambience context's state ('running' once unlocked by a gesture), for checks */
export const ambState = () => AMB?.state ?? 'none';
/** how many of each sound were started (checks / debugging) */
export const auStats: Record<string, number> = {};
const cnt = (k: string) => (auStats[k] = (auStats[k] || 0) + 1);
function noise(c: AudioContext) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf = b);
}
type Env = { a?: number; d: number; v: number; at?: number };
function env(c: AudioContext, g: GainNode, e: Env) {
  const t = (e.at ?? 0) + c.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, e.v), t + (e.a ?? 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t + (e.a ?? 0.003) + e.d);
  return t;
}
/** a filtered noise burst */
function burst(
  c: AudioContext,
  out: AudioNode,
  f: { type: BiquadFilterType; hz: number; q?: number },
  e: Env,
  rate = 1,
) {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  s.playbackRate.value = rate;
  const bq = c.createBiquadFilter();
  bq.type = f.type;
  bq.frequency.value = f.hz;
  bq.Q.value = f.q ?? 0.8;
  const g = c.createGain();
  s.connect(bq).connect(g).connect(out);
  const t = env(c, g, e);
  s.start(t, Math.random());
  s.stop(t + (e.a ?? 0.003) + e.d + 0.05);
}
function tone(c: AudioContext, out: AudioNode, type: OscillatorType, f0: number, f1: number, e: Env) {
  const o = c.createOscillator();
  o.type = type;
  const g = c.createGain();
  o.connect(g).connect(out);
  const t = env(c, g, e);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + (e.a ?? 0.003) + e.d);
  o.start(t);
  o.stop(t + (e.a ?? 0.003) + e.d + 0.05);
}
/** distance + walls: a gain and a low-pass bus; indoor adds a short slap-back room */
function bus(c: AudioContext, dist: number, indoor = false, ref = 6) {
  const g = c.createGain();
  g.gain.value = 1 / (1 + Math.max(0, dist) / ref);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.max(500, 16000 / (1 + dist / 12));
  g.connect(lp).connect(c.destination);
  if (indoor) {
    const dl = c.createDelay(0.3);
    dl.delayTime.value = 0.045;
    const fb = c.createGain();
    fb.gain.value = 0.35;
    g.connect(dl).connect(fb).connect(dl);
    fb.connect(lp);
  } else if (dist > 25) {
    // street echo off the façades
    const dl = c.createDelay(1);
    dl.delayTime.value = 0.18 + Math.random() * 0.1;
    const fb = c.createGain();
    fb.gain.value = 0.25;
    g.connect(dl).connect(fb).connect(lp);
  }
  setTimeout(() => g.disconnect(), 4000);
  return g;
}

export type GunKind = 'pistol' | 'rifle' | 'sniper' | 'mg' | 'shotgun' | 'at';
export function gunKind(id: string, d: any): GunKind {
  if (d.at) return 'at';
  if (/qsz|t75p|pistol|92/.test(id)) return 'pistol';
  if ((d.dmg ?? 0) >= 85) return 'sniper';
  if ((d.cd ?? 1) < 0.12) return 'mg';
  if (/12/.test(d.cal || '') || /shot/.test(id)) return 'shotgun';
  return 'rifle';
}
// ---- v22.8 recorded gunshots (CC0, The Free Firearm Sound Library — see CREDITS.md), decoded once on the SFX
// context; the procedural shot above stays as the fallback (and for anti-armour) until / unless they load
const GUN_FILES: Record<string, string[]> = {
  pistol: ['pistol1', 'pistol2'],
  rifle: ['rifle1', 'rifle2', 'rifle3'],
  sniper: ['sniper1', 'sniper2'],
  mg: ['mg1', 'mg2'],
  shotgun: ['shotgun1', 'shotgun2'],
  far: ['far1'],
};
const gunBuf: Record<string, AudioBuffer[]> = {};
let gunLoad: 'idle' | 'loading' | 'ok' | 'fail' = 'idle';
export const gunSamples = () => ({ state: gunLoad, n: Object.values(gunBuf).reduce((a, b) => a + b.length, 0) });
export function loadGunSamples() {
  const c = ctx();
  if (!c || gunLoad !== 'idle') return;
  gunLoad = 'loading';
  const base = (import.meta as any).env?.BASE_URL ?? '/';
  const jobs: Promise<void>[] = [];
  for (const [k, fs] of Object.entries(GUN_FILES))
    for (const f of fs)
      jobs.push(
        fetch(`${base}sfx/gun/${f}.mp3`)
          .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
          .then(ab => new Promise<AudioBuffer>((ok, no) => c.decodeAudioData(ab, ok, no)))
          .then(bf => void (gunBuf[k] ||= []).push(bf))
          .catch(() => {}),
      );
  Promise.all(jobs).then(() => (gunLoad = Object.keys(gunBuf).length ? 'ok' : 'fail'));
}
/** gun master: compressor + limiter so the shots can be loud without clipping (still under the 音效 volume) */
let gunOut: AudioNode | null = null;
let roomIR: AudioBuffer | null = null,
  streetIR: AudioBuffer | null = null;
function gunMaster(c: AudioContext) {
  if (gunOut && gunOut.context === c) return gunOut;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 6;
  comp.ratio.value = 5;
  comp.attack.value = 0.002;
  comp.release.value = 0.18;
  const lim = c.createDynamicsCompressor();
  lim.threshold.value = -2;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.001;
  lim.release.value = 0.08;
  const mk = c.createGain();
  mk.gain.value = 1.6; // make-up gain: punchier than footsteps / doors
  comp.connect(mk).connect(lim).connect(c.destination);
  return (gunOut = comp);
}
/** synthetic impulse responses: small room (indoor) and a long sparse street / façade echo (sniper, distant) */
function ir(c: AudioContext, len: number, decay: number, taps = 0) {
  const n = Math.floor(c.sampleRate * len),
    b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (taps ? 0.25 : 1);
    for (let t = 0; t < taps; t++) {
      const at = Math.floor(n * (0.12 + 0.7 * Math.random()));
      for (let j = 0; j < 400 && at + j < n; j++)
        d[at + j] += (Math.random() * 2 - 1) * 0.6 * Math.pow(1 - at / n, 2) * (1 - j / 400);
    }
  }
  return b;
}
function conv(c: AudioContext, street: boolean) {
  const cv = c.createConvolver();
  if (street) cv.buffer = streetIR && streetIR.sampleRate === c.sampleRate ? streetIR : (streetIR = ir(c, 2.2, 3, 7));
  else cv.buffer = roomIR && roomIR.sampleRate === c.sampleRate ? roomIR : (roomIR = ir(c, 0.7, 4));
  return cv;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** one gunshot; dist in m from the listener (the player), indoor = either end under a roof */
export function gunshot(k: GunKind, dist = 0, indoor = false) {
  const c = ctx();
  if (!c || dist > 260) return;
  cnt('gun_' + k);
  if (gunLoad === 'idle') loadGunSamples();
  const far = dist > 70 && k !== 'pistol' && gunBuf.far?.length;
  const set = far ? gunBuf.far : gunBuf[k];
  if (k !== 'at' && set?.length) {
    cnt('gunrec_' + k);
    const out = gunMaster(c);
    const src = c.createBufferSource();
    src.buffer = set[Math.floor(Math.random() * set.length)];
    src.playbackRate.value = rnd(0.93, 1.06) * (k === 'sniper' ? 0.94 : 1);
    const loud = { pistol: 1.3, rifle: 1.6, sniper: 2.0, mg: 1.5, shotgun: 1.8, at: 2 }[k];
    const g = c.createGain();
    g.gain.value = loud * rnd(0.85, 1) * (1 / (1 + Math.max(0, dist) / (k === 'sniper' ? 22 : 14)));
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(700, 18000 / (1 + dist / 18));
    src.connect(lp).connect(g);
    g.connect(out);
    // reverb sends: room when indoors; street echo for the sniper crack and distant shots
    const wet = indoor ? 0.55 : k === 'sniper' ? 0.45 : dist > 25 ? 0.3 : 0.12;
    if (wet > 0) {
      const cv = conv(c, !indoor);
      const wg = c.createGain();
      wg.gain.value = wet;
      g.connect(cv).connect(wg).connect(out);
      setTimeout(() => (cv.disconnect(), wg.disconnect()), 4000);
    }
    src.start();
    src.onended = () => setTimeout(() => (lp.disconnect(), g.disconnect()), 2500);
    return;
  }
  const o = bus(c, dist, indoor, k === 'pistol' ? 5 : 9);
  const P = {
    pistol: { crack: 2600, v: 0.55, body: 160, d: 0.12 },
    rifle: { crack: 2000, v: 0.75, body: 120, d: 0.2 },
    sniper: { crack: 1500, v: 1, body: 80, d: 0.45 },
    mg: { crack: 1800, v: 0.7, body: 110, d: 0.16 },
    shotgun: { crack: 900, v: 0.9, body: 90, d: 0.3 },
    at: { crack: 500, v: 1, body: 50, d: 0.9 },
  }[k];
  const v = P.v * rnd(0.85, 1.15) * 1.5; // v22.8 louder fallback, with a little variation
  const r = rnd(0.92, 1.08);
  burst(c, o, { type: 'bandpass', hz: P.crack * r, q: 0.6 }, { d: P.d * 0.5, v });
  burst(c, o, { type: 'lowpass', hz: 900 * r }, { d: P.d * 1.6, v: v * 0.8 });
  tone(c, o, 'sine', P.body * 1.8 * r, P.body * 0.5, { d: P.d, v: v * 0.9 });
  if (dist > 40) burst(c, o, { type: 'lowpass', hz: 300 }, { at: 0.08, d: 0.6, v: 0.25 }); // rolling report
}

// ---------- v22.9 artillery: incoming whistle + recorded CC0 blast (public/sfx/boom, see CREDITS.md) ----------
const boomBuf: AudioBuffer[] = [];
let boomLoad: 'idle' | 'loading' | 'ok' | 'fail' = 'idle';
export const boomSamples = () => ({ state: boomLoad, n: boomBuf.length });
export function loadBoomSamples() {
  const c = ctx();
  if (!c || boomLoad !== 'idle') return;
  boomLoad = 'loading';
  const base = (import.meta as any).env?.BASE_URL ?? '/';
  Promise.all(
    ['boom1', 'boom2', 'boom3'].map(f =>
      fetch(`${base}sfx/boom/${f}.mp3`)
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then(ab => new Promise<AudioBuffer>((ok, no) => c.decodeAudioData(ab, ok, no)))
        .then(b => void boomBuf.push(b))
        .catch(() => {}),
    ),
  ).then(() => (boomLoad = boomBuf.length ? 'ok' : 'fail'));
}
/** falling-shell whistle: a descending, slightly wavering tone that ends at impact (dur s) */
export function whistle(dist = 0, dur = 1.6) {
  const c = ctx();
  if (!c || dist > 200) return;
  cnt('shell_whistle');
  const out = gunMaster(c);
  const g = c.createGain();
  const t = c.currentTime,
    v = 0.22 / (1 + dist / 30);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const o = c.createOscillator();
  o.type = 'sine';
  const f0 = rnd(1500, 1800);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.42, t + dur);
  const lfo = c.createOscillator();
  lfo.frequency.value = 7;
  const lg = c.createGain();
  lg.gain.value = 14;
  lfo.connect(lg).connect(o.frequency);
  o.connect(g).connect(out);
  burst(c, g, { type: 'bandpass', hz: 2400, q: 2 }, { a: dur * 0.6, d: dur * 0.4, v: 0.25 });
  o.start(t);
  lfo.start(t);
  o.stop(t + dur);
  lfo.stop(t + dur);
  o.onended = () => (g.disconnect(), lg.disconnect());
}
/** shell / large blast; dist m from the player; indoor muffles it */
export function shellBoom(dist = 0, indoor = false, big = 1) {
  const c = ctx();
  if (!c || dist > 600) return;
  cnt('shell_boom');
  if (boomLoad === 'idle') loadBoomSamples();
  const out = gunMaster(c);
  const g = c.createGain();
  g.gain.value = 2.4 * Math.min(1.3, big) * rnd(0.85, 1) * (1 / (1 + Math.max(0, dist) / 25));
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.max(350, (indoor ? 2500 : 14000) / (1 + dist / 30));
  lp.connect(g);
  g.connect(out);
  const cv = conv(c, !indoor);
  const wg = c.createGain();
  wg.gain.value = indoor ? 0.6 : 0.5;
  g.connect(cv).connect(wg).connect(out);
  // sound travels ~343 m/s: a distant blast arrives late
  const at = c.currentTime + Math.min(1.2, dist / 343);
  if (boomBuf.length) {
    cnt('shell_boomrec');
    const s = c.createBufferSource();
    s.buffer = boomBuf[Math.floor(Math.random() * boomBuf.length)];
    s.playbackRate.value = rnd(0.88, 1.05) / Math.sqrt(Math.max(0.6, big));
    s.connect(lp);
    s.start(at);
  } else {
    burst(c, lp, { type: 'lowpass', hz: 1400 }, { at: at - c.currentTime, d: 0.5, v: 1 });
    burst(c, lp, { type: 'lowpass', hz: 220 }, { at: at - c.currentTime, d: 2.2, v: 1 }, 0.6);
    tone(c, lp, 'sine', 90, 30, { at: at - c.currentTime, d: 1.4, v: 0.9 });
  }
  // debris patter after the main blast
  if (dist < 60) burst(c, lp, { type: 'highpass', hz: 2500 }, { at: at - c.currentTime + 0.5, a: 0.2, d: 1, v: 0.08 });
  setTimeout(() => (lp.disconnect(), g.disconnect(), cv.disconnect(), wg.disconnect()), 6000);
}

export type Surface = 'tile' | 'asphalt' | 'wood' | 'metro';
export function footstep(sf: Surface, dist = 0, heavy = false, run = false) {
  const c = ctx();
  if (!c || dist > 22) return;
  cnt('step_' + sf + (heavy ? '_enemy' : ''));
  const o = bus(c, dist, sf === 'wood' || sf === 'metro', 3);
  const v = (run ? 0.22 : 0.13) * (heavy ? 1.4 : 1);
  if (sf === 'tile') burst(c, o, { type: 'highpass', hz: 2200 }, { d: 0.04, v });
  else if (sf === 'asphalt') burst(c, o, { type: 'bandpass', hz: 700, q: 0.7 }, { d: 0.07, v: v * 0.9 });
  else if (sf === 'wood') {
    tone(c, o, 'triangle', 190, 120, { d: 0.08, v: v * 0.9 });
    burst(c, o, { type: 'bandpass', hz: 1200 }, { d: 0.03, v: v * 0.5 });
  } else {
    burst(c, o, { type: 'bandpass', hz: 3200, q: 6 }, { d: 0.12, v: v * 0.8 }); // metal plate ring
    burst(c, o, { type: 'highpass', hz: 1800 }, { d: 0.04, v: v * 0.6 });
  }
  if (heavy) tone(c, o, 'sine', 90, 60, { d: 0.06, v: v * 0.6 }); // boots + kit
}
/** non-voice: a body thud with a sharp exhale of air */
/** v22.10 procedural melee swish (band-passed noise sweep) and a dull impact (synthesised, no samples) */
export function swish(dist = 0, heavy = false) {
  const c = ctx();
  if (!c) return;
  cnt('swish');
  const o = bus(c, dist, false, 4);
  const sr = c.createBufferSource();
  sr.buffer = noise(c);
  const bq = c.createBiquadFilter();
  bq.type = 'bandpass';
  bq.Q.value = 2.2;
  const t = c.currentTime;
  bq.frequency.setValueAtTime(heavy ? 500 : 900, t);
  bq.frequency.exponentialRampToValueAtTime(heavy ? 1500 : 3200, t + 0.12);
  const g = c.createGain();
  sr.connect(bq).connect(g).connect(o);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(heavy ? 0.4 : 0.3, t + 0.07);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  sr.start(t, Math.random());
  sr.stop(t + 0.25);
}
/** v22.11 PLA radio callout: squelch burst + two short beeps (audible tell for flanks / searches / grenades) */
export function radio(dist = 0) {
  const c = ctx();
  if (!c) return;
  cnt('radio');
  const o = bus(c, dist, false, 6);
  burst(c, o, { type: 'bandpass', hz: 2400, q: 1.2 }, { d: 0.12, v: 0.25 });
  tone(c, o, 'square', 1250, 1250, { at: 0.14, d: 0.06, v: 0.12 });
  tone(c, o, 'square', 1550, 1550, { at: 0.24, d: 0.06, v: 0.12 });
  burst(c, o, { type: 'bandpass', hz: 1800, q: 0.9 }, { at: 0.34, d: 0.5, v: 0.08 });
}
/** grenade fuse tick / clink on landing */
export function clink(dist = 0) {
  const c = ctx();
  if (!c) return;
  cnt('clink');
  const o = bus(c, dist, false, 5);
  tone(c, o, 'triangle', 2600, 1900, { d: 0.07, v: 0.25 });
  tone(c, o, 'triangle', 2300, 1700, { at: 0.12, d: 0.05, v: 0.15 });
}
export function meleeHit(dist = 0, blunt = false) {
  const c = ctx();
  if (!c) return;
  cnt('meleeHit');
  const o = bus(c, dist, false, 4);
  tone(c, o, 'sine', blunt ? 140 : 210, 60, { d: 0.12, v: 0.7 });
  burst(c, o, { type: 'lowpass', hz: blunt ? 900 : 2200 }, { d: 0.09, v: 0.45 });
}
export function hurt(dist = 0) {
  const c = ctx();
  if (!c) return;
  cnt('hurt');
  const o = bus(c, dist, false, 4);
  tone(c, o, 'sine', 120, 55, { d: 0.18, v: 0.6 });
  burst(c, o, { type: 'bandpass', hz: 1100, q: 1.5 }, { a: 0.01, d: 0.22, v: 0.18 });
}
export function death(dist = 0) {
  const c = ctx();
  if (!c) return;
  cnt('death');
  const o = bus(c, dist, false, 5);
  tone(c, o, 'sine', 100, 40, { d: 0.35, v: 0.7 });
  burst(c, o, { type: 'lowpass', hz: 400 }, { at: 0.22, d: 0.3, v: 0.5 }); // falls
  burst(c, o, { type: 'bandpass', hz: 2500, q: 3 }, { at: 0.3, d: 0.1, v: 0.12 }); // kit clatters
}
/** v23.2.1 air-raid *test* (alert kind 'test'): a short, quiet three-note chime, clearly not the 萬安 siren.
 *  ~1.6 s, synthesized (no assets); muffled indoors. */
export function alertTest(indoor = false) {
  const c = ctx();
  if (!c) return;
  cnt('alertTest');
  const o = bus(c, indoor ? 30 : 8, indoor, 6);
  [880, 660, 880].forEach((hz, i) => tone(c, o, 'sine', hz, hz, { at: i * 0.45, a: 0.02, d: 0.4, v: 0.22 }));
}
/** rummaging through a container: a few rustles, knocks and clinks */
export function rummage() {
  const c = ctx();
  if (!c) return;
  cnt('rummage');
  const o = bus(c, 0, true, 3);
  for (let i = 0; i < 6; i++) {
    const at = i * 0.12 + Math.random() * 0.08;
    if (Math.random() < 0.6)
      burst(c, o, { type: 'bandpass', hz: 2500 + Math.random() * 3000, q: 1 }, { at, d: 0.07, v: 0.12 });
    else if (Math.random() < 0.5) tone(c, o, 'triangle', 220 + Math.random() * 120, 150, { at, d: 0.06, v: 0.12 });
    else tone(c, o, 'sine', 2400 + Math.random() * 1500, 2300, { at, d: 0.09, v: 0.05 });
  }
}

// ---------- continuous beds + random street events ----------
let rainG: GainNode | null = null;
let rainLP: BiquadFilterNode | null = null;
let homeG: GainNode | null = null;
function rainBed(c: AudioContext) {
  if (rainG) return;
  const s = c.createBufferSource();
  s.buffer = noise(c);
  s.loop = true;
  rainLP = c.createBiquadFilter();
  rainLP.type = 'lowpass';
  rainLP.frequency.value = 5000;
  rainG = c.createGain();
  rainG.gain.value = 0;
  s.connect(rainLP).connect(rainG).connect(c.destination);
  s.start();
}
function homeBed(c: AudioContext) {
  if (homeG) return;
  // a low room tone (fridge / fan hum)
  const o = c.createOscillator();
  o.frequency.value = 58;
  const s = c.createBufferSource();
  s.buffer = noise(c);
  s.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 350;
  bp.Q.value = 2;
  homeG = c.createGain();
  homeG.gain.value = 0;
  const og = c.createGain();
  og.gain.value = 0.15;
  o.connect(og).connect(homeG);
  s.connect(bp).connect(homeG);
  homeG.connect(c.destination);
  o.start();
  s.start();
}
export type AmbState = {
  rain: number;
  indoor: boolean;
  home: boolean;
  night: boolean;
  metro: boolean;
  combat: boolean;
};
let next = 4;
let homeNext = 3;
export function ambience(dt: number, st: AmbState) {
  const c = ctx(true);
  if (!c || c.state !== 'running') return;
  rainBed(c);
  homeBed(c);
  const rv = st.metro ? 0 : st.rain * (st.indoor ? 0.12 : 0.35);
  rainG!.gain.setTargetAtTime(rv, c.currentTime, 0.5);
  rainLP!.frequency.setTargetAtTime(st.indoor ? 900 : 5000, c.currentTime, 0.3);
  homeG!.gain.setTargetAtTime(st.home ? 0.05 : 0, c.currentTime, 0.6);
  if (st.home && (homeNext -= dt) <= 0) {
    homeNext = 4 + Math.random() * 7;
    shelterLife(c);
  }
  if ((next -= dt) > 0 || st.metro) return;
  next = 6 + Math.random() * 12;
  const r = Math.random();
  const far = st.indoor ? 0.4 : 1;
  if (r < 0.22) explosion(c, far);
  else if (r < 0.4 && !st.night) broadcast(c, far);
  else if (r < 0.6) dog(c, far);
  else if (r < 0.8 && !st.night) scooter(c, far);
  else explosion(c, far * 0.5);
}
function ambOut(c: AudioContext, v: number) {
  const g = c.createGain();
  g.gain.value = v;
  g.connect(c.destination);
  setTimeout(() => g.disconnect(), 9000);
  return g;
}
function explosion(c: AudioContext, v: number) {
  cnt('amb_explosion');
  const o = ambOut(c, 0.5 * v);
  burst(c, o, { type: 'lowpass', hz: 160 }, { a: 0.02, d: 2.4, v: 1 }, 0.5);
  tone(c, o, 'sine', 50, 28, { a: 0.02, d: 1.6, v: 0.8 });
}
/** a loudspeaker truck far down the street: a chime, then a muffled formant drone (no words) */
function broadcast(c: AudioContext, v: number) {
  cnt('amb_broadcast');
  const o = ambOut(c, 0.12 * v);
  const lp = c.createBiquadFilter();
  lp.type = 'bandpass';
  lp.frequency.value = 1100;
  lp.Q.value = 1.2;
  lp.connect(o);
  [784, 659, 523].forEach((f, i) => tone(c, lp, 'sine', f, f, { at: i * 0.35, d: 0.5, v: 0.6 }));
  const sq = c.createOscillator();
  sq.type = 'sawtooth';
  const lfo = c.createOscillator();
  lfo.frequency.value = 4.5;
  const lg = c.createGain();
  lg.gain.value = 40;
  lfo.connect(lg).connect(sq.frequency);
  sq.frequency.value = 170;
  const am = c.createGain();
  am.gain.value = 0;
  const t = c.currentTime + 1.2;
  for (let i = 0; i < 14; i++) am.gain.setValueAtTime(Math.random() < 0.7 ? 0.5 : 0.05, t + i * 0.22);
  am.gain.setValueAtTime(0, t + 3.2);
  sq.connect(am).connect(lp);
  sq.start(t);
  lfo.start(t);
  sq.stop(t + 3.3);
  lfo.stop(t + 3.3);
}
function dog(c: AudioContext, v: number) {
  cnt('amb_dog');
  const o = ambOut(c, 0.18 * v);
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    tone(c, o, 'sawtooth', 520, 300, { at: i * 0.32, d: 0.12, v: 0.4 });
    burst(c, o, { type: 'bandpass', hz: 900, q: 3 }, { at: i * 0.32, d: 0.1, v: 0.3 });
  }
}
function scooter(c: AudioContext, v: number) {
  cnt('amb_scooter');
  const o = ambOut(c, 0.1 * v);
  const s = c.createOscillator();
  s.type = 'sawtooth';
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  s.connect(lp).connect(g).connect(o);
  const t = c.currentTime;
  s.frequency.setValueAtTime(95, t);
  s.frequency.linearRampToValueAtTime(130, t + 1.6); // approaching (doppler up)
  s.frequency.linearRampToValueAtTime(80, t + 3.4);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.6, t + 1.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
  s.start(t);
  s.stop(t + 3.6);
}
/** the shelter: a cup set down, a pot lid, a clock, a chair creak */
function shelterLife(c: AudioContext) {
  cnt('amb_shelter');
  const o = ambOut(c, 0.25);
  const r = Math.random();
  if (r < 0.3) tone(c, o, 'sine', 3100, 3000, { d: 0.25, v: 0.15 });
  else if (r < 0.55)
    for (let i = 0; i < 4; i++) burst(c, o, { type: 'highpass', hz: 4000 }, { at: i, d: 0.015, v: 0.15 });
  else if (r < 0.8) tone(c, o, 'triangle', 240, 180, { a: 0.05, d: 0.4, v: 0.15 });
  else {
    tone(c, o, 'triangle', 900, 880, { d: 0.5, v: 0.12 });
    tone(c, o, 'triangle', 1210, 1190, { d: 0.4, v: 0.06 });
  }
}

// ---- v24.7 the sounds of a Taipei evening (all synthesised; the melody is Beethoven's public-domain 《給愛麗絲》) ----
/** 垃圾車: Taipei's garbage trucks play 《給愛麗絲》 through a loudspeaker every evening — a thin square-ish tone,
 * band-limited like a horn speaker, at a distance `dist` m (louder as it comes closer). One phrase per call. */
const ELISE: [number, number][] = [
  [659.25, 1],
  [622.25, 1],
  [659.25, 1],
  [622.25, 1],
  [659.25, 1],
  [493.88, 1],
  [587.33, 1],
  [523.25, 1],
  [440, 2],
  [261.63, 1],
  [329.63, 1],
  [440, 1],
  [493.88, 2],
  [329.63, 1],
  [415.3, 1],
  [493.88, 1],
  [523.25, 2],
  [329.63, 1],
  [659.25, 1],
  [622.25, 1],
  [659.25, 1],
  [622.25, 1],
  [659.25, 1],
  [493.88, 1],
  [587.33, 1],
  [523.25, 1],
  [440, 2],
];
export function garbageTruck(dist: number, indoor: boolean) {
  const c = ctx(true);
  if (!c || c.state !== 'running' || dist > 220) return 0;
  cnt('garbage_truck');
  const v = Math.max(0.02, 0.16 * (1 - dist / 220)) * (indoor ? 0.45 : 1);
  const o = ambOut(c, v);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1300;
  bp.Q.value = 0.8;
  bp.connect(o);
  const beat = 0.19;
  let t = 0;
  for (const [f, n] of ELISE) {
    tone(c, bp, 'square', f, f, { at: t, a: 0.01, d: beat * n * 0.9, v: 0.5 });
    t += beat * n;
  }
  return t;
}
/** a temple in the evening: a struck bronze bell, the wooden fish (木魚) pulse, a low chanting drone */
export function temple(dist: number) {
  const c = ctx(true);
  if (!c || c.state !== 'running' || dist > 70) return;
  cnt('temple');
  const v = 0.18 * (1 - dist / 70);
  const o = ambOut(c, v);
  // bell: inharmonic partials with a long decay
  for (const [f, a] of [
    [196, 0.6],
    [523, 0.3],
    [851, 0.18],
    [1210, 0.1],
  ] as [number, number][])
    tone(c, o, 'sine', f, f * 0.995, { a: 0.004, d: 4.5, v: a });
  // 木魚: dry knocks
  for (let i = 0; i < 8; i++)
    burst(c, o, { type: 'bandpass', hz: 900, q: 6 }, { at: 1.2 + i * 0.45, a: 0.002, d: 0.08, v: 0.5 });
  // chanting drone (a fifth, slowly swelling)
  for (const f of [110, 165]) tone(c, o, 'triangle', f, f, { at: 0.8, a: 1.5, d: 4.5, v: 0.12 });
}
/** v24.14 a string of firecrackers: a run of sharp cracks over a few seconds, then it stops */
export function firecrackers() {
  const c = ctx(true);
  if (!c || c.state !== 'running') return;
  cnt('firecrackers');
  const o = ambOut(c, 0.5);
  let at = 0.1;
  for (let i = 0; i < 46; i++) {
    at += 0.03 + Math.random() * Math.random() * 0.22;
    burst(
      c,
      o,
      { type: 'highpass', hz: 900 + Math.random() * 1400 },
      { at, a: 0.001, d: 0.05, v: 0.5 + Math.random() * 0.5 },
      0.2,
    );
  }
}
/** thunder rolling across the city during a downpour */
export function thunder(indoor: boolean) {
  const c = ctx(true);
  if (!c || c.state !== 'running') return;
  cnt('thunder');
  const o = ambOut(c, indoor ? 0.25 : 0.45);
  burst(c, o, { type: 'lowpass', hz: 220 }, { a: 0.05, d: 3.2, v: 1 }, 0.35);
  burst(c, o, { type: 'lowpass', hz: 90 }, { at: 0.4, a: 0.3, d: 3.8, v: 0.8 }, 0.25);
}
/** v24.10 a fighter passing low overhead: a tearing roar that sweeps down (doppler), loudest at `dist` m */
export function jetPass(dist: number) {
  const c = ctx(true);
  if (!c || c.state !== 'running' || dist > 400) return;
  cnt('jet');
  const v = 0.5 * Math.max(0.15, 1 - dist / 400);
  const o = ambOut(c, v);
  const s = c.createBufferSource();
  s.buffer = noise(c);
  s.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  const t = c.currentTime;
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.exponentialRampToValueAtTime(3200, t + 1.2);
  lp.frequency.exponentialRampToValueAtTime(260, t + 3.6);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1, t + 1.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
  s.connect(lp).connect(g).connect(o);
  s.start(t);
  s.stop(t + 4.3);
  tone(c, o, 'sawtooth', 220, 90, { a: 0.6, d: 3.2, v: 0.25 });
}
/** v24.10 helicopter rotor: ~5 thumps a second for `dur` s, fading in and out */
export function rotor(dist: number, dur = 1.2) {
  const c = ctx(true);
  if (!c || c.state !== 'running' || dist > 300) return;
  cnt('rotor');
  const v = 0.35 * Math.max(0.1, 1 - dist / 300);
  const o = ambOut(c, v);
  for (let i = 0; i < Math.round(dur * 5.2); i++)
    burst(c, o, { type: 'lowpass', hz: 180 }, { at: i / 5.2, a: 0.01, d: 0.12, v: 0.9 }, 0.6);
}
