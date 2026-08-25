/* Throwaway: check Tectonique's belt inertia — drag-follow, coast, brake, and the jam shudder.
   Each scenario reloads and reads the pad to pick a direction that is actually free. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4337;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 980 }, deviceScaleFactor: 2, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["tectonique"]'));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

const shot = (name) => page.locator('.tk-root').screenshot({ path: resolve(`D:/tmp/tecto-${name}.png`) });
const hero = () => page.locator('.tk-slab.hero').evaluate((el) => el.style.transform);
const moves = async () => Number((await page.locator('.tk-chip', { hasText: '👣' }).textContent()).replace(/\D/g, ''));
const cellOf = async () => (await page.locator('.tk-slab.hero').boundingBox()).width;
/** Which pad arrows are lit right now — i.e. which pushes the engine says are possible. */
const freeDirs = () =>
	page.evaluate(() =>
		['up', 'down', 'left', 'right'].filter((d) => !document.querySelector(`.tk-dbtn.${d}`).disabled));

async function fresh() {
	await page.goto(`${base}/jeux/tapis/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.tk-board');
	const start = page.locator('.tk-start');
	if (await start.count()) { try { await start.first().click(); } catch {} }
	await sleep(350);
}

const AXIS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

/* ---- 1. Impulse from a key: it must glide well past one cell, then stop on its own. ---- */
await fresh();
await shot(1);
let free = await freeDirs();
console.log('--- impulse (key) --- free:', free.join(','));
const d1 = free.includes('right') ? 'right' : free[0];
console.log('before:', await hero(), 'moves', await moves());
await page.keyboard.press(`Arrow${d1[0].toUpperCase()}${d1.slice(1)}`);
await sleep(80);
console.log('at 80 ms:', await hero());
await shot(2);
await sleep(1700);
console.log(`coasted ${d1} to:`, await hero(), 'moves', await moves());
await shot(3);

/* ---- 2. Brake: a second press must cut the glide short. ---- */
await fresh();
free = await freeDirs();
const d2 = free[0];
const key2 = `Arrow${d2[0].toUpperCase()}${d2.slice(1)}`;
await page.keyboard.press(key2);
await sleep(110);
await page.keyboard.press(key2); // cut it
await sleep(600);
const braked = await moves();
await fresh();
free = await freeDirs();
await page.keyboard.press(`Arrow${free[0][0].toUpperCase()}${free[0].slice(1)}`);
await sleep(1700);
console.log(`--- brake --- cut after 110 ms: ${braked} coup(s) · left to glide: ${await moves()} coup(s)`);
await shot(4);

/* ---- 3. Drag: the belt tracks the finger, then keeps the fling speed. ---- */
await fresh();
free = await freeDirs();
console.log('--- drag + fling --- free:', free.join(','));
const d3 = free.includes('right') ? 'right' : free.includes('left') ? 'left' : free[0];
const [sx, sy] = AXIS[d3];
const cell = await cellOf();
const box = await page.locator('.tk-board').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 1; i <= 12; i++) await page.mouse.move(cx + sx * cell * 0.14 * i, cy + sy * cell * 0.14 * i);
await sleep(90);
console.log(`held at +1.7 cells ${d3}:`, await hero(), 'moves', await moves());
await shot(5);
const held = await moves();
// A quick flick just before release, so there is real speed to keep.
for (let i = 1; i <= 3; i++) await page.mouse.move(cx + sx * cell * (1.7 + 0.35 * i), cy + sy * cell * (1.7 + 0.35 * i));
await page.mouse.up();
await sleep(1900);
console.log('after the fling:', await hero(), `moves ${held} → ${await moves()}`);
await shot(6);

/* ---- 4. Jam: the board must NOT shake, the blocking pieces must. ---- */
await fresh();
const jamProbe = await page.evaluate(async () => {
	const board = document.querySelector('.tk-board');
	const blocked = ['up', 'down', 'left', 'right'].filter((d) => document.querySelector(`.tk-dbtn.${d}`).disabled);
	if (!blocked.length) return { skipped: 'no blocked direction on this grid' };
	const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
	window.dispatchEvent(new KeyboardEvent('keydown', { key: KEY[blocked[0]], bubbles: true }));
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	const jam = document.querySelectorAll('.tk-slab.jam');
	return {
		pushed: blocked[0],
		boardAnim: getComputedStyle(board).animationName, // must stay "none"
		shaking: board.className.includes('shake'),
		jammed: jam.length,
		jamAnim: jam.length ? getComputedStyle(jam[0].querySelector('.tk-face')).animationName : null,
		kinds: [...jam].map((el) => el.className.replace('tk-slab ', '')),
	};
});
console.log('--- jam ---', JSON.stringify(jamProbe));
await shot(7);

/* ---- 5. Long random play: no crash, the run terminates. ---- */
await fresh();
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const outcome = page.locator('.tk-card h2, .lo-card h2, [class*="outcome"] h2');
for (let i = 0; i < 220 && !(await outcome.count()); i++) {
	await page.keyboard.press(KEYS[Math.floor(Math.random() * 4)]);
	await sleep(140);
}
console.log('--- random play --- ended with:', await outcome.first().textContent().catch(() => '(still playing)'), '· moves', await moves());
await shot(8);

console.log('→ D:/tmp/tecto-1..8.png');
await browser.close();
server.kill();
process.exit(0);
