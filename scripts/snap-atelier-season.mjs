/* Play season 2 of L'Atelier des Souvenirs from a "season 1 finished" save, one screenshot per beat,
   and fail on any console error. Story orders are delivered by putting the asked pieces on the bench,
   so this checks the chapter flow, the art and the scenes, not the balance (scripts/atelier-sim.ts does).

   Usage: node scripts/snap-atelier-s2.mjs [out dir]   (default D:/tmp/atelier-s2) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-s2');
await mkdir(OUT, { recursive: true });
const PORT = 4369;
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
	const shot = async (name) => { await sleep(450); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
	const next = () => page.locator('.at-talk-nav .at-btn:not(.ghost)').click();
	const drain = async () => { while (await page.locator('.at-talk').count()) { await next(); await sleep(150); } };
	const patch = async (fn, arg) => {
		await page.evaluate(fn, arg);
		await page.reload({ waitUntil: 'networkidle' });
		await page.waitForSelector('.at-root');
		await page.locator('.at-hud').scrollIntoViewIfNeeded();
	};

	await page.goto(`http://localhost:${PORT}/jeux/atelier/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.at-root');
	// Season 1 done: every season 1 order delivered, every upgrade up to the souvenirs room owned.
	await patch(() => {
		const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
		const s1 = ['montre', 'radio', 'voilier', 'boite', 'fauteuil', 'malle', 'musique'];
		for (const p of s1) st.progress[p] = 3;
		st.seen = ['intro', 'chapter', 'epilogue', 'map-solved', 'rep-5', ...s1.map((p) => `arrival:${p}`)];
		st.upgrades = ['etabli', 'lampe', 'photo', 'etageres', 'menuiserie', 'couture', 'bureau', 'souvenirs'];
		st.tut = 4; st.coins = 400;
		st.board = st.board.map((p) => (p && p.startsWith('g:') ? p : null));
		const gens = ['g:caisse', 'g:coffre', 'g:malle'];
		gens.forEach((g, k) => { st.board[10 + k] = g; });
		// The season 1 short orders count as done so the counter is season 2's.
		st.done = window.__s1done ?? [];
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	const s1done = await page.evaluate(async () => {
		const m = await import('/src/games/atelier/data.ts');
		return m.ORDERS.filter((o) => !o.project || ['montre', 'radio', 'voilier', 'boite', 'fauteuil', 'malle', 'musique'].includes(o.project)).map((o) => o.id);
	});
	await patch((done) => {
		const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
		st.done = done;
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	}, s1done);
	await shot('01-arrival-boussole');
	await drain();

	const deliver = async (pieces, name, extra = 0) => {
		await patch((ps) => {
			const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
			ps.forEach((p, k) => { st.board[k] = p; });
			st.coins = Math.max(st.coins, 200);
			localStorage.setItem('ludiven-atelier', JSON.stringify(st));
		}, pieces);
		await drain();
		await page.locator('.at-tab', { hasText: 'Établi' }).click();
		await page.locator('.at-order.story .at-give').click();
		await sleep(1400);
		for (let k = 0; k < extra; k++) { await next(); await sleep(400); }
		await shot(name);
		await drain();
	};
	const needs = await page.evaluate(async () => {
		const m = await import('/src/games/atelier/data.ts');
		return Object.fromEntries(m.ORDERS.filter((o) => o.kind === 'story').map((o) => [o.id, o.needs]));
	});
	for (const p of ['boussole', 'fanal', 'longuevue', 'coffre']) {
		for (const k of [1, 2, 3]) await deliver(needs[`${p}-${k}`], `${p}-${k}`, p === 'boussole' && k === 1 ? 1 : p === 'coffre' && k === 2 ? 0 : 0);
	}
	await page.locator('.at-tab', { hasText: 'Établi' }).click();
	await shot('20-hangar-banner');
	await page.locator('.at-next .at-btn').click();
	await page.locator('.at-up', { hasText: 'hangar' }).locator('.at-btn').click();
	await sleep(600);
	await shot('21-hangar-scene');
	await drain();
	await page.locator('.at-tab', { hasText: 'Établi' }).click();
	await shot('22-greeur-on-board');
	for (const p of ['mouette', 'cloche']) {
		for (const k of [1, 2, 3]) await deliver(needs[`${p}-${k}`], `${p}-${k}`, p === 'cloche' && k === 3 ? 1 : 0);
	}
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await shot('30-atelier-end');
	await browser.close();
} finally {
	server.stop();
}
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
else console.log('no console errors');
