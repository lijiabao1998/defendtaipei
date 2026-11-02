import { tr } from '../i18n';
/** v22.7 portrait touch controls: short label for the context action button, derived from the HUD prompt */
const MAP: [RegExp, string][] = [
  [/搜刮|翻找|搜|search|loot|rummage/i, tr('搜', 'Search')],
  [/關門|close door/i, tr('關門', 'Close')],
  [/開門|撬|open door|pry/i, tr('開門', 'Open')],
  [/爬上|climb to|climb up/i, tr('爬上', 'Climb')],
  [/下樓|爬下|下到|go downstairs|climb down|descend|take the stairs|down to the street/i, tr('下樓', 'Down')],
  [/上樓|go upstairs/i, tr('上樓', 'Up')],
  [/下車|get off|get out|exit vehicle/i, tr('下車', 'Exit')],
  [
    /騎|開車|上車|^開|^ride(?!.*(?:line|metro|train))|^drive|board(?!.*(?:line|metro|train))|enter vehicle/i,
    tr('上車', 'Ride'),
  ],
  [
    /捷運|進站|搭乘|月台|回地面|metro|station|platform|return to street|orange line|return to the surface/i,
    tr('捷運', 'Metro'),
  ],
  [/避難所|shelter/i, tr('避難', 'Shelter')],
  [/購|買|商店|交易|換|shop|buy|trade|barter|insert coins/i, tr('交易', 'Trade')],
  [/交談|對話|聯絡人|說話|talk|speak|contact/i, tr('交談', 'Talk')],
  [/撿|拿|pick up|take/i, tr('撿', 'Take')],
];
/** prompt like "[E] 搜刮 便利商店｜[B] 封門" → "搜"; null when nothing interactable */
export function ctxLabel(prompt: string, key: string): string | null {
  const pre = `[${key}]`;
  if (!prompt.startsWith(pre)) return null;
  const t = prompt.slice(pre.length).trim().split(/[｜|]/)[0];
  for (const [re, l] of MAP) if (re.test(t)) return l;
  if (/^inspect/i.test(t)) return tr('查看', 'Inspect');
  return tr(t.replace(/[（(].*$/, '').slice(0, 2) || '互動', 'Interact');
}
/** the prompt text without the bound key, for the small hint over the button */
export const ctxHint = (prompt: string, key: string) =>
  prompt.startsWith(`[${key}]`)
    ? prompt
        .slice(key.length + 2)
        .split(/[｜|]/)[0]
        .trim()
    : '';
