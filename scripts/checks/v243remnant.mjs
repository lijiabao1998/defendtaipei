// v24.3 國軍殘部: four remnant squads hold street corners around the spawn.
// - each has 4 soldiers, sandbags and a flag; [E] at the position talks to the squad leader (heroic lines)
// - daily supplies (5.56 rounds, ration, bandage) once per game day
// - they fire on a PLA soldier that comes into their sights
// - when the last defender falls, the position falls: radio line, memorial dialogue, gear crate left behind
// argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4190);
const url = gameUrl(process.argv[2] || srv?.url);
const b = await launch();
const p = await b.newPage({ viewport: { width: 1200, height: 760 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
const failed = [];
const check = (ok, what) => {
  console.log(ok ? '  ok  ' : '  FAIL', what);
  if (!ok) failed.push(what);
};
await p.goto(url);
await pickRole(p, { g: 'm', role: 'office', skipIntro: true });
await p.evaluate(() => window.__game.setMin(10 * 60));
await p.waitForTimeout(1500);
const R = await p.evaluate(() => window.__game.rem());
console.log('  squads', JSON.stringify(R.squads.map(q => [q.leader, q.p.map(Math.round), q.alive])));
check(R.squads.length >= 3, `remnant squads placed (${R.squads.length})`);
check(
  R.squads.every(q => q.alive === 4),
  'every squad starts with 4 soldiers',
);
// talk to the first squad's leader, take the day's supplies
const q0 = R.squads[0];
await p.evaluate(q => window.__game.tp(q.p[0], q.p[1] + 0.2), q0);
await p.waitForTimeout(800);
const prompt = await p.evaluate(() => window.__game.remPrompt());
check(prompt.includes(q0.leader), `prompt names the leader (${prompt})`);
const a0 = await p.evaluate(() => window.__game.player.inv.a556n || 0);
await p.evaluate(() => window.__game.remTalk());
await p.waitForTimeout(300);
const dlgText = await p.evaluate(() => document.getElementById('dlg')?.textContent || '');
check(/沒有走|骨氣|退|旗|守/.test(dlgText), `heroic dialogue (${dlgText.slice(0, 60)}…)`);
await p.screenshot({ path: shot('v243-talk.png') });
const took = await p.evaluate(() => {
  const btn = [...document.querySelectorAll('#dlg button')].find(b => /補給|supplies/.test(b.textContent));
  btn?.click();
  return !!btn;
});
const a1 = await p.evaluate(() => window.__game.player.inv.a556n || 0);
check(took && a1 === a0 + 20, `daily supplies: +20 rounds of 5.56 (${a0} → ${a1})`);
await p.evaluate(() => window.__game.remTalk());
const again = await p.evaluate(
  () => ![...document.querySelectorAll('#dlg button')].some(b => /補給|supplies/.test(b.textContent)),
);
check(again, 'supplies only once per day');
await p.evaluate(() => [...document.querySelectorAll('#dlg button')].pop()?.click());

// a PLA soldier walks into their sights
const fight = await p.evaluate(async q => {
  const g = window.__game;
  const s = g.sols
    .filter(s => s.state !== 'dead')
    .sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
  // 16 m out along the street in front of the sandbags, still in the open
  let best = null;
  for (let a = 0; a < 16 && !best; a++) {
    const ang = (a / 16) * Math.PI * 2;
    const x = q.p[0] + Math.cos(ang) * 16,
      z = q.p[1] + Math.sin(ang) * 16;
    if (g.roadDist(x, z) < 2) best = [x, z];
  }
  best ||= [q.p[0] + 14, q.p[1]];
  s.pos.set(best[0], 0, best[1]);
  s.mesh.position.copy(s.pos);
  s.state = 'patrol';
  s.post = undefined;
  const hp0 = s.hp,
    shots0 = g.rem().stats.shots,
    hits0 = g.rem().stats.hits;
  // software WebGL runs a few frames a second (and dt is capped): keep him standing there until the squad has
  // fired a few times, up to a minute
  for (let i = 0; i < 120 && s.state !== 'dead' && g.rem().stats.hits === hits0; i++) {
    if (s.state !== 'dead') {
      s.pos.set(best[0], 0, best[1]);
      s.mesh.position.copy(s.pos);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return { hp0, hp: s.hp, state: s.state, shots: g.rem().stats.shots - shots0, hits: g.rem().stats.hits - hits0 };
}, q0);
console.log('  fight', JSON.stringify(fight));
check(fight.shots > 0, `the squad fires on a PLA soldier in sight (${fight.shots} shots)`);
check(
  fight.hits > 0 && (fight.hp < fight.hp0 || fight.state === 'dead'),
  `and hits him (hp ${fight.hp0} → ${fight.hp})`,
);
await p.screenshot({ path: shot('v243-fight.png') });

// the second position loses its last defender
const q1 = R.squads[1];
await p.evaluate(q => {
  const g = window.__game;
  g.tp(q.p[0] + 3, q.p[1] + 3);
  g.surv().rem[q.id].hp = [0, 0, 0, 0];
}, q1);
await p.waitForTimeout(1500);
const fell = await p.evaluate(q => {
  const g = window.__game;
  const sv = g.surv().rem[q.id];
  const crate = g.contNear?.();
  return { fallen: sv.fallen, crate: crate && crate.label, log: document.getElementById('log')?.textContent || '' };
}, q1);
check(fell.fallen === 1, 'the position falls when the last defender is down');
check(/戰至最後/.test(fell.log), 'the fall is told (fought to the very last)');
await p.evaluate(q => window.__game.tp(q.p[0], q.p[1] + 0.2), q1);
await p.waitForTimeout(400);
await p.evaluate(() => window.__game.remTalk());
const mem = await p.evaluate(() => document.getElementById('dlg')?.textContent || '');
check(/最後的陣地/.test(mem), 'memorial dialogue at the fallen position');
const crateLeft = await p.evaluate(id => window.__game.conts.some(c => c.id === 'remgear' + id), q1.id);
check(crateLeft, 'the fallen squad left its gear in a crate');
await p.screenshot({ path: shot('v243-fallen.png') });
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
