import * as THREE from 'three';
import { tr, getLanguage } from '../i18n';
import type { Rig } from './human';
// v24.3 國軍殘部 (ROC Army remnants): squads that did not withdraw. Each holds a sandbagged corner with a flag,
// fires on PLA soldiers that come into its sights, and holds until the last man. The player can talk to the
// squad leader (supplies once a day, intelligence, bandaging the wounded); a fallen position leaves its gear and a
// memorial. Every unit designation and name here is fictional.
type V2 = [number, number];
type Foe = { pos: THREE.Vector3; state: string; hp: number };
export type RemDeps = {
  scene: THREE.Scene;
  rig: (weapon: string, i: number) => Rig;
  animate: (r: Rig, state: 'idle' | 'aim' | 'death' | 'hurt', dt: number) => void;
  sandbags: (x: number, z: number, ang: number, n: number) => THREE.Object3D;
  flag: () => THREE.Object3D;
  foes: () => Foe[];
  los: (p: V2, q: V2) => boolean;
  hit: (f: Foe, dmg: number) => void;
  fire: (r: Rig, dist: number) => void;
  noise: (x: number, z: number, r: number) => void;
  player: () => THREE.Vector3;
  log: (msg: string, col: string, cls?: string) => void;
  dlg: (title: string, text: string, btns: [string, () => void][]) => void;
  addItem: (k: string, n: number) => void;
  has: (k: string) => number;
  take: (k: string) => void;
  intel: () => void;
  leave: (id: string, p: V2, items: Record<string, number>) => void;
  day: () => number;
  /** persisted state (lives in the survival save) */
  store: () => Record<string, RemSave>;
};
export type RemSave = { hp: number[]; fallen?: 1; supply?: number; met?: 1; last?: number };
type Squad = {
  id: string;
  unit: string;
  leader: string;
  p: V2;
  ang: number;
  g: THREE.Group;
  men: { rig: Rig; p: V2; cd: number; state: 'idle' | 'aim' | 'death' }[];
  lines: string[];
  fallenLine: string;
};
const T = (zh: string, en: string) => (getLanguage() === 'en' ? en : zh);
// four fictional remnant units, each with a voice
const ROSTER = [
  {
    unit: () => T('陸軍守備第 307 營・二連殘部', '2nd Company remnant, 307th Garrison Battalion'),
    leader: () => T('張上士', 'Sergeant First Class Chang'),
    lines: () => [
      T(
        '「三天了，增援沒有來，我們也沒有走。只要這面國旗還插在這裡，這條街就還是中華民國的。」',
        '“Three days. No reinforcements came, and we did not leave. As long as this flag stands here, this street is still the Republic of China.”',
      ),
      T(
        '「子彈省著用，一發一個。我們不是來拚命的，是來守住的——守住了，大家才回得了家。」',
        '“Make every round count. We are not here to throw our lives away; we are here to hold. Hold, and everyone gets to go home.”',
      ),
      T(
        '「你看到那些老百姓沒有？他們還在。我們就不能先倒。」',
        '“See those people still in their homes? They are still here. So we cannot be the first to fall.”',
      ),
    ],
    fallen: () =>
      T(
        '📻（雜訊）……這裡是二連……敵人上來了，我們守住巷口……弟兄們，跟我上——（無線電沒有了聲音）',
        '📻 (static) …This is Second Company… they are coming up, we are holding the alley mouth… On me, brothers— (the radio goes silent)',
      ),
  },
  {
    unit: () => T('後備動員第 8813 大隊・第一排', '1st Platoon, 8813th Reserve Mobilization Group'),
    leader: () => T('林中尉', 'Lieutenant Lin'),
    lines: () => [
      T(
        '「我們是後備的，上個月還在上班。現在剩七個人，子彈不夠，骨氣夠。」',
        '“We are reservists. Last month we were at our desks. Seven of us left — not enough ammunition, more than enough spine.”',
      ),
      T(
        '「老百姓先走，我們最後走。這不是命令，是我們自己決定的。」',
        '“Civilians go first, we go last. That is not an order; we decided it ourselves.”',
      ),
      T(
        '「我女兒在新店。我守在這裡，就是在守她回家的那條路。」',
        '“My daughter is in Xindian. Holding here is holding the road she will come home on.”',
      ),
    ],
    fallen: () =>
      T(
        '📻（雜訊）……一排報告，彈藥用完了，上刺刀……告訴我女兒，爸爸沒有退——（訊號中斷）',
        '📻 (static) …First Platoon, out of ammunition, fixing bayonets… Tell my daughter her father did not fall back— (signal lost)',
      ),
  },
  {
    unit: () => T('憲兵第 4207 連・殘部', 'Remnant of the 4207th Military Police Company'),
    leader: () => T('陳士官長', 'Sergeant Major Chen'),
    lines: () => [
      T(
        '「我當兵二十六年，沒想過會在自己長大的巷子裡打仗。也好，這裡每一條巷子我都熟。」',
        '“Twenty-six years in uniform. Never thought I would fight in the alleys I grew up in. Good — I know every one of them.”',
      ),
      T(
        '「怕？當然怕。可是怕跟退是兩回事。」',
        '“Afraid? Of course. But being afraid and falling back are two different things.”',
      ),
      T(
        '「他們有坦克、有無人機，我們有這條街。街是我們的。」',
        '“They have tanks and drones. We have this street. The street is ours.”',
      ),
    ],
    fallen: () =>
      T(
        '📻（雜訊）……士官長在此，最後一個……他們不會那麼容易過去的——（槍聲，然後安靜）',
        '📻 (static) …Sergeant Major here, the last one… they will not get through easily— (gunfire, then silence)',
      ),
  },
  {
    unit: () => T('陸軍特戰「艋舺」分隊・殘部', 'Remnant of Army Special Forces Team “Monga”'),
    leader: () => T('吳下士', 'Corporal Wu'),
    lines: () => [
      T(
        '「隊長倒在第一天。現在我帶隊。我二十三歲，可是我知道該怎麼做。」',
        '“The team leader fell on day one. I lead now. I am twenty-three, and I know what to do.”',
      ),
      T(
        '「我們晚上出去，把他們的哨點一個一個標起來。你拿去，比放在我們身上有用。」',
        '“We go out at night and mark their checkpoints one by one. Take it — it is more use to you than to us.”',
      ),
      T(
        '「如果明天你沒看到我們，別難過。看看那面旗，它還在就好。」',
        '“If you do not see us tomorrow, do not grieve. Look at the flag. As long as it is still there, that is enough.”',
      ),
    ],
    fallen: () =>
      T(
        '📻（雜訊）……艋舺分隊……旗還在……旗還在——（無線電只剩雜訊）',
        '📻 (static) …Team Monga… the flag is still up… the flag is still up— (only static remains)',
      ),
  },
];
const WEAP = ['t91', 't91', 't75saw', 't65k2'];
export class RemnantSystem {
  squads: Squad[] = [];
  stats = { shots: 0, hits: 0, wounded: 0, inRange: 0, sighted: 0, updates: 0 };
  private t = 0;
  constructor(private d: RemDeps) {}
  /** place the squads at the given street corners (deterministic sites from core/main) */
  init(sites: { p: V2; ang: number }[]) {
    const st = this.d.store();
    sites.slice(0, ROSTER.length).forEach((s, i) => {
      const R = ROSTER[i];
      const id = 'rem' + i;
      const sv = (st[id] ||= { hp: [100, 100, 100, 100] });
      const g = new THREE.Group();
      this.d.scene.add(g);
      const ux = Math.cos(s.ang),
        uz = Math.sin(s.ang);
      // sandbag line facing the street (ang), a second short wall on the flank, the flag behind them
      g.add(this.d.sandbags(s.p[0] + ux * 1.6, s.p[1] + uz * 1.6, s.ang + Math.PI / 2, 5));
      g.add(this.d.sandbags(s.p[0] - uz * 2.2 + ux * 0.4, s.p[1] + ux * 2.2 + uz * 0.4, s.ang, 3));
      const fl = this.d.flag();
      fl.position.set(s.p[0] - ux * 1.4 + uz * 1.2, 0, s.p[1] - uz * 1.4 - ux * 1.2);
      g.add(fl);
      const men: Squad['men'] = [];
      for (let k = 0; k < 4; k++) {
        const off = (k - 1.5) * 0.95;
        const p: V2 = [s.p[0] - uz * off + ux * 0.4, s.p[1] + ux * off + uz * 0.4];
        const rig = this.d.rig(WEAP[k], k);
        rig.root.position.set(p[0], 0, p[1]);
        rig.root.rotation.y = Math.PI / 2 - s.ang;
        g.add(rig.root);
        const dead = (sv.hp[k] ?? 0) <= 0;
        men.push({ rig, p, cd: 0.35 + k * 0.2, state: dead ? 'death' : 'idle' });
      }
      this.squads.push({
        id,
        unit: R.unit(),
        leader: R.leader(),
        p: s.p,
        ang: s.ang,
        g,
        men,
        lines: R.lines(),
        fallenLine: R.fallen(),
      });
    });
  }
  /** v24.14 the unit still standing in a district, for the line when that district is reclaimed */
  heldIn(inDistrict: (p: V2) => boolean) {
    return this.squads.find(s => inDistrict(s.p) && this.alive(s) > 0)?.unit ?? null;
  }
  alive(q: Squad) {
    const sv = this.d.store()[q.id];
    return q.men.filter((_, k) => sv.hp[k] > 0).length;
  }
  /** the squad whose leader stands within reach of the player */
  near(r = 3.2) {
    const P = this.d.player();
    return this.squads.find(q => Math.hypot(q.p[0] - P.x, q.p[1] - P.z) < r) || null;
  }
  prompt() {
    const q = this.near();
    if (!q) return '';
    const sv = this.d.store()[q.id];
    return sv.fallen
      ? tr(`[E] 國軍殘部最後的陣地（${q.unit}）`, `[E] Last position of the ROC remnant (${q.unit})`)
      : tr(`[E] 和${q.leader}交談（${q.unit}）`, `[E] Talk to ${q.leader} (${q.unit})`);
  }
  /** [E] near a squad: talk, take the daily supplies, bandage the wounded, take their intelligence */
  talk() {
    const q = this.near();
    if (!q) return false;
    const d = this.d,
      sv = d.store()[q.id];
    if (sv.fallen) {
      d.dlg(
        tr('🎖 國軍殘部最後的陣地', '🎖 Last position of the ROC remnant'),
        getLanguage() === 'en'
          ? `${q.unit} held this corner to the last man. The flag is still up. Their remaining gear was left in the crate beside the sandbags.`
          : `${q.unit}在這個路口戰至最後一人。旗子還插著。他們剩下的裝備留在沙包旁的箱子裡。`,
        [],
      );
      return true;
    }
    const day = d.day();
    const first = !sv.met;
    sv.met = 1;
    const line = q.lines[(day + (sv.last ?? 0)) % q.lines.length];
    sv.last = (sv.last ?? 0) + 1;
    const wounded = q.men.map((_, k) => k).filter(k => sv.hp[k] > 0 && sv.hp[k] < 100);
    const btns: [string, () => void][] = [];
    if (sv.supply !== day)
      btns.push([
        tr('領今天的補給', 'Take today’s supplies'),
        () => {
          sv.supply = day;
          d.addItem('a556n', 20);
          d.addItem('ration', 1);
          d.addItem('bandage', 1);
          d.log(
            tr(
              `${q.leader}把一盒 5.56 子彈、一包口糧和繃帶塞給你：「我們還有，你拿去。」`,
              `${q.leader} presses a box of 5.56 rounds, a ration and a bandage into your hands: “We have more. Take it.”`,
            ),
            '#9fd',
          );
        },
      ]);
    if (wounded.length && (d.has('bandage') || d.has('medkit')))
      btns.push([
        tr('幫傷兵包紮', 'Bandage the wounded'),
        () => {
          const k = wounded.sort((a, b) => sv.hp[a] - sv.hp[b])[0];
          const kit = d.has('medkit') ? 'medkit' : 'bandage';
          d.take(kit);
          sv.hp[k] = Math.min(100, sv.hp[k] + (kit === 'medkit' ? 70 : 40));
          d.log(
            tr(
              '你幫一名受傷的弟兄止了血。他咬著牙說：「謝了，我還能打。」',
              'You stop a wounded soldier’s bleeding. He grits his teeth: “Thanks. I can still fight.”',
            ),
            '#9f9',
          );
        },
      ]);
    btns.push([
      tr('問敵情', 'Ask about the enemy'),
      () => {
        d.intel();
        d.log(
          tr(
            `${q.leader}攤開一張手畫的地圖：「他們的哨點都在這裡，我們一個一個標的。」（已標上地圖）`,
            `${q.leader} unfolds a hand-drawn map: “Their checkpoints, every one. We marked them one by one.” (added to your map)`,
          ),
          '#ffd27a',
        );
      },
    ]);
    const intro = first
      ? getLanguage() === 'en'
        ? `${q.unit}. ${this.alive(q)} soldiers behind the sandbags, a flag at their backs. `
        : `${q.unit}。沙包後面還有 ${this.alive(q)} 名弟兄，背後插著一面國旗。`
      : '';
    d.dlg(`🎖 ${q.leader}`, intro + line, btns);
    return true;
  }
  /** per frame: aim and fire on PLA soldiers in sight; take fire back; fall when the last one is down */
  update(dt: number) {
    const d = this.d,
      P = d.player();
    this.t += dt;
    const st = d.store();
    for (const q of this.squads) {
      const far = Math.hypot(q.p[0] - P.x, q.p[1] - P.z) > 150;
      q.g.visible = !far;
      const sv = st[q.id];
      if (far || sv.fallen) {
        if (!far) for (const m of q.men) d.animate(m.rig, 'death', dt);
        continue;
      }
      const foes = d.foes().filter(f => f.state !== 'dead' && Math.hypot(f.pos.x - q.p[0], f.pos.z - q.p[1]) < 42);
      this.stats.updates++;
      this.stats.inRange = foes.length;
      q.men.forEach((m, k) => {
        if (sv.hp[k] <= 0) {
          d.animate(m.rig, 'death', dt);
          return;
        }
        const tgt = foes
          .map(f => [f, Math.hypot(f.pos.x - m.p[0], f.pos.z - m.p[1])] as const)
          .sort((a, b) => a[1] - b[1])
          .find(([f]) => d.los(m.p, [f.pos.x, f.pos.z]));
        if (!tgt) {
          d.animate(m.rig, 'idle', dt);
          return;
        }
        const [f, dist] = tgt;
        this.stats.sighted++;
        m.rig.root.rotation.y = Math.atan2(f.pos.x - m.p[0], f.pos.z - m.p[1]);
        d.animate(m.rig, 'aim', dt);
        m.cd -= dt;
        if (m.cd > 0) return;
        m.cd = 0.9 + ((k * 7 + Math.floor(this.t * 10)) % 9) * 0.1;
        d.fire(m.rig, Math.hypot(m.p[0] - P.x, m.p[1] - P.z));
        d.noise(m.p[0], m.p[1], 45);
        this.stats.shots++;
        if (Math.random() < Math.max(0.18, 0.45 - dist / 120)) {
          d.hit(f, 40);
          this.stats.hits++;
        }
      });
      // return fire: each PLA soldier in a fight with sight of the position may wound a defender
      for (const f of foes)
        if ((f.state === 'combat' || f.state === 'investigate') && d.los([f.pos.x, f.pos.z], q.p))
          if (Math.random() < dt * 0.05) {
            const alive = sv.hp.map((h, k) => [h, k]).filter(([h]) => h > 0);
            if (!alive.length) break;
            const k = alive[Math.floor(Math.random() * alive.length)][1];
            sv.hp[k] -= 30;
            this.stats.wounded++;
            if (sv.hp[k] <= 0) {
              sv.hp[k] = 0;
              d.log(
                tr(
                  `🎖 ${q.unit}又倒下一名弟兄。其餘的人沒有退。`,
                  `🎖 Another soldier of the ${q.unit} has fallen. The rest do not fall back.`,
                ),
                '#d9b',
              );
            }
          }
      if (sv.hp.every(h => h <= 0) && !sv.fallen) {
        sv.fallen = 1;
        d.log(q.fallenLine, '#9fd0ff', 'radio');
        d.log(
          tr(
            `🎖 ${q.unit}全員戰至最後一刻。旗子還插著；他們的裝備留在陣地。`,
            `🎖 The ${q.unit} fought to the very last. Their flag still stands; their gear was left at the position.`,
          ),
          '#ffd27a',
        );
        d.leave('remgear' + q.id, [q.p[0] - Math.cos(q.ang), q.p[1] - Math.sin(q.ang)], {
          t91: 1,
          a556n: 40,
          ration: 2,
          medkit: 1,
          grenade: 2,
        });
      }
    }
  }
  /** morning radio from a squad still holding (story flavour; nothing when all have fallen) */
  dawn() {
    const st = this.d.store();
    const holding = this.squads.filter(q => !st[q.id].fallen);
    if (!holding.length) return;
    const q = holding[this.d.day() % holding.length];
    this.d.log(
      getLanguage() === 'en'
        ? `📻 ROC remnant radio: “This is ${q.unit}. We are still in Wanhua. We have not withdrawn. Hold on, everyone.”`
        : `📻 國軍殘部無線電：「這裡是${q.unit}，我們還在萬華，我們沒有撤退。大家撐住。」`,
      '#9fd0ff',
      'radio',
    );
  }
}
