/* Jeanne's office panel after the map puzzle: folded, then opened. Fails on console errors.
   Usage: node scripts/snap-atelier-office.mjs [out dir]   (default D:/tmp/atelier-office) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-office');
await mkdir(OUT, { recursive: true });
const PORT = 4386;
const server = await startServer(PORT, { mode: 'dev' });
const errors = [];
try {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, bypassCSP: true });
	await page.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["atelier"]'));
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(`http://localhost:${PORT}/jeux/atelier/`, { waitUntil: 'networkidle' });
	await page.evaluate(async () => {
		const engine = await import('/src/games/atelier/engine.ts');
		const data = await import('/src/games/atelier/data.ts');
		const st = engine.newGame(Date.now(), 7);
		for (const p of data.PROJECTS.slice(0, 8)) st.progress[p.id] = p.steps;
		st.done = data.ORDERS.filter((o) => o.project && st.progress[o.project] >= o.step).map((o) => o.id);
		st.upgrades = data.UPGRADES.map((u) => u.id);
		st.seen = ['intro', 'chapter', 'epilogue', 'rep-5', 'map-solved', ...data.PROJECTS.map((p) => 'arrival:' + p.id), ...data.UPGRADES.map((u) => 'up:' + u.id)];
		st.tut = 4;
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.reload({ waitUntil: 'networkidle' });
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await page.waitForTimeout(150); }
	if (!(await page.locator('.at-shop').count())) await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	const office = page.locator('.at-office');
	await office.scrollIntoViewIfNeeded();
	await page.waitForTimeout(300);
	await office.screenshot({ path: `${OUT}/folded.png` });
	await office.locator('summary').click();
	await page.waitForTimeout(300);
	await office.screenshot({ path: `${OUT}/open.png` });
	await browser.close();
} finally {
	server.stop();
}
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
else console.log('no console errors');
