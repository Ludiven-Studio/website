// Dragon's Gems Swipe (gameId eclats) in a real browser: the level opens on its ready gate, its drawn gems
// and Bijou load, the arrow keys swipe the board, a finger swipe does too (CDP touch events on a
// phone-sized page), the blocks a swipe would explode light up while the finger is still down, the ones
// it would move lean its way and spring back on a short drag, a played swipe sweeps a band of light, a run of
// swipes explodes blocks and opens chests big, their coins fill the loot, Bijou reacts, and the loot
// goes to his treasure on a win (or is lost with the level), and in free play the destroyed gems fill
// Bijou's gauge until a tap on him sends his fireballs, without a page error. Screenshots go to
// --out (default D:/tmp/eclats-shots).
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
		const art = await page.waitForFunction(() => !!document.querySelector('.ec-svg image[href*="/eclats/gem-"]'), null, { timeout: 15000 }).then(() => true, () => false);
		check('the drawn gems replace the flat ones once loaded', art, art ? 'sprites on' : 'still flat after 15 s');
		const bijou = await page.waitForFunction(() => !!document.querySelector('.ec-bijou .ec-drake'), null, { timeout: 15000 }).then(() => true, () => false);
		check('Bijou sits on his treasure at the board corner', bijou, bijou ? 'drawn' : 'missing after 15 s');
		await page.screenshot({ path: `${OUT}/desk-ready.png` });
		await page.click('.ec-start');
		await until(page, (x) => x.phase === 'idle');
		const lesson = await page.evaluate(() => ({ text: document.querySelector('.ec-lesson')?.textContent ?? '', lit: document.querySelectorAll('.ec-preview').length }));
		check('level 1 is a lesson whose suggested swipe glows before the first move', lesson.text.includes('Glisse') && lesson.text.includes('gauche') && lesson.lit === 3, `"${lesson.text.slice(0, 60)}…", ${lesson.lit} blocks lit`);
		const keys ={ up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' };
		for (const d of DIRS) {
			await page.keyboard.press(keys[d]);
			await page.waitForTimeout(60);
			s = await state(page);
			if (s.moves > 0) break;
		}
		check('an arrow key swipes the board', s.moves === 1, `${s.moves} move`);
		// Levels 1-20 have no swipe limit: the chip counts the swipes played, never the ones left.
		const chips = await page.evaluate(() => [...document.querySelectorAll('.ec-hud .ec-chip')].map((c) => c.textContent).join(' | '));
		check('level 1 takes as many swipes as it needs', s.limit === 0 && chips.includes('1 coup') && !chips.includes('restant'), `limit ${s.limit}, chips "${chips}"`);
		await idle(page);
		// Did a chest ever pop out big in the flying layer? A mutation observer sees it even between polls.
		await page.evaluate(() => {
			window.__bigChest = false;
			new MutationObserver(() => { if (document.querySelector('.ec-flylayer .ec-bigchest')) window.__bigChest = true; })
				.observe(document.querySelector('.ec-flylayer'), { childList: true });
		});
		const moods = new Set();
		let score = (await state(page)).score;
		for (let k = 0; k < 30 && (await state(page)).phase === 'idle'; k++) {
			await page.evaluate((d) => window.__eclats.swipe(d), DIRS[k % 4]);
			await page.waitForTimeout(40);
			await until(page, (x) => {
				moods.add(x.mood);
				return x.phase === 'idle' || x.phase === 'over';
			});
		}
		s = await state(page);
		check('swipes make blocks explode and open chests', s.score > score && s.opened >= 1, `score ${score} → ${s.score}, chests ${s.opened}/${s.goal}, ${s.status}`);
		const big = await page.evaluate(() => window.__bigChest);
		check('an opening chest pops out big and its coins fill the loot', big && s.butin > 0, `big chest ${big ? 'seen' : 'never seen'}, loot ${s.butin}`);
		await page.waitForTimeout(3000);
		s = await state(page);
		check('the counters catch up once the coins and chests land', s.flying === 0 && s.shown.opened === s.opened && s.shown.butin === s.butin, `chests ${s.shown.opened}/${s.opened}, loot ${s.shown.butin}/${s.butin}, ${s.flying} flying`);
		const reacted = [...moods].filter((m) => ['wow', 'cheer', 'fly'].includes(m));
		check('Bijou reacts to chests and chains', reacted.length > 0, [...moods].join(', '));
		// Either way a rule is checked: a won level pays the loot into the treasure, a lost one loses it.
		check(
			s.status === 'won' ? 'a won level pays the loot into the treasure' : 'a lost level loses its loot',
			s.status === 'won' ? s.hoard === s.butin && s.hoard > 0 : s.status === 'lost' && s.hoard === 0,
			`${s.status}, loot ${s.butin}, treasure ${s.hoard}`,
		);
		if (s.status === 'won') {
			// Bijou's two dance steps take turns: two at once looked like two dragons.
			const seen = [];
			for (let k = 0; k < 12; k++) {
				seen.push(await page.evaluate(() => [...document.querySelectorAll('.ec-dance img')].filter((im) => getComputedStyle(im).display !== 'none' && Number(getComputedStyle(im).opacity) > 0.5).length));
				await page.waitForTimeout(53);
			}
			check('Bijou dances as one dragon', seen.every((n) => n === 1), `visible steps per sample: ${seen.join('')}`);
		}
		await page.screenshot({ path: `${OUT}/desk-play.png` });
		check('desktop: no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
		await page.context().close();
	}

	/* ---- Free play: the gauge fills, a tap on Bijou sends his fireballs ---- */
	{
		const { page, errors } = await open(browser, { viewport: { width: 1280, height: 900 } });
		await page.getByRole('tab', { name: /Libre/ }).click();
		await until(page, (s) => s.mode === 'free' && s.phase === 'idle');
		await page.evaluate(() => {
			window.__seen = { ember: false, ball: false };
			new MutationObserver(() => {
				if (document.querySelector('.ec-flylayer .ec-ember')) window.__seen.ember = true;
				if (document.querySelector('.ec-flylayer .ec-fireball')) window.__seen.ball = true;
			}).observe(document.querySelector('.ec-flylayer'), { childList: true });
		});
		let s = await state(page);
		for (let k = 0; k < 40 && s.fire < s.fireFull && s.phase !== 'over'; k++) {
			const counts = await page.evaluate((dirs) => dirs.map((d) => window.__eclats.previewCount(d)), DIRS);
			await page.evaluate((d) => window.__eclats.swipe(d), DIRS[counts.indexOf(Math.max(...counts))]);
			await page.waitForTimeout(40);
			await idle(page);
			s = await state(page);
		}
		const ember = await page.evaluate(() => window.__seen.ember);
		check("destroyed gems fill Bijou's gauge, embers flying into it", s.fire === s.fireFull && ember, `gauge ${s.fire}/${s.fireFull} after ${s.moves} moves, embers ${ember ? 'seen' : 'never seen'}`);
		const ready = await page
			.waitForFunction(() => !!document.querySelector('.ec-fire.full:not(:disabled)') && !!document.querySelector('.ec-bijou.tap'), null, { timeout: 5000, polling: 100 })
			.then(() => '', (e) => e.message.slice(0, 160));
		const st = await state(page);
		check('a full gauge glows and Bijou becomes a button', !ready, `mood ${st.mood}, shown ${st.shown.fire}/${st.fireFull}, ${st.flying} flying, ${st.phase}${ready ? ` — ${ready}` : ''}`);
		await page.waitForTimeout(400); // the fill's last stretch is a 0.25 s transition
		await page.screenshot({ path: `${OUT}/breath-ready.png` });
		const before = await state(page);
		await page.click('.ec-bijou.tap');
		await page.waitForTimeout(330);
		await page.screenshot({ path: `${OUT}/breath-flight.png` });
		await idle(page);
		const after = await state(page);
		const ball = await page.evaluate(() => window.__seen.ball);
		check(
			'a tap on Bijou sends his fireballs: the gauge empties, the board makes room, no swipe spent',
			ball && after.fire === 0 && after.moves === before.moves && after.empty >= before.empty + 5 && after.score > before.score,
			`fireballs ${ball ? 'seen' : 'never seen'}, gauge ${before.fire} → ${after.fire}, moves ${before.moves} → ${after.moves}, empty ${before.empty} → ${after.empty}, score ${before.score} → ${after.score}`,
		);
		await page.waitForTimeout(800);
		s = await state(page);
		check('the gauge shows empty again, Bijou back to his perch', s.shown.fire === 0 && !(await page.$('.ec-bijou.tap')), `shown ${s.shown.fire}, mood ${s.mood}`);
		check('breath: no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
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
		await page.waitForTimeout(200);
		const lit = await page.locator('.ec-preview').count();
		await page.screenshot({ path: `${OUT}/phone-preview.png` });
		check('the blocks a swipe would explode light up while the finger is down', lit === Math.max(...counts), `${lit} lit, ${Math.max(...counts)} expected (${best})`);
		// The blocks the swipe would move lean its way; the ones it would not move stay put.
		const leans = () => page.evaluate(() => [...document.querySelectorAll('.ec-lean')].map((g) => {
			const m = new DOMMatrix(getComputedStyle(g).transform);
			return { on: g.classList.contains('on'), x: m.e, y: m.f };
		}));
		const moving = await page.evaluate((d) => window.__eclats.movingCount(d), best);
		const held = await leans();
		const pulled = held.filter((l) => l.on);
		const along = (l) => l.x * vx + l.y * vy;
		const across = (l) => Math.abs(l.x * vy) + Math.abs(l.y * vx);
		check('a held swipe pulls the blocks it would move its way, and only those',
			moving > 0 && pulled.length === moving && pulled.every((l) => along(l) > 0.5 && along(l) <= 1.5 + 1e-6 && across(l) < 0.01)
				&& held.filter((l) => !l.on).every((l) => l.x === 0 && l.y === 0),
			`${pulled.length} leaning, ${moving} would move, pull ${pulled.length ? along(pulled[0]).toFixed(2) : '-'} of 1.5 units`);
		const before = (await state(page)).moves;
		await touch('touchEnd', []);
		await page.waitForTimeout(80);
		const s = await state(page);
		check('lifting the finger plays the swipe', s.moves === before + 1, `${before} → ${s.moves} moves`);
		const swept = await page.locator(`.ec-sweep.${best}`).count();
		await page.screenshot({ path: `${OUT}/phone-sweep.png` });
		check('a played swipe sends a band of light across the board its way', swept === 1, `${swept} .ec-sweep.${best}`);
		await idle(page);

		// A finger lifted before the swipe threshold: no swipe, and the leaning blocks spring back.
		const free = await page.evaluate((dirs) => dirs.find((d) => window.__eclats.movingCount(d) > 0) ?? null, DIRS);
		if (free) {
			const [fx, fy] = vec[free];
			const was = (await state(page)).moves;
			await touch('touchStart', [[box.x, box.y]]);
			await touch('touchMove', [[box.x + fx * 6, box.y + fy * 6]]);
			await touch('touchMove', [[box.x + fx * 11, box.y + fy * 11]]);
			await page.waitForTimeout(150);
			const short = (await leans()).filter((l) => l.on).length;
			await touch('touchEnd', []);
			await page.waitForTimeout(250);
			const after = await leans();
			check('a short drag leans the blocks, then they come back without a swipe',
				short > 0 && after.every((l) => !l.on && Math.abs(l.x) < 1e-3 && Math.abs(l.y) < 1e-3) && (await state(page)).moves === was,
				`${short} leaning while held (${free}), ${after.filter((l) => l.x || l.y).length} still off after`);
		} else {
			check('a short drag leans the blocks, then they come back without a swipe', false, 'no direction moves anything');
		}

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
