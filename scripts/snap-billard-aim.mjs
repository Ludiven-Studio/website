/* Throwaway: check the simulated aim guide — stops at the first ball, shows the struck ball's
   line (amber) + the cue's own deflection (white), and real cushion bounces on a miss. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4347;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`${base}/jeux/billard/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.bi-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await sleep(600);
await page.addStyleTag({ content: `
  .faux-fs { position: fixed; inset: 0; max-width: none !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; background: #14100c; z-index: 9999; display: flex; flex-direction: column; }
  .faux-fs > .game-head, .faux-fs .bi-topbar, .faux-fs .bi-help { display: none !important; }
  .faux-fs .bi-root { max-width: none !important; width: 100% !important; height: 100% !important; }
  .faux-fs .bi-playwrap { flex: 1 !important; aspect-ratio: auto !important; border-radius: 0 !important; }
`});
await page.evaluate(() => { document.querySelector('.game-page')?.classList.add('faux-fs'); window.dispatchEvent(new Event('resize')); });
await sleep(900);

const box = await page.locator('.bi-canvas').boundingBox();
// In the default fit view the cue ball sits foreground, low-centre.
const gx = box.x + box.width * 0.5, gy = box.y + box.height * 0.72;

// Pull straight down (hard) → shoot straight up into the pack. Screenshot WHILE HOLDING so
// nothing fires: expect the cue line to stop at the first ball, plus the amber struck-ball
// line and the white cue-deflection line forking from the contact.
await page.mouse.move(gx, gy);
await page.mouse.down();
await page.mouse.move(gx + 4, gy + box.height * 0.22, { steps: 16 });
await sleep(500);
await page.screenshot({ path: resolve(`${OUT}/billard-aim-hit.png`) });
console.log('→ aim-hit (holding, no fire)');
await page.mouse.up();

await browser.close();
server.kill();
