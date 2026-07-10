/* Throwaway: simulate .game-page fullscreen in LANDSCAPE (short) for grid games to check the board fits. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4327;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }
const browser = await chromium.launch();
// Mimic the :fullscreen rules for each game via a .faux-fs class.
const CSS = (p, board) => `
  .faux-fs { position: fixed; inset: 0; max-width: none !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 1rem !important; background: var(--gray-999); z-index: 9999; display: flex; flex-direction: column; align-items: center; }
  .faux-fs > .game-head { display: none !important; }
  .faux-fs .${p}-root { max-width: none !important; width: 100% !important; height: 100% !important; }
  .faux-fs .${p}-${board.wrap} { flex: 1 !important; min-height: 0 !important; max-width: none !important; container-type: size !important; display: flex !important; align-items: center !important; justify-content: center !important; }
  .faux-fs .${p}-${board.el} { width: min(100cqw, 100cqh) !important; ${board.el === 'canvas' ? 'height: auto !important;' : 'max-width: none !important;'} }
  .faux-fs .${p}-help { display: none !important; }
`;
async function shot(url, sel, css, out, vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(sel);
  await sleep(500);
  await page.addStyleTag({ content: css });
  await page.evaluate(() => { document.querySelector('.game-page')?.classList.add('faux-fs'); window.dispatchEvent(new Event('resize')); });
  await sleep(600);
  await page.screenshot({ path: out });
  await ctx.close();
  console.log('→', out);
}
const land = { width: 800, height: 360 };
await shot(`${base}/jeux/2048/`, '.g2-board', CSS('g2', { wrap: 'playwrap', el: 'board' }), resolve('D:/tmp/comfy/2048-land.png'), land);
await shot(`${base}/jeux/sudoku/`, '.sk-board', CSS('sk', { wrap: 'boardwrap', el: 'board' }), resolve('D:/tmp/comfy/sudoku-land.png'), land);
await browser.close();
server.kill();
