// Actual Chromium UI regression. Build first: npm run build
// Run: node scripts/checks/english-browser.mjs
// URL, PW_CHROMIUM and SHOTS_DIR follow scripts/lib.mjs. Mobile is Chromium
// viewport/touch emulation, NOT an actual phone or Safari verification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, shot, pickRole, preview } from '../lib.mjs';

let server;
let browser;
const results = { status: 'running', engine: 'Chromium', mobile: 'viewport/touch emulation', cases: [] };
const errors = [];
const timeout = Number(process.env.ENGLISH_TIMEOUT_MS || 600000);
async function ready(page) {
  await page.waitForFunction(() => typeof window.__newGame === 'function', null, { timeout, polling: 500 });
}
async function capture(page, name) {
  const path = shot(`english-${name}.png`);
  await page.screenshot({ path, timeout: 120000 });
  return path;
}
async function exercise(options, name) {
  const context = await browser.newContext(options);
  // Software WebGL is very slow on CI. Low graphics keeps this language/layout
  // check responsive without bypassing the real controls or locale defaults.
  await context.addInitScript(() => {
    if (!localStorage.getItem('dt.settings')) localStorage.setItem('dt.settings', JSON.stringify({ quality: 'low' }));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const record = { name, graphicsQuality: 'low', viewport: options.viewport, screenshots: [], status: 'running' };
  results.cases.push(record);
  page.on('pageerror', error => errors.push(`${name}: ${error}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`${name}: ${message.text()}`);
  });
  try {
    // Hold the real map request so the loading layout is measured deterministically. (v24.37 with its data version
    // in the query: the pattern takes it)
    let releaseLoading;
    const loadingGate = new Promise(resolve => (releaseLoading = resolve));
    await page.route('**/data/wanhua.json*', async route => {
      await loadingGate;
      await route.continue();
    });
    await page.goto(process.env.URL || server.url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('#title-language').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#title-language').isVisible(), false, 'loading hides language selector');
    if (options.hasTouch) {
      for (const [label, viewport] of [
        ['portrait', options.viewport],
        ['short', { width: 360, height: 640 }],
        ['landscape', { width: 844, height: 390 }],
      ]) {
        await page.setViewportSize(viewport);
        const layout = await page.evaluate(() => {
          const title = document.getElementById('title');
          const top = document.getElementById('logo').getBoundingClientRect().top;
          const bottom = document.getElementById('loadmsg').getBoundingClientRect().bottom;
          return {
            width: innerWidth,
            height: innerHeight,
            top,
            bottom,
            center: (top + bottom) / 2,
            titleHeight: title.getBoundingClientRect().height,
            justify: getComputedStyle(title).justifyContent,
            horizontalOverflow: title.scrollWidth > title.clientWidth,
          };
        });
        assert.equal(layout.justify, 'center', `${label}: loading is centred`);
        assert.ok(Math.abs(layout.center - layout.height / 2) < 3, `${label}: visual group is centred`);
        assert.ok(Math.abs(layout.titleHeight - layout.height) < 2, `${label}: full viewport`);
        assert.ok(layout.top >= 0 && layout.bottom <= layout.height, `${label}: content stays visible`);
        assert.equal(layout.horizontalOverflow, false, `${label}: no horizontal clipping`);
        record[`loading-${label}`] = layout;
        record.screenshots.push(await capture(page, `${name}-loading-${label}`));
      }
      await page.setViewportSize(options.viewport);
    }
    releaseLoading();
    await ready(page);
    assert.equal(await page.locator('#title').getAttribute('data-loading'), null, 'ready exits loading layout');
    assert.equal(
      await page.locator('html').getAttribute('lang'),
      'zh-Hant',
      'fresh context defaults to Traditional Chinese',
    );
    const language = page.locator('#title-language');
    await language.waitFor({ state: 'visible' });
    assert.equal(await language.inputValue(), 'zh-TW');
    assert.equal(await language.locator('option[value="en"]').textContent(), 'English');
    assert.equal(await language.locator('option[value="en"]').isEnabled(), true);

    await page.locator('#tmenu [data-a="new"]').click();
    assert.equal(
      await page.locator('#title').evaluate(element => getComputedStyle(element).justifyContent),
      'flex-start',
      'role selection remains top-aligned',
    );
    record.screenshots.push(await capture(page, `${name}-roles-top`));
    const cards = await page.locator('#charsel').evaluate(el => {
      const boxes = [...el.children].map(card => card.getBoundingClientRect());
      const detail = document.getElementById('selection-role-detail').getBoundingClientRect();
      const grid = el.getBoundingClientRect();
      return {
        columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
        heights: boxes.map(box => box.height),
        widths: boxes.map(box => box.width),
        grid: { right: grid.right, bottom: grid.bottom },
        detail: { left: detail.left, top: detail.top },
      };
    });
    assert.equal(cards.columns, options.hasTouch ? 2 : 3, 'device-specific block grid');
    assert.ok(Math.max(...cards.heights) - Math.min(...cards.heights) < 1, 'equal-height character tiles');
    assert.ok(
      options.hasTouch ? cards.detail.top >= cards.grid.bottom : cards.detail.left >= cards.grid.right,
      'profile card is below on phone and beside on desktop',
    );
    if (!options.hasTouch) {
      const footerTop = await page.locator('#startbar').evaluate(el => el.getBoundingClientRect().top);
      assert.ok(cards.grid.bottom < footerTop, 'desktop character rows stay above fixed navigation');
    }
    record.selectionCards = cards;
    if (options.hasTouch) {
      await page.locator('#selection-role-detail').scrollIntoViewIfNeeded();
      record.screenshots.push(await capture(page, `${name}-role-profile`));
      await page.locator('#title').evaluate(el => (el.scrollTop = 0));
    }

    assert.equal(await page.locator('#btns').getAttribute('data-step'), '0');
    assert.equal(await page.locator('#daylen').isVisible(), false);
    const oldSave = await page.evaluate(() => localStorage.getItem('defendtaipei-save-v1'));
    await page.locator('#gsel [data-x="f"]').click();
    await page.locator('.ch[data-r="nurse"]').click();
    assert.equal(await page.evaluate(() => window.__game.started()), false, 'card selection never starts game');
    await page.locator('#startgo').click();
    assert.equal(await page.locator('#btns').getAttribute('data-step'), '1');
    assert.equal(
      await page.locator('#charsel').isVisible(),
      false,
      'roles hide during preferences, including portrait',
    );
    await page.locator('#daylen [data-h="2"]').click();
    await page.locator('#skipintro').check();
    record.screenshots.push(await capture(page, `${name}-stage-settings`));
    await page.locator('#startgo').click();
    assert.equal(await page.locator('#btns').getAttribute('data-step'), '2');
    assert.match(await page.locator('#selection-summary').innerText(), /2 小時/);
    record.screenshots.push(await capture(page, `${name}-stage-confirm`));
    if (options.hasTouch) {
      await page.locator('.selection-departure').scrollIntoViewIfNeeded();
      record.screenshots.push(await capture(page, `${name}-stage-confirm-details`));
    }

    await page.locator('#selection-previous').click();
    assert.equal(await page.locator('#skipintro').isChecked(), true);
    await page.locator('#selection-previous').click();
    assert.equal(await page.locator('.ch[data-r="nurse"]').getAttribute('aria-pressed'), 'true');
    assert.equal(
      await page.evaluate(() => localStorage.getItem('defendtaipei-save-v1')),
      oldSave,
      'navigation preserves save',
    );
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);

    await page.locator('#selback').click();
    await language.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#title').getAttribute('data-loading'), null, 'return never re-enters loading');

    // Exercise a real select change and native confirmation, not a storage shortcut.
    const navigation = page.waitForEvent('framenavigated', {
      predicate: frame => frame === page.mainFrame(),
      timeout: 120000,
    });
    const dialogHandled = new Promise((resolve, reject) => {
      page.once('dialog', dialog => {
        if (dialog.type() !== 'confirm') {
          dialog.dismiss().then(() => reject(new Error(`Unexpected ${dialog.type()} dialog`)), reject);
          return;
        }
        dialog.accept().then(resolve, reject);
      });
    });
    await Promise.all([navigation, dialogHandled, language.selectOption('en')]);
    await ready(page);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await page.locator('#title-language').inputValue(), 'en');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dt.settings')).lang), 'en');
    assert.equal((await page.locator('#title h1').innerText()).trim(), 'Defend Taipei');
    assert.equal((await page.locator('#tmenu [data-a="new"]').innerText()).trim(), 'New game');
    assert.equal((await page.locator('#tmenu [data-a="set"]').innerText()).trim(), 'Settings');
    record.screenshots.push(await capture(page, `${name}-title`));

    await page.locator('#tmenu [data-a="set"]').click();
    await page.locator('#modal').waitFor({ state: 'visible' });
    assert.match(await page.locator('#modal h3').innerText(), /Settings/);
    assert.equal(await page.locator('#slang').inputValue(), 'en');
    record.screenshots.push(await capture(page, `${name}-settings`));
    // Touch UI intentionally collapses external keyboard bindings. Exercise its
    // visible disclosure before asserting text inside it.
    if (options.hasTouch) await page.locator('#modal .kdet > summary').click();
    assert.match(await page.locator('#kmsg').innerText(), /Click a binding/);
    assert.match(await page.locator('#klist').innerText(), /Move forward/);
    if (options.hasTouch) record.screenshots.push(await capture(page, `${name}-settings-keyboard`));
    await page.locator('#modal .mx').click();
    await page.locator('#modal').waitFor({ state: 'detached' });

    await pickRole(page, { g: 'f', role: 'nurse', skipIntro: true });
    await page.waitForFunction(() => window.__game?.started?.() && !document.getElementById('wake'), null, {
      timeout,
      polling: 500,
    });
    await page.waitForFunction(() => document.getElementById('stats')?.textContent.includes('Health'), null, {
      timeout,
    });
    const hud = await page.locator('#stats').innerText();
    assert.match(hud, /Health/);
    assert.doesNotMatch(hud, /生命|飢餓|口渴|精神/);
    record.hud = hud;
    if (options.hasTouch) {
      record.touchLabels = await page.evaluate(() =>
        ['pbact', 'pbsec'].map(id => {
          const button = document.getElementById(id);
          const range = document.createRange();
          range.selectNodeContents(button);
          const text = range.getBoundingClientRect();
          const box = button.getBoundingClientRect();
          return {
            id,
            label: button.textContent,
            textWidth: text.width,
            textHeight: text.height,
            width: box.width,
            height: box.height,
          };
        }),
      );
      for (const label of record.touchLabels) {
        assert.ok(label.textWidth <= label.width - 8, `${label.id} label fits horizontally`);
        assert.ok(label.textHeight <= label.height - 8, `${label.id} label fits vertically`);
      }
    }
    record.screenshots.push(await capture(page, `${name}-hud`));
    if (options.hasTouch) {
      await page.locator('#menubtn').tap();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.locator('#pmenu').waitFor({ state: 'visible' });
    assert.match(await page.locator('#pmenu .phead').innerText(), /Paused/);
    assert.equal((await page.locator('#pmenu [data-a="set"]').innerText()).trim(), 'Settings');
    assert.equal((await page.locator('#pmenu [data-a="inv"]').innerText()).trim(), 'Inventory');
    record.screenshots.push(await capture(page, `${name}-pause`));
    record.status = 'passed';
  } catch (error) {
    record.status = 'failed';
    record.error = String(error.stack || error);
    await capture(page, `${name}-failure`)
      .then(path => record.screenshots.push(path))
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
try {
  if (!process.env.URL) server = await preview(4187);
  browser = await launch();
  await exercise({ viewport: { width: 1280, height: 800 } }, 'desktop');
  await exercise({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, 'mobile');
  assert.deepEqual(errors, [], 'no page or console errors');
  results.status = 'passed';
  console.log('English Chromium UI checks passed (desktop + emulated mobile).');
} catch (error) {
  results.status = 'failed';
  results.error = String(error.stack || error);
  console.error(results.error);
  process.exitCode = 1;
} finally {
  results.errors = errors;
  await browser?.close();
  server?.stop();
  fs.writeFileSync(shot('english-results.json'), JSON.stringify(results, null, 2) + '\n');
}
