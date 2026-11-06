// Verify that the alert bus routes the test chime separately from full and all-clear sirens.
import { launch, preview, pickRole, gameUrl, shot } from '../lib.mjs';
const srv = process.env.URL ? null : await preview(4182);
const url = gameUrl(process.env.URL || srv.url);
const b = await launch();
const ctx = await b.newContext();
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto(url, { waitUntil: 'commit' });
await pickRole(page, { g: 'f' });
await page.waitForFunction(() => window.__game?.audio, null, { timeout: 600000, polling: 1000 });
const r = await page.evaluate(async () => {
  const g = window.__game;
  const ac = g.audioFx.sfxCtx();
  await ac.resume();
  const st = () => ({ test: g.audio().alertTest || 0, sirens: g.radio().bc.sirens, active: g.radio().siren });
  const notes = [];
  const createOscillator = ac.createOscillator;
  ac.createOscillator = function () {
    const osc = createOscillator.call(this);
    const note = {};
    notes.push(note);
    const setFrequency = osc.frequency.setValueAtTime;
    osc.frequency.setValueAtTime = function (value, time) {
      note.frequency = value;
      return setFrequency.call(this, value, time);
    };
    const start = osc.start;
    osc.start = function (time) {
      note.start = time;
      note.type = osc.type;
      return start.call(this, time);
    };
    const stop = osc.stop;
    osc.stop = function (time) {
      note.stop = time;
      return stop.call(this, time);
    };
    return osc;
  };
  const before = st();
  g.siren('test');
  ac.createOscillator = createOscillator;
  const afterTest = st();
  g.siren('alert');
  const afterAlert = st();
  g.siren('clear');
  const afterClear = st();
  return { state: ac.state, before, notes, afterTest, afterAlert, afterClear };
});
const expected = [880, 660, 880];
const ok =
  r.state === 'running' &&
  r.afterTest.test === r.before.test + 1 &&
  r.afterTest.sirens === r.before.sirens &&
  r.notes.length === 3 &&
  r.notes.every(
    (n, i) => n.type === 'sine' && n.frequency === expected[i] && n.stop > n.start && n.stop - n.start < 0.5,
  ) &&
  r.notes[2].stop - r.notes[0].start < 1.5 &&
  r.afterAlert.sirens === r.before.sirens + 1 &&
  r.afterAlert.active &&
  r.afterClear.sirens === r.before.sirens + 2 &&
  r.afterClear.active &&
  r.afterClear.test === r.afterTest.test;
console.log(JSON.stringify({ ...r, errs, ok }, null, 2));
await page.screenshot({ path: shot('alert-routing-specialist.png'), timeout: 120000 });
await ctx.close();
await b.close();
srv?.stop();
process.exit(ok && !errs.length ? 0 : 1);
