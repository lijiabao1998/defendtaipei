// Real WebSocket transport through the actual Worker, in isolated browser contexts.
// Requires Vite :5173 and wrangler dev :8787. No fetch/WebSocket mocking.
import { chromium, firefox } from 'playwright';
import assert from 'node:assert/strict';
import { pickRole, shot } from '../lib.mjs';
const backend = process.env.MP_SERVER || 'http://localhost:8787';
const useDefault = process.env.MP_USE_DEFAULT === '1';
// Optional independent diagnostic only; default retains the full natural office-spawn route.
const doorFixture = process.env.MP_DOOR_FIXTURE === '1';
const useFirefox = process.env.PW_BROWSER === 'firefox';
const browser = await (useFirefox ? firefox : chromium).launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: useFirefox ? [] : ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 960, height: 640 } }),
    browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: !useFirefox, hasTouch: true }),
  ]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  for (const p of pages) {
    await p.addInitScript(() => {
      window.__frameSample = { frames: 0, started: performance.now(), maxGap: 0 };
      let previous = performance.now();
      const sample = now => {
        window.__frameSample.frames++;
        window.__frameSample.maxGap = Math.max(window.__frameSample.maxGap, now - previous);
        previous = now;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    p.setDefaultTimeout(120000);
    p.on('console', m => {
      if (m.type() === 'error') console.error('browser:', m.text());
    });
    p.on('pageerror', e => console.error('pageerror:', e.message));
    p.on('requestfailed', r => console.error('requestfailed:', r.url(), r.failure()));
    await p.goto('http://localhost:5173/defendtaipei/scripts/checks/mp-transport.html');
    await p.evaluate(async base => {
      const { Net } = await import('/defendtaipei/src/net/net.ts');
      window.net = new Net(base);
    }, backend);
  }
  const code = await pages[0].evaluate(() => net.create());
  for (let i = 0; i < 2; i++)
    await pages[i].evaluate(
      async ({ code, i }) => net.join(code, { name: 'Client ' + i, role: 'courier', g: 'm', x: i, z: 0 }),
      { code, i },
    );
  for (const p of pages)
    await p.waitForFunction(() => net.s && Object.values(net.s.players).filter(p => p.on).length === 2);
  const ids = await Promise.all(pages.map(p => p.evaluate(() => net.you)));
  assert.notEqual(ids[0], ids[1]);
  await pages[0].evaluate(() => net.cmd({ t: 'move', x: 0.3, z: 0 }));
  await pages[1].waitForFunction(id => Math.abs(net.s.players[id].x - 0.3) < 0.001, ids[0]);
  await pages[1].evaluate(() => net.cmd({ t: 'move', x: 1.3, z: 0 }));
  await pages[0].waitForFunction(id => Math.abs(net.s.players[id].x - 1.3) < 0.001, ids[1]);
  // Both real clients race for one server-defined crate: exactly one inventory receives it.
  await Promise.all(pages.map(p => p.evaluate(() => net.cmd({ t: 'loot', id: 'supply:0', x: 99999, z: 99999 }))));
  for (const p of pages) await p.waitForFunction(() => !!net.s.looted['supply:0']);
  const winner = await pages[0].evaluate(() => net.s.looted['supply:0']);
  assert.ok(ids.includes(winner));
  for (const p of pages) {
    await p.waitForFunction(winner => net.s.players[winner].inv.a9 === 36, winner);
    assert.equal(
      await p.evaluate(
        loser => net.s.players[loser].inv.a9,
        ids.find(id => id !== winner),
      ),
      12,
    );
  }
  // Walk using legal commands, then verify real authoritative gun damage and ammo on both clients.
  await pages[0].evaluate(async () => {
    net.equip('pistol');
    const pause = ms => new Promise(r => setTimeout(r, ms));
    await pause(300);
    for (let i = 0; i < 240; i++) {
      const p = net.s.players[net.you],
        e = net.s.enemies[0];
      const dx = e.x - p.x,
        dz = e.z - p.z,
        d = Math.hypot(dx, dz);
      if (d < 23) break;
      net.cmd({ t: 'move', x: p.x + (dx / d) * 0.35, z: p.z + (dz / d) * 0.35 });
      await pause(90);
    }
  });
  const beforeAmmo = await pages[0].evaluate(() => net.s.players[net.you].inv.a9);
  await pages[0].evaluate(() => net.cmd({ t: 'attack', target: 0 }));
  await Promise.all(pages.map(p => p.waitForFunction(() => net.s.enemies[0].hp === 12)));
  await pages[0].waitForFunction(() => net.s.players[net.you].cd === 0);
  await pages[0].evaluate(() => net.cmd({ t: 'attack', target: 0 }));
  await Promise.all(pages.map(p => p.waitForFunction(() => net.s.enemies[0].hp === 0 && net.s.loot['enemy:0'])));
  for (const p of pages) assert.equal(await p.evaluate(id => net.s.players[id].inv.a9, ids[0]), beforeAmmo - 2);
  console.log('PASS: desktop/mobile real transport contested loot, shared enemy death/drop, authoritative ammo');
  await pages[0].evaluate(() => net.ws.close());
  await pages[0].waitForFunction(() => net.ws?.readyState === 1 && net.tries === 0);
  await pages[0].waitForFunction(({ beforeAmmo }) => net.s.players[net.you].inv.a9 === beforeAmmo - 2, { beforeAmmo });
  assert.equal(await pages[0].evaluate(() => net.s.enemies[0].hp), 0);
  // Progress protection checks exercise the actual storage module, not a mock implementation.
  await pages[0].evaluate(async () => {
    const s = await import('/defendtaipei/src/systems/save.ts');
    const keys = [s.GAME_SAVE_KEY, s.DISTRICT_TILES_KEY, s.ROAD_TILES_KEY, s.MAP_SAVE_KEY];
    keys.forEach(k => localStorage.setItem(k, 'sentinel'));
    s.setMultiplayerSession(true);
    s.clearSave();
    s.clearRoadTiles();
    s.writeSave({});
    s.writeDistrictTiles({});
    s.writeRoadTiles({});
    s.writeMapSave({ n: [], f: '' });
    if (keys.some(k => localStorage.getItem(k) !== 'sentinel')) throw Error('Single-player progress modified');
  });
  await pages[0].evaluate(() => net.leave());
  await pages[1].waitForFunction(id => !net.s.players[id]?.on, ids[0]);
  await pages[1].evaluate(() => net.leave());
  // Now load the actual desktop + phone game UIs (same independent contexts).
  const gameCode = await pages[1].evaluate(() => net.create());
  if (doorFixture) {
    // Explicit diagnostic fixture: ordinary first joins establish authoritative positions,
    // then leave/rejoin restores them. Not a teleport, server patch, or natural-spawn proof.
    for (const p of pages) {
      await p.evaluate(
        code => net.join(code, { name: 'Door fixture', role: 'office', g: 'm', x: 78, z: 40.6 }),
        gameCode,
      );
      await p.waitForFunction(() => net.s?.players[net.you]?.x === 78 && net.s.players[net.you].on);
      await p.evaluate(() => net.leave());
    }
    console.log(
      'DIAGNOSTIC ONLY: ordinary first-join/reconnect fixture at x78,z40.6; natural office route still required separately',
    );
  }
  for (const p of pages)
    await p.evaluate(() => localStorage.setItem('dt.settings', JSON.stringify({ quality: 'low' })));
  console.log('Transport movement/reconnect/save protection passed; loading two real game clients at low quality.');
  for (const p of pages) {
    await p.goto(
      `http://localhost:5173/defendtaipei/?${useDefault ? '' : 'mp=' + encodeURIComponent(backend) + '&'}room=${gameCode}`,
    );
    await pickRole(p, { g: 'm', role: 'office', skipIntro: true, entryTimeout: 360000 });
    assert.equal(await p.locator('#mpbase').inputValue(), backend);
  }
  for (const p of pages)
    await p.waitForFunction(
      () => window.__game?.net?.s && Object.values(window.__game.net.s.players).filter(p => p.on).length === 2,
      null,
      { timeout: 120000 },
    );
  console.log(
    'Both game clients ready',
    await Promise.all(pages.map(p => p.evaluate(() => window.__game.net.s.players))),
  );
  const gameIds = await Promise.all(pages.map(p => p.evaluate(() => window.__game.net.you)));
  // Use the real phone context button, not the debug/transport API, to claim shared supplies.
  await pages[1].waitForFunction(() => document.getElementById('pbact')?.dataset.mode === 'ctx');
  await pages[1].locator('#pbact').tap();
  await Promise.all(pages.map(p => p.waitForFunction(id => window.__game.net.s.looted['supply:0'] === id, gameIds[1])));
  await pages[1].waitForFunction(() => window.__game.player.inv.a9 === 36);
  console.log('PASS: real phone context button claims shared supply and authoritative inventory updates');
  // Office survivors start behind a closed home door: co-op loot routing must not trap them.
  if (doorFixture) {
    const door = await pages[1].evaluate(() => window.__game.autoState().door);
    assert.deepEqual(door, [78, 41.5], 'Fixture must match the real deterministic home door');
  }
  for (const p of pages)
    await p.evaluate(() => (window.__frameSample = { frames: 0, started: performance.now(), maxGap: 0 }));
  const approach = await pages[1].evaluate(() => ({
    path: window.__game.autoState().cd ? 1 : window.__game.autoWalk(),
    state: window.__game.autoState(),
  }));
  console.log('Phone door approach', approach);
  assert.ok(approach.path > 0, 'Office spawn must have a walkable route to its home door');
  await pages[1].waitForFunction(() => window.__game.autoState().cd, null, { timeout: 180000 });
  await pages[1].evaluate(() => window.__game.autoStop());
  await pages[1].waitForFunction(() => /開門|Open door/.test(document.getElementById('prompt').textContent));
  await pages[1].locator('#pbact').tap();
  await pages[1].waitForFunction(() => !window.__game.autoState().cd);
  console.log(
    'Frame samples',
    await Promise.all(
      pages.map(p =>
        p.evaluate(() => ({ ...window.__frameSample, elapsedMs: performance.now() - window.__frameSample.started })),
      ),
    ),
  );
  console.log('PASS: phone co-op survivor opens the real closed home door through the touch control');

  if (doorFixture) {
    const before = await pages[0].evaluate(id => window.__game.net.s.players[id], gameIds[1]);
    const joy = await pages[1].locator('#joy').boundingBox();
    assert.ok(joy, 'phone joystick visible');
    const touch = await contexts[1].newCDPSession(pages[1]);
    const x = joy.x + joy.width / 2,
      y = joy.y + joy.height / 2;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 35, y }] });
    try {
      await pages[0].waitForFunction(
        ({ id, before }) => {
          const p = window.__game.net.s.players[id];
          return Math.hypot(p.x - before.x, p.z - before.z) > 0.05;
        },
        { id: gameIds[1], before },
      );
    } finally {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    }
    console.log(
      'PASS: short real touch-joystick displacement is authoritative on the other full client (diagnostic, not full route)',
    );
  }

  const waitWeapons = weapon =>
    Promise.all(
      pages.map((p, i) =>
        p.waitForFunction(
          ({ id, weapon }) => {
            const n = window.__game.net;
            if (!n.s || n.s.players[n.you]?.hp === 0) throw Error('Player defeated during equipment QA');
            return n.s.players[id]?.weapon === weapon;
          },
          { id: gameIds[1 - i], weapon },
        ),
      ),
    );
  await Promise.all(
    pages.map(p =>
      p.evaluate(() => {
        window.__game.addItem('hammer');
        window.__game.addItem('pipe');
        window.__game.useItem('hammer');
      }),
    ),
  );
  await waitWeapons('hammer');
  console.log('PASS: both full clients replicate hammer');
  await Promise.all([
    pages[1].locator('#equip').dispatchEvent('pointerdown'),
    pages[0].evaluate(() => window.__game.useItem('pipe')),
  ]);
  await waitWeapons('pipe');
  console.log('PASS: phone weapon tap and desktop pipe replicate both ways');
  await Promise.all(
    pages.map(async p => {
      await p.waitForFunction(() => {
        const n = window.__game.net;
        return n.s?.players[n.you]?.hp > 0 && window.__game.player.hp === n.s.players[n.you].hp;
      });
      await p.evaluate(() => {
        window.__game.player.hp = 1;
        window.__game.useItem('hammer');
      });
      await p.waitForFunction(() => {
        const n = window.__game.net;
        return window.__game.player.hp === n.s?.players[n.you]?.hp && window.__game.player.hp > 1;
      });
    }),
  );
  await waitWeapons('hammer');
  console.log('PASS: both full game clients switch hammer/pipe, and local health reconciles to server');
  await Promise.all([
    pages[0].screenshot({ path: shot('multiplayer-desktop.png') }),
    pages[1].screenshot({ path: shot('multiplayer-phone.png') }),
  ]);
  await pages[1].locator('#mpleave').click();
  await pages[1].waitForURL('**/defendtaipei/');
  console.log(
    JSON.stringify({
      passed: true,
      diagnosticOnly: doorFixture,
      naturalOfficeRoute: !doorFixture,
      backend,
      defaultEndpoint: useDefault,
      code,
      isolatedClients: 2,
      bidirectionalMovement: true,
      reconnect: true,
      saveProtection: true,
      leave: true,
    }),
  );
} catch (error) {
  for (const [i, c] of browser.contexts().entries())
    for (const p of c.pages()) {
      await p.screenshot({ path: shot(`multiplayer-failure-${i}.png`) }).catch(() => {});
      console.error(
        'Client',
        i,
        await p
          .evaluate(() => ({
            url: location.href,
            status: (window.__game?.net || window.net)?.status,
            players: (window.__game?.net || window.net)?.s?.players,
            started: window.__game?.started?.(),
            loading: !!document.getElementById('entry-loading'),
            equipment: window.__game?.pst?.(),
            movement: window.__game?.autoState?.(),
            frameSample: window.__frameSample && {
              ...window.__frameSample,
              elapsedMs: performance.now() - window.__frameSample.started,
            },
            socket: (window.__game?.net || window.net)?.ws?.readyState,
            tries: (window.__game?.net || window.net)?.tries,
            hud: document.getElementById('mphud')?.textContent,
          }))
          .catch(() => null),
      );
    }
  throw error;
} finally {
  await browser.close();
}
