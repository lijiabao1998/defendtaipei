import { tr, getLanguage, initTitleLanguage, showTitleLanguage } from '../i18n';
import { translateLabel } from '../labels';
// Main game module: renderer, world state, the gameplay systems that share it, the main loop and boot.
// Self-contained pieces live in their own files (textures, geom, world, portrait, pla-loot, joystick) and so do
// the bigger systems (armor, drive, roads, traffic, roc, fpv, map, interiors, decay, alley, ...).
// Sections, in order (search for "// ----------"):
//   utils · renderer · world state (collision grid, line of sight) · sectors · build map · FPV + recon drones ·
//   國軍 support · PLA armour · street lamps · characters · player role / vehicles / road tiles / traffic ·
//   multiplayer glue · weather · airdrop · 聯絡人 informant · curfew flashlights · time system, noise, log ·
//   effects · input · inventory UI · combat · save · story timeline · main loop + HUD · prologue · boot
// Test/debug hooks are exposed on window.__game at the end of boot().
import { buildEvacZone, playEvac, cine } from '../story/events/evac';
import * as THREE from 'three';
import { buildFacade } from '../map/facade';
import { buildParks } from '../map/park';
import { ArmorSystem, type ArmorKind } from '../systems/armor';
import { Recon, boom, setBoomFx } from '../systems/drone';
import { BlastFX } from '../systems/blastfx';
import { SPEC, DriveSystem, type DKind } from '../systems/drive';
import { ROLES, roleById, type Role } from '../player/roles';
import type { FPV } from '../systems/fpv';
import type { GameMap } from '../map/map';
import { RocSystem, ROC_NAME, type RocKind } from '../npc/roc';
import { placeRooftop, dressRoof, pickRoofMat, setShackNight, roofClass, roofStats } from '../map/rooftin';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeLampBatches } from './lamps';
import { ITEMS, LOOT } from '../systems/items';
import { iconURL, iconMat } from '../ui/icons';
import { GF, FH, ARC, arcadeFits, buildArcade, flushArcades, setArcadeDeps, arcadeAudit } from '../map/arcade';
import { makeRig, animate, setWeapon, setLodFocus, Rig, AnimState, startMelee, meleeQ, hitStop } from '../npc/human';
import { SwingTrail } from '../systems/trail';
import * as SQ from '../npc/squadai';
import * as CL from '../map/clutter';
import * as BC from '../story/broadcasts/broadcast';
import { Nav, smooth } from '../systems/nav';
import { RoadTiles } from '../map/roads';
import { Traffic } from '../systems/traffic';
import { rolePortrait } from '../ui/portrait';
import { type V2, type Seg, type Door, type Bld, type Cont, ROADW } from './world';
import { clamp, pip, area, segInter, segX } from './geom';
import {
  canvasTex,
  wallMats,
  wallMatsT,
  tinMat,
  tankMat,
  floorMat,
  roadTex,
  groundTex,
  roadMat,
  groundMat,
  signTex,
  b2sign,
  extraSign,
  shopSignTex,
  contMat,
} from '../map/textures';
import { plaDrop } from '../systems/pla-loot';
import { joy, initJoystick } from '../player/joystick';
import {
  buildMetro,
  ensureInterior,
  metroTick,
  metroStats,
  svc,
  stationOrigin,
  pryLoot,
  setPried,
  type Shop,
  type Station,
} from '../map/metro';
import * as SV from '../systems/survival';
import { clearSave, hasSave, readSave, writeSave, setMultiplayerSession } from '../systems/save';
import { VehicleSystem, VehicleKind } from '../systems/vehicles';
import { furnish, nightMarket, setPower } from '../map/interiors';
import { buildDecay } from '../map/decay';
import { buildAlley } from '../map/alley';
import { updateOcclusion, OCC } from '../map/occlusion';
import { lotTex } from '../map/paving';
import { walkH } from '../map/roads';
import { dressWalkup, District, type TileInfo } from '../map/district';
import { buildDoorDeco, DoorView, doorSound, isHomeDoor, type LiveDoor } from '../map/doors';
import { SniperSys, findPosts, sniperActive, type Sniper } from '../systems/sniper';
import { Scope, SCOPED, ballistic } from '../systems/scope';
import * as AU from '../audio/audio';
import { SET, QPIX, isKey, K, keyLabel, markMusic, vibrate, applyBtnSize } from '../ui/settings';
import { ctxLabel, ctxHint } from '../player/touchctl';
import {
  openPanel,
  openSettings,
  openHelp,
  openAbout,
  modalOpen,
  closeModal,
  histPush,
  histPop,
  setBackHandler,
} from '../ui/menu';
import { VERSION } from './version';
import { emit, on } from './bus';
import { createStoryRunner } from '../story';
import { MPQ, MP_ON } from '../debug/flags';
import { PRO_NEWS } from '../story/broadcasts/prologue';

initTitleLanguage();

// ---------- utils ----------
let seed = 20261024;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const $ = (id: string) => document.getElementById(id)!;

// ---------- renderer ----------
// Low is a real rendering budget, not a simulation shortcut. Medium/high retain the previous appearance.
const renderer = new THREE.WebGLRenderer({ antialias: SET.quality !== 'low', powerPreference: 'high-performance' });
const MOBILE =
  matchMedia('(pointer: coarse)').matches ||
  'ontouchstart' in window ||
  navigator.maxTouchPoints > 0 ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
if (MOBILE) document.body.classList.add('mobile');
{
  // v21.5.1 portrait layout flag (title screen + HUD), follows rotation / resize
  const pq = matchMedia('(orientation: portrait)');
  const pu = () => document.body.classList.toggle('portrait', MOBILE && pq.matches);
  pu();
  addEventListener('resize', pu);
  pq.addEventListener?.('change', pu);
}
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? Math.min(1.25, QPIX[SET.quality]) : QPIX[SET.quality]));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = SET.quality !== 'low';
renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9aa4ac, 60, 160);
let zoom = 1;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
function resize() {
  const a = innerWidth / innerHeight,
    s = (MOBILE && a < 1 ? Math.max(22, 16 / a) * 0.62 : 22) / zoom;
  camera.left = -s * a;
  camera.right = s * a;
  camera.top = s;
  camera.bottom = -s;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();
const CAM_OFF = new THREE.Vector3(40, 56, 40);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a4030, 0.9);
scene.add(hemi);
// Short-range visual adaptation, not a gameplay flashlight: nearby geometry remains
// readable at night without revealing distant streets or changing enemy detection.
const nightAdapt = new THREE.PointLight(0xb8c8df, 0, 6, 2);
scene.add(nightAdapt);
const sun = new THREE.DirectionalLight(0xffe8c0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
sun.shadow.bias = -0.0002;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const flash = new THREE.SpotLight(0xfff2cc, 0, 26, 0.5, 0.5, 1.2);
scene.add(flash, flash.target);
// ---------- world state ----------
const blds: Bld[] = [];
const segs: Seg[] = [];
const conts: Cont[] = [];
const doors: Door[] = [];
const roads: { p: V2[]; t: string; n: string }[] = [];
const CELL = 8;
const grid = new Map<string, Seg[]>();
const gk = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
let nav: Nav | null = null;
// v21: hand-built core = the original 1.1 × 1.0 km bbox (西門町–龍山寺); the rest of 萬華區 streams via district.ts
const CORE = { minx: -555, maxx: 555, minz: -497, maxz: 497 };
const inCore = (x: number, z: number) => x > CORE.minx && x < CORE.maxx && z > CORE.minz && z < CORE.maxz;
const district = new District({
  scene,
  base: import.meta.env.BASE_URL,
  addSeg: s => addSeg(s as Seg),
  removeSeg: s => removeSeg(s as Seg),
  inCore,
  onLoad: t => onTileLoad(t),
  onUnload: k => onTileUnload(k),
});
function roadDist(x: number, z: number) {
  let best = 1e9;
  if (district?.ix && (x < CORE.minx + 40 || x > CORE.maxx - 40 || z < CORE.minz + 40 || z > CORE.maxz - 40))
    best = district.roadDist(x, z);
  for (const r of roads) {
    const hw = (ROADW[r.t.replace('_link', '')] ?? 3) / 2;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const dx = bx - ax,
        dz = bz - az,
        l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z) - hw;
      if (d < best) best = d;
    }
  }
  return best;
}
function addSeg(s: Seg, low = false) {
  if (low) s.low = true;
  if (low && s.h == null) s.h = 1.0; // sandbags / jersey barriers / hedges: chest-high cover
  segs.push(s);
  nav?.markSeg(s.a, s.b, 1);
  const x0 = Math.min(s.a[0], s.b[0]),
    x1 = Math.max(s.a[0], s.b[0]),
    z0 = Math.min(s.a[1], s.b[1]),
    z1 = Math.max(s.a[1], s.b[1]);
  for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++)
    for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
      const k = x + ',' + z;
      (grid.get(k) || grid.set(k, []).get(k)!).push(s);
    }
}
function removeSeg(s: Seg) {
  nav?.markSeg(s.a, s.b, -1);
  const x0 = Math.min(s.a[0], s.b[0]),
    x1 = Math.max(s.a[0], s.b[0]),
    z0 = Math.min(s.a[1], s.b[1]),
    z1 = Math.max(s.a[1], s.b[1]);
  for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++)
    for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
      const a = grid.get(x + ',' + z);
      const i = a ? a.indexOf(s) : -1;
      if (i >= 0) a!.splice(i, 1);
    }
  const j = segs.indexOf(s);
  if (j >= 0) segs.splice(j, 1);
}
function nearSegs(x: number, z: number) {
  const out = new Set<Seg>();
  const cx = Math.floor(x / CELL),
    cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      const a = grid.get(cx + i + ',' + (cz + j));
      if (a) a.forEach(s => out.add(s));
    }
  return out;
}
function los(p: V2, q: V2) {
  const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const n = Math.ceil(d / (CELL * 0.5)) + 1;
  const seen = new Set<Seg>();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = grid.get(gk(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t));
    if (!a) continue;
    for (const s of a) {
      if (seen.has(s)) continue;
      seen.add(s);
      if (segInter(p, q, s.a, s.b)) return false;
    }
  }
  return true;
}
// ---------- v21.4 cover shooting ----------
// Bullets are a 2-D ray against the wall/cover segments with a height: walls (h undefined) always stop it, cover
// (cars 1.45 m, sandbags / barriers / hedges 1 m, trunks) only where the ray passes below its top. Cover within `own`
// metres of the shooter is ignored (you fire over / lean around your own cover). Returns the clear fraction (1 = hit).
function shotRay(p: V2, q: V2, ys: number, yt: number, own = 1.0) {
  const dx = q[0] - p[0],
    dz = q[1] - p[1];
  const d = Math.hypot(dx, dz) || 1;
  const n = Math.ceil(d / (CELL * 0.5)) + 1;
  const seen = new Set<Seg>();
  let best = 1;
  for (let i = 0; i <= n; i++) {
    const a = grid.get(gk(p[0] + dx * (i / n), p[1] + dz * (i / n)));
    if (!a) continue;
    for (const s of a) {
      if (seen.has(s)) continue;
      seen.add(s);
      const ex = s.b[0] - s.a[0],
        ez = s.b[1] - s.a[1];
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((s.a[0] - p[0]) * ez - (s.a[1] - p[1]) * ex) / den,
        u = ((s.a[0] - p[0]) * dz - (s.a[1] - p[1]) * dx) / den;
      if (t < 0 || t > best || u < 0 || u > 1 || t * d < own) continue;
      if (s.h != null && ys + (yt - ys) * t > s.h) continue;
      best = t;
    }
  }
  return best;
}
/** aim-point height of the player: crouched behind low cover → 0.75 m (pops up to 1.25 m while firing) */
const coverStats = { enemyShots: 0, blocked: 0 };
/** cover spot for a soldier: just behind (relative to the target) the nearest cover segment within 8 m */
function solCover(s: { pos: THREE.Vector3 }, tg: V2): V2 | null {
  let best: V2 | null = null,
    bd = 8;
  const dT = Math.hypot(tg[0] - s.pos.x, tg[1] - s.pos.z);
  for (const g of nearSegs(s.pos.x, s.pos.z)) {
    if (g.door || g.h == null) continue;
    const mx = (g.a[0] + g.b[0]) / 2,
      mz = (g.a[1] + g.b[1]) / 2;
    const tx = mx - tg[0],
      tz = mz - tg[1],
      tl = Math.hypot(tx, tz) || 1;
    if (tl > dT || tl < 4) continue;
    const c: V2 = [mx + (tx / tl) * 0.7, mz + (tz / tl) * 0.7];
    const d = Math.hypot(c[0] - s.pos.x, c[1] - s.pos.z);
    if (d < bd && !bldAt(c[0], c[1]) && los([s.pos.x, s.pos.z], c)) ((best = c), (bd = d));
  }
  return best;
}
const playerAimH = () => (player.cover?.low && player.cd <= 0.05 ? 0.75 : player.sneak ? 0.9 : 1.25);
/** nearest cover segment within r of (x, z): low (h ≤ 1.6, crouch) or tall (lean-peek) */
function findCover(x: number, z: number, r = 1.4) {
  let best: { s: Seg; d: number } | null = null;
  for (const s of nearSegs(x, z)) {
    if (s.door) continue;
    const ex = s.b[0] - s.a[0],
      ez = s.b[1] - s.a[1];
    const t = clamp(((x - s.a[0]) * ex + (z - s.a[1]) * ez) / (ex * ex + ez * ez || 1), 0, 1);
    const d = Math.hypot(s.a[0] + ex * t - x, s.a[1] + ez * t - z);
    if (d < r && (!best || d < best.d)) best = { s, d };
  }
  return best && { low: (best.s.h ?? 99) <= 1.6, x, z, seg: best.s };
}
/** nearest live soldier in sight within r m */
function nearestFoe(r: number) {
  let best: Sol | null = null,
    bd = r;
  for (const s of sols) {
    if (s.state === 'dead' || !s.mesh.visible) continue;
    const d = Math.hypot(s.pos.x - player.pos.x, s.pos.z - player.pos.z);
    if (d < bd && los([player.pos.x, player.pos.z], [s.pos.x, s.pos.z])) ((best = s), (bd = d));
  }
  return best;
}
/** v22.7 mobile portrait: one big context button (打 / 搜 / 開門 / 爬上 / 上車… / 瞄) + one 蹲 toggle (cover ⇄ sneak,
 * long-press = 撤退); weapon swap by tapping the weapon label; map next to ☰; inventory / shelter / map in ☰ */
const PB = {
  act: null as HTMLButtonElement | null,
  sec: null as HTMLButtonElement | null,
  hint: null as HTMLElement | null,
};
let pbScope: { x: number; y: number } | null = null;
function cycleWeapon() {
  const ws = Object.keys(player.inv).filter(k => ITEMS[k] && (ITEMS[k].kind === 'melee' || ITEMS[k].kind === 'gun'));
  const list = ['', ...ws];
  const nx = list[(list.indexOf(player.equip || '') + 1) % list.length];
  if (scope.on) scopeExit();
  player.equip = nx;
  syncHeldWeapon();
  log(
    nx
      ? getLanguage() === 'en'
        ? `Equipped ${ITEMS[nx].name}`
        : `裝備了 ${ITEMS[nx].name}`
      : tr('收起武器', 'Weapon holstered'),
  );
  vibrate(10);
}
function secTap() {
  if (scope.on) return scopeExit();
  if (player.cover) return toggleCover();
  if (findCover(player.pos.x, player.pos.z)) {
    player.sneak = false;
    return toggleCover();
  }
  player.sneak = !player.sneak;
  log(player.sneak ? tr('蹲低潛行', 'Crouching and sneaking') : tr('起身', 'Standing up'));
}
/** refreshed from drawHud: label + colour of the two buttons */
function updatePortraitButtons(prompt: string) {
  if (!PB.act) return;
  const ctx = ctxLabel(prompt, keyLabel('interact'));
  const sc = !!player.equip && SCOPED.has(player.equip);
  const l = scope.on ? tr('射', 'Fire') : (ctx ?? (sc ? tr('瞄', 'Aim') : tr('打', 'Hit')));
  const mode = scope.on ? 'fire' : ctx ? 'ctx' : sc ? 'scope' : 'fire';
  if (PB.act.textContent !== l) PB.act.textContent = l;
  PB.act.dataset.mode = mode;
  PB.act.classList.toggle('long', l.length > 1);
  const hint = scope.on
    ? tr('拖曳瞄準・放開射擊', 'Drag to aim · Release to fire')
    : ctx
      ? ctxHint(prompt, keyLabel('interact')).replace(/[（(].*$/, '') +
        tr('・點按互動／長按 0.38 秒攻擊', ' · Tap to interact / hold 0.38s to attack')
      : '';
  if (PB.hint!.textContent !== hint) PB.hint!.textContent = hint;
  PB.hint!.style.display = hint ? '' : 'none';
  const s = scope.on ? '✕' : player.cover ? tr('起', 'Up') : player.sneak ? tr('起', 'Up') : tr('蹲', 'Crouch');
  if (PB.sec!.textContent !== s) PB.sec!.textContent = s;
  PB.sec!.classList.toggle('lit', !!player.cover || player.sneak);
}
function initPortraitButtons() {
  const wrap = document.createElement('div');
  wrap.id = 'pbtns';
  const hint = document.createElement('div');
  hint.id = 'pbhint';
  wrap.appendChild(hint);
  PB.hint = hint;
  const mk = (id: string, title: string) => {
    const b = document.createElement('button');
    b.id = id;
    b.title = title;
    b.className = 'pbtn';
    b.addEventListener('contextmenu', e => e.preventDefault());
    wrap.appendChild(b);
    return b;
  };
  const sec = mk('pbsec', tr('蹲下／掩體（長按：撤退）', 'Crouch / Cover (hold: retreat)'));
  const act = mk('pbact', tr('攻擊／互動（依情境）', 'Attack / Interact (contextual)'));
  PB.act = act;
  PB.sec = sec;
  // ---- context button
  let holdT = 0,
    mode = '',
    acted = false;
  act.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    act.setPointerCapture(e.pointerId);
    act.classList.add('on');
    vibrate(15);
    mode = act.dataset.mode || 'fire';
    acted = false;
    clearTimeout(holdT);
    if (mode === 'ctx') {
      act.classList.add('holding');
      holdT = window.setTimeout(() => {
        act.classList.remove('holding');
        if (panelOpen) return;
        acted = true;
        act.classList.add('hold-ready');
        MB.fire = true;
        vibrate(25);
      }, 380);
    } else if (mode === 'scope') {
      scopeEnter();
      pbScope = { x: e.clientX, y: e.clientY };
    } else if (scope.on) pbScope = { x: e.clientX, y: e.clientY };
    else MB.fire = true;
  });
  act.addEventListener('pointermove', e => {
    if (!pbScope || !scope.on) return;
    scope.look((e.clientX - pbScope.x) * 1.6, (e.clientY - pbScope.y) * 1.6, SET.sens);
    pbScope = { x: e.clientX, y: e.clientY };
  });
  const actEnd = (fire: boolean) => {
    act.classList.remove('on', 'holding', 'hold-ready');
    clearTimeout(holdT);
    if (mode === 'ctx' && !acted && fire && !panelOpen) interact();
    if (pbScope && scope.on && fire) scopeFire();
    pbScope = null;
    MB.fire = false;
  };
  act.addEventListener('pointerup', () => actEnd(true));
  act.addEventListener('pointercancel', () => actEnd(false));
  // ---- 蹲 / 掩: tap toggles cover (when a wall is near) or sneak; long-press = sprint away (撤)
  let secT = 0,
    secLong = false;
  sec.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    sec.setPointerCapture(e.pointerId);
    sec.classList.add('on');
    vibrate(15);
    secLong = false;
    secT = window.setTimeout(() => {
      secLong = true;
      if (player.cover) toggleCover();
      player.sneak = false;
      MB.retreat = 1.6;
      MB.rn++;
      log(tr('撤退！', 'Retreat!'), '#fd9');
      vibrate(30);
    }, 450);
  });
  const secEnd = (ok: boolean) => {
    sec.classList.remove('on');
    clearTimeout(secT);
    if (ok && !secLong) secTap();
  };
  sec.addEventListener('pointerup', () => secEnd(true));
  sec.addEventListener('pointercancel', () => secEnd(false));
  // ---- weapon label: tap to cycle (portrait only; harmless elsewhere)
  $('equip').addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('portrait')) return;
    e.preventDefault();
    e.stopPropagation();
    cycleWeapon();
  });
  // small 🗺 next to ☰
  const mp = document.createElement('button');
  mp.id = 'pmapbtn';
  mp.textContent = '🗺';
  mp.title = tr('地圖', 'Map');
  mp.onclick = () => gmap?.toggle();
  document.body.appendChild(mp);
  document.body.appendChild(wrap);
  // ☰ menu: pause / map / save, reachable on portrait phones
  const mb = document.createElement('button');
  mb.id = 'menubtn';
  mb.textContent = '☰';
  mb.title = tr('選單', 'Menu');
  mb.onclick = () => togglePause();
  document.body.appendChild(mb);
  const upd = () => document.body.classList.toggle('portrait', MOBILE && matchMedia('(orientation: portrait)').matches);
  upd();
  addEventListener('resize', upd);
  matchMedia('(orientation: portrait)').addEventListener?.('change', upd);
}
function toggleCover() {
  if (player.cover) {
    player.cover = null;
    log(tr('離開掩體', 'Left cover'));
  } else {
    const c = findCover(player.pos.x, player.pos.z);
    if (!c) return log(tr('附近沒有掩體', 'No cover nearby'));
    player.cover = c;
    log(
      c.low
        ? tr('進入掩體：蹲低（開火時探身）', 'In cover: crouched (peek out to fire)')
        : tr('進入掩體：貼牆側身射擊', 'In cover: lean out from the wall to fire'),
      '#9cf',
    );
  }
  updateCoverUI();
}
function updateCoverUI() {
  let el = document.getElementById('coverind');
  if (!el) {
    el = document.createElement('div');
    el.id = 'coverind';
    document.body.appendChild(el);
  }
  el.textContent = player.cover
    ? player.cover.low
      ? tr('🛡 掩體・蹲低', '🛡 Cover · Crouched')
      : tr('🛡 掩體・側身', '🛡 Cover · Leaning')
    : '';
  el.style.display = player.cover ? 'block' : 'none';
}
function collide(pos: THREE.Vector3, r: number) {
  for (let it = 0; it < 2; it++)
    for (const s of nearSegs(pos.x, pos.z)) {
      const ax = s.a[0],
        az = s.a[1],
        bx = s.b[0],
        bz = s.b[1];
      const dx = bx - ax,
        dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((pos.x - ax) * dx + (pos.z - az) * dz) / l2, 0, 1);
      const cx = ax + dx * t,
        cz = az + dz * t;
      const ox = pos.x - cx,
        oz = pos.z - cz;
      const d = Math.hypot(ox, oz);
      if (d < r && d > 1e-6) {
        pos.x = cx + (ox / d) * r;
        pos.z = cz + (oz / d) * r;
      }
    }
  pos.x = clamp(pos.x, WORLD.minx, WORLD.maxx);
  pos.z = clamp(pos.z, WORLD.minz, WORLD.maxz);
}

// ---- v21.2 spawn reachability: grid BFS (0.25 m) honouring walls (los + 0.35 m player radius) until a road is reached ----
function walkable(x: number, z: number) {
  const q = new THREE.Vector3(x, 0, z);
  collide(q, 0.35);
  return Math.hypot(q.x - x, q.z - z) < 0.03;
}
function escapeCheck(px: number, pz: number, R = 70) {
  const S = 0.25,
    N = Math.ceil(R / S);
  const seen = new Set<number>();
  const key = (i: number, j: number) => (i + N) * 8192 + (j + N);
  const qu: [number, number, number][] = [[0, 0, 0]];
  seen.add(key(0, 0));
  let n = 0;
  let qh = 0;
  while (qh < qu.length && n < 400000) {
    const [i, j, d] = qu[qh++];
    n++;
    const x = px + i * S,
      z = pz + j * S;
    if (d > 12 && !bldAt(x, z) && roadDist(x, z) < 2.5) return { ok: true, dist: d * S, x, z };
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di,
        b = j + dj;
      if (Math.abs(a) > N || Math.abs(b) > N || seen.has(key(a, b))) continue;
      const nx = px + a * S,
        nz = pz + b * S;
      if (!los([x, z], [nx, nz]) || !walkable(nx, nz)) continue;
      seen.add(key(a, b));
      qu.push([a, b, d + 1]);
    }
  }
  return { ok: false, dist: -1, x: px, z: pz };
}
/** v22.4.1 the BFS route (waypoints every ~1 m) from a point to the street, for the walk-out test autopilot */
function escapePath(px: number, pz: number, R = 70): V2[] | null {
  const S = 0.25,
    N = Math.ceil(R / S);
  const key = (i: number, j: number) => (i + N) * 8192 + (j + N);
  const par = new Map<number, number>([[key(0, 0), -1]]);
  const qu: [number, number, number][] = [[0, 0, 0]];
  let qh = 0;
  while (qh < qu.length && qh < 400000) {
    const [i, j, d] = qu[qh++];
    const x = px + i * S,
      z = pz + j * S;
    if (d > 12 && !bldAt(x, z) && roadDist(x, z) < 2.5) {
      const out: V2[] = [];
      for (let k = key(i, j); k !== -1; k = par.get(k)!) {
        const a = Math.floor(k / 8192) - N,
          b = (k % 8192) - N;
        out.push([px + a * S, pz + b * S]);
      }
      return out.reverse();
    }
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di,
        b = j + dj,
        k = key(a, b);
      if (Math.abs(a) > N || Math.abs(b) > N || par.has(k)) continue;
      const nx = px + a * S,
        nz = pz + b * S;
      if (!los([x, z], [nx, nz]) || !walkable(nx, nz)) continue;
      par.set(k, key(i, j));
      qu.push([a, b, d + 1]);
    }
  }
  return null;
}
/** test autopilot: steers the normal movement input (real collision, no teleport) along waypoints */
const AUTO: { path: V2[]; i: number } = { path: [], i: 0 };
/** fallback: if the player cannot reach a street, nudge to the nearest point that can (rings out to 25 m) */
let nudges = 0;
function unstuck() {
  const P = player.pos;
  if (escapeCheck(P.x, P.z).ok) return false;
  for (let r = 0.5; r <= 25; r += 0.5)
    for (let k = 0; k < Math.max(8, r * 6); k++) {
      const t = (k / Math.max(8, r * 6)) * Math.PI * 2;
      const x = P.x + Math.cos(t) * r,
        z = P.z + Math.sin(t) * r;
      if (walkable(x, z) && escapeCheck(x, z, 50).ok) {
        P.set(x, 0, z);
        nudges++;
        return true;
      }
    }
  return false;
}
const bounds = { minx: -500, maxx: 500, minz: -500, maxz: 500 };
/** whole-district clamp (set from the district index; falls back to the core bounds) */
const WORLD = { minx: -500, maxx: 500, minz: -500, maxz: 500 };
const WORLD_B = { ...WORLD };
function bldAt(x: number, z: number) {
  for (const b of blds) if (x > b.minx && x < b.maxx && z > b.minz && z < b.maxz && pip([x, z], b.pts)) return b;
  return null;
}

// ---------- sectors ----------
// v21: named 萬華 areas (nearest anchor). Core areas are liberated by clearing their soldiers; outer areas by
// wiping the garrison at their outpost tile (streamed, saved per tile).
const SECTORS: { n: string; x: number; z: number }[] = [
  { n: tr('西門町', 'Ximending'), x: 330, z: -230 },
  { n: tr('中華路', 'Zhonghua Road'), x: 420, z: 260 },
  { n: tr('康定路', 'Kangding Road'), x: -40, z: 60 },
  { n: tr('龍山寺', 'Longshan Temple'), x: -260, z: 360 },
  { n: tr('貴陽街', 'Guiyang Street'), x: -430, z: -220 },
  { n: tr('華西街', 'Huaxi Street'), x: -480, z: 330 },
  { n: tr('西園路', 'Xiyuan Road'), x: -600, z: 1100 },
  { n: tr('華江', 'Huajiang'), x: -1300, z: 820 },
  { n: tr('東園', 'Dongyuan'), x: -1000, z: 1550 },
  { n: tr('萬大路', 'Wanda Road'), x: -200, z: 1430 },
  { n: tr('南機場', 'Nanjichang'), x: 150, z: 1320 },
  { n: tr('青年公園', 'Youth Park'), x: 300, z: 1990 },
  { n: tr('加蚋仔', 'Kalah'), x: -1000, z: 2120 },
  { n: tr('馬場町', 'Machangding'), x: 420, z: 2350 },
  { n: tr('雙園', 'Shuangyuan'), x: -1300, z: 2560 },
];
const NSEC = SECTORS.length;
const sectorNames = SECTORS.map(s => s.n);
const sectorOf = (x: number, z: number) => {
  let bi = 0,
    bd = 1e18;
  SECTORS.forEach((s, i) => {
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bd) ((bd = d), (bi = i));
  });
  return bi;
};
const SECTOR_LABEL = (i: number) => sectorNames[i] ?? tr('第', 'Sector ') + (i + 1) + tr('區', '');
const outerSector = (i: number) => !inCore(SECTORS[i].x, SECTORS[i].z);

// ---------- build map ----------
function shopType(s: string, n: string) {
  if (/convenience|supermarket/.test(s)) return 'store';
  if (/pharmacy|chemist/.test(s)) return 'pharmacy';
  if (/police/.test(s)) return 'police';
  const r = rnd();
  return r < 0.06 ? 'store' : r < 0.1 ? 'pharmacy' : r < 0.115 ? 'police' : 'home';
}
function setSign(b: Bld, k: string) {
  let tex = signTex[k];
  if (!tex) {
    const [t, bg, fg] = b2sign[k];
    tex =
      extraSign[k] ||
      (extraSign[k] = canvasTex(256, 64, c => {
        c.fillStyle = bg;
        c.fillRect(0, 0, 256, 64);
        c.fillStyle = fg;
        c.font = 'bold 38px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(t, 128, 34);
      }));
  }
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: k === 'betel' ? 1.2 : 0.4,
    side: THREE.DoubleSide,
  });
  if (b.sign) b.sign.material = mat;
  else if (b.door) {
    const d = b.door;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.9), mat);
    const ux = d.c[0] - d.a[0],
      uz = d.c[1] - d.a[1];
    const L = Math.hypot(ux, uz);
    let nx = -uz / L,
      nz = ux / L;
    if (pip([d.p[0] + nx * 0.6, d.p[1] + nz * 0.6], b.pts)) {
      nx = -nx;
      nz = -nz;
    }
    m.position.set(d.p[0] + nx * 0.2, 3.0, d.p[1] + nz * 0.2);
    m.lookAt(d.p[0] + nx * 5, 3.0, d.p[1] + nz * 5);
    b.group.add(m);
    b.sign = m;
  }
}
function dropGun(c: Cont, p: THREE.Vector3, it: Record<string, number>) {
  const g = Object.keys(it).find(k => ITEMS[k].kind === 'gun') || Object.keys(it).find(k => ITEMS[k].mag);
  if (!g) return;
  const L = ITEMS[g].kind === 'gun' ? (g === 'qsz92' ? 0.45 : g === 'qjy88' ? 1.5 : 1.15) : 0.5;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.7, L * 1.7), iconMat(g));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.random() * 6.28;
  m.position.set(p.x + 0.7, 0.04, p.z + 0.3);
  scene.add(m);
  (c as any).gunMesh = m;
}
// ---------- FPV kamikaze drones + PLA recon drones ----------
let fpv: FPV | null = null,
  recon: Recon | null = null;
// v22.9 artillery: realistic radii (old: 7 m linear, ±7 m spread, no telegraph, soldiers unhurt)
const SHELL = { core: 6, wound: 18, spread: 4.5, lead: 6, gap: 1.3, n: 4, coreDmg: 85, woundDmg: 50 };
const shells: { t: number; p: V2; w?: ReturnType<BlastFX['warn']>; wh?: boolean }[] = [];
const blastFx = new BlastFX(scene, SET.quality, {
  wind: () => (raining() ? [2.2, 0.9] : [0.9, 0.35]),
});
setBoomFx((p, big) => {
  const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
  blastFx.explode(p, big);
  blastFx.kick(d, big);
  AU.shellBoom(d, !!bldAt(player.pos.x, player.pos.z), big);
});
/** shell damage factor at distance d: full lethal core, then quadratic falloff to the wounding radius */
function shellDmg(d: number) {
  if (d < SHELL.core) return SHELL.coreDmg * (1 - 0.4 * (d / SHELL.core));
  if (d < SHELL.wound) return SHELL.woundDmg * ((SHELL.wound - d) / (SHELL.wound - SHELL.core)) ** 2;
  return 0;
}
let lastBlast: unknown = null;
function blast(p: THREE.Vector3, fromAbove: boolean) {
  lastBlast = { x: p.x, y: p.y, z: p.z, fromAbove };
  boom(scene, p, 1);
  noise(p.x, p.z, 45);
  for (const s of sols) if (s.state !== 'dead' && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 6) damageSol(s, 220, true);
  if (armor) armor.hit(p.x, p.z, fromAbove ? 160 : 55, true);
  const dp = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
  if (dp < 6) {
    player.hp -= 45 * (1 - dp / 6);
    player.rig.hurtT = 0.35;
  }
}
async function launchFPV() {
  const { FPV } = await import('../systems/fpv');
  fpv =
    fpv ||
    new FPV({
      scene,
      renderer,
      player: () => player.pos,
      mobile: MOBILE,
      surf: (x, z) => bldAt(x, z)?.h ?? 0,
      wind: () => (raining() ? 2.2 : 0.8),
      blocked: (x, z, y) => {
        const b = bldAt(x, z);
        if (b && y < b.h + 0.5) return true;
        return !!armor && armor.list.some(a => Math.hypot(a.g.position.x - x, a.g.position.z - z) < 2.6 && y < 3.2);
      },
      los: (a, b) => los(a, b),
      jammers: () =>
        checkpoints.filter((_, i) => i % 2 === 0 && !liberated.has(sectorOf(checkpoints[i][0], checkpoints[i][1]))),
      explode: blast,
      log,
    });
  if (!MOBILE) renderer.domElement.requestPointerLock?.();
  fpv.launch(why => {
    if (document.pointerLockElement) document.exitPointerLock();
    log('📡 ' + why, '#9cf');
  });
}
function setupRecon(c: V2) {
  const cs: V2[] = checkpoints.slice(0, 2).map(q => [q[0], q[1]] as V2);
  while (cs.length < 2) cs.push([c[0] + 60 * (cs.length ? 1 : -1), c[1] + 40]);
  recon = new Recon(
    scene,
    {
      player: () => player.pos,
      log,
      hidden: () => {
        const P = player.pos;
        return (
          !!bldAt(P.x, P.z) ||
          [
            [1.6, 0],
            [-1.6, 0],
            [0, 1.6],
            [0, -1.6],
          ].some(([dx, dz]) => bldAt(P.x + dx, P.z + dz))
        );
      },
      spotTime: () => (isNight() ? 1.5 : 2.5),
      spotCd: () => (isNight() ? 40 : 70),
      spotted: p => {
        radio(p, null, tr('無人機回報目標位置', 'Drone reporting target position'));
        log(
          tr(
            '⚠ 解放軍偵察無人機發現你！砲擊與巡邏隊正趕來——快躲進騎樓或室內！',
            '⚠ A PLA recon drone spotted you! Artillery and patrols are on their way—get under an arcade or indoors!',
          ),
          '#f66',
        );
        slowDown(tr('被無人機發現', 'Spotted by a drone'));
        for (let i = 0; i < SHELL.n; i++) {
          const a = Math.random() * 6.28,
            r = SHELL.spread * Math.sqrt(Math.random());
          const q: V2 = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r];
          shells.push({ t: SHELL.lead + i * SHELL.gap, p: q, w: blastFx.warn(q[0], q[1], SHELL.core, SHELL.wound) });
        }
        sols
          .filter(s => s.state !== 'dead' && !s.post)
          .sort((a, b) => Math.hypot(a.pos.x - p[0], a.pos.z - p[1]) - Math.hypot(b.pos.x - p[0], b.pos.z - p[1]))
          .slice(0, 3)
          .forEach(s => {
            s.state = 'investigate';
            s.target = p;
            s.timer = 300;
          });
      },
    },
    cs,
  );
}
function updateShells(dt: number) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.t -= dt;
    if (!s.wh && s.t < 1.6) {
      s.wh = true;
      AU.whistle(Math.hypot(player.pos.x - s.p[0], player.pos.z - s.p[1]), Math.max(0.3, s.t));
    }
    if (s.t > 0) continue;
    shells.splice(i, 1);
    blastFx.unwarn(s.w);
    const p = new THREE.Vector3(s.p[0], 0.5, s.p[1]);
    boom(scene, p, 1.4);
    noise(p.x, p.z, 60);
    for (const o of sols) {
      if (o.state === 'dead') continue;
      const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
      if (d < SHELL.wound) damageSol(o, d < SHELL.core ? 300 : shellDmg(d) * 1.5, true);
    }
    const dp = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    let dmg = shellDmg(dp);
    if (dmg <= 0) continue;
    // indoors the walls stop almost all fragments; low walls / arcade pillars (cover) halve them
    if (bldAt(player.pos.x, player.pos.z)) dmg *= 0.15;
    else if (findCover(player.pos.x, player.pos.z, 1.4)) dmg *= 0.5;
    lastShellHit = Math.round(dmg);
    player.hp -= dmg;
    player.rig.hurtT = 0.4;
    if (dmg > 15 && !player.bleed) {
      player.bleed = true;
      log(tr('被砲彈破片擊中，流血了！', 'Shell fragments hit you. You are bleeding!'), '#f66');
    }
  }
}
let lastShellHit = 0;
// ---------- 國軍 (ROC) support: weapons unlock, radio call-in, final counter-offensive ----------
const ROC = { unlocked: false, cd: 0, offensive: false, ended: false, n: 0 };
let roc: RocSystem | null = null;
let mainRoads: { p: V2[]; t: string; n: string }[] = [];
const ROC_PRESETS: Record<string, number>[] = [
  { t91: 1, stanag: 2, a556n: 30, bandage: 2 },
  { t65k2: 1, stanag: 1, a556n: 40, kestrel: 1, r67: 2 },
  { t75saw: 1, a556n: 120, at4: 1 },
  { t93: 1, a762n: 10, t75p: 1, a9: 15 },
];
function fireAT(k: string, d: (typeof ITEMS)[string], dir: THREE.Vector3) {
  const P = player.pos;
  let end = P.clone().addScaledVector(dir, d.range!),
    hitA: any = null;
  if (armor)
    for (const a of armor.list) {
      if (a.dead) continue;
      const to = a.g.position.clone().sub(P);
      to.y = 0;
      const t = to.dot(dir);
      if (
        t > 0 &&
        t < d.range! &&
        to.clone().sub(dir.clone().multiplyScalar(t)).length() < 2.6 &&
        (k === 'jav' || los([P.x, P.z], [a.g.position.x, a.g.position.z]))
      ) {
        hitA = a;
        end = a.g.position.clone();
        break;
      }
    }
  if (!hitA) {
    for (let t = 2; t < d.range!; t += 1) {
      const q = P.clone().addScaledVector(dir, t);
      if (bldAt(q.x, q.z)) {
        end = q;
        break;
      }
    }
  }
  tracer(P, end);
  const e = end.clone().setY(1.4);
  boom(scene, e, 1.2);
  noise(e.x, e.z, 50);
  if (hitA) armor!.hit(hitA.g.position.x, hitA.g.position.z, d.at!, true);
  for (const s of sols)
    if (s.state !== 'dead' && Math.hypot(s.pos.x - e.x, s.pos.z - e.z) < 4.5) damageSol(s, d.dmg!, true);
  if (k === 'at4') {
    delete player.inv.at4;
    player.equip = '';
    log(tr('AT4 已射出——空筒拋棄', 'AT4 fired—empty tube discarded'), '#ccc');
  } else if (k === 'jav') log(tr('標槍飛彈頂部攻擊！', 'Javelin top attack!'), '#ffd76a');
}
function rocTargets() {
  const T: { x: number; z: number; kind: 'armor' | 'sol' | 'post'; ref: unknown }[] = [];
  if (armor)
    for (const a of armor.list) if (!a.dead) T.push({ x: a.g.position.x, z: a.g.position.z, kind: 'armor', ref: a });
  checkpoints.forEach((c, i) => {
    if (sols.some(s => s.state !== 'dead' && Math.hypot(s.pos.x - c[0], s.pos.z - c[1]) < 15))
      T.push({ x: c[0], z: c[1], kind: 'post', ref: i });
  });
  for (const s of sols) if (s.state !== 'dead') T.push({ x: s.pos.x, z: s.pos.z, kind: 'sol', ref: s });
  return T;
}
function setupRoc() {
  const len = (r: { p: V2[] }) =>
    r.p.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - r.p[i - 1][0], q[1] - r.p[i - 1][1]) : 0), 0);
  mainRoads = roads.filter(
    r =>
      (/^(primary|secondary|trunk)/.test(r.t) || /西園路|環河南路|和平西路|康定路|中華路|艋舺大道/.test(r.n || '')) &&
      r.p.length >= 2 &&
      len(r) > 60,
  );
  roc = new RocSystem(scene, {
    targets: rocTargets,
    los: (a, b) => los(a, b),
    log,
    fire: (t, from) => {
      const to = new THREE.Vector3(t.x, 1.2, t.z);
      tracer(from, to);
      boom(scene, to, t.kind === 'sol' ? 0.6 : 1.3);
      noise(t.x, t.z, 50);
      if (t.kind === 'armor') {
        const a = t.ref as any;
        if (armor && !a.dead) {
          armor.hit(a.g.position.x, a.g.position.z, 120, true);
        }
      } else if (t.kind === 'post') {
        for (const s of sols)
          if (s.state !== 'dead' && Math.hypot(s.pos.x - t.x, s.pos.z - t.z) < 15 && Math.random() < 0.6)
            damageSol(s, 300, true);
        log(tr('國軍砲火摧毀了佔領軍據點！', 'ROC artillery destroyed an occupation outpost!'), '#9cf');
      } else damageSol(t.ref as Sol, 300, true);
      const dp = Math.hypot(player.pos.x - t.x, player.pos.z - t.z);
      if (dp < 3.5) {
        player.hp -= 25;
        player.rig.hurtT = 0.3;
      }
      checkSectors();
    },
  });
}
function routeNear(r: { p: V2[] }, x: number, z: number): V2[] {
  const a = r.p[0],
    b = r.p[r.p.length - 1];
  return Math.hypot(a[0] - x, a[1] - z) > Math.hypot(b[0] - x, b[1] - z) ? r.p.slice() : r.p.slice().reverse();
}
function nearestRoad(x: number, z: number, name?: RegExp) {
  let best = mainRoads[0],
    bd = 1e9;
  for (const r of mainRoads) {
    if (name && !name.test(r.n || '')) continue;
    for (const q of r.p) {
      const d = Math.hypot(q[0] - x, q[1] - z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
  }
  return best;
}
function callSupport() {
  if (!roc) return;
  if (ROC.cd > 0) {
    log(
      getLanguage() === 'en'
        ? `📻 “Roger. Support units are resupplying—call again in ${Math.ceil(ROC.cd)} seconds.”`
        : `📻 「收到，支援單位整補中——${Math.ceil(ROC.cd)} 秒後再呼叫。」`,
      '#ccc',
    );
    return;
  }
  ROC.cd = 240;
  const P = player.pos;
  noise(P.x, P.z, 70);
  sols
    .filter(s => s.state !== 'dead' && !s.post)
    .sort((a, b) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) - Math.hypot(b.pos.x - P.x, b.pos.z - P.z))
    .slice(0, 4)
    .forEach(s => {
      s.state = 'investigate';
      s.target = [P.x, P.z];
      s.timer = 300;
    });
  const kind: RocKind = (['cm32', 'cm11', 'm1a2t'] as RocKind[])[ROC.n++ % 3];
  const r = nearestRoad(P.x, P.z);
  roc.spawn(kind, routeNear(r, P.x, P.z), 150, 8);
  log(
    getLanguage() === 'en'
      ? `📻 Liaison: “${ROC_NAME[kind]} will advance along ${r.n || 'the main road'} in 8 seconds!”—The radio call attracted a patrol`
      : `📻 聯絡官：「${ROC_NAME[kind]} 8 秒後沿 ${r.n || '主要道路'} 推進！」——通話聲引來了巡邏隊`,
    '#9cf',
  );
  phone(
    tr('📻 國軍無線電', '📻 ROC military radio'),
    getLanguage() === 'en'
      ? `${ROC_NAME[kind]} is advancing along ${r.n || 'the main road'} to support you. Cooldown: 4 minutes.`
      : `${ROC_NAME[kind]} 正沿 ${r.n || '主要道路'} 推進支援，冷卻 4 分鐘。`,
  );
  slowDown(tr('呼叫支援', 'Called for support'));
}
function rocCheck(silent: boolean) {
  if (!started && !silent) return;
  if (!ROC.unlocked && liberated.size >= 2) {
    ROC.unlocked = true;
    if (!silent) {
      phone(
        tr('📻 地下電台「自由之聲」', '📻 Underground radio: Voice of Freedom'),
        tr(
          '國軍特戰部隊已在萬華外圍活動！他們在幾個被奪回的據點留下了補給——留意國軍武器與空投。有人看到一名受傷的聯絡官倒在附近，他身上有無線電。',
          'ROC special forces are operating on the outskirts of Wanhua! They left supplies at several reclaimed outposts—watch for ROC weapons and airdrops. A wounded liaison was seen lying nearby, carrying a radio.',
        ),
      );
      log(
        tr(
          '📻 自由之聲：國軍特戰部隊就在附近！據點與空投開始出現國軍武器',
          '📻 Voice of Freedom: ROC special forces are nearby! ROC weapons are now appearing at outposts and in airdrops',
        ),
        '#9cf',
      );
      slowDown(tr('國軍消息', 'ROC military news'));
    }
    checkpoints.slice(0, 4).forEach((c, i) => {
      const p: V2 = [c[0] + 3, c[1] + 3];
      const ct = makeCont('roc' + i, p, 'crate', undefined, ROC_PRESETS[i % ROC_PRESETS.length]);
      ct.label = '國軍補給箱';
    });
    let lp: V2 = [player.pos.x + 14, player.pos.z + 10];
    for (let k = 0; k < 40 && bldAt(lp[0], lp[1]); k++) lp = [player.pos.x + 14 + k * 1.5, player.pos.z + 10 - k];
    const li = makeCont('liaison', lp, 'crate', undefined, { rocradio_b: 1, t75p: 1, a9: 15, bandage: 1 });
    li.label = '受傷聯絡官的背包';
    (ROC as any).liaison = lp;
  }
  if (ROC.unlocked && !ROC.offensive && liberated.size >= NSEC - 2 && roc && !silent) {
    ROC.offensive = true;
    const rest = [...Array(NSEC).keys()].filter(i => !liberated.has(i));
    const r = nearestRoad(player.pos.x, player.pos.z, /西園路/) || mainRoads[0];
    const route = r.p.length > 1 ? (r.p[0][1] > r.p[r.p.length - 1][1] ? r.p.slice() : r.p.slice().reverse()) : r.p;
    (ROC as any).col = route;
    (['m1a2t', 'm1a2t', 'cm11', 'cm32'] as RocKind[]).forEach((kd, i) => roc!.spawn(kd, route, 99999, i * 3.5));
    phone(
      tr('📻 國軍無線電', '📻 ROC military radio'),
      getLanguage() === 'en'
        ? `The full counteroffensive has begun! An ROC armored column is entering ${r.n || 'Xiyuan Road'}, heading for the last occupation outposts (${rest.map(SECTOR_LABEL).join(', ')}).`
        : `全面反攻開始！國軍戰車縱隊開進 ${r.n || '西園路'}，目標：最後的佔領軍據點（${rest.map(SECTOR_LABEL).join('、')}）。`,
    );
    log(
      getLanguage() === 'en'
        ? `🎖 ROC counteroffensive! An M1A2T, Brave Tiger, and Clouded Leopard column is entering ${r.n || 'Xiyuan Road'}—reclaim the last outposts!`
        : `🎖 國軍反攻！M1A2T、勇虎、雲豹縱隊開進 ${r.n || '西園路'}——奪回最後的據點！`,
      '#ffd76a',
    );
    slowDown(tr('國軍反攻', 'ROC counteroffensive'));
  }
  if (ROC.offensive && !ROC.ended && liberated.size >= NSEC && !silent) {
    ROC.ended = true;
    rocEnding();
  }
}
let rocCine: { t: number; T: number } | null = null;
function rocEnding() {
  UT.ev.win = 1;
  save();
  closePanel();
  setSpeed(1);
  started = false;
  const ov = document.createElement('div');
  ov.id = 'roccine';
  ov.innerHTML = tr(
    '<div class="lb t"></div><div class="lb b"></div><div class="ttl">奪回萬華</div><div class="sub">國軍戰車縱隊・西園路</div>',
    '<div class="lb t"></div><div class="lb b"></div><div class="ttl">Reclaim Wanhua</div><div class="sub">ROC armored column · Xiyuan Road</div>',
  );
  document.body.appendChild(ov);
  rocCine = { t: 0, T: 11 };
}
function rocCineStep(dt: number) {
  const c = rocCine!;
  c.t += dt;
  const lead = roc?.list[0]?.g.position || player.pos;
  const a = 0.6 + c.t * 0.18,
    r = 26 - c.t * 0.8,
    h = 9 + Math.sin(c.t * 0.4) * 3;
  camera.position.set(lead.x + Math.cos(a) * r, h, lead.z + Math.sin(a) * r);
  camera.lookAt(lead.x, 2, lead.z);
  roc?.update(dt);
  if (c.t > c.T) {
    rocCine = null;
    document.getElementById('roccine')?.remove();
    const day = Math.floor(gameMin / 1440) + 1;
    const d = document.createElement('div');
    d.id = 'evacend';
    d.className = 'win';
    d.innerHTML =
      getLanguage() === 'en'
        ? `<h1>Wanhua Reclaimed</h1><h2>Ending: ROC forces and the people of Wanhua stood together and drove the occupation forces out of Monga.</h2><p class="survend">${SV.endingText(surv)}</p><table><tr><td>Days survived</td><td>${day} days</td></tr><tr><td>Neighborhoods reclaimed</td><td>${liberated.size} / ${NSEC}</td></tr><tr><td>Occupation soldiers defeated</td><td>${player.kills}</td></tr><tr><td>Armored vehicles destroyed</td><td>${armor ? armor.list.filter(a => a.dead).length : 0}</td></tr></table><p>Two other endings await: evacuate by helicopter or small boat to the USS Gerald R. Ford.</p><button onclick="location.reload()">Play again</button>`
        : `<h1>奪回萬華</h1><h2>結局：國軍與萬華的街坊並肩，把佔領軍趕出了艋舺。</h2><p class="survend">${SV.endingText(surv)}</p><table><tr><td>存活天數</td><td>${day} 天</td></tr><tr><td>奪回街區</td><td>${liberated.size} / ${NSEC}</td></tr><tr><td>擊倒佔領軍</td><td>${player.kills}</td></tr><tr><td>擊毀裝甲</td><td>${armor ? armor.list.filter(a => a.dead).length : 0}</td></tr></table><p>另有兩種結局：搭直升機或小艇撤離至福特號航空母艦。</p><button onclick="location.reload()">再玩一次</button>`;
    document.body.appendChild(d);
  }
}
// ---------- PLA armour on main roads ----------
let armor: ArmorSystem | null = null;
function setupArmor(c: V2) {
  armor = new ArmorSystem(scene, {
    canSee: (ax, az, bx, bz) => !bldAt(bx, bz) && los([ax, az], [bx, bz]),
    hurt: dmg => {
      if (player.sleeping) player.sleeping = false;
      AU.gunshot('mg', 30, false);
      player.rig.hurtT = 0.35;
      player.rig.hurtSide = 1;
      player.stun = 0.25;
      player.hp -= dmg;
      if (!player.bleed && Math.random() < 0.35) {
        player.bleed = true;
        log(tr('你被機槍擊中，流血了！', 'Machine-gun fire hit you. You are bleeding!'), '#f66');
      }
    },
    alert: (x, z) => {
      sols
        .filter(s => s.state !== 'dead' && !s.post)
        .sort((a, b) => Math.hypot(a.pos.x - x, a.pos.z - z) - Math.hypot(b.pos.x - x, b.pos.z - z))
        .slice(0, 3)
        .forEach(s => {
          s.state = 'investigate';
          s.target = [player.pos.x, player.pos.z];
          s.timer = 300;
        });
    },
    log,
    player: () => player.pos,
  });
  const len = (r: { p: V2[] }) =>
    r.p.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - r.p[i - 1][0], q[1] - r.p[i - 1][1]) : 0), 0);
  const main = roads
    .filter(
      r => /^(primary|secondary|trunk)/.test(r.t) || /西園路|環河南路|和平西路|康定路|中華路|艋舺大道/.test(r.n || ''),
    )
    .filter(r => r.p.length >= 2 && (ROADW[r.t.replace('_link', '')] ?? 0) >= 9 && len(r) > 70)
    .filter(r => r.p.some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) < 420))
    .sort((a, b) => len(b) - len(a));
  const kinds: ArmorKind[] = ['zbl08', 'zbd05', 'mengshi', 'ztd05'];
  const used = new Set<string>();
  for (const r of main) {
    if (armor.list.length >= kinds.length) break;
    const key = (r.n || '') + r.p[0].join();
    if (used.has(key)) continue;
    if (r.p.some(q => Math.hypot(q[0] - c[0], q[1] - c[1]) < 30)) continue;
    used.add(key);
    armor.spawn(
      kinds[armor.list.length],
      r.p.map(q => [q[0], q[1]] as V2),
      Math.floor(r.p.length / 3),
    );
  }
  // pre-placed burnt wrecks
  let w = 0;
  for (const r of main.slice().reverse()) {
    if (w >= 3) break;
    const q = r.p[Math.floor(r.p.length / 2)],
      q2 = r.p[Math.floor(r.p.length / 2) + 1] || r.p[0];
    if (Math.hypot(q[0] - c[0], q[1] - c[1]) < 25) continue;
    const ang = Math.atan2(-(q2[1] - q[1]), q2[0] - q[0]);
    const off = (ROADW[r.t.replace('_link', '')] ?? 9) / 2 - 2.2;
    armor.wreck(
      (['zbd05', 'mengshi', 'zbl08'] as ArmorKind[])[w],
      q[0] - Math.sin(ang) * off,
      q[1] - Math.cos(ang) * off,
      ang + 0.3,
    );
    w++;
  }
  (UT as any).armorN = armor.list.length;
}
function makeCont(id: string, p: V2, type: string, b?: Bld, preset?: Record<string, number>) {
  const items: Record<string, number> = preset || {};
  if (!preset) {
    const table = LOOT[type];
    const n = 1 + Math.floor(rnd() * 3);
    const tot = table.reduce((s, x) => s + x[1], 0);
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.18) continue;
      let r = rnd() * tot;
      for (const [k, w, m] of table) {
        r -= w;
        if (r <= 0) {
          items[k] = (items[k] || 0) + 1 + Math.floor(rnd() * m);
          break;
        }
      }
    }
  }
  const kind =
    type === 'store'
      ? rnd() < 0.4
        ? 'fridge'
        : 'shelf'
      : type === 'pharmacy'
        ? 'shelf'
        : type === 'crate'
          ? 'crate'
          : 'cab';
  const label = { fridge: '冷藏櫃', shelf: '貨架', cab: '櫥櫃', crate: '遺留物' }[kind];
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(kind === 'crate' ? 0.8 : 1.1, kind === 'fridge' ? 1.9 : kind === 'crate' ? 0.4 : 1.2, 0.6),
    contMat[kind],
  );
  m.position.set(p[0], m.geometry.parameters.height / 2, p[1]);
  m.rotation.y = rnd() * Math.PI;
  m.castShadow = true;
  m.receiveShadow = true;
  (b ? b.group : scene).add(m);
  const c: Cont = { id, p, items, label, mesh: m, b };
  conts.push(c);
  return c;
}

function buildMap(data: any) {
  let minx = 1e9,
    maxx = -1e9,
    minz = 1e9,
    maxz = -1e9;
  for (const r of data.roads)
    for (const p of r.p) {
      minx = Math.min(minx, p[0]);
      maxx = Math.max(maxx, p[0]);
      minz = Math.min(minz, p[1]);
      maxz = Math.max(maxz, p[1]);
    }
  Object.assign(bounds, { minx: minx + 10, maxx: maxx - 10, minz: minz + 10, maxz: maxz - 10 });
  const W = maxx - minx,
    H = maxz - minz;
  // v21.3 everything off the carriageway is paved (worn concrete + tile/brick patchwork, 1 texture = 2 m)
  groundMat.map = lotTex; // 1 texture = 8 m
  lotTex.repeat.set((W + 200) / 8, (H + 200) / 8);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 200, H + 200), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((minx + maxx) / 2, 0, (minz + maxz) / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  // roads
  const RW: Record<string, number> = ROADW;
  const rg: THREE.BufferGeometry[] = [],
    lg: THREE.BufferGeometry[] = [];
  for (const r of data.roads) {
    roads.push(r);
    const w = RW[r.t.replace('_link', '')] ?? 3;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.1) continue;
      const g = new THREE.PlaneGeometry(len + w * 0.5, w);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-Math.atan2(bz - az, bx - ax));
      g.translate((ax + bx) / 2, 0.02 + w * 0.0005, (az + bz) / 2);
      rg.push(g);
      // v19.2: global centre line removed (per OSM way it doubled up on dual carriageways); markings live in roads.ts
    }
  }
  roadTex.repeat.set(1, 1);
  const roadMesh = new THREE.Mesh(mergeGeometries(rg), roadMat);
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);
  if (lg.length)
    scene.add(
      new THREE.Mesh(
        mergeGeometries(lg),
        new THREE.MeshStandardMaterial({
          color: 0xd8b040,
          roughness: 0.8,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      ),
    );
  // buildings
  setArcadeDeps({ roadDist, pip: pip as any, addSeg });
  data.buildings.forEach((ob: any, id: number) => {
    const pts: V2[] = ob.p;
    const A = area(pts);
    if (A < 12 || A > 6000) return;
    let xs = pts.map(p => p[0]),
      zs = pts.map(p => p[1]);
    const hh = (k: number) => {
      const v = Math.sin(id * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    if (!ob.l) rnd();
    const rr = hh(1);
    const lv = ob.l
      ? Math.min(ob.l, rr < 0.45 ? 3 : 9)
      : rr < 0.5
        ? 2 + Math.floor(hh(2) * 2)
        : rr < 0.88
          ? 4 + Math.floor(hh(2) * 2)
          : 6 + Math.floor(hh(2) * 2);
    /* 透天 2-3F, 公寓 4-5F, few taller; v19.3 ground floor 3.8 m, upper floors 3.2 m */ const h =
      GF + (Math.min(lv, 7) - 1) * FH;
    const type = shopType(ob.s, ob.n);
    const cx = xs.reduce((a, b) => a + b) / xs.length,
      cz = zs.reduce((a, b) => a + b) / zs.length;
    const group = new THREE.Group();
    scene.add(group);
    const b: Bld = {
      id,
      pts,
      h,
      type,
      group,
      walls: null as any,
      roof: new THREE.Group(),
      c: [cx, cz],
      minx: Math.min(...xs),
      maxx: Math.max(...xs),
      minz: Math.min(...zs),
      maxz: Math.max(...zs),
    };
    // door: longest edge
    let di = 0,
      dl = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        c = pts[(i + 1) % pts.length];
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l > dl) {
        dl = l;
        di = i;
      }
    }
    const wg: THREE.BufferGeometry[] = [];
    const wins: { x: number; z: number; y: number; ry: number; f: number }[] = [];
    (b as any).wins = wins;
    const wallBox = (a: V2, c: V2, y0: number, y1: number, win = y0 === 0) => {
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l < 0.05) return;
      const g = new THREE.BoxGeometry(l + 0.25, y1 - y0, 0.25);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++)
        uv.setXY(k, (uv.getX(k) * l) / 3.2, (y0 - (GF - FH) + uv.getY(k) * (y1 - y0)) / FH); // floor bands in world height
      g.rotateY(-Math.atan2(c[1] - a[1], c[0] - a[0]));
      g.translate((a[0] + c[0]) / 2, (y0 + y1) / 2, (a[1] + c[1]) / 2);
      wg.push(g);
      /* window slots matching the painted wall-texture windows (for 3D window units near the player) */
      if (win && h > GF + 1) {
        const ux = (c[0] - a[0]) / l,
          uz = (c[1] - a[1]) / l;
        let nx = -uz,
          nz = ux,
          back = false;
        if (pip([(a[0] + c[0]) / 2 + nx * 0.5, (a[1] + c[1]) / 2 + nz * 0.5], pts)) {
          nx = -nx;
          nz = -nz;
          back = true;
        }
        const T = (3.2 * (l + 0.25)) / l;
        for (let k = 0; k < 40; k++) {
          const sd = back ? l + 0.125 - (k + 0.5) * T : -0.125 + (k + 0.5) * T;
          if (back ? sd < 0.9 : sd > l - 0.9) break;
          if (sd < 0.9 || sd > l - 0.9) continue;
          for (let f = 1; GF + (f - 1) * FH + 2.7 < h; f++)
            wins.push({
              x: a[0] + ux * sd + nx * 0.126,
              z: a[1] + uz * sd + nz * 0.126,
              y: GF + (f - 1) * FH + 1.95,
              ry: Math.atan2(nx, nz),
              f,
            });
        }
      }
    };
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i],
        c = pts[(i + 1) % pts.length];
      if (i === di && dl > 2.6 && A > 20) {
        const ux = (c[0] - a[0]) / dl,
          uz = (c[1] - a[1]) / dl,
          m = dl / 2;
        const d1: V2 = [a[0] + ux * (m - 0.8), a[1] + uz * (m - 0.8)],
          d2: V2 = [a[0] + ux * (m + 0.8), a[1] + uz * (m + 0.8)];
        let mid: V2 = [(d1[0] + d2[0]) / 2, (d1[1] + d2[1]) / 2];
        // outward normal
        let nx = -uz,
          nz = ux;
        if (pip([mid[0] + nx * 0.6, mid[1] + nz * 0.6], pts)) {
          nx = -nx;
          nz = -nz;
        }
        const arcOk = h > 6 && rnd() < 0.7 ? arcadeFits(pts, a, c, ux, uz, nx, nz, dl, h) : null;
        let da = d1,
          dc = d2;
        if (arcOk) {
          // upper floors flush with the footprint edge; ground floor recessed behind the columns
          wallBox(a, c, GF, h, true);
          const ia: V2 = [a[0] - nx * ARC, a[1] - nz * ARC],
            ic: V2 = [c[0] - nx * ARC, c[1] - nz * ARC];
          da = [d1[0] - nx * ARC, d1[1] - nz * ARC];
          dc = [d2[0] - nx * ARC, d2[1] - nz * ARC];
          wallBox(ia, da, 0, GF, false);
          wallBox(dc, ic, 0, GF, false);
          wallBox(da, dc, 2.4, GF, false);
          addSeg({ a: ia, b: da });
          addSeg({ a: dc, b: ic });
          mid = [(da[0] + dc[0]) / 2, (da[1] + dc[1]) / 2];
        } else {
          wallBox(a, d1, 0, h);
          wallBox(d2, c, 0, h);
          wallBox(d1, d2, 2.4, h);
          addSeg({ a, b: d1 });
          addSeg({ a: d2, b: c });
        }
        const door: Door = { b, p: mid, a: da, c: dc, barricaded: false };
        b.door = door;
        doors.push(door);
        // v19.3 騎樓: built inside the footprint — columns on the street edge under the upper floors,
        // shopfront recessed ARC m behind them, continuous ceiling; only on edges facing a road
        if (arcOk) buildArcade(arcOk, b.roof);
        if ((h > 6 && rnd() < 0.6) || type !== 'home') {
          const tex = type !== 'home' ? signTex[type] : pick(shopSignTex);
          const sg = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(dl * 0.8, 5), 1.1),
            new THREE.MeshStandardMaterial({
              map: tex,
              emissive: 0xffffff,
              emissiveMap: tex,
              emissiveIntensity: 0.25,
              side: THREE.DoubleSide,
            }),
          );
          const sy = arcOk ? GF + 0.75 : 3.0,
            so = arcOk ? ARC + 0.16 : 0.16; // attached flat to the facade (fascia above the arcade)
          sg.position.set(mid[0] + nx * so, sy, mid[1] + nz * so);
          sg.lookAt(mid[0] + nx * (so + 5), sy, mid[1] + nz * (so + 5));
          group.add(sg);
          b.sign = sg;
        }
      } else {
        wallBox(a, c, 0, h);
        addSeg({ a, b: c });
      }
    }
    const mi = id % wallMats.length;
    (b as any).mi = mi;
    b.walls = new THREE.Mesh(mergeGeometries(wg), wallMats[mi]);
    b.walls.castShadow = true;
    b.walls.receiveShadow = true;
    group.add(b.walls);
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const rgeo = new THREE.ShapeGeometry(shape);
    rgeo.rotateX(Math.PI / 2);
    const roof = new THREE.Mesh(
      rgeo,
      pickRoofMat(() => hh(9)),
    );
    roof.position.y = h;
    roof.castShadow = true;
    b.roof.add(roof);
    const fl = new THREE.Mesh(rgeo, floorMat);
    fl.position.y = 0.03;
    fl.receiveShadow = true;
    group.add(fl);
    b.floor = fl;
    // rooftop additions 頂樓加蓋 + water tanks
    {
      const rcls = roofClass(pts as any, lv, type + ' ' + (ob.n || ''));
      if (A > 40) rnd(); // keep the world RNG sequence identical to v21 (soldier/loot placement)
      const shack = A > 30 && (rcls !== 'row' || hh(3) < 0.9);
      const s7 = Math.floor(hh(7) * 1e6) + 1,
        s8 = Math.floor(hh(8) * 1e6) + 7,
        roofG = b.roof;
      roofJobs.push({
        x: cx,
        z: cz,
        f: () => {
          if (shack) {
            let sd = s7;
            const pr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
            placeRooftop(roofG, pts as any, h, pr, pip as any, rcls);
          }
          {
            let sd = s8;
            const pr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
            dressRoof(roofG, pts as any, h, pr, pip as any, A > 25);
          }
          if (A < 600) {
            let sd = s8 ^ 0x5bd1;
            const pr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
            dressWalkup(pts as any, h, roadDist, pr, roofG);
          }
        },
      });
    }
    const tq = rnd();
    if (tq < 0.5 || hh(4) < (lv <= 3 ? 0.5 : 0)) {
      const st = lv <= 3 ? 1.6 : 0;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.4, 10), tankMat);
      const tp: V2 =
        tq < 0.5 ? [cx + (rnd() - 0.5) * 2, cz + (rnd() - 0.5) * 2] : [cx + (hh(5) - 0.5) * 2, cz + (hh(6) - 0.5) * 2];
      if (pip(tp, pts)) {
        t.position.set(tp[0], h + 0.7 + st, tp[1]);
        t.castShadow = true;
        b.roof.add(t);
        if (st)
          for (const [ox, oz] of [
            [-0.45, -0.45],
            [0.45, -0.45],
            [0.45, 0.45],
            [-0.45, 0.45],
          ]) {
            const lg = new THREE.Mesh(new THREE.BoxGeometry(0.07, st, 0.07), tinMat);
            lg.position.set(tp[0] + ox, h + st / 2, tp[1] + oz);
            b.roof.add(lg);
          }
      }
    }
    group.add(b.roof);
    blds.push(b);
    (b as any).nm = ob.n || '';
    // containers
    if (b.door) {
      const n = clamp(Math.floor(A / 60), 1, type === 'store' ? 5 : 3);
      let tries = 0,
        k = 0;
      while (k < n && tries++ < 40) {
        const p: V2 = [b.minx + rnd() * (b.maxx - b.minx), b.minz + rnd() * (b.maxz - b.minz)];
        if (pip(p, pts) && Math.hypot(p[0] - b.door.p[0], p[1] - b.door.p[1]) > 1.8) {
          makeCont(`b${id}_${k}`, p, type, b);
          k++;
        }
      }
    }
  });
  flushArcades(scene);
  // parked vehicles (scooters on sidewalks, cars/taxis on bigger roads, occupation trucks) + street lamps
  const spots: { x: number; z: number; ang: number; kind: VehicleKind }[] = [];
  for (const r of roads) {
    const w = RW[r.t] ?? 3;
    if (w < 6) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 4) continue;
      const ang = Math.atan2(bz - az, bx - ax);
      const ux = Math.cos(ang),
        uz = Math.sin(ang),
        nx = -uz,
        nz = ux;
      for (let s = 2; s < L - 2; s += 26) {
        const side = rnd() < 0.5 ? 1 : -1;
        const lx = ax + ux * s + nx * (w / 2 + 0.4) * side,
          lz = az + uz * s + nz * (w / 2 + 0.4) * side;
        if (!bldAt(lx, lz)) lamps.push([lx, lz, Math.atan2(-nx * side, -nz * side)]);
      }
      if (rnd() < 0.06) {
        const t = rnd() * 0.6 + 0.2;
        const side = rnd() < 0.5 ? 1 : -1;
        const n = 2 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          const x = ax + (bx - ax) * t + ux * k * 0.75 + nx * (w / 2 - 0.7) * side,
            z = az + (bz - az) * t + uz * k * 0.75 + nz * (w / 2 - 0.7) * side;
          if (!bldAt(x, z)) spots.push({ x, z, ang: Math.atan2(-nx * side, -nz * side), kind: 'scooter' });
        }
      }
      if (w >= 9 && rnd() < 0.05) {
        const t = rnd() * 0.6 + 0.2;
        const side = rnd() < 0.5 ? 1 : -1;
        const x = ax + (bx - ax) * t + nx * (w / 2 - 1.6) * side,
          z = az + (bz - az) * t + nz * (w / 2 - 1.6) * side;
        const kind: VehicleKind = rnd() < 0.15 ? 'truck' : rnd() < 0.35 ? 'taxi' : 'car';
        if (!bldAt(x, z)) {
          spots.push({ x, z, ang: Math.atan2(ux, uz), kind });
          const hl = kind === 'truck' ? 3.25 : 2.2,
            hw = kind === 'truck' ? 1.15 : 0.9;
          const cs: V2[] = [
            [-hw, -hl],
            [hw, -hl],
            [hw, hl],
            [-hw, hl],
          ].map(([a, b]) => [x + a * nx + b * ux, z + a * nz + b * uz] as V2);
          for (let q = 0; q < 4; q++) addSeg({ a: cs[q], b: cs[(q + 1) % 4], h: kind === 'truck' ? 2.8 : 1.45 });
        }
      }
    }
  }
  vehicles.build(spots, mergeGeometries, rnd);
  buildLamps();
}

let facade: ReturnType<typeof buildFacade> | null = null;
let decay: ReturnType<typeof buildDecay> | null = null;
let alley: ReturnType<typeof buildAlley> | null = null;
let checkpoints: V2[] = [];
// ---------- street lamps ----------
const lamps: [number, number, number][] = [];
const lampPool: THREE.PointLight[] = [];
let lampHeadMat: THREE.MeshStandardMaterial;
const vehicles = new VehicleSystem(scene);
function buildLamps() {
  const pole = new THREE.CylinderGeometry(0.07, 0.09, 5, 6);
  pole.translate(0, 2.5, 0);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 1.2);
  arm.translate(0, 4.95, 0.55);
  const poleG = mergeGeometries([pole, arm]);
  const head = new THREE.BoxGeometry(0.35, 0.12, 0.5);
  head.translate(0, 4.88, 1.1);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x5a6066, metalness: 0.5, roughness: 0.5 });
  lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffc070, emissiveIntensity: 0 });
  scene.add(...makeLampBatches(lamps, poleG, head, poleMat, lampHeadMat));
  for (let i = 0; i < 8; i++) {
    const l = new THREE.PointLight(0xffc070, 0, 22, 1.6);
    scene.add(l);
    lampPool.push(l);
  }
}
let lampT = 0;
function updateLamps(night: number, dt: number) {
  setShackNight(night);
  lampHeadMat.emissiveIntensity = night * 2.5;
  lampT -= dt;
  if (lampT > 0) return;
  lampT = 0.5;
  const near = lamps
    .map(l => [l, (l[0] - player.pos.x) ** 2 + (l[1] - player.pos.z) ** 2] as const)
    .sort((a, b) => a[1] - b[1])
    .slice(0, lampPool.length);
  lampPool.forEach((L, i) => {
    const e = near[i];
    if (!e) {
      L.intensity = 0;
      return;
    }
    const [x, z, a] = e[0];
    L.position.set(x + Math.sin(a) * 1.1, 4.7, z + Math.cos(a) * 1.1);
    L.intensity = night * 40;
  });
}

// ---------- characters ----------
const SOLDIER_OPTS = {
  gender: 'm' as const,
  hair: 0x111111,
  top: 0x55603c,
  bottom: 0x4a5434,
  shoes: 0x1a1a1a,
  soldier: true,
};
const HERO: Record<string, any> = {
  m: {
    gender: 'm',
    hair: 0x1a1410,
    top: 0xd8d4c8,
    jacket: 0x3d5a78,
    bottom: 0x34363e,
    shoes: 0xe8e8e8,
    pack: 0x2f3a2a,
  },
  f: { gender: 'f', hair: 0x1e1410, top: 0xb84a52, bottom: 0x2a3a5a, shoes: 0xe8e8e8, pack: 0x6a5240 },
};
function spawnRig(o: any) {
  const r = makeRig(o);
  scene.add(r.root);
  return r;
}
const player = {
  mesh: null as any as THREE.Group,
  rig: null as any as Rig,
  gender: 'm',
  anim: 'idle' as AnimState,
  moving: 0,
  pos: new THREE.Vector3(),
  hp: 100,
  hunger: 85,
  thirst: 85,
  fatigue: 10,
  bleed: false,
  inv: { water: 1, noodle: 1 } as Record<string, number>,
  vel: new THREE.Vector3(),
  vaultT: 0,
  stun: 0,
  vFrom: new THREE.Vector3(),
  vTo: new THREE.Vector3(),
  equip: '' as string,
  sneak: false,
  cd: 0,
  kills: 0,
  sleeping: false,
  light: false,
  cover: null as null | { low: boolean; x: number; z: number; seg: Seg },
};
type Sol = {
  rig: Rig;
  stun?: number;
  vs?: number;
  post?: V2;
  path?: V2[];
  pi?: number;
  repath?: number;
  pgoal?: V2;
  speed?: number;
  aiming?: boolean;
  cov?: V2 | null;
  covT?: number;
  crouch?: boolean;
  peekT?: number;
  /** v22.10 rifle-butt melee: cooldown and time until the blow lands */
  mCd?: number;
  mHit?: number;
  /** v22.11 squad tactics */
  day?: boolean;
  role?: SQ.Role;
  slot?: number;
  sqN?: number;
  flankT?: number;
  retreatT?: number;
  retreated?: boolean;
  search?: V2[];
  id: number;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  hp: number;
  route: V2[];
  wi: number;
  dir: number;
  state: 'patrol' | 'investigate' | 'combat' | 'dead';
  target?: V2;
  alert: number;
  timer: number;
  cd: number;
  sector: number;
  cone: THREE.Mesh;
  night: boolean;
  lastSeen?: V2;
  /** v21: streamed district soldier (tile key + index within tile) */
  tile?: string;
  tid?: number;
};
const sols: Sol[] = [];
const coneGeo = new THREE.CircleGeometry(1, 20, -Math.PI / 5, (Math.PI * 2) / 5);
coneGeo.rotateX(-Math.PI / 2);
coneGeo.rotateY(Math.PI / 2);
function spawnSoldiers(dead: Set<number>) {
  const big = roads.filter(r => r.p.length >= 3 && r.t !== 'footway');
  for (let i = 0; i < 64; i++) {
    const r = pick(big);
    const s0 = Math.floor(rnd() * (r.p.length - 1));
    const route = r.p.slice(Math.max(0, s0 - 3), s0 + 4) as V2[];
    const night = i >= 48;
    const rig = spawnRig(SOLDIER_OPTS);
    setWeapon(rig, 'rifle');
    const mesh = rig.root;
    const cone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    cone.position.y = 0.06;
    scene.add(cone);
    const p = route[0];
    const s: Sol = {
      rig,
      id: i,
      mesh,
      pos: new THREE.Vector3(p[0], 0, p[1]),
      hp: 100,
      route,
      wi: 1,
      dir: 0,
      state: 'patrol',
      alert: 0,
      timer: 0,
      cd: 0,
      sector: sectorOf(p[0], p[1]),
      cone,
      night,
    };
    if (dead.has(i)) {
      s.state = 'dead';
      s.hp = 0;
      rig.deadT = 1;
      mesh.visible = false;
      cone.visible = false;
    }
    sols.push(s);
  }
}

// ---------- v21: district tile content (per-tile density budget, deterministic per-tile seed) ----------
const GARRISON = 5;
const DBUDGET = { loot: 3, patrol: 2, solCap: 36 };
const gKeys = new Map<number, string | null>();
function garrisonKey(i: number) {
  if (gKeys.has(i)) return gKeys.get(i)!;
  if (!district.ix) return null;
  const T = district.ix.T,
    a = SECTORS[i];
  let best: string | null = null,
    bd = 1e18;
  for (const [k, [nb, nr]] of Object.entries(district.ix.tiles)) {
    if (nr < 3 || nb < 4) continue;
    const [tx, tz] = k.split('_').map(Number);
    const cx = (tx + 0.5) * T,
      cz = (tz + 0.5) * T;
    if (inCore(cx, cz)) continue;
    const d = (cx - a.x) ** 2 + (cz - a.z) ** 2;
    if (d < bd) ((bd = d), (best = k));
  }
  gKeys.set(i, best);
  return best;
}
const garrisonOf = (i: number) => {
  const k = garrisonKey(i);
  return k ? { key: k } : null;
};
function rollLoot(type: string, r: () => number) {
  const items: Record<string, number> = {};
  const table = LOOT[type] || LOOT.home;
  const tot = table.reduce((s, x) => s + x[1], 0);
  for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++) {
    let q = r() * tot;
    for (const [k, w, m] of table) {
      q -= w;
      if (q <= 0) {
        items[k] = (items[k] || 0) + 1 + Math.floor(r() * m);
        break;
      }
    }
  }
  return items;
}
const dTile = new Map<string, { sols: Sol[]; conts: Cont[]; marks: THREE.Object3D[]; cps: V2[] }>();
let dSolId = 100000;
const sandMat = new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 1 });
/** v21.5 a visible sandbag wall (cover, 1 m) of n bags at (x, z) facing ang; returns the group */
function sandbags(x: number, z: number, ang: number, n = 4) {
  const g = new THREE.Group();
  const ux = Math.cos(ang),
    uz = Math.sin(ang);
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < n - (row === 2 ? 1 : 0); k++) {
      const sb = new THREE.Mesh(sandGeo, sandMat);
      const o = (k - (n - 1) / 2 + (row % 2) * 0.5) * 0.62;
      sb.position.set(x + ux * o, 0.17 + row * 0.3, z + uz * o);
      sb.rotation.y = -ang;
      sb.castShadow = true;
      g.add(sb);
    }
  scene.add(g);
  const hl = (n * 0.62) / 2;
  addSeg({ a: [x - ux * hl, z - uz * hl], b: [x + ux * hl, z + uz * hl] }, true);
  return g;
}
const sandGeo = new THREE.BoxGeometry(0.6, 0.3, 0.45);
function dSoldier(key: string, tid: number, route: V2[], sector: number, post?: V2) {
  const rig = spawnRig(SOLDIER_OPTS);
  setWeapon(rig, 'rifle');
  const cone = new THREE.Mesh(
    coneGeo,
    new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  cone.position.y = 0.06;
  scene.add(cone);
  const p = post || route[0];
  const s: Sol = {
    rig,
    id: dSolId++,
    mesh: rig.root,
    pos: new THREE.Vector3(p[0], 0, p[1]),
    hp: 100,
    route,
    wi: 1,
    dir: 0,
    state: 'patrol',
    alert: 0,
    timer: 0,
    cd: 0,
    sector,
    cone,
    night: false,
    tile: key,
    tid,
  };
  if (post) s.post = post;
  sols.push(s);
  return s;
}
function onTileLoad(t: TileInfo) {
  const rec = { sols: [] as Sol[], conts: [] as Cont[], marks: [] as THREE.Object3D[], cps: [] as V2[] };
  dTile.set(t.key, rec);
  const sv = district.saved[t.key] || {};
  const dead = sv.dead || {};
  const r = t.rnd;
  // loot: a few caches on the shop frontage
  const types = ['home', 'store', 'stall', 'breakfast', 'hardware', 'kitchen'];
  const nL = t.fronts.length ? Math.min(DBUDGET.loot, Math.floor(t.fronts.length / 8) + (r() < 0.5 ? 1 : 0)) : 0;
  for (let i = 0; i < nL; i++) {
    const f = t.fronts[Math.floor(r() * t.fronts.length)];
    const ty = types[Math.floor(r() * types.length)];
    const rolled = rollLoot(ty, r);
    const preset = sv.c?.[i] ?? rolled;
    rec.conts.push(
      makeCont(`t${t.key}:${i}`, [f.x + f.ux * (r() - 0.5) * 2, f.z + f.uz * (r() - 0.5) * 2], 'crate', undefined, {
        ...preset,
      }),
    );
  }
  // v21.5 enterable ground-floor rooms: a cabinet / fridge / shelf inside each (ids 100+, saved per tile)
  (t.rooms || []).forEach((rm, j) => {
    const i = 100 + j;
    const ty = rm.kind === 'shop' ? 'store' : 'home';
    const preset = sv.c?.[i] ?? rollLoot(ty, r);
    rec.conts.push(makeCont(`t${t.key}:${i}`, [rm.x - rm.nx * 1.2, rm.z - rm.nz * 1.2], ty, undefined, { ...preset }));
  });
  const big = t.roads.filter(q => q.p.length >= 2 && !/foot|path|steps|cycle|service/.test(q.t));
  // garrison outpost for the area this tile anchors
  const gs = SECTORS.findIndex((_, i) => outerSector(i) && garrisonKey(i) === t.key);
  if (gs >= 0 && big.length) {
    let cp: V2 = big[0].p[0],
      bd = 1e9;
    for (const q of big)
      for (const v of q.p) {
        const d = Math.hypot(v[0] - t.cx, v[1] - t.cz);
        if (d < bd) ((bd = d), (cp = v));
      }
    const g = new THREE.Group();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const sb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.6), sandMat);
      sb.position.set(cp[0] + Math.cos(a) * 4.2, 0.25 + (k % 2) * 0.02, cp[1] + Math.sin(a) * 4.2);
      sb.rotation.y = -a + Math.PI / 2;
      sb.castShadow = true;
      g.add(sb);
    }
    scene.add(g);
    rec.marks.push(g);
    rec.cps.push(cp);
    checkpoints.push(cp);
    for (let k = 0; k < GARRISON; k++) {
      if (dead[k]) continue;
      const a = (k / GARRISON) * Math.PI * 2;
      const post: V2 = [cp[0] + Math.cos(a) * 2.5, cp[1] + Math.sin(a) * 2.5];
      rec.sols.push(dSoldier(t.key, k, [post, cp], gs, post));
    }
  }
  // patrols (bounded globally)
  const live = sols.filter(q => q.tile && q.state !== 'dead').length;
  const nP =
    big.length && live < DBUDGET.solCap ? Math.min(DBUDGET.patrol, (r() < 0.6 ? 1 : 0) + (r() < 0.3 ? 1 : 0)) : 0;
  for (let j = 0; j < nP; j++) {
    const q = big[Math.floor(r() * big.length)];
    if (dead[GARRISON + j] || q.p.length < 2) continue;
    rec.sols.push(dSoldier(t.key, GARRISON + j, q.p.slice(0, 6) as V2[], -1));
  }
  // v22.11 daytime: one extra patrol per tile (inactive during curfew, when flashlights + drones take over)
  if (big.length && live + nP < DBUDGET.solCap && r() < 0.55) {
    const q = big[Math.floor(r() * big.length)];
    if (!dead[GARRISON + 2] && q.p.length >= 2) {
      const ds = dSoldier(t.key, GARRISON + 2, q.p.slice(0, 6).reverse() as V2[], -1);
      ds.day = true;
      rec.sols.push(ds);
    }
  }
}
function onTileUnload(key: string) {
  const rec = dTile.get(key);
  if (!rec) return;
  for (const q of rec.sols) {
    scene.remove(q.rig.root);
    scene.remove(q.cone);
    const i = sols.indexOf(q);
    if (i >= 0) sols.splice(i, 1);
  }
  const c: Record<number, Record<string, number>> = { ...(district.saved[key]?.c || {}) };
  for (const q of rec.conts) {
    c[+q.id.split(':')[1]] = q.items;
    q.mesh.parent?.remove(q.mesh);
    const i = conts.indexOf(q);
    if (i >= 0) conts.splice(i, 1);
  }
  if (rec.conts.length) district.save(key, 'c', c);
  for (const m of rec.marks) scene.remove(m);
  for (const cp of rec.cps) {
    const i = checkpoints.indexOf(cp);
    if (i >= 0) checkpoints.splice(i, 1);
  }
  dTile.delete(key);
}

// ---------- player role, drivable vehicles, streamed road detail, traffic ----------
let ROLE: Role = roleById('courier');
function roadWAt(x: number, z: number) {
  let best = 1e9,
    w = 0;
  for (const r of roads) {
    const hw = ROADW[r.t.replace('_link', '')] ?? 3;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const dx = bx - ax,
        dz = bz - az,
        l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < best) {
        best = d;
        w = hw;
      }
    }
  }
  return best < w / 2 + 1.5 ? w : 0;
}
const drive = new DriveSystem({
  scene,
  bldAt: (x, z) => bldAt(x, z),
  noise: (x, z, r) => noise(x, z, r),
  log: (m, c) => log(m, c || '#ddd'),
  power: () => UT.power,
  armor: () => (armor ? armor.list.map((a: any) => a.g.position) : []),
  skills: () => ROLE.skills,
  inv: () => player.inv,
  hurt: n => {
    player.hp -= n;
  },
  roadW: roadWAt,
});
const roadT = new RoadTiles({
  scene,
  base: import.meta.env.BASE_URL,
  bldAt: (x, z) => bldAt(x, z),
  power: () => UT.power,
  war: () => !PRO.on || PRO.stage >= 2,
  addSeg: s => addSeg(s as Seg),
  removeSeg: s => removeSeg(s as Seg),
});
const JN = new Set<string>();
const jk = (x: number, z: number) => Math.round(x) + ',' + Math.round(z);
function buildJunctions() {
  const cnt = new Map<string, number>();
  for (const r of roads)
    for (const q of r.p) {
      const k = jk(q[0], q[1]);
      cnt.set(k, (cnt.get(k) || 0) + 1);
    }
  for (const [k, n] of cnt) if (n >= 2) JN.add(k);
}
const traffic = new Traffic({
  scene,
  junction: (x, z) => JN.has(jk(x, z)),
  green: (ux, uz) => roadT.green(ux, uz),
  player: () => player.pos,
  bldAt: (x, z) => bldAt(x, z),
  abandon: (kind, x, z, hd) => {
    const v = drive.spawn(kind, x, z, hd, Math.random, { key: Math.random() < 0.6 });
    if (!SPEC[kind].two) {
      const c = makeCont(
        'ab' + v.id,
        [x, z],
        'crate',
        undefined,
        Math.random() < 0.5 ? { water: 1, snack: 1 } : { tissue: 1, coffee: 1, bandage: 1 },
      );
      c.label = '棄置車內的物品';
      c.mesh.visible = false;
    }
  },
});
// ---- multiplayer glue (v20, local server only) ----
let net: import('../net/net').Net | null = null;
function soonToast(t: string) {
  let el = document.getElementById('soontoast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'soontoast';
    document.body.appendChild(el);
  }
  el.textContent = t;
  el.classList.add('on');
  clearTimeout((el as any)._t);
  (el as any)._t = setTimeout(() => el!.classList.remove('on'), 2200);
}
let MP: { base: string; code: string } | null = null;
const remRigs = new Map<string, Rig>(),
  enRigs = new Map<number, Rig>();
const lootRigs = new Map<string, THREE.Mesh>();
const coopActive = () => MP && net?.s?.coop === 2;
const remPrev = new Map<string, [number, number]>();
function syncServerVitals() {
  const own = MP && net?.s?.players[net.you];
  if (!own) return;
  player.hp = clamp(own.hp, 0, 100);
  if (coopActive() && own.inv) {
    const inventoryChanged = JSON.stringify(player.inv) !== JSON.stringify(own.inv);
    player.inv = { ...own.inv };
    if (inventoryChanged && panelOpen) renderPanel();
    // Equipment intent is sent separately; server never accepts unowned weapons.
    if (player.equip && !own.inv[player.equip]) player.equip = own.weapon || '';
  }
  player.bleed = false; // The prototype server has no separate bleeding state.
  if (own.hp <= 0 && !dead) die();
}
function syncHeldWeapon() {
  net?.equip(player.equip);
}
async function startNet() {
  if (!MP) return;
  const { Net } = await import('../net/net');
  net = new Net(MP.base, {
    onState: () => {
      syncServerVitals();
      if (!dead) syncHeldWeapon();
      const h = document.getElementById('mphud');
      if (h && net?.s && Object.values(net.s.players).filter(p => p.on).length < 2)
        h.textContent = tr(
          '🌐 等待第二位玩家載入・共享敵人暫停',
          '🌐 Waiting for a second loaded player · sentries paused',
        );
    },
    onStatus: t => {
      const h = document.getElementById('mphud');
      if (h) h.textContent = '🌐 ' + t;
    },
    onCorrect: (x, z) => {
      if (!drive.cur) {
        player.pos.x = x;
        player.pos.z = z;
      }
    },
    onLog: l => {
      const m = l[l.length - 1];
      if (m) log('🌐 ' + m, '#8cf');
    },
  });
  const hud = document.createElement('div');
  hud.id = 'mphud';
  document.body.appendChild(hud);
  const leave = document.createElement('button');
  leave.id = 'mpleave';
  leave.textContent = tr('離開多人房間', 'Leave multiplayer');
  leave.onclick = () => {
    net?.leave();
    location.href = location.pathname;
  };
  document.body.appendChild(leave);
  (window as any).__game.net = net;
  try {
    await net.join(MP.code, {
      name: ROLE.names[player.rig.f ? 1 : 0],
      role: ROLE.id,
      g: player.rig.f ? 'f' : 'm',
      x: player.pos.x,
      z: player.pos.z,
    });
  } catch (e) {
    hud.textContent = tr('🌐 連線失敗：', '🌐 Connection failed: ') + (e as Error).message;
  }
}
function netFrame(dt: number) {
  if (!net || !net.s) return;
  net.update(dt, player.pos.x, player.pos.z, !!drive.cur);
  syncHeldWeapon();
  const s = net.s;
  for (const p of Object.values(s.players)) {
    if (p.id === net.you) continue;
    let r = remRigs.get(p.id);
    if (!r) {
      const rl = roleById(p.role);
      r = makeRig({ gender: p.g, ...rl.look[p.g], outfit: rl.id });
      scene.add(r.root);
      remRigs.set(p.id, r);
    }
    setWeapon(r, p.weapon || '');
    const q = net.remote(p.id) || [p.x, p.z];
    const pv = remPrev.get(p.id) || q;
    const sp = Math.hypot(q[0] - pv[0], q[1] - pv[1]) / Math.max(dt, 1e-3);
    remPrev.set(p.id, q);
    r.root.position.set(q[0], 0, q[1]);
    if (sp > 0.2) r.root.rotation.y = Math.atan2(q[0] - pv[0], q[1] - pv[1]);
    r.root.visible = p.on;
    animate(r, p.hp <= 0 ? 'death' : sp > 4 ? 'run' : sp > 0.3 ? 'walk' : 'idle', sp, dt);
  }
  for (const [id, r] of remRigs)
    if (!s.players[id]) {
      scene.remove(r.root);
      remRigs.delete(id);
    }
  for (const e of s.enemies) {
    let r = enRigs.get(e.id);
    if (!r) {
      r = makeRig({ gender: 'm', hair: 0x111111, top: 0x4c5733, bottom: 0x4c5733, shoes: 0x111111, soldier: true });
      scene.add(r.root);
      enRigs.set(e.id, r);
    }
    const o = r.root.position;
    const dx = e.x - o.x,
      dz = e.z - o.z;
    const sp = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
    o.x += dx * Math.min(1, dt * 10);
    o.z += dz * Math.min(1, dt * 10);
    if (Math.hypot(dx, dz) > 0.02) r.root.rotation.y = Math.atan2(dx, dz);
    animate(r, e.hp <= 0 ? 'death' : sp > 2 ? 'run' : sp > 0.2 ? 'walk' : 'idle', Math.min(sp, 4), dt);
  }
  if (coopActive()) {
    for (const [id, loot] of Object.entries(s.loot || {})) {
      let marker = lootRigs.get(id);
      if (!marker) {
        marker = new THREE.Mesh(
          new THREE.BoxGeometry(0.45, 0.45, 0.45),
          new THREE.MeshBasicMaterial({ color: 0x55ffcc }),
        );
        marker.position.set(loot.x, 0.35, loot.z);
        scene.add(marker);
        lootRigs.set(id, marker);
      }
      marker.visible = !s.looted[id];
    }
  }
  const h = document.getElementById('mphud');
  if (h && Object.values(s.players).filter(p => p.on).length < 2)
    h.textContent = tr(
      '🌐 等待第二位玩家載入・共享敵人暫停',
      '🌐 Waiting for a second loaded player · sentries paused',
    );
  else if (h && net.status.startsWith(tr('房間', 'Room')))
    h.textContent =
      getLanguage() === 'en'
        ? `🌐 ${net.status} | ${Object.values(s.players).filter(p => p.on).length}/4 players | tick ${s.tick} | ${(net.bytes / 1024).toFixed(0)} kB received`
        : `🌐 ${net.status}｜${Object.values(s.players).filter(p => p.on).length}/4 人｜tick ${s.tick}｜${(net.bytes / 1024).toFixed(0)} kB 收`;
}
function netAttack() {
  if (!net?.s) return;
  let best = -1,
    bd = coopActive() ? ITEMS[net.s.players[net.you]?.weapon || '']?.range || 1.1 : 1.9;
  for (const e of net.s.enemies) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.x - player.pos.x, e.z - player.pos.z);
    if (d < bd) {
      bd = d;
      best = e.id;
    }
  }
  if (best >= 0) net.cmd({ t: 'attack', target: best } as any);
}
const WRECK_LOOT: [string, number][][] = [
  [
    ['water', 1],
    ['snack', 1],
  ],
  [
    ['bandage', 1],
    ['tissue', 1],
  ],
  [['gas', 2]],
  [
    ['patch', 1],
    ['hose', 1],
  ],
  [
    ['coffee', 1],
    ['noodle', 1],
  ],
  [['carbat', 1]],
];
function spawnDrivables(c: V2) {
  let sd = 977;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  let n = 0,
    bus = 0,
    gb = 0,
    dock = 0;
  const segs: [number, number, number, number, number][] = [];
  for (const rd of roads) {
    const w = ROADW[rd.t.replace('_link', '')] ?? 3;
    if (w < 4) continue;
    for (let i = 0; i < rd.p.length - 1; i++) {
      const [ax, az] = rd.p[i],
        [bx, bz] = rd.p[i + 1];
      const mx = (ax + bx) / 2,
        mz = (az + bz) / 2;
      const d = Math.hypot(mx - c[0], mz - c[1]);
      if (d < 190 && Math.hypot(bx - ax, bz - az) > 8) segs.push([ax, az, bx, bz, w]);
    }
  }
  segs.sort(() => r() - 0.5);
  for (const [ax, az, bx, bz, w] of segs) {
    if (bus || w < 9) continue;
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 16) continue;
    const ux = (bx - ax) / L,
      uz = (bz - az) / L;
    const x = (ax + bx) / 2 - uz * (w / 2 - 1.6),
      z = (az + bz) / 2 + ux * (w / 2 - 1.6);
    if (bldAt(x, z)) continue;
    const v = drive.spawn('bus', x, z, Math.atan2(ux, uz), r);
    if (drive.blocked(v, x, z, v.hd)) {
      scene.remove(v.g);
      drive.list.pop();
      continue;
    }
    bus = 1;
  }
  for (const [ax, az, bx, bz, w] of segs) {
    if (n > 46) break;
    const L = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / L,
      uz = (bz - az) / L,
      nx = -uz,
      nz = ux;
    const hd = Math.atan2(ux, uz);
    const big = w >= 9;
    let kind: DKind = big
      ? (['taxi', 'sedan', 'sedan', 'van', 'kei', 'scooter', 'moto', 'delivery'] as DKind[])[Math.floor(r() * 8)]
      : (['scooter', 'scooter', 'escooter', 'moto', 'delivery', 'basket', 'kei'] as DKind[])[Math.floor(r() * 7)];
    if (big && !bus && r() < 0.3) {
      kind = 'bus';
      bus = 1;
    } else if (!gb && r() < 0.15) {
      kind = 'garbage';
      gb = 1;
    }
    const t = 0.25 + r() * 0.5,
      side = r() < 0.5 ? 1 : -1;
    const two = ['scooter', 'escooter', 'moto', 'delivery', 'basket'].includes(kind);
    const off = two ? w / 2 - 0.5 : w / 2 - 1.3;
    if (big && dock < 1 && r() < 0.25) {
      dock++;
      for (let k = 0; k < 4; k++) {
        const x = ax + ux * (L * t + k * 0.9) + nx * (w / 2 + 0.6) * side,
          z = az + uz * (L * t + k * 0.9) + nz * (w / 2 + 0.6) * side;
        if (bldAt(x, z)) continue;
        const v = drive.spawn('ubike', x, z, hd + Math.PI / 2, r, { docked: true });
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.9, 0.12),
          new THREE.MeshStandardMaterial({ color: 0x2a9a8a }),
        );
        post.position.set(x + Math.sin(hd + Math.PI / 2) * 0.7, 0.45, z + Math.cos(hd + Math.PI / 2) * 0.7);
        scene.add(post);
        void v;
        n++;
      }
      continue;
    }
    const x = ax + ux * L * t + nx * off * side,
      z = az + uz * L * t + nz * off * side;
    if (bldAt(x, z)) continue;
    const v = drive.spawn(
      kind,
      x,
      z,
      two ? hd + (Math.PI / 2) * (r() < 0.7 ? 1 : 0) : hd + (r() < 0.5 ? Math.PI : 0),
      r,
    );
    if (drive.blocked(v, x, z, v.hd)) {
      scene.remove(v.g);
      drive.list.pop();
      continue;
    }
    n++;
  }
}
let lastHp = 100;
let parks: any = null;
let gmap: GameMap | null = null;
function mapIntelOutposts(lbl: string) {
  if (!gmap) return;
  checkpoints.forEach((c, i) => gmap!.intel('out' + i, c[0], c[1], 'out', lbl));
}
// ---------- weather: rain (visual drops, wet ground, optional sound) + rain buckets ----------
const WX = { rainNext: 15 * 60, rainUntil: 0, wet: 0, amt: 0 };
const NR = 2500;
const rainPos = new Float32Array(NR * 6);
const rainG = new THREE.BufferGeometry();
rainG.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMesh = new THREE.LineSegments(
  rainG,
  new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0, depthWrite: false }),
);
rainMesh.frustumCulled = false;
for (let i = 0; i < NR; i++) {
  const x = (Math.random() - 0.5) * 70,
    y = Math.random() * 30,
    z = (Math.random() - 0.5) * 70;
  rainPos.set([x, y, z, x + 0.05, y + 0.7, z + 0.05], i * 6);
}
let rainAudio: { g: GainNode } | null = null;
function startRainAudio() {
  try {
    const ac = new AudioContext();
    markMusic(ac);
    const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5 + (Math.random() * 2 - 1) * 0.04;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = ac.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
    rainAudio = { g };
  } catch {
    /* audio optional */
  }
}
const raining = () => gameMin < WX.rainUntil;
const bucketMat = new THREE.MeshStandardMaterial({ color: 0x2a6ab8, roughness: 0.5 });
const waterTopMat = new THREE.MeshStandardMaterial({ color: 0x6a8aa0, roughness: 0.1, metalness: 0.3 });
function makeBucket(id: string, p: V2, items: Record<string, number> = {}) {
  const c = makeCont(id, p, 'crate', undefined, items);
  (c.mesh.parent || scene).remove(c.mesh);
  const m = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.48, 14, 1, true), bucketMat);
  body.position.y = 0.24;
  const bot = new THREE.Mesh(new THREE.CircleGeometry(0.24, 14).rotateX(-Math.PI / 2), bucketMat);
  bot.position.y = 0.01;
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.28, 14).rotateX(-Math.PI / 2), waterTopMat);
  top.name = 'w';
  m.add(body, bot, top);
  bucketMat.side = THREE.DoubleSide;
  m.position.set(p[0], 0, p[1]);
  m.traverse(o => (o.castShadow = true));
  scene.add(m);
  c.mesh = m as any;
  c.label = '雨水桶';
  (c as any).rain = 0;
  return c;
}
function updateWeather(dt: number, gm: number) {
  if (gameMin >= WX.rainNext && !raining()) {
    WX.rainUntil = gameMin + 60 * (1.5 + rnd() * 4);
    WX.rainNext = WX.rainUntil + 60 * (8 + rnd() * 28);
    log(
      tr('🌧 開始下雨了。外面的水桶會接到雨水。', '🌧 It has started raining. Buckets outside will collect rainwater.'),
      '#9fd0ff',
    );
  }
  const r = raining();
  WX.amt += ((r ? 1 : 0) - WX.amt) * Math.min(1, dt * 0.5);
  WX.wet = clamp(WX.wet + (r ? gm * 1.5 : -gm * 0.25), 0, 1);
  if (r)
    for (const c of conts)
      if (c.label === '雨水桶') {
        (c as any).rain += gm;
        if ((c as any).rain >= 0.75) {
          (c as any).rain = 0;
          if ((c.items.rainwater || 0) < 6) c.items.rainwater = (c.items.rainwater || 0) + 1;
        }
      }
  for (const c of conts)
    if (c.label === '雨水桶') {
      const w = (c.mesh as any).getObjectByName?.('w');
      if (w) {
        w.position.y = 0.04 + 0.4 * Math.min(1, (c.items.rainwater || 0) / 6);
        w.visible = !!c.items.rainwater;
      }
    }
  (rainMesh.material as THREE.LineBasicMaterial).opacity = WX.amt * 0.45;
  rainMesh.visible = WX.amt > 0.02;
  if (rainMesh.visible) {
    rainMesh.position.set(player.pos.x, 0, player.pos.z);
    const fall = dt * 22;
    for (let i = 0; i < NR; i++) {
      const o = i * 6;
      rainPos[o + 1] -= fall;
      rainPos[o + 4] -= fall;
      if (rainPos[o + 1] < 0) {
        rainPos[o + 1] += 30;
        rainPos[o + 4] += 30;
      }
    }
    rainG.attributes.position.needsUpdate = true;
  }
  const wet = WX.wet;
  roadMat.roughness = 0.95 - wet * 0.65;
  roadMat.metalness = wet * 0.25;
  roadMat.color.setScalar(1 - wet * 0.35);
  groundMat.roughness = 1 - wet * 0.55;
  groundMat.color.setScalar(1 - wet * 0.3);
  decay?.setWet(WX.wet);
  if (rainAudio) rainAudio.g.gain.value = WX.amt * 0.12;
}
// ---------- airdrop ----------
let smoke: THREE.Points | null = null;
let dropCont: Cont | null = null;

// ---------- 聯絡人 informant + boat route ----------
type InfState = {
  fake: boolean;
  anc: number;
  spot: number;
  talked: number;
  rvT: number;
  scouted: number;
  saw: number;
  verified: number;
  trap: number;
  esc: number;
  hid: V2 | null;
  caught: number;
  elder: number;
  done: number;
};
let INF: InfState = {
  fake: false,
  anc: 0,
  spot: 0,
  talked: 0,
  rvT: 0,
  scouted: 0,
  saw: 0,
  verified: 0,
  trap: 0,
  esc: 0,
  hid: null,
  caught: 0,
  elder: 0,
  done: 0,
};
let infRig: Rig | null = null,
  elderRig: Rig | null = null;
let infPos: V2 = [0, 0],
  elderPos: V2 = [0, 0];
let RV: { p: V2; n: string }[] = [];
let trapT = 0,
  trapSols: Sol[] = [];
const infFx: THREE.Object3D[] = [];
const ANC = [
  tr('龍山寺廟口', 'Longshan Temple entrance'),
  tr('柑仔店後巷', 'Alley behind the corner shop'),
  tr('鄰里公園', 'Neighborhood park'),
];
function freeNear(p: V2, r = 3): V2 {
  for (let k = 0; k < 300; k++) {
    const a = k * 2.4,
      d = ((k * 0.15) % r) + 0.5;
    const q: V2 = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];
    if (!bldAt(q[0], q[1]) && !bldAt(q[0] + 0.8, q[1]) && !bldAt(q[0], q[1] + 0.8)) return q;
  }
  return p;
}
function setupInformant(st: V2, first: boolean) {
  if (first)
    INF = {
      ...INF,
      fake: Math.random() < 0.3,
      anc: Math.floor(Math.random() * 3),
      spot: Math.floor(Math.random() * 3),
    };
  const z0 = st[1];
  RV = [
    [tr('淡水河岸', 'Tamsui River bank'), -220, -70],
    [tr('碼頭（大稻埕式）', 'Wharf (Dadaocheng style)'), -70, 70],
    [tr('萬華河堤缺口', 'Gap in the Wanhua levee'), 70, 220],
  ].map(([n, a, b]) => {
    let best: V2 | null = null;
    for (const r of roads)
      for (const q of r.p)
        if (
          q[1] - z0 > (a as number) &&
          q[1] - z0 < (b as number) &&
          q[0] > bounds.minx + 8 &&
          !bldAt(q[0], q[1]) &&
          (!best || q[0] < best[0])
        )
          best = q;
    return { n: n as string, p: freeNear(best || [bounds.minx + 20, z0]) };
  });
  const near = roads
    .flatMap(r => r.p)
    .filter(q => Math.hypot(q[0] - st[0], q[1] - st[1]) > 25 && Math.hypot(q[0] - st[0], q[1] - st[1]) < 90);
  const pk = parks?.clusters?.[0] as V2 | undefined;
  const base: V2 =
    INF.anc === 2 && pk
      ? pk
      : near.length
        ? near[Math.floor(hh2i(INF.anc * 7 + 3) * near.length)]
        : [st[0] + 20, st[1]];
  infPos = INF.hid || freeNear(base);
  elderPos = freeNear([st[0] + 9, st[1] - 6]);
  infRig = spawnRig({
    gender: 'm',
    hair: 0x1a1a1a,
    top: 0x4a4038,
    bottom: 0x2a2a30,
    shoes: 0x202020,
    jacket: 0x3a3428,
  });
  infRig.root.position.set(infPos[0], 0, infPos[1]);
  elderRig = spawnRig({ gender: 'm', hair: 0xcccccc, top: 0xe8e2d4, bottom: 0x3a4050, shoes: 0x6a5a40 });
  elderRig.root.position.set(elderPos[0], 0, elderPos[1]);
  if (INF.caught || INF.done) infRig.root.visible = false;
}
const hh2i = (n: number) => {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5;
  return x - Math.floor(x);
};
const hhmm = (m: number) =>
  getLanguage() === 'en'
    ? `Day ${Math.floor(m / 1440) + 1} ${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:00`
    : `第 ${Math.floor(m / 1440) + 1} 天 ${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:00`;
function dlg(title: string, text: string, btns: [string, () => void][]) {
  let d = document.getElementById('dlg');
  if (!d) {
    d = document.createElement('div');
    d.id = 'dlg';
    document.body.appendChild(d);
  }
  d.innerHTML = `<b>${title}</b><p>${text}</p><div></div>`;
  const bx = d.lastElementChild!;
  for (const [l, f] of btns.concat([[tr('離開', 'Leave'), () => {}]])) {
    const b = document.createElement('button');
    b.textContent = l;
    b.onclick = () => {
      d!.remove();
      f();
    };
    bx.appendChild(b);
  }
}
function rvLine() {
  const r = RV[INF.spot];
  const sec = sectorNames[sectorOf(r.p[0], r.p[1])] || tr('萬華', 'Wanhua');
  return INF.fake
    ? getLanguage() === 'en'
      ? `${hhmm(INF.rvT)}, ${r.n}. Take “Wanhua Zhongzheng 1st Road”—it is fastest. Just past the third traffic light. <b>Come alone and leave all your weapons behind</b>. No guns on the boat. Tell no one.`
      : `${hhmm(INF.rvT)}，${r.n}。走「萬華中正一路」最快，過了第三個紅綠燈就到。<b>一個人來，武器全部留下</b>，帶槍的船不載。別跟任何人說。`
    : getLanguage() === 'en'
      ? `${hhmm(INF.rvT)}, ${r.n} (near ${sec}). From the end of Xiyuan Road, take Huanhe South Road. Pass the floodgate and follow the levee down—it is under the metal sheet. The boat waits only ten minutes. Bring water, medicine, and your knife.`
      : `${hhmm(INF.rvT)}，${r.n}（${sec}一帶）。從西園路尾走環河南路，過了水門沿堤防往下，鐵板下面就是。船只等十分鐘，水和藥帶在身上，刀也帶著。`;
}
function talkInformant() {
  if (INF.hid && !INF.caught) {
    INF.caught = 1;
    infRig!.root.visible = false;
    const reveal = Math.random() < 0.5;
    addItem('a556', 20);
    if (reveal) {
      INF.fake = false;
      INF.spot = (INF.spot + 1) % 3;
      INF.rvT = nextNight();
      INF.trap = 0;
      INF.esc = 0;
      INF.scouted = 0;
      dlg(
        tr('抓到假聯絡人', 'False contact captured'),
        getLanguage() === 'en'
          ? `He drops to his knees, begging: “I’ll talk! The real boat is at ${RV[INF.spot].n}, at ${hhmm(INF.rvT)}!”`
          : `他跪地求饒：「我說、我說！真的船在 ${RV[INF.spot].n}，${hhmm(INF.rvT)}！」`,
        [],
      );
    } else {
      const sec = Math.min(NSEC - 1, sectorOf(infPos[0], infPos[1]));
      for (const s of sols)
        if (s.sector === sec && s.state !== 'dead' && Math.random() < 0.5) {
          s.state = 'dead';
          s.hp = 0;
          s.mesh.visible = false;
          s.cone.visible = false;
        }
      liberated.add(sec);
      dlg(
        tr('抓到假聯絡人', 'False contact captured'),
        getLanguage() === 'en'
          ? `He revealed the occupation outpost in ${sectorNames[sec]}. The underground resistance raided it overnight—<b>${sectorNames[sec]} has been reclaimed!</b>`
          : `他供出了 ${sectorNames[sec]} 的佔領軍前哨位置。地下抵抗網連夜突襲——<b>${sectorNames[sec]} 已奪回！</b>`,
        [],
      );
    }
    return;
  }
  if (INF.done) return;
  if (!INF.talked) {
    INF.talked = 1;
    INF.rvT = nextNight();
  }
  const opts: [string, () => void][] = [];
  if (!INF.verified)
    opts.push([tr('用收音機向「自由之聲」查證', 'Verify with “Voice of Freedom” by radio'), verifyInf]);
  dlg(
    tr('🕶 聯絡人（', '🕶 Contact（') + ANC[INF.anc] + '）',
    tr(
      '「噓——聽說你想離開台北？有艘橡皮艇今晚走淡水河出海。」<br>',
      '“Shh—heard you want to leave Taipei? An inflatable boat is heading out to sea along the Tamsui River tonight.”<br>',
    ) + rvLine(),
    opts,
  );
}
function nextNight() {
  const d = Math.floor(gameMin / 1440) * 1440;
  let t = d + 22 * 60;
  if (gameMin > t - 60) t += 1440;
  return t;
}
function verifyInf() {
  const cost = player.inv.radio
    ? ['radio']
    : ['water', 'can', 'ration', 'noodle', 'cupnoodle', 'rice'].filter(k => player.inv[k]).slice(0, 2);
  if (!player.inv.radio && cost.length < 2) {
    log(
      tr(
        '需要收音機，或兩份食物／水交換頻道時段',
        'You need a radio, or two portions of food / water to trade for the channel and time',
      ),
      '#f99',
    );
    return;
  }
  for (const k of cost) {
    if (--player.inv[k] <= 0) delete player.inv[k];
  }
  INF.verified = 1;
  if (INF.fake) INF.saw = 1;
  phone(
    tr('📻 自由之聲（加密頻道）', '📻 Voice of Freedom (encrypted channel)'),
    INF.fake
      ? tr(
          '我們沒有派人在那裡接應。那個人是佔領軍的假聯絡人——別去，或者……讓他們嚐嚐自己的陷阱。',
          'We sent no one to meet you there. That contact is an occupation plant—stay away, or… turn their own trap against them.',
        )
      : tr('確認：那艘船是我們的人。準時到，祝你平安。', 'Confirmed: that boat is ours. Be there on time. Stay safe.'),
  );
}
function talkElder() {
  INF.elder = 1;
  dlg(
    tr('👴 廟口阿伯', '👴 Old man at the temple'),
    INF.fake
      ? tr(
          '「那個戴鴨舌帽的少年仔？講話不是萬華腔，連華西街在哪都說不清楚，還一直問誰家有槍……你自己卡注意。」',
          '“That young fellow in the cap? He doesn’t sound like he is from Wanhua. Can’t even tell you where Huaxi Street is, and keeps asking who has a gun… Watch yourself.”',
        )
      : tr(
          '「那個人喔，以前在華西街幫人顧攤，嘴巴緊。他講的話可以信。」',
          '“That man? He used to mind stalls on Huaxi Street. Knows how to keep his mouth shut. You can trust him.”',
        ),
    [],
  );
}
function npcInteract() {
  const P = player.pos;
  if (infRig?.root.visible && Math.hypot(P.x - infPos[0], P.z - infPos[1]) < 2.4) {
    talkInformant();
    return true;
  }
  if (elderRig && Math.hypot(P.x - elderPos[0], P.z - elderPos[1]) < 2.4) {
    talkElder();
    return true;
  }
  return false;
}
function npcPrompt() {
  const P = player.pos;
  if (infRig?.root.visible && Math.hypot(P.x - infPos[0], P.z - infPos[1]) < 2.4)
    return INF.hid
      ? tr('[E] 抓住假聯絡人', '[E] Grab the false contact')
      : tr('[E] 和聯絡人交談', '[E] Talk to the contact');
  if (elderRig && Math.hypot(P.x - elderPos[0], P.z - elderPos[1]) < 2.4)
    return tr('[E] 和廟口阿伯聊天', '[E] Chat with the old man at the temple');
  return '';
}
function infMark(p: V2, col: number, txt: string) {
  gmap?.intel('inf' + Math.round(p[0]) + ',' + Math.round(p[1]), p[0], p[1], 'dng', txt.slice(0, 14));
  const r = new THREE.Mesh(
    new THREE.RingGeometry(5, 6, 32),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  r.rotation.x = -Math.PI / 2;
  r.position.set(p[0], 0.07, p[1]);
  scene.add(r);
  infFx.push(r);
  log(txt, '#ffb0a0');
}
function springTrap(aware: boolean) {
  const p = RV[INF.spot].p;
  INF.trap = 1;
  trapT = aware ? 0 : 3;
  const cand = sols
    .filter(s => s.state !== 'dead' && !s.post)
    .sort((a, b) => Math.hypot(a.pos.x - p[0], a.pos.z - p[1]) - Math.hypot(b.pos.x - p[0], b.pos.z - p[1]))
    .slice(0, 4);
  trapSols = cand;
  cand.forEach((s, i) => {
    const a = i * 1.57 + 0.4;
    s.pos.set(p[0] + Math.cos(a) * 16, 0, p[1] + Math.sin(a) * 16);
    s.mesh.visible = true;
    if (aware) {
      s.state = 'patrol';
      s.post = [s.pos.x, s.pos.z];
      s.route = [
        [s.pos.x, s.pos.z],
        [s.pos.x + 1, s.pos.z],
      ];
    } else {
      s.state = 'investigate';
      s.target = [p[0], p[1]];
      s.timer = 600;
    }
  });
  const van = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4.6), new THREE.MeshStandardMaterial({ color: 0x2a2e2a }));
  van.position.set(p[0] + 7, 1, p[1] + 3);
  van.castShadow = true;
  scene.add(van);
  infFx.push(van);
  if (aware) {
    const c = makeCont('ambush', [p[0] + 7, p[1] + 6.5], 'crate', undefined, {
      rifle: 1,
      a556: 40,
      medkit: 1,
      ration: 2,
    });
    c.label = '伏兵裝備箱';
    log(
      tr(
        '你看穿了陷阱：伏兵還沒發現你。反伏擊，拿走他們的裝備！',
        'You saw through the trap. The ambushers have not spotted you yet. Turn the ambush on them and take their gear!',
      ),
      '#ffd27a',
    );
  } else {
    phone(
      tr('⚠ 陷阱！', '⚠ A trap!'),
      tr(
        '岸邊四周的手電筒同時亮起——沒有船。快跑！鑽進巷子、騎樓，或者跳進河裡！',
        'Flashlights flare all around the bank—there is no boat. Run! Duck into an alley or arcade, or jump into the river!',
      ),
    );
    slowDown(tr('陷阱', 'Trap'));
  }
}
function updateInformant(dt: number) {
  if (!infRig) return;
  const P = player.pos;
  for (const [rg, q] of [
    [infRig, infPos],
    [elderRig!, elderPos],
  ] as const) {
    rg.root.rotation.y = Math.atan2(P.x - q[0], P.z - q[1]);
    animate(rg, 'idle', 0, dt);
  }
  if (!INF.talked || INF.done) return;
  const r = RV[INF.spot];
  const d = Math.hypot(P.x - r.p[0], P.z - r.p[1]);
  if (!INF.scouted && d < 30 && gameMin < INF.rvT - 30) {
    INF.scouted = 1;
    if (INF.fake) {
      INF.saw = 1;
      const v = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4.6), new THREE.MeshStandardMaterial({ color: 0x2a2e2a }));
      v.position.set(r.p[0] + 7, 1, r.p[1] + 3);
      scene.add(v);
      infFx.push(v);
      log(
        tr(
          '偵察：岸邊停著一台沒熄火的廂型車，泥地上沒有任何拖船痕跡……不對勁。',
          'Recon: a van sits by the bank with its engine running. No boat-drag marks in the mud… Something is wrong.',
        ),
        '#ffb0a0',
      );
    } else {
      const b = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.6, 2.4, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a2a2a }),
      );
      b.rotation.z = Math.PI / 2;
      b.position.set(r.p[0] - 3, 0.4, r.p[1]);
      scene.add(b);
      infFx.push(b);
      log(
        tr(
          '偵察：堤防下藏著一艘橡皮艇，泥地有新鮮的拖行痕跡。',
          'Recon: an inflatable boat is hidden below the levee. Fresh drag marks lead through the mud.',
        ),
        '#a0ffb0',
      );
    }
  }
  const win = gameMin >= INF.rvT && gameMin < INF.rvT + 180;
  if (win && d < 6 && !INF.trap && !INF.esc) {
    if (INF.fake) springTrap(!!INF.saw);
    else {
      INF.done = 1;
      doEvac('boat');
      return;
    }
  }
  if (INF.trap && !INF.esc) {
    if (trapT > 0) {
      trapT -= dt;
      if (trapT <= 0)
        trapSols.forEach(s => {
          if (s.state !== 'dead') {
            s.state = 'combat';
            s.alert = 1;
          }
        });
    }
    const river = P.x < bounds.minx + 3;
    if (!INF.saw && (d > 45 || river)) {
      INF.esc = 1;
      infMark(
        r.p,
        0xff2020,
        river
          ? tr(
              '你跳進冰冷的淡水河，順流漂離伏擊點。此處標記為危險區。',
              'You jump into the icy Tamsui River and drift downstream, away from the ambush. This location is marked as dangerous.',
            )
          : tr(
              '你甩掉了追兵。此處標記為危險區——佔領軍掌握了你的行蹤。',
              'You lost your pursuers. This location is marked as dangerous—the occupation forces know where you have been.',
            ),
      );
      if (river) P.x = bounds.minx + 6;
      sols
        .filter(s => s.state !== 'dead' && !s.post)
        .slice(0, 4)
        .forEach(s => {
          s.state = 'investigate';
          s.target = [P.x, P.z];
          s.timer = 600;
        });
      INF.hid = freeNear([infPos[0] + 40 * (Math.random() - 0.5), infPos[1] + 40 * (Math.random() - 0.5)]);
      infPos = INF.hid;
      infRig.root.position.set(infPos[0], 0, infPos[1]);
      phone(
        tr('📻 自由之聲', '📻 Voice of Freedom'),
        getLanguage() === 'en'
          ? `Someone spotted the contact who betrayed you hiding near ${sectorNames[sectorOf(infPos[0], infPos[1])]}. Catch him!`
          : `有人看到那個出賣你的聯絡人躲在 ${sectorNames[sectorOf(infPos[0], infPos[1])]} 一帶。抓住他！`,
      );
    }
    if (INF.saw && trapSols.every(s => s.state === 'dead')) {
      INF.esc = 1;
      log(
        tr(
          '伏兵全滅。假聯絡人逃回街區躲了起來……',
          'All ambushers defeated. The false contact fled back into the neighborhood to hide…',
        ),
        '#ffd27a',
      );
      INF.hid = freeNear([infPos[0] + 30, infPos[1] - 20]);
      infPos = INF.hid;
      infRig.root.position.set(infPos[0], 0, infPos[1]);
    }
  }
}
function airdrop(at?: V2) {
  let p: V2 | null = at || null;
  for (let k = 0; !p && k < 200; k++) {
    const a = rnd() * Math.PI * 2,
      d = 45 + rnd() * 30;
    const q: V2 = [player.pos.x + Math.cos(a) * d, player.pos.z + Math.sin(a) * d];
    if (!bldAt(q[0], q[1]) && !bldAt(q[0] + 1.5, q[1]) && !bldAt(q[0], q[1] + 1.5)) p = q;
  }
  if (!p) return;
  (UT as any).ad = p;
  dropCont = makeCont('airdrop', p, 'crate', undefined, {
    medkit: 2,
    ration: 4,
    water: 4,
    bandage: 3,
    pistol: 1,
    a9: 24,
    can: 3,
    fpv: 1,
    ...(ROC.unlocked
      ? { t91: 1, stanag: 2, a556n: 30, at4: 1, ...(Math.random() < 0.25 ? { jav: 1, javm: 1 } : {}) }
      : {}),
  });
  dropCont.label = '空投物資箱';
  dropCont.mesh.scale.set(1.6, 2.4, 1.6);
  dropCont.mesh.position.y = 0.48;
  const N = 160;
  const g = new THREE.BufferGeometry();
  const pp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++)
    pp.set([p[0] + (Math.random() - 0.5), Math.random() * 14, p[1] + (Math.random() - 0.5)], i * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  smoke = new THREE.Points(
    g,
    new THREE.PointsMaterial({ color: 0xff3a2a, size: 1.6, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  smoke.frustumCulled = false;
  scene.add(smoke);
  // PLA contests the drop: nearest active patrols head there
  const cand = sols
    .filter(s => s.state !== 'dead' && !s.post && (!s.night || isNight()))
    .sort((a, b) => Math.hypot(a.pos.x - p![0], a.pos.z - p![1]) - Math.hypot(b.pos.x - p![0], b.pos.z - p![1]))
    .slice(0, 4);
  cand.forEach((s, i) => {
    if (Math.hypot(s.pos.x - p![0], s.pos.z - p![1]) > 60) {
      const a = i * 1.6;
      s.pos.set(p![0] + Math.cos(a) * 32, 0, p![1] + Math.sin(a) * 32);
    }
    s.state = 'investigate';
    s.target = [p![0] + (rnd() - 0.5) * 4, p![1] + (rnd() - 0.5) * 4];
    s.timer = 900;
  });
  slowDown(tr('空投落地', 'Airdrop landed'));
}
function updateSmoke(dt: number) {
  if (!smoke) return;
  const a = smoke.geometry.attributes.position as THREE.BufferAttribute;
  const pp = a.array as Float32Array;
  const p = (UT as any).ad as V2;
  for (let i = 0; i < pp.length; i += 3) {
    pp[i + 1] += dt * 2.2;
    pp[i] += dt * 0.8;
    if (pp[i + 1] > 16) {
      pp[i] = p[0] + (Math.random() - 0.5);
      pp[i + 1] = 0.5;
      pp[i + 2] = p[1] + (Math.random() - 0.5);
    }
  }
  a.needsUpdate = true;
  if (dropCont && !Object.keys(dropCont.items).length) {
    scene.remove(smoke);
    smoke = null;
  }
}
// ---------- PLA flashlights during curfew ----------
const plaFlash: THREE.SpotLight[] = [];
let gameMin = 8 * 60; // minutes since day 1 00:00
const isNight = () => {
  const h = (gameMin / 60) % 24;
  return h < 6 || h >= 20;
}; // 宵禁 20:00–06:00
// ---------- time system (PZ-style): day length + fast-forward ----------
let DAYH = 1;
const MPS = () => 1440 / (DAYH * 3600); // game minutes per real second
let speed = 1;
let metro: Station[] = [];
let paused = false;
let NOSAVE = false;
// v22 survival layer state (saved; day events seeded by day number)
let surv: SV.SurvState = SV.newSurv();
let survOpen = false;
let survDay = -1; // v21.5.1 menu pause (local only)
const SPEEDS = [1, 3, 20];
function dangerNear() {
  return sols.some(
    s =>
      s.state !== 'dead' &&
      s.mesh.visible &&
      (s.state === 'combat' ||
        (s.state === 'investigate' && s.pos.distanceTo(player.pos) < 40) ||
        s.pos.distanceTo(player.pos) < 18),
  );
}
function renderSpeed() {
  const el = document.getElementById('speed');
  if (!el) return;
  el.querySelectorAll('button').forEach(b =>
    b.classList.toggle('on', +(b as HTMLElement).dataset.s! === (player.sleeping ? 20 : speed)),
  );
  (el.querySelector('.st') as HTMLElement).textContent = player.sleeping
    ? tr('💤 睡眠快轉', '💤 Sleep fast-forward')
    : speed > 1
      ? `⏩ ×${speed}`
      : '▶ ×1';
}
function setSpeed(v: number) {
  if (v > 1 && dangerNear()) {
    log(tr('附近有敵情，無法快轉', 'Enemies nearby—cannot fast-forward'), '#f99');
    v = 1;
  }
  speed = v;
  renderSpeed();
}
function slowDown(why: string) {
  if (speed > 1) {
    speed = 1;
    log(getLanguage() === 'en' ? `⏸ Normal speed restored: ${why}` : `⏸ 時間恢復正常：${why}`, '#ffb060');
    renderSpeed();
  }
  if (player.sleeping) {
    player.sleeping = false;
    log(getLanguage() === 'en' ? `You wake with a start! (${why})` : `你被驚醒了！（${why}）`, '#f66');
    renderSpeed();
  }
}
const solActive = (s: Sol, night: boolean) => (!s.night || night) && (!s.day || !night);
// ---------- v22.11 PLA radio net: a contact pulls nearby idle squads; callouts are audible / logged ----------
let radioCd = 0;
const aiStats = { radio: 0, flank: 0, retreat: 0, search: 0, grenades: 0, grenHit: 0, campMax: 0 };
function radio(p: V2, from: Sol | null, what = tr('發現目標', 'Target spotted')) {
  if (radioCd > 0) return;
  radioCd = SQ.AI.radioCd;
  aiStats.radio++;
  const ox = from ? from.pos.x : p[0],
    oz = from ? from.pos.z : p[1];
  let n = 0;
  for (const o of sols) {
    if (o === from || o.state === 'dead' || o.state === 'combat' || !solActive(o, isNight()) || o.post) continue;
    if (Math.hypot(o.pos.x - ox, o.pos.z - oz) > SQ.AI.radioR) continue;
    o.state = 'investigate';
    o.target = [p[0], p[1]];
    o.timer = 25;
    o.alert = Math.max(o.alert, 0.6);
    n++;
  }
  const d = Math.hypot(player.pos.x - ox, player.pos.z - oz);
  if (d < 40) {
    AU.radio(d);
    log(
      getLanguage() === 'en'
        ? `(Radio) “${what}, requesting support!”${n ? `—${n} nearby soldiers are on their way` : ''}`
        : `（無線電）「${what}，請求支援！」${n ? `——附近 ${n} 名士兵正趕來` : ''}`,
      '#f9a',
    );
  }
}
function callout(s: Sol, msg: string) {
  const d = s.pos.distanceTo(player.pos);
  if (d > 35) return;
  AU.radio(d);
  log(getLanguage() === 'en' ? `(Radio) “${msg}”` : `（無線電）「${msg}」`, '#f9a');
}
// ---------- v22.11 grenades: flush a player who camps out of sight ----------
type Gren = { s: V2; p: V2; t: number; fuse: number; mesh: THREE.Mesh; w?: { g: THREE.Group; on: boolean } };
const grens: Gren[] = [];
const grenGeo = new THREE.SphereGeometry(0.09, 8, 6),
  grenMat = new THREE.MeshStandardMaterial({ color: 0x2f3a26, roughness: 0.7 });
let grenCd = 12,
  campT = 0;
const campAt = new THREE.Vector3();
function throwGrenade(s: Sol) {
  grenCd = SQ.AI.grenCd;
  aiStats.grenades++;
  // lands near the last-known spot with a small, deterministic scatter
  const j = (s.id * 37 + aiStats.grenades * 11) % 7;
  const p: V2 = [s.lastSeen![0] + ((j % 3) - 1) * 0.9, s.lastSeen![1] + (Math.floor(j / 3) - 1) * 0.9];
  const mesh = new THREE.Mesh(grenGeo, grenMat);
  scene.add(mesh);
  grens.push({ s: [s.pos.x, s.pos.z], p, t: 0, fuse: SQ.AI.grenFuse, mesh });
  s.rig.shoveT = 0.35; // overhand throw reads from the shove pose
  callout(s, tr('手榴彈！', 'Grenade!'));
  log(tr('⚠ 手榴彈！快離開紅圈', '⚠ Grenade! Get out of the red circle'), '#f66');
}
function updateGrenades(dt: number, night: boolean) {
  grenCd -= dt;
  radioCd -= dt;
  // camping: player stays within 2.5 m, out of every soldier's sight, while a squad knows roughly where
  if (player.pos.distanceTo(campAt) > 2.5) {
    campAt.copy(player.pos);
    campT = 0;
  }
  const near = (q?: V2) => !!q && Math.hypot(q[0] - player.pos.x, q[1] - player.pos.z) < 5;
  const hunters = sols.filter(
    s =>
      solActive(s, night) &&
      ((s.state === 'combat' && near(s.lastSeen)) || (s.state === 'investigate' && s.alert >= 0.5 && near(s.target))),
  );
  if (hunters.length && !hunters.some(s => s.aiming)) campT += dt;
  else campT = Math.max(0, campT - dt * 2);
  aiStats.campMax = Math.max(aiStats.campMax, campT);
  if (campT > SQ.AI.grenCamp && grenCd <= 0) {
    const th = hunters.find(s => {
      const d = s.pos.distanceTo(player.pos);
      return d > SQ.AI.grenMin && d < SQ.AI.grenMax && !(s.stun! > 0) && !s.retreatT;
    });
    if (th) {
      if (!th.lastSeen) th.lastSeen = [th.target![0], th.target![1]];
      throwGrenade(th);
      campT = 0;
    }
  }
  for (let i = grens.length - 1; i >= 0; i--) {
    const g = grens[i];
    if (g.t < SQ.AI.grenFlight) {
      g.t += dt;
      const u = Math.min(1, g.t / SQ.AI.grenFlight);
      g.mesh.position.set(
        g.s[0] + (g.p[0] - g.s[0]) * u,
        1.6 + 4 * u * (1 - u) - 1.5 * u,
        g.s[1] + (g.p[1] - g.s[1]) * u,
      );
      if (u >= 1) {
        g.w = blastFx.warn(g.p[0], g.p[1], SQ.AI.grenCore, SQ.AI.grenWound);
        AU.clink(Math.hypot(player.pos.x - g.p[0], player.pos.z - g.p[1]));
      }
      continue;
    }
    g.fuse -= dt;
    if (g.fuse > 0) continue;
    grens.splice(i, 1);
    scene.remove(g.mesh);
    blastFx.unwarn(g.w);
    const p = new THREE.Vector3(g.p[0], 0.3, g.p[1]);
    blastFx.explode(p, 0.55);
    const dp = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    AU.shellBoom(dp, !!bldAt(player.pos.x, player.pos.z), 0.5);
    blastFx.kick(dp, 0.5);
    noise(p.x, p.z, 40);
    for (const o of sols)
      if (o.state !== 'dead') {
        const d = Math.hypot(o.pos.x - p.x, o.pos.z - p.z);
        if (d < SQ.AI.grenWound) damageSol(o, SQ.grenadeDmg(d), true);
      }
    let dmg = SQ.grenadeDmg(dp);
    if (dmg <= 0) continue;
    if (bldAt(p.x, p.z) !== bldAt(player.pos.x, player.pos.z)) dmg *= 0.2;
    else if (findCover(player.pos.x, player.pos.z, 1.2) && dp > 1.5) dmg *= 0.6;
    aiStats.grenHit++;
    player.hp -= dmg;
    player.rig.hurtT = 0.4;
    flashRed();
    if (dmg > 15 && !player.bleed) {
      player.bleed = true;
      log(tr('被手榴彈破片擊中，流血了！', 'Grenade fragments hit you. You are bleeding!'), '#f66');
    }
  }
}
// v22.11 squads re-formed every frame from soldiers in combat (sorted by id → identical on every client)
function assignSquads(night: boolean) {
  const cs = sols.filter(s => s.state === 'combat' && solActive(s, night) && s.mesh.visible);
  for (const g of SQ.squads(cs.map(s => Object.assign(s, { x: s.pos.x, z: s.pos.z })) as (Sol & SQ.SquadMember)[]))
    g.forEach((s, i) => {
      const role = SQ.roleOf(i, g.length);
      if ((role === 'flankL' || role === 'flankR') && s.role !== role && s.flankT === undefined) {
        s.flankT = SQ.AI.flankT;
        aiStats.flank++;
        callout(s, role === 'flankL' ? tr('左翼包抄！', 'Flank left!') : tr('右翼包抄！', 'Flank right!'));
      }
      s.role = role;
      s.slot = i;
      s.sqN = g.length;
    });
}
// v23.0 interior dressing: build near the player (≤2 per tick), hide when far, dispose beyond 70 m
const clutLive = new Set<Bld>();
const savedF = new Map<string, Record<string, number>>();
let clutT = 0;
function clutterTick(dt: number) {
  clutT -= dt;
  if (clutT > 0) return;
  clutT = 0.3;
  const P = player.pos;
  let budget = 2;
  const cand: [Bld, number][] = [];
  for (const b of blds) {
    const C = (b as any).clut as CL.Plan | undefined;
    if (!C) continue;
    const d = Math.max(b.minx - P.x, P.x - b.maxx, b.minz - P.z, P.z - b.maxz, 0);
    const g = (b as any).clutG as THREE.Group | undefined;
    if (g) {
      g.visible = d < 40;
      if (d > 70) {
        CL.dispose(g);
        (b as any).clutG = undefined;
        clutLive.delete(b);
      }
    } else if (d < 28) cand.push([b, d]);
  }
  cand.sort((a, b) => a[1] - b[1]);
  for (const [b] of cand) {
    if (budget-- <= 0) break;
    const C = (b as any).clut as CL.Plan;
    const g = CL.build(C);
    scene.add(g);
    (b as any).clutG = g;
    clutLive.add(b);
    if (!(b as any).clutC) {
      (b as any).clutC = 1;
      for (const k of C.conts) {
        if (conts.some(c => c.id === k.id)) continue;
        let x = k.seed >>> 0;
        const r = () => (x = (x * 1664525 + 1013904223) >>> 0) / 4294967296;
        const items = savedF.get(k.id) ?? rollLoot(k.loot, r);
        const c = makeCont(k.id, k.p, 'crate', b, items);
        c.label = k.label;
        c.mesh.visible = false; // the furniture itself is the container
      }
    }
  }
  CL.clutterStats.live = clutLive.size;
}
function noise(x: number, z: number, r: number) {
  if (started && r >= 10) {
    const d = Math.hypot(player.pos.x - x, player.pos.z - z);
    if (d > 1.5 && d < r + 10) slowDown(tr('附近有聲響', 'Noise nearby'));
  }
  for (const s of sols)
    if (s.state !== 'dead' && s.state !== 'combat' && solActive(s, isNight()) && s.mesh.visible) {
      if (Math.hypot(s.pos.x - x, s.pos.z - z) < r) {
        s.state = 'investigate';
        s.target = [x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3];
        s.timer = 20;
      }
    }
}
function log(msg: string, col = '#e8e2d0', cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = msg;
  d.style.color = col;
  $('log').prepend(d);
  setTimeout(() => (d.style.opacity = '0'), 7000);
  setTimeout(() => d.remove(), 8200);
  while ($('log').children.length > 8) $('log').lastChild!.remove();
}

// ---------- effects ----------
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true });
const fx: { o: THREE.Object3D; t: number }[] = [];
function tracer(a: THREE.Vector3, b: THREE.Vector3) {
  const g = new THREE.BufferGeometry().setFromPoints([a.clone().setY(1.2), b.clone().setY(1.2)]);
  const l = new THREE.Line(g, tracerMat);
  scene.add(l);
  fx.push({ o: l, t: 0.08 });
}

// ---------- input ----------
initJoystick(MOBILE);
const keys: Record<string, boolean> = {};
let mouse = new THREE.Vector2();
let clicking = false;
// v21.5.1 portrait thumb buttons: 打 held = fire at the nearest target, 撤 = retreat sprint for a moment
const MB = { fire: false, retreat: 0, rn: 0 };
addEventListener('keydown', e => {
  // v22.4: Esc backs out of whatever is on top (modal → shop/ride → shelter → map → panel), else opens the pause menu
  if (e.code === 'Escape') {
    e.preventDefault();
    if (fpv?.active) return;
    escBack();
    return;
  }
  if (modalOpen() || pauseOpen()) return;
  keys[e.code] = true;
  const is = (a: string) => isKey(e.code, a);
  if (started && is('map')) {
    gmap?.toggle();
    return;
  }
  if (is('inv')) {
    e.preventDefault();
    toggleInv();
  }
  if (!started) return;
  if (is('sneak')) {
    player.sneak = !player.sneak;
    log(player.sneak ? tr('進入潛行', 'Sneaking enabled') : tr('解除潛行', 'Sneaking disabled'));
  }
  if (is('interact')) interact();
  if (is('barricade')) barricade();
  if (is('sleep')) sleep();
  if (is('speed1')) setSpeed(1);
  if (is('speed2')) setSpeed(3);
  if (is('speed3')) setSpeed(20);
  if (is('light')) {
    player.light = !player.light;
  }
  if (is('vault')) {
    e.preventDefault();
    tryVault();
  }
  if (is('shove')) shove();
  if (is('cover')) toggleCover();
  if (is('shelter')) survOpen ? closeSurv() : openSurv('home');
});
/** close the top-most overlay; returns false when nothing was open */
function closeTop(): boolean {
  if (modalOpen()) return (closeModal(), true);
  for (const id of ['shop', 'ride']) {
    const el = document.getElementById(id);
    if (el) return (el.remove(), true);
  }
  if (survOpen) return (closeSurv(), true);
  if (gmap?.open) return (gmap.toggle(false), true);
  if (panelOpen) return (closePanel(), true);
  return false;
}
function escBack() {
  if (closeTop()) return;
  if (started && !dead) togglePause();
  else if (!started) (window as any).__titleBack?.();
}
// v22.7.1 Android Back: close the settings / help modal first, then the pause menu, then other overlays
setBackHandler(() => {
  if (modalOpen()) closeModal(true);
  else if (pauseOpen()) togglePause(false, true);
  else closeTop();
});
// ---- v22.4 pause menu (Esc / ☰). In multiplayer only the menu is local: the shared world keeps running ----
let pauseEl: HTMLElement | null = null;
const pauseOpen = () => !!pauseEl && !pauseEl.classList.contains('hidden');
function togglePause(on = !pauseOpen(), fromBack = false) {
  const was = pauseOpen();
  if (!pauseEl) {
    pauseEl = document.createElement('div');
    pauseEl.id = 'pmenu';
    pauseEl.className = 'hidden';
    pauseEl.innerHTML =
      tr(
        '<div class="phead"><b>⏸ 已暫停</b><button class="px" aria-label="繼續">✕</button></div><em id="pmp"></em>',
        '<div class="phead"><b>⏸ Paused</b><button class="px" aria-label="Resume">✕</button></div><em id="pmp"></em>',
      ) +
      [
        ['go', tr('繼續', 'Resume')],
        ['save', tr('存檔', 'Save')],
        ['load', tr('讀檔', 'Load')],
        ['map', tr('地圖', 'Map')],
        ['inv', tr('背包', 'Inventory')],
        ['surv', tr('避難所', 'Shelter')],
        ['rlog', tr('收音機紀錄', 'Radio log')],
        ['set', tr('設定', 'Settings')],
        ['help', tr('操作說明', 'Controls')],
        ['quit', tr('返回主選單', 'Return to main menu')],
      ]
        .map(([a, t]) => `<button data-a="${a}">${t}</button>`)
        .join('');
    pauseEl.querySelectorAll('button').forEach(
      b =>
        ((b as HTMLElement).onclick = () => {
          const a = (b as HTMLElement).dataset.a;
          if (a === 'go') togglePause(false);
          else if (a === 'save') {
            save();
            log(tr('已存檔', 'Saved'), '#9f9');
            b.textContent = tr('已存檔 ✓', 'Saved ✓');
            setTimeout(() => (b.textContent = tr('存檔', 'Save')), 1200);
          } else if (a === 'load') {
            if (!hasSave()) return log(tr('沒有存檔', 'No saved game'), '#f99');
            if (
              !confirm(tr('讀取上次存檔？目前未存的進度會遺失。', 'Load the last save? Unsaved progress will be lost.'))
            )
              return;
            sessionStorage.setItem('dt.autoload', '1');
            NOSAVE = true;
            location.reload();
          } else if (a === 'map') {
            togglePause(false);
            gmap?.toggle();
          } else if (a === 'inv') {
            togglePause(false);
            toggleInv();
          } else if (a === 'surv') {
            togglePause(false);
            openSurv('home');
          } else if (a === 'rlog') openPanel(tr('📻 收音機紀錄', '📻 Radio log'), radioLogHtml());
          else if (a === 'set') openSettings();
          else if (a === 'help') openHelp();
          else if (a === 'quit') {
            if (
              !confirm(
                tr('返回主選單？進度會自動存檔。', 'Return to the main menu? Progress will be saved automatically.'),
              )
            )
              return;
            save();
            NOSAVE = true;
            location.reload();
          }
        }),
    );
    (pauseEl.querySelector('.px') as HTMLElement).onclick = () => togglePause(false);
    // v22.7.1 tap outside the menu (on the dimmed backdrop) resumes
    pauseEl.addEventListener('click', e => e.target === pauseEl && togglePause(false));
    document.body.appendChild(pauseEl);
  }
  pauseEl.classList.toggle('hidden', !on);
  if (on && !was) histPush();
  else if (!on && was && !fromBack) histPop();
  ($('pmp') as HTMLElement).textContent =
    on && MP
      ? tr(
          '多人連線中：只有你的畫面暫停，世界仍在進行',
          'Multiplayer: only your screen is paused. The world keeps running.',
        )
      : '';
  paused = on && !MP;
  if (on) for (const k in keys) keys[k] = false;
}
addEventListener('keyup', e => (keys[e.code] = false));
addEventListener('mousemove', e => {
  mouse.set((e.clientX / innerWidth) * 2 - 1, (-e.clientY / innerHeight) * 2 + 1);
});
renderer.domElement.addEventListener('mousedown', e => {
  if (e.button === 2) return scopeEnter();
  if (e.button === 0 && scope.on) return scopeFire();
  if (e.button === 0 && !fpv?.active) clicking = true;
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mouseup', e => {
  clicking = false;
  if (e.button === 2) scopeExit();
});
addEventListener('mousemove', e => scope.on && scope.look(e.movementX, e.movementY, SET.sens));
addEventListener('wheel', e => {
  zoom = clamp(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 2.2);
  resize();
});
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
const aimPt = new THREE.Vector3();

// ---------- v22.6 audio glue ----------
AU.unlockAudio();
BC.unlockBroadcast();
const pDist = (x: number, z: number) => Math.hypot(player.pos.x - x, player.pos.z - z);
function surfaceAt(x: number, z: number): AU.Surface {
  if (z < -6000) return 'metro';
  const b = bldAt(x, z);
  if (b) return b.type === 'home' || b.type === 'house' || b.type === 'residential' ? 'wood' : 'tile';
  return walkH(x, z) > 0.02 ? 'tile' : 'asphalt';
}
let stepA = 0,
  auHp = 100;
function audioTick(dt: number) {
  // footsteps (player): one per stride; sneaking is silent
  if (!drive.cur && player.vaultT <= 0 && !player.sneak) {
    stepA += player.vel.length() * dt;
    const run = player.vel.length() > 4.5;
    if (stepA > (run ? 1.05 : 0.75)) {
      stepA = 0;
      AU.footstep(roofB ? 'tile' : surfaceAt(player.pos.x, player.pos.z), 0, false, run);
    }
  }
  if (player.hp < auHp - 3 && !dead) AU.hurt(0);
  auHp = player.hp;
  const inside = !!bldAt(player.pos.x, player.pos.z);
  AU.ambience(dt, {
    rain: WX.amt,
    indoor: inside || player.pos.z < -6000,
    home: atHome(),
    night: isNight(),
    metro: player.pos.z < -6000,
    combat: sols.some(s => s.state === 'combat'),
  });
}
// ---------- v22.5 snipers (enemy posts + player scope) ----------
let snp: SniperSys | null = null;
const scope = new Scope();
let roofB: Bld | null = null;
let scopeT = 0;
let moral: { soldier: any; civ: any; x: number; z: number; t: number } | null = null;
const snpWarn = document.createElement('div');
snpWarn.id = 'snpwarn';
document.body.appendChild(snpWarn);
function snpSound(k: 'shot' | 'lock', s?: Sniper) {
  if (k === 'shot') return AU.gunshot('sniper', s ? pDist(s.p[0], s.p[1]) : 0, false);
  try {
    const ac = AU.sfxCtx();
    if (!ac) return;
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = 1800; // the lock-on tick
    g.gain.setValueAtTime(0.06, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.4);
  } catch {
    /* no audio */
  }
}
/** the sniper's eye, pulled just outside its own parapet so its own walls don't block the line */
function snpEye(s: Sniper): V2 {
  const dx = s.p[0] - s.b.c[0],
    dz = s.p[1] - s.b.c[1],
    l = Math.hypot(dx, dz) || 1;
  return [s.p[0] + (dx / l) * 1.4, s.p[1] + (dz / l) * 1.4];
}
function setupSnipers() {
  if (snp) return;
  const posts = findPosts(roads, blds);
  surv.snpDead ||= [];
  snp = new SniperSys(
    posts,
    {
      scene,
      rig: () => {
        const r = makeRig({
          gender: 'm',
          hair: 0x111111,
          top: 0x4c5733,
          bottom: 0x4c5733,
          shoes: 0x111111,
          soldier: true,
        });
        setWeapon(r, 't93');
        scene.add(r.root);
        return r;
      },
      animate: (r, a, dt) => animate(r, a as AnimState, 0, dt),
      sees: s => {
        if (roofB === s.b) return true;
        if (roofB) return false;
        const P: V2 = [player.pos.x, player.pos.z];
        if (bldAt(P[0], P[1])) return false; // indoors / under the arcade
        if (vehicles.list.some(v => Math.hypot(v.pos.x - P[0], v.pos.z - P[1]) < 1.8)) return false; // behind a car
        return los(snpEye(s), P);
      },
      player: () => player.pos,
      hurt: dmg => {
        if (player.sleeping) player.sleeping = false;
        player.rig.hurtT = 0.35;
        player.hp -= dmg;
        if (!player.bleed && Math.random() < 0.5) player.bleed = true;
        log(tr('砰！你被狙擊手擊中！快找掩蔽！', 'Bang! A sniper hit you! Get to cover!'), '#f44');
      },
      warn: on => {
        snpWarn.style.display = on ? 'block' : 'none';
        snpWarn.textContent = tr(
          '⚠ 你被狙擊手鎖定！躲進騎樓、車後或巷子',
          '⚠ A sniper has you in their sights! Hide under an arcade, behind a car or in an alley.',
        );
        if (on) slowDown(tr('狙擊手鎖定', 'Sniper targeting you'));
      },
      sound: (k, s) => snpSound(k, s),
      cleared: s => {
        surv.snpDead!.includes(s.id) || surv.snpDead!.push(s.id);
        player.kills++;
        log(
          getLanguage() === 'en'
            ? `Sniper eliminated: ${translateLabel(s.name)} is now safe during the day.`
            : `狙擊手已清除：${translateLabel(s.name)} 一帶白天安全了。`,
          '#9f9',
        );
        gmap?.intel(
          'snpok' + s.id,
          s.j[0],
          s.j[1],
          'safe',
          getLanguage() === 'en'
            ? `Sniper position cleared: ${translateLabel(s.name)}`
            : `已清除狙擊點：${translateLabel(s.name)}`,
        );
        makeCont('snpbox' + s.id, [s.p[0], s.p[1]], 'crate', undefined, { a762n: 5, bandage: 1 });
      },
    },
    surv.snpDead,
  );
  for (const s of snp.list)
    if (!s.dead)
      gmap?.intel(
        'snp' + s.id,
        s.j[0],
        s.j[1],
        'dng',
        getLanguage() === 'en'
          ? `Sniper (dangerous from 06:00 to 18:30): ${translateLabel(s.name)}`
          : `狙擊手（白天 06:00–18:30 危險）：${translateLabel(s.name)}`,
      );
}
/** stairwell door of a sniper building near the player */
function roofDoor() {
  if (!snp) return null;
  for (const s of snp.list) {
    const d = s.b.door;
    if (d && Math.hypot(d.p[0] - player.pos.x, d.p[1] - player.pos.z) < 2) return s;
  }
  return null;
}
function roofToggle() {
  if (roofB) {
    const d = roofB.door!;
    player.pos.set(d.p[0], 0, d.p[1]);
    roofB = null;
    log(tr('你從樓梯間下到街上。', 'You descend the stairwell to the street.'));
    return true;
  }
  const s = roofDoor();
  if (!s) return false;
  roofB = s.b;
  const c = s.b.c;
  player.pos.set(c[0] + (s.p[0] - c[0]) * 0.45, 0, c[1] + (s.p[1] - c[1]) * 0.45);
  log(
    s.dead
      ? tr('你爬上了頂樓。', 'You climb onto the rooftop.')
      : tr(
          '你悄悄爬上頂樓——狙擊手就在前面。靠近後近戰。',
          'You quietly reach the roof. The sniper is just ahead. Get close for a melee attack.',
        ),
    '#fd9',
  );
  return true;
}
function scopeAllowed() {
  return !!player.equip && SCOPED.has(player.equip) && !drive.cur && !panelOpen && !player.sleeping;
}
function scopeEnter() {
  if (!scopeAllowed()) return;
  scope.enter(Math.atan2(aimPt.x - player.pos.x, aimPt.z - player.pos.z));
  scopeT = performance.now();
}
function scopeExit() {
  if (!scope.on) return;
  scope.exit();
  if (moral && moral.t > 0) moralEnd(false);
}
const eyeY = () => (roofB ? roofB.h : 0) + 1.55;
/** a scoped shot: bullet drop (≈300 m/s), head / body hit zones, stops at buildings and the ground; loud */
function scopeFire() {
  const k = player.equip;
  const d = ITEMS[k];
  if (!d || player.cd > 0) return;
  if (!player.inv[d.ammo!]) return log(tr('沒有子彈了', 'Out of ammunition'), '#f99');
  if (--player.inv[d.ammo!] <= 0) delete player.inv[d.ammo!];
  player.cd = d.cd;
  player.rig.shootT = 0.14;
  AU.gunshot(AU.gunKind(k, d), 0, !!bldAt(player.pos.x, player.pos.z));
  noise(player.pos.x, player.pos.z, 80); // a rifle crack: soldiers come to search
  const o = new THREE.Vector3(player.pos.x, eyeY(), player.pos.z);
  let hit: { s?: Sniper; sol?: Sol; head: boolean } | null = null;
  const r = ballistic(o, scope.dir(), 260, 300, (p, dist) => {
    if (dist > 1.5) {
      const b = bldAt(p.x, p.z);
      if (b && b !== roofB && p.y < b.h) return true;
      if (roofB && b === roofB && p.y < roofB.h) return true;
    }
    for (const s of snp?.list || []) {
      if (s.dead) continue;
      const hx = p.x - s.p[0],
        hz = p.z - s.p[1];
      if (hx * hx + (p.y - (s.y + 1.62)) ** 2 + hz * hz < 0.04) return !!(hit = { s, head: true });
      if (hx * hx + hz * hz < 0.1 && p.y > s.y && p.y < s.y + 1.45) return !!(hit = { s, head: false });
    }
    for (const s of sols) {
      if (s.state === 'dead') continue;
      const hx = p.x - s.pos.x,
        hz = p.z - s.pos.z;
      const top = s.crouch ? 1.15 : 1.62;
      if (hx * hx + (p.y - top) ** 2 + hz * hz < 0.04) return !!(hit = { sol: s, head: true });
      if (hx * hx + hz * hz < 0.1 && p.y < top - 0.15) return !!(hit = { sol: s, head: false });
    }
    return false;
  });
  tracer(o, r.p);
  const H = hit as { s?: Sniper; sol?: Sol; head: boolean } | null;
  if (moral && moral.t > 0 && Math.hypot(r.p.x - moral.x, r.p.z - moral.z) < 2.5) return moralEnd(true);
  if (H?.s) {
    snp!.hit(H.s, d.dmg, H.head);
    log(H.head ? tr('爆頭！', 'Headshot!') : tr('命中狙擊手軀幹', 'Hit the sniper in the torso'), '#ff9');
  } else if (H?.sol) {
    damageSol(H.sol, H.head ? 999 : d.dmg, false);
    log(H.head ? tr('爆頭！', 'Headshot!') : tr('命中', 'Hit'), '#ff9');
  }
}
/** the moral moment: through the scope, an enemy soldier helping an injured civilian */
function moralStart() {
  if (surv.moral || moral) return;
  // in view if possible; otherwise turn the scope to the nearest open stretch of street
  for (let k = 0; k < 24; k++)
    for (let dist = 12; dist <= 45; dist += 3) {
      const yaw = scope.yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.26;
      const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const x = player.pos.x + dir.x * dist,
        z = player.pos.z + dir.z * dist;
      if (bldAt(x, z) || !los([player.pos.x, player.pos.z], [x, z])) continue;
      scope.yaw = yaw;
      scope.pitch = Math.atan2(1.2 - eyeY(), dist);
      const soldier = makeRig({
        gender: 'm',
        hair: 0x111111,
        top: 0x4c5733,
        bottom: 0x4c5733,
        shoes: 0x111111,
        soldier: true,
      });
      const civ = makeRig({ gender: 'f', hair: 0xcccccc, top: 0x8a6a8a, bottom: 0x333344, shoes: 0x222222 });
      soldier.root.position.set(x, 0, z);
      civ.root.position.set(x + 0.55, 0, z);
      soldier.root.rotation.y = civ.root.rotation.y = Math.atan2(-dir.z, dir.x);
      scene.add(soldier.root, civ.root);
      moral = { soldier, civ, x, z, t: 20 };
      scope.note.textContent = tr(
        '一名解放軍士兵正扶著受傷的阿嬤走向路邊。　[左鍵] 開槍　／　放開右鍵：放過',
        'A PLA soldier is helping an injured elderly woman to the roadside. [Left click] Shoot / Release right click: spare him',
      );
      return;
    }
}
function moralEnd(shot: boolean) {
  if (!moral) return;
  surv.moral = shot ? 'shot' : 'spared';
  surv.karma += shot ? -2 : 1;
  if (shot) {
    moral.soldier.root.rotation.x = -Math.PI / 2;
    player.kills++;
    log(
      tr(
        '你扣下了扳機。阿嬤跌坐在地上，抬頭看向槍聲的方向。',
        'You pull the trigger. The elderly woman falls to the ground and looks toward the gunshot.',
      ),
      '#f99',
    );
  } else
    log(
      tr(
        '你放過了他。他把阿嬤扶到騎樓下，轉身離開。',
        'You spare him. He helps the elderly woman under the arcade, then walks away.',
      ),
      '#9cf',
    );
  scope.note.textContent = '';
  const m = moral;
  moral.t = 0;
  setTimeout(() => {
    scene.remove(m.soldier.root, m.civ.root);
    if (moral === m) moral = null;
  }, 8000);
}
function snpUpdate(dt: number) {
  if (!snp) return;
  snp.update(dt, gameMin);
  if (scope.on) {
    if (!scopeAllowed()) scopeExit();
    if (
      performance.now() - scopeT > 1500 &&
      gameMin > 1440 + 9 * 60 &&
      !surv.moral &&
      !snp.inZone(player.pos.x, player.pos.z) &&
      !bldAt(player.pos.x, player.pos.z)
    )
      moralStart();
  }
  if (moral && moral.t > 0) {
    moral.t -= dt;
    animate(moral.soldier, 'carry', 0.6, dt);
    animate(moral.civ, 'walk', 0.4, dt);
    if (moral.t <= 0) moralEnd(false);
  }
}

// ---------- inventory / loot UI ----------
let panelOpen = false;
const weight = () => Object.entries(player.inv).reduce((s, [k, n]) => s + ITEMS[k].w * n, 0);
function addItem(k: string, n = 1) {
  player.inv[k] = (player.inv[k] || 0) + n;
}
function useItem(k: string) {
  const d = ITEMS[k];
  if (!player.inv[k]) return;
  if (coopActive() && d.kind !== 'melee' && d.kind !== 'gun') {
    if (d.kind === 'med') net!.cmd({ t: 'use', item: k } as any);
    else soonToast(tr('合作模式僅支援武器、彈藥與醫療補給', 'Co-op supports weapons, ammunition and medical supplies'));
    return;
  }
  if (d.kind === 'melee' || d.kind === 'gun') {
    player.equip = player.equip === k ? '' : k;
    syncHeldWeapon();
    log(
      player.equip
        ? getLanguage() === 'en'
          ? `Equipped ${d.name}`
          : `裝備了 ${d.name}`
        : tr('收起武器', 'Weapon holstered'),
    );
  } else if (k === 'rocradio_b') {
    const ok = player.inv.lipo && (player.inv.vtx || player.inv.lipo >= 2 || ROLE.skills.repair);
    if (!ok) {
      log(
        tr(
          '修理需要：鋰電池＋圖傳模組（或 2 顆鋰電池）',
          'Repair requires a LiPo battery and video transmitter (or 2 LiPo batteries).',
        ),
        '#f99',
      );
      return;
    }
    const use = ROLE.skills.repair ? ['lipo'] : player.inv.vtx ? ['lipo', 'vtx'] : ['lipo', 'lipo'];
    for (const q of use) {
      if (--player.inv[q] <= 0) delete player.inv[q];
    }
    delete player.inv[k];
    addItem('rocradio', 1);
    mapIntelOutposts(tr('解放軍哨點（國軍情資）', 'PLA checkpoint (ROC intelligence)'));
    if (evac) gmap?.intel('evac0', evac.pos[0], evac.pos[1], 'evac', tr('撤離點（國軍）', 'Extraction point (ROC)'));
    log(
      tr(
        '📻 無線電修好了！可以呼叫國軍裝甲支援（通話會引來巡邏）',
        '📻 Radio repaired! You can call ROC armored support (radio chatter attracts patrols).',
      ),
      '#9f9',
    );
  } else if (k === 'tmap') {
    if (--player.inv[k] <= 0) delete player.inv[k];
    const si = Math.floor(Math.random() * NSEC);
    const x0 = SECTORS[si].x - 250,
      z0 = SECTORS[si].z - 250;
    gmap?.revealRect(x0, z0, x0 + 500, z0 + 500);
    checkpoints.forEach((c, n) => {
      if (sectorOf(c[0], c[1]) === si) gmap?.intel('out' + n, c[0], c[1], 'out', tr('解放軍哨點', 'PLA checkpoint'));
    });
    for (const c of conts.filter(c => c.p && sectorOf(c.p[0], c.p[1]) === si).slice(0, 3))
      gmap?.intel('sup' + c.id, c.p[0], c.p[1], 'sup', tr('手繪：物資', 'Hand-drawn: supplies'));
    gmap?.save();
    log(
      getLanguage() === 'en'
        ? `📜 Unfolded the hand-drawn map: ${SECTOR_LABEL(si)} alleys and checkpoints added to the map (press M).`
        : `📜 攤開手繪地圖：${SECTOR_LABEL(si)} 街區的巷弄與哨點已標上地圖（按 M）`,
      '#ffd27a',
    );
    closePanel();
  } else if (k === 'rocradio') {
    callSupport();
    closePanel();
  } else if (k === 'fpv') {
    if (bldAt(player.pos.x, player.pos.z)) {
      log(tr('在室內無法起飛，先到戶外', 'Cannot launch indoors. Go outside first.'), '#f99');
      return;
    }
    if (--player.inv[k] <= 0) delete player.inv[k];
    closePanel();
    launchFPV();
  } else if (k === 'frame') {
    const need: Record<string, number> = { frame: 1, dmotor: 4, lipo: 1, vtx: 1, grenade: 1 };
    const miss = Object.entries(need)
      .filter(([q, n]) => (player.inv[q] || 0) < n)
      .map(([q, n]) => `${ITEMS[q].name}×${n - (player.inv[q] || 0)}`);
    if (miss.length) {
      log(tr('還缺：', 'Still needed: ') + miss.join('、'), '#f99');
      return;
    }
    for (const [q, n] of Object.entries(need)) {
      player.inv[q] -= n;
      if (player.inv[q] <= 0) delete player.inv[q];
    }
    addItem('fpv', 1);
    log(tr('組好了一架 FPV 自殺無人機！', 'FPV attack drone assembled!'), '#9f9');
  } else if (d.mag && d.ammo) {
    player.inv[d.ammo] = (player.inv[d.ammo] || 0) + d.mag;
    if (--player.inv[k] <= 0) delete player.inv[k];
    log(
      getLanguage() === 'en'
        ? `Unloaded ${d.mag} rounds of ${ITEMS[d.ammo].name}`
        : `退出 ${d.mag} 發 ${ITEMS[d.ammo].name}`,
    );
  } else if (d.kind === 'food' || d.kind === 'drink' || d.kind === 'med') {
    player.hunger = clamp(player.hunger + (d.hunger || 0), 0, 100);
    player.thirst = clamp(player.thirst + (d.thirst || 0), 0, 100);
    player.fatigue = clamp(player.fatigue + (d.fatigue || 0), 0, 100);
    player.hp = clamp(player.hp + (d.hp || 0) * (d.kind === 'med' ? (ROLE.skills.medic ?? 1) : 1), 0, 100);
    if (d.stopBleed && player.bleed) {
      player.bleed = false;
      log(tr('止血了', 'Bleeding stopped'), '#9f9');
    }
    log(getLanguage() === 'en' ? `Used ${d.name}` : `使用了 ${d.name}`);
    if (--player.inv[k] <= 0) delete player.inv[k];
  } else if (k === 'bucket') {
    if (bldAt(player.pos.x, player.pos.z)) {
      log(
        tr(
          '水桶要放在戶外（沒有屋頂遮的地方）才接得到雨',
          'Place the bucket outdoors, away from roofs, to collect rain.',
        ),
        '#f99',
      );
      return;
    }
    makeBucket('pb' + Date.now(), [player.pos.x + 0.6, player.pos.z]);
    if (--player.inv[k] <= 0) delete player.inv[k];
    log(tr('放下了水桶，下雨時會慢慢裝滿雨水', 'Bucket placed. It will slowly fill when it rains.'), '#9fd0ff');
  } else
    log(
      k === 'plank' || k === 'hammer'
        ? tr(
            '靠近門口按 B 封門（需要木板與鐵鎚）',
            'Press B near a door to barricade it (requires a plank and hammer).',
          )
        : tr('子彈會在開槍時自動使用', 'Ammunition is used automatically when firing.'),
    );
  renderPanel();
}
let curCont: Cont | null = null;
function renderPanel() {
  if (!panelOpen) return;
  const p = $('panel');
  // Keep each list at its own reading position when taking or using an item.
  const sameContainer = p.dataset.container === (curCont?.id || 'inventory');
  const scroll = new Map<string, number>();
  if (sameContainer) p.querySelectorAll<HTMLElement>('.inventory-list').forEach(e => scroll.set(e.id, e.scrollTop));
  const focused = p.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.item : null;
  p.dataset.container = curCont?.id || 'inventory';
  p.setAttribute('role', 'dialog');
  p.setAttribute('aria-label', tr('背包與搜刮', 'Inventory and loot'));
  p.onkeydown = e => {
    if (e.code === 'Escape') return; // Keep the shared overlay Back handler.
    e.stopPropagation(); // Tab/Space must navigate/activate, not close the bag or vault.
    if (e.code !== 'Tab') return;
    const targets = Array.from(p.querySelectorAll<HTMLElement>('button:not(:disabled), .inventory-list'));
    const first = targets[0],
      last = targets[targets.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  p.innerHTML = '';
  const columns = document.createElement('div');
  columns.className = 'inventory-columns';
  columns.classList.toggle('has-loot', !!curCont);
  p.appendChild(columns);
  const col = (title: string, id: string) => {
    const c = document.createElement('section');
    c.className = 'col';
    const heading = document.createElement('h3');
    heading.id = id + '-title';
    heading.textContent = title;
    const list = document.createElement('div');
    list.className = 'inventory-list';
    list.id = id;
    list.setAttribute('aria-labelledby', heading.id);
    list.tabIndex = 0;
    c.append(heading, list);
    columns.appendChild(c);
    return list;
  };
  const item = (list: HTMLElement, k: string, n: number, action: string, run: () => void, equipped = false) => {
    const d = ITEMS[k];
    const e = document.createElement('button');
    e.type = 'button';
    e.className = 'it';
    e.dataset.item = list.id + ':' + k;
    const icon = document.createElement('img');
    icon.src = iconURL(k);
    icon.alt = '';
    const text = document.createElement('span');
    text.className = 'item-text';
    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = d.name + (equipped ? ' ★' : '') + ` ×${n}`;
    text.appendChild(name);
    if (d.cal) {
      const detail = document.createElement('small');
      detail.className = 'item-detail';
      detail.textContent = `${d.cal}${d.cap ? tr(`・${d.cap}發`, `・${d.cap} rounds`) : ''}・${d.w}kg`;
      text.appendChild(detail);
    }
    const label = document.createElement('small');
    label.className = 'item-action';
    label.textContent = action;
    e.append(icon, text, label);
    e.title = d.desc || '';
    e.onclick = run;
    list.appendChild(e);
  };
  const empty = (list: HTMLElement, message: string) => {
    const note = document.createElement('p');
    note.className = 'inventory-empty';
    note.textContent = message;
    list.appendChild(note);
  };
  const inv = col(
    getLanguage() === 'en' ? `Inventory (${weight().toFixed(1)} / 15 kg)` : `背包（${weight().toFixed(1)} / 15 kg）`,
    'inventory-items',
  );
  for (const [k, n] of Object.entries(player.inv)) {
    const actions =
      getLanguage() === 'en'
        ? { food: 'Eat', drink: 'Drink', med: 'Heal', melee: 'Equip', gun: 'Equip', ammo: 'Ammo', tool: 'Tool' }
        : { food: '食用', drink: '飲用', med: '治療', melee: '裝備', gun: '裝備', ammo: '彈藥', tool: '工具' };
    item(inv, k, n, actions[ITEMS[k].kind], () => useItem(k), player.equip === k);
  }
  if (!Object.keys(player.inv).length) empty(inv, tr('空的', 'Empty'));
  const footer = document.createElement('div');
  footer.className = 'inventory-actions';
  if (curCont) {
    const cc = curCont;
    const list = col(translateLabel(cc.label), 'loot-items');
    for (const [k, n] of Object.entries(cc.items)) item(list, k, n, tr('拿取', 'Take'), () => take(cc, k));
    if (!Object.keys(cc.items).length) empty(list, tr('已經搜刮一空', 'Already looted'));
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'take-all';
    b.dataset.item = 'take-all';
    b.textContent = tr('全部拿取', 'Take all');
    b.disabled = !Object.keys(cc.items).length;
    b.onclick = () => {
      for (const k of Object.keys(cc.items)) take(cc, k, true);
      renderPanel();
    };
    footer.appendChild(b);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.id = 'inventory-close';
  close.dataset.item = 'inventory-close';
  close.textContent = MOBILE ? tr('關閉背包', 'Close inventory') : tr('關閉 (Esc)', 'Close (Esc)');
  close.onclick = closePanel;
  footer.appendChild(close);
  p.appendChild(footer);
  p.querySelectorAll<HTMLElement>('.inventory-list').forEach(e => (e.scrollTop = scroll.get(e.id) || 0));
  if (focused) {
    const target = Array.from(p.querySelectorAll<HTMLElement>('[data-item]')).find(e => e.dataset.item === focused);
    (target && !(target as HTMLButtonElement).disabled ? target : close).focus({ preventScroll: true });
  } else close.focus({ preventScroll: true });
}
function take(c: Cont, k: string, all = false) {
  const n = all ? c.items[k] : ITEMS[k].kind === 'ammo' ? c.items[k] : 1;
  if (weight() + ITEMS[k].w * n > 15) {
    log(tr('背包太重了', 'Inventory is too heavy'), '#f99');
    return;
  }
  addItem(k, n);
  c.items[k] -= n;
  if (c.items[k] <= 0) delete c.items[k];
  if (c.id[0] === 't' && c.id.includes(':')) {
    const [key, i] = c.id.slice(1).split(':');
    district.save(key, 'c', { ...(district.saved[key]?.c || {}), [i]: c.items });
  }
  const gm = (c as any).gunMesh;
  if (gm && !Object.keys(c.items).some(q => ITEMS[q].kind === 'gun' || ITEMS[q].mag)) gm.visible = false;
  updateVis(c);
  if (!all) renderPanel();
}
function toggleInv() {
  if (!started) return;
  if (panelOpen) closePanel();
  else {
    curCont = null;
    panelOpen = true;
    document.body.classList.add('inventory-open');
    joy.x = joy.y = 0;
    joy.id = -1;
    $('joyk').style.transform = '';
    MB.fire = false;
    $('panel').classList.remove('hidden');
    renderPanel();
  }
}
function closePanel() {
  panelOpen = false;
  document.body.classList.remove('inventory-open');
  curCont = null;
  $('panel').classList.add('hidden');
}

function contDist(c: Cont) {
  let x = c.p[0],
    z = c.p[1];
  if (c.half && c.axis) {
    const t = clamp((player.pos.x - x) * c.axis[0] + (player.pos.z - z) * c.axis[1], -c.half, c.half);
    x += c.axis[0] * t;
    z += c.axis[1] * t;
  }
  return Math.hypot(x - player.pos.x, z - player.pos.z);
}
function nearestCont() {
  let best: Cont | null = null,
    bd = 1.5;
  for (const c of conts) {
    if (Math.abs(c.p[0] - player.pos.x) > 6 || Math.abs(c.p[1] - player.pos.z) > 6) continue;
    if (UT.power && SHOP_LOOT.test(c.id)) continue;
    const d = contDist(c);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
function updateVis(c: Cont) {
  if (!c.vis || !c.init) return;
  for (const v of c.vis) {
    const init = c.init[v.item] || 1;
    v.im.count = Math.ceil(v.max * clamp((c.items[v.item] || 0) / init, 0, 1));
  }
}
// ---- v22.4.1 openable doors (homes start closed; a closed leaf blocks only the player) ----
let doorView: DoorView | null = null;
let exitMark: { m: THREE.Mesh; b: Bld | null } | null = null;
function doorNear(r: number) {
  let best: LiveDoor | null = null,
    bd = r;
  for (const d of doors as LiveDoor[]) {
    const x = Math.hypot(d.p[0] - player.pos.x, d.p[1] - player.pos.z);
    if (x < bd) ((bd = x), (best = d));
  }
  return best;
}
function toggleDoor(d: LiveDoor) {
  if (d.barricaded) return log(tr('門已經封死了（B 拆除）', 'Door is barricaded (B to remove).'), '#f99');
  d.open = !d.open;
  doorSound(!!d.open);
  noise(d.p[0], d.p[1], 4);
  log(d.open ? tr('開門', 'Open door') : tr('關門', 'Close door'), '#ccc');
}
function collideDoors(pos: THREE.Vector3, r = 0.35) {
  for (const d of doors as LiveDoor[]) {
    if (d.open || d.barricaded || Math.abs(d.p[0] - pos.x) > 3 || Math.abs(d.p[1] - pos.z) > 3) continue;
    const ax = d.a[0],
      az = d.a[1],
      dx = d.c[0] - ax,
      dz = d.c[1] - az;
    const t = clamp(((pos.x - ax) * dx + (pos.z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const ox = pos.x - (ax + dx * t),
      oz = pos.z - (az + dz * t),
      L = Math.hypot(ox, oz);
    if (L < r && L > 1e-6) ((pos.x = ax + dx * t + (ox / L) * r), (pos.z = az + dz * t + (oz / L) * r));
  }
}
function nearestDoor() {
  let best: Door | null = null,
    bd = 2.2;
  for (const d of doors) {
    const x = Math.hypot(d.p[0] - player.pos.x, d.p[1] - player.pos.z);
    if (x < bd) {
      bd = x;
      best = d;
    }
  }
  return best;
}
let pendingCont: Cont | null = null;
function atHome() {
  const h = surv.home;
  return !!h && Math.hypot(player.pos.x - h[0], player.pos.z - h[1]) < 4;
}
function tradeAt() {
  return SV.TRADE_SPOTS.find(t => Math.hypot(player.pos.x - t.x, player.pos.z - t.z) < 4) || null;
}
function closeSurv() {
  survOpen = false;
  document.getElementById('surv')?.remove();
}
const iname = (k: string) => ITEMS[k]?.name || k;
const costTxt = (c: Record<string, number>) =>
  Object.entries(c)
    .map(([k, n]) => `${iname(k)}×${n}`)
    .join('、');
/** v22 overlay: home shelter / barter stall / moral choice */
function openSurv(kind: 'home' | 'trade' | 'moral') {
  closeSurv();
  survOpen = true;
  const d = document.createElement('div');
  d.id = 'surv';
  const S = surv;
  const btn = (a: string, t: string, dis = false) => `<button data-a="${a}"${dis ? ' disabled' : ''}>${t}</button>`;
  const render = () => {
    let h = '';
    if (kind === 'home') {
      const here = atHome();
      h +=
        getLanguage() === 'en'
          ? `<h3>🏠 Shelter・Day ${S.day} ${SV.isNight(gameMin) ? '🌙 Night (go scavenging)' : '☀ Day (heavy patrols; stay home)'}</h3>`
          : `<h3>🏠 避難所・第 ${S.day} 天 ${SV.isNight(gameMin) ? '🌙 夜晚（出去搜刮）' : '☀ 白天（巡邏多，留在家）'}</h3>`;
      h +=
        getLanguage() === 'en'
          ? `<p>${S.ev || ''} Average morale ${SV.avgMood(S)} Supply scarcity ×${S.scarcity.toFixed(2)} Conscience ${S.karma}</p><table>`
          : `<p>${S.ev || ''}　平均心情 ${SV.avgMood(S)}　物資緊縮 ×${S.scarcity.toFixed(2)}　良心 ${S.karma}</p><table>`;
      for (const g of S.group)
        h +=
          getLanguage() === 'en'
            ? `<tr class="${g.dead ? 'dead' : g.here ? '' : 'away'}"><td><b>${SV.survivorName(g)}</b><br><small>${SV.survivorRole(g)}</small></td><td>${
                g.dead
                  ? '💀 Deceased'
                  : g.here
                    ? `Fullness ${Math.round(g.hunger)} | Illness ${Math.round(g.sick)} | Injury ${Math.round(g.hurt)} | Morale ${Math.round(g.mood)}`
                    : 'Not here yet'
              }</td></tr>`
            : `<tr class="${g.dead ? 'dead' : g.here ? '' : 'away'}"><td><b>${SV.survivorName(g)}</b><br><small>${SV.survivorRole(g)}</small></td><td>${
                g.dead
                  ? '💀 已過世'
                  : g.here
                    ? `飽 ${Math.round(g.hunger)}｜病 ${Math.round(g.sick)}｜傷 ${Math.round(g.hurt)}｜心情 ${Math.round(g.mood)}`
                    : '還沒來'
              }</td></tr>`;
      h +=
        getLanguage() === 'en'
          ? `</table><p>Stockpile: ${
              Object.entries(S.stash)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${iname(k)}×${n}`)
                .join('、') || 'Empty'
            }</p>`
          : `</table><p>存糧：${
              Object.entries(S.stash)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${iname(k)}×${n}`)
                .join('、') || '空的'
            }</p>`;
      h += '<div class="row">';
      for (const [k, u] of Object.entries(SV.UPG)) {
        const has = S.upg[k as SV.Upg];
        const ok = Object.entries(u.cost).every(([i, n]) => (player.inv[i] || 0) >= n);
        h += btn(
          'u:' + k,
          has ? `✔ ${u.name}` : `${u.name}<small>${costTxt(u.cost)}｜${u.desc}</small>`,
          !!has || !ok || !here,
        );
      }
      h += '</div><div class="row">';
      h +=
        btn('dep', tr('把食物／水／藥放進存糧', 'Deposit food / water / medicine'), !here) +
        btn('pray', tr('🙏 神明廳拜拜', '🙏 Pray at the household shrine'), !here) +
        btn('x', tr('關閉', 'Close')) +
        '</div>';
      if (!here)
        h += tr(
          '<p><em>回到家（出生點）才能建造和存放。</em></p>',
          '<p><em>Return home (your spawn point) to build or store supplies.</em></p>',
        );
      h += `<ul>${S.log
        .slice(0, 6)
        .map(t => `<li>${t}</li>`)
        .join('')}</ul>`;
    } else if (kind === 'trade') {
      const t = tradeAt();
      h +=
        getLanguage() === 'en'
          ? `<h3>🤝 ${t ? t.name : 'Barter'}</h3><p>You have Changle cigarettes ×${player.inv.cig || 0}. Today's prices (supply scarcity ×${S.scarcity.toFixed(2)}): </p><div class="row">`
          : `<h3>🤝 ${t ? t.name : '以物易物'}</h3><p>你有 長樂菸×${player.inv.cig || 0}。今天的行情（物資緊縮 ×${S.scarcity.toFixed(2)}）：</p><div class="row">`;
      for (const k of Object.keys(SV.VAL)) {
        if (k === 'cig') continue;
        const pz = SV.price(S, k);
        h += btn(
          'b:' + k,
          getLanguage() === 'en'
            ? `Buy ${iname(k)}<small>${pz} packs of cigarettes</small>`
            : `買 ${iname(k)}<small>${pz} 包菸</small>`,
          (player.inv.cig || 0) < pz,
        );
        if ((player.inv[k] || 0) > 0)
          h += btn(
            's:' + k,
            getLanguage() === 'en'
              ? `Sell ${iname(k)}<small>Receive ${Math.max(1, pz - 1)} packs of cigarettes</small>`
              : `賣 ${iname(k)}<small>得 ${Math.max(1, pz - 1)} 包菸</small>`,
          );
      }
      h += '</div>' + btn('x', tr('離開', 'Leave'));
    } else {
      h += tr(
        '<h3>🚪 這戶還有人住</h3><p>門縫裡，一位獨居的阿公縮在床邊，櫃子裡是他的藥和最後一點米。</p><div class="row">',
        '<h3>🚪 Someone still lives here</h3><p>Through the doorway, you see an elderly man alone, huddled by his bed. His cabinet holds his medicine and the last of his rice.</p><div class="row">',
      );
      h +=
        btn('take', tr('還是拿走（大家心情 −，良心 −）', 'Take it anyway (group morale −, conscience −)')) +
        btn('give', tr('留一包米給他（良心 +）', 'Leave him a bag of rice (conscience +)'), !(player.inv.rice > 0)) +
        btn('leave', tr('輕輕把門帶上', 'Quietly close the door')) +
        '</div>';
    }
    d.innerHTML = h;
  };
  d.onclick = e => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || b.disabled) return;
    const a = b.dataset.a!;
    if (a === 'x') return closeSurv();
    if (a.startsWith('u:')) {
      const k = a.slice(2) as SV.Upg;
      for (const [i, n] of Object.entries(SV.UPG[k].cost)) player.inv[i] -= n;
      S.upg[k] = 1;
      log(
        getLanguage() === 'en' ? `🔨 Shelter: ${SV.UPG[k].name} complete` : `🔨 避難所：${SV.UPG[k].name} 完成`,
        '#9f9',
      );
    } else if (a === 'dep') {
      for (const k of Object.keys(player.inv)) {
        const it = ITEMS[k];
        if (it && (it.kind === 'food' || it.kind === 'drink' || it.kind === 'med') && player.inv[k] > 0) {
          S.stash[k] = (S.stash[k] || 0) + player.inv[k];
          delete player.inv[k];
        }
      }
      log(tr('物資放進了存糧。', 'Supplies added to the stockpile.'), '#9f9');
    } else if (a === 'pray') log(SV.pray(S), '#fd9');
    else if (a.startsWith('b:')) {
      const k = a.slice(2);
      player.inv.cig -= SV.price(S, k);
      addItem(k, 1);
    } else if (a.startsWith('s:')) {
      const k = a.slice(2);
      player.inv[k]--;
      if (player.inv[k] <= 0) delete player.inv[k];
      addItem('cig', Math.max(1, SV.price(S, k) - 1));
    } else if (a === 'take' || a === 'give' || a === 'leave') {
      const c = pendingCont!;
      pendingCont = null;
      closeSurv();
      if (a === 'take') {
        S.karma--;
        S.stole++;
        S.group.forEach(g => (g.mood = Math.max(0, g.mood - 8)));
        log(
          tr(
            '你拿走了阿公的東西。回家的路上，誰都沒說話。',
            "You take the old man's belongings. Nobody speaks on the way home.",
          ),
          '#e99',
        );
        (c as any).seen = 1;
        interact();
      } else if (a === 'give') {
        player.inv.rice--;
        S.karma += 2;
        S.gave++;
        S.group.forEach(g => (g.mood = Math.min(100, g.mood + 5)));
        log(
          tr(
            '你留下一包米。阿公合掌說了聲多謝。',
            'You leave a bag of rice. The old man presses his palms together and thanks you.',
          ),
          '#9f9',
        );
      } else {
        S.karma++;
        log(tr('你輕輕把門帶上。', 'You quietly close the door.'), '#ccc');
      }
      return;
    }
    render();
  };
  render();
  document.body.appendChild(d);
}
/** v21.6 / v22.1 the metro entrance / exit the player stands at, if any */
function metroAt() {
  for (const st of metro)
    for (const gt of st.gates) {
      if (Math.hypot(player.pos.x - gt.ent[0], player.pos.z - gt.ent[1]) < 1.8) return { st, gt, down: true };
      if (Math.hypot(player.pos.x - gt.exit[0], player.pos.z - gt.exit[1]) < 2.2) return { st, gt, down: false };
    }
  return null;
}
function metroUse() {
  const m = metroAt();
  if (!m) return false;
  if (m.down) ensureInterior(scene, m.st, metro.indexOf(m.st));
  const [x, z] = m.down ? m.gt.inn : m.gt.out;
  player.pos.set(x, 0, z);
  player.vel.set(0, 0, 0);
  log(
    m.down
      ? getLanguage() === 'en'
        ? `🚇 Entered through exit ${m.gt.no} into Beidu Metro, ${translateLabel(m.st.name)} Station${UT.power ? '(running normally)' : '(blackout; service suspended)'}`
        : `🚇 由 ${m.gt.no} 號出口進入北都地下鐵 ${translateLabel(m.st.name)}站${UT.power ? '（正常營運）' : '（停電・停駛中）'}`
      : getLanguage() === 'en'
        ? `Returned to street level through Exit ${m.gt.no} (${translateLabel(m.st.name)})`
        : `從 ${m.gt.no} 號出口回到地面（${translateLabel(m.st.name)}）`,
    '#fc8',
  );
  return true;
}
/** v22.2 standing on the platform beside an open train (day-1 service only) → station index, else -1 */
function metroBoard() {
  if (!UT.power) return -1;
  for (let i = 0; i < metro.length; i++) {
    if (!metro[i].built) continue;
    const [OX, OZ] = stationOrigin(i);
    const lx = player.pos.x - OX,
      lz = player.pos.z - OZ;
    const ph = svc(i, gameMin).phase;
    if (Math.abs(lx) < 27 && lz > 24.5 && lz < 28.3 && (ph === 'open' || ph === 'opening')) return i;
  }
  return -1;
}
let riding = false;
const PS: { src?: string[] } = {};
/** v22.3 wallet */
const wallet = () => (surv.cash ??= 1200);
const SHOP_LOOT = /^m\d+:[0678]$/; // shop shelves: only lootable once the shops are dead
function shopAt(): Shop | null {
  if (player.pos.z > -6000) return null;
  let best: Shop | null = null,
    bd = 1.3;
  for (const st of metro) {
    if (!st.built) continue;
    for (const sh of st.shops) {
      const d = Math.hypot(player.pos.x - sh.p[0], player.pos.z - sh.p[1]);
      if (d < bd && (UT.power || sh.vend) && !(surv.pried || []).includes(sh.id)) ((bd = d), (best = sh));
    }
  }
  return best;
}
function shopUse(sh: Shop) {
  if (UT.power) {
    if (sh.kind === 'locker')
      log(tr('🔒 投幣置物櫃：每一格都有人在用，鎖著。', '🔒 Coin lockers: all occupied and locked.'), '#ccc');
    else openShop(sh);
    return true;
  }
  if (!sh.vend) return false;
  const tool = ['hammer', 'pipe', 'bat', 'knife'].find(k => player.inv[k]);
  const got = pryLoot(sh);
  for (const [k, n] of Object.entries(got)) addItem(k, n);
  (surv.pried ||= []).push(sh.id);
  setPried(new Set(surv.pried));
  noise(sh.p[0], sh.p[1], tool ? 24 : 36);
  const list = Object.entries(got)
    .map(([k, n]) => `${ITEMS[k]?.name || k}×${n}`)
    .join('、');
  log(
    getLanguage() === 'en'
      ? `${tool ? `🔧 Used ${ITEMS[tool].name} to pry open ` : '💥 Smashed open '}${sh.name} (very loud): ${list}`
      : `${tool ? `🔧 用${ITEMS[tool].name}撬開` : '💥 硬是砸開'}${sh.name}（好大聲）：${list}`,
    '#fc8',
  );
  return true;
}
function openShop(sh: Shop) {
  document.getElementById('shop')?.remove();
  const d = document.createElement('div');
  d.id = 'shop';
  const draw = () =>
    (d.innerHTML =
      (getLanguage() === 'en'
        ? `<h3>${sh.vend ? '🥤' : '🏪'} ${sh.name}</h3><p>Wallet NT$ ${wallet()}</p>`
        : `<h3>${sh.vend ? '🥤' : '🏪'} ${sh.name}</h3><p>錢包 NT$ ${wallet()}</p>`) +
      sh.stock
        .map(([k, pr]) => `<button data-k="${k}" data-p="${pr}">${ITEMS[k]?.name || k}　NT$ ${pr}</button>`)
        .join('') +
      tr('<button data-k="" class="x">離開</button>', '<button data-k="" class="x">Leave</button>'));
  draw();
  d.onclick = e => {
    const t = e.target as HTMLElement;
    const k = t.dataset?.k;
    if (k == null) return;
    if (!k) return d.remove();
    const pr = Number(t.dataset.p);
    if (wallet() < pr) return log(tr('💸 錢不夠了', '💸 Not enough money'), '#f99');
    surv.cash = wallet() - pr;
    addItem(k);
    log(
      sh.vend
        ? getLanguage() === 'en'
          ? `🥤 Clunk! ${ITEMS[k].name} drops out (NT$ ${pr})`
          : `🥤 喀噹！${ITEMS[k].name}掉了出來（NT$ ${pr}）`
        : getLanguage() === 'en'
          ? `🏪 Bought ${ITEMS[k].name} at ${sh.name} (NT$ ${pr})`
          : `🏪 在${sh.name}買了 ${ITEMS[k].name}（NT$ ${pr}）`,
      '#cfc',
    );
    draw();
  };
  document.body.appendChild(d);
}
function openRide(i: number) {
  document.getElementById('ride')?.remove();
  const d = document.createElement('div');
  d.id = 'ride';
  d.innerHTML =
    (getLanguage() === 'en'
      ? `<h3>🚇 Monga Orange Line · ${translateLabel(metro[i].name)} Station</h3><p>Choose your stop (about a 3-minute ride).</p>`
      : `<h3>🚇 艋舺橘線・${translateLabel(metro[i].name)}站</h3><p>選擇下車站（約 3 分鐘車程）</p>`) +
    metro
      .map((s, j) =>
        j === i
          ? ''
          : getLanguage() === 'en'
            ? `<button data-j="${j}">${translateLabel(s.name)} Station O${s.no}</button>`
            : `<button data-j="${j}">${translateLabel(s.name)}站 橘${s.no}</button>`,
      )
      .join('') +
    tr('<button data-j="-1" class="x">取消</button>', '<button data-j="-1" class="x">Cancel</button>');
  d.onclick = e => {
    const j = Number((e.target as HTMLElement).dataset?.j ?? NaN);
    if (Number.isNaN(j)) return;
    d.remove();
    if (j >= 0) rideTo(i, j);
  };
  document.body.appendChild(d);
}
function rideTo(i: number, j: number) {
  if (riding || !metro[j]) return;
  riding = true;
  const f = document.createElement('div');
  f.id = 'ridefade';
  f.innerHTML =
    getLanguage() === 'en'
      ? `<div class="car"><div class="win"></div><div class="win"></div><div class="win"></div></div><p>On the train · To ${translateLabel(metro[j].name)} Station</p><small>Next stop: ${translateLabel(metro[j].name)} — Please hold the handrail</small>`
      : `<div class="car"><div class="win"></div><div class="win"></div><div class="win"></div></div><p>車廂內・往 ${translateLabel(metro[j].name)}站</p><small>下一站 ${translateLabel(metro[j].name)}　請握緊扶手</small>`;
  document.body.appendChild(f);
  requestAnimationFrame(() => f.classList.add('on'));
  log(
    getLanguage() === 'en'
      ? `🚇 Boarded at ${translateLabel(metro[i].name)} Station, heading to ${translateLabel(metro[j].name)} Station`
      : `🚇 在${translateLabel(metro[i].name)}站上車，往${translateLabel(metro[j].name)}站`,
    '#fc8',
  );
  setTimeout(() => {
    ensureInterior(scene, metro[j], j);
    const [OX, OZ] = stationOrigin(j);
    player.pos.set(OX + 0.2, 0, OZ + 26.6);
    player.vel.set(0, 0, 0);
  }, 1400);
  setTimeout(() => {
    f.classList.remove('on');
    log(
      getLanguage() === 'en'
        ? `🚇 ${translateLabel(metro[j].name)} Station reached`
        : `🚇 ${translateLabel(metro[j].name)}站到了`,
      '#fc8',
    );
    setTimeout(() => (f.remove(), (riding = false)), 700);
  }, 3000);
}
function interact() {
  if (coopActive()) {
    const loot = Object.entries(net!.s!.loot || {}).find(
      ([id, l]) => !net!.s!.looted[id] && Math.hypot(l.x - player.pos.x, l.z - player.pos.z) <= 2.2,
    );
    if (loot) net!.cmd({ t: 'loot', id: loot[0] } as any);
    else if (doorNear(1.6) && !doorNear(1.6)!.barricaded) return toggleDoor(doorNear(1.6)!);
    else soonToast(tr('靠近綠色補給箱或敵人掉落物再互動', 'Move near a green supply crate or enemy drop to collect'));
    return;
  }
  if (npcInteract()) return;
  if (roofB || roofDoor()) {
    if (roofToggle()) return;
  }
  {
    const dn = doorNear(1.6);
    if (dn && !dn.barricaded && (!dn.open || (!nearestCont() && !atHome()))) return toggleDoor(dn);
  }
  if (metroUse()) return;
  if (document.getElementById('ride')) return document.getElementById('ride')!.remove();
  if (document.getElementById('shop')) return document.getElementById('shop')!.remove();
  {
    const sh = shopAt();
    if (sh && !nearestCont() && shopUse(sh)) return;
  }
  {
    const bi = metroBoard();
    if (bi >= 0) return openRide(bi);
  }
  if (survOpen) return closeSurv();
  {
    const t = tradeAt();
    if (t && !nearestCont()) return openSurv('trade');
  }
  if (atHome() && !nearestCont() && !drive.nearest(player.pos)) return openSurv('home');
  if (drive.cur) {
    const v = drive.cur;
    const o = drive.exit()!;
    player.pos.copy(o);
    collide(player.pos, 0.35);
    player.mesh.visible = true;
    log(getLanguage() === 'en' ? `Exit vehicle (${v.s.name})` : `下車（${v.s.name}）`, '#ccc');
    return;
  }
  {
    const w = roadT.wreckNear(player.pos.x, player.pos.z, 2.8);
    if (w && !w.looted && !nearestCont() && !drive.nearest(player.pos, 1.5)) {
      roadT.loot(w);
      const got = WRECK_LOOT[Math.floor(Math.random() * WRECK_LOOT.length)];
      for (const [k, n] of got) addItem(k, n);
      log(
        (getLanguage() === 'en'
          ? `🚗 Searching ${w.kind === 'bus' ? 'burned-out bus' : 'abandoned vehicle'}: `
          : `🚗 翻找${w.kind === 'bus' ? '燒毀的公車' : '廢棄車輛'}：`) +
          got.map(([k, n]) => `${ITEMS[k]?.name || k}×${n}`).join('、'),
        '#9f9',
      );
      return;
    }
  }
  {
    const v = drive.nearest(player.pos);
    if (v && !nearestCont()) {
      const rf = drive.refuel(v);
      if (rf) {
        log('⛽ ' + rf, '#9f9');
        return;
      }
      const rp = drive.repair(v);
      if (rp) {
        log('🔧 ' + rp, '#9f9');
        return;
      }
      const m = drive.enter(v);
      if (!m) {
        player.mesh.visible = v.s.two;
        log(
          getLanguage() === 'en'
            ? `${v.s.two ? 'Get on' : 'Get in'} ${v.s.name} | ${drive.status(v)}`
            : `${v.s.two ? '騎上' : '坐進'} ${v.s.name}｜${drive.status(v)}`,
          '#9f9',
        );
        return;
      }
      if (player.inv.hose && !v.s.pedal && !v.s.elec && v.fuel > 1 && !/接線/.test(m)) {
        log(drive.siphon(v), '#fc8');
        return;
      }
      log(m + '｜' + drive.status(v), '#ccc');
      return;
    }
  }
  const c = nearestCont();
  const v = !c && vehicles.nearest(player.pos, 2.2);
  if (v) {
    log(
      v.kind === 'truck'
        ? tr('佔領軍卡車，油箱上鎖', "Occupation forces' truck. Fuel tank locked.")
        : tr('這台被鎖死了，零件也被拆光，找別台吧', 'Locked tight and stripped of parts. Find another vehicle.'),
      '#ccc',
    );
    return;
  }
  if (c && /飲水機|流理台|廚房/.test(c.label)) {
    if (!UT.water) {
      log(tr('水龍頭只流出幾滴…停水了。', 'Only a few drops from the tap... The water is off.'), '#e88');
    } else if ((c as any).tapT === undefined || gameMin > (c as any).tapT) {
      (c as any).tapT = gameMin + 90;
      c.items.water = (c.items.water || 0) + 1;
      log(tr('接了一瓶自來水。', 'Filled a bottle with tap water.'), '#9cf');
    }
  }
  if (c && !(c as any).seen) {
    const id = c.id;
    let hsh = 0;
    for (let i = 0; i < id.length; i++) hsh = (hsh * 31 + id.charCodeAt(i)) | 0;
    // v22 moral choice: some homes still have an old person living in them
    if (c.label === '櫥櫃' && Math.abs(hsh) % 5 === 0 && !(c as any).asked) {
      (c as any).asked = 1;
      pendingCont = c;
      return openSurv('moral');
    }
    (c as any).seen = 1;
    if (SV.isNight(gameMin) && Math.abs(hsh) % 3 === 0) {
      const k = ['cig', 'battery', 'can', 'rice', 'pill'][Math.abs(hsh) % 5];
      c.items[k] = (c.items[k] || 0) + 1;
      log(tr('🌙 夜裡摸黑翻找，多找到一些東西。', '🌙 Searching in the dark, you find a few extra supplies.'), '#adf');
    }
  }
  if (c) {
    curCont = c;
    AU.rummage();
    panelOpen = true;
    document.body.classList.add('inventory-open');
    joy.x = joy.y = 0;
    joy.id = -1;
    $('joyk').style.transform = '';
    MB.fire = false;
    $('panel').classList.remove('hidden');
    renderPanel();
  }
}
const plankMat = new THREE.MeshStandardMaterial({ color: 0x9a7040 });
function setBarricade(d: Door) {
  d.barricaded = true;
  (d as LiveDoor).open = false;
  d.seg = { a: d.a, b: d.c };
  addSeg(d.seg);
  const l = Math.hypot(d.c[0] - d.a[0], d.c[1] - d.a[1]);
  const m = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(l + 0.3, 0.25, 0.08), plankMat);
    p.position.y = 0.6 + i * 0.6;
    p.rotation.z = (i - 1) * 0.15;
    p.castShadow = true;
    m.add(p);
  }
  m.position.set(d.p[0], 0, d.p[1]);
  m.rotation.y = -Math.atan2(d.c[1] - d.a[1], d.c[0] - d.a[0]);
  scene.add(m);
  d.mesh = m as any;
}
function barricade() {
  const d = nearestDoor();
  if (!d) {
    log(tr('附近沒有門', 'No door nearby'));
    return;
  }
  if (d.barricaded) {
    removeSeg(d.seg!);
    scene.remove(d.mesh!);
    d.barricaded = false;
    addItem('plank');
    log(tr('拆掉了封門木板', 'Barricade planks removed'));
    noise(player.pos.x, player.pos.z, 10);
    return;
  }
  if (!player.inv.hammer || !player.inv.plank) {
    log(tr('封門需要 鐵鎚 + 木板', 'Barricading requires a hammer and plank.'), '#f99');
    return;
  }
  if (--player.inv.plank <= 0) delete player.inv.plank;
  setBarricade(d);
  noise(player.pos.x, player.pos.z, 18);
  log(tr('門封好了（敲打聲可能引來巡邏）', 'Door barricaded (hammering may attract patrols).'), '#9f9');
}
function sleep() {
  if (!bldAt(player.pos.x, player.pos.z)) {
    log(tr('只能在室內睡覺', 'You can only sleep indoors.'), '#f99');
    return;
  }
  if (sols.some(s => s.state === 'combat')) {
    log(tr('有敵人在追你，睡不著', 'Enemies are chasing you. You cannot sleep.'), '#f99');
    return;
  }
  if (player.fatigue < 20) {
    log(tr('你還不累', 'You are not tired yet.'));
    return;
  }
  if (dangerNear()) {
    log(tr('附近有佔領軍，現在睡太危險', 'Occupation troops nearby. Too dangerous to sleep.'), '#f99');
    return;
  }
  player.sleeping = true;
  log(tr('你閉上眼睛…（時間快轉 ×20）', 'You close your eyes... (Time speed ×20)'), '#aaf');
  renderSpeed();
}

// ---------- combat ----------
function tryVault() {
  if (player.vaultT > 0 || player.sleeping || dead) return;
  const fwd =
    player.vel.length() > 0.3
      ? player.vel.clone().setY(0).normalize()
      : new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
  const p: V2 = [player.pos.x, player.pos.z],
    q: V2 = [player.pos.x + fwd.x * 1.3, player.pos.z + fwd.z * 1.3];
  let hit: Seg | null = null;
  for (const sg of nearSegs(p[0], p[1]))
    if (segX(p, q, sg.a, sg.b)) {
      if (!sg.low) return log(tr('太高了，翻不過去', 'Too high to vault'));
      hit = sg;
    }
  if (!hit) return;
  const to = new THREE.Vector3(player.pos.x + fwd.x * 1.5, 0, player.pos.z + fwd.z * 1.5);
  const chk = to.clone();
  collide(chk, 0.35);
  if (chk.distanceTo(to) > 0.2 || bldAt(to.x, to.z) !== bldAt(player.pos.x, player.pos.z))
    return log(tr('另一側沒有空間', 'No room on the other side'));
  player.vFrom.copy(player.pos);
  player.vTo.copy(to);
  player.vaultT = 0.55;
  player.rig.vaultT = 0.55;
  player.mesh.rotation.y = Math.atan2(fwd.x, fwd.z);
  noise(player.pos.x, player.pos.z, 4);
}
function shove() {
  if (player.cd > 0 || player.sleeping || dead) return;
  player.cd = 0.6;
  player.rig.shoveT = 0.35;
  noise(player.pos.x, player.pos.z, 3);
  const f = new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
  for (const s of sols) {
    if (s.state === 'dead') continue;
    const to = s.pos.clone().sub(player.pos);
    const d = to.length();
    if (d > 1.5 || to.normalize().dot(f) < 0.4) continue;
    s.stun = 1.6;
    s.rig.hurtT = 0.35;
    s.rig.hurtSide = rnd() < 0.5 ? -1 : 1;
    s.pos.addScaledVector(f, 0.9);
    collide(s.pos, 0.35);
    s.state = 'combat';
    s.alert = 1;
    s.lastSeen = [player.pos.x, player.pos.z];
    log(tr('推開！敵人踉蹌', 'Shoved! The enemy staggers.'), '#ff9');
    break;
  }
}
function playerAttack() {
  const k = player.equip;
  const d = k ? ITEMS[k] : ({ dmg: 8, range: 1.1, noise: 2, cd: 0.5, kind: 'melee' } as any);
  if (player.cd > 0) return;
  netAttack();
  if (coopActive()) {
    player.cd = d.cd || 0.5;
    if (d.kind === 'gun') player.rig.shootT = 0.14;
    else startMelee(player.rig, Math.max(0.42, (d.cd || 0.5) * 0.85));
    return; // Server owns hits, ammo, deaths and drops; never run the solo damage path.
  }
  player.cd = d.cd;
  if (d.kind === 'gun') player.rig.shootT = 0.14;
  else startMelee(player.rig, Math.max(0.42, (d.cd || 0.5) * 0.85));
  const dir = new THREE.Vector3(aimPt.x - player.pos.x, 0, aimPt.z - player.pos.z).normalize();
  if (d.kind === 'gun') {
    if (!player.inv[d.ammo]) {
      log(tr('沒有子彈了', 'Out of ammunition'), '#f99');
      player.cd = 0.5;
      return;
    }
    if (--player.inv[d.ammo] <= 0) delete player.inv[d.ammo];
    AU.gunshot(AU.gunKind(k, d), 0, !!bldAt(player.pos.x, player.pos.z));
    noise(player.pos.x, player.pos.z, d.noise);
    if (d.at) {
      fireAT(k, d, dir);
      return;
    }
    // v21.4 the round stops at the first wall / cover it meets (aimed at chest height)
    const P0: V2 = [player.pos.x, player.pos.z];
    let hit: Sol | null = null,
      hd = d.range * shotRay(P0, [player.pos.x + dir.x * d.range, player.pos.z + dir.z * d.range], 1.35, 1.25);
    for (const s of sols) {
      if (s.state === 'dead') continue;
      const to = s.pos.clone().sub(player.pos);
      const t = to.dot(dir);
      if (t < 0 || t > hd) continue;
      const perp = to.clone().sub(dir.clone().multiplyScalar(t)).length();
      if (perp < 0.55 && shotRay(P0, [s.pos.x, s.pos.z], 1.35, s.crouch ? 0.75 : 1.25) >= 1) {
        hit = s;
        hd = t;
      }
    }
    tracer(player.pos, player.pos.clone().add(dir.clone().multiplyScalar(hd)));
    if (hit) damageSol(hit, d.dmg * (0.8 + rnd() * 0.4), false);
    else if (armor) {
      for (const a of armor.list) {
        if (a.dead) continue;
        const to = a.g.position.clone().sub(player.pos);
        to.y = 0;
        const t = to.dot(dir);
        if (t > 0 && t < hd + 2 && to.clone().sub(dir.clone().multiplyScalar(t)).length() < 2.2) {
          armor.hit(a.g.position.x, a.g.position.z, d.dmg, false);
          break;
        }
      }
    }
  } else {
    noise(player.pos.x, player.pos.z, d.noise);
    // v22.10 the hit lands at the contact frame of the swing, not on the click
    pendMelee = { d, dir, swished: false };
  }
}
let pendMelee: { d: any; dir: THREE.Vector3; swished: boolean } | null = null;
const swingTrail = new SwingTrail(scene);
const _tb = new THREE.Vector3(),
  _tt = new THREE.Vector3();
const TIP: Record<string, number> = { knife: 0.27, bat: 0.8, pipe: 0.84 };
function meleeTick(dt: number) {
  const r = player.rig;
  if (!r) return;
  const q = meleeQ(r);
  if (pendMelee) {
    if (!pendMelee.swished && q >= 0.32) {
      pendMelee.swished = true;
      AU.swish(0, r.weaponKind === 'bat' || r.weaponKind === 'pipe');
    }
    if (q < 0 || q >= 0.44) {
      const hit = meleeResolve(pendMelee.d, pendMelee.dir);
      pendMelee = null;
      if (hit) {
        hitStop(r, 0.07);
        AU.meleeHit(0, r.weaponKind !== 'knife');
        blastFx.kick(0.6, 0.03); // tiny impact jolt (shake offset only, camera unchanged)
      }
    }
  }
  // blade trail through the fast arc
  const tip = TIP[r.weaponKind];
  if (tip && q >= 0.3 && q <= 0.62 && r.weapon.visible !== false) {
    r.weapon.updateWorldMatrix(true, false);
    _tb.set(0, 0, tip * 0.35).applyMatrix4(r.weapon.matrixWorld);
    _tt.set(0, 0, tip).applyMatrix4(r.weapon.matrixWorld);
    swingTrail.add(_tb, _tt);
  }
  swingTrail.update(dt);
}
function meleeResolve(d: any, dir: THREE.Vector3): Sol | null {
  if (roofB && snp) {
    const s = snp.list.find(
      q => !q.dead && q.b === roofB && Math.hypot(q.p[0] - player.pos.x, q.p[1] - player.pos.z) < d.range + 0.6,
    );
    if (s) {
      snp.hit(s, d.dmg * 4, s.st !== 'aim');
      log(
        s.dead
          ? tr('你從背後制伏了狙擊手。', 'You subdue the sniper from behind.')
          : tr('狙擊手掙扎反抗！', 'The sniper fights back!'),
        '#ff9',
      );
      return null;
    }
  }
  for (const s of sols) {
    if (s.state === 'dead') continue;
    const to = s.pos.clone().sub(player.pos);
    const dist = to.length();
    if (dist > d.range + 0.3) continue;
    if (to.normalize().dot(dir) < 0.5) continue;
    const stealth = s.state !== 'combat' && s.alert < 0.5;
    damageSol(s, d.dmg * (stealth ? 3.2 : 1), stealth);
    // flinch + knockback away from the blow, paused for the same hit-stop beat
    hitStop(s.rig, 0.07);
    const kb = s.pos.clone().addScaledVector(dir, s.hp > 0 ? 0.45 : 0.25);
    if (!bldAt(kb.x, kb.z) || bldAt(kb.x, kb.z) === bldAt(s.pos.x, s.pos.z)) {
      s.pos.copy(kb);
      collide(s.pos, 0.35);
    }
    return s;
  }
  return null;
}
function damageSol(s: Sol, dmg: number, stealth: boolean) {
  s.hp -= dmg;
  if (stealth) log(tr('偷襲！', 'Sneak attack!'), '#ff9');
  if (s.hp <= 0) {
    s.state = 'dead';
    AU.death(pDist(s.pos.x, s.pos.z));
    s.cone.visible = false;
    if (s.tile) district.save(s.tile, 'dead', { ...(district.saved[s.tile]?.dead || {}), [s.tid!]: 1 });
    player.kills++;
    log(tr('擊倒一名佔領軍士兵', 'An occupation soldier is down.'), '#ffd76a');
    const it = plaDrop(s.id);
    const dc = makeCont('d' + s.id, [s.pos.x, s.pos.z], 'crate', undefined, it);
    dc.label = tr('士兵遺留裝備', 'Dropped soldier equipment');
    dropGun(dc, s.pos, it);
    checkSectors();
  } else {
    s.rig.hurtT = 0.35;
    s.rig.hurtSide = rnd() < 0.5 ? -1 : 1;
    s.mHit = undefined; // a hit interrupts a rifle-butt wind-up
    s.stun = Math.max(s.stun || 0, 0.4);
    s.state = 'combat';
    s.alert = 1;
    s.lastSeen = [player.pos.x, player.pos.z];
  }
}
const liberated = new Set<number>();
function checkSectors(silent = false) {
  for (let i = 0; i < NSEC; i++) {
    if (liberated.has(i)) continue;
    let alive = sols.filter(s => s.sector === i && s.state !== 'dead').length;
    let total = sols.filter(s => s.sector === i).length;
    if (outerSector(i)) {
      const g = garrisonOf(i);
      total = g ? GARRISON : 0;
      alive = g
        ? GARRISON - Object.keys(district.saved[g.key]?.dead || {}).filter(k => +k >= 0 && +k < GARRISON).length
        : 0;
    }
    if (total > 0 && alive === 0) {
      liberated.add(i);
      if (!silent)
        log(
          getLanguage() === 'en' ? `★ ${SECTOR_LABEL(i)} district reclaimed!` : `★ ${SECTOR_LABEL(i)} 街區已奪回！`,
          '#7fff7f',
        );
    }
  }
  rocCheck(silent);
}

// ---------- save (localStorage I/O lives in systems/save.ts; keys and JSON stay defendtaipei-save-v1 + dt.tiles) ----------
// ---------- story: utilities timeline (有電有水 → 斷電 → 斷水) ----------
const UT = { power: true, water: true, ev: {} as Record<string, 1> };
const POWER_OFF = 2 * 1440 + 19 * 60,
  WATER_OFF = 4 * 1440 + 7 * 60; // 第3天 19:00 斷電・第5天 07:00 斷水
const EV0 = 6 * 1440 + 6 * 60,
  EV1 = 7 * 1440 + 18 * 60;
let evac: ReturnType<typeof buildEvacZone> | null = null;
const evacOpen = () => !UT.ev.ex && gameMin >= EV0 && gameMin < EV1;
function doEvac(mode: 'heli' | 'boat' = 'heli') {
  if (cine.on) return;
  if (mode === 'heli') UT.ev.ex = 1;
  save();
  closePanel();
  setSpeed(1);
  started = false;
  const items = Object.values(player.inv).reduce((a, b) => a + b, 0);
  const day = Math.floor(gameMin / 1440) + 1;
  const hh2 =
    String(Math.floor((gameMin % 1440) / 60)).padStart(2, '0') +
    ':' +
    String(Math.floor(gameMin % 60)).padStart(2, '0');
  playEvac(renderer, mode, () => {
    const d = document.createElement('div');
    d.id = 'evacend';
    d.innerHTML =
      getLanguage() === 'en'
        ? `<h1>You have reached safety aboard USS Gerald R. Ford (CVN-78)</h1><h2>An alternate ending: you survived and carried Wanhua's story to the world. (Evacuation route: ${mode === 'boat' ? 'Boat · Out to sea via the Tamsui River' : 'Helicopter · Riverside extraction zone'})</h2><table><tr><td>Evacuation route</td><td>${mode === 'boat' ? '🚤 Boat (contact pickup)' : '🚁 Helicopter'}</td></tr><tr><td>Days survived</td><td>${day} days (Day ${day}, ${hh2})</td></tr><tr><td>Districts reclaimed</td><td>${liberated.size} / ${NSEC}</td></tr><tr><td>Occupation troops defeated</td><td>${player.kills}</td></tr><tr><td>Items carried</td><td>${items} items</td></tr></table><div><button id=evcont>Stay in Wanhua (the road to liberation)</button><button id=evnew>New game</button></div><p style="font-size:12px;color:#678;margin-top:18px">A work of fiction · Ships and helicopters use generic low-poly models</p>`
        : `<h1>您已成功撤離至 福特號航空母艦（USS Gerald R. Ford, CVN-78）</h1><h2>另一個結局：你活了下來，把萬華的故事帶出去。（撤離路線：${mode === 'boat' ? '小艇・淡水河出海' : '直升機・河濱撤離區'}）</h2><table><tr><td>撤離路線</td><td>${mode === 'boat' ? '🚤 小艇（聯絡人接應）' : '🚁 直升機'}</td></tr><tr><td>存活天數</td><td>${day} 天（第 ${day} 天 ${hh2}）</td></tr><tr><td>奪回街區</td><td>${liberated.size} / ${NSEC}</td></tr><tr><td>擊倒佔領軍</td><td>${player.kills}</td></tr><tr><td>攜帶物品</td><td>${items} 件</td></tr></table><div><button id=evcont>繼續留在萬華（奪回之路）</button><button id=evnew>新遊戲</button></div><p style="font-size:12px;color:#678;margin-top:18px">虛構作品・艦艇與直升機為通用低多邊形模型</p>`;
    document.body.appendChild(d);
    $('evcont').onclick = () => {
      d.remove();
      started = true;
      log(tr('你決定留下來，繼續奪回萬華。', 'You choose to stay and keep fighting to reclaim Wanhua.'), '#ffd27a');
    };
    $('evnew').onclick = () => {
      clearSave();
      location.reload();
    };
  });
}
const STORY: { t: number; id: string; who: string; msg: string; fx?: () => void }[] = [
  {
    t: 8 * 60 + 5,
    id: 'a',
    who: tr('📱 國家級警報', '📱 National emergency alert'),
    msg: tr(
      '萬華、中正一帶實施戒嚴，民眾非必要請勿外出。夜間 20:00 後宵禁。',
      'Martial law is in effect in Wanhua and Zhongzheng. Avoid nonessential travel. Curfew begins at 20:00.',
    ),
  },
  {
    t: 12 * 60,
    id: 'b',
    who: tr('📻 北廣 AM765（北都廣播電台）', '📻 Beiguang AM765 (Beidu Radio)'),
    msg: tr(
      '…佔領當局宣稱「水電維持正常供應」，但多處變電所已遭接管…',
      '...Occupation authorities claim water and power supplies remain normal, but several substations have been seized...',
    ),
  },
  {
    t: 1440 + 9 * 60,
    id: 'c',
    who: tr('💬 里長通訊群組', '💬 Neighborhood chief group chat'),
    msg: tr(
      '各位鄰居：聽說電力公司員工被帶走了，大家趕快把水桶裝滿、手機充飽電！',
      'Neighbors: we heard the power company staff were taken away. Fill your buckets and charge your phones now!',
    ),
  },
  {
    t: 2 * 1440 + 14 * 60,
    id: 'd',
    who: tr('📱 電力公司簡訊', '📱 Power company text'),
    msg: tr(
      '【停電通知】因「軍事管制」，萬華區即日起停止供電，復電時間未定。',
      '[Power outage notice] Due to military control, power to Wanhua is suspended immediately. Restoration time unknown.',
    ),
  },
  {
    t: POWER_OFF,
    id: 'P',
    who: tr('⚡ 斷電', '⚡ Blackout'),
    msg: tr(
      '整條街一瞬間暗了下來。冰箱停了，裡面的食物撐不了多久。',
      'The whole street goes dark at once. The fridge stops. The food inside will not last long.',
    ),
    fx: () => {
      UT.power = false;
    },
  },
  {
    t: 3 * 1440 + 10 * 60,
    id: 'e',
    who: tr('📻 收音機（電池）', '📻 Radio (battery powered)'),
    msg: tr(
      '…自來水事業處人員已撤離，加壓站停擺，高樓層將最先停水…',
      '...Water department staff have evacuated. Pumping stations are down. Upper floors will lose water first...',
    ),
  },
  {
    t: 1440 + 7 * 60,
    id: 'r1',
    who: tr('📻 地下電台「自由之聲」', '📻 Underground radio: Voice of Freedom'),
    msg: tr(
      '…這裡是自由之聲。國軍與志願者仍在新店溪南岸堅守，請萬華的鄉親保持冷靜、儲水、避開大馬路…',
      '...This is Voice of Freedom. ROC troops and volunteers are still holding the south bank of the Xindian River. People of Wanhua, stay calm, store water and avoid main roads...',
    ),
  },
  {
    t: 2 * 1440 + 21 * 60,
    id: 'r2',
    who: tr('📻 地下電台「自由之聲」', '📻 Underground radio: Voice of Freedom'),
    msg: tr(
      '…停電了？別慌。收音機用電池還能撐。宵禁時佔領軍會帶手電筒巡邏，看到光束就躲進騎樓…',
      '...No power? Stay calm. A battery-powered radio still works. Occupation troops patrol with flashlights during curfew. If you see a beam, duck under an arcade...',
    ),
  },
  {
    t: 3 * 1440 + 13 * 60,
    id: 'r3',
    who: tr('📻 地下電台「自由之聲」', '📻 Underground radio: Voice of Freedom'),
    msg: tr(
      '…注意！今天 15:00 前後會有一批物資空投到萬華，紅色煙霧就是信號。佔領軍也會去搶，動作要快！',
      '...Attention! Supplies will be airdropped into Wanhua around 15:00 today. Look for red smoke. Occupation troops will try to seize them too. Move fast!',
    ),
  },
  {
    t: 3 * 1440 + 15 * 60,
    id: 'AD',
    who: tr('🪂 空投', '🪂 Airdrop'),
    msg: tr(
      '遠處升起一道紅色煙霧——物資箱落地了！佔領軍的巡邏隊正往那邊移動。',
      'Red smoke rises in the distance. The supply crate has landed! Occupation patrols are heading toward it.',
    ),
    fx: () => airdrop(),
  },
  {
    t: 4 * 1440 + 20 * 60,
    id: 'r4',
    who: tr('📻 地下電台「自由之聲」', '📻 Underground radio: Voice of Freedom'),
    msg: tr(
      '…停水第一天。把水桶、臉盆放到頂樓或戶外，下雨就能接水。雨水記得煮過再喝…',
      '...First day without running water. Put buckets and basins on rooftops or outside to catch rain. Remember to boil rainwater before drinking...',
    ),
  },
  {
    t: 6 * 1440 + 12 * 60,
    id: 'r5',
    who: tr('📻 地下電台「自由之聲」', '📻 Underground radio: Voice of Freedom'),
    msg: tr(
      '…西門町一帶已有三個街區被奪回！每一區的勝利，都讓他們更害怕…',
      '...Three districts around Ximending have been reclaimed! Every victory makes them more afraid...',
    ),
  },
  {
    t: 5 * 1440 + 20 * 60,
    id: 'e0',
    who: tr('📻 地下電台「自由之聲」', '📻 Underground radio: Voice of Freedom'),
    msg: tr(
      '…有消息說，盟軍正在河濱準備一條撤離通道。明早請守在收音機旁…',
      '...Reports say allied forces are preparing an evacuation route by the river. Stay by your radio tomorrow morning...',
    ),
  },
  {
    t: EV0,
    id: 'e1',
    who: tr('📻 地下電台「自由之聲」', '📻 Underground radio: Voice of Freedom'),
    msg: tr(
      '撤離窗口開啟！西側河濱撤離區（綠色 H、紅色信號彈）將有直升機接應，時限至第 8 天 18:00。想留下來奪回家園的人，我們也與你同在。',
      'The evacuation window is open! Helicopters will pick you up at the western riverside extraction zone, marked by a green H and red flare. Open until Day 8, 18:00. To those staying to reclaim their homes: we stand with you too.',
    ),
    fx: () => slowDown(tr('撤離廣播', 'Evacuation broadcast')),
  },
  {
    t: EV1,
    id: 'e2',
    who: tr('📻 地下電台「自由之聲」', '📻 Underground radio: Voice of Freedom'),
    msg: tr(
      '撤離窗口已關閉。留下來的人——台北靠你們奪回。',
      'The evacuation window has closed. To everyone still here: reclaiming Taipei is in your hands.',
    ),
  },
  {
    t: WATER_OFF,
    id: 'W',
    who: tr('🚱 停水', '🚱 Water supply cut'),
    msg: tr(
      '水龍頭只流出幾滴黃水就停了。從現在起，每一瓶水都很珍貴。',
      'A few drops of yellow water trickle from the tap, then nothing. From now on, every bottle matters.',
    ),
    fx: () => {
      UT.water = false;
    },
  },
];
// v23.1 radio log (saved) — every 📻 broadcast with its in-game time
let radioLog: [m: number, who: string, msg: string][] = [];
function radioLogHtml() {
  if (!radioLog.length)
    return tr('<p class="mnote">還沒有收到任何廣播。</p>', '<p class="mnote">No broadcasts received yet.</p>');
  const t = (m: number) =>
    getLanguage() === 'en'
      ? `Day ${Math.floor(m / 1440) + 1} ${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      : `第 ${Math.floor(m / 1440) + 1} 天 ${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const esc = (x: string) => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  return `<div class="rlog">${radioLog
    .slice()
    .reverse()
    .map(([m, w, x]) => `<div class="rl"><i>${t(m)}</i><b>${esc(w)}</b><p>${esc(x)}</p></div>`)
    .join('')}</div>`;
}
function phoneTimer(el: HTMLElement, ms: number) {
  clearTimeout((phone as any).t);
  (phone as any).t = setTimeout(() => el.classList.remove('on', 'exp'), ms);
}
function phone(who: string, msg: string) {
  const el = $('phone');
  if (who.startsWith('📻')) {
    radioLog.push([Math.floor(gameMin), who, msg]);
    if (radioLog.length > 200) radioLog.shift();
    BC.broadcast(who, msg);
  }
  el.classList.remove('exp');
  if (!(el as any).tap) {
    (el as any).tap = 1;
    // tap / click: expand to the full text, again to collapse (never reaches the joystick / fire handlers)
    for (const ev of ['pointerdown', 'touchstart', 'mousedown']) el.addEventListener(ev, e => e.stopPropagation());
    el.addEventListener('click', e => {
      e.stopPropagation();
      const x = el.classList.toggle('exp');
      phoneTimer(el, x ? 30000 : 4000);
    });
  }
  el.innerHTML = `<b>${who}</b><div class="pm">${msg}</div>`;
  if (document.body.classList.contains('portrait')) {
    // v23.0.1: portrait radio card directly under the status panel, same width
    const r = $('stats').getBoundingClientRect();
    el.style.left = r.left + 'px';
    el.style.top = r.bottom + 6 + 'px';
    el.style.width = r.width + 'px';
  } else el.style.left = el.style.top = el.style.width = '';
  el.classList.add('on');
  phoneTimer(el, 9000);
  log(`${who}：${msg}`, '#9fd0ff', 'radio');
}
// Explicit developer-only event trigger; no story events are scheduled automatically.
const STORY_DEBUG = new URLSearchParams(location.search).get('storydebug') === '1';
let storySaved: unknown;
let storyRunner = createStoryRunner();
if (STORY_DEBUG)
  on('broadcast', e => {
    if (started && !dead) phone(e.station, e.text);
  });
let spoilT = 0;
const PERISH = ['bento', 'rice', 'oden', 'soymilk', 'milktea', 'danbing', 'chicken', 'sausage', 'egg'];
function updateStory(gm: number) {
  for (const e of STORY)
    if (gameMin >= e.t && !UT.ev[e.id]) {
      UT.ev[e.id] = 1;
      e.fx?.();
      if (gameMin - e.t < 120) phone(e.who, e.msg);
    }
  if (gameMin >= POWER_OFF) UT.power = false;
  if (gameMin >= WATER_OFF) UT.water = false;
  if (!UT.power) {
    spoilT += gm;
    if (spoilT > 6) {
      spoilT = 0;
      for (const c of conts)
        if (/冷藏|櫃台|攤/.test(c.label))
          for (const k of PERISH)
            if (c.items[k] && rnd() < 0.15) {
              c.items[k]--;
              if (!c.items[k]) delete c.items[k];
              c.items.rotten = (c.items.rotten || 0) + 1;
            }
    }
  }
}
function save() {
  if (!started || dead || NOSAVE) return;
  gmap?.save();
  writeSave({
    r: ROLE.id,
    surv,
    g: player.gender,
    p: [player.pos.x, player.pos.z],
    hp: player.hp,
    hu: player.hunger,
    th: player.thirst,
    fa: player.fatigue,
    bl: player.bleed,
    inv: player.inv,
    eq: player.equip,
    k: player.kills,
    t: gameMin,
    dl: DAYH,
    wx: WX,
    ex: UT.ev.ex || 0,
    inf: INF,
    ut: UT,
    conts: conts.map(c => [c.id, c.items, c.p]),
    dead: sols.filter(s => s.state === 'dead').map(s => s.id),
    bar: doors.map((d, i) => (d.barricaded ? i : -1)).filter(i => i >= 0),
    radio: radioLog,
    story: STORY_DEBUG ? storyRunner.snapshot() : storySaved,
  });
}

// ---------- main loop ----------
let started = false,
  dead = false;
addEventListener('dt:before-language-change', event => {
  if (started && !dead && (MP || PRO.on)) {
    event.preventDefault();
    alert(
      tr(
        '請先結束開場或離開多人遊戲，再切換語言。',
        'Finish the prologue or leave multiplayer before changing language.',
      ),
    );
    return;
  }
  if (started && !dead && NOSAVE) {
    event.preventDefault();
    alert(
      tr(
        '目前無法安全存檔，請稍後再切換語言。',
        'Progress cannot be saved safely right now. Try changing language later.',
      ),
    );
    return;
  }
  if (started && !dead) {
    try {
      save();
      (event as CustomEvent).detail.resume = true;
    } catch {
      event.preventDefault();
      alert(tr('無法儲存進度，因此沒有切換語言。', 'Progress could not be saved, so the language was not changed.'));
    }
  }
});
const clock = new THREE.Clock();
let acc = 0,
  saveT = 0,
  streetT = 0;
function update(dt: number) {
  for (let i = fx.length - 1; i >= 0; i--) {
    fx[i].t -= dt;
    if (fx[i].t <= 0) {
      scene.remove(fx[i].o);
      fx.splice(i, 1);
    }
  }
  if (dead && player.rig) animate(player.rig, 'death', 0, dt);
  for (const s of sols) if (s.state === 'dead' && s.rig.deadT < 1) animate(s.rig, 'death', 0, dt);
  if (evac) evac.update(dt, evacOpen());
  if (metro.length && PS.src !== surv.pried) setPried(new Set((PS.src = surv.pried ||= [])));
  if (metro.length) metroTick(performance.now() / 1000, gameMin, UT.power, player.pos.x, player.pos.z);
  if (evac && evacOpen()) gmap?.intel('evac0', evac.pos[0], evac.pos[1], 'evac', tr('撤離點', 'Extraction point'));
  if (started) {
    gmap?.update();
    updatePrologue(dt);
  }
  pumpRoofs(player.pos.x, player.pos.z, started ? 3 : 8);
  if (!started || dead || paused) return;
  updateInformant(dt);
  if (evac && evacOpen() && Math.hypot(player.pos.x - evac.pos[0], player.pos.z - evac.pos[1]) < 5) doEvac();
  if (speed > 1 && dangerNear()) slowDown(tr('佔領軍接近', 'Occupation troops approaching'));
  if (player.sleeping && dangerNear()) slowDown(tr('佔領軍接近', 'Occupation troops approaching'));
  if (player.hp < lastHp - 2) slowDown(tr('你受傷了', 'You are hurt'));
  lastHp = player.hp;
  const tscale = player.sleeping ? 20 : speed;
  gameMin += dt * tscale * MPS(); // day length chosen at new game (1h/2h/4h real per in-game day)
  const gm = (dt * tscale * MPS()) / 60; // game hours
  updateWeather(dt, gm);
  updateStory(gm);
  {
    // v22: every 06:00 the shelter's day is resolved
    const dn = Math.floor((gameMin - 360) / 1440);
    if (survDay < 0) survDay = dn;
    else if (dn > survDay) {
      survDay = dn;
      const out = SV.dayTick(surv, WX.amt > 0.2, {
        power: on => (UT.power = on),
        water: on => (UT.water = on),
      });
      out.forEach(t => log(t, '#fd9'));
    }
  }
  player.hunger -= gm * 2.2;
  player.thirst -= gm * 3.2;
  player.fatigue += player.sleeping ? -gm * 14 * (ROLE.skills.rest ?? 1) : gm * 2.6;
  if (player.sleeping && player.fatigue <= 0) {
    player.sleeping = false;
    log(tr('你醒了', 'You wake up'), '#aaf');
    renderSpeed();
  }
  if (player.sleeping && sols.some(s => s.state === 'combat')) {
    player.sleeping = false;
    log(tr('你被驚醒了！', 'You wake with a start!'), '#f66');
  }
  player.hunger = clamp(player.hunger, 0, 100);
  player.thirst = clamp(player.thirst, 0, 100);
  player.fatigue = clamp(player.fatigue, 0, 100);
  if (player.hunger <= 0 || player.thirst <= 0) player.hp -= gm * 8;
  if (player.bleed) player.hp -= dt * 0.6;
  if (player.hunger > 50 && player.thirst > 50 && !player.bleed) player.hp = Math.min(100, player.hp + gm * 6);
  if (MP) syncServerVitals();
  else if (player.hp <= 0) return die();
  if (dead) return;
  vehicles.update(dt);
  if (armor && started && !PRO.hide) armor.update(dt);
  if (started) snpUpdate(dt);
  if (started) audioTick(dt);
  if (recon && started && !PRO.hide) recon.update(dt, performance.now() / 1000);
  if (roc && started && !PRO.hide) roc.update(dt);
  ROC.cd = Math.max(0, ROC.cd - dt);
  updateShells(dt);
  player.cd -= dt;
  meleeTick(dt);
  clutterTick(dt);
  // movement
  if (drive.cur) {
    const f = new THREE.Vector3(-1, 0, -1).normalize(),
      r = new THREE.Vector3(1, 0, -1).normalize();
    const mv = new THREE.Vector3();
    if (keys[K('up')]) mv.add(f);
    if (keys[K('down')]) mv.sub(f);
    if (keys[K('right')]) mv.add(r);
    if (keys[K('left')]) mv.sub(r);
    if (mv.lengthSq()) mv.normalize();
    const jm = Math.min(1, Math.hypot(joy.x, joy.y));
    if (jm > 0.12) mv.addScaledVector(f, -joy.y).addScaledVector(r, joy.x);
    drive.update(dt, mv, UT.power);
    const v = drive.cur;
    if (v) {
      player.pos.set(v.pos.x, 0, v.pos.z);
      player.mesh.position.set(v.pos.x, v.s.seatY - 0.45, v.pos.z);
      player.mesh.rotation.y = v.hd;
      player.moving = 0;
      player.vel.set(0, 0, 0);
    }
  } else drive.update(dt, new THREE.Vector3(), UT.power);
  roadT.update(player.pos.x, player.pos.z, dt);
  district.update(player.pos.x, player.pos.z);
  traffic.update(dt);
  if (drive.cur) {
    const v = drive.cur;
    const b = roadT.barrierAt(v.pos.x, v.pos.z, v.s.two ? 1.2 : 2.0);
    if (b) {
      if (Math.abs(v.v) > 6 && !v.s.two) {
        roadT.clear(b.key, b.id);
        v.v *= 0.5;
        v.eng = Math.max(0, v.eng - 0.08);
        noise(v.pos.x, v.pos.z, 30);
        log(tr('💥 撞開路障！引擎受損', '💥 Smashed through the roadblock! Engine damaged.'), '#fc8');
      } else {
        v.pos.x -= Math.sin(v.hd) * Math.sign(v.v) * 0.3;
        v.pos.z -= Math.cos(v.hd) * Math.sign(v.v) * 0.3;
        v.v = 0;
      }
    }
    const w = roadT.wreckNear(v.pos.x, v.pos.z, v.s.two ? 1.6 : 2.6);
    if (w && Math.abs(v.v) > 0.5) {
      v.pos.x -= Math.sin(v.hd) * Math.sign(v.v) * 0.4;
      v.pos.z -= Math.cos(v.hd) * Math.sign(v.v) * 0.4;
      if (Math.abs(v.v) > 8) {
        v.eng = Math.max(0, v.eng - 0.1);
        log(tr('💥 撞上廢棄車！', '💥 Crashed into an abandoned vehicle!'), '#fc8');
      }
      v.v = 0;
    }
  } else {
    const b = roadT.barrierAt(player.pos.x, player.pos.z, 1.1);
    if (b) {
      const dx = player.pos.x - b.x,
        dz = player.pos.z - b.z,
        L = Math.hypot(dx, dz) || 1;
      player.pos.x = b.x + (dx / L) * 1.1;
      player.pos.z = b.z + (dz / L) * 1.1;
    }
    const w = roadT.wreckNear(player.pos.x, player.pos.z, 1.4);
    if (w) {
      const dx = player.pos.x - w.x,
        dz = player.pos.z - w.z,
        L = Math.hypot(dx, dz) || 1;
      player.pos.x = w.x + (dx / L) * 1.4;
      player.pos.z = w.z + (dz / L) * 1.4;
    }
  }
  if (!player.sleeping && !fpv?.active && !drive.cur) {
    const f = new THREE.Vector3(-1, 0, -1).normalize(),
      r = new THREE.Vector3(1, 0, -1).normalize();
    const mv = new THREE.Vector3();
    if (keys[K('up')]) mv.add(f);
    if (keys[K('down')]) mv.sub(f);
    if (keys[K('right')]) mv.add(r);
    if (keys[K('left')]) mv.sub(r);
    if (AUTO.i < AUTO.path.length) {
      let w = AUTO.path[AUTO.i];
      while (Math.hypot(w[0] - player.pos.x, w[1] - player.pos.z) < 0.3 && ++AUTO.i < AUTO.path.length)
        w = AUTO.path[AUTO.i];
      if (AUTO.i < AUTO.path.length) mv.set(w[0] - player.pos.x, 0, w[1] - player.pos.z).normalize();
    }
    const jm = Math.min(1, Math.hypot(joy.x, joy.y));
    if (jm > 0.12) {
      mv.addScaledVector(f, -joy.y).addScaledVector(r, joy.x);
    }
    if (MB.retreat > 0) {
      MB.retreat -= dt;
      const e = nearestFoe(30);
      if (e && jm < 0.12) mv.add(new THREE.Vector3(player.pos.x - e.pos.x, 0, player.pos.z - e.pos.z).normalize());
    }
    const running =
      (keys[K('sprint')] ||
        (/^Shift/.test(K('sprint')) && (keys.ShiftLeft || keys.ShiftRight)) ||
        jm > 0.93 ||
        MB.retreat > 0) &&
      !player.sneak &&
      player.fatigue < 95;
    let sp = player.cover ? 1.4 : player.sneak ? 1.6 : running ? 6 : 3.4;
    if (player.cover && Math.hypot(player.pos.x - player.cover.x, player.pos.z - player.cover.z) > 1.8) {
      player.cover = null;
      updateCoverUI();
    }
    if (jm > 0.12 && !running) sp *= Math.max(0.3, Math.min(1, (jm - 0.12) / 0.7));
    if (player.fatigue > 80) sp *= 0.7;
    if (weight() > 12 * (ROLE.skills.carry ?? 1)) sp *= 0.8;
    // momentum: accelerate / decelerate toward desired velocity
    const want3 = mv.lengthSq() > 0 ? mv.clone().normalize().multiplyScalar(sp) : new THREE.Vector3();
    if (player.vaultT > 0) {
      player.vaultT -= dt;
      const q = 1 - player.vaultT / 0.55;
      player.pos.lerpVectors(player.vFrom, player.vTo, q < 0 ? 0 : q > 1 ? 1 : q * q * (3 - 2 * q));
      want3.set(0, 0, 0);
      player.vel.set(0, 0, 0);
    } else if (player.stun > 0) {
      player.stun -= dt;
      want3.multiplyScalar(0.25);
    }
    const accRate = want3.lengthSq() > player.vel.lengthSq() ? 9 : 7;
    player.vel.lerp(want3, Math.min(1, dt * accRate));
    if (player.vel.lengthSq() > 0.0004 && player.vaultT <= 0) {
      player.pos.addScaledVector(player.vel, dt);
      if (roofB) {
        // v22.5 on a rooftop: stay inside the parapet
        if (!pip([player.pos.x, player.pos.z], roofB.pts)) player.pos.addScaledVector(player.vel, -dt);
      } else {
        collide(player.pos, 0.35);
        collideDoors(player.pos);
      }
    }
    if (mv.lengthSq() > 0 && player.vaultT <= 0) {
      if (running) {
        player.fatigue += dt * 0.25;
        acc += dt;
        if (acc > 0.5) {
          acc = 0;
          noise(player.pos.x, player.pos.z, 11);
        }
      } else if (!player.sneak) {
        acc += dt;
        if (acc > 1) {
          acc = 0;
          noise(player.pos.x, player.pos.z, 3.5);
        }
      }
    }
    ray.setFromCamera(mouse, camera);
    ray.ray.intersectPlane(plane, aimPt);
    if (MB.fire) {
      const e = nearestFoe(25);
      if (e) aimPt.set(e.pos.x, 0, e.pos.z);
      else
        aimPt.set(
          player.pos.x + Math.sin(player.mesh.rotation.y) * 5,
          0,
          player.pos.z + Math.cos(player.mesh.rotation.y) * 5,
        );
    }
    const eqk0 = player.equip ? ITEMS[player.equip].kind : '';
    const faceMove = player.vel.length() > 0.5 && (running || eqk0 !== 'gun') && !clicking;
    const want = faceMove
      ? Math.atan2(player.vel.x, player.vel.z)
      : Math.atan2(aimPt.x - player.pos.x, aimPt.z - player.pos.z);
    let dr = Math.atan2(Math.sin(want - player.mesh.rotation.y), Math.cos(want - player.mesh.rotation.y));
    player.mesh.rotation.y += dr * Math.min(1, dt * (faceMove ? 9 : 12));
    if ((clicking || MB.fire) && !panelOpen && !scope.on) playerAttack();
    player.moving = player.vel.length();
    const eqk = player.equip ? ITEMS[player.equip].kind : '';
    player.anim =
      panelOpen && curCont
        ? 'loot'
        : player.cover?.low && player.cd <= 0.05
          ? 'sneak'
          : eqk === 'gun' && !running
            ? 'aim'
            : player.sneak
              ? 'sneak'
              : running && player.moving > 3.5
                ? 'run'
                : player.moving > 0.15
                  ? 'walk'
                  : 'idle';
  } else player.anim = 'sleep';
  setWeapon(player.rig, player.equip);
  setLodFocus(player.pos);
  animate(player.rig, player.anim, player.moving, dt);
  if (!drive.cur) {
    player.mesh.position.copy(player.pos);
    player.mesh.position.y += roofB ? roofB.h : walkH(player.pos.x, player.pos.z); // v21.4 stand on the raised walk (v22.5 or a roof)
  }
  // v21.2 shader cutaway around the camera→player line (see occlusion.ts); camera itself unchanged
  updateOcclusion(player.pos.x, player.pos.y, player.pos.z);
  // buildings cutaway
  const inside = bldAt(player.pos.x, player.pos.z);
  for (const b of blds) {
    const dx = b.c[0] - player.pos.x,
      dz = b.c[1] - player.pos.z;
    const near = Math.abs(dx) < 40 && Math.abs(dz) < 40;
    const front = near && dx + dz > -4 && dx + dz < 30 && Math.abs(dx - dz) < 22 && b.h > 4;
    const mi = (b as any).mi;
    b.walls.material = front || b === inside ? wallMatsT[mi] : wallMats[mi];
    b.roof.visible = b !== inside && !front;
    b.walls.scale.y = b === inside ? 0.12 : 1;
    if (b.innerWalls) b.innerWalls.visible = b === inside;
  }
  // soldiers
  const night = isNight();
  const pp: V2 = [player.pos.x, player.pos.z];
  let pathBudget = 4;
  assignSquads(night);
  updateGrenades(dt, night);
  for (const s of sols) {
    if (s.state === 'dead') continue;
    if (PRO.hide) {
      s.mesh.visible = false;
      s.cone.visible = false;
      continue;
    }
    const active = solActive(s, night);
    s.mesh.visible = active;
    s.cone.visible = active;
    if (!active) continue;
    const dx = player.pos.x - s.pos.x,
      dz = player.pos.z - s.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 120) continue; // dormant far away
    // vision
    let range = (night ? 11 : 20) * (player.sneak ? 0.55 : 1) * (player.light && night ? 2 : 1);
    if (inside) range *= 0.6;
    const facing =
      Math.abs(Math.atan2(Math.sin(Math.atan2(dz, dx) - s.dir), Math.cos(Math.atan2(dz, dx) - s.dir))) < Math.PI / 5;
    const sees =
      (dist < range &&
        (facing || dist < 1.6) &&
        !player.sleeping &&
        shotRay([s.pos.x, s.pos.z], pp, 1.6, playerAimH() + 0.1, 0.6) >= 1) ||
      (player.sleeping && dist < 2.5);
    if (sees) {
      s.alert += dt * (1.6 - dist / range) * 1.6;
      if (s.state !== 'combat') {
        s.state = 'investigate';
        s.target = pp.slice() as V2;
        s.timer = 15;
      }
    } else s.alert = Math.max(0, s.alert - dt * 0.15);
    if (s.alert >= 1 && s.state !== 'combat') {
      s.state = 'combat';
      log(tr('你被佔領軍發現了！', 'Occupation troops spotted you!'), '#f66');
      noise(s.pos.x, s.pos.z, 25);
      radio(pp, s);
    }
    if (sees && s.state === 'combat') s.lastSeen = pp.slice() as V2;
    let goal: V2 | null = null,
      sp = night ? 1.6 : 2.0;
    if (s.state === 'patrol') {
      goal = s.route[s.wi];
      if (Math.hypot(goal[0] - s.pos.x, goal[1] - s.pos.z) < 1) {
        s.wi += 1;
        if (s.wi >= s.route.length) {
          s.route.reverse();
          s.wi = 1;
        }
        goal = s.route[s.wi] || s.route[0];
      }
    } else if (s.state === 'investigate') {
      goal = s.target!;
      sp = 2.6;
      s.timer -= dt;
      if (s.timer <= 0 || Math.hypot(goal[0] - s.pos.x, goal[1] - s.pos.z) < 1) {
        if (s.timer <= 0) {
          s.state = 'patrol';
          s.alert = 0;
        } else if (s.search && s.search.length) {
          s.target = s.search.shift()!;
          s.timer = 8;
        } else {
          s.timer = Math.min(s.timer, 4);
          goal = null;
          s.dir += dt;
        }
      }
    } else if (s.state === 'combat') {
      s.cd -= dt;
      if (sees && dist < 24) {
        goal = dist > 8 ? pp : null;
        s.dir = Math.atan2(dz, dx);
        // v21.4 enemies use cover: run to the nearest cover between them and you, then crouch / peek and fire
        s.covT = (s.covT || 0) - dt;
        if (s.covT <= 0) {
          s.covT = 5 + rnd() * 3;
          s.cov = solCover(s, pp);
        }
        let atCov = false;
        // v22.11 flankers work round the side, suppressor holds cover (wounded retreat: below)
        if (s.flankT !== undefined) s.flankT -= dt;
        const flanking = (s.role === 'flankL' || s.role === 'flankR') && (s.flankT ?? 0) > 0 && dist > 4;
        if (s.cov && !flanking) {
          const cd2 = Math.hypot(s.cov[0] - s.pos.x, s.cov[1] - s.pos.z);
          if (cd2 > 0.5) {
            goal = s.cov;
            sp = 3.2;
          } else {
            goal = null;
            atCov = true;
          }
        }
        if (flanking) {
          const fp = SQ.flankPoint([s.pos.x, s.pos.z], pp, s.role === 'flankL' ? 1 : -1);
          if (!bldAt(fp[0], fp[1]) && Math.hypot(fp[0] - s.pos.x, fp[1] - s.pos.z) > 1.2) {
            goal = fp;
            sp = 3.4;
          } else s.flankT = 0;
        }
        s.peekT = (s.peekT || 0) + dt;
        s.crouch = atCov && !SQ.peekUp(s.peekT, s.slot || 0);
        // v22.10 point-blank: rifle-butt strike with a readable wind-up instead of firing
        s.mCd = (s.mCd || 0) - dt;
        if (s.mHit !== undefined) {
          s.mHit -= dt;
          if (s.mHit <= 0) {
            s.mHit = undefined;
            const f = Math.cos(s.dir) * (player.pos.x - s.pos.x) + Math.sin(s.dir) * (player.pos.z - s.pos.z);
            if (dist < 1.9 && f > 0.2 && !dead && !player.sleeping) {
              hitStop(s.rig, 0.06);
              AU.meleeHit(0, true);
              player.rig.hurtT = 0.35;
              player.rig.hurtSide = rnd() < 0.5 ? -1 : 1;
              player.stun = 0.45;
              player.hp -= 12 + rnd() * 6;
              const kb = player.pos.clone();
              kb.x += ((player.pos.x - s.pos.x) / Math.max(0.3, dist)) * 0.6;
              kb.z += ((player.pos.z - s.pos.z) / Math.max(0.3, dist)) * 0.6;
              if (bldAt(kb.x, kb.z) === bldAt(player.pos.x, player.pos.z)) {
                collide(kb, 0.35);
                player.pos.copy(kb);
              }
              blastFx.kick(0.6, 0.05);
              log(tr('你被槍托擊中！', 'You were hit with a rifle butt!'), '#f66');
              flashRed();
            } else AU.swish(dist, true);
          }
        } else if (dist < 1.6 && sees && s.mCd <= 0 && !(s.stun! > 0)) {
          startMelee(s.rig, 0.62, 3);
          s.mHit = 0.62 * 0.44;
          s.mCd = 1.5 + rnd() * 0.4;
          s.cd = Math.max(s.cd, 0.8);
          s.crouch = false;
        }
        if (
          s.mHit === undefined &&
          !(s.retreatT! > 0) &&
          s.cd <= 0 &&
          !(s.stun! > 0) &&
          !s.crouch &&
          (!s.cov || atCov || dist < 8)
        ) {
          s.rig.shootT = 0.14;
          s.cd = (1.1 + rnd() * 0.6) * (s.role === 'suppress' ? 0.6 : flanking ? 1.6 : 1);
          AU.gunshot('rifle', dist, !!bldAt(s.pos.x, s.pos.z) || !!bldAt(player.pos.x, player.pos.z));
          noise(s.pos.x, s.pos.z, 40);
          // v21.4 ray against walls / cover first, then the hit roll (lower vs a covered target)
          const clear = shotRay([s.pos.x, s.pos.z], pp, 1.4, playerAimH(), 1.0);
          const hitP =
            (0.55 - dist / 60) *
            (player.sneak ? 0.7 : 1) *
            (night ? 0.7 : 1) *
            (player.cover ? 0.5 : 1) *
            (s.role === 'suppress' ? 0.6 : 1); // suppressive fire: more rounds, fewer hits
          const hitIt = clear >= 1 && rnd() < hitP;
          const miss =
            clear < 1
              ? new THREE.Vector3(s.pos.x + (pp[0] - s.pos.x) * clear, 0, s.pos.z + (pp[1] - s.pos.z) * clear)
              : new THREE.Vector3(player.pos.x + (rnd() - 0.5) * 3, 0, player.pos.z + (rnd() - 0.5) * 3);
          tracer(s.pos, hitIt ? player.pos : miss);
          coverStats.enemyShots++;
          if (clear < 1) coverStats.blocked++;
          if (hitIt) {
            player.rig.hurtT = 0.35;
            player.rig.hurtSide = rnd() < 0.5 ? -1 : 1;
            player.stun = 0.35;
            player.hp -= 10 + rnd() * 12;
            if (rnd() < 0.45 && !player.bleed) {
              player.bleed = true;
              log(tr('你中彈流血了！用繃帶止血', 'You were shot and are bleeding! Use a bandage.'), '#f66');
            } else log(tr('你被擊中了！', 'You were hit!'), '#f66');
            flashRed();
          }
        }
      } else if (s.lastSeen) {
        goal = s.lastSeen;
        sp = 3.2;
        if (
          Math.hypot(goal[0] - s.pos.x, goal[1] - s.pos.z) < 1.2 ||
          (s.role !== 'suppress' && (s.slot || 0) > 0 && Math.hypot(goal[0] - s.pos.x, goal[1] - s.pos.z) < 6)
        ) {
          // v22.11 coordinated search: split the last-known area (rooms if it was indoors), one sweep each
          const lk = s.lastSeen;
          const b = bldAt(lk[0], lk[1]);
          s.search = SQ.searchPoints(lk, s.slot || 0, s.sqN || 1, b, (x, z) => bldAt(x, z) === b);
          if ((s.slot || 0) === 0) {
            aiStats.search++;
            callout(
              s,
              b
                ? tr('目標躲進樓裡，分頭搜！', 'Target went inside! Split up and search!')
                : tr('分散搜索！', 'Spread out and search!'),
            );
          }
          s.lastSeen = undefined;
          s.state = 'investigate';
          s.target = s.search.shift()!;
          s.timer = 10;
          s.alert = 0.5;
          s.flankT = undefined;
        }
      } else {
        s.state = 'investigate';
        s.target = [s.pos.x, s.pos.z];
        s.timer = 8;
      }
    }
    // v22.11 wounded → fall back once, away from the player, holding fire
    if (s.state === 'combat' && s.hp < SQ.AI.retreatHp && !s.retreated) {
      s.retreated = true;
      s.retreatT = SQ.AI.retreatT;
      aiStats.retreat++;
      callout(s, tr('我中彈了，掩護我！', "I'm hit! Cover me!"));
    }
    if (s.retreatT && s.retreatT > 0) {
      s.retreatT -= dt;
      goal = SQ.retreatPoint([s.pos.x, s.pos.z], pp, 6);
      sp = 3.6;
      s.cov = null;
      s.crouch = false;
    }
    let moved = 0;
    if (s.state !== 'combat') ((s.cov = null), (s.crouch = false));
    s.aiming = s.state === 'combat' && sees && dist < 24 && !(s.stun! > 0) && !s.crouch;
    if (s.stun! > 0) {
      s.stun! -= dt;
      goal = null;
    }
    if (s.post && s.state === 'patrol') {
      goal = Math.hypot(s.post[0] - s.pos.x, s.post[1] - s.pos.z) > 0.8 ? s.post : null;
      if (!goal) s.dir += Math.sin(gameMin * 0.05 + s.id) * dt * 0.3;
    }
    if (goal) {
      let tgt = goal;
      if (nav && (s.state !== 'patrol' || s.post || true)) {
        s.repath = (s.repath || 0) - dt;
        const need = !s.path || !s.pgoal || Math.hypot(goal[0] - s.pgoal[0], goal[1] - s.pgoal[1]) > 2 || s.repath <= 0;
        if (need && pathBudget > 0) {
          pathBudget--;
          s.repath = s.state === 'patrol' ? 4 : 1.5;
          s.pgoal = goal.slice() as V2;
          const me: V2 = [s.pos.x, s.pos.z];
          if (los(me, goal)) s.path = [goal];
          else {
            const pth = nav.find(me, goal);
            s.path = pth ? smooth(pth, los) : [goal];
          }
          s.pi = 0;
        }
        if (s.path) {
          while (s.pi! < s.path.length - 1 && Math.hypot(s.path[s.pi!][0] - s.pos.x, s.path[s.pi!][1] - s.pos.z) < 0.8)
            s.pi!++;
          tgt = s.path[s.pi!];
        }
      } else s.path = undefined;
      const gx = tgt[0] - s.pos.x,
        gz = tgt[1] - s.pos.z;
      const gl = Math.hypot(gx, gz);
      if (gl > 0.3) {
        const td = Math.atan2(gz, gx);
        let dd = Math.atan2(Math.sin(td - s.dir), Math.cos(td - s.dir));
        if (!s.aiming) s.dir += clamp(dd, -dt * 6, dt * 6);
        s.vs = (s.vs || 0) + (sp - (s.vs || 0)) * Math.min(1, dt * 4);
        const ox = s.pos.x,
          oz = s.pos.z;
        s.pos.x += (gx / gl) * s.vs * dt;
        s.pos.z += (gz / gl) * s.vs * dt;
        collide(s.pos, 0.35);
        moved = Math.hypot(s.pos.x - ox, s.pos.z - oz) / dt;
      }
    }
    if (!moved) s.vs = (s.vs || 0) * Math.max(0, 1 - dt * 6);
    animate(
      s.rig,
      s.crouch && !moved ? 'sneak' : s.aiming ? 'aim' : moved > 2.9 ? 'run' : moved > 0.2 ? 'carry' : 'idle',
      moved,
      dt,
    );
    s.mesh.position.copy(s.pos);
    s.mesh.position.y += walkH(s.pos.x, s.pos.z);
    if (moved > 0.2 && !s.crouch) {
      const sa = ((s as any).stepA = ((s as any).stepA || 0) + moved * dt);
      if (sa > (moved > 2.9 ? 1.1 : 0.8)) {
        (s as any).stepA = 0;
        const dd = pDist(s.pos.x, s.pos.z);
        if (dd < 22) AU.footstep(surfaceAt(s.pos.x, s.pos.z), dd, true, moved > 2.9);
      }
    }
    {
      const ty = Math.PI / 2 - s.dir;
      const d0 = Math.atan2(Math.sin(ty - s.mesh.rotation.y), Math.cos(ty - s.mesh.rotation.y));
      s.mesh.rotation.y += d0 * Math.min(1, dt * 8);
    }
    s.cone.position.set(s.pos.x, 0.06, s.pos.z);
    s.cone.rotation.y = -s.dir;
    s.cone.scale.setScalar(night ? 11 : 20);
    const cm = s.cone.material as THREE.MeshBasicMaterial;
    cm.color.set(s.state === 'combat' ? 0xff3030 : s.state === 'investigate' ? 0xffa030 : night ? 0xfff6c0 : 0xffee88);
    cm.opacity = night ? 0.22 : 0.12;
  }
  // lighting by time of day
  const hr = (gameMin / 60) % 24;
  const dayF = clamp(Math.sin(((hr - 6) / 13) * Math.PI), 0, 1);
  sun.intensity = 0.15 + dayF * 2.2;
  hemi.intensity = 0.25 + dayF * 0.75;
  nightAdapt.intensity = (1 - dayF) * 5;
  nightAdapt.position.set(player.pos.x, player.pos.y + 2.6, player.pos.z);
  sun.color.setHSL(0.09, 0.6, 0.55 + dayF * 0.3);
  const ang = ((hr - 6) / 13) * Math.PI;
  sun.position.set(player.pos.x + Math.cos(ang) * 60, 20 + Math.sin(Math.max(ang, 0.3)) * 60, player.pos.z + 30);
  sun.target.position.copy(player.pos);
  if (!dayF) sun.position.set(player.pos.x - 30, 70, player.pos.z + 20);
  updateSmoke(dt);
  if (!plaFlash.length)
    for (let i = 0; i < 4; i++) {
      const L = new THREE.SpotLight(0xfff0d0, 0, 24, 0.32, 0.5, 1.2);
      scene.add(L, L.target);
      plaFlash.push(L);
    }
  {
    const nightNow = isNight();
    const ns = nightNow
      ? sols
          .filter(s => s.state !== 'dead' && s.mesh.visible)
          .map(s => [s, s.pos.distanceToSquared(player.pos)] as const)
          .sort((a, b) => a[1] - b[1])
          .slice(0, 4)
      : [];
    plaFlash.forEach((L, i) => {
      const e = ns[i];
      if (!e || e[1] > 1600) {
        L.intensity = 0;
        return;
      }
      const s = e[0];
      L.position.set(s.pos.x, 1.5, s.pos.z);
      L.target.position.set(s.pos.x + Math.cos(s.dir) * 8, 0, s.pos.z + Math.sin(s.dir) * 8);
      L.intensity = 60;
    });
  }
  const fogC = new THREE.Color(0x0c1220)
    .lerp(new THREE.Color(0xa7b0b5), dayF)
    .lerp(new THREE.Color(0x5a6068).multiplyScalar(0.3 + dayF * 0.7), WX.amt * 0.5);
  sun.intensity *= 1 - WX.amt * 0.55;
  (scene.fog as THREE.Fog).color.copy(fogC);
  renderer.setClearColor(fogC);
  hemi.color.setHSL(0.6, 0.5, 0.35 + dayF * 0.45);
  if (player.pos.z < -6000) {
    // v22.3 underground: no sun or sky; only the station's own lights (or emergency lights after the cut)
    sun.intensity = 0;
    hemi.intensity = UT.power ? 0.5 : 0.07;
    hemi.color.set(0xdfe6f0);
    const uc = new THREE.Color(UT.power ? 0x14161a : 0x030405);
    (scene.fog as THREE.Fog).color.copy(uc);
    renderer.setClearColor(uc);
  }
  const PW = UT.power ? 1 : 0;
  if ((updateLamps as any).pw !== PW) {
    (updateLamps as any).pw = PW;
    setPower(!!PW);
  }
  updateLamps((1 - dayF) * PW, dt);
  decay?.update(dt, (1 - dayF) * PW, player.pos.x, player.pos.z);
  facade?.update(1 - dayF, PW);
  alley?.update(dt, (1 - dayF) * PW, player.pos.x, player.pos.z, PW);
  roadMat.roughness = 0.95 - (1 - dayF) * 0.55;
  roadMat.metalness = (1 - dayF) * 0.35;
  flash.intensity = player.light ? 60 : 0;
  flash.position.set(player.pos.x, 1.6, player.pos.z);
  flash.target.position.copy(aimPt);
  // camera
  camera.position.copy(player.pos).add(CAM_OFF);
  camera.lookAt(player.pos);
  // v22.9 blast shake: offset only (rig / angle / zoom untouched), re-copied every frame so it never drifts
  blastFx.update(dt, camera, renderer.domElement.height);
  camera.position.add(blastFx.shake);
  // HUD
  saveT += dt;
  if (saveT > 20) {
    saveT = 0;
    save();
  }
  streetT -= dt;
  if (streetT < 0) {
    streetT = 0.7;
    updateStreet();
  }
  // Send this frame's resolved movement before a snapshot can reconcile it away.
  netFrame(dt);
  drawHud(inside);
}
let redT = 0;
function flashRed() {
  redT = 0.25;
  renderer.domElement.style.filter = 'saturate(2) hue-rotate(-20deg) brightness(1.2)';
  setTimeout(() => (renderer.domElement.style.filter = ''), 150);
}
function updateStreet() {
  let best = '',
    bd = 25;
  for (const r of roads) {
    if (!r.n) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [ax, az] = r.p[i],
        [bx, bz] = r.p[i + 1];
      const dx = bx - ax,
        dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = clamp(((player.pos.x - ax) * dx + (player.pos.z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(player.pos.x - ax - dx * t, player.pos.z - az - dz * t);
      if (d < bd) {
        bd = d;
        best = r.n;
      }
    }
  }
  const sec = sectorOf(player.pos.x, player.pos.z);
  $('street').textContent =
    getLanguage() === 'en'
      ? `📍 ${translateLabel(best) || 'Alley'}・${SECTOR_LABEL(sec)} district ${liberated.has(sec) ? '(reclaimed)' : '(occupied)'}`
      : `📍 ${translateLabel(best) || '巷弄'}・${SECTOR_LABEL(sec)}區 ${liberated.has(sec) ? '（已奪回）' : '（佔領中）'}`;
}
function bar(name: string, v: number, col: string) {
  return `<div class="bar"><div class="t"><span>${name}</span><span>${Math.round(v)}</span></div><div class="b"><i style="width:${clamp(v, 0, 100)}%;background:${col}"></i></div></div>`;
}
function drawHud(inside: Bld | null) {
  syncServerVitals();
  const m: string[] = [];
  if (player.hunger < 25) m.push(tr('飢餓', 'Hungry'));
  if (player.thirst < 25) m.push(tr('口渴', 'Thirsty'));
  if (player.fatigue > 75) m.push(tr('疲憊', 'Exhausted'));
  if (player.bleed) m.push(tr('流血', 'Bleeding'));
  if (player.hp < 30) m.push(tr('重傷', 'Severely injured'));
  if (player.sneak) m.push(tr('潛行中', 'Sneaking'));
  if (player.sleeping) m.push(tr('睡眠中', 'Sleeping'));
  if (sols.some(s => s.state === 'combat' && s.mesh.visible)) m.push(tr('被追捕', 'Being pursued'));
  $('stats').innerHTML =
    bar(tr('生命', 'Health'), player.hp, '#c33') +
    bar(tr('飽足', 'Fullness'), player.hunger, '#c9842a') +
    bar(tr('水分', 'Hydration'), player.thirst, '#3a8ad6') +
    bar(tr('精神', 'Energy'), 100 - player.fatigue, '#8a6ad6') +
    `<div class="moodles">${m.map(x => `<span>${x}</span>`).join('')}</div>`;
  const day = Math.floor(gameMin / 1440) + 1,
    h = Math.floor(gameMin / 60) % 24,
    mi = Math.floor(gameMin) % 60;
  $('clock').textContent =
    getLanguage() === 'en'
      ? `Day ${day} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')} ${isNight() ? '🌙 Curfew' : '☀'}${raining() ? ' 🌧' : ''}`
      : `第 ${day} 天 ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')} ${isNight() ? '🌙 宵禁' : '☀'}${raining() ? ' 🌧' : ''}`;
  const alive = sols.filter(s => s.state !== 'dead').length;
  if (!PRO.on)
    $('objective').textContent =
      (getLanguage() === 'en'
        ? `Districts reclaimed ${liberated.size} / ${NSEC} | Occupation troops remaining ${alive}`
        : `已奪回街區 ${liberated.size} / ${NSEC}｜殘存佔領軍 ${alive}`) +
      (evacOpen()
        ? getLanguage() === 'en'
          ? ` | 🚁 Evacuation closes in ${Math.floor((EV1 - gameMin) / 60)} h ${Math.floor((EV1 - gameMin) % 60)} min`
          : `｜🚁 撤離窗口剩 ${Math.floor((EV1 - gameMin) / 60)} 小時 ${Math.floor((EV1 - gameMin) % 60)} 分`
        : '');
  const eq = player.equip ? ITEMS[player.equip] : null;
  $('equip').innerHTML =
    getLanguage() === 'en'
      ? `Weapon: <b>${eq ? eq.name : 'Unarmed'}</b>${eq && eq.kind === 'gun' ? ` Ammo ${player.inv[eq.ammo!] || 0}` : ''} Load ${weight().toFixed(1)}kg${player.light ? ' 🔦' : ''}`
      : `武器：<b>${eq ? eq.name : '徒手'}</b>${eq && eq.kind === 'gun' ? `　彈藥 ${player.inv[eq.ammo!] || 0}` : ''}　負重 ${weight().toFixed(1)}kg${player.light ? '　🔦' : ''}`;
  const c = nearestCont(),
    d = nearestDoor();
  const pr = $('prompt');
  const np = npcPrompt();
  const dn = doorNear(1.6);
  doorView?.update(doors as LiveDoor[], player.pos.x, player.pos.z, 1 / 30, doorNear(3));
  if (exitMark) {
    exitMark.m.position.y = 3.1 + Math.sin(performance.now() / 250) * 0.25;
    exitMark.m.rotation.y += 0.05;
    if (!bldAt(player.pos.x, player.pos.z) && exitMark.b && !pip([player.pos.x, player.pos.z], exitMark.b.pts)) {
      const hd = exitMark.b.door;
      if (!hd || Math.hypot(hd.p[0] - player.pos.x, hd.p[1] - player.pos.z) > 4)
        (scene.remove(exitMark.m), (exitMark = null), log(tr('你走出了家門。', 'You step out of your home.'), '#9cf'));
    }
  }
  const rd = roofB ? null : roofDoor();
  if (roofB && !panelOpen) {
    pr.style.display = 'block';
    pr.textContent = tr('[E] 走樓梯下到街上', '[E] Take the stairs down to the street');
  } else if (rd && !panelOpen) {
    pr.style.display = 'block';
    pr.textContent =
      getLanguage() === 'en'
        ? `[E] Climb to the rooftop (${rd.dead ? 'cleared sniper position' : 'sniper position'})`
        : `[E] 爬上頂樓（${rd.dead ? '已清除的狙擊點' : '狙擊手所在'}）`;
  } else if (dn && !dn.barricaded && !panelOpen && !np && (!dn.open || (!c && !atHome()))) {
    pr.style.display = 'block';
    pr.textContent =
      getLanguage() === 'en'
        ? `[E] ${dn.open ? 'Close door' : 'Open door'}${isHomeDoor(dn) ? ' (home)' : ''} | [${keyLabel('barricade')}] Barricade`
        : `[E] ${dn.open ? '關門' : '開門'}${isHomeDoor(dn) ? '（家門）' : ''}｜[${keyLabel('barricade')}] 封門`;
  } else if (np && !panelOpen) {
    pr.style.display = 'block';
    pr.textContent = np;
  } else if (!panelOpen && !survOpen && tradeAt() && !c) {
    pr.style.display = 'block';
    pr.textContent = `[E] ${tradeAt()!.name}`;
  } else if (!panelOpen && !survOpen && atHome() && !c) {
    pr.style.display = 'block';
    pr.textContent = tr('[E] 避難所（升級／存糧／拜拜）', '[E] Shelter (upgrades / stockpile / prayer)');
  } else if (shopAt() && !panelOpen && !c) {
    const sh = shopAt()!;
    pr.style.display = 'block';
    pr.textContent = UT.power
      ? sh.kind === 'locker'
        ? `[E] ${sh.name}`
        : getLanguage() === 'en'
          ? `[E] ${sh.vend ? 'Insert coins' : 'Shop'}: ${sh.name} (Wallet NT$ ${wallet()})`
          : `[E] ${sh.vend ? '投幣購買' : '購物'}：${sh.name}（錢包 NT$ ${wallet()}）`
      : getLanguage() === 'en'
        ? `[E] Pry open ${sh.name} (very loud)`
        : `[E] 撬開${sh.name}（會發出很大的聲響）`;
  } else if (metroBoard() >= 0 && !panelOpen && !riding) {
    pr.style.display = 'block';
    pr.textContent = tr('[E] 搭乘艋舺橘線（選擇目的地）', '[E] Ride the Monga Orange Line (choose destination)');
  } else if (metroAt() && !panelOpen) {
    const m = metroAt()!;
    pr.style.display = 'block';
    pr.textContent = m.down
      ? getLanguage() === 'en'
        ? `[E] Enter Beidu Metro: ${translateLabel(m.st.name)} Station, Exit ${m.gt.no}`
        : `[E] 進站：北都地下鐵 ${translateLabel(m.st.name)}站 ${m.gt.no} 號出口`
      : getLanguage() === 'en'
        ? `[E] Return to street level through Exit ${m.gt.no} (${translateLabel(m.st.name)})`
        : `[E] 往 ${m.gt.no} 號出口回地面（${translateLabel(m.st.name)}）`;
  } else if (c && !panelOpen) {
    pr.style.display = 'block';
    pr.textContent =
      getLanguage() === 'en'
        ? `[E] Loot ${translateLabel(c.label)}${Object.keys(c.items).length ? '' : ' (empty)'}`
        : `[E] 搜刮 ${translateLabel(c.label)}${Object.keys(c.items).length ? '' : '（空）'}`;
  } else if (!panelOpen && drive.cur) {
    pr.style.display = 'block';
    pr.textContent =
      getLanguage() === 'en'
        ? `[E] Exit vehicle | ${drive.status(drive.cur)} | ${Math.round(Math.abs(drive.cur.v) * 3.6)} km/h`
        : `[E] 下車｜${drive.status(drive.cur)}｜${Math.round(Math.abs(drive.cur.v) * 3.6)} km/h`;
  } else if (!panelOpen && drive.nearest(player.pos)) {
    const v = drive.nearest(player.pos)!;
    pr.style.display = 'block';
    pr.textContent =
      getLanguage() === 'en'
        ? `[E] ${v.s.drive ? (v.s.two ? 'Ride' : 'Drive') : 'Inspect'} ${v.s.name}${v.key || !v.s.key ? ' (keys present)' : ''}`
        : `[E] ${v.s.drive ? (v.s.two ? '騎' : '開') : '查看'} ${v.s.name}${v.key || !v.s.key ? '（鑰匙還在）' : ''}`;
  } else if (!panelOpen && vehicles.nearest(player.pos, 2.2)) {
    pr.style.display = 'block';
    pr.textContent = tr('[E] 查看載具', '[E] Inspect vehicle');
  } else if (d && !panelOpen) {
    pr.style.display = 'block';
    pr.textContent = d.barricaded
      ? tr('[B] 拆除封門', '[B] Remove barricade')
      : tr('[B] 封門（鐵鎚+木板）', '[B] Barricade (hammer + plank)');
  } else pr.style.display = 'none';
  if (coopActive()) {
    const available = Object.entries(net!.s!.loot || {}).some(
      ([id, l]) => !net!.s!.looted[id] && Math.hypot(l.x - player.pos.x, l.z - player.pos.z) <= 2.2,
    );
    const localDoor = doorNear(1.6);
    pr.style.display = (available || (localDoor && !localDoor.barricaded)) && !panelOpen ? 'block' : 'none';
    pr.textContent = available
      ? tr('[E] 搜刮共享補給', '[E] Loot shared supplies')
      : localDoor?.open
        ? tr('[E] 關門', '[E] Close door')
        : tr('[E] 開門', '[E] Open door');
  }
  // v22.4 prompts show the key actually bound (settings → 按鍵設定)
  const t0 = pr.textContent || '';
  if (t0.startsWith('[E]')) pr.textContent = `[${keyLabel('interact')}]` + t0.slice(3);
  else if (t0.startsWith('[B]')) pr.textContent = `[${keyLabel('barricade')}]` + t0.slice(3);
  updatePortraitButtons(pr.style.display === 'none' ? '' : pr.textContent || '');
}
function die() {
  AU.death(0);
  dead = true;
  clearSave();
  closePanel();
  const t = $('title');
  t.style.display = 'flex';
  if (MP) {
    net?.leave();
    t.innerHTML = tr(
      '<h1>你在多人房間倒下了</h1><p>以伺服器生命狀態為準。單機存檔未受影響。</p><button id=mpdeadback>返回主選單</button>',
      '<h1>You fell in the multiplayer room</h1><p>Server health is authoritative. Your solo save is unchanged.</p><button id=mpdeadback>Return to title</button>',
    );
    $('mpdeadback').onclick = () => {
      location.href = location.pathname;
    };
    return;
  }
  const day = Math.floor(gameMin / 1440) + 1;
  t.innerHTML =
    getLanguage() === 'en'
      ? `<h1 style="color:#c33">You died</h1><h2>This is how your story ends.</h2><p>You survived occupied Taipei for ${day} days, defeated ${player.kills} occupation troops and reclaimed ${liberated.size} districts.</p><button onclick="location.reload()">Start again (new survivor)</button>`
      : `<h1 style="color:#c33">你陣亡了</h1><h2>這就是你的結局。</h2><p>你在淪陷的台北撐過了 ${day} 天，擊倒 ${player.kills} 名佔領軍，奪回了 ${liberated.size} 個街區。</p><button onclick="location.reload()">重新開始（新的倖存者）</button>`;
}
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (cine.on) {
    requestAnimationFrame(loop);
    return;
  }
  if (rocCine) {
    rocCineStep(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
    return;
  }
  update(dt);
  if (fpv?.active) {
    fpv.update(dt);
    if (fpv.active) fpv.render(renderer);
    else renderer.render(scene, camera);
  } else renderer.render(scene, camera);
  if (scope.on) {
    scope.place(player.pos.x, eyeY(), player.pos.z);
    scope.render(renderer, scene);
  }
  requestAnimationFrame(loop);
}

// ---------- opening / prologue: normal morning → invasion mid-commute ----------
const PRO = {
  on: false,
  hide: false,
  t: 0,
  stage: 0,
  from: [0, 0] as V2,
  dest: [0, 0] as V2,
  label: '',
  beam: null as THREE.Object3D | null,
  nb: 0,
  sir: null as any,
  msgs: 0,
};
// v23.2: the prologue's attack emits 'alert' on the event bus; the siren listens (synchronous, same timing as before)
on('alert', e => siren(true, e?.kind ?? 'alert'));
function siren(on: boolean, kind: 'alert' | 'clear' | 'test' = 'alert') {
  // v23.1 萬安-style street sirens (broadcast.ts); muffled indoors. v23.2.1: 'test' is a short quiet chime (audio.ts)
  if (!on) return;
  if (kind === 'test') return AU.alertTest(!!bldAt(player.pos.x, player.pos.z));
  BC.airRaid(kind, () => !!bldAt(player.pos.x, player.pos.z), AU.sfxCtx());
}
function scrFlash(col: string, ms = 600) {
  const f = document.createElement('div');
  f.style.cssText = `position:fixed;inset:0;z-index:40;pointer-events:none;background:${col};transition:opacity ${ms}ms;opacity:1`;
  document.body.appendChild(f);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      f.style.opacity = '0';
    }),
  );
  setTimeout(() => f.remove(), ms + 100);
}
function startPrologue(from: V2, dest: V2, label: string) {
  Object.assign(PRO, { on: true, hide: true, t: 0, stage: 1, from, dest, label, msgs: 0, nb: 0 });
  gameMin = 7 * 60 + 20;
  roadT.rebuild();
  traffic.start(
    mainRoads.map(r => ({ p: r.p, w: ROADW[r.t.replace('_link', '')] ?? 9 })),
    from,
    26,
  );
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 40, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  beam.position.y = 20;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd040, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  g.add(ring);
  g.position.set(dest[0], 0, dest[1]);
  scene.add(g);
  PRO.beam = g;
  const ov = document.createElement('div');
  ov.id = 'wake';
  ov.innerHTML =
    getLanguage() === 'en'
      ? `<div>07:20 ⏰ The alarm rings</div><small>${ROLE.names[player.gender === 'm' ? 0 : 1]}・${ROLE.name} | Another day heading to ${label}</small>`
      : `<div>07:20　⏰ 鬧鐘響了</div><small>${ROLE.names[player.gender === 'm' ? 0 : 1]}・${ROLE.name}｜今天也要去${label}</small>`;
  document.body.appendChild(ov);
  const sk = document.createElement('button');
  sk.id = 'skipbtn';
  sk.textContent = tr('跳過開場 ⏭', 'Skip intro ⏭');
  sk.onclick = () => endPrologue();
  document.body.appendChild(sk);
}
function endPrologue() {
  if (!PRO.on) return;
  PRO.on = false;
  PRO.hide = false;
  PRO.stage = 9;
  traffic.abandonAll();
  if (PRO.beam) scene.remove(PRO.beam);
  document.getElementById('skipbtn')?.remove();
  document.getElementById('wake')?.remove();
  log(
    tr(
      '解放軍已攻入萬華，街上到處是哨兵與裝甲車。從現在起，活下去，一區一區奪回來。',
      'PLA troops have entered Wanhua. Sentries and armored vehicles fill the streets. From now on, survive—and reclaim it one district at a time.',
    ),
    '#ffd76a',
  );
}
function updatePrologue(dt: number) {
  if (!PRO.on) return;
  PRO.t += dt;
  const P = player.pos;
  const tot = Math.hypot(PRO.dest[0] - PRO.from[0], PRO.dest[1] - PRO.from[1]) || 1;
  const left = Math.hypot(PRO.dest[0] - P.x, PRO.dest[1] - P.z);
  const prog = 1 - left / tot;
  {
    const ov = document.getElementById('wake');
    if (ov) {
      if (PRO.t > 2.6) ov.classList.add('out');
      if (PRO.t > 4.2) ov.remove();
    }
  }
  if (PRO.stage === 1) {
    while (PRO.msgs < PRO_NEWS.length && PRO.t > PRO_NEWS[PRO.msgs][0]) {
      const [, w, m] = PRO_NEWS[PRO.msgs++];
      phone(w, m);
    }
    $('objective').textContent =
      getLanguage() === 'en'
        ? `🧭 Head to ${PRO.label} (${Math.round(left)} m remaining) | Follow the yellow beam`
        : `🧭 前往${PRO.label}（還有 ${Math.round(left)} m）｜跟著黃色光柱`;
    if (prog > 0.45 || PRO.t > 75 || left < 6) {
      PRO.stage = 2;
      PRO.t = 0;
      emit('alert', { kind: 'alert' });
      traffic.panic();
      roadT.rebuild();
      scrFlash('rgba(200,20,10,.55)', 900);
      phone(
        tr('⚠️ 國家級警報', '⚠️ National emergency alert'),
        tr(
          '飛彈空襲警報！共軍部隊於淡水河沿岸登陸，請立即就近避難，遠離窗戶。',
          'Missile air-raid warning! PLA forces have landed along the Tamsui River. Take shelter nearby immediately and stay away from windows.',
        ),
      );
      log(
        tr(
          '📢 防空廣播：「這不是演習！這不是演習！請民眾立即進入地下室或避難處所……」',
          '📢 Air-raid announcement: This is not a drill! This is not a drill! Get into a basement or shelter immediately...',
        ),
        '#ff8a7a',
      );
      noise(P.x, P.z, 1);
    }
  } else if (PRO.stage === 2) {
    $('objective').textContent = tr('⚠️ 空襲警報！找掩蔽！', '⚠️ Air raid! Take cover!');
    PRO.nb -= dt;
    if (PRO.nb <= 0 && PRO.t < 14) {
      PRO.nb = 1.2 + Math.random() * 1.5;
      const a = Math.random() * 7,
        d = 16 + Math.random() * 34;
      const e = new THREE.Vector3(P.x + Math.cos(a) * d, 2, P.z + Math.sin(a) * d);
      boom(scene, e, 2);
      scrFlash('rgba(255,200,120,.25)', 400);
    }
    if (PRO.t > 5 && PRO.hide) {
      PRO.hide = false;
      phone(
        tr('📱 家族群組', '📱 Family group chat'),
        tr(
          '你在哪？？西園路那邊有軍車開進來了！不要出門！',
          'Where are you?? Military vehicles are coming down Xiyuan Road! Stay inside!',
        ),
      );
      log(
        tr(
          '街口傳來履帶聲——穿著陌生迷彩的士兵封鎖了路口。',
          'Tracks rumble at the corner. Soldiers in unfamiliar camouflage block the intersection.',
        ),
        '#ff8a7a',
      );
    }
    if (PRO.t > 16) endPrologue();
  }
}

// ---------- boot ----------
const prog = async (f: number, msg: string) => {
  const i = document.querySelector('#loadbar i') as HTMLElement | null;
  if (i) i.style.width = Math.round(f * 100) + '%';
  $('loadmsg').textContent = msg;
  await new Promise(r => setTimeout(r, 0));
};
// deferred rooftop dressing, streamed in by distance to the player
const roofJobs: { x: number; z: number; f: () => void }[] = [];
function pumpRoofs(px: number, pz: number, budgetMs: number, maxD = 1e9) {
  if (!roofJobs.length) return;
  const t0 = performance.now();
  roofJobs.sort((a, b) => Math.hypot(b.x - px, b.z - pz) - Math.hypot(a.x - px, a.z - pz));
  while (roofJobs.length && performance.now() - t0 < budgetMs) {
    const j = roofJobs[roofJobs.length - 1];
    if (Math.hypot(j.x - px, j.z - pz) > maxD) break;
    roofJobs.pop();
    j.f();
  }
}
async function boot() {
  await prog(0.3, tr('下載萬華地圖資料（OpenStreetMap）…', 'Downloading Wanhua map data (OpenStreetMap)...'));
  const data = await (await fetch(import.meta.env.BASE_URL + 'data/wanhua.json')).json();
  await district.ready;
  {
    const [x0, z0, x1, z1] = district.ix.bbox;
    WORLD_B.minx = x0;
    WORLD_B.minz = z0;
    WORLD_B.maxx = x1;
    WORLD_B.maxz = z1;
    // landmark footprints replace the core's generic boxes there
    const R = District.rects(district.ix);
    data.buildings = data.buildings.filter((b: any) => {
      const c = b.p.reduce((a: V2, q: V2) => [a[0] + q[0] / b.p.length, a[1] + q[1] / b.p.length], [0, 0]);
      return !R.some(r => c[0] > r[0] && c[0] < r[2] && c[1] > r[1] && c[1] < r[3]);
    });
  }
  await prog(0.45, tr('建造街區…', 'Building neighborhoods...'));
  buildMap(data);
  Object.assign(WORLD, WORLD_B);
  await prog(0.65, tr('佈置出生點附近的室內與巷弄…', 'Furnishing interiors and alleys near the spawn point...'));
  const sv = readSave();
  // ---- detailed blocks around spawn (剝皮寮 / 康定路 / 西門町 edge) ----
  const homes = blds.filter(b => b.door && b.type === 'home' && Math.abs(b.c[0]) < 167 && Math.abs(b.c[1]) < 167);
  const fx = {
    rnd,
    pip,
    addSeg: (q: { a: V2; b: V2 }) => addSeg(q),
    bldAt,
    scene,
    utils: { mergeGeometries },
    addCont: (c: any) => {
      const cc: Cont = c;
      conts.push(cc);
    },
  } as any;
  const area = (b: Bld) => (b.maxx - b.minx) * (b.maxz - b.minz);
  const startCands = homes
    .filter(b => area(b) > 70 && area(b) < 400)
    .sort(
      (a, b) =>
        Math.hypot(
          a.c[0] - homes[Math.floor(homes.length / 2)].c[0],
          a.c[1] - homes[Math.floor(homes.length / 2)].c[1],
        ) -
        Math.hypot(
          b.c[0] - homes[Math.floor(homes.length / 2)].c[0],
          b.c[1] - homes[Math.floor(homes.length / 2)].c[1],
        ),
    );
  let start: Bld | null = null;
  for (const c of startCands) {
    if (furnish(c, 'home', fx)) {
      start = c;
      c.detailed = 'home';
      break;
    }
  }
  if (!start) start = homes[0] || blds.find(b => b.door)!;
  const near = blds
    .filter(b => b !== start && b.door && !b.detailed && Math.hypot(b.c[0] - start!.c[0], b.c[1] - start!.c[1]) < 130)
    .sort(
      (a, b) =>
        Math.hypot(a.c[0] - start!.c[0], a.c[1] - start!.c[1]) - Math.hypot(b.c[0] - start!.c[0], b.c[1] - start!.c[1]),
    );
  const want = [
    'market',
    'store',
    'pharmacy',
    'grocery',
    'hardware',
    'breakfast',
    'betel',
    'grocery',
    'hardware',
    'store',
    'breakfast',
    'betel',
    'pharmacy',
    'grocery',
  ];
  const KIND_SIGN: Record<string, string> = { store: 'store', pharmacy: 'pharmacy' };
  for (const k of want) {
    const cand = near.find(
      b =>
        !b.detailed &&
        (k === 'betel' ? area(b) < 120 : k === 'market' ? area(b) > 220 : area(b) > 50) &&
        furnish(b, k, fx),
    );
    if (cand) {
      cand.detailed = k;
      cand.type = KIND_SIGN[k] || k;
      if (b2sign[k]) setSign(cand, k);
    }
  }
  for (const b of near.slice(0, 60)) if (!b.detailed && area(b) > 40 && furnish(b, 'home', fx)) b.detailed = 'home';
  // remove generic containers inside detailed buildings
  for (let i = conts.length - 1; i >= 0; i--) {
    const c = conts[i];
    if (c.b && c.b.detailed && !c.id.startsWith('x')) {
      c.mesh.parent?.remove(c.mesh);
      conts.splice(i, 1);
    }
  }
  // v23.0 lived-in interiors for every other enterable building (plan + cover now, meshes lazily)
  for (const b of blds) {
    if (b.detailed || !b.door) continue;
    const P = CL.plan(b, { pip, onRoad: (x, z) => roadDist(x, z) < 5 });
    if (!P) continue;
    (b as any).clut = P;
    for (const sg of P.segs) addSeg({ a: sg.a, b: sg.b, h: sg.h } as Seg, sg.h < 1.3);
  }
  // night market on the nearest named mid-size road
  let bestR: any = null,
    bd = 1e9;
  for (const r of roads) {
    if (!['tertiary', 'residential', 'pedestrian', 'unclassified'].includes(r.t) || r.p.length < 2) continue;
    const d = Math.min(...r.p.map(p => Math.hypot(p[0] - start!.c[0], p[1] - start!.c[1])));
    if (d < bd && d > 15) {
      bd = d;
      bestR = r;
    }
  }
  if (bestR) nightMarket(bestR.p, bestR.t === 'tertiary' ? 9 : 6, fx, 'nm');
  setupArmor(start!.c as V2);
  spawnDrivables(start!.c as V2);
  buildJunctions();
  await roadT.init();
  decay = buildDecay({
    scene,
    rnd,
    pip,
    bldAt,
    addSeg: (q, low) => addSeg(q, low),
    merge: mergeGeometries,
    roads,
    blds,
    RW: ROADW,
    center: start.c,
    R: 140,
    doors: doors.map(d => d.p),
  });
  checkpoints = decay.checkpoints;
  setupRecon(start!.c as V2);
  setupRoc();
  alley = buildAlley({
    poles: decay.polePos,
    scene,
    rnd,
    pip,
    bldAt,
    addSeg: (q, low) => addSeg(q, low),
    merge: mergeGeometries,
    roads,
    blds,
    RW: ROADW,
    center: start.c,
    R: 85,
    doors: doors.map(d => d.p),
  });
  facade = buildFacade({ scene, pip, bldAt, merge: mergeGeometries, roads, blds, RW: ROADW, center: start.c, R: 110 });
  console.log('facade', JSON.stringify(facade.stats));
  parks = buildParks({
    scene,
    bldAt,
    merge: mergeGeometries,
    addSeg: (q, low) => addSeg(q, low),
    roadDist,
    center: start.c,
    R: 110,
  });
  console.log('parks', JSON.stringify(parks));
  // navigation grid (built after all collision geometry exists)
  nav = new Nav(start.c[0] - 170, start.c[1] - 170, start.c[0] + 170, start.c[1] + 170, 0.5);
  for (const q of segs) nav.markSeg(q.a, q.b, 1);
  spawnSoldiers(new Set(sv?.dead || []));
  scene.add(rainMesh);
  setupInformant(start.c as V2, !(sv && sv.inf));
  {
    let best: V2 | null = null;
    for (const r of roads)
      for (const q of r.p)
        if (
          Math.abs(q[1] - start.c[1]) < 250 &&
          q[0] > bounds.minx + 8 &&
          !bldAt(q[0], q[1]) &&
          !bldAt(q[0] + 6, q[1]) &&
          !bldAt(q[0] - 6, q[1]) &&
          (!best || q[0] < best[0])
        )
          best = q;
    if (best) evac = buildEvacZone(scene, best[0], best[1]);
  }
  {
    let n = 0;
    for (let k = 0; k < 400 && n < 3; k++) {
      const a = k * 0.7,
        d = 4 + k * 0.08;
      const q: V2 = [start.c[0] + Math.cos(a) * d, start.c[1] + Math.sin(a) * d];
      if (!bldAt(q[0], q[1]) && !bldAt(q[0] + 0.6, q[1]) && !bldAt(q[0], q[1] + 0.6)) {
        makeBucket('rb' + n++, q);
      }
    }
  }
  const sp = start.door!.p;
  const ip: V2 = [sp[0] + (start.c[0] - sp[0]) * 0.25, sp[1] + (start.c[1] - sp[1]) * 0.25];
  player.pos.set(ip[0], 0, ip[1]);
  if (!sv) {
    makeCont('start', [ip[0] + 0.4, ip[1] + 0.4], 'home', start, {
      knife: 1,
      water: 1,
      plank: 2,
      hammer: 1,
      bandage: 1,
      rice: 1,
    });
  }
  for (const s of sols)
    if (s.state !== 'dead' && s.pos.distanceTo(player.pos) < 25) {
      s.pos.x += 40;
    }
  {
    let k = 0;
    for (const cp of checkpoints)
      for (let g = 0; g < 2; g++) {
        const s = sols[k++];
        if (!s || s.state === 'dead') continue;
        const p: V2 = [cp[0] + (g ? 2.2 : -2.2), cp[1] + (g ? 1 : -1)];
        s.post = p;
        s.pos.set(p[0], 0, p[1]);
        s.sector = sectorOf(p[0], p[1]);
        s.night = false;
      }
  }
  checkSectors(true);
  await prog(0.85, tr('加蓋頂樓（目前街區）…', 'Adding rooftops (current district)...'));
  pumpRoofs(start.c[0], start.c[1], 1e9, 160);
  (window as any).__roofLeft = () => roofJobs.length;
  import('../map/map').then(({ GameMap }) => {
    gmap = new GameMap({
      blds: blds as any,
      roads: roads as any,
      bounds: WORLD,
      sectors: SECTORS,
      sectorOf,
      sectorName: SECTOR_LABEL,
      district: {
        ...district.ix,
        more: async () => (await fetch(import.meta.env.BASE_URL + 'data/district/map.json')).json(),
      },
      liberated: () => liberated,
      player: () => ({ x: player.pos.x, z: player.pos.z, rot: player.mesh ? player.mesh.rotation.y : 0 }),
      parks: (parks?.clusters || []) as V2[],
      outposts: () => checkpoints,
      evac: () => (evac ? (evac.pos as V2) : null),
      home: () => start!.c as V2,
    });
    // v21.6 北都地下鐵 stations (interior only; walk into an entrance to go down)
    {
      let sd = 2166;
      const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      metro = buildMetro({
        scene,
        addSeg,
        removeSeg,
        snap: (x, z) => {
          for (let rad = 0; rad < 120; rad += 3)
            for (let a = 0; a < 6.28; a += 0.4) {
              const px = x + Math.cos(a) * rad,
                pz = z + Math.sin(a) * rad;
              const rd = roadDist(px, pz);
              if (rd > 3 && rd < 7 && !bldAt(px, pz) && !bldAt(px, pz + 2) && !bldAt(px, pz - 4)) return [px, pz];
            }
          return [x, z];
        },
      });
      for (const st of metro) for (const l of st.loot) makeCont(l.id, l.p, l.type, undefined, rollLoot(l.type, r));
    }
    if (player.inv.rocradio) mapIntelOutposts(tr('解放軍哨點（國軍情資）', 'PLA checkpoint (ROC intelligence)'));
    if (MOBILE) {
      const mb = document.createElement('button');
      mb.id = 'mapbtn';
      mb.textContent = '🗺';
      mb.title = tr('地圖', 'Map');
      mb.style.display = 'none';
      mb.onclick = () => gmap?.toggle();
      document.body.appendChild(mb);
      const cb = document.createElement('button');
      cb.id = 'coverbtn';
      cb.textContent = '🛡';
      cb.title = tr('掩體', 'Cover');
      cb.onclick = () => toggleCover();
      document.body.appendChild(cb);
      initPortraitButtons();
    }
    (window as any).__game && ((window as any).__game.map = gmap);
  });
  await prog(1, tr('完成', 'Done'));
  // v22.7.1 watchdog: if the title menu has not appeared shortly after loading, offer a clean reload
  setTimeout(() => {
    const tm = document.getElementById('tmenu');
    if (
      !started &&
      !document.body.classList.contains('selmode') &&
      !document.body.classList.contains('entering-game') &&
      (!tm || !tm.offsetHeight)
    )
      bootRescue(tr('選單沒有出現', 'Menu did not appear'));
  }, 6000);
  const btns = $('btns');
  $('loadmsg').textContent =
    getLanguage() === 'en'
      ? `Map: Wanhua / Ximending (${blds.length} buildings, ${roads.length} streets)`
      : `地圖：萬華・西門町（${blds.length} 棟建築，${roads.length} 條街道）`;
  const findBed = (b: Bld): V2 | null => {
    let r: V2 | null = null;
    const v = new THREE.Vector3();
    scene.traverse(o => {
      if (r || !o.userData.bed) return;
      o.getWorldPosition(v);
      if (pip([v.x, v.z], b.pts)) r = [v.x, v.z];
    });
    return r;
  };
  const nearestBy = (f: (b: Bld) => boolean, from: V2, minD = 0, maxD = 1e9) =>
    blds
      .filter(b => b.door && f(b))
      .map(b => [b, Math.hypot(b.c[0] - from[0], b.c[1] - from[1])] as const)
      .filter(([, d]) => d >= minD && d <= maxD)
      .sort((a, b) => a[1] - b[1])[0]?.[0];
  const doorIn = (b: Bld): V2 => {
    const d = b.door!.p;
    return [d[0] + (b.c[0] - d[0]) * 0.2, d[1] + (b.c[1] - d[1]) * 0.2];
  };
  const spawnRole = (r: Role, skip: boolean) => {
    const sc = start!.c as V2;
    let from: V2 = [player.pos.x, player.pos.z];
    let home: Bld = start!;
    const hosp = nearestBy(b => /醫院/.test((b as any).nm), sc);
    if (r.spawn === 'hospital' && hosp) {
      const dorm = nearestBy(b => b.type === 'home' && b !== hosp && area(b) > 50, hosp.c as V2, 25, 160);
      if (dorm) {
        if (!dorm.detailed && furnish(dorm, 'home', fx)) dorm.detailed = 'home';
        home = dorm;
        from = doorIn(dorm);
      }
    }
    if (r.spawn === 'scooter') {
      const d = start!.door!.p;
      const nx = d[0] + (d[0] - sc[0]) * 0.6,
        nz = d[1] + (d[1] - sc[1]) * 0.6;
      if (!bldAt(nx, nz)) from = [nx, nz];
      drive.spawn('delivery', from[0] + 1.2, from[1] + 0.6, 0, Math.random, {
        key: true,
        fuel: 4,
        tyre: 1,
        eng: 1,
        bat: 1,
      });
      log(
        tr('你的外送機車就停在門口，鑰匙在身上。', 'Your delivery scooter is parked outside. You have the key.'),
        '#9cf',
      );
    } else {
      const bed = findBed(home);
      // v21.2: wake beside the bed on whichever side is open floor inside the home and connected to the door
      // (a fixed +x offset put some roles inside the wall next to a bed against the east wall → stuck)
      if (bed) {
        from = doorIn(home);
        for (const [ox, oz] of [
          [0.9, 0],
          [-0.9, 0],
          [0, 0.9],
          [0, -0.9],
          [1.3, 0],
          [-1.3, 0],
          [0, 1.3],
          [0, -1.3],
        ]) {
          const x = bed[0] + ox,
            z = bed[1] + oz;
          if (pip([x, z], home.pts) && walkable(x, z) && escapeCheck(x, z).ok) {
            from = [x, z];
            break;
          }
        }
      }
    }
    player.pos.set(from[0], 0, from[1]);
    if (unstuck()) console.warn('spawn: nudged to a walkable point');
    const dest =
      r.dest === 'hospital' && hosp
        ? hosp
        : r.dest === 'office'
          ? nearestBy(b => /商業大樓|大樓|銀行/.test((b as any).nm), from, 120)
          : r.dest === 'school'
            ? nearestBy(b => /文教|學/.test((b as any).nm) || area(b) > 900, from, 150)
            : r.dest === 'delivery'
              ? nearestBy(b => b.type === 'store' || b.type === 'market', from, 120)
              : nearestBy(b => area(b) > 200, from, 140, 260);
    if (r.skills.streets && gmap) gmap.revealRect(bounds.minx, bounds.minz, bounds.maxx, bounds.maxz);
    if (!skip && dest) startPrologue(from, dest.door!.p as V2, r.destLabel);
  };
  const prepareGame = (load: boolean, gender = 'm', roleId = 'courier', skipIntro = false) => {
    setMultiplayerSession(!!MP);
    storySaved = load && sv ? sv.story : undefined;
    storyRunner = createStoryRunner(storySaved);
    if (!doorView) {
      buildDoorDeco(scene, doors);
      for (const d of doors as LiveDoor[]) d.open = !isHomeDoor(d);
      doorView = new DoorView(scene);
    }
    if (load && sv) {
      gender = sv.g || 'm';
      roleId = sv.r || (gender === 'f' ? 'nurse' : 'courier');
    }
    ROLE = roleById(roleId);
    player.gender = gender;
    player.rig = spawnRig({ gender, ...ROLE.look[gender as 'm' | 'f'], outfit: ROLE.id });
    player.mesh = player.rig.root;
    if (load && sv) {
      player.pos.set(sv.p[0], 0, sv.p[1]);
      Object.assign(player, {
        hp: sv.hp,
        hunger: sv.hu,
        thirst: sv.th,
        fatigue: sv.fa,
        bleed: sv.bl,
        inv: sv.inv,
        equip: sv.eq,
        kills: sv.k,
      });
      gameMin = sv.t;
      DAYH = sv.dl || 1;
      if (sv.wx) Object.assign(WX, sv.wx);
      if (sv.ex) UT.ev.ex = 1;
      if (sv.inf) INF = sv.inf;
      if (sv.ut) Object.assign(UT, sv.ut);
      if (sv.surv) surv = sv.surv;
      const map = new Map<string, any>(sv.conts.map((c: any) => [c[0], c]));
      for (const c of conts) {
        const s = map.get(c.id);
        if (s) c.items = s[1];
        map.delete(c.id);
      }
      map.forEach(c =>
        /^f\d+_/.test(String(c[0]))
          ? savedF.set(c[0], c[1])
          : String(c[0]).startsWith('pb')
            ? makeBucket(c[0], c[2], c[1])
            : makeCont(c[0], c[2], 'crate', undefined, c[1]),
      );
      if (Array.isArray(sv.radio)) radioLog = sv.radio.slice(-200);
      (sv.bar || []).forEach((i: number) => doors[i] && setBarricade(doors[i]));
      checkSectors(true);
      conts.forEach(updateVis);
    } else {
      clearSave();
      gmap?.reset();
      roadT.reset();
      player.inv = { ...ROLE.inv };
      spawnRole(ROLE, skipIntro);
    }
    $('title').style.display = 'none';
    started = true;
    if (!surv.home) surv.home = [player.pos.x, player.pos.z];
    setupSnipers();
    {
      // v22.4.1 day 1: mark the home's street door (map pin + a bobbing arrow until you have stepped outside)
      const hb = bldAt(player.pos.x, player.pos.z);
      const hd = hb?.door || doorNear(30);
      if (hd && gameMin < 2 * 1440) {
        gmap?.intel('homeexit', hd.p[0], hd.p[1], 'safe', tr('家門口（出口）', 'Home entrance (exit)'));
        const ar = new THREE.Mesh(
          new THREE.ConeGeometry(0.35, 0.8, 4),
          new THREE.MeshBasicMaterial({ color: 0xffa020, depthTest: false, transparent: true }),
        );
        ar.rotation.x = Math.PI;
        ar.renderOrder = 9;
        ar.position.set(hd.p[0], 3.2, hd.p[1]);
        scene.add(ar);
        exitMark = { m: ar, b: hb || null };
      }
    }
    document.body.classList.add('ingame');
    document.getElementById('startbar')?.remove();
    {
      const mb = document.getElementById('mapbtn');
      if (mb) mb.style.display = '';
    }
    lastHp = player.hp;
    startRainAudio();
    {
      const sp = document.createElement('div');
      sp.id = 'speed';
      sp.innerHTML =
        '<span class="st"></span>' +
        SPEEDS.map((v, i) =>
          getLanguage() === 'en'
            ? `<button data-s="${v}" title="Press ${i + 1}">${v === 1 ? '▶' : v === 3 ? '⏩' : '⏭'} ×${v}</button>`
            : `<button data-s="${v}" title="按 ${i + 1}">${v === 1 ? '▶' : v === 3 ? '⏩' : '⏭'} ×${v}</button>`,
        ).join('') +
        (getLanguage() === 'en' ? `<small>One day = ${DAYH} hours</small>` : `<small>一天 = ${DAYH} 小時</small>`);
      sp.querySelectorAll('button').forEach(
        b => ((b as HTMLElement).onclick = () => setSpeed(+(b as HTMLElement).dataset.s!)),
      );
      $('topright').appendChild(sp);
      renderSpeed();
    }
    PRO.on ||
      log(
        tr(
          '十月某日清晨，解放軍登陸後三天，台北淪陷。萬華的電燈還亮著，水龍頭還有水——但能撐多久？',
          'One October morning, three days after the PLA landed, Taipei has fallen. Wanhua still has lights and running water—but for how long?',
        ),
        '#ffd76a',
      );
    log(
      MOBILE
        ? tr(
            '提示：先按「搜」搜刮身邊的櫥櫃，☰ 開選單。',
            'Tip: tap Loot to search nearby cabinets. Tap ☰ for the menu.',
          )
        : getLanguage() === 'en'
          ? `Tip: search nearby cabinets (${keyLabel('interact')}), then press ${keyLabel('inv')} to open your inventory and equip the cleaver; Esc opens the menu.`
          : `提示：先搜刮身邊的櫥櫃（${keyLabel('interact')}），按 ${keyLabel('inv')} 開背包裝備菜刀；Esc 開選單。`,
      '#ccc',
    );
  };
  // Let the loading surface paint before building the selected survivor, then warm shaders.
  let entering = false;
  const paint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const go = async (load: boolean, gender = 'm', roleId = 'courier', skipIntro = false) => {
    if (entering || started) return;
    entering = true;
    const cover = document.createElement('div');
    cover.id = 'entry-loading';
    cover.setAttribute('role', 'status');
    cover.setAttribute('aria-live', 'polite');
    cover.innerHTML = `<div class="entry-spinner" aria-hidden="true"></div><h2>${tr('走進萬華', 'Entering Wanhua')}</h2><p></p>`;
    const status = cover.querySelector('p')!;
    status.textContent = tr('準備倖存者與街區…', 'Preparing your survivor and district…');
    document.body.appendChild(cover);
    document.body.classList.add('entering-game');
    try {
      await paint();
      prepareGame(load, gender, roleId, skipIntro);
      started = false; // No simulation or autosave while shaders are warming.
      status.textContent = tr('準備畫面與光影…', 'Preparing the first frame…');
      camera.position.copy(player.pos).add(CAM_OFF);
      camera.lookAt(player.pos);
      await paint();
      await renderer.compileAsync(scene, camera);
      renderer.render(scene, camera);
      await paint();
      started = true;
      if (MP) await startNet();
      cover.remove();
      document.body.classList.remove('entering-game', 'selmode');
    } catch (error) {
      console.error('Game entry failed', error);
      started = false;
      status.textContent = tr(
        '畫面準備失敗，請重新載入後再試。',
        'Could not prepare the scene. Please reload and try again.',
      );
      const retry = document.createElement('button');
      retry.textContent = tr('重新載入', 'Reload');
      retry.onclick = () => location.reload();
      cover.appendChild(retry);
    }
  };
  // v22.4 title menu: 繼續遊戲 / 新遊戲 / 多人連線 / 設定 / 操作說明 / 製作名單; 新遊戲 and 多人連線 open the role select
  const tm = document.createElement('div');
  tm.id = 'tmenu';
  tm.innerHTML =
    (sv
      ? tr(
          '<button data-a="cont" class="pri">繼續遊戲</button>',
          '<button data-a="cont" class="pri">Continue game</button>',
        )
      : '') +
    (getLanguage() === 'en'
      ? `<button data-a="new"${sv ? '' : ' class="pri"'}>New game</button><button data-a="mp"${MP_ON ? '' : ' class="soon" aria-disabled="true"'}>${MP_ON ? 'Multiplayer' : 'Multiplayer<small> (coming soon)</small>'}</button><button data-a="set">Settings</button><button data-a="help">Controls</button><button data-a="about">Credits / About</button>`
      : `<button data-a="new"${sv ? '' : ' class="pri"'}>新遊戲</button><button data-a="mp"${MP_ON ? '' : ' class="soon" aria-disabled="true"'}>${MP_ON ? '多人連線' : '多人連線<small>（即將開放）</small>'}</button><button data-a="set">設定</button><button data-a="help">操作說明</button><button data-a="about">製作名單／關於</button>`);
  const showSel = (mp = false) => {
    document.body.classList.add('selmode');
    setSelectionStep(0);
    btns.style.display = '';
    tm.style.display = 'none';
    if (mp) document.getElementById('mpsel')?.scrollIntoView({ block: 'center' });
    document.getElementById('mpsel')?.classList.toggle('hl', mp);
  };
  const showTm = () => {
    MP = null;
    $('title').removeAttribute('data-loading');
    document.body.classList.remove('selmode');
    btns.style.display = 'none';
    tm.style.display = '';
    showTitleLanguage();
  };
  tm.querySelectorAll('button').forEach(
    b =>
      ((b as HTMLElement).onclick = () => {
        const a = (b as HTMLElement).dataset.a;
        if (a === 'cont') go(true);
        else if (a === 'new') {
          if (
            sv &&
            !confirm(
              tr('開始新遊戲會覆蓋目前的存檔，確定？', 'Starting a new game will overwrite your save. Continue?'),
            )
          )
            return;
          showSel();
        } else if (a === 'mp') {
          if (MP_ON) showSel(true);
          else soonToast(tr('多人連線即將開放，敬請期待', 'Multiplayer is coming soon. Stay tuned!'));
        } else if (a === 'set') openSettings();
        else if (a === 'help') openHelp();
        else openAbout();
      }),
  );
  btns.parentElement!.insertBefore(tm, btns);
  {
    const back = document.createElement('button');
    back.id = 'selback';
    back.textContent = tr('← 返回主選單', '← Return to main menu');
    back.onclick = showTm;
    btns.appendChild(back);
  }
  showTm();
  (window as any).__newGame = () => showSel();
  (window as any).__titleBack = () => document.body.classList.contains('selmode') && showTm();
  const sel = document.createElement('div');
  sel.id = 'charsel';
  const roleDetail = document.createElement('aside');
  roleDetail.id = 'selection-role-detail';
  let selG: 'm' | 'f' = 'm';
  let skipI = false;
  const gsw = document.createElement('div');
  gsw.id = 'gsel';
  gsw.innerHTML = tr(
    `<button data-x="m" class="on">男</button><button data-x="f">女</button><label><input type="checkbox" id="skipintro"> 跳過開場</label>`,
    `<button data-x="m" class="on">Male</button><button data-x="f">Female</button><label><input type="checkbox" id="skipintro"> Skip intro</label>`,
  );
  const mpw = document.createElement('div');
  mpw.id = 'mpsel';
  if (!MP_ON) mpw.style.display = 'none';
  const defB = MPQ.get('mp') || import.meta.env.VITE_MP_SERVER || 'http://localhost:8787';
  mpw.innerHTML =
    getLanguage() === 'en'
      ? `<span>🌐 Multiplayer (experimental, 2–4 players): </span><input id="mpbase" value="" size="22"><button id="mpnew">Create room</button><input id="mpcode" placeholder="Room code" maxlength="5" size="6" value=""><button id="mpjoin">Join</button><em id="mpmsg"></em>`
      : `<span>🌐 多人連線（實驗・2–4 人）：</span><input id="mpbase" value="" size="22"><button id="mpnew">建立房間</button><input id="mpcode" placeholder="房間代碼" maxlength="5" size="6" value=""><button id="mpjoin">加入</button><em id="mpmsg"></em>`;
  (mpw.querySelector('#mpbase') as HTMLInputElement).value = defB;
  (mpw.querySelector('#mpcode') as HTMLInputElement).value = MPQ.get('room') || '';
  const mpScope = document.createElement('p');
  mpScope.textContent = tr(
    '實驗連線：相容合作伺服器統一戰鬥、彈藥與綠色補給箱；劇情與城區模擬尚未共享。不覆寫單機存檔。',
    'Experimental: compatible co-op servers own combat, ammo and green supply crates. Story and city simulation are not shared. Single-player saves are protected.',
  );
  mpw.appendChild(mpScope);
  const mpMsg = (t: string) => {
    (mpw.querySelector('#mpmsg') as HTMLElement).textContent = t;
  };
  (mpw.querySelector('#mpnew') as HTMLElement).onclick = async () => {
    const base = (mpw.querySelector('#mpbase') as HTMLInputElement).value.replace(/\/$/, '');
    mpMsg(tr('建立中…', 'Creating...'));
    try {
      const { Net } = await import('../net/net');
      const code = await new Net(base).create();
      (mpw.querySelector('#mpcode') as HTMLInputElement).value = code;
      MP = { base, code };
      mpMsg(
        getLanguage() === 'en'
          ? `Room ${code} created. Choose a character to start; share the code with friends.`
          : `房間 ${code} 已建立，選角色開始；把代碼給朋友`,
      );
    } catch (e) {
      mpMsg(tr('伺服器連不上：', 'Cannot connect to server: ') + (e as Error).message);
    }
  };
  (mpw.querySelector('#mpjoin') as HTMLElement).onclick = () => {
    const base = (mpw.querySelector('#mpbase') as HTMLInputElement).value.replace(/\/$/, '');
    const code = (mpw.querySelector('#mpcode') as HTMLInputElement).value.trim().toUpperCase();
    if (!/^[A-Z2-9]{5}$/.test(code)) return mpMsg(tr('代碼是 5 碼', 'The code must be 5 characters.'));
    MP = { base, code };
    mpMsg(getLanguage() === 'en' ? `Joining ${code}. Choose a character to start.` : `將加入 ${code}，選角色開始`);
  };
  if (MPQ.get('room')) MP = { base: defB, code: MPQ.get('room')!.toUpperCase() };
  let selR = ROLES[0].id;
  const markSel = () => {
    sel.querySelectorAll('.ch').forEach(x => {
      const selected = (x as HTMLElement).dataset.r === selR;
      x.classList.toggle('on', selected);
      x.setAttribute('aria-pressed', String(selected));
    });
    const r = roleById(selR);
    roleDetail.innerHTML = `<span class="selection-eyebrow">${tr('角色檔案', 'SURVIVOR PROFILE')}</span><h3>${r.names[selG === 'm' ? 0 : 1]}・${r.name}</h3><p>${r.blurb}</p><div class="selection-perks">${r.perks.join('・')}</div>`;
    const sb = document.getElementById('startbar');
    if (sb) sb.querySelector('b')!.textContent = `${r.names[selG === 'm' ? 0 : 1]}・${r.name}`;
  };
  const drawSel = () => {
    sel.innerHTML = ROLES.map(r => {
      const o = r.look[selG];
      return getLanguage() === 'en'
        ? `<div class="ch" role="button" tabindex="0" data-g="${selG}" data-r="${r.id}"><img class="pv" alt="" src="${rolePortrait(r.id, selG)}"><b>${r.names[selG === 'm' ? 0 : 1]}・${r.name}</b><small class="ag">${selG === 'm' ? 'Male' : 'Female'}・${r.age[selG === 'm' ? 0 : 1]} years old</small><small class="bl">${r.blurb}</small><small class="pk"><em>${r.perks.join('・')}</em></small></div>`
        : `<div class="ch" role="button" tabindex="0" data-g="${selG}" data-r="${r.id}"><img class="pv" alt="" src="${rolePortrait(r.id, selG)}"><b>${r.names[selG === 'm' ? 0 : 1]}・${r.name}</b><small class="ag">${selG === 'm' ? '男' : '女'}・${r.age[selG === 'm' ? 0 : 1]} 歲</small><small class="bl">${r.blurb}</small><small class="pk"><em>${r.perks.join('・')}</em></small></div>`;
    }).join('');
    sel.querySelectorAll('.ch').forEach(
      el =>
        ((el as HTMLElement).onclick = () => {
          const rid = (el as HTMLElement).dataset.r!;
          selR = rid;
          markSel();
        }),
    );
    sel.querySelectorAll<HTMLElement>('.ch').forEach(
      el =>
        (el.onkeydown = e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.click();
          }
        }),
    );
    markSel();
  };
  gsw.querySelectorAll('button').forEach(
    b =>
      ((b as HTMLElement).onclick = () => {
        selG = (b as HTMLElement).dataset.x as 'm' | 'f';
        gsw.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        drawSel();
      }),
  );
  (gsw.querySelector('#skipintro') as HTMLInputElement).onchange = e => {
    skipI = (e.target as HTMLInputElement).checked;
  };
  drawSel();
  (window as any).__selG = (g: 'm' | 'f') => {
    selG = g;
    gsw.querySelectorAll('button').forEach(x => x.classList.toggle('on', (x as HTMLElement).dataset.x === g));
    drawSel();
  };
  const dl = document.createElement('div');
  dl.id = 'daylen';
  dl.innerHTML =
    tr('<span>新遊戲・一天長度（現實時間）：</span>', '<span>New game · Day length (real time): </span>') +
    [1, 2, 4]
      .map(x =>
        getLanguage() === 'en'
          ? `<button data-h="${x}" class="${x === 1 ? 'on' : ''}">${x} hours${x === 1 ? ' (default)' : ''}</button>`
          : `<button data-h="${x}" class="${x === 1 ? 'on' : ''}">${x} 小時${x === 1 ? '（預設）' : ''}</button>`,
      )
      .join('');
  dl.querySelectorAll('button').forEach(
    b =>
      ((b as HTMLElement).onclick = () => {
        DAYH = +(b as HTMLElement).dataset.h!;
        dl.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      }),
  );
  const h = document.createElement('div');
  h.className = 'selh';
  h.textContent = tr('選擇你的倖存者：', 'Choose your survivor:');
  btns.appendChild(h);
  btns.appendChild(dl);
  btns.appendChild(gsw);
  btns.appendChild(sel);
  btns.appendChild(mpw);
  {
    const sb = document.createElement('div');
    sb.id = 'startbar';
    sb.innerHTML = tr(
      '<span>已選：<b></b></span><button id="startgo">開始遊戲 ▶</button>',
      '<span>Selected: <b></b></span><button id="startgo">Start game ▶</button>',
    );
    (sb.querySelector('#startgo') as HTMLElement).onclick = () => {
      if (selectionStep < 2) setSelectionStep(selectionStep + 1);
      else void go(false, selG, selR, skipI);
    };
    document.body.appendChild(sb);
    markSel();
  }
  let selectionStep = 0;
  const stepper = document.createElement('div');
  stepper.id = 'selection-steps';
  stepper.setAttribute('aria-live', 'polite');
  const summary = document.createElement('div');
  summary.id = 'selection-summary';
  const previous = document.createElement('button');
  previous.id = 'selection-previous';
  previous.textContent = tr('← 上一步', '← Back');
  previous.onclick = () => setSelectionStep(selectionStep - 1);
  btns.insertBefore(stepper, h);
  btns.append(summary);
  $('startbar').insertBefore(previous, $('startgo'));
  const roleStage = document.createElement('div');
  roleStage.id = 'selection-role-stage';
  roleStage.append(gsw, sel, roleDetail);
  btns.appendChild(roleStage);
  const skipLabel = gsw.querySelector('label')!;
  const settings = document.createElement('div');
  settings.id = 'selection-settings';
  settings.append(dl, skipLabel, mpw);
  btns.appendChild(settings);
  function setSelectionStep(step: number) {
    selectionStep = Math.max(0, Math.min(2, step));
    btns.dataset.step = String(selectionStep);
    const labels = [tr('選擇角色', 'Survivor'), tr('開局設定', 'Preferences'), tr('確認出發', 'Ready')];
    stepper.innerHTML = labels
      .map(
        (label, i) =>
          `<div class="selection-step ${i === selectionStep ? 'active' : ''}" ${i === selectionStep ? 'aria-current="step"' : ''}><b>0${i + 1}</b><span>${label}</span></div>`,
      )
      .join('');
    h.textContent = labels[selectionStep];
    roleStage.hidden = selectionStep !== 0;
    settings.hidden = selectionStep !== 1;
    summary.hidden = selectionStep !== 2;
    previous.hidden = selectionStep === 0;
    const r = roleById(selR);
    summary.innerHTML = `<div class="selection-identity"><span class="selection-eyebrow">${tr('你的倖存者', 'YOUR SURVIVOR')}</span><img alt="" src="${rolePortrait(r.id, selG)}"><h3>${r.names[selG === 'm' ? 0 : 1]}・${r.name}</h3><p>${r.perks.join('・')}</p></div><div class="selection-departure"><span class="selection-eyebrow">${tr('出發資訊', 'DEPARTURE BRIEF')}</span><h3>${tr('萬華・西門町', 'Wanhua · Ximending')}</h3><div class="selection-fact"><span>${tr('一天長度', 'Day length')}</span><b>${DAYH} ${tr('小時', 'hours')}</b></div><div class="selection-fact"><span>${tr('開場', 'Opening')}</span><b>${skipI ? tr('跳過開場', 'Skip intro') : tr('體驗開場', 'Play intro')}</b></div><small>${tr('出發後才會建立新遊戲；返回不會覆蓋存檔。', 'Your new game begins only when you depart. Going back keeps your save.')}</small></div>`;
    $('startgo').textContent = selectionStep === 2 ? tr('出發 ▶', 'Depart ▶') : tr('下一步 →', 'Next →');
    $('title').scrollTop = 0;
  }
  setSelectionStep(0);
  camera.position.copy(player.pos).add(CAM_OFF);
  camera.lookAt(player.pos);
  addEventListener('beforeunload', save);
  // pause menu 讀檔 reloads straight into the save
  if (sv && sessionStorage.getItem('dt.autoload')) {
    sessionStorage.removeItem('dt.autoload');
    setTimeout(() => go(true), 0);
  }
  (window as any).__game = {
    ...(STORY_DEBUG
      ? {
          storyEvent: (id: string) => {
            if (!started || dead) return { fired: false, saved: false, reason: 'game not active' };
            const event = storyRunner.runStoryEvent(id);
            if (!event) return { fired: false, saved: false, reason: 'unknown or already fired' };
            log(event.text, '#9fd0ff', 'radio');
            if (NOSAVE) return { fired: true, saved: false, reason: 'saving disabled' };
            try {
              save();
              return { fired: true, saved: true };
            } catch {
              return { fired: true, saved: false, reason: 'save failed' };
            }
          },
        }
      : {}),
    roofStats,
    melee: () => ({ attack: playerAttack, sols, trail: swingTrail, rig: player.rig }),
    phone: (w: string, m: string) => phone(w, m),
    save: () => save(),
    radio: () => ({ log: radioLog, bc: BC.bcStats, siren: BC.sirenOn() }),
    siren: (k: 'alert' | 'clear' | 'test') => emit('alert', { kind: k }),
    radioLogHtml: () => radioLogHtml(),
    clutter: () => ({
      stats: CL.clutterStats,
      live: [...clutLive].map(b => [b.id, (b as any).clut.use]),
      conts: conts.filter(c => c.id[0] === 'f').map(c => [c.id, c.label, Object.keys(c.items).length, c.mesh.visible]),
      plans: blds.filter(b => (b as any).clut).map(b => [b.id, (b as any).clut.use, b.c, b.door!.p, b.h]),
    }),
    ai: () => ({
      radio,
      stats: aiStats,
      grens,
      sols,
      campT,
      grenCd,
      SQ,
      setGrenCd: (v: number) => (grenCd = v),
      radioCd,
    }),
    OCC,
    escapeCheck,
    unstuck,
    snp: () =>
      snp?.list.map(s => ({
        id: s.id,
        name: s.name,
        j: s.j,
        p: s.p,
        y: s.y,
        dead: s.dead,
        st: s.st,
        door: s.b.door?.p,
      })),
    snpLock: () => !!snp?.lock,
    inBld: (x: number, z: number) => !!bldAt(x, z),
    inZone: (x: number, z: number) => !!snp?.inZone(x, z),
    snpLos: (i: number, x: number, z: number) => los(snpEye(snp!.list[i]), [x, z]),
    roof: () => (roofB ? roofB.h : 0),
    roofGo: () => roofToggle(),
    scopeOn: (yaw?: number, pitch?: number) => {
      scopeEnter();
      if (yaw !== undefined) scope.yaw = yaw;
      if (pitch !== undefined) scope.pitch = pitch;
      return scope.on;
    },
    scopeOff: () => scopeExit(),
    scopeFire: () => scopeFire(),
    moral: () => surv.moral || (moral ? 'pending' : ''),
    audio: () => ({ ...AU.auStats, sfx: AU.sfxCtx()?.state }),
    audioFx: AU,
    autoStop: () => {
      AUTO.path = [];
      AUTO.i = 0;
    },
    autoWalk: () => {
      const p = escapePath(player.pos.x, player.pos.z);
      AUTO.path = p || [];
      AUTO.i = 0;
      return p ? p.length : -1;
    },
    autoState: () => ({
      i: AUTO.i,
      n: AUTO.path.length,
      p: [player.pos.x, player.pos.z],
      inBld: !!bldAt(player.pos.x, player.pos.z),
      road: roadDist(player.pos.x, player.pos.z),
      home: surv.home,
      door: (() => {
        const b = bldAt(surv.home![0], surv.home![1]);
        return b?.door ? b.door.p : null;
      })(),
      nudges,
      cd: (() => {
        const d = doorNear(1.3);
        return !!d && !d.open && !d.barricaded;
      })(),
      prompt: $('prompt').style.display !== 'none' ? $('prompt').textContent : '',
    }),
    spawnTest: (roleId: string, g: string, skip: boolean) => {
      player.gender = g;
      spawnRole(roleById(roleId), skip);
      const e = escapeCheck(player.pos.x, player.pos.z);
      if (!skip) endPrologue();
      return { ...e, nudges, p: [player.pos.x, player.pos.z] };
    },
    district,
    sectorOf,
    SECTORS,
    arcadeAudit: () => arcadeAudit(bldAt),
    roadT,
    traffic,
    drive,
    PRO,
    role: () => ROLE,
    endPrologue: () => endPrologue(),
    map: gmap,
    player,
    sols,
    blds,
    conts,
    nav,
    started: () => started,
    go,
    vehicles,
    decay: () => decay,
    alley: () => alley,
    facade: () => facade,
    setSpeed,
    speed: () => speed,
    WX,
    airdrop,
    makeBucket,
    noise,
    dayh: () => DAYH,
    evac: () => evac && evac.pos,
    evacOpen,
    doEvac,
    INF: () => INF,
    RV: () => RV,
    infPos: () => infPos,
    elderPos: () => elderPos,
    npcInteract,
    verifyInf,
    setMin: (m: number) => {
      gameMin = m;
    },
    parks: () => parks,
    simRain: (h: number) => {
      for (let i = 0; i < h * 20; i++) updateWeather(0.05, 0.05);
    },
    camera,
    CAM_OFF,
    setTime: (m: number) => {
      gameMin = m;
    },
    start: () => start!.c,
    scene,
    gm: () => gameMin,
    roadDist,
    shotRay,
    sandbags,
    metro: () => metro,
    metroUse,
    metroBoard,
    shopAt,
    shopUse,
    openShop,
    metroStats,
    svc,
    rideTo,
    openRide,
    UT,
    surv: () => surv,
    SV,
    openSurv,
    closeSurv,
    MB,
    addSeg,
    removeSeg,
    findCover,
    toggleCover,
    coverStats,
    solCover,
    tp: (x: number, z: number) => player.pos.set(x, 0, z),
    // v22.7 portrait-control test hooks
    contNear: () => {
      let b: Cont | null = null,
        bd = 1e9;
      for (const c of conts) {
        const d = Math.hypot(c.p[0] - player.pos.x, c.p[1] - player.pos.z);
        if (d < bd && !bldAt(c.p[0], c.p[1])) ((b = c), (bd = d));
      }
      return b && [b.p[0], b.p[1]];
    },
    pst: () => ({
      eq: player.equip,
      sneak: player.sneak,
      cover: !!player.cover,
      retreat: MB.retreat,
      rn: MB.rn,
      ammo: player.inv.a762n || 0,
      scope: scope.on,
      fire: MB.fire,
    }),
    equipSet: (k: string) => (player.equip = k),
    damageSol,
    toggleInv,
    addItem,
    armor: () => armor,
    fpv: () => fpv,
    recon: () => recon,
    ROC,
    roc: () => roc,
    useItem,
    testAT: (k: string) => {
      const a = armor!.list.find(a => !a.dead)!;
      const dir = a.g.position.clone().sub(player.pos).setY(0).normalize();
      fireAT(k, ITEMS[k], dir);
      return a.hp;
    },
    callSupport,
    rocCheck,
    liberate: (n: number) => {
      for (let i = 0; i < NSEC && liberated.size < n; i++)
        if (!liberated.has(i)) {
          for (const q of sols)
            if (q.sector === i) {
              q.state = 'dead';
              q.hp = 0;
              q.mesh.visible = false;
            }
          liberated.add(i);
        }
      rocCheck(false);
    },
    lastBlast: () => lastBlast,
    shells,
    blastFx,
    SHELL,
    shellDmg,
    lastShellHit: () => lastShellHit,
    launchFPV,
    blast,
    sim: (n: number, dt = 0.05) => {
      for (let i = 0; i < n; i++) {
        update(dt);
        if (fpv?.active) fpv.update(dt);
      }
    },
    roadPt: () => {
      let best: V2 = [player.pos.x, player.pos.z],
        bd = 1e9;
      for (const r of roads)
        if (/primary|secondary|tertiary/.test(r.t))
          for (const q of r.p) {
            const d = Math.hypot(q[0] - player.pos.x, q[1] - player.pos.z);
            if (d < bd && d > 8 && !bldAt(q[0], q[1])) {
              bd = d;
              best = q;
            }
          }
      return best;
    },
    checkpoints: () => checkpoints,
  };
}
/** v22.7.1 show a 「重新載入」 button that drops the service-worker cache (stale assets after a deploy) */
function bootRescue(why: string) {
  if (document.getElementById('rescue')) return;
  const b = document.createElement('button');
  b.id = 'rescue';
  b.textContent = getLanguage() === 'en' ? `${why}: clear cache and reload` : `${why}：清除快取並重新載入`;
  b.onclick = async () => {
    try {
      for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister();
      for (const k of (await caches?.keys?.()) || []) if (k.startsWith('dt-')) await caches.delete(k);
    } catch {}
    location.reload();
  };
  $('title').appendChild(b);
}
$('title').querySelector('h2')!.textContent =
  getLanguage() === 'en' ? `Occupied Wanhua · Survival Prototype ${VERSION}` : `萬華淪陷區 · 生存原型 ${VERSION}`;
applyBtnSize();
boot().catch(e => {
  console.error(e);
  $('loadmsg').textContent = tr('載入失敗：', 'Loading failed: ') + e;
  bootRescue(tr('載入失敗', 'Loading failed'));
});
loop();
// PWA: offline play after the first load (cache is versioned per deploy in sw.js)
if ('serviceWorker' in navigator && import.meta.env.PROD)
  addEventListener('load', () =>
    navigator.serviceWorker
      .register(import.meta.env.BASE_URL + 'sw.js', { updateViaCache: 'none' })
      .catch(e => console.warn('sw', e)),
  );
