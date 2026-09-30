/* Play one season of L'Atelier des Souvenirs from a save where every earlier season is finished, one
   screenshot per beat, and fail on any console error. Story orders are delivered by putting the asked
   pieces on the bench, so this checks the chapter flow, the art and the scenes, not the balance
   (scripts/atelier-sim.ts does).

   Usage: node scripts/snap-atelier-season.mjs <season 2-4> [out dir]   (default D:/tmp/atelier-s<n>) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const SEASONS = {
	1: ['montre', 'radio', 'voilier', 'boite', 'fauteuil', 'malle', 'musique'],
	2: ['boussole', 'fanal', 'longuevue', 'coffre', 'mouette', 'cloche'],
	3: ['cadre', 'travailleuse', 'tabouret', 'bobines', 'carnet', 'valise'],
	4: ['etal', 'presentoir', 'balance', 'caissette', 'casier', 'toupie'],
};
const SEASON = Number(process.argv[2] ?? 2);
const PRIOR = Object.entries(SEASONS).filter(([k]) => Number(k) < SEASON).flatMap(([, v]) => v);
const OUT = resolve(process.argv[3] ?? `D:/tmp/atelier-s${SEASON}`);
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
	// Every earlier season done: its orders delivered (short ones too), its upgrades owned.
	const prior = await page.evaluate(async (projects) => {
		const m = await import('/src/games/atelier/data.ts');
		const mine = (o) => (o.project && projects.includes(o.project)) || (o.kind === 'short' && (!o.when || projects.includes(o.when.project)));
		return {
			done: m.ORDERS.filter(mine).map((o) => o.id),
			upgrades: m.UPGRADES.filter((u) => !u.when || projects.includes(u.when.project)).map((u) => u.id),
		};
	}, PRIOR);
	await patch(({ projects, done, upgrades }) => {
		const st = JSON.parse(localStorage.getItem('ludiven-atelier'));
		for (const p of projects) st.progress[p] = 3;
		st.seen = ['intro', 'chapter', 'epilogue', 'map-solved', 'rep-5', ...projects.map((p) => `arrival:${p}`), ...upgrades.map((u) => `up:${u}`)];
		st.upgrades = upgrades;
		st.tut = 4; st.coins = 400;
		st.board = st.board.map(() => null);
		st.done = done;
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	}, { projects: PRIOR, done: prior.done, upgrades: prior.upgrades });
	await shot('01-arrival');
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
	for (const p of SEASONS[SEASON]) {
		// A story waiting on an upgrade: take the banner's button, buy it, look at its scene.
		await drain();
		await page.locator('.at-tab', { hasText: 'Établi' }).click();
		if (await page.locator('.at-next').count()) {
			await shot(`${p}-0-banner`);
			await page.locator('.at-next .at-btn').click();
			await page.locator('.at-up.awaited .at-btn').click();
			await sleep(600);
			await shot(`${p}-0-upgrade`);
			await drain();
		}
		for (const k of [1, 2, 3]) await deliver(needs[`${p}-${k}`], `${p}-${k}`, k === 1 ? 1 : 0);
	}
	await page.locator('.at-tab', { hasText: 'Atelier' }).click();
	await shot('30-atelier-end');
	await browser.close();
} finally {
	server.stop();
}
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
else console.log('no console errors');
