// Plays through the Rayou prototype with the test hook and captures each beat.
// Usage: node scripts/snap-rayou.mjs [outDir] [--mobile] [--only name,name]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { startServer } from './preview-server.mjs';

const PORT = 4396;
const OUT = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'D:/tmp/rayou';
const MOBILE = process.argv.includes('--mobile');
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : null;
mkdirSync(OUT, { recursive: true });

const server = await startServer(PORT, { mode: 'dev' });
try {
	const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage(
		MOBILE ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 760 } },
	);
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	await page.goto(`http://localhost:${PORT}/prototypes/rayou/`, { waitUntil: 'networkidle' });
	await page.evaluate(() => localStorage.clear());
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForFunction(() => window.__rayou, null, { timeout: 60000 });
	// The dev toolbar sits over the bottom of a short landscape screen.
	await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important}' });
	const T = (fn, ...a) => page.evaluate(([src, args]) => new Function('t', 'a', `return (${src})(t, ...a)`)(window.__rayou, args), [fn.toString(), a]);
	const state = () => page.evaluate(() => window.__rayou.state);
	const spots = await page.evaluate(() => window.__rayou.spots);
	const wait = (ms) => page.waitForTimeout(ms);
	const want = (name) => !ONLY || ONLY.some((o) => name.startsWith(o));
	const shot = async (name) => {
		if (!want(name)) return;
		await page.screenshot({ path: `${OUT}/${MOBILE ? 'm-' : ''}${name}.png` });
		const s = await state();
		console.log(name, JSON.stringify({ pos: s.pos.map((v) => +v.toFixed(2)), obj: s.objective, act: s.action, region: s.region, jars: s.jars, gold: s.gold }));
	};
	// The software renderer runs the game clock slower than real time: wait on state, not on ms.
	const until = async (pred, ms = 30000) => {
		const end = Date.now() + ms;
		while (Date.now() < end) {
			if (pred(await state())) return true;
			await wait(100);
		}
		console.log('  (timed out waiting)');
		return false;
	};
	// Press until something happens: a slow frame can miss a single press.
	const act = async () => {
		await talkThrough();
		await until((s) => !s.busy);
		const before = JSON.stringify((await state()).S);
		for (let i = 0; i < 4; i++) {
			await T((t) => t.press('action'));
			const moved = await until((s) => s.dialog || s.busy || JSON.stringify(s.S) !== before, 2500);
			if (moved) return;
		}
	};
	// Dialogs chain into each other: done only when none is open twice in a row.
	const talkThrough = async () => {
		for (let i = 0, quiet = 0; i < 200 && quiet < 2; i++) {
			if ((await state()).dialog) {
				quiet = 0;
				await T((t) => t.advance());
				await T((t) => t.advance());
			} else quiet++;
			await wait(150);
		}
	};
	const tp = async (x, z, yaw, y) => {
		await until((s) => !s.busy);
		await T((t, x, z, yaw, y) => t.teleport(x, z, yaw, y), x, z, yaw, y);
	};
	const near = async (p, dx = 0, dz = 1.6) => {
		await tp(p.x + dx, p.z + dz, Math.atan2(-dx, -dz));
		await wait(400);
	};

	await wait(1500);
	await shot('00-intro');
	await page.click('#play');
	await wait(900);
	await shot('01-start');
	// Tutorial cards: run a bit to clear the first one, then show the roll card.
	await T((t) => t.drive(Math.PI, 4.8));
	await until((s) => s.S.tuto >= 1, 15000);
	await T((t) => t.drive(null));
	await wait(900);
	await shot('01a-tuto-cam');
	await T((t) => t.set({ tuto: 3 }));
	await wait(600);
	await shot('01a-tuto-roll');
	await T((t) => t.press('roll'));
	await wait(500);
	await T((t) => t.press('roll'));
	await until((s) => s.S.tuto >= 4, 15000);
	await shot('01a-tuto-longjump');
	await T((t) => t.set({ tuto: 6 }));
	await tp(4, 6.5, Math.PI);
	if (want('01b')) {
		await page.click('#btn-menu');
		await wait(500);
		await shot('01b-menu');
		await page.click('.tab[data-tab=map]');
		await wait(500);
		await shot('01c-map');
		await page.click('.tab[data-tab=controls]');
		await wait(400);
		await shot('01d-controls');
		await page.click('#resume');
		await wait(300);
	}

	// Feuille's nut.
	await near(spots.npcs.feuille, 0.4, 1.8);
	await act();
	await wait(1200);
	await shot('02-feuille');
	await talkThrough();
	const hs = spots.hazelSteps;
	await tp(hs[0].x - 2.2, hs[0].z - 0.8, Math.atan2(hs[2].x - hs[0].x + 2.2, hs[2].z - hs[0].z + 0.8));
	await T((t) => t.setCam(-0.9, 0.35));
	await wait(900);
	await shot('03-rocks');
	await tp(hs[2].x, hs[2].z, Math.atan2(hs[3].x - hs[2].x, hs[3].z - hs[2].z), hs[2].y);
	await wait(900);
	await shot('03b-rocks-up');
	await near(spots.questNut, 0.6, 0.6);
	await act();
	await wait(300);
	await shot('04-carry');
	await near(spots.npcs.feuille, 0.4, 1.8);
	await act();
	await talkThrough();
	await wait(800);
	await shot('05-party');

	// Owl through the trunk gate.
	await tp(0.3, -32.5, Math.PI);
	await T((t) => t.setCam(0.2, 0.25));
	await wait(800);
	await talkThrough();
	await shot('06-trunk');
	await T((t) => t.drive(Math.PI, 4.8));
	await wait(200);
	await T((t) => t.press('roll'));
	await wait(350);
	await shot('07-rolling');
	await wait(900);
	await T((t) => t.drive(null));
	await near(spots.npcs.owl, 0, 2.0);
	await act();
	await wait(1300);
	await shot('08-owl');
	await talkThrough();
	await T((t) => t.setCam(0, 0.3));
	await tp(0, -30, 0);
	await wait(1500);
	await shot('09-oak-valley');

	// River.
	await near(spots.npcs.beaver, -1.6, 0.6);
	await act();
	await wait(1000);
	await shot('10-beaver');
	await talkThrough();
	for (const [k, b] of spots.branches.entries()) {
		for (let tries = 0; tries < 3 && (await state()).S.branches <= k; tries++) {
			if (!(await state()).S.carry) {
				await tp(b.x - 0.7, b.z, Math.PI / 2);
				await wait(300);
				await act();
			}
			await near(spots.npcs.beaver, -1.6, 0.6);
			await act();
			await talkThrough();
		}
	}
	await wait(1500);
	await shot('11-dam');
	await tp(spots.dam.x, spots.dam.z, Math.PI / 2);
	await T((t) => t.setCam(-1.2, 0.35));
	await wait(900);
	await shot('12-dam-built');
	await talkThrough();

	// Forest.
	await near(spots.npcs.simone, 1.6, 0.4);
	await act();
	await talkThrough();
	await tp(-42.8, -15.5, 0);
	await T((t) => t.setCam(Math.PI, 0.35));
	await wait(600);
	await shot('13-forest-log');
	for (const b of spots.babies) {
		await tp(b.x + 0.3, b.z + 0.3, 0, b.y);
		await wait(600);
		await talkThrough();
	}
	await tp(spots.npcs.simone.x + 4, spots.npcs.simone.z, -Math.PI / 2);
	await wait(300);
	await T((t) => t.drive(-Math.PI / 2, 3));
	await wait(900);
	await shot('14-babies-follow');
	await T((t) => t.drive(null));
	await tp(spots.npcs.simone.x + 1.8, spots.npcs.simone.z, -Math.PI / 2);
	await until((s) => s.S.babiesHome === 5 || s.dialog, 15000);
	await talkThrough();
	await wait(300);
	await talkThrough();
	await shot('15-simone-done');
	if (want('15b')) {
		await page.click('#counters');
		await wait(600);
		await shot('15b-bag');
		await page.click('#resume');
		await wait(300);
	}

	// Mill.
	await near(spots.npcs.caline, 1.2, 1.2);
	await act();
	await talkThrough();
	await tp(spots.kite.x + 0.6, spots.kite.z + 0.6, -2.4, spots.kite.y);
	await T((t) => t.setCam(0.7, 0.45));
	await wait(700);
	await shot('16-mill-top');
	await act();
	await near(spots.npcs.caline, 1.2, 1.2);
	await act();
	await talkThrough();
	await wait(300);
	await talkThrough();
	await tp(spots.npcs.caline.x + 6, spots.npcs.caline.z + 6, -2.4);
	await T((t) => t.setCam(0.8, 0.15));
	await wait(900);
	await shot('17-kite');

	// Lake.
	await near(spots.npcs.frog, -1.2, -1.0);
	await act();
	await wait(900);
	await shot('18-frog');
	await talkThrough();
	await tp(5.2, 40.2, Math.PI * 0.1, -0.3);
	await T((t) => t.setCam(Math.PI + 0.3, 0.35));
	await wait(700);
	await shot('19-pads');
	for (const o of spots.orbs) {
		await tp(o.x, o.z, 0, o.y - 0.7);
		await until((s) => s.S.taken.includes(o.id), 8000);
	}
	await near(spots.npcs.frog, -1.2, -1.0);
	await act();
	await talkThrough();
	await wait(300);
	await talkThrough();

	// Owl again, then the Peak.
	await near(spots.npcs.owl, 0, 2.0);
	await act();
	await talkThrough();
	await shot('20-owl-lantern');
	const m = spots.mount;
	await tp(m.x - 30, m.z + 18, 0.9);
	await T((t) => t.setCam(-2.3, 0.3));
	await wait(900);
	await shot('21-peak');
	const pc = spots.climbs.find((c) => c.id === 'peak');
	await tp(pc.base.x, pc.base.z, 0, pc.base.y);
	await wait(500);
	await shot('22-peak-climb');
	await tp(m.x + Math.cos(-2.3) * 15.5, m.z + Math.sin(-2.3) * 15.5, 0.4);
	await wait(600);
	await shot('23-peak-slab');
	await tp(spots.lantern.x + 1.8, spots.lantern.z + 1.8, -2.4, 23);
	await wait(500);
	await shot('24-summit');
	await act();
	await wait(4500);
	await shot('25-lantern-lit');
	await wait(2000);
	await until((s) => s.dialog, 20000);
	for (let i = 0; i < 30 && (await page.evaluate(() => !/Là-bas/.test(document.getElementById('dlg-text').textContent ?? ''))); i++) {
		await T((t) => t.advance());
		await wait(300);
	}
	await wait(1200);
	await shot('26-far-light');
	for (let i = 0; i < 300 && (await page.evaluate(() => document.getElementById('end').hidden)); i++) {
		await T((t) => t.advance());
		await wait(250);
	}
	await wait(500);
	await shot('27-end');

	console.log('errors:', errors.length ? errors : 'none');
	await browser.close();
} finally {
	server.stop();
}
