// Éclats in a real browser: the level opens on its ready gate, the keyboard and the touch
// gestures steer the piece (CDP touch events on a phone-sized page), a tap on the ground plants
// a flag, the pickaxe digs the cell it is aimed at, and a run of placed pieces bursts gems and
// digs the ground without a page error. Screenshots go to --out (default D:/tmp/eclats-shots).
// Usage: node scripts/check-eclats.mjs [--out <dir>] [--url https://www.ludiven-studio.fr]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const PORT = 4473;
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('--out') ?? 'D:/tmp/eclats-shots';
const BASE = arg('--url') ?? `http://localhost:${PORT}`;
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
	// The dev server has no sw.js: that 404 and its console lines are expected.
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
const settled = (page) => until(page, (s) => s.phase === 'fall' || s.phase === 'over');

try {
	const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

	/* ---- Desktop: ready gate, keyboard ---- */
	{
		const { page, errors } = await open(browser, { viewport: { width: 1280, height: 900 } });
		await until(page, (s) => s.mode === 'levels');
		let s = await state(page);
		check('opens on level 1, behind its ready gate', s.mode === 'levels' && s.phase === 'ready', `${s.mode} / ${s.phase}`);
		await page.screenshot({ path: `${OUT}/desk-ready.png` });
		await page.click('.ec-start');
		await until(page, (x) => x.phase === 'fall');
		const x0 = (await state(page)).piece.x;
		await page.keyboard.press('ArrowLeft');
		s = await state(page);
		check('← moves the piece', s.piece.x === x0 - 1, `x ${x0} → ${s.piece.x}`);
		const r0 = s.piece.rot;
		await page.keyboard.press('ArrowUp');
		s = await state(page);
		check('↑ turns it', s.piece.rot !== r0, `rot ${r0} → ${s.piece.rot}`);
		await page.keyboard.press('Space');
		await settled(page);
		s = await state(page);
		check('Space drops it', s.placed === 1, `${s.placed} placed`);
		// A run of pieces across the board: something bursts and digs.
		const dug0 = s.dug.filter(Boolean).length;
		for (let k = 0; k < 24 && s.status === 'playing'; k++) {
			await page.evaluate((k) => window.__eclats.place(k % 7, (k * 3) % 4), k);
			await settled(page);
			s = await state(page);
		}
		const dug1 = s.dug.filter(Boolean).length;
		check('placed pieces burst and dig the ground', dug1 > dug0, `${dug0} → ${dug1} cells open, ${s.found}/${s.treasures} treasures, ${s.status}`);
		await page.screenshot({ path: `${OUT}/desk-play.png` });
		check('desktop: no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
		await page.context().close();
	}

	/* ---- Phone: touch gestures, flag, pickaxe ---- */
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
		await until(page, (x) => x.phase === 'fall');
		const cdp = await page.context().newCDPSession(page);
		const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
		// Board centre, and the top ground layer (it starts 123 units down) in columns 0 and 3.
		// Measured again after anything that may scroll the page.
		const measure = () => page.evaluate(() => {
			const m = document.querySelector('.ec-svg').getScreenCTM();
			const at = (ux, uy) => { const p = new DOMPoint(ux, uy).matrixTransform(m); return [p.x, p.y]; };
			return { cell: m.a * 10, board: at(35, 60), g00: at(5, 128), g03: at(35, 128) };
		});
		let geo = await measure();
		const midX = geo.board[0];
		const midY = geo.board[1];

		let s = await state(page);
		const r0 = s.piece.rot;
		await touch('touchStart', [[midX, midY]]);
		await page.waitForTimeout(60);
		await touch('touchEnd', []);
		await page.waitForTimeout(80);
		s = await state(page);
		check('a tap on the board turns the piece', s.piece.rot !== r0, `rot ${r0} → ${s.piece.rot}`);

		const x0 = s.piece.x;
		await touch('touchStart', [[midX, midY]]);
		for (let k = 1; k <= 6; k++) {
			await page.waitForTimeout(20);
			await touch('touchMove', [[midX + (geo.cell * 2.2 * k) / 6, midY]]);
		}
		await touch('touchEnd', []);
		await page.waitForTimeout(80);
		s = await state(page);
		check('a slide moves it column by column', s.piece.x === Math.min(6, x0 + 2), `x ${x0} → ${s.piece.x}`);

		await touch('touchStart', [[midX, midY - geo.cell * 2]]);
		for (let k = 1; k <= 4; k++) {
			await page.waitForTimeout(15);
			await touch('touchMove', [[midX, midY - geo.cell * 2 + geo.cell * 1.2 * k]]);
		}
		await touch('touchEnd', []);
		await settled(page);
		s = await state(page);
		check('a flick down drops it', s.placed === 1, `${s.placed} placed`);

		// The ground: column 0 of the top layer, unless a clue already opened it.
		const ti = s.dug[0] ? 3 : 0;
		const target = () => (ti ? geo.g03 : geo.g00);
		await touch('touchStart', [target()]);
		await page.waitForTimeout(50);
		await touch('touchEnd', []);
		await page.waitForTimeout(80);
		s = await state(page);
		check('a tap on the ground plants a flag', s.flag[ti] === 1, `flag ${s.flag[ti]} on cell ${ti}`);

		await page.tap('.ec-booster:has-text("Pioche")');
		s = await state(page);
		check('the pickaxe button takes aim (the fall pauses)', s.aim === 'pioche', `aim ${s.aim}`);
		await page.screenshot({ path: `${OUT}/phone-aim.png` });
		geo = await measure();
		await touch('touchStart', [target()]);
		await page.waitForTimeout(50);
		await touch('touchEnd', []);
		await page.waitForTimeout(120);
		s = await state(page);
		check('the pickaxe digs the cell it is aimed at', s.dug[ti] === 1 && s.boosters.pioche >= 0 && s.aim === null, `dug ${s.dug[ti]}, aim ${s.aim}`);

		for (let k = 0; k < 16 && s.status === 'playing'; k++) {
			await page.evaluate((k) => window.__eclats.place((k * 2) % 7, k % 4), k);
			await settled(page);
			s = await state(page);
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
