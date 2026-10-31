// Exercise the real RoadTiles scheduler with controlled fetches and a stub renderer.
// This tests request lifetime, not actual geometry or scene rendering.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'road-stream-'));
try {
  const outfile = join(temp, 'roads.mjs');
  await build({
    entryPoints: [join(root, 'src/map/roads.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'stub-rendering-assets',
        setup(b) {
          b.onResolve({ filter: /^\.\/(roadglyphs|paving|trees)$/ }, args => ({
            path: args.path,
            namespace: 'render-stub',
          }));
          b.onLoad({ filter: /.*/, namespace: 'render-stub' }, args => ({
            contents:
              args.path === './roadglyphs'
                ? 'export const GLYPHS={}, GMAT={}, atlas={}'
                : args.path === './paving'
                  ? 'export const PAVE={}, worldUV=()=>{}'
                  : 'export class Forest {}',
            loader: 'js',
          }));
        },
      },
    ],
  });
  const { RoadTiles } = await import(pathToFileURL(outfile).href);
  let now = 100;
  Object.defineProperty(globalThis, 'performance', { value: { now: () => now }, configurable: true });
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const requests = [];
  globalThis.fetch = url => new Promise((resolve, reject) => requests.push({ url, resolve, reject }));
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const success = (request, id) => request.resolve({ ok: true, json: async () => ({ id }) });
  const instance = () => {
    const built = [];
    const road = new RoadTiles({ base: '/', scene: { remove() {} }, power: () => true, war: () => false });
    road.have.add('0_0');
    road.build = (key, data) => {
      built.push(data.id);
      return { key, g: { traverse() {} }, lights: [], wrecks: [], barriers: [], geos: [] };
    };
    return { road, built };
  };

  // Leave and re-enter before the original fetch resolves. Old completion cannot
  // publish, clear the new request, or poison its cache.
  {
    const { road, built } = instance();
    road.update(0, 0, 0);
    const old = requests.at(-1);
    road.update(1000, 0, 0);
    road.update(0, 0, 0);
    const current = requests.at(-1);
    assert.notEqual(old, current);
    success(old, 'stale');
    await flush();
    assert.deepEqual(built, []);
    assert.equal(road.loading.has('0_0'), true);
    success(current, 'current');
    await flush();
    assert.deepEqual(built, ['current']);
    assert.equal(road.cache.get('0_0').id, 'current');
    assert.equal(road.loading.has('0_0'), false);
  }
  for (const action of ['reset', 'rebuild']) {
    const { road, built } = instance();
    road.update(0, 0, 0);
    const old = requests.at(-1);
    road[action]();
    road.update(0, 0, 0);
    const current = requests.at(-1);
    success(old, 'stale');
    await flush();
    assert.deepEqual(built, [], `${action}: stale completion`);
    assert.equal(road.loading.has('0_0'), true);
    success(current, action);
    await flush();
    assert.deepEqual(built, [action]);
  }
  {
    const { road, built } = instance();
    road.update(0, 0, 0);
    const first = requests.at(-1);
    const warn = console.warn;
    console.warn = () => {};
    try {
      first.reject(new Error('network'));
      await flush();
    } finally {
      console.warn = warn;
    }
    const count = requests.length;
    road.update(0, 0, 0);
    assert.equal(requests.length, count, 'retry is rate limited');
    now += 1001;
    road.update(0, 0, 0);
    assert.equal(requests.length, count + 1, 'retry in same cell');
    success(requests.at(-1), 'retry');
    await flush();
    assert.deepEqual(built, ['retry']);
  }
  {
    const { road, built } = instance();
    road.update(0, 0, 0);
    const first = requests.at(-1);
    const warn = console.warn;
    console.warn = () => {};
    try {
      first.resolve({ ok: false, status: 503, json: async () => ({ id: 'bad response' }) });
      await flush();
    } finally {
      console.warn = warn;
    }
    now += 1001;
    road.update(0, 0, 0);
    assert.notEqual(requests.at(-1), first, 'HTTP failures are retried');
    success(requests.at(-1), 'http retry');
    await flush();
    assert.deepEqual(built, ['http retry']);
  }
  {
    const { road } = instance();
    let calls = 0;
    road.build = () => {
      calls++;
      throw new Error('partial build');
    };
    road.update(0, 0, 0);
    const first = requests.at(-1);
    const warn = console.warn;
    console.warn = () => {};
    try {
      success(first, 'partial');
      await flush();
    } finally {
      console.warn = warn;
    }
    road.update(1000, 0, 0);
    road.update(0, 0, 0);
    road.rebuild();
    road.update(0, 0, 0);
    road.reset();
    road.update(0, 0, 0);
    assert.equal(calls, 1, 'failed construction remains quarantined across movement and resets');
    assert.equal(requests.at(-1), first);
  }
  console.log('RoadTiles request lifetime and fetch retry checks passed (renderer stubbed)');
} finally {
  await rm(temp, { recursive: true, force: true });
}
