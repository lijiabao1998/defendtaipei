// v24.37 the version of the map data.
//
// The service worker (vite.config.ts) answers from its cache first. The district index, the paper map and the tiles on
// the edge of a district that a release grows keep their names, so a player who came back after a release ran the new
// code on the old index for a whole session: no 文山, 南港 or 北投, and stations that led to empty ground. The build
// stamps the code with a hash of the data it was built with (__DT_DATA__, and __DT_INDEX__ for the index alone). The
// data is fetched with that stamp in the URL, and from this version on the worker matches data URLs with their query
// (and its cache is named after the data too), so the next release's data is fetched fresh. An index that does not hash
// to its stamp is one an older worker kept: the game drops its caches and loads again, once (main.ts, boot).
declare const __DT_DATA__: string | undefined;
declare const __DT_INDEX__: string | undefined;

/** the version of all the data this build was made with, in every data URL ('' when there is none, as in the unit
 * checks): a hash of every file under public/data, so a release that changes only road tiles changes it too */
export const DATA_V: string = typeof __DT_DATA__ === 'string' ? __DT_DATA__ : '';
/** the hash of the district index alone: what the fetched index is checked against */
export const DATA_INDEX: string = typeof __DT_INDEX__ === 'string' ? __DT_INDEX__ : '';

/** a data URL with the version in it */
export const dataUrl = (u: string) => (DATA_V ? `${u}${u.includes('?') ? '&' : '?'}v=${DATA_V}` : u);

/** the stamp of a data file as the build makes it: the first 12 hex digits of its SHA-1 ('' if it cannot be computed) */
export async function dataHash(buf: ArrayBuffer): Promise<string> {
  try {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-1', buf));
    return [...h]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 12);
  } catch {
    return '';
  }
}
