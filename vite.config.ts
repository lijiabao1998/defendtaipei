import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
// v24.37 the version of the map data (src/core/datav.ts): a hash of every file under public/data (their paths and
// bytes) for the URLs and the worker's cache, and one of the district index alone, which the game checks the index it
// fetched against. Paths from this file, not from where the build was started.
const DATA_DIR = fileURLToPath(new URL('./public/data/', import.meta.url));
const hashOf = (files: string[]) => {
  const h = createHash('sha1');
  for (const f of files) h.update(relative(DATA_DIR, f).replace(/\\/g, '/') + '\0').update(readFileSync(f));
  return h.digest('hex').slice(0, 12);
};
const walk = (d: string): string[] =>
  readdirSync(d)
    .sort()
    .flatMap(n => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
// (v24.38 only when building: read on every start of `vite` and `vite preview` too, the 14,000 files made them slow to
// come up. In development the game runs without them, as the unit checks do: no version in the URLs, nothing stale)
const stamps = () => ({
  v: hashOf(walk(DATA_DIR)),
  i: createHash('sha1')
    .update(readFileSync(join(DATA_DIR, 'district/index.json')))
    .digest('hex')
    .slice(0, 12),
});
// Writes dist/sw.js with a precache list + a cache version derived from the build output, so every deploy invalidates the old cache.
// v24.37 data URLs (data/…) carry the data's version in their query and are matched with it: the district index and the
// tiles on a district's edge keep their names when a release changes them, and were answered from the old cache.
const sw = (DATA_V: string): Plugin => ({
  name: 'dt-sw',
  apply: 'build',
  generateBundle(_o, bundle) {
    const files = Object.keys(bundle).filter(f => !f.endsWith('.map'));
    const core = [
      './',
      'index.html',
      'manifest.webmanifest',
      `data/wanhua.json?v=${DATA_V}`,
      'icons/icon-192.png',
      'icons/icon-512.png',
      ...files.filter(f => f !== 'index.html'),
    ];
    const ver = createHash('sha1').update(files.sort().join('|')).digest('hex').slice(0, 10);
    this.emitFile({
      type: 'asset',
      fileName: 'sw.js',
      source: `const V='dt-${ver}-${DATA_V}',CORE=${JSON.stringify(core)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('dt-')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
 if(r.mode==='navigate'){e.respondWith(fetch(r,{cache:'no-store'}).then(x=>{const y=x.clone();caches.open(V).then(c=>c.put('index.html',y));return x}).catch(()=>caches.match('index.html',{ignoreVary:true})));return}
 const d=new URL(r.url).pathname.includes('/data/');
 e.respondWith(caches.match(r,{ignoreVary:true,ignoreSearch:!d}).then(h=>h||fetch(r).then(x=>{if(x.ok){const y=x.clone();caches.open(V).then(c=>c.put(r,y))}return x})))});
`,
    });
  },
});
export default defineConfig(({ command }) => {
  const S = command === 'build' ? stamps() : { v: '', i: '' };
  return {
    base: '/defendtaipei/',
    plugins: [sw(S.v)],
    define: { __DT_DATA__: JSON.stringify(S.v), __DT_INDEX__: JSON.stringify(S.i) },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: { output: { manualChunks: id => (id.includes('node_modules/three/') ? 'three' : undefined) } },
    },
  };
});
