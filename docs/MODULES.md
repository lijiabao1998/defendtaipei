# 模組地圖 / Module map (v23.2.0)

| 資料夾 | 內容 | 負責人 |
| --- | --- | --- |
| `src/core/` | `main.ts` 遊戲主迴圈（含鏡頭）、`bus.ts` 事件匯流排、`world.ts`、`geom.ts`、`version.ts`、`sim/core.ts`（單機／伺服器共用模擬核心） | Grok |
| `src/player/` | `roles.ts` 角色、`touchctl.ts`、`joystick.ts` 操控 | Grok |
| `src/audio/` | `audio.ts` 音效與警報 | Grok |
| `src/ui/` | `menu.ts`、`settings.ts`、`icons.ts`、`portrait.ts`、`style.css` | Grok |
| `src/map/` | 地圖、街道、建築、室內、北都地下鐵、材質、遮蔽 | lijiabao2 |
| `src/systems/` | 生存、物品、搜刮、尋路、交通、車輛、無人機、狙擊、護甲等系統 | lijiabao3 |
| `src/npc/` | `human.ts` 無臉人偶、`squadai.ts` 小隊 AI、`roc.ts` 國軍 | lijiabao3 |
| `src/story/` | `cine.ts` 過場；`events/`（`evac.ts` 撤離）；`broadcasts/`（`broadcast.ts` 北廣、`prologue.ts` 序章推播） | lijiabao4 |
| `src/net/` | `net.ts` 多人連線用戶端（即將開放） | Grok |
| `src/debug/` | `flags.ts` 網址測試旗標（`?mpdebug=1` 等） | Grok |

## v24 新增（Claude）

| 檔案 | 內容 |
| --- | --- |
| `src/npc/remnant.ts` | v24.3 國軍殘部：四處固守的路口、英勇對話、每日補給、開火與陣地失守 |
| `src/systems/japan.ts` | v24.4 日本支援：C-2 空投、F-2 轟炸、AH-64DJ 掩護（自衛隊野戰無線電，一次一顆電池） |

## 備註

- 鏡頭仍在 `core/main.ts` 內（`player/` 只放操控與角色）；本次重整刻意不動鏡頭程式碼，以免改變行為。
- `core/bus.ts` 是同步的 `emit`／`on`。目前唯一的事件是 `alert`：序章空襲時 `emit('alert')`，`main.ts` 的 `siren()` 監聽並響起警報（時序與直接呼叫相同）。其他跨模組呼叫仍為直接 import，之後可逐步改走匯流排。
- `server/src/room.ts` 與 `scripts/simtest.mjs` 引用 `src/core/sim/core`。
