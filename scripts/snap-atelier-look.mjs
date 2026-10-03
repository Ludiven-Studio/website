/* Atelier look check: the bench and the workshop of a chapter-1 save, in the light and the dark site theme.
   ICONS=<dir> previews candidate item icons: any /assets/jeux/atelier/<name>.png found in that dir is served instead,
   so new art can be judged in place before it touches public/.
   Fails on console errors. Usage: node scripts/snap-atelier-look.mjs [out dir]   (default D:/tmp/atelier-look) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-look');
await mkdir(OUT, { recursive: true });
const PORT = 4394;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await startServer(PORT, { mode: 'dev' });
const errors = [];
try {
	const browser = await chromium.launch();
	for (const scheme of ['light', 'dark']) {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, bypassCSP: true, colorScheme: scheme });
		await ctx.addInitScript((sch) => {
			localStorage.setItem('ludiven-tuto-seen', '["atelier"]');
			localStorage.setItem('theme', sch);
		}, scheme);
		const page = await ctx.newPage();
		if (process.env.ICONS) {
			await page.route('**/assets/jeux/atelier/*.png*', (route) => {
				const f = join(resolve(process.env.ICONS), basename(new URL(route.request().url()).pathname));
				return existsSync(f) ? route.fulfill({ path: f, contentType: 'image/png' }) : route.continue();
			});
		}
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto(`http://localhost:${PORT}/jeux/atelier/`, { waitUntil: 'networkidle' });
		await page.evaluate(async () => {
			const engine = await import('/src/games/atelier/engine.ts');
			const data = await import('/src/games/atelier/data.ts');
			const st = engine.newGame(Date.now(), 7);
			st.progress.montre = 1;
			st.done = ['garnier-1', 'lucas-1', 'morel-1', 'garnier-2'];
			st.upgrades = ['etabli', 'lampe'];
			st.seen = ['intro', 'arrival:montre', 'rep-5', ...data.UPGRADES.map((u) => 'up:' + u.id)];
			st.tut = 4; st.coins = 42; st.rep = 6;
			const put = (r, c, p) => { st.board[r * 7 + c] = p; };
			put(0, 0, 'outil:2'); put(0, 3, 'soin:1'); put(1, 1, 'meca:3'); put(1, 4, 'outil:4'); put(2, 2, 'soin:2'); put(2, 5, 'meca:1');
			put(3, 0, 'meca:5'); put(5, 3, 'soin:3'); put(6, 1, 'outil:1'); put(6, 5, 'meca:2'); put(7, 2, 'soin:1'); put(8, 6, 'outil:3');
			localStorage.setItem('ludiven-atelier', JSON.stringify(st));
		});
		await page.reload({ waitUntil: 'networkidle' });
		while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await sleep(150); }
		if (!(await page.locator('.at-orders').count())) await page.locator('.at-tab', { hasText: 'Établi' }).click();
		await page.locator('.at-hud').scrollIntoViewIfNeeded();
		await page.evaluate(() => scrollTo(0, document.querySelector('.at-root').getBoundingClientRect().top + scrollY - 8));
		await sleep(500);
		await page.screenshot({ path: `${OUT}/bench-${scheme}.png` });
		await page.locator('.at-tab', { hasText: 'Atelier' }).click();
		await sleep(1400);
		await page.screenshot({ path: `${OUT}/workshop-${scheme}.png` });
		await ctx.close();
	}
	await browser.close();
} finally {
	server.stop();
}
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
else console.log('no console errors');
