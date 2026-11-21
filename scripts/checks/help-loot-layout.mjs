// Real Chromium gameplay/UI. Mobile cases emulate viewport/touch, not physical devices.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, preview, pickRole, shot } from '../lib.mjs';
const server = process.env.URL ? null : await preview(4185);
const results = { engine: 'Chromium', mobile: 'viewport/touch emulation', cases: [] };
let browser;
const keys = [
  'can',
  'noodle',
  'cupnoodle',
  'bento',
  'ration',
  'rice',
  'bread',
  'snack',
  'egg',
  'oden',
  'danbing',
  'chicken',
  'sausage',
  'pineapple',
  'water',
  'tea',
  'sport',
  'milktea',
  'coffee',
  'soymilk',
  'betel',
  'bandage',
  'pill',
  'tissue',
];
async function bounds(page, selector) {
  const data = await page.locator(selector).evaluate(e => {
    const r = e.getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
      overflow: e.scrollWidth > e.clientWidth + 1,
      viewport: [innerWidth, innerHeight],
    };
  });
  assert.ok(
    data.x >= -1 && data.y >= -1 && data.right <= data.viewport[0] + 1 && data.bottom <= data.viewport[1] + 1,
    `${selector} remains in viewport: ${JSON.stringify(data)}`,
  );
  assert.equal(data.overflow, false, `${selector} has no horizontal overflow`);
  return data;
}
async function screenshot(page, name, record) {
  const path = shot(`help-loot-${name}.png`);
  await page.screenshot({ path, timeout: 120000 });
  record.screenshots.push(path);
  console.log('captured', name);
  fs.writeFileSync(shot('help-loot-results.json'), JSON.stringify(results, null, 2));
}
async function help(page, mobile, lang, record) {
  await page.locator('[data-a="help"]:visible').click();
  assert.equal(await page.locator('#help-progress').textContent(), '1 / 3');
  assert.equal(await page.locator('#help-prev').isDisabled(), true);
  assert.equal(
    await page.locator('#help-heading').textContent(),
    mobile ? (lang === 'en' ? 'Touch controls' : '手機觸控') : lang === 'en' ? 'Movement & combat' : '移動與戰鬥',
  );
  await page.locator('#modal .mclose').focus();
  await page.keyboard.press('Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement.classList.contains('mx')),
    true,
    'help Tab wraps to header close',
  );
  await page.keyboard.press('Shift+Tab');
  assert.equal(
    await page.evaluate(() => document.activeElement.classList.contains('mclose')),
    true,
    'help Shift+Tab wraps to footer close',
  );
  for (let i = 0; i < 3; i++) {
    assert.equal(await page.locator('#help-progress').textContent(), `${i + 1} / 3`);
    const sizes = mobile
      ? [
          [390, 844],
          [320, 568],
          [844, 390],
        ]
      : [[1280, 800]];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await bounds(page, '#modal .mbox');
      await bounds(page, '#modal .help-nav');
      await bounds(page, '#modal .mclose');
      assert.equal(
        await page.locator('#help-content').evaluate(e => e.scrollWidth > e.clientWidth + 1),
        false,
        'help text has no horizontal overflow',
      );
      await screenshot(page, `${lang}-${mobile ? 'mobile' : 'desktop'}-page${i + 1}-${width}`, record);
    }
    if (i < 2) await page.locator('#help-next').click();
  }
  assert.equal(await page.locator('#help-next').isDisabled(), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#help-progress').textContent(), '3 / 3');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#help-progress').textContent(), '2 / 3');
  await page.locator('#help-prev').click();
  assert.equal(await page.locator('#help-progress').textContent(), '1 / 3');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#modal').count(), 0);
  await page.locator('[data-a="help"]:visible').click();
  assert.equal(await page.locator('#help-progress').textContent(), '1 / 3');
  if (mobile) {
    await page.goBack();
    await page.waitForSelector('#modal', { state: 'detached' });
  } else await page.locator('#modal .mclose').click();
}
async function fixture(page, inventory, loot, lang) {
  await page.evaluate(
    ({ inventory, loot, lang }) => {
      const g = window.__game;
      g.sols.forEach(s => {
        s.state = 'dead';
        s.mesh.visible = false;
      });
      // (v24.42 nothing from the sky either: half the time the nearest crate is out in the open where a recon drone
      // spots the player, and its shells killed them mid-check, three CI runs in a row; this checks the layout)
      for (const d of g.recon()?.list || []) ((d.cd = 1e9), (d.spot = 0));
      for (const c of g.heli()?.list || []) ((c.state = 'patrol'), (c.spot = -1e9));
      const p = g.contNear();
      if (!p) throw Error('No outdoor container available');
      const c = g.conts.find(c => c.p[0] === p[0] && c.p[1] === p[1]);
      c.items = loot;
      c.label = lang === 'en' ? 'Supply cache · long inventory layout check' : '街區物資箱・大量背包內容拾取測試';
      c.seen = 1;
      window.__layoutContainer = c;
      g.player.inv = inventory;
      g.player.equip = null;
      g.player.hp = 100;
      g.tp(c.p[0] + 0.01, c.p[1] + 0.01);
      g.setTime(12 * 60);
    },
    { inventory, loot, lang },
  );
  // The interact key goes to whatever is nearest of its own order (a door to open, someone to talk to) before a crate.
  // Now and then one of those is beside this crate, and the check used to wait two minutes for a panel that the key
  // had not been asked for: press again, as a player would, and say what the key did first.
  for (let i = 0; ; i++) {
    const hint = await page.evaluate(() => {
      const e = document.getElementById('prompt');
      return e && e.style.display !== 'none' ? e.textContent : '';
    });
    await page.keyboard.press('KeyE');
    try {
      await page.waitForSelector('#loot-items', { state: 'visible', timeout: i < 4 ? 5000 : 120000 });
      return;
    } catch (e) {
      if (i >= 4) throw e;
      const open = await page.evaluate(() => {
        const ids = ['shop', 'ride', 'surv', 'modal'].filter(k => document.getElementById(k));
        document.getElementById('shop')?.remove();
        document.getElementById('ride')?.remove();
        return ids.join(' ');
      });
      console.log(`   (the interact key did something else first; prompt "${hint}"; open: ${open || 'nothing'})`);
    }
  }
}
async function exercise(mobile, lang) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  await context.addInitScript(
    lang => localStorage.setItem('dt.settings', JSON.stringify({ quality: 'low', lang })),
    lang,
  );
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const record = { mobile, lang, screenshots: [], status: 'running' };
  results.cases.push(record);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  try {
    await page.goto(process.env.URL || server.url);
    await page.waitForFunction(() => typeof window.__newGame === 'function', null, { timeout: 600000 });
    await help(page, mobile, lang, record);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    await pickRole(page);
    await page.keyboard.press('Escape');
    const snapshot = () =>
      page.evaluate(() => ({
        inv: window.__game.player.inv,
        pos: window.__game.player.pos.toArray(),
        time: window.__game.gm(),
        hp: window.__game.player.hp,
      }));
    const before = await snapshot();
    await page.locator('#pmenu [data-a="help"]').click();
    await page.locator('#help-next').click();
    await page.locator('#modal .mx').click();
    assert.deepEqual(await snapshot(), before, 'help pagination/return preserves paused game state');
    await page.locator('#pmenu [data-a="go"]').click();
    await fixture(
      page,
      Object.fromEntries(keys.map(k => [k, 1])),
      { ...Object.fromEntries(keys.map(k => [k, 2])), qbz191: 1, vest: 1 },
      lang,
    );
    for (const [width, height] of mobile
      ? [
          [390, 844],
          [320, 568],
          [844, 390],
        ]
      : [[1280, 800]]) {
      await page.setViewportSize({ width, height });
      await bounds(page, '#panel');
      if (mobile) assert.equal(await page.locator('#menubtn').isVisible(), false, 'HUD menu cannot cover inventory');
      assert.equal(
        await page.locator('#inventory-items-title').evaluate(e => {
          const r = e.getBoundingClientRect();
          return [r.left + 3, r.left + r.width / 2, r.right - 3].every(x => {
            const top = document.elementFromPoint(x, r.top + r.height / 2);
            return top === e || e.contains(top);
          });
        }),
        true,
        'inventory title is not obscured by HUD controls',
      );
      await bounds(page, '#inventory-items');
      await bounds(page, '#loot-items');
      await bounds(page, '.inventory-actions');
      const widths = await page
        .locator('#panel .item-text')
        .evaluateAll(es => es.map(e => e.getBoundingClientRect().width));
      assert.ok(
        widths.every(w => w >= 100),
        'item text has readable width, not vertical single-character columns',
      );
      for (const id of ['inventory-items', 'loot-items']) {
        await page.locator(`#${id}`).evaluate(e => (e.scrollTop = e.scrollHeight));
        assert.ok(await page.locator(`#${id}`).evaluate(e => e.scrollTop > 0), `${id} scrolls independently`);
      }
      await bounds(page, '#inventory-close');
      await bounds(page, '#take-all');
      await screenshot(page, `${lang}-${mobile ? 'mobile' : 'desktop'}-full-loot-${width}`, record);
    }
    // Activate a visible medicine button with a real Enter key. Rerender keeps the OTHER list's reading position.
    const lootScroll = await page.locator('#loot-items').evaluate(e => e.scrollTop);
    await page.locator('[data-item="inventory-items:tissue"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(
      await page.evaluate(() => window.__game.player.inv.tissue || 0),
      0,
      'keyboard activates inventory item',
    );
    assert.ok(
      Math.abs((await page.locator('#loot-items').evaluate(e => e.scrollTop)) - lootScroll) <= 1,
      'using inventory preserves loot scroll',
    );
    await page.locator('#inventory-close').click();
    await fixture(page, { can: 100 }, { vest: 1 }, lang);
    await page.locator('#take-all').click();
    assert.equal(
      await page.evaluate(() => window.__layoutContainer.items.vest),
      1,
      'capacity rejection leaves loot untouched',
    );
    assert.equal(await page.evaluate(() => window.__game.player.inv.vest || 0), 0, 'capacity rejection adds nothing');
    await page.locator('#inventory-close').click();
    await fixture(page, {}, { pill: 2 }, lang);
    await page.locator('[data-item="loot-items:pill"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__game.player.inv.pill), 1, 'keyboard takes one item');
    await page.locator('#take-all').click();
    assert.equal(await page.evaluate(() => window.__game.player.inv.pill), 2, 'Take all transfers remaining stack');
    assert.equal(await page.locator('#take-all').isDisabled(), true, 'empty Take all disabled');
    await screenshot(page, `${lang}-${mobile ? 'mobile' : 'desktop'}-empty-loot`, record);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#panel').isVisible(), false);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#panel').isVisible(), true, 'inventory reopens');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#panel').isVisible(), true, 'Tab navigates panel rather than closing it');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, [], 'no page errors');
    record.status = 'passed';
  } catch (error) {
    record.status = 'failed';
    record.error = String(error);
    await screenshot(page, `${lang}-${mobile ? 'mobile' : 'desktop'}-failure`, record).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
try {
  browser = await launch();
  const mobileCases = process.env.HELP_DEVICE ? [process.env.HELP_DEVICE === 'mobile'] : [true, false];
  const languages = process.env.HELP_LANG ? [process.env.HELP_LANG] : ['zh-TW', 'en'];
  for (const mobile of mobileCases) for (const lang of languages) await exercise(mobile, lang);
  console.log(
    'PASS: help pagination and inventory/loot layout, 2 languages, mobile/desktop, keyboard, capacity and state preservation',
  );
} finally {
  fs.writeFileSync(shot('help-loot-results.json'), JSON.stringify(results, null, 2));
  await browser?.close();
  server?.stop();
}
