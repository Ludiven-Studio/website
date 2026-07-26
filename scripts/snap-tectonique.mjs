/* Throwaway: preview Tectonique — plate sliding, mid-drag offset, inertia, then the daily. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4337;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 3, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["tectonique"]'));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${base}/jeux/tectonique/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.tk-board');
const start = page.locator('.tk-start');
if (await start.count()) { try { await start.first().click(); } catch {} }
await sleep(300);
const shot = (name) => page.locator('.tk-boardwrap').screenshot({ path: resolve(`D:/tmp/tecto-${name}.png`) });
await shot(1);

const heroBox = async () => page.locator('.tk-slab.hero').boundingBox();

// Press, move partway, shoot mid-drag, then flick and let the inertia settle.
const flick = async (dx, dy) => {
	const box = await heroBox();
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 10 });
	return { x, y, dx, dy };
};
const release = async (g) => {
	await page.mouse.move(g.x + g.dx, g.y + g.dy, { steps: 4 });
	await page.mouse.up();
	await sleep(600);
};

const cell = (await heroBox()).width;
const g = await flick(cell * 2.5, 0);
await shot(2); // held mid-slide
await release(g);
await shot(3);

// A column, then a keyboard nudge.
await release(await flick(0, cell * 2.5));
await page.keyboard.press('ArrowLeft');
await sleep(600);
await shot(4);

// Two fingers, two rows at once — only CDP can dispatch real multi-touch.
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const box = await page.locator('.tk-board').boundingBox();
const n = await page.locator('.tk-board').evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--n')));
const frozenRows = await page.$$eval('.tk-freeze.row', (els) =>
	els.map((e) => Math.round(Number(/translateY\(([-\d.]+)%\)/.exec(e.style.transform)?.[1] ?? 0) / 100)));
const rows = [...Array(n).keys()].filter((r) => !frozenRows.includes(r)).slice(0, 2);
const rowY = (r) => box.y + (r + 0.5) * (box.height / n);
const pt = (i, x) => ({ x, y: rowY(rows[i]), id: i });
const x0 = box.x + box.width * 0.5;
const rowX = async () => page.$$eval('.tk-slab', (els) =>
	els.map((e) => {
		const m = /translate\(([-\d.]+)%, ([-\d.]+)%\)/.exec(e.style.transform);
		return { r: Number(m[2]) / 100, x: Number(m[1]) / 100 };
	}).reduce((acc, s) => { acc[Math.round(s.r)] = Math.min(acc[Math.round(s.r)] ?? 99, s.x); return acc; }, {}));
const before = await rowX();
await touch('touchStart', [pt(0, x0), pt(1, x0)]);
for (const k of [0.3, 0.6, 1]) await touch('touchMove', [pt(0, x0 + cell * 1.6 * k), pt(1, x0 - cell * 1.6 * k)]);
await shot(6); // both rows displaced, in opposite directions
const during = await rowX();
console.log('rows', rows, 'before', before, 'during', during);
await touch('touchEnd', [pt(0, x0 + cell * 1.6), pt(1, x0 - cell * 1.6)]);
await sleep(800);
await shot(7);

// Daily (10×10 on the hard band).
await page.locator('.dt-seg', { hasText: 'Défi' }).click();
await sleep(1500);
const dStart = page.locator('.tk-start');
if (await dStart.count()) { try { await dStart.first().click(); } catch {} }
await sleep(400);
await shot(5);
await page.locator('.tk-slab.hero').screenshot({ path: resolve('D:/tmp/tecto-nest.png') });

console.log('→ D:/tmp/tecto-1..5.png + tecto-nest.png');
await browser.close();
server.kill();
process.exit(0);
