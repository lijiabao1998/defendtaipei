import { tr, getLanguage, requestLanguageChange } from '../i18n';
// v22.4 shared modal screens: 設定 (volume / 畫質 / language / sensitivity / vibration / key rebinding),
// 操作說明 and 製作名單. Used from the title menu and the in-game pause menu.
import { SET, saveSettings, ACTIONS, BIND, keyName, rebind, resetKeys, applyBtnSize, type Quality } from './settings';
import { VERSION } from '../core/version';
import { MATES_ON } from '../debug/flags';

/** touch device (phone / tablet): no Esc key, no mouse */
export const TOUCH =
  typeof matchMedia !== 'undefined' && (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window);

// ---- v22.7.1 Android back button: every overlay we open pushes a history entry; Back pops the top overlay
let hDepth = 0,
  hSkip = 0;
let onBack: () => void = () => {};
export const setBackHandler = (f: () => void) => (onBack = f);
export function histPush() {
  if (!TOUCH) return;
  hDepth++;
  history.pushState({ dtOverlay: hDepth }, '');
}
/** call when an overlay is closed from the UI (not by Back) so the extra history entry is dropped */
export function histPop() {
  if (!TOUCH || hDepth <= 0) return;
  hDepth--;
  hSkip++;
  history.back();
}
addEventListener('popstate', () => {
  if (hSkip > 0) return void hSkip--;
  if (hDepth <= 0) return;
  hDepth--;
  onBack();
});

let modal: HTMLElement | null = null;
let modalReturnFocus: HTMLElement | null = null;
let capture: ((e: KeyboardEvent) => void) | null = null;
export const modalOpen = () => !!modal;
/** fromBack: closed by the Android Back button (history entry already gone) */
export function closeModal(fromBack = false) {
  if (capture) (removeEventListener('keydown', capture, true), (capture = null));
  if (!modal) return;
  modal.remove();
  modal = null;
  modalReturnFocus?.focus({ preventScroll: true });
  modalReturnFocus = null;
  if (!fromBack) histPop();
}
function open(title: string, html: string) {
  const had = !!modal;
  if (!had) modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (had) {
    if (capture) (removeEventListener('keydown', capture, true), (capture = null));
    modal!.remove();
  }
  modal = document.createElement('div');
  modal.id = 'modal';
  modal.innerHTML =
    `<div class="mbox"><div class="mhead"><h3>${title}</h3><button class="mx" aria-label="${tr('返回', 'Back')}">✕ ${tr('返回', 'Back')}</button></div>` +
    `<div class="mbody">${html}</div><button class="mclose">${tr('返回', 'Back')}${TOUCH ? '' : tr('（Esc）', ' (Esc)')}</button></div>`;
  (modal.querySelector('.mclose') as HTMLElement).onclick = () => closeModal();
  (modal.querySelector('.mx') as HTMLElement).onclick = () => closeModal();
  // tap on the backdrop (outside the box) closes
  modal.addEventListener('click', e => e.target === modal && closeModal());
  document.body.appendChild(modal);
  if (!had) histPush();
  return modal;
}
/** v23.1 generic read-only panel (收音機紀錄) */
export const openPanel = (title: string, html: string) => open(title, html);
const pct = (v: number) => Math.round(v * 100);

export function openSettings() {
  const sl = (k: 'master' | 'sfx' | 'music' | 'radio', t: string) =>
    `<label class="srow"><span>${t}</span><input type="range" min="0" max="100" data-k="${k}" value="${pct(SET[k])}"><i>${pct(SET[k])}</i></label>`;
  const m = open(
    tr('⚙ 設定', '⚙ Settings'),
    `<h4>${tr('音量', 'Volume')}</h4>${sl('master', tr('主音量', 'Master volume'))}${sl('sfx', tr('音效', 'Sound effects'))}${sl('music', tr('環境音／音樂', 'Ambience / music'))}${sl('radio', tr('廣播', 'Radio'))}
    <label class="srow"><span>${tr('廣播語音', 'Spoken radio')}</span><input type="checkbox" id="svoice"${SET.voice ? ' checked' : ''}><i>${tr('收音機廣播以合成語音朗讀', 'Read radio broadcasts aloud using text-to-speech')}</i></label>
    <h4>${tr('畫面', 'Display')}</h4><label class="srow"><span>${tr('畫質', 'Graphics quality')}</span><select id="squal">${(
      ['low', 'med', 'high'] as Quality[]
    )
      .map(
        q =>
          `<option value="${q}"${SET.quality === q ? ' selected' : ''}>${{ low: tr('低', 'Low'), med: tr('中', 'Medium'), high: tr('高', 'High') }[q]}</option>`,
      )
      .join(
        '',
      )}</select><i>${tr('材質解析度於重新載入後生效', 'Texture resolution changes take effect after reloading')}</i></label>
    <label class="srow"><span>${tr('語言', 'Language')}</span><select id="slang"><option value="zh-TW"${SET.lang === 'zh-TW' ? ' selected' : ''}>繁體中文</option><option value="en"${SET.lang === 'en' ? ' selected' : ''}>English</option></select></label>
    <h4>${tr('操作', 'Controls')}</h4>${
      TOUCH
        ? `<label class="srow"><span>${tr('震動回饋', 'Haptic feedback')}</span><input type="checkbox" id="svib"${SET.vib ? ' checked' : ''}></label>
    <label class="srow"><span>${tr('按鈕大小', 'Button size')}</span><select id="sbtn">${[
      [0.85, tr('小', 'Small')],
      [1, tr('標準', 'Standard')],
      [1.1, tr('大', 'Large')],
    ]
      .map(([v, t]) => `<option value="${v}"${SET.btn === v ? ' selected' : ''}>${t}</option>`)
      .join('')}</select></label>
    <details class="kdet"><summary>${tr('外接鍵盤／滑鼠設定', 'External keyboard / mouse settings')}</summary>`
        : ''
    }<label class="srow"><span>${tr('滑鼠靈敏度', 'Mouse sensitivity')}</span><input type="range" min="25" max="300" id="ssens" value="${pct(SET.sens)}"><i>${pct(SET.sens)}%</i></label>
    ${TOUCH ? '' : `<label class="srow"><span>${tr('震動（手機）', 'Vibration (mobile)')}</span><input type="checkbox" id="svib"${SET.vib ? ' checked' : ''}></label>`}
    <h4>${tr('按鍵設定 ', 'Key bindings ')}<button id="kreset">${tr('恢復預設', 'Reset to defaults')}</button></h4><em id="kmsg">${tr('點按鍵再按下新的鍵；Esc 取消。重複的鍵會自動互換。', 'Click a binding, then press a new key. Esc cancels. Duplicate bindings are swapped automatically.')}</em><div id="klist"></div>${
      TOUCH ? '</details>' : ''
    }`,
  );
  m.querySelectorAll('input[type=range][data-k]').forEach(el => {
    const i = el as HTMLInputElement;
    i.oninput = () => {
      SET[i.dataset.k as 'master'] = +i.value / 100;
      (i.nextElementSibling as HTMLElement).textContent = i.value;
      saveSettings();
    };
  });
  (m.querySelector('#squal') as HTMLSelectElement).onchange = e => {
    SET.quality = (e.target as HTMLSelectElement).value as Quality;
    saveSettings();
  };
  const language = m.querySelector('#slang') as HTMLSelectElement;
  language.onchange = () => {
    if (!requestLanguageChange(language.value)) language.value = getLanguage();
  };
  const sens = m.querySelector('#ssens') as HTMLInputElement;
  sens.oninput = () => {
    SET.sens = +sens.value / 100;
    (sens.nextElementSibling as HTMLElement).textContent = sens.value + '%';
    saveSettings();
  };
  (m.querySelector('#svoice') as HTMLInputElement).onchange = e => {
    SET.voice = (e.target as HTMLInputElement).checked;
    saveSettings();
    if (!SET.voice) speechSynthesis?.cancel();
  };
  (m.querySelector('#svib') as HTMLInputElement).onchange = e => {
    SET.vib = (e.target as HTMLInputElement).checked;
    saveSettings();
  };
  const sb = m.querySelector('#sbtn') as HTMLSelectElement | null;
  if (sb)
    sb.onchange = () => {
      SET.btn = +sb.value;
      saveSettings();
      applyBtnSize();
    };
  const msg = m.querySelector('#kmsg') as HTMLElement;
  const draw = () => {
    const kl = m.querySelector('#klist') as HTMLElement;
    kl.innerHTML = ACTIONS.map(
      ([a, t]) => `<div class="krow"><span>${t}</span><button data-a="${a}">${keyName(BIND[a])}</button></div>`,
    ).join('');
    kl.querySelectorAll('button').forEach(
      b =>
        ((b as HTMLElement).onclick = () => {
          if (capture) return;
          b.textContent = tr('按下新按鍵…', 'Press a new key…');
          b.classList.add('wait');
          capture = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            removeEventListener('keydown', capture!, true);
            capture = null;
            if (e.code !== 'Escape') {
              const a = (b as HTMLElement).dataset.a!;
              const sw = rebind(a, e.code);
              const lab = (x: string) => ACTIONS.find(q => q[0] === x)?.[1] ?? tr('隊友', 'Companions');
              msg.textContent = sw?.startsWith('!')
                ? tr(
                    `${keyName(e.code)} 已經是「${lab(sw.slice(1))}」的按鍵，先把那一項換成別的鍵。`,
                    `${keyName(e.code)} is already “${lab(sw.slice(1))}”. Give that one another key first.`,
                  )
                : sw
                  ? tr(
                      `${keyName(e.code)} 原本是「${lab(sw)}」，已與「${lab(a)}」互換。`,
                      `${keyName(e.code)} was assigned to “${lab(sw)}”; swapped with “${lab(a)}”.`,
                    )
                  : tr(`「${lab(a)}」= ${keyName(e.code)}`, `“${lab(a)}” = ${keyName(e.code)}`);
            }
            draw();
          };
          addEventListener('keydown', capture, true);
        }),
    );
  };
  (m.querySelector('#kreset') as HTMLElement).onclick = () => {
    resetKeys();
    msg.textContent = tr('已恢復預設按鍵。', 'Default key bindings restored.');
    draw();
  };
  draw();
}

export function openHelp() {
  const table = (ids: string[]) =>
    '<table class="ktab">' +
    ACTIONS.filter(([a]) => ids.includes(a))
      .map(([a, label]) => `<tr><td>${keyName(BIND[a])}</td><td>${label}</td></tr>`)
      .join('') +
    '</table>';
  const movement = {
    title: tr('移動與戰鬥', 'Movement & combat'),
    html:
      table(['up', 'down', 'left', 'right', 'sprint', 'sneak', 'cover', 'vault', 'shove']) +
      `<table class="ktab"><tr><td>${tr('滑鼠', 'Mouse')}</td><td>${tr('瞄準；左鍵攻擊／射擊；滾輪縮放', 'Aim; left click to attack / fire; wheel to zoom')}</td></tr></table>`,
  };
  const survival = {
    title: tr('搜刮與生存', 'Loot & survival'),
    html:
      table([
        'interact',
        'inv',
        'map',
        'shelter',
        'barricade',
        'sleep',
        'light',
        'speed1',
        'speed2',
        'speed3',
        'mates',
      ]) +
      `<p class="mnote">${tr('按 Esc 關閉視窗／開啟暫停選單。按鍵可在「設定 → 按鍵設定」更改。', 'Press Esc to close a window / open the pause menu. Change bindings under Settings → Key bindings.')}</p>`,
  };
  const mobile = {
    title: tr('手機觸控', 'Touch controls'),
    html: `<table class="ktab"><tr><th colspan="2">${tr('手機', 'Mobile')}</th></tr><tr><td>${tr('左下搖桿', 'Bottom-left joystick')}</td><td>${tr('移動（推到底奔跑）', 'Move (push all the way to sprint)')}</td></tr><tr><td>${tr('大圓鈕', 'Large round button')}</td><td>${tr('打（按住連續攻擊）；靠近可互動的東西時變成 搜／開門／爬上／上車…，點一下互動、長按攻擊；狙擊槍時是「瞄」：按住開鏡、拖曳瞄準、放開射擊', 'Attack (hold to attack repeatedly). Near interactable objects, this changes to Search / Open / Climb / Enter… Tap to interact; hold to attack. With a sniper rifle, it becomes Aim: hold to scope in, drag to aim, and release to fire.')}</td></tr><tr><td>${tr('蹲', 'Crouch')}</td><td>${tr('貼牆掩體或潛行；再點起身；長按撤退；開鏡時 ✕ 關鏡', 'Take cover against a wall or sneak. Tap again to stand; hold to retreat. While scoped in, tap ✕ to exit the scope.')}</td></tr><tr><td>${tr('武器欄 ⇄', 'Weapon bar ⇄')}</td><td>${tr('切換武器', 'Switch weapons')}</td></tr>${MATES_ON ? `<tr><td>${tr('隊', 'Team')}</td><td>${tr('有隊友時：點一下看最近那位的背包和命令，長按全隊待命／跟上', 'With companions: tap for the nearest one’s pack and orders; hold to make everyone wait / follow')}</td></tr>` : ''}<tr><td>☰ ／ 🗺</td><td>${tr('選單（暫停、背包、存檔）／地圖', 'Menu (pause, inventory, save) / map')}</td></tr><tr><td>${tr('返回鍵', 'Back button')}</td><td>${tr('關閉視窗／選單', 'Close window / menu')}</td></tr></table>`,
  };
  const pages = TOUCH ? [mobile, movement, survival] : [movement, survival, mobile];
  const m = open(
    tr('🎮 操作說明', '🎮 Controls'),
    '<section id="help-page" aria-labelledby="help-heading"><h4 id="help-heading" tabindex="-1"></h4><div id="help-content"></div></section>',
  );
  m.classList.add('help-modal');
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-modal', 'true');
  m.setAttribute('aria-label', tr('操作說明', 'Controls'));
  const nav = document.createElement('nav');
  nav.className = 'help-nav';
  nav.setAttribute('aria-label', tr('說明分頁', 'Controls pages'));
  nav.innerHTML = `<button id="help-prev">${tr('← 上一頁', '← Previous')}</button><span id="help-progress" role="status" aria-live="polite"></span><button id="help-next">${tr('下一頁 →', 'Next →')}</button>`;
  m.querySelector('.mclose')!.before(nav);
  let page = 0;
  const prev = m.querySelector<HTMLButtonElement>('#help-prev')!;
  const next = m.querySelector<HTMLButtonElement>('#help-next')!;
  const draw = (focus = false) => {
    m.querySelector('#help-heading')!.textContent = pages[page].title;
    m.querySelector('#help-content')!.innerHTML = pages[page].html;
    m.querySelector('#help-progress')!.textContent = `${page + 1} / ${pages.length}`;
    prev.disabled = page === 0;
    next.disabled = page === pages.length - 1;
    m.querySelector('.mbody')!.scrollTop = 0;
    if (focus) m.querySelector<HTMLElement>('#help-heading')!.focus({ preventScroll: true });
  };
  const turn = (delta: number) => {
    const target = Math.max(0, Math.min(pages.length - 1, page + delta));
    if (target !== page) {
      page = target;
      draw(true);
    }
  };
  prev.onclick = () => turn(-1);
  next.onclick = () => turn(1);
  capture = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeModal();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopImmediatePropagation();
      turn(e.key === 'ArrowLeft' ? -1 : 1);
    }
    if (e.key === 'Tab') {
      const buttons = Array.from(m.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement?.id === 'help-heading')) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      e.stopImmediatePropagation();
    }
  };
  addEventListener('keydown', capture, true);
  draw(true);
}

export function openAbout() {
  open(
    tr('📜 製作名單／關於', '📜 Credits / About'),
    `<p><b>${tr('保衛台北 Defend Taipei — 萬華淪陷區', 'Defend Taipei — Fallen Wanhua')}</b>　${VERSION}</p>
    <p>${tr('虛構的諷刺生存遊戲。人物、部隊番號、商店與品牌皆為虛構，如有雷同純屬巧合。', 'A fictional satirical survival game. All characters, military units, shops, and brands are fictional. Any resemblance is purely coincidental.')}</p>
    <p>${tr('地圖資料 © OpenStreetMap contributors（ODbL）', 'Map data © OpenStreetMap contributors (ODbL)')}<br>${tr('引擎：three.js・TypeScript・Vite', 'Engine: three.js · TypeScript · Vite')}<br>${tr('所有材質與音效皆為程式即時生成。', 'All textures and sound effects are generated procedurally in real time.')}</p>
    <p>${tr('設計與開發：DefendTaipei-Lab', 'Design and development: DefendTaipei-Lab')}</p>`,
  );
}
