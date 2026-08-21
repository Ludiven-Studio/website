/* Throwaway: Lumen proof — beams render, hints solve, touch drag works, daily gates. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4347;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 980 }, deviceScaleFactor: 3, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["lumen"]'));
const page = await ctx.newPage();
const errors = [];
/* Pre-existing site-wide 404: the get_daily RPC was never deployed, every game
   falls back to the date-derived seed. Not a Lumen issue — don't fail on it. */
let known404 = 0;
page.on('response', (r) => { if (r.status() === 404 && r.url().includes('/rpc/get_daily')) known404++; });
page.on('console', (m) => {
	if (m.type() !== 'error') return;
	if (/Failed to load resource/.test(m.text()) && known404 > 0) { known404--; console.log('KNOWN 404 (get_daily RPC, site-wide)'); return; }
	errors.push(m.text());
	console.log('CONSOLE', m.text());
});
page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });

const shot = (name) => page.locator('.lum-root').screenshot({ path: resolve(`D:/tmp/lumen-${name}.png`) });
const gauge = () => page.locator('.lum-gauge').textContent();
const beams = () => page.evaluate(() => document.querySelectorAll('.lum-svg g[style*="screen"] line').length);

async function fresh(label) {
	await page.goto(`${base}/jeux/lumen/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.dt-seg');
	// The game opens on Niveaux; free play is where the pills and the ungated hint live.
	await page.locator('.dt-seg', { hasText: 'Libre' }).click();
	await page.waitForSelector('.lum-board');
	if (label) {
		await page.locator('.lum-pill', { hasText: label }).click();
		await page.waitForSelector('.lum-board');
	}
	await sleep(400);
}

/* Cell centres in page px + which cells hold a piece (from the SVG transforms). */
async function boardInfo() {
	return page.evaluate(() => {
		const board = document.querySelector('.lum-board');
		const svg = document.querySelector('.lum-svg');
		const rect = board.getBoundingClientRect();
		const n = Number(svg.getAttribute('viewBox').split(' ')[2]) / 100;
		const occ = new Set();
		svg.querySelectorAll('g[transform^="translate("]').forEach((g) => {
			const m = /translate\((\d+) (\d+)\)/.exec(g.getAttribute('transform'));
			if (m) occ.add((+m[2] / 100) * n + (+m[1] / 100));
		});
		const cell = rect.width / n;
		return { n, occ: [...occ], left: rect.left, top: rect.top, cell };
	});
}

const cellCenter = (info, idx) => ({
	x: info.left + ((idx % info.n) + 0.5) * info.cell,
	y: info.top + (Math.floor(idx / info.n) + 0.5) * info.cell,
});

async function mouseDrag(from, to) {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	for (let i = 1; i <= 8; i++)
		await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
	await sleep(80);
	await page.mouse.up();
}

async function touchDrag(from, to) {
	const cdp = await ctx.newCDPSession(page);
	const pt = (p) => [{ x: p.x, y: p.y }];
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) });
	for (let i = 1; i <= 8; i++) {
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: pt({ x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 }),
		});
		await sleep(30);
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await cdp.detach();
}

/* ---- 1. Fresh facile: sources + sensors visible, beams already drawn. ---- */
await fresh();
console.log('--- facile, fresh ---', await gauge(), '· beam lines:', await beams());
console.log('tray slots:', await page.locator('.lum-slot').count());
await shot('1-facile-fresh');

/* The tray sits below the fold at 520x980: scroll it in or the touch lands on <html>
   (browser steals the gesture as a scroll -> pointercancel) and coordinates go stale. */
async function trayInView() {
	await page.locator('.lum-tray').scrollIntoViewIfNeeded();
	await sleep(250);
}

/* ---- 2. Mouse drag a tray piece onto a free cell. ---- */
{
	await trayInView();
	const info = await boardInfo();
	const freeIdx = Array.from({ length: info.n * info.n }, (_, i) => i).find((i) => !info.occ.includes(i));
	const slot = await page.locator('.lum-slot:not(.dimmed)').first().boundingBox();
	await mouseDrag({ x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 }, cellCenter(info, freeIdx));
	await sleep(200);
	console.log('after mouse drag → dimmed slots:', await page.locator('.lum-slot.dimmed').count());
	/* Tap the placed piece: it must rotate (SVG changes), not move. */
	const before = await page.evaluate(() => document.querySelector('.lum-svg').innerHTML);
	const c = cellCenter(info, freeIdx);
	await page.mouse.click(c.x, c.y);
	await sleep(200);
	const after = await page.evaluate(() => document.querySelector('.lum-svg').innerHTML);
	console.log('tap-rotate changed svg:', before !== after ? 'yes' : 'NO');
	await shot('2-dragged');
}

/* ---- 3. Touch drag proof (fresh grid so the tray is full). ---- */
await fresh();
{
	await trayInView();
	const info = await boardInfo();
	const freeIdx = Array.from({ length: info.n * info.n }, (_, i) => i).find((i) => !info.occ.includes(i));
	const slot = await page.locator('.lum-slot:not(.dimmed)').first().boundingBox();
	await touchDrag({ x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 }, cellCenter(info, freeIdx));
	await sleep(200);
	console.log('after TOUCH drag → dimmed slots:', await page.locator('.lum-slot.dimmed').count());
	await shot('3-touch-dragged');
}

/* ---- 4. Solve with hints: converges in |solution| steps from empty. ---- */
await fresh();
{
	const hintBtn = page.locator('.lum-act').first();
	for (let i = 0; i < 20 && !(await page.locator('.lum-win').count()); i++) {
		if (!(await hintBtn.count()) || await hintBtn.isDisabled()) break;
		await hintBtn.click();
		await sleep(200);
		if (i === 1) await shot('4-hints-midway');
	}
	// The win card sits behind the celebration beat (~1.6 s) — wait for it properly.
	await page.waitForSelector('.lum-win', { timeout: 8000 }).catch(() => {});
	console.log('--- after hints ---', await page.locator('.lum-win').count() ? 'WON' : `not won: ${await gauge()}`);
	await shot('5-solved');
}

/* ---- 5. Difficile 7×7 legibility. ---- */
await fresh('Difficile');
console.log('--- difficile, fresh ---', await gauge(), '· beam lines:', await beams());
await shot('6-difficile');

/* ---- 6. Daily ready-gate: blurred board + ▶ Commencer. ---- */
await page.locator('.dt-seg', { hasText: 'Défi' }).click();
await page.waitForSelector('.lum-startbtn', { timeout: 15000 }).catch(() => console.log('no startbtn (daily already played?)'));
await sleep(400);
await shot('7-daily-gate');
console.log('daily gate:', await page.locator('.lum-startbtn').count() ? 'ready-gate shown' : 'no gate');

console.log('console errors:', errors.length);
console.log('→ D:/tmp/lumen-*.png');
await browser.close();
server.kill();
process.exit(errors.length ? 1 : 0);
