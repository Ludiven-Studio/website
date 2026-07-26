/* Throwaway: preview Tectonique — level 1 solved in the optimal 3 moves, then the daily. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4337;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["tectonique"]'));
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${base}/jeux/tectonique/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.tk-board');
const start = page.locator('.tk-start');
if (await start.count()) { try { await start.first().click(); } catch {} }
await sleep(300);
await page.locator('.tk-root').screenshot({ path: resolve('D:/tmp/tecto-1.png') });

// Swipe from the hero's cell.
const swipe = async (dx, dy) => {
	const box = await page.locator('.tk-piece.hero').boundingBox();
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx, y + dy, { steps: 8 });
	await page.mouse.up();
	await sleep(400);
};

// Level 1 optimum: row right (eats), column up, row left (eats).
await swipe(140, 0);
await page.locator('.tk-root').screenshot({ path: resolve('D:/tmp/tecto-2.png') });
await swipe(0, -140);
await swipe(-140, 0);
await sleep(600);
await page.locator('.tk-root').screenshot({ path: resolve('D:/tmp/tecto-3.png') });

// Daily.
await page.locator('.dt-seg', { hasText: 'Défi' }).click();
await sleep(1200);
const dStart = page.locator('.tk-start');
if (await dStart.count()) { try { await dStart.first().click(); } catch {} }
await sleep(400);
await page.locator('.tk-root').screenshot({ path: resolve('D:/tmp/tecto-4.png') });

console.log('→ D:/tmp/tecto-1..4.png');
await browser.close();
server.kill();
process.exit(0);
