/* Throwaway: simulate .game-page fullscreen for snake to verify the square board fills the screen. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4326;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["snake"]'));
const page = await ctx.newPage();
await page.goto(`${base}/jeux/snake/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.sn-canvas');
await sleep(600);
await page.addStyleTag({ content: `
  .faux-fs { position: fixed; inset: 0; max-width: none !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 1rem !important; background: var(--gray-999); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .faux-fs > .game-head { display: none !important; }
  .faux-fs .sn-root { max-width: none !important; width: 100% !important; height: 100% !important; justify-content: center; }
  .faux-fs .sn-boardwrap { width: min(96vw, 88vh) !important; max-width: none !important; aspect-ratio: 1 / 1 !important; }
  .faux-fs .sn-help { display: none !important; }
`});
await page.evaluate(() => { document.querySelector('.game-page')?.classList.add('faux-fs'); window.dispatchEvent(new Event('resize')); });
await sleep(700);
await page.screenshot({ path: resolve('D:/tmp/comfy/snake-fs.png') });
console.log('→ D:/tmp/comfy/snake-fs.png');
await browser.close();
server.kill();
