/* Throwaway: verify the two-finger pan + pinch on the 3D billard using REAL multi-touch
   via CDP Input.dispatchTouchEvent (React pointer multi-touch is dead on iOS; this mirrors
   how the touch path is exercised — see the ios-touch memory). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4341;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1, hasTouch: true });
const page = await ctx.newPage();
await page.goto(`${base}/jeux/billard/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.bi-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.addStyleTag({ content: `
  .faux-fs { position: fixed; inset: 0; max-width: none !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; background: #14100c; z-index: 9999; display: flex; flex-direction: column; }
  .faux-fs > .game-head { display: none !important; }
  .faux-fs .bi-root { max-width: none !important; width: 100% !important; height: 100% !important; }
  .faux-fs .bi-playwrap { flex: 1 !important; aspect-ratio: auto !important; border-radius: 0 !important; }
  .faux-fs .bi-help { display: none !important; }
`});
await page.evaluate(() => { document.querySelector('.game-page')?.classList.add('faux-fs'); window.dispatchEvent(new Event('resize')); });
await sleep(1600);

const client = await ctx.newCDPSession(page);
const touch = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y]) => ({ x, y })) });

await page.screenshot({ path: resolve(`${OUT}/billard-touch-before.png`) });
console.log('→ before');

// PAN: ONE finger dragged (away from the cue) → the view should shift.
let a = [470, 230];
await touch('touchStart', [a]);
for (let i = 1; i <= 12; i++) { a = [470 + i * 10, 230]; await touch('touchMove', [a]); await sleep(20); }
await sleep(300);
await page.screenshot({ path: resolve(`${OUT}/billard-touch-pan.png`) });
console.log('→ pan (1 finger)');
await touch('touchEnd', []);
await sleep(400);

// TWIST: two fingers rotated ~50° around their centroid → the view should turn.
const cxp = 450, cyp = 360, r = 60;
const pt = (ang) => [[cxp + Math.cos(ang) * r, cyp + Math.sin(ang) * r], [cxp - Math.cos(ang) * r, cyp - Math.sin(ang) * r]];
let g = pt(0);
await touch('touchStart', g);
for (let i = 1; i <= 12; i++) { g = pt((i / 12) * 0.9); await touch('touchMove', g); await sleep(20); }
await sleep(300);
await page.screenshot({ path: resolve(`${OUT}/billard-touch-twist.png`) });
console.log('→ twist (rotate)');
await touch('touchEnd', []);
await sleep(400);

// ZOOM: two fingers spreading apart → zoom in.
let za = [420, 360], zb = [480, 360];
await touch('touchStart', [za, zb]);
for (let i = 1; i <= 12; i++) { za = [420 - i * 12, 360]; zb = [480 + i * 12, 360]; await touch('touchMove', [za, zb]); await sleep(20); }
await sleep(300);
await page.screenshot({ path: resolve(`${OUT}/billard-touch-zoom.png`) });
console.log('→ zoom');
await touch('touchEnd', []);

await browser.close();
server.kill();
