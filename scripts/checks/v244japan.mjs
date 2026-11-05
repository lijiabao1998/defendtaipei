// v24.4 日本支援: the Japanese expat knows where the JSDF liaison hides; the liaison hands over a field radio;
// one battery per call: a C-2 airdrop (crate on a parachute with JSDF weapons and rations), an F-2 strike on the
// densest PLA group 18–150 m away, an AH-64DJ that circles and fires on PLA soldiers. No battery, no call.
// Aircraft are advanced with the jpTick hook so the check does not wait on software WebGL frame rates.
// argv: [url] (default: vite preview).
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.argv[2] || process.env.URL ? null : await preview(4191);
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
await pickRole(p, { g: 'm', role: 'jp', skipIntro: true });
await p.evaluate(() => window.__game.setMin(11 * 60));
await p.waitForTimeout(1500);
const j0 = await p.evaluate(() => ({
  role: window.__game.role().id,
  jp: window.__game.jp(),
  known: window.__game.surv().jpKnown,
  bat: window.__game.player.inv.battery || 0,
}));
console.log('  ', JSON.stringify(j0));
check(j0.role === 'jp', 'playable Japanese expat role');
check(!!j0.jp?.liaison, 'the JSDF liaison is placed');
check(j0.known === 1, 'the Japanese role knows where he is from the start');
// talk: field radio + 2 batteries
await p.evaluate(q => window.__game.tp(q[0], q[1] + 0.8), j0.jp.liaison);
await p.waitForTimeout(500);
await p.evaluate(() => window.__game.jpTalk());
const t1 = await p.evaluate(() => ({
  radio: window.__game.player.inv.jpradio || 0,
  bat: window.__game.player.inv.battery || 0,
  dlg: document.getElementById('dlg')?.textContent || '',
}));
check(t1.radio === 1 && t1.bat === j0.bat + 2, `liaison gives the radio and 2 batteries (${t1.bat})`);
check(/自衛隊|日本/.test(t1.dlg), 'liaison dialogue');
await p.evaluate(() => [...document.querySelectorAll('#dlg button')].pop()?.click());
// airdrop
const drop = await p.evaluate(() => {
  const g = window.__game;
  const ok = g.jpCall('drop');
  g.jpTick(12);
  return { ok, crafts: g.jp().crafts };
});
await p.waitForTimeout(400);
await p.screenshot({ path: shot('v244-c2.png') });
const landed = await p.evaluate(() => {
  const g = window.__game;
  g.jpTick(14);
  const c = g.conts.find(c => c.id.startsWith('jpdrop'));
  return { stats: g.jp().stats, items: c && c.items, label: c && c.label, bat: g.player.inv.battery || 0 };
});
console.log('  drop', JSON.stringify(landed));
check(drop.ok && landed.stats.landed === 1, 'C-2 passes and the crate lands');
check(
  !!landed.items &&
    (landed.items.type20 || landed.items.type89) &&
    landed.items.a556n >= 60 &&
    landed.items.jsdfration >= 3,
  'crate holds a JSDF rifle, 5.56 rounds and field rations',
);
check(landed.bat === t1.bat - 1, 'the call used one battery');
// strike: three PLA soldiers grouped 45 m away
const strike = await p.evaluate(async () => {
  const g = window.__game,
    P = g.player.pos;
  const ss = g.sols.filter(s => s.state !== 'dead').slice(0, 3);
  ss.forEach((s, i) => {
    s.pos.set(P.x + 45 + i * 2, 0, P.z + 3);
    s.mesh.position.copy(s.pos);
    s.state = 'patrol';
  });
  const hp0 = ss.map(s => s.hp);
  const ok = g.jpCall('strike');
  g.jpTick(8);
  await new Promise(r => setTimeout(r, 1200)); // the three bombs fall 0.25–0.7 s after release
  return { ok, hp0, hp: ss.map(s => s.hp), dead: ss.filter(s => s.state === 'dead').length, stats: g.jp().stats };
});
console.log('  strike', JSON.stringify(strike));
check(strike.ok && strike.stats.bombs === 3, 'F-2 strike drops three bombs');
check(strike.dead >= 2, `the grouped soldiers are hit (${strike.dead}/3 dead)`);
// gunship: a soldier 20 m away
const heli = await p.evaluate(() => {
  const g = window.__game,
    P = g.player.pos;
  const s = g.sols.filter(s => s.state !== 'dead')[0];
  s.pos.set(P.x - 20, 0, P.z + 6);
  s.mesh.position.copy(s.pos);
  const hp0 = s.hp;
  const ok = g.jpCall('heli');
  g.jpTick(9);
  return { ok, hp0 };
});
await p.waitForTimeout(300);
await p.screenshot({ path: shot('v244-heli.png') });
const heli2 = await p.evaluate(() => {
  const g = window.__game;
  g.jpTick(20);
  return g.jp().stats;
});
console.log('  heli', JSON.stringify(heli2));
check(heli.ok && heli2.heliShots > 0 && heli2.heliHits > 0, 'AH-64DJ fires on PLA soldiers and hits');
// no battery: refused
const dead = await p.evaluate(() => {
  const g = window.__game;
  delete g.player.inv.battery;
  return g.jpCall('heli');
});
check(dead === false, 'no battery, no call');
console.log('errors:', errs.length, errs.slice(0, 3));
await b.close();
srv?.stop();
process.exit(failed.length || errs.length ? 1 : 0);
