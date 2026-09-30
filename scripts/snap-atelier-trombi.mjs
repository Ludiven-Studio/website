/* Trombinoscope capture: a finished campaign, the faces grid and one open card. Fails on console errors.
   Usage: node scripts/snap-atelier-trombi.mjs [out dir]   (default D:/tmp/atelier-trombi) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-trombi');
await mkdir(OUT, { recursive: true });
const PORT = 4371;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await startServer(PORT, { mode: 'dev' });
const errors = [];
try {
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
	await ctx.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["atelier"]'));
	const page = await ctx.newPage();
	page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fetching the script')) errors.push(m.text()); });
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
	await page.goto(`http://localhost:${PORT}/jeux/atelier/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.at-root');
	const all = await page.evaluate(async () => {
		const m = await import('/src/games/atelier/data.ts');
		return { projects: m.PROJECTS.map((p) => p.id), upgrades: m.UPGRADES.map((u) => u.id), done: m.ORDERS.map((o) => o.id) };
	});
	await page.evaluate(({ projects, upgrades, done }) => {
		const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
		for (const p of projects) st.progress[p] = 3;
		st.seen = ['intro', 'chapter', 'epilogue', 'map-solved', 'rep-5', ...projects.map((p) => `arrival:${p}`), ...upgrades.map((u) => `up:${u}`)];
		st.upgrades = upgrades; st.done = done; st.tut = 4;
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	}, all);
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForSelector('.at-root');
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn:not(.ghost)').click(); await sleep(150); }
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await page.locator('.at-trombi').scrollIntoViewIfNeeded();
	await sleep(500);
	await page.locator('.at-trombi').screenshot({ path: `${OUT}/grid.png` });
	console.log('faces', await page.locator('.at-trombi-face').count());
	await page.locator('.at-trombi-face', { hasText: 'Jeanne' }).click();
	await sleep(400);
	await page.screenshot({ path: `${OUT}/card.png` });
	await browser.close();
} finally {
	server.stop();
}
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
else console.log('no console errors');
