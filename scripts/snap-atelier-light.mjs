/* Workshop picture across the campaign: the dusty room fading into the restored one. Fails on console errors.
   Usage: node scripts/snap-atelier-light.mjs [out dir]   (default D:/tmp/atelier-light) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-light');
await mkdir(OUT, { recursive: true });
const PORT = 4385;
// Projects fully told, then the upgrades bought: start, end of chapter 1, end of season 1, finale.
const STAGES = [['start', 0, 1], ['ch1', 1, 3], ['season1', 7, 10], ['finale', 99, 99]];
const server = await startServer(PORT, { mode: 'dev' });
const errors = [];
try {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, bypassCSP: true });
	await page.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["atelier"]'));
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
	await page.goto(`http://localhost:${PORT}/jeux/atelier/`, { waitUntil: 'networkidle' });
	for (const [name, nProjects, nUps] of STAGES) {
		await page.evaluate(async ([np, nu]) => {
			const engine = await import('/src/games/atelier/engine.ts');
			const data = await import('/src/games/atelier/data.ts');
			const st = engine.newGame(Date.now(), 7);
			data.PROJECTS.slice(0, np).forEach((p) => { st.progress[p.id] = p.steps; });
			st.done = data.ORDERS.filter((o) => o.project && st.progress[o.project] >= o.step).map((o) => o.id);
			st.upgrades = data.UPGRADES.slice(0, nu).map((u) => u.id);
			st.seen = ['intro', 'chapter', 'epilogue', 'rep-5', 'map-solved', ...data.PROJECTS.map((p) => 'arrival:' + p.id), ...data.UPGRADES.map((u) => 'up:' + u.id)];
			st.tut = 4;
			localStorage.setItem('ludiven-atelier', JSON.stringify(st));
		}, [nProjects, nUps]);
		await page.reload({ waitUntil: 'networkidle' });
		await page.waitForSelector('.at-root');
		if (!(await page.locator('.at-shop').count())) await page.locator('.at-tab', { hasText: 'Atelier' }).click();
		await page.waitForTimeout(1600);
		await page.locator('.at-scene').screenshot({ path: `${OUT}/${name}.png` });
		console.log(name, await page.locator('.at-scene-img.restored').evaluate((e) => getComputedStyle(e).opacity));
	}
	await browser.close();
} finally {
	server.stop();
}
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
else console.log('no console errors');
