/* Chapter 17 sliding puzzle, played through: deliver the spool box step 1, a tap on a tile away from the gap (no
   move), then the shortest solution (BFS from the page's own tiles), the lid lifts, the scene goes on.
   Fails on console errors or a step not reached.
   Usage: node scripts/snap-atelier-taquin.mjs [out dir]   (default D:/tmp/atelier-taquin) */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServer } from './preview-server.mjs';

const OUT = resolve(process.argv[2] ?? 'D:/tmp/atelier-taquin');
await mkdir(OUT, { recursive: true });
const PORT = 4390;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Shortest list of positions to tap, from `start` (tile per position, 8 = gap) to solved. */
function solve(start) {
	const goal = '012345678', key = (c) => c.join('');
	const prev = new Map([[key(start), null]]);
	let frontier = [start];
	while (frontier.length && !prev.has(goal)) {
		const next = [];
		for (const c of frontier) {
			const e = c.indexOf(8), r = Math.floor(e / 3), col = e % 3;
			for (const [y, x] of [[r - 1, col], [r + 1, col], [r, col - 1], [r, col + 1]]) {
				if (y < 0 || y > 2 || x < 0 || x > 2) continue;
				const p = y * 3 + x, n = c.slice();
				[n[e], n[p]] = [n[p], n[e]];
				if (prev.has(key(n))) continue;
				prev.set(key(n), { from: key(c), tap: p });
				next.push(n);
			}
		}
		frontier = next;
	}
	const taps = [];
	for (let k = goal; prev.get(k); k = prev.get(k).from) taps.unshift(prev.get(k).tap);
	return taps;
}

const server = await startServer(PORT, { mode: 'dev' });
const errors = [];
const fails = [];
try {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, bypassCSP: true });
	await page.addInitScript(() => localStorage.setItem('ludiven-tuto-seen', '["atelier"]'));
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fetching the script')) errors.push(m.text()); });
	await page.goto(`http://localhost:${PORT}/jeux/atelier/`, { waitUntil: 'networkidle' });
	await page.evaluate(async () => {
		const engine = await import('/src/games/atelier/engine.ts');
		const data = await import('/src/games/atelier/data.ts');
		const st = engine.newGame(Date.now(), 7);
		for (const p of data.PROJECTS) { if (p.id === 'bobines') break; st.progress[p.id] = p.steps; }
		st.done = data.ORDERS.filter((o) => o.project && st.progress[o.project] >= o.step).map((o) => o.id);
		st.upgrades = data.UPGRADES.map((u) => u.id);
		st.seen = ['intro', 'chapter', 'epilogue', 'rep-5', 'map-solved', ...data.PROJECTS.map((p) => 'arrival:' + p.id), ...data.UPGRADES.map((u) => 'up:' + u.id)];
		st.tut = 4;
		st.board = st.board.map((p) => (p && p.startsWith('g:') ? p : null));
		st.board[0] = 'bois:3'; st.board[1] = 'outil:3';
		localStorage.setItem('ludiven-atelier', JSON.stringify(st));
	});
	await page.reload({ waitUntil: 'networkidle' });
	while (await page.locator('.at-talk').count()) { await page.locator('.at-talk-nav .at-btn.ghost').click(); await sleep(150); }
	if (!(await page.locator('.at-orders').count())) await page.locator('.at-tab', { hasText: 'Établi' }).click();
	await page.locator('.at-order.story .at-give').click();
	await page.waitForSelector('.att-board', { timeout: 5000 }).catch(() => { throw new Error('no sliding puzzle after delivering the spool box step 1'); });
	await sleep(400);
	await page.screenshot({ path: `${OUT}/1-start.png` });

	// The page's own tiles: each tile's translate gives its position.
	const cells = await page.evaluate(() => {
		const out = Array(9).fill(8);
		document.querySelectorAll('.att-tile').forEach((g) => {
			const tile = Number(g.querySelector('g').getAttribute('clip-path').match(/att-(\d)/)[1]);
			const m = g.style.transform.match(/translate\(([^,)]+)(?:,\s*([^)]+))?\)/);
			const dx = Math.round(parseFloat(m[1]) / 60), dy = Math.round(parseFloat(m[2] ?? '0') / 60);
			out[(Math.floor(tile / 3) + dy) * 3 + (tile % 3) + dx] = tile;
		});
		return out;
	});
	const taps = solve(cells);
	console.log(`start ${cells.join('')}, solved in ${taps.length} moves`);
	if (taps.length < 8) fails.push(`shuffle too easy: ${taps.length} moves`);
	const tapPos = async (p) => {
		const q = await page.evaluate((p) => {
			const pt = new DOMPoint((p % 3) * 60 + 30, Math.floor(p / 3) * 60 + 30).matrixTransform(document.querySelector('.att-board').getScreenCTM());
			return { x: pt.x, y: pt.y };
		}, p);
		await page.mouse.click(q.x, q.y);
		await sleep(200);
	};
	// A tile two cells from the gap does not move.
	const gap = cells.indexOf(8);
	const far = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((p) => Math.abs(Math.floor(p / 3) - Math.floor(gap / 3)) + Math.abs((p % 3) - (gap % 3)) === 2);
	await tapPos(far);
	if (!(await page.locator('.atg .at-small', { hasText: '0 coup' }).count())) fails.push('a far tile moved');
	for (const [k, p] of taps.entries()) {
		await tapPos(p);
		if (k === Math.floor(taps.length / 2)) await page.screenshot({ path: `${OUT}/2-half.png` });
	}
	if (!(await page.locator('.atg .at-small', { hasText: 'couvercle se soulève' }).count())) fails.push('solved lid not accepted');
	await sleep(500);
	await page.screenshot({ path: `${OUT}/3-solved.png` });
	await page.waitForSelector('.at-talk .at-line', { timeout: 4000 }).catch(() => fails.push('scene did not go on after the puzzle'));
	await browser.close();
} finally {
	server.stop();
}
for (const f of fails) console.log('FAIL', f);
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
if (errors.length || fails.length) process.exitCode = 1;
else console.log('ok, no console errors');
