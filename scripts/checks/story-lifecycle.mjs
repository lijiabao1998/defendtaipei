// Dedicated story-debug integration check. Does not claim complete playable story.
import assert from 'node:assert/strict';
import { launch, preview, pickRole, shot } from '../lib.mjs';
const srv = process.env.URL ? null : await preview(4183);
const base = process.env.URL || srv.url;
let browser;
try {
  browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const ready = () => page.waitForFunction(() => window.__game?.save, null, { timeout: 600000 });
  // With software WebGL (CI runners, headless) the 3D scene behind the menus renders at about 1 fps, and a real
  // click waits for several frames before and after it is dispatched (about 30 s for 新遊戲 incl. its confirm
  // dialog). Real UI clicks therefore get a generous timeout instead of Playwright's default 30 s.
  const UI = { timeout: 300000 };
  await page.goto(base + '?storydebug=1', { waitUntil: 'commit' });
  await ready();
  await pickRole(page, { g: 'f' });
  await page.waitForFunction(() => window.__game.started(), null, { timeout: 120000 });
  const fired = await page.evaluate(() => window.__game.storyEvent('act1_siren_test'));
  assert.deepEqual(fired, { fired: true, saved: true });
  const progress = () => page.evaluate(() => JSON.parse(localStorage.getItem('defendtaipei-save-v1'))?.story);
  assert.deepEqual(await progress(), ['act1_siren_test']);
  await page.screenshot({ path: shot('story-debug-fired.png'), timeout: 120000 });
  await page.evaluate(() => sessionStorage.setItem('dt.autoload', '1'));
  await page.reload({ waitUntil: 'commit' });
  await ready();
  await page.waitForFunction(() => window.__game.started(), null, { timeout: 120000 });
  assert.equal((await page.evaluate(() => window.__game.storyEvent('act1_siren_test'))).fired, false);
  await page.screenshot({ path: shot('story-debug-restored-no-replay.png'), timeout: 120000 });
  await page.evaluate(() => sessionStorage.setItem('dt.autoload', '1'));
  await page.goto(base, { waitUntil: 'commit' });
  await ready();
  await page.waitForFunction(() => window.__game.started(), null, { timeout: 120000 });
  assert.equal(await page.evaluate(() => 'storyEvent' in window.__game), false);
  await page.evaluate(() => window.__game.save());
  assert.deepEqual(await progress(), ['act1_siren_test']);
  await page.screenshot({ path: shot('story-flag-off-preserves-save.png'), timeout: 120000 });
  await page.evaluate(() => sessionStorage.setItem('dt.autoload', '1'));
  await page.goto(base + '?storydebug=1', { waitUntil: 'commit' });
  await ready();
  await page.waitForFunction(() => window.__game.started(), null, { timeout: 120000 });
  // Exercise the real pause-menu return/reload and title-menu new-game route.
  // Calling __game.go twice in one document is not the supported restart lifecycle.
  assert.equal(await page.locator('#speed').count(), 1);
  page.on('dialog', dialog => dialog.accept());
  await page.keyboard.press('Escape');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'commit', timeout: 600000 }),
    page.locator('#pmenu [data-a="quit"]').click(UI),
  ]);
  await ready();
  assert.equal(await page.evaluate(() => window.__game.started()), false);
  assert.equal(await page.locator('#speed').count(), 0);
  // a save exists now, so 新遊戲 asks to overwrite it; the dialog handler above accepts
  await page.locator('#tmenu [data-a="new"]').click(UI);
  const previousSave = await page.evaluate(() => localStorage.getItem('defendtaipei-save-v1'));
  await page.locator('#gsel [data-x="f"]').click(UI);
  await page.locator('.ch[data-r="nurse"]').click(UI);
  await page.locator('#startgo').click(UI);
  await page.locator('#skipintro').check(UI);
  await page.locator('#startgo').click(UI);
  assert.equal(await page.evaluate(() => localStorage.getItem('defendtaipei-save-v1')), previousSave);
  await page.locator('#startgo').click(UI);
  await page.waitForFunction(() => window.__game.started(), null, { timeout: 120000 });
  assert.equal(await page.locator('#speed').count(), 1);
  assert.deepEqual(await page.evaluate(() => window.__game.storyEvent('act1_siren_test')), {
    fired: true,
    saved: true,
  });
  await page.screenshot({ path: shot('story-new-game-independent-progress.png'), timeout: 120000 });
  await page.evaluate(() => {
    // update applies passive regeneration before its death check; use a genuine lethal state.
    window.__game.player.hp = -1;
    window.__game.player.bleed = true;
  });
  await page.waitForFunction(() => document.getElementById('title')?.textContent?.includes('你陣亡了'), null, {
    timeout: 30000,
  });
  assert.equal(await page.evaluate(() => localStorage.getItem('defendtaipei-save-v1')), null);
  await page.screenshot({ path: shot('story-death-clears-save.png'), timeout: 120000 });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        'manual event save',
        'reload no replay',
        'flag-off preservation',
        'real pause/title new-game reset with one speed control',
        'death save removal',
      ],
      errors,
    }),
  );
} finally {
  await browser?.close();
  srv?.stop();
}
