// URL debug / test flags (moved out of core/main.ts in v23.2; behaviour unchanged).
export const MPQ = new URLSearchParams(location.search);
// v23.1.3: the multiplayer server is not deployed yet, so 多人連線 is shown as 即將開放 unless ?mpdebug=1 (or ?mp=/?room=) is set
export const MP_ON = !!import.meta.env.VITE_MP_SERVER || MPQ.has('mpdebug') || MPQ.has('mp') || MPQ.has('room');
// v24.40 computer teammates chosen at the start: behind ?mates=1 until they are finished
export const MATES_ON = MPQ.get('mates') === '1';
