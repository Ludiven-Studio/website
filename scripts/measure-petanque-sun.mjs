/* Is the sun ever actually in frame?

   The ask was "des flares si on l'a devant nous ou en soleil couchant", and a lens flare costs three
   textures in the precache. Before paying that, the question has to be answered rather than assumed:
   sunFor keeps a low sun near the LATERAL on purpose (the ends alternate, so a sun down the lane is
   in someone's eyes every other mene), and the throwing view looks straight down the lane through a
   26-49 deg field. Those two rules together may well put the sun off every screen the game ever
   draws, in which case the flare is dead weight.

   So: walk the reachable (elevation, azimuth) grid — reachable, not the whole sky, since sunFor's
   azimuth spread widens with elevation — and read where the sun projects in the live camera. `ndc`
   is null when it is behind the camera. In frame means |x| <= 1 and |y| <= 1.

   Usage: node scripts/measure-petanque-sun.mjs
*/
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4373;
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log(`THROW ${e.message}`));

await page.goto(`${server.base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch { /* no tutorial */ }
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
await page.getByRole('tab', { name: /Défi/ }).click();
await sleep(900);
/* The game view, named rather than cycled with `v` — and tilted as far UP as the game allows, since
   the question is whether the sun can be reached at all and a default pitch would under-answer it. */
await page.locator('.pe-view', { hasText: 'Vue de jeu' }).click().catch(() => {});
await sleep(900);
for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowUp');
await sleep(1200);

const D2R = Math.PI / 180;
const EL = [10, 16, 22, 28, 34, 40, 46];
// sunFor's own rule, copied so the grid stays inside what the game can draw: the spread off the
// lateral opens from 42 deg at the bottom of the range to 90 deg at the top.
const spreadFor = (el) => 42 + (90 - 42) * ((el - 10) / 36);

const s0 = await page.evaluate(() => window.__petanque());
console.log(`\nvue ${s0.view} · fov ${s0.fov} deg · cam yaw ${Math.round((s0.cam.yaw * 180) / Math.PI)} deg`);
console.log('\nel   azimut testés (0 et 180 = lateral, 90 = dans l\'axe)        ndc du soleil');
let everInFrame = 0, tested = 0;
for (const el of EL) {
	const sp = spreadFor(el);
	const azs = [-sp, -sp / 2, 0, sp / 2, sp].map((a) => Math.round(a));
	const out = [];
	for (const base of [0, 180]) {
		for (const a of azs) {
			const az = base + a;
			await page.evaluate(([e, z]) => window.__petanqueSun(e, z, 1337), [el, az]);
			await sleep(120);
			const st = await page.evaluate(() => window.__petanque());
			const n = st.sun?.ndc;
			tested++;
			const inFrame = n && Math.abs(n[0]) <= 1 && Math.abs(n[1]) <= 1;
			if (inFrame) everInFrame++;
			out.push(`${String(az).padStart(4)}:${n ? `${n[0].toFixed(2)},${n[1].toFixed(2)}${inFrame ? '*' : ''}` : 'derriere'}`);
		}
	}
	console.log(`${String(el).padStart(2)}   ${out.join('  ')}`);
}
console.log(`\n${everInFrame}/${tested} positions du soleil tombent dans le cadre (* ci-dessus)`);

await browser.close();
server.stop();
process.exit(0);
