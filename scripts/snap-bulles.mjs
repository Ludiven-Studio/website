/* Throwaway: play a few shots of Bulles and see what the board actually looks like. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4347;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 980 }, deviceScaleFactor: 2, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["bulles"]'));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

const shot = (name) => page.locator('.bul-boardwrap').screenshot({ path: resolve(`D:/tmp/bulles-${name}.png`) });
const viewShot = (name) => page.screenshot({ path: resolve(`D:/tmp/bulles-${name}.png`) });
const gauge = () => page.locator('.bul-gauge').textContent().catch(() => '(none)');

async function fresh(label) {
	await page.goto(`${base}/jeux/bulles/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.dt-seg');
	await page.locator('.dt-seg', { hasText: 'Libre' }).click();
	await page.waitForSelector('.bul-svg');
	if (label) {
		await page.locator('.bul-pill', { hasText: label }).click();
		await page.waitForSelector('.bul-svg');
	}
	await sleep(500);
}

/** Aim at a fraction of the board width, one row above the cannon, and fire. */
async function fire(fx) {
	const box = await page.locator('.bul-svg').boundingBox();
	const from = { x: box.x + box.width / 2, y: box.y + box.height * 0.86 };
	const to = { x: box.x + box.width * fx, y: box.y + box.height * 0.35 };
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	for (let i = 1; i <= 12; i++) {
		await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
		await sleep(10);
	}
	await page.mouse.up();
	await sleep(700);
}

/* ---- 1. A fresh facile board. ---- */
await fresh();
console.log('--- facile, fresh ---', await gauge());
console.log('bubbles:', await page.locator('.bul-bubble').count());
await shot('1-fresh');
await viewShot('1b-viewport');

// Does anything fixed sit over the cannon, where the thumb naturally lands?
console.log('cannon vs overlays:', JSON.stringify(await page.evaluate(() => {
	const svg = document.querySelector('.bul-svg');
	const c = svg.querySelector('.bul-loaded')?.getBoundingClientRect();
	if (!c) return 'no loaded bubble';
	const mid = { x: (c.left + c.right) / 2, y: (c.top + c.bottom) / 2 };
	const top = document.elementFromPoint(mid.x, mid.y);
	return { onCannon: top?.className?.baseVal ?? top?.className ?? top?.tagName, offScreen: mid.y > innerHeight || mid.y < 0 };
})));

/* ---- 2. Aim: the guide has to show up before the shot leaves. ---- */
const box = await page.locator('.bul-svg').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.86);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.4, { steps: 10 });
await sleep(200);
console.log('guide legs drawn:', await page.locator('.bul-guide').count());
await shot('2-aiming');
await page.mouse.up();
await sleep(700);

/* ---- 3. A couple of shots by hand. ---- */
for (const fx of [0.3, 0.7]) await fire(fx);
console.log('--- after 3 shots ---', await gauge(), '· over:', await page.locator('.bul-win').count());
console.log('bubbles left:', await page.locator('.bul-bubble').count());
await shot('3-played');

/* ---- 4. Let the hint finish the board: the guide's first leg says where to aim. ---- */
const guideLeg = () => page.evaluate(() => {
	const svg = document.querySelector('.bul-svg');
	const poly = svg?.querySelector('.bul-guide');
	if (!poly) return null;
	const pts = poly.getAttribute('points').split(' ').map((s) => s.split(',').map(Number));
	const m = svg.getScreenCTM();
	const at = (p) => { const q = svg.createSVGPoint(); q.x = p[0]; q.y = p[1]; const r = q.matrixTransform(m); return { x: r.x, y: r.y }; };
	return { from: at(pts[0]), to: at(pts[1]) };
});

const hintBtn = page.locator('.bul-act').first();
for (let i = 0; i < 40 && !(await page.locator('.bul-win').count()); i++) {
	if (!(await hintBtn.count()) || await hintBtn.isDisabled()) { console.log('hint unavailable at shot', i, await hintBtn.count(), await hintBtn.textContent().catch(() => '')); break; }
	await hintBtn.click();
	await sleep(150);
	const leg = await guideLeg();
	if (!leg) { console.log('no guide after hint at shot', i, await page.locator('.bul-hint-note').textContent().catch(() => '(no note)')); break; }
	const b = await page.locator('.bul-svg').boundingBox();
	await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.86);
	await page.mouse.down();
	await page.mouse.move(leg.to.x, leg.to.y, { steps: 8 });
	await page.mouse.up();
	await sleep(650);
}
console.log('--- after hints ---', await gauge());
await sleep(600);
await shot('4-end');
await viewShot('4b-viewport');

/* ---- 5. Difficile: 9 columns still have to be tappable. ---- */
await fresh('Difficile');
console.log('--- difficile, fresh ---', await gauge(), '· bubbles:', await page.locator('.bul-bubble').count());
await shot('5-difficile');

/* ---- 6. Niveaux (the default tab) and Défi. ---- */
await page.goto(`${base}/jeux/bulles/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.dt-seg');
await page.waitForSelector('.bul-svg', { timeout: 15000 });
console.log('--- niveaux ---', await gauge(), '· hint:', await page.locator('.bul-act').first().textContent());
await viewShot('6-niveaux');

await page.locator('.dt-seg', { hasText: 'Défi' }).click();
await page.waitForSelector('.bul-startbtn', { timeout: 15000 });
console.log('--- defi, gated ---', await page.locator('.bul-startbtn').textContent());
await viewShot('7-defi-gate');
await page.locator('.bul-startbtn').click();
await sleep(600);
console.log('--- defi, running ---', await gauge());
await shot('7b-defi');

console.log('→ D:/tmp/bulles-*.png');
await browser.close();
server.kill();
process.exit(0);
