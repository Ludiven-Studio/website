/* Throwaway: how far does the aim arc bow off a straight line on screen, in CSS pixels?
   The camera sits behind the circle looking down the lane, so the parabola can end up in a
   vertical plane through the eye — which projects to a dead straight segment at every loft.
   Holds a drag and reads `bow` from the debug snapshot at several camera pitches. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// `--view=N` presses V N times first. The throwing view is the one that must bow: an eye closer to
// the throw line flattens the arc, so each view needs its own number.
const VIEW_PRESSES = Number(process.argv.find((a) => a.startsWith('--view='))?.slice(7) ?? 0);
const PORT = 4364;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));

await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
await page.evaluate(() => {
	document.querySelector('.game-page')?.classList.add('gf-full');
	document.documentElement.classList.add('gf-full');
	window.dispatchEvent(new Event('resize'));
});
await sleep(1500);

const state = () => page.evaluate(() => window.__petanque());
for (let i = 0; i < VIEW_PRESSES; i++) { await page.keyboard.press('v'); await sleep(400); }
const box = await page.locator('.pe-canvas').boundingBox();
const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.8;

// Hold the drag: the arc only exists while aiming.
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx, cy - 130, { steps: 14 });
await sleep(700);

/* Sweep the camera pitch under the held drag. The wheel changes the loft, so if the projection
   were honest the bow would move a lot between a grazing camera and a plunging one. */
for (const [tag, wheel] of [['grazing', -6], ['mid', 6], ['plunging', 6]]) {
	for (let i = 0; i < Math.abs(wheel); i++) { await page.mouse.wheel(0, wheel < 0 ? -120 : 120); await sleep(50); }
	await sleep(900);
	const s = await state();
	console.log(`${tag.padEnd(10)} loft=${(s.loft * 180 / Math.PI).toFixed(1)}deg power=${s.power.toFixed(2)} bow=${s.bow}px`);
	await page.screenshot({ path: resolve(`${OUT}/pet-arc-${tag}.png`) });
}
await page.mouse.up();

console.log(errs.length ? `PAGE ERRORS:\n${errs.join('\n')}` : 'no page errors');
await browser.close();
server.stop();
process.exit(0);
