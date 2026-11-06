// Shared helpers for the Playwright scripts (smoke test and scripts/checks/*).
// Environment variables:
//   URL          game URL (default http://localhost:4173/defendtaipei/, which is what `npm run preview` serves)
//   SHOTS_DIR    where screenshots are written (default ./shots, git-ignored)
//   PW_CHROMIUM  path to a Chromium binary, when Playwright's own browser is not installed
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export { devices };
export const DEFAULT_URL = 'http://localhost:4173/defendtaipei/';
export const gameUrl = arg => arg || process.env.URL || DEFAULT_URL;

export function shot(name) {
  const dir = process.env.SHOTS_DIR || 'shots';
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

// Chromium with software WebGL, so it also works headless and in CI. PW_GPU=1 uses the machine's real graphics card
// instead (still headless): on a desktop that is twice as fast, and it leaves the other cores free.
export const launch = () =>
  chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: process.env.PW_GPU
      ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
      : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });

// Serve dist/ with `vite preview` on the given port and wait until it answers. Returns { url, stop }.
export async function preview(port) {
  const srv = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  const url = `http://localhost:${port}/defendtaipei/`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return { url, stop: () => srv.kill() };
}

// Pick a survivor on the title screen, which starts a new game.
//   g: 'm' | 'f'
//   role: office | student | courier | nurse | tech (default: courier for 'm', nurse for 'f')
//   skipIntro: skip the morning prologue (default true, which matches the game before v17)
// The title screen does not scroll, so on small or phone viewports some cards are off-screen; the clicks are
// therefore sent through the DOM instead of as pointer events.
export async function pickRole(page, { g = 'f', role, skipIntro = true, entryTimeout = 120000 } = {}) {
  // v22.4: the role select sits behind the title menu's 新遊戲
  await page.waitForFunction(() => window.__newGame, null, { timeout: 600000, polling: 500 });
  await page.evaluate(() => window.__newGame());
  await page.waitForSelector('.ch', { state: 'visible', timeout: 600000 });
  await page.evaluate(
    ([g, role, skip]) => {
      const box = document.getElementById('skipintro');
      box.checked = skip;
      box.dispatchEvent(new Event('change'));
      window.__selG(g);
      document.querySelector(`.ch[data-r="${role}"]`).click();
      // Staged selection uses the same explicit confirmation on desktop and mobile.
      for (let i = 0; i < 3; i++) document.getElementById('startgo').click();
    },
    [g, role || (g === 'f' ? 'nurse' : 'courier'), skipIntro],
  );
  await page.waitForFunction(() => window.__game?.started() && !document.getElementById('entry-loading'), null, {
    timeout: entryTimeout,
  });
}
