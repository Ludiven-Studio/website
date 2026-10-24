// Rayou's touch buttons with real touch events (CDP) on a phone-sized page: a quick tap gives the whole jump,
// a thumb sliding from Rouler onto Sauter jumps out of the roll, a thumb just off Sauter still jumps, and a drag
// on the right still turns the camera. Usage: node scripts/check-rayou-touch.mjs [--url https://www.ludiven-studio.fr]
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const PORT = 4397;
const urlArg = process.argv.indexOf('--url');
const BASE = urlArg > 0 ? process.argv[urlArg + 1] : `http://localhost:${PORT}`;
const server = urlArg > 0 ? { stop() {} } : await startServer(PORT, { mode: 'dev' });
const results = [];
const check = (name, ok, detail) => {
	results.push(ok);
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} — ${detail}`);
};
try {
	const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(`${BASE}/jeux/rayou/`, { waitUntil: 'networkidle' });
	await page.evaluate(() => {
		localStorage.clear();
		localStorage.setItem('ludiven-tuto-seen', JSON.stringify(['rayou']));
	});
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => window.__rayou, null, { timeout: 60000 });
	await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
	const state = () => page.evaluate(() => window.__rayou.state);
	const wait = (ms) => page.waitForTimeout(ms);
	const until = async (pred, ms = 30000) => {
		const end = Date.now() + ms;
		while (Date.now() < end) {
			if (pred(await state())) return true;
			await wait(80);
		}
		return false;
	};
	await wait(1500);
	await page.click('#ry-play');
	await wait(900);
	await page.evaluate(() => window.__rayou.set({ tuto: 6 }));
	for (let i = 0; i < 60; i++) {
		if ((await state()).dialog) await page.evaluate(() => window.__rayou.advance());
		else if (i > 5) break;
		await wait(150);
	}
	// One game step of 1/60 s per drawn frame: the slow software renderer then plays the same physics.
	await page.evaluate(() => window.__rayou.fixed(1 / 60));
	// Per frame: highest point, whether Rayou curled up, camera yaw; and the touch events seen.
	await page.evaluate(() => {
		const s = (window.__samp = { top: -1e9, low: false, cam: [], touches: 0 });
		document.addEventListener('touchstart', () => s.touches++, true);
		const loop = () => {
			const st = window.__rayou.state;
			s.top = Math.max(s.top, st.pos[1]);
			s.low ||= st.low;
			s.cam.push(st.camYaw);
			requestAnimationFrame(loop);
		};
		loop();
	});
	const cdp = await page.context().newCDPSession(page);
	const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
	const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, sel);
	const fresh = async () => {
		await page.evaluate(() => window.__rayou.teleport(4, 6.5, Math.PI));
		await until((s) => s.grounded && !s.busy && s.speed < 0.05);
		await wait(300);
		const y0 = (await state()).pos[1];
		await page.evaluate(() => Object.assign(window.__samp, { top: -1e9, low: false, cam: [] }));
		return y0;
	};
	const landed = async () => {
		await wait(200);
		await until((s) => s.grounded && !s.busy, 20000);
		return page.evaluate(() => window.__samp);
	};
	const jump = await rect('#ry-btn-jump');
	const roll = await rect('#ry-btn-roll');

	// 1. A quick tap: the full jump.
	let y0 = await fresh();
	await touch('touchStart', [[jump.cx, jump.cy]]);
	await wait(60);
	await touch('touchEnd', []);
	let s = await landed();
	const tapH = s.top - y0;
	check('touch events reach the page', s.touches > 0, `${s.touches} touchstart`);
	check('a 60 ms tap jumps the full height', tapH > 1.05, `${tapH.toFixed(2)} m`);

	// 2. Space let go at once still cuts the jump.
	y0 = await fresh();
	await page.keyboard.down('Space');
	await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
	await page.keyboard.up('Space');
	s = await landed();
	check('Space let go at once still gives the small jump', s.top - y0 < tapH - 0.1, `${(s.top - y0).toFixed(2)} m vs tap ${tapH.toFixed(2)} m`);

	// 3. Slide from Rouler onto Sauter without lifting: a roll, then a jump, camera untouched.
	y0 = await fresh();
	await touch('touchStart', [[roll.cx, roll.cy]]);
	for (let k = 1; k <= 6; k++) {
		await wait(25);
		await touch('touchMove', [[roll.cx + ((jump.cx - roll.cx) * k) / 6, roll.cy + ((jump.cy - roll.cy) * k) / 6]]);
	}
	const down = await page.evaluate(() => document.querySelector('#ry-btn-jump').classList.contains('ry-down'));
	await wait(60);
	await touch('touchEnd', []);
	s = await landed();
	const camMoved = Math.max(...s.cam) - Math.min(...s.cam);
	check('Rouler→Sauter slide rolls then jumps', s.low && s.top - y0 > 0.8, `rolled ${s.low}, height ${(s.top - y0).toFixed(2)} m, Sauter lit ${down}`);
	check('the slide leaves the camera alone', camMoved < 0.02, `camera turned ${camMoved.toFixed(3)} rad`);
	const up = await page.evaluate(() => document.querySelector('#ry-btn-jump').classList.contains('ry-down'));
	check('Sauter unlit after the slide', !up, `lit ${up}`);

	// 4. A thumb in the gap between Rouler and Sauter, 6 px off Sauter: still a jump, not a camera drag.
	y0 = await fresh();
	const gapX = jump.x - 6;
	await touch('touchStart', [[gapX, jump.cy]]);
	await touch('touchMove', [[gapX - 10, jump.cy]]);
	await wait(60);
	await touch('touchEnd', []);
	s = await landed();
	const camGap = Math.max(...s.cam) - Math.min(...s.cam);
	check('6 px off Sauter still jumps, camera untouched', s.top - y0 > 1.05 && camGap < 0.02, `${(s.top - y0).toFixed(2)} m, camera turned ${camGap.toFixed(3)} rad`);

	// 5. A drag on the right half still turns the camera.
	await fresh();
	await touch('touchStart', [[600, 150]]);
	for (let k = 1; k <= 5; k++) {
		await wait(30);
		await touch('touchMove', [[600 - k * 25, 150]]);
	}
	await touch('touchEnd', []);
	await wait(400);
	s = await page.evaluate(() => window.__samp);
	const camDrag = Math.max(...s.cam) - Math.min(...s.cam);
	check('a drag on the right still turns the camera', camDrag > 0.1, `camera turned ${camDrag.toFixed(3)} rad`);

	check('no page error', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
	await browser.close();
} finally {
	server.stop();
}
const passed = results.every(Boolean);
console.log(passed ? 'all touch checks passed' : 'some touch checks FAILED');
process.exit(passed ? 0 : 1);
