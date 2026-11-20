// v24.40 the teammates' rules that need no scene: who they are to you, the trail they follow, what they eat and hold,
// and when they fight. Run by scripts/checks/modules.mjs (node, no browser).
import { relation, Trail, pickConsumable, pickWeapon, engages, mateMax } from './mates';
import { ITEMS } from '../systems/items';

let n = 0;
const ok = (v: unknown, what: string) => {
  n++;
  if (!v) throw new Error('mates: ' + what);
};
const eq = (a: unknown, b: unknown, what: string) =>
  ok(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

// who they are to you
eq(relation({ r: 'student', g: 'f' }, { r: 'tech', g: 'm' }, []), '爸爸', 'a technician is a student’s father');
eq(relation({ r: 'tech', g: 'f' }, { r: 'student', g: 'm' }, []), '兒子', 'a student is a technician’s son');
eq(
  relation({ r: 'tech', g: 'm' }, { r: 'tech', g: 'f' }, [{ r: 'student', g: 'f' }]),
  '太太',
  'two technicians with a student are the parents',
);
eq(relation({ r: 'tech', g: 'm' }, { r: 'tech', g: 'f' }, []), '同事', 'two technicians alone are colleagues');
eq(relation({ r: 'student', g: 'm' }, { r: 'student', g: 'f' }, []), '同學', 'two students are classmates');
eq(relation({ r: 'office', g: 'm' }, { r: 'nurse', g: 'f' }, []), '室友', 'anyone else shares the flat');
eq([mateMax(false), mateMax(true)], [2, 1], 'two on a computer, one on a phone');

// the trail
const t = new Trail();
t.reset(0, 0);
for (let k = 1; k <= 25; k++) t.push(k * 0.4, 0);
ok(t.pts.length === 26 && Math.abs(t.len - 10) < 1e-6, `points every 0.4 m (${t.pts.length}, ${t.len})`);
t.push(10.2, 0);
ok(t.pts.length === 26, 'a step under 0.35 m is not a point');
const i2 = t.behind(2);
ok(Math.abs(t.at(i2).x - 8) < 1e-6, `2 m behind the newest point (${t.at(i2).x})`);
ok(t.behind(99) === t.base, 'further back than the trail: its first point');
t.push(30, 0);
ok(t.pts.length === 1 && t.len === 0 && !t.has(i2), 'a jump starts the trail again (the old points are gone)');
for (let k = 1; k <= 200; k++) t.push(30 + k * 0.4, 0, k === 150);
ok(t.pts.length === Trail.MAX && t.base > 0, 'at most 140 points, counted on from the dropped ones');
ok(t.has(t.head) && t.at(t.head).x > 109, 'the newest point is the last step');
ok(
  t.pts.some(p => p.v),
  'a vault is marked on the trail',
);
const near = t.nearest(80, 0.3, () => true, 1);
ok(near >= 0 && Math.abs(t.at(near).x - 80) < 0.3, 'the nearest point to a place');

// what they eat, drink and hold
const has = (inv: Record<string, number>, v: Partial<{ hunger: number; thirst: number; hp: number; bleed: boolean }>) =>
  pickConsumable(inv, ITEMS, { hunger: 80, thirst: 80, hp: 100, bleed: false, ...v });
eq(has({ can: 1, bread: 1 }, {}), null, 'not hungry: nothing');
eq(has({ can: 1, bread: 1 }, { hunger: 20 }), 'can', 'hungry: the most filling');
eq(has({ rawrice: 2 }, { hunger: 20 }), null, 'nothing raw');
eq(has({ water: 1, can: 1 }, { thirst: 20, hunger: 20 }), 'water', 'thirst before hunger');
eq(has({ bandage: 1, can: 1 }, { bleed: true, hunger: 20 }), 'bandage', 'bleeding: the bandage first');
const risky = Object.keys(ITEMS).find(k => ITEMS[k].risk && (ITEMS[k].thirst || 0) > 0 && !ITEMS[k].raw);
if (risky) {
  eq(has({ [risky]: 1 }, { thirst: 20 }), null, `nothing that might upset the stomach (${risky}) while it can wait`);
  eq(has({ [risky]: 1 }, { thirst: 8 }), risky, 'but that rather than going without');
}
eq(has({ rotten: 2 }, { hunger: 20 }), null, 'nothing spoiled while it can wait');
eq(has({ rotten: 2 }, { hunger: 8 }), 'rotten', 'but that rather than starving');
eq(pickWeapon({ knife: 1, pipe: 1 }, ITEMS), 'pipe', 'the hardest-hitting thing to swing');
eq(pickWeapon({ knife: 1, pistol: 1 }, ITEMS), 'knife', 'a gun with no rounds is not held');
eq(pickWeapon({ knife: 1, pistol: 1, a9: 5 }, ITEMS), 'pistol', 'a gun with rounds');
eq(pickWeapon({ at4: 1, knife: 1 }, ITEMS), 'knife', 'never a launcher');
eq(pickWeapon({ water: 1 }, ITEMS), '', 'bare hands');

// when they fight
const c = { foeOnUs: false, close: false, fighting: false, playerFired: false, hurt: false, sneaking: false };
ok(!engages(0, { ...c, fighting: true, playerFired: true }), 'hold fire: not even in a fight');
ok(engages(0, { ...c, foeOnUs: true, close: true }), 'hold fire: one already on them at arm’s length');
ok(engages(1, { ...c, fighting: true }), 'use judgement: a soldier in a fight with the team');
ok(engages(1, { ...c, hurt: true }), 'use judgement: once hurt');
ok(engages(1, { ...c, playerFired: true }), 'use judgement: once the player has opened up');
ok(!engages(1, { ...c, playerFired: true, sneaking: true }), 'but not an unaware one while the player sneaks');
ok(!engages(1, c), 'use judgement: not an unaware one');
ok(engages(2, c), 'fire at will: anyone in sight');
console.log(`mates: ${n} checks passed`);
