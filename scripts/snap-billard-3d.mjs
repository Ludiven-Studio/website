/* Throwaway: screenshot the 3D billard in fit / shoulder / top views, plus an aiming
   drag to check the predicted-trajectory line. Headless WebGL via swiftshader. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4337;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text()); });
await page.goto(`${base}/jeux/billard/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.bi-canvas');
// Dismiss the "Comment jouer" tutorial overlay if it shows.
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}

// Simulate the .game-page fullscreen layout so the whole table fills the frame.
await page.addStyleTag({ content: `
  .faux-fs { position: fixed; inset: 0; max-width: none !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; background: #14100c; z-index: 9999; display: flex; flex-direction: column; }
  .faux-fs > .game-head { display: none !important; }
  .faux-fs .bi-root { max-width: none !important; width: 100% !important; height: 100% !important; }
  .faux-fs .bi-playwrap { flex: 1 !important; aspect-ratio: auto !important; border-radius: 0 !important; }
  .faux-fs .bi-help { display: none !important; }
`});
await page.evaluate(() => { document.querySelector('.game-page')?.classList.add('faux-fs'); window.dispatchEvent(new Event('resize')); });
await sleep(1600); // let the scene + textures settle

const shot = async (name) => { await sleep(700); await page.screenshot({ path: resolve(`${OUT}/billard-${name}.png`) }); console.log('→', `${OUT}/billard-${name}.png`); };

await shot('fit');

// Cycle camera: fit → shoulder → top. The 🎥 button is the view toggle.
const cam = page.locator('.bi-act[aria-label="Changer de vue"]');
await cam.click(); await shot('shoulder');
await cam.click(); await shot('top');
await cam.click(); await sleep(400); // → shoulder (cue is foreground-centre, easy to grab)

// Aiming drag from the cue ball to show the predicted-trajectory line.
const box = await page.locator('.bi-canvas').boundingBox();
const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.72; // cue sits low-centre in shoulder view
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 70, cy + 70, { steps: 12 }); // pull back-right → shoot up-left into the pack
await sleep(500);
await page.screenshot({ path: resolve(`${OUT}/billard-aim.png`) });
console.log('→', `${OUT}/billard-aim.png`);
await page.mouse.up();

// Mobile portrait view.
await page.setViewportSize({ width: 390, height: 780 });
await sleep(900);
await page.screenshot({ path: resolve(`${OUT}/billard-portrait.png`) });
console.log('→', `${OUT}/billard-portrait.png`);

await browser.close();
server.kill();
