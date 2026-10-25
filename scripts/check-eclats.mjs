// Éclats in a real browser: the level opens on its ready gate, the arrow keys swipe the board, a
// finger swipe does too (CDP touch events on a phone-sized page), the blocks a swipe would explode
// light up while the finger is still down, and a run of swipes explodes blocks without a page
// error. Screenshots go to --out (default D:/tmp/eclats-shots).
// Usage: node scripts/check-eclats.mjs [--out <dir>] [--url https://www.ludiven-studio.fr]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const PORT = 4473;
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('--out') ?? 'D:/tmp/eclats-shots';
const BASE = arg('--url') ?? `http://localhost:${PORT}`;
const DIRS = ['up', 'right', 'down', 'left'];
mkdirSync(OUT, { recursive: true });
const server = arg('--url') ? { stop() {} } : await startServer(PORT, { mode: 'dev' });
const results = [];
const check = (name, ok, detail) => {
	results.push(ok);
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
};

async function open(browser, opts) {
	const ctx = await browser.newContext(opts);
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	// The dev server has no sw.js: that 404 is expected.
	page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/sw.js') && errors.push(`${r.status()} ${r.url()}`));
	await page.goto(`${BASE}/jeux/eclats/`, { waitUntil: 'networkidle' });
	await page.evaluate(() => {
		localStorage.clear();
		localStorage.setItem('ludiven-tuto-seen', JSON.stringify(['eclats']));
	});
	await page.reload({ waitUntil: 'networkidle' });
	await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
	await page.waitForFunction(() => window.__eclats?.state, null, { timeout: 60000 });
	return { page, errors };
}

const state = (page) => page.evaluate(() => window.__eclats.state);
const until = async (page, pred, ms = 15000) => {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (pred(await state(page))) return true;
		await page.waitForTimeout(60);
	}
	return false;
};
const idle = (page) => until(page, (s) => s.phase === 'idle' || s.phase === 'over');

try {
	const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

	/* ---- Desktop: ready gate, arrow keys, a run of swipes ---- */
	{
		const { page, errors } = await open(browser, { viewport: { width: 1280, height: 900 } });
		await until(page, (s) => s.mode === 'levels');
		let s = await state(page);
		check('opens on level 1, behind its ready gate', s.mode === 'levels' && s.phase === 'ready', `${s.mode} / ${s.phase}`);
		await page.screenshot({ path: `${OUT}/desk-ready.png` });
		await page.click('.ec-start');
		await until(page, (x) => x.phase === 'idle');
		const keys = { up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' };
		for (const d of DIRS) {
			await page.keyboard.press(keys[d]);
			await page.waitForTimeout(60);
			s = await state(page);
			if (s.moves > 0) break;
		}
		check('an arrow key swipes the board', s.moves === 1, `${s.moves} move`);
		await idle(page);
		let score = (await state(page)).score;
		for (let k = 0; k < 12 && (await state(page)).phase === 'idle'; k++) {
			await page.evaluate((d) => window.__eclats.swipe(d), DIRS[k % 4]);
			await page.waitForTimeout(40);
			await idle(page);
		}
		s = await state(page);
		check('swipes make blocks explode and open chests', s.score > score && s.opened >= 1, `score ${score} → ${s.score}, chests ${s.opened}/${s.goal}, ${s.status}`);
		await page.screenshot({ path: `${OUT}/desk-play.png` });
		check('desktop: no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
		await page.context().close();
	}

	/* ---- Phone: a finger swipe, and the preview while the finger is down ---- */
	for (const scheme of ['light', 'dark']) {
		const { page, errors } = await open(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: scheme });
		await until(page, (s) => s.phase === 'ready');
		await page.screenshot({ path: `${OUT}/phone-${scheme}-ready.png` });
		if (scheme === 'dark') {
			check('phone dark: no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
			await page.context().close();
			continue;
		}
		await page.tap('.ec-start');
		await until(page, (x) => x.phase === 'idle');
		const cdp = await page.context().newCDPSession(page);
		const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
		const box = await page.evaluate(() => { const r = document.querySelector('.ec-boardwrap').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
		const vec = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

		// A direction that explodes something, if any: its blocks light up before the finger lifts.
		const counts = await page.evaluate((dirs) => dirs.map((d) => window.__eclats.previewCount(d)), DIRS);
		const best = DIRS[counts.indexOf(Math.max(...counts))];
		const [vx, vy] = vec[best];
		await touch('touchStart', [[box.x, box.y]]);
		for (let k = 1; k <= 4; k++) {
			await page.waitForTimeout(20);
			await touch('touchMove', [[box.x + vx * k * 12, box.y + vy * k * 12]]);
		}
		await page.waitForTimeout(120);
		const lit = await page.locator('.ec-preview').count();
		await page.screenshot({ path: `${OUT}/phone-preview.png` });
		check('the blocks a swipe would explode light up while the finger is down', lit === Math.max(...counts), `${lit} lit, ${Math.max(...counts)} expected (${best})`);
		const before = (await state(page)).moves;
		await touch('touchEnd', []);
		await page.waitForTimeout(80);
		const s = await state(page);
		check('lifting the finger plays the swipe', s.moves === before + 1, `${before} → ${s.moves} moves`);
		await idle(page);

		for (let k = 0; k < 6 && (await state(page)).phase === 'idle'; k++) {
			const [dx, dy] = vec[DIRS[(k + 1) % 4]];
			await touch('touchStart', [[box.x, box.y]]);
			await touch('touchMove', [[box.x + dx * 50, box.y + dy * 50]]);
			await touch('touchEnd', []);
			await page.waitForTimeout(40);
			await idle(page);
		}
		await page.screenshot({ path: `${OUT}/phone-play.png` });
		await page.screenshot({ path: `${OUT}/phone-play-full.png`, fullPage: true });
		check('phone: no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
		await page.context().close();
	}
	await browser.close();
} finally {
	server.stop();
}
const passed = results.every(Boolean);
console.log(passed ? 'all Éclats checks passed' : 'some Éclats checks FAILED');
process.exit(passed ? 0 : 1);
