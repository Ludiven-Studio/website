// Dragon Gems Swipe (gameId eclats) in a real browser: the level opens on its ready gate, its drawn gems
// and Bijou load, the arrow keys swipe the board, a finger swipe does too (CDP touch events on a
// phone-sized page), the blocks a swipe would explode light up while the finger is still down, the ones
// it would move get a tug its way as the drag starts and are back in place before it ends, a played
// swipe sweeps a band of light, a run of swipes explodes blocks and opens chests big, their coins fill the loot, Bijou reacts, and the loot
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
	// React's warnings too (a duplicate key once hid a chain or a gem's name); failed loads, the missing sw.js
	// among them, are checked below.
	const loads = /^Failed to load resource|^A bad HTTP response code \(404\) was received when fetching the script/;
	const devBar = /^%cAstro/; // the dev toolbar's own audits, not the game
	page.on('console', (m) => m.type() === 'error' && !loads.test(m.text()) && !devBar.test(m.text()) && errors.push(m.text().slice(0, 400)));
	// The dev server has no sw.js: that 404 is expected. The database has no get_daily (seen 2026-10-27): every
	// daily falls back to its seed of the day, computed the same on every device.
	page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/sw.js') && !r.url().endsWith('/rpc/get_daily') && errors.push(`${r.status()} ${r.url()}`));
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
		const said = await page.evaluate(() => document.querySelector('.ec-root [role="status"]')?.textContent ?? '');
		check('a screen reader is told what the move did', /coffres? sur 3/.test(said), `"${said}"`);
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
		// Into the daily and straight out: its seed, coming back late, must not deal the daily over free play.
		await page.getByRole('tab', { name: /Défi/ }).click();
		await page.getByRole('tab', { name: /Libre/ }).click();
		await page.waitForTimeout(2500);
		const late = await state(page);
		const gate = await page.$('.ec-start');
		check('a daily seed that comes back after leaving the daily changes nothing', late.mode === 'free' && late.phase === 'idle' && !gate,
			`${late.mode} / ${late.phase}, ${gate ? 'a start gate' : 'no start gate'}`);
		await until(page, (s) => s.mode === 'free' && s.phase === 'idle');
		// A swipe made while the last one plays is kept, and plays once it ends: the opposite way always moves something.
		{
			const back = { up: 'down', down: 'up', left: 'right', right: 'left' };
			const m0 = (await state(page)).moves;
			const first = await page.evaluate((dirs) => dirs.find((d) => window.__eclats.movingCount(d) > 0), DIRS);
			await page.evaluate((d) => window.__eclats.swipe(d), first);
			await page.waitForTimeout(30);
			const during = (await state(page)).phase;
			await page.evaluate((d) => window.__eclats.swipe(d), back[first]);
			await until(page, (s) => s.moves === m0 + 2 && (s.phase === 'idle' || s.phase === 'over'));
			const after = await state(page);
			check('a swipe made during a cascade is kept and played once it ends', during === 'busy' && after.moves === m0 + 2,
				`${during} when the second came, moves ${m0} → ${after.moves}`);
		}
		await page.evaluate(() => {
			window.__seen = { ember: false, ball: false };
			new MutationObserver(() => {
				if (document.querySelector('.ec-flylayer .ec-ember')) window.__seen.ember = true;
				if (document.querySelector('.ec-flylayer .ec-fireball')) window.__seen.ball = true;
			}).observe(document.querySelector('.ec-flylayer'), { childList: true });
		});
		let s = await state(page);
		// The score counts up as the waves go off: the engine has the swipe's total at once, the chip must not.
		const chip = () => page.evaluate(() => Number(document.querySelector('.ec-hud .ec-chip strong')?.textContent.replace(/\D/g, '')));
		{
			const was = await chip();
			await page.evaluate((dirs) => {
				const c = dirs.map((d) => window.__eclats.previewCount(d));
				window.__eclats.swipe(dirs[c.indexOf(Math.max(...c))]);
			}, DIRS);
			await page.waitForTimeout(60);
			const early = await chip();
			const total = (await state(page)).score;
			await idle(page);
			await page.waitForTimeout(150);
			const end = await chip();
			check('the score counts up with the explosions, not at the swipe', total > was && early === was && end === total,
				`${was} → ${early} at 60 ms → ${end}, ${total} for the swipe`);
			s = await state(page);
		}
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
		// Fill the board with swipes that explode nothing: only the breath can play then, and the board says so.
		for (let k = 0; k < 40 && s.empty > 0; k++) {
			const quiet = await page.evaluate((dirs) => dirs
				.map((d) => ({ d, boom: window.__eclats.previewCount(d), moved: window.__eclats.movingCount(d) }))
				.filter((o) => o.moved > 0)
				.sort((a, b) => a.boom - b.boom)[0]?.d, DIRS);
			if (!quiet) break;
			await page.evaluate((d) => window.__eclats.swipe(d), quiet);
			await page.waitForTimeout(40);
			await idle(page);
			s = await state(page);
		}
		const stuck = await page.waitForFunction(() => document.querySelector('.ec-stuck')?.textContent ?? '', null, { timeout: 4000 }).then((h) => h.jsonValue(), () => '');
		check('a full board with a full gauge says only the breath can save it', s.empty === 0 && s.status === 'playing' && stuck.includes('Plus de place') && stuck.includes('Souffle'),
			`${s.empty} empty, ${s.status}, "${stuck}"`);
		await page.screenshot({ path: `${OUT}/breath-ready.png` });
		const before = await state(page);
		// When blocks leave the board: what each fireball hits must go as it lands, one after another. Taking them all at
		// the first landing put the next ones 640 ms later at least; timers slip here, so 170 ms comes out at 200-500.
		await page.evaluate(() => {
			const svg = document.querySelector('.ec-svg');
			const t0 = performance.now();
			let n = svg.querySelectorAll('.ec-tug').length;
			window.__drops = [];
			window.__dropObs = new MutationObserver(() => {
				const m = svg.querySelectorAll('.ec-tug').length;
				if (m < n) window.__drops.push(Math.round(performance.now() - t0));
				n = m;
			});
			window.__dropObs.observe(svg, { childList: true, subtree: true });
		});
		await page.click('.ec-bijou.tap');
		await idle(page);
		const after = await state(page);
		const drops = await page.evaluate(() => { window.__dropObs.disconnect(); return window.__drops; });
		const gap = drops.length > 1 ? drops[1] - drops[0] : null;
		check('the fireballs land one after another, each taking its blocks as it lands', gap !== null && gap >= 100 && gap <= 600,
			`blocks left at ${drops.slice(0, 4).join(', ')} ms`);
		const ball = await page.evaluate(() => window.__seen.ball);
		check(
			'a tap on Bijou sends his fireballs: the gauge empties, the board makes room, no swipe spent',
			ball && after.fire === 0 && after.moves === before.moves && after.empty >= before.empty + 5 && after.score > before.score,
			`fireballs ${ball ? 'seen' : 'never seen'}, gauge ${before.fire} → ${after.fire}, moves ${before.moves} → ${after.moves}, empty ${before.empty} → ${after.empty}, score ${before.score} → ${after.score}`,
		);
		await page.waitForTimeout(800);
		s = await state(page);
		const stillStuck = !!(await page.$('.ec-stuck'));
		check('the gauge shows empty again, Bijou back to his perch, the board free', s.shown.fire === 0 && !(await page.$('.ec-bijou.tap')) && !stillStuck,
			`shown ${s.shown.fire}, mood ${s.mood}${stillStuck ? ', still says stuck' : ''}`);
		check('breath: no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
		await page.context().close();
	}

	/* ---- Daily: an ended run comes back with how it really ended ---- */
	{
		const { page, errors } = await open(browser, { viewport: { width: 1280, height: 900 } });
		await page.getByRole('tab', { name: /Défi/ }).click();
		await until(page, (s) => s.mode === 'daily' && s.phase === 'ready');
		await page.click('.ec-start');
		await until(page, (s) => s.phase === 'idle');
		await page.evaluate((dirs) => window.__eclats.swipe(dirs.find((d) => window.__eclats.movingCount(d) > 0)), DIRS);
		await idle(page);
		// The saved attempt, turned into an ended one: lost on a full board, then given up.
		const ends = [];
		for (const quit of [false, true]) {
			await page.evaluate((quit) => {
				const key = Object.keys(localStorage).find((k) => k.startsWith('ludiven-dailyrun-eclats-'));
				const run = JSON.parse(localStorage.getItem(key));
				localStorage.setItem(key, JSON.stringify({ ...run, done: true, abandoned: true, finalTime: 1234, state: { ...run.state, quit } }));
			}, quit);
			await page.reload({ waitUntil: 'networkidle' });
			await page.getByRole('tab', { name: /Défi/ }).click();
			ends.push(await page.waitForFunction(() => document.querySelector('.ec-card h2')?.textContent ?? '', null, { timeout: 10000 }).then((h) => h.jsonValue(), () => ''));
		}
		check('a daily lost on a full board comes back lost, a given-up one given up', ends[0] === 'Le plateau est plein' && ends[1] === 'Défi abandonné',
			ends.map((e) => `"${e}"`).join(' then '));
		check('daily: no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
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
		// Commencer scrolls the page down to the game: wait until it stops before touching the board.
		await page.waitForFunction(() => new Promise((done) => {
			const y = scrollY;
			setTimeout(() => done(scrollY === y), 150);
		}), null, { timeout: 5000, polling: 200 });
		const framed = await page.evaluate(() => {
			const tag = document.querySelector('.ec-tag').getBoundingClientRect();
			const board = document.querySelector('.ec-boardwrap').getBoundingClientRect();
			return { tag: Math.round(tag.top), bottom: Math.round(board.bottom), h: innerHeight };
		});
		check('Commencer brings the goal and the whole board into view', framed.tag >= 0 && framed.bottom <= framed.h,
			`goal at ${framed.tag} px, board bottom at ${framed.bottom} of ${framed.h} px`);
		const cdp = await page.context().newCDPSession(page);
		const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
		const box = await page.evaluate(() => { const r = document.querySelector('.ec-boardwrap').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
		const vec = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

		// A direction that explodes something, if any: its blocks light up before the finger lifts.
		const counts = await page.evaluate((dirs) => dirs.map((d) => window.__eclats.previewCount(d)), DIRS);
		const best = DIRS[counts.indexOf(Math.max(...counts))];
		const [vx, vy] = vec[best];
		// Each block's offset from its cell, and whether a tug still runs on it.
		const tugs = () => page.evaluate(() => [...document.querySelectorAll('.ec-tug')].map((g) => {
			const m = new DOMMatrix(getComputedStyle(g).transform);
			return { x: m.e, y: m.f, running: g.getAnimations().length > 0 };
		}));
		const off = (l) => Math.abs(l.x) > 1e-3 || Math.abs(l.y) > 1e-3;
		const along = (l) => l.x * vx + l.y * vy;
		const across = (l) => Math.abs(l.x * vy) + Math.abs(l.y * vx);
		const moving = await page.evaluate((d) => window.__eclats.movingCount(d), best);
		await touch('touchStart', [[box.x, box.y]]);
		await touch('touchMove', [[box.x + vx * 12, box.y + vy * 12]]);
		const t0 = Date.now();
		// Every frame of the first tug: how far the blocks go its way, and back past their place the other way.
		const trace = page.evaluate(([vx, vy]) => new Promise((done) => {
			const start = performance.now();
			let most = 0, least = 0, side = 0;
			const frame = () => {
				for (const g of document.querySelectorAll('.ec-tug')) {
					const m = new DOMMatrix(getComputedStyle(g).transform);
					const a = m.e * vx + m.f * vy;
					most = Math.max(most, a);
					least = Math.min(least, a);
					side = Math.max(side, Math.abs(m.e * vy) + Math.abs(m.f * vx));
				}
				if (performance.now() - start < 760) requestAnimationFrame(frame);
				else done({ most, least, side });
			};
			requestAnimationFrame(frame);
		}), [vx, vy]);
		await page.waitForTimeout(60);
		const pulled = (await tugs()).filter(off);
		check('a starting swipe tugs the blocks it would move its way, and only those',
			moving > 0 && pulled.length === moving && pulled.every((l) => along(l) > 0.5 && along(l) <= 2.5 * 1.15 && across(l) < 0.01),
			`${pulled.length} tugged, ${moving} would move, ${pulled.length ? along(pulled[0]).toFixed(2) : '-'} of 2.5 units at 60 ms`);
		for (let k = 2; k <= 4; k++) {
			await page.waitForTimeout(20);
			await touch('touchMove', [[box.x + vx * k * 12, box.y + vy * k * 12]]);
		}
		// Out to the reach and no further, then back 15 % past their place (-0.385) at about 610 ms.
		const { most, least, side } = await trace;
		check('the tug stretches to its reach, then bounces back a little past the blocks\' place',
			most >= 2.45 && most <= 2.51 && least < -0.25 && least >= -0.5 && side < 0.01,
			`${most.toFixed(2)} of 2.5 units out, ${least.toFixed(2)} back, ${side.toFixed(3)} across`);
		// Out 0.5 s, back 0.2 s, then at rest until the next second. Timed, so before any screenshot (~0.5 s each).
		await page.waitForTimeout(Math.max(0, 850 - (Date.now() - t0)));
		const held = await tugs();
		check('the tugged blocks are back in place while the finger is still down',
			held.every((l) => !off(l) && !l.running), `${held.filter(off).length} still off, ${held.filter((l) => l.running).length} still running at ${Date.now() - t0} ms`);
		// Nothing runs since the check above, so the next tug to start is the second one.
		const againAt = await page.waitForFunction(() => [...document.querySelectorAll('.ec-tug')].some((g) => g.getAnimations().length > 0), null, { timeout: 1500, polling: 'raf' })
			.then(() => Date.now() - t0, () => null);
		const again = (await tugs()).filter((l) => l.running).length;
		check('a finger that holds tugs them again every second', againAt !== null && againAt >= 900 && againAt <= 1300 && again === moving,
			`${again} tugged again at ${againAt ?? '-'} ms, ${moving} would move`);
		const lit = await page.locator('.ec-preview').count();
		await page.screenshot({ path: `${OUT}/phone-preview.png` });
		check('the blocks a swipe would explode light up while the finger is down', lit === Math.max(...counts), `${lit} lit, ${Math.max(...counts)} expected (${best})`);
		const before = (await state(page)).moves;
		await touch('touchEnd', []);
		await page.waitForTimeout(80);
		const s = await state(page);
		check('lifting the finger plays the swipe', s.moves === before + 1, `${before} → ${s.moves} moves`);
		const swept = await page.locator(`.ec-sweep.${best}`).count();
		await page.screenshot({ path: `${OUT}/phone-sweep.png` });
		check('a played swipe sends a band of light across the board its way', swept === 1, `${swept} .ec-sweep.${best}`);
		await idle(page);

		// Under 8 px nothing moves; a short drag lifted before the swipe threshold tugs, then no swipe.
		const free = await page.evaluate((dirs) => dirs.find((d) => window.__eclats.movingCount(d) > 0) ?? null, DIRS);
		if (free) {
			const [fx, fy] = vec[free];
			const was = (await state(page)).moves;
			await touch('touchStart', [[box.x, box.y]]);
			await touch('touchMove', [[box.x + fx * 6, box.y + fy * 6]]);
			await page.waitForTimeout(60);
			const still = (await tugs()).filter(off).length;
			await touch('touchMove', [[box.x + fx * 11, box.y + fy * 11]]);
			const t1 = Date.now();
			await page.waitForTimeout(60);
			const short = (await tugs()).filter(off).length;
			await touch('touchEnd', []);
			await page.waitForTimeout(Math.max(0, 850 - (Date.now() - t1)));
			const after = await tugs();
			check('a short drag tugs the blocks from 8 px, then they are back without a swipe',
				still === 0 && short > 0 && after.every((l) => !off(l) && !l.running) && (await state(page)).moves === was,
				`${still} off at 6 px, ${short} tugged at 11 px (${free}), ${after.filter(off).length} still off after`);
			// The second tug would be running now if the release had not stopped the clock.
			await page.waitForTimeout(Math.max(0, 1100 - (Date.now() - t1)));
			const later = await tugs();
			check('letting go stops the tugs', later.every((l) => !off(l) && !l.running),
				`${later.filter((l) => l.running).length} running at ${Date.now() - t1} ms`);
		} else {
			check('a short drag tugs the blocks from 8 px, then they are back without a swipe', false, 'no direction moves anything');
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
