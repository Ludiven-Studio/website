/* Measurement: is the head readable? The complaint was "on ne voit pas les boules d'assez près pour
   évaluer la situation", and the cause was the look target — the camera stared at the ground 2.2 m
   in front of the circle while the boules sat 6 to 10 m out, so they lived a few pixels tall at the
   very top of the frame. Two numbers decide it, both read from the live camera:
     - `body`, the boule's on-screen diameter in CSS px;
     - `py`, how far down the frame it sits — a boule at py < 15 % of the height is at the horizon.
   Plays a few boules, then reads both at the circle, walked up, and in first person. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A phone is the case that hurts: a tall canvas spends its field on sky, not on the head.
const PORTRAIT = process.argv.includes('--portrait');
/* Fullscreen is the BEST case: 760 px of canvas. The page everyone actually lands on is
   `.pe-root` capped at 620 px wide with a 16/10 wrap, so the canvas is 620x388 — 1.5x smaller,
   and every px figure taken in fullscreen reads that much too optimistic. Measure here. */
const WINDOWED = process.argv.includes('--windowed');
const VP = PORTRAIT ? { width: 390, height: 844 } : { width: 1000, height: 760 };
const PORT = 4370;
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`THROW ${e.message}`));

await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
await page.getByRole('tab', { name: /Libre/ }).click();
await sleep(700);
if (!WINDOWED) {
	await page.evaluate(() => {
		document.querySelector('.game-page')?.classList.add('gf-full');
		document.documentElement.classList.add('gf-full');
		window.dispatchEvent(new Event('resize'));
	});
}
await sleep(1500);

const state = () => page.evaluate(() => window.__petanque());
await page.locator('.pe-canvas').scrollIntoViewIfNeeded();
const box = await page.locator('.pe-canvas').boundingBox();
console.log(`canvas ${Math.round(box.width)}x${Math.round(box.height)}${WINDOWED ? ' (windowed)' : ' (fullscreen)'}`);
// Middle of the throwing strip, asked of the game: it is clamped in px, so a fixed share of the
// canvas height drifts off it between the two viewports.
const arm = await page.evaluate(() => window.__petanque().arm);
const cx = box.x + box.width * 0.5, cy = box.y + arm.top + (box.height - arm.top) * 0.45;
const H = box.height;

async function throwOne() {
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx, cy - 132, { steps: 12 });
	await sleep(250);
	await page.mouse.up();
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 4000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(400);
}

/* The jack is aimed with a ring and thrown with a button — the strip is inert in that phase, so a
   drag here would sit there until the wait for `rolling` timed out. */
async function throwJack() {
	await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 4000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(400);
}

// Jack, then boules until both sides have something down.
for (let i = 0; i < 12; i++) {
	const s = await state();
	if (s.status !== 'aim' || s.match.turn !== 0) { await sleep(300); continue; }
	if (s.match.phase === 'throw-jack') { await throwJack(); continue; }
	if (s.bs.filter((b) => b.side >= 0).length >= 3) break;
	await throwOne();
}

/* The turn-start walk-up borrows the head view's field while it holds, so a fixed sleep used to
   sample whatever the animation was doing — the pixels read like a 36 degree field in a 49 degree
   view. Wait it out instead. */
const settled = async () => {
	// The whole walk-up is 2.4 s; anything longer means there is no intro and we are burning the
	// end away, which empties the ground we came to measure.
	for (let i = 0; i < 15; i++) {
		if ((await state()).intro === null) break;
		await sleep(200);
	}
	await sleep(1100); // the look target and the walk are both eased
};

const report = async (tag) => {
	await settled();
	const s = await state();
	// Walking up the lane can leave a boule behind the eye, where `py` is meaningless.
	const ba = s.seen.filter((x) => x.side >= 0 && x.py > -H && x.py < 2 * H);
	if (!ba.length) {
		console.log(`${tag.padEnd(16)} nothing down (status ${s.status}, end ${s.match.endNo}, `
			+ `left ${s.match.left.join('/')}, ${s.bs.filter((b) => b.live).length} live)`);
		return;
	}
	const body = Math.min(...ba.map((x) => x.body));
	const lowest = Math.min(...ba.map((x) => x.py));
	// px alone depends on where the AI landed; body * m / height depends on nothing but the field.
	const big = ba.reduce((a, x) => (x.body > a.body ? x : a));
	const perM = ((big.body * big.m) / H).toFixed(4);
	console.log(`${tag.padEnd(16)} fov=${s.fov} perMetre=${perM} boules=${ba.length} smallest=${body}px `
		+ `topmost=${Math.round((lowest / H) * 100)}% of frame `
		+ ba.map((x) => `[s${x.side} ${x.m}m ${x.body}px y${Math.round((x.py / H) * 100)}%]`).join(' '));
};

const toView = (i) => page.locator('.pe-view').nth(i).click(); // labels drop under 420 px

await toView(0);
await report('jeu, circle');
// All the way to the stop, and wait out the ease: the field and the walk are both first-order, so
// a fixed number of key presses used to sample the middle of the animation.
for (let i = 0; i < 8; i++) { await page.keyboard.press('w'); await sleep(120); }
await page.waitForFunction(() => window.__petanque().zoomView > 0.98, null, { timeout: 8000 }).catch(() => {});
await report('jeu, full zoom');
await page.keyboard.press('c');
await toView(1);
await report('head view');

await browser.close();
server.stop();
process.exit(0);
