// Pure Node regression checks: no browser, network, or real storage writes.
// Run: node scripts/checks/i18n.mjs
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const result = await build({
  stdin: {
    contents: `export * from './src/i18n';
      export * from './src/player/touchctl';
      export { ROLES } from './src/player/roles';
      export { ITEMS } from './src/systems/items';
      export { newSurv, survivorName, survivorRole } from './src/systems/survival';
      export { STORY_EVENTS } from './src/story/events/catalog';
      export { AM765 } from './src/story/broadcasts/am765';
      export { relation, mateLine, ruleName } from './src/npc/mates';`,
    resolveDir: root,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const code = result.outputFiles[0].text;
function boot(raw = null, options = {}) {
  const storage = new Map(raw === null ? [] : [['dt.settings', raw]]);
  const session = new Map();
  const writes = [],
    events = [],
    confirmations = [],
    alerts = [];
  let reloads = 0;
  const sandbox = {
    exports: {},
    module: { exports: {} },
    localStorage: {
      removeItem: key => storage.delete(key),
      getItem: key => {
        if (options.readFails) throw Error('Storage unavailable');
        return storage.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (options.writeFails) throw Error('Quota exceeded');
        writes.push([key, value]);
        storage.set(key, value);
      },
    },
    sessionStorage: {
      setItem: (key, value) => {
        if (options.sessionWriteFails) throw Error('Session storage unavailable');
        session.set(key, value);
      },
      getItem: key => session.get(key) ?? null,
    },
    confirm: message => {
      confirmations.push(message);
      return options.confirm !== false;
    },
    alert: message => alerts.push(message),
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        Object.assign(this, init);
        this.defaultPrevented = false;
      }
      preventDefault() {
        if (this.cancelable) this.defaultPrevented = true;
      }
    },
    dispatchEvent: event => {
      events.push(event);
      if (options.resume) event.detail.resume = true;
      if (options.cancelEvent) event.preventDefault();
      return !event.defaultPrevented;
    },
    location: { reload: () => reloads++ },
    document: { documentElement: { lang: '' } },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'i18n-test-bundle.cjs' });
  return {
    api: sandbox.module.exports,
    storage,
    session,
    writes,
    events,
    confirmations,
    alerts,
    sandbox,
    get reloads() {
      return reloads;
    },
  };
}
const plain = value => JSON.parse(JSON.stringify(value));
// Loading/title lifecycle without WebGL: both locales stay hidden until the
// title menu is ready, and revisiting that menu preserves a usable switcher.
for (const locale of ['zh-TW', 'en']) {
  const state = boot(JSON.stringify({ lang: locale, quality: 'low' }));
  const elements = new Map();
  const title = {
    firstChild: null,
    querySelector: () => null,
    insertBefore(element) {
      elements.set(element.id, element);
    },
  };
  elements.set('title', title);
  Object.assign(state.sandbox.document, {
    getElementById: id => elements.get(id) || null,
    createElement: () => ({ setAttribute() {} }),
  });
  state.api.showTitleLanguage(); // Safe before initialization / missing title.
  state.api.initTitleLanguage();
  const switcher = elements.get('title-language');
  assert.equal(switcher.hidden, true, `${locale}: hidden throughout loading`);
  assert.equal(switcher.value, locale, `${locale}: saved language preserved`);
  assert.equal(state.writes.length, 0, 'initialization never changes preferences');
  state.api.showTitleLanguage();
  assert.equal(switcher.hidden, false, `${locale}: visible when menu is ready`);
  state.api.showTitleLanguage();
  assert.equal(elements.get('title-language'), switcher, 'return to menu reuses switcher');
  switcher.value = locale === 'en' ? 'zh-TW' : 'en';
  switcher.onchange();
  assert.equal(state.reloads, 1, `${locale}: title language switching still reloads`);
  const saved = JSON.parse(state.storage.get('dt.settings'));
  assert.equal(saved.lang, switcher.value);
  assert.equal(saved.quality, 'low');
}
const zh = boot();
assert.equal(zh.api.getLanguage(), 'zh-TW');
assert.equal(zh.api.tr('中文', 'English'), '中文');
zh.api.initLanguage();
assert.equal(zh.sandbox.document.documentElement.lang, 'zh-Hant');
const en = boot('{"lang":"en"}');
assert.equal(en.api.getLanguage(), 'en');
assert.equal(en.api.tr('中文', 'English'), 'English');
en.api.initLanguage();
assert.equal(en.sandbox.document.documentElement.lang, 'en');
for (const raw of ['broken JSON', 'null', '123', '{"lang":"fr"}', '{"lang":true}', '{}']) {
  assert.equal(boot(raw).api.getLanguage(), 'zh-TW', `invalid locale falls back: ${raw}`);
}
assert.equal(boot(null, { readFails: true }).api.getLanguage(), 'zh-TW');
const declined = boot('{"master":0.3}', { confirm: false });
assert.equal(declined.api.requestLanguageChange('en'), false);
assert.equal(declined.reloads, 0);
assert.equal(declined.writes.length, 0);
assert.equal(declined.events.length, 0);
const canceled = boot('{"master":0.3}', { cancelEvent: true });
assert.equal(canceled.api.requestLanguageChange('en'), false);
assert.equal(canceled.events[0].type, 'dt:before-language-change');
assert.equal(canceled.events[0].defaultPrevented, true);
assert.equal(canceled.reloads, 0);
assert.equal(canceled.writes.length, 0);
const switched = boot('{"master":0.3,"quality":"low","custom":{"keep":true}}');
assert.equal(switched.api.requestLanguageChange('en'), true);
assert.equal(switched.reloads, 1);
assert.equal(switched.writes.length, 1);
assert.deepEqual(JSON.parse(switched.storage.get('dt.settings')), {
  master: 0.3,
  quality: 'low',
  custom: { keep: true },
  lang: 'en',
});
assert.equal(switched.events[0].detail.language, 'en');
assert.equal(switched.api.getLanguage(), 'zh-TW', 'locale remains fixed until the next page load');
assert.equal(en.api.requestLanguageChange('en'), true);
assert.equal(en.reloads, 0);
assert.equal(en.writes.length, 0);
assert.equal(en.confirmations.length, 0);
const unavailable = boot('{}', { writeFails: true });
assert.equal(unavailable.api.requestLanguageChange('en'), false);
assert.equal(unavailable.reloads, 0);
assert.equal(unavailable.alerts.length, 1);

const resume = boot('{"master":0.3}', { resume: true });
assert.equal(resume.api.requestLanguageChange('en'), true);
assert.equal(resume.session.get('dt.autoload'), '1');
assert.equal(resume.reloads, 1);
assert.equal(JSON.parse(resume.storage.get('dt.settings')).lang, 'en');
assert.equal(switched.session.has('dt.autoload'), false, 'title switch does not auto-resume');
for (const original of ['{"master":0.3,"quality":"low"}', null, 'broken JSON']) {
  const failedResume = boot(original, { resume: true, sessionWriteFails: true });
  assert.equal(failedResume.api.requestLanguageChange('en'), false);
  assert.equal(failedResume.reloads, 0);
  assert.equal(failedResume.storage.get('dt.settings') ?? null, original, 'restore exact previous settings');
  assert.equal(failedResume.session.has('dt.autoload'), false);
  assert.equal(failedResume.alerts.length, 1);
}
for (const corrupt of ['broken JSON', 'null', '123', '[]']) {
  const recovered = boot(corrupt);
  assert.equal(recovered.api.requestLanguageChange('en'), true);
  assert.equal(recovered.reloads, 1);
  assert.deepEqual(JSON.parse(recovered.storage.get('dt.settings')), { lang: 'en' });
}
for (const survivor of zh.api.newSurv().group) {
  const legacy = Object.freeze(plain(survivor));
  const original = JSON.stringify(legacy);
  const translated = en.api.newSurv().group.find(g => g.id === legacy.id);
  assert.equal(en.api.survivorName(legacy), translated.name);
  assert.equal(en.api.survivorRole(legacy), translated.role);
  assert.ok(!/\p{Script=Han}/u.test(en.api.survivorName(legacy)));
  assert.ok(!/\p{Script=Han}/u.test(en.api.survivorRole(legacy)));
  assert.equal(JSON.stringify(legacy), original, 'legacy survivor data remains unchanged');
}
// v24.40 the teammates: who they are to you and the fire rules have English of their own
for (const me of [
  { r: 'tech', g: 'm' },
  { r: 'student', g: 'f' },
  { r: 'office', g: 'f' },
])
  for (const R of en.api.ROLES)
    for (const g of ['m', 'f']) {
      if (R.id === me.r && g === me.g) continue;
      const m = { r: R.id, g };
      const line = en.api.mateLine(me, m, [me, m, { r: 'student', g: 'm' }]);
      assert.ok(!/\p{Script=Han}/u.test(line), `English teammate line: ${line}`);
    }
for (const r of [0, 1, 2]) assert.ok(!/\p{Script=Han}/u.test(en.api.ruleName(r)));
assert.equal(zh.api.relation({ r: 'student', g: 'f' }, { r: 'tech', g: 'm' }, []), '爸爸');
assert.equal(en.api.relation({ r: 'tech', g: 'm' }, { r: 'tech', g: 'f' }, [{ r: 'student', g: 'f' }]), 'wife');
assert.equal(zh.api.ctxLabel('[E] 救阿財（剩 45 秒）', 'E'), '救人');
assert.equal(en.api.ctxLabel('[E] Save A-Cai (45 s)', 'E'), 'Save');
const unknownSurvivor = Object.freeze({ id: 'custom', name: 'Custom name', role: 'Custom role' });
assert.equal(en.api.survivorName(unknownSurvivor), 'Custom name');
assert.equal(en.api.survivorRole(unknownSurvivor), 'Custom role');

const prompts = [
  ['Open door', 'Open'],
  ['Close door', 'Close'],
  ['Search', 'Search'],
  ['Climb to rooftop', 'Climb'],
  ['Go downstairs', 'Down'],
  ['Shelter', 'Shelter'],
  ['Shop', 'Trade'],
  ['Get off', 'Exit'],
  ['Ride', 'Ride'],
  ['Drive', 'Ride'],
  ['Inspect', 'Inspect'],
  ['搜刮', 'Search'],
  ['開門', 'Open'],
  ['下車', 'Exit'],
  ['Take the stairs down to the street', 'Down'],
  ['Insert coins: Drink vending machine', 'Trade'],
  ['Exit vehicle', 'Exit'],
  ['Ride the Monga Orange Line (choose destination)', 'Metro'],
];
for (const [prompt, expected] of prompts) {
  assert.equal(en.api.ctxLabel(`[Q] ${prompt}`, 'Q'), expected, prompt);
  assert.equal(en.api.ctxLabel(`[E] ${prompt}`, 'E'), expected, prompt);
}
assert.equal(en.api.ctxLabel('[E] Search', 'Q'), null, 'mismatched binding must not activate');
assert.equal(zh.api.ctxLabel('[Q] 搜刮', 'Q'), '搜');
assert.equal(en.api.ctxHint('[Q] Search | extra', 'Q'), 'Search');

for (const field of ['ROLES', 'STORY_EVENTS', 'AM765']) {
  assert.deepEqual(
    plain(en.api[field].map(x => x.id)),
    plain(zh.api[field].map(x => x.id)),
    `${field} IDs are locale-independent`,
  );
}
assert.deepEqual(Object.keys(en.api.ITEMS), Object.keys(zh.api.ITEMS), 'item IDs are locale-independent');
for (const role of en.api.ROLES) {
  assert.ok(role.name && !/\p{Script=Han}/u.test(role.name), `English role: ${role.id}`);
  const original = zh.api.ROLES.find(x => x.id === role.id);
  for (const field of ['spawn', 'dest', 'skills', 'inv'])
    assert.deepEqual(plain(role[field]), plain(original[field]), `${role.id}.${field} unchanged`);
}
for (const [id, item] of Object.entries(en.api.ITEMS)) {
  assert.ok(item.name && !/\p{Script=Han}/u.test(item.name), `English item: ${id}`);
  const { name, desc, cal, ...data } = item;
  const { name: originalName, desc: originalDesc, cal: originalCal, ...originalData } = zh.api.ITEMS[id];
  assert.deepEqual(plain(data), plain(originalData), `${id} gameplay data unchanged`);
}
console.log(
  'i18n checks passed: locale fallback, switching/cancellation/storage, 19 touch cases (default and rebound keys), resume rollback, corrupt settings recovery, legacy survivors, stable catalog IDs and gameplay data, English labels',
);
