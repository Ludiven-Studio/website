/* The shop's decor pictures: public/assets/jeux/petanque/decor/preview-<id>.webp, one per decor
   (jardin, place, soir, port), taken from the game itself through the `__petanqueDecor` hook. Same
   deal, same camera for all four, the HUD hidden. Each on a fresh page: the afternoon sun the day
   decors share is forced through `__petanqueSun`, which cannot be unset and would override the
   dusk light, and the camera drag adds to wherever the eye already is.

     node scripts/snap-petanque-decor.mjs            (dev server on port 4433)
     PET_DECOR_OUT=D:/tmp node scripts/...           (also keep the full-size PNGs there) */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { startServer } from './preview-server.mjs';

const PORT = 4433;
const DIR = 'public/assets/jeux/petanque/decor';
const KEEP = process.env.PET_DECOR_OUT || '';
const ORDER = ['soir', 'place', 'port', 'jardin'];
// Unity's afternoon sun (Scenery.cs): 38 deg up, from across the lane.
const SUN = { el: 38, az: 170 };
// The gaze lifted over the lane and turned a little toward the harbour's side, so the port's
// picture shows its sea; the same drag for all four.
const LOOK = { dx: Number(process.env.PET_DECOR_DX ?? -70), dy: -90 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await startServer(PORT, { mode: 'dev' });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const errs = [];
try {
	const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));

	/* The game view at the start of a deal, the gaze lifted a little so the square shows over the
	   lane. Marked, so a dev-server reload (an edit elsewhere) is noticed instead of photographed. */
	const arm = async () => {
		await page.goto(`http://localhost:${PORT}/jeux/petanque/`, { waitUntil: 'networkidle', timeout: 120000 });
		await page.waitForSelector('.pe-canvas', { timeout: 60000 });
		await page.waitForFunction(() => window.__petanque?.().status === 'aim', null, { timeout: 60000 });
		await page.addStyleTag({ content: 'body * { visibility: hidden !important; } .pe-canvas { visibility: visible !important; }' });
		await page.evaluate(() => { window.__snapArmed = true; });
	};
	const armed = () => page.evaluate(() => window.__snapArmed === true).catch(() => false);

	/* Sun and decor laid again right before the picture: a hot update of the game re-lays its deal in
	   the player's own decor without reloading the page, so the mark alone does not see it. */
	const dress = async (id) => {
		if (id !== 'soir') await page.evaluate(({ el, az }) => window.__petanqueSun(el, az), SUN);
		await page.evaluate((d) => window.__petanqueDecor(d), id);
		await page.waitForLoadState('networkidle');
	};

	// Each picture on a fresh page: the drag adds to wherever the eye already is, and only a fresh
	// page starts the dusk without a forced sun.
	const shoot = async (id) => {
		for (let attempt = 0; attempt < 4; attempt++) {
			await arm();
			await dress(id);
			await page.evaluate(() => document.querySelectorAll('.pe-view')[0].click()); // 'jeu'
			// A drag during the turn-start walk-up cancels it instead of turning the eye.
			await page.waitForFunction(() => window.__petanque?.().intro === null, null, { timeout: 8000 }).catch(() => {});
			await sleep(800);
			const box = await page.locator('.pe-canvas').boundingBox();
			const x = box.x + box.width / 2, y = box.y + box.height * 0.45;
			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.mouse.move(x + LOOK.dx, y + LOOK.dy, { steps: 12 });
			await page.mouse.up();
			await dress(id);
			await sleep(2500);
			const png = await page.locator('.pe-canvas').screenshot();
			// Reloaded or re-dealt while we looked: take it again.
			if (!(await armed()) || (await page.evaluate(() => window.__petanque?.().view)) !== 'jeu') continue;
			if (KEEP) await sharp(png).toFile(`${KEEP}/preview-${id}.png`);
			await sharp(png).resize(640, 400, { fit: 'cover' }).webp({ quality: 82, effort: 6 }).toFile(`${DIR}/preview-${id}.webp`);
			// The camera each picture was taken from: the four must agree.
			const cam = await page.evaluate(() => window.__petanque().cam);
			console.log(`preview-${id}.webp  yaw ${cam.yaw.toFixed(3)} pitch ${cam.pitch.toFixed(3)}`);
			return;
		}
		throw new Error(`no steady page for ${id}`);
	};

	for (const id of ORDER) await shoot(id);
	console.log(errs.length ? `PAGE ERRORS:\n${errs.join('\n')}` : 'no page errors');
} finally {
	await browser.close();
	server.stop();
}
