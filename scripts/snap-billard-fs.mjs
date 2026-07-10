/* Throwaway: simulate the .game-page fullscreen layout (headless can't do real fullscreen)
   to verify the billard canvas fills the screen. Mirrors the :fullscreen CSS via a class. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4324;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${base}/jeux/billard/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.bi-canvas');
await sleep(500);
// Mirror the :fullscreen rules with a class so headless can preview the layout.
await page.addStyleTag({ content: `
  .faux-fs { position: fixed; inset: 0; max-width: none !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 1rem !important; background: var(--gray-999); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .faux-fs > .game-head { display: none !important; }
  .faux-fs .bi-root { max-width: none !important; width: 100% !important; height: 100% !important; }
  .faux-fs .bi-playwrap { flex: 1 !important; aspect-ratio: auto !important; border-radius: 0 !important; }
  .faux-fs .bi-help { display: none !important; }
`});
await page.evaluate(() => document.querySelector('.game-page')?.classList.add('faux-fs'));
await sleep(700); // let ResizeObserver → doResize fire and the canvas grow
await page.screenshot({ path: resolve('D:/tmp/comfy/billard-fs.png') });
console.log('→ D:/tmp/comfy/billard-fs.png');
await browser.close();
server.kill();
