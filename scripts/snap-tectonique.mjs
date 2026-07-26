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
const ctx = await browser.newContext({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 3 });
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

// Daily (10×10 on the hard band).
await page.locator('.dt-seg', { hasText: 'Défi' }).click();
await sleep(1500);
const dStart = page.locator('.tk-start');
if (await dStart.count()) { try { await dStart.first().click(); } catch {} }
await sleep(400);
await shot(5);

console.log('→ D:/tmp/tecto-1..5.png');
await browser.close();
server.kill();
process.exit(0);
