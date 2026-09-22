/* Throwaway: how far does the aim arc bow off a straight line on screen, in CSS pixels?
   The camera sits behind the circle looking down the lane, so the parabola can end up in a
   vertical plane through the eye — which projects to a dead straight segment at every loft.
   Holds a drag and reads `bow` from the debug snapshot at several LOFTS.

   It swept the camera pitch when the camera WAS the aim. Since the launch board it sweeps the board
   instead, which is where the loft lives now. It was also pressing straight after load, where the
   phase is `throw-jack` and the view is `dessus` — the board is inert in both by design, so it had
   been reading power 0.00 / bow 0px and saying nothing at all. Défi has no jack and opens in the
   throwing view, so that is the mode it runs in. */
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
// Défi: no jack to throw, so the board is live from the first frame.
await page.getByRole('tab', { name: /Défi/ }).click();
await sleep(1200);
for (let i = 0; i < VIEW_PRESSES; i++) { await page.keyboard.press('v'); await sleep(400); }
const box = await page.locator('.pe-canvas').boundingBox();
/* The launch pad's own box, not a share of the canvas: the pad is a fixed 220x150 on the bottom
   edge, so height * 0.8 lands inside it on a 760 px canvas and just above it on an 844 px one. */
const arm = await page.evaluate(() => window.__petanque().arm);
const cx = box.x + arm.cx;
// t is the loft (0 grazing, 1 plomb) and the pad is drawn upside down, so t = 1 is its bottom.
const boardY = (t) => box.y + arm.top + arm.pad + t * (arm.height - 2 * arm.pad);
// The pull aims at the SEAM (the pad's top), never 130 px above the press: power is measured from
// the seam, so a press-relative pull from a full plomb would stop short and be cancelled.
const pull = box.y + arm.top - 130;

/* Sweep the BOARD, one held drag per loft. The old version held ONE drag and swept the wheel under
   it, which cannot work any more: the board refuses to re-read the loft once it is held, on purpose. */
for (const [tag, t] of [['grazing', 0.04], ['mid', 0.5], ['plunging', 0.96]]) {
	await page.mouse.move(cx, boardY(t));
	await page.mouse.down();
	await page.mouse.move(cx, pull, { steps: 14 });
	await sleep(900);
	const s = await state();
	console.log(`${tag.padEnd(10)} loft=${(s.loft * 180 / Math.PI).toFixed(1)}deg power=${s.power.toFixed(2)} bow=${s.bow}px`);
	await page.screenshot({ path: resolve(`${OUT}/pet-arc-${tag}.png`) });
	// Back onto the pad and release: power 0 there, so nothing is thrown and the next loft is free.
	await page.mouse.move(cx, boardY(t), { steps: 4 });
	await sleep(150);
	await page.mouse.up();
	await sleep(300);
}

console.log(errs.length ? `PAGE ERRORS:\n${errs.join('\n')}` : 'no page errors');
await browser.close();
server.stop();
process.exit(0);
