// Plays the Tygo prototype quest end to end and captures each beat, plus side views of the gait.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { startServer } from './preview-server.mjs';

const PORT = 4396;
const OUT = process.argv[2] ?? 'D:/tmp/tygo';
const MOBILE = process.argv.includes('--mobile');
mkdirSync(OUT, { recursive: true });

const server = await startServer(PORT, { mode: 'dev' });
try {
	const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage(MOBILE ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 760 } });
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	await page.goto(`http://localhost:${PORT}/prototypes/tygo/`, { waitUntil: 'networkidle' });
	await page.waitForFunction(() => window.__tygo);
	const T = (fn, ...a) => page.evaluate(([src, args]) => new Function('t', 'a', `return (${src})(t, ...a)`)(window.__tygo, args), [fn.toString(), a]);
	const state = () => page.evaluate(() => window.__tygo.state);
	const spots = await page.evaluate(() => window.__tygo.spots);
	const shot = async (name) => {
		await page.screenshot({ path: `${OUT}/${MOBILE ? 'm-' : ''}${name}.png` });
		console.log(name, JSON.stringify(await state()));
	};
	const wait = (ms) => page.waitForTimeout(ms);
	const act = async () => {
		await page.keyboard.press('KeyE');
		await wait(250);
	};
	const talkThrough = async () => {
		for (let i = 0; i < 12 && (await state()).dialog; i++) {
			await act();
			await act();
		}
	};

	await wait(1500);
	await shot('01-intro');
	await page.click('#play');
	await wait(800);
	await shot('02-start');

	// Gait, seen from the side: walk, run, then idle long enough to sit.
	await T((t) => t.teleport(4, 10, Math.PI / 2));
	for (const [name, speed, ms] of [['03-walk', 1.6, 900], ['04-trot', 3, 700], ['05-gallop', 4.6, 600]]) {
		await T((t, s) => t.drive(-Math.PI / 2, s), speed);
		await T((t) => t.setCam(0, 0.12));
		await wait(ms);
		await shot(name);
	}
	await T((t) => t.drive(null));
	await wait(5500);
	await shot('06-sit');

	await T((t, x, z) => t.teleport(x, z + 1.9, Math.PI), ...spots.sally);
	await wait(600);
	await act();
	await wait(1500);
	await shot('07-dialog');
	await talkThrough();
	await shot('08-objective');

	const [cx, cz] = spots.climb;
	await T((t, x, z) => t.teleport(x - 1.2, z + 0.6, 2.2), cx, cz);
	await T((t) => t.setCam(-0.9, 0.3));
	await wait(800);
	await shot('09-climb-spot');
	await act();
	await wait(1100);
	await shot('10-climbing');
	await wait(1800);
	await shot('11-on-top');

	const [nx, nz] = spots.nut;
	await T((t, x, z) => t.teleport(x - 0.8, z - 0.6, 0.9), nx, nz);
	await wait(700);
	await act();
	await T((t) => t.setCam(0.9 + Math.PI / 2, 0.2));
	await wait(600);
	await shot('12-carry');
	// Jump off the rock, back towards the house.
	await T((t, x, z) => t.teleport(x + 1.5, z - 0.6, 0), cx, cz);
	await T((t, x, z) => t.teleport(x, z, 0), ...(await page.evaluate(() => [window.__tygo.state.pos[0], window.__tygo.state.pos[2]])));
	await T((t, x, z) => t.teleport(x, z + 1.9, Math.PI), ...spots.sally);
	await wait(600);
	await act();
	await wait(800);
	await shot('13-give');
	await talkThrough();
	await wait(1200);
	await shot('14-party');
	await wait(3500);
	await shot('15-end');
	console.log('errors:', errors.length ? errors : 'none');
	await browser.close();
} finally {
	server.stop();
}
