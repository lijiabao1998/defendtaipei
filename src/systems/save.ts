// Game-progress localStorage. Keys and JSON shapes are the on-disk format: existing saves must keep loading,
// and new writes must stay readable by that same layout. Settings (`dt.settings`, `dt.keys`) and the
// multiplayer token are not progress and stay in their own modules.
//
// clearSave() is the previous pair removeItem('defendtaipei-save-v1') + removeItem('dt.tiles').
// Map fog (defendtaipei-map-v2) and road-tile loot (dt-tiles-v1) are separate keys. A new game still resets
// those through GameMap.reset / RoadTiles.reset; death and the evac "new game" button only drop the pair above.

let multiplayerSession = false;
/** Multiplayer never writes or deletes single-player progress. */
export function setMultiplayerSession(on: boolean): void {
  multiplayerSession = on;
}

export const GAME_SAVE_KEY = 'defendtaipei-save-v1';
/** per-tile player changes (looted containers, cleared posts), keyed by district tile */
export const DISTRICT_TILES_KEY = 'dt.tiles';
/** looted wrecks and cleared barriers, keyed by road tile */
export const ROAD_TILES_KEY = 'dt-tiles-v1';
/** v21: world grew to all of 萬華區 → new fog grid */
export const MAP_SAVE_KEY = 'defendtaipei-map-v2';

/**
 * Progress blob. Field names are stable:
 * r role, surv shelter, g gender, p [x,z], hp/hu/th/fa/bl vitals, inv/eq pack,
 * k kills, t minutes, dl day length, wx weather, ex evac flag, inf informant,
 * ut utilities timeline, conts [id, items, pos], dead soldier ids, bar barricade indexes, radio log.
 * Older blobs may omit fields added later (radio, surv, ut, inf, wx, dl, ex); callers already tolerate that.
 */
export interface GameSave {
  r: string;
  surv: any;
  g: string;
  p: [number, number];
  hp: number;
  hu: number;
  th: number;
  fa: number;
  bl: boolean;
  inv: Record<string, number>;
  eq: string;
  k: number;
  t: number;
  dl: number;
  wx: any;
  ex: number;
  inf: any;
  ut: any;
  conts: any[];
  dead: number[];
  bar: number[];
  radio: any[];
  /** Optional experimental story progress, retained even when its debug flag is disabled. */
  story?: unknown;
}

export function readSave(): GameSave | null {
  try {
    return JSON.parse(localStorage.getItem(GAME_SAVE_KEY) || 'null');
  } catch {
    return null;
  }
}

/** True when a progress blob is stored, including a blob that fails to parse (same check as getItem). */
export function hasSave(): boolean {
  return !!localStorage.getItem(GAME_SAVE_KEY);
}

export function writeSave(data: GameSave): void {
  if (multiplayerSession) return;
  localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(data));
}

/** Drop the progress blob and district tile deltas. Does not touch the map or road-tile keys. */
export function clearSave(): void {
  if (multiplayerSession) return;
  localStorage.removeItem(GAME_SAVE_KEY);
  localStorage.removeItem(DISTRICT_TILES_KEY);
}

export function readDistrictTiles(): Record<string, any> {
  try {
    return JSON.parse(localStorage.getItem(DISTRICT_TILES_KEY) || '{}');
  } catch {
    return {};
  }
}

export function writeDistrictTiles(saved: Record<string, any>): void {
  if (multiplayerSession) return;
  try {
    localStorage.setItem(DISTRICT_TILES_KEY, JSON.stringify(saved));
  } catch {
    /* quota */
  }
}

export function readRoadTiles(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(ROAD_TILES_KEY) || '{}');
  } catch {
    return {};
  }
}

export function writeRoadTiles(state: Record<string, string[]>): void {
  if (multiplayerSession) return;
  localStorage.setItem(ROAD_TILES_KEY, JSON.stringify(state));
}

export function clearRoadTiles(): void {
  if (multiplayerSession) return;
  localStorage.removeItem(ROAD_TILES_KEY);
}

export type MapSave = {
  n?: { x: number; z: number; k: string; t?: string; intel?: boolean; id?: string }[];
  f?: string;
  /** v24.33 the fog grid: [west edge, north edge, cell size, cells per side] */
  g?: number[];
};

/** Throws on corrupt JSON so the caller keeps its existing catch (same as a bare JSON.parse). */
export function readMapSave(): MapSave | null {
  return JSON.parse(localStorage.getItem(MAP_SAVE_KEY) || 'null');
}

export function writeMapSave(data: { n: unknown; f: string; g?: number[] }): void {
  if (multiplayerSession) return;
  localStorage.setItem(MAP_SAVE_KEY, JSON.stringify(data));
}
