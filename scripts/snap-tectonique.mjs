/* Throwaway: preview Tectonique — one-cell steps by key, pad and swipe, the dead end, the daily. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4337;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 980 }, deviceScaleFactor: 3, hasTouch: true });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["tectonique"]'));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${base}/jeux/tectonique/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.tk-board');
const start = page.locator('.tk-start');
if (await start.count()) { try { await start.first().click(); } catch {} }
await sleep(300);
const shot = (name) => page.locator('.tk-root').screenshot({ path: resolve(`D:/tmp/tecto-${name}.png`) });
await shot(1);

const heroBox = async () => page.locator('.tk-slab.hero').boundingBox();
const heroCell = async () => page.locator('.tk-slab.hero').evaluate((el) => el.style.transform);

// Keyboard: one cell per press.
const before = await heroCell();
await page.keyboard.press('ArrowRight');
await sleep(60);
await shot(2); // caught mid-ease
await sleep(400);
console.log('key step:', before, '→', await heroCell());
await shot(3);

// Pad: hold to repeat.
await page.locator('.tk-dbtn.down').dispatchEvent('mousedown');
await sleep(1100);
await page.locator('.tk-dbtn.down').dispatchEvent('mouseup');
await sleep(400);
console.log('after a 1.1 s hold:', await heroCell());
await shot(4);

// Swipe: one step per threshold crossed, chained along the drag.
const cell = (await heroBox()).width;
const box = await page.locator('.tk-board').boundingBox();
const x = box.x + box.width / 2;
const y = box.y + box.height / 2;
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x - cell * 2, y, { steps: 12 });
await page.mouse.up();
await sleep(400);
console.log('after a 2-cell swipe:', await heroCell());
await shot(5);

// Random play until the level closes, one way or another.
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const outcome = page.locator('.tk-card h2, .lo-card h2, [class*="outcome"] h2');
for (let i = 0; i < 400 && !(await outcome.count()); i++) {
	await page.keyboard.press(KEYS[Math.floor(Math.random() * 4)]);
	await sleep(30);
}
console.log('level ended with:', await outcome.first().textContent().catch(() => '(still playing)'));
await sleep(400);
await shot(6);

// Daily (10×10 on the hard band): a long dry spell must offer the way out.
await page.locator('.dt-seg', { hasText: 'Défi' }).click();
await sleep(1500);
const dStart = page.locator('.tk-start');
if (await dStart.count()) { try { await dStart.first().click(); } catch {} }
await sleep(400);
await shot(7);

const hint = page.locator('.tk-hint');
for (let i = 0; i < 120 && !(await hint.count()); i++) {
	await page.keyboard.press(KEYS[Math.floor(Math.random() * 4)]);
	await sleep(28);
}
await sleep(300);
console.log('dry-spell hint:', (await hint.count()) ? await hint.textContent() : '(none)');
await shot(8);
if (await page.locator('.tk-link').count()) await page.locator('.tk-link').click();
await sleep(500);
await shot(9);

console.log('→ D:/tmp/tecto-1..9.png');
await browser.close();
server.kill();
process.exit(0);
