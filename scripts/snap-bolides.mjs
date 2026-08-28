/* Throwaway: check the Bolides ground actually renders (the quad used to be back-face
   culled, so the arena looked like a black void) and that fullscreen fills the viewport. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4331;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
await page.goto(`${base}/jeux/bolides/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.bo-canvas');
const clickText = (t) => page.evaluate((txt) => {
  [...document.querySelectorAll('.bo-root button')].find((b) => b.textContent.includes(txt))?.click();
}, t);
await clickText('Mode libre');
await clickText('Jouer');
await sleep(1800);
await page.screenshot({ path: resolve('D:/tmp/bolides-sol.png') });
await page.evaluate(() => document.querySelector('.gf-btn')?.click());
await sleep(900);
await page.screenshot({ path: resolve('D:/tmp/bolides-fs.png') });
const box = await page.evaluate(() => {
  const r = document.querySelector('.bo-canvas').getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), vh: innerHeight, vw: innerWidth };
});
console.log('fullscreen canvas', JSON.stringify(box));

// Drive flat out straight into the far corner: it must scrape (sparks, slowed), never end the run.
await page.evaluate(() => document.querySelectorAll('.bo-actions button')[0]?.click()); // fresh run
await sleep(600);
await page.keyboard.down('ArrowUp'); // spawn faces the centre, so straight on = the far corner
await sleep(4600); // ~0.8 s past first contact — long enough to scrape, short enough that no bot has cut us
await page.screenshot({ path: resolve('D:/tmp/bolides-wall.png') });
console.log('still playing after wall run =', await page.evaluate(() => !!document.querySelector('.bo-actions')));

await browser.close();
server.kill();
