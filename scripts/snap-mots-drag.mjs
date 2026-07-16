/* Throwaway: verify pointer tracing — LC wheel drag + Méli-Mélo cell drag (trail mid-gesture). */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4329;
const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 375, height: 720 }, deviceScaleFactor: 2, hasTouch: true });

const errors = [];
async function open(slug, sel) {
	const page = await ctx.newPage();
	page.on('console', (m) => { if (m.type() === 'error') errors.push(`${slug}: ${m.text()}`); });
	page.on('pageerror', (e) => errors.push(`${slug}: ${e}`));
	await page.goto(`${base}/jeux/${slug}/`, { waitUntil: 'networkidle' });
	await page.waitForSelector(sel);
	await page.evaluate(() => document.querySelector('.tuto-overlay')?.remove());
	await sleep(500);
	return page;
}

// LC: drag across 3 wheel letters, screenshot mid-drag (trail + selection visible)
{
	const page = await open('lettres-croisees', '.lc-wheel');
	const box = await page.locator('.lc-wheel').boundingBox();
	const n = await page.locator('.lc-letter').count();
	const c = (i) => {
		const a = (i / n) * Math.PI * 2 - Math.PI / 2;
		return { x: box.x + box.width * (0.5 + 0.36 * Math.cos(a)), y: box.y + box.height * (0.5 + 0.36 * Math.sin(a)) };
	};
	await page.locator('.lc-wheel').scrollIntoViewIfNeeded();
	const b2 = await page.locator('.lc-wheel').boundingBox();
	const cc = (i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return { x: b2.x + b2.width * (0.5 + 0.36 * Math.cos(a)), y: b2.y + b2.height * (0.5 + 0.36 * Math.sin(a)) }; };
	await page.mouse.move(cc(0).x, cc(0).y);
	await page.mouse.down();
	await page.mouse.move(cc(1).x, cc(1).y, { steps: 8 });
	await page.mouse.move(cc(2).x, cc(2).y, { steps: 8 });
	await sleep(200);
	await page.screenshot({ path: resolve('D:/tmp/lc-drag.png') });
	await page.mouse.up();
	await sleep(400);
	const sel = await page.locator('.lc-letter.sel').count();
	console.log(`LC: selection cleared after submit = ${sel === 0}, letters = ${n}`);
	await page.close();
}

// Méli-Mélo: start, drag across 3 adjacent cells, screenshot mid-drag
{
	const page = await open('meli-melo', '.mm-board');
	await page.click('.mm-startbtn');
	await sleep(400);
	const cells = page.locator('.mm-cell');
	const b0 = await cells.nth(0).boundingBox();
	const b1 = await cells.nth(1).boundingBox();
	const b5 = await cells.nth(5).boundingBox(); // diagonal from 1
	const mid = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
	await page.mouse.move(mid(b0).x, mid(b0).y);
	await page.mouse.down();
	await page.mouse.move(mid(b1).x, mid(b1).y, { steps: 6 });
	await page.mouse.move(mid(b5).x, mid(b5).y, { steps: 6 }); // diagonal step
	await sleep(200);
	const selCount = await page.locator('.mm-cell.sel').count();
	await page.screenshot({ path: resolve('D:/tmp/mm-drag.png') });
	await page.mouse.up();
	console.log(`MM: cells selected mid-drag = ${selCount} (expect 3, diagonal incl.)`);
	await page.close();
}

console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no console errors');
await browser.close();
server.kill();
process.exit(0);
