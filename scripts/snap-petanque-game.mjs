/* Throwaway: smoke-check /jeux/petanque. Boots the preview, throws the jack and a boule by
   dragging, and screenshots the aim arc, the loft gauge and the portrait layout.
   Headless WebGL via swiftshader — every shot costs real time, so poll the game state
   (window.__petanque) rather than sleeping and hoping. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4362;
const base = `http://localhost:${PORT}`;
const OUT = 'D:/tmp/comfy';
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));

await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
/* Fullscreen is the default way in, so judge the framing there. Set the CLASS rather than click
   the button: the button also calls requestFullscreen(), and a natively-fullscreen window refuses
   setViewportSize later. The layout is driven by the class alone (that is the iOS fallback). */
await page.evaluate(() => {
	document.querySelector('.game-page')?.classList.add('gf-full');
	document.documentElement.classList.add('gf-full');
	window.dispatchEvent(new Event('resize'));
});
await sleep(900);

const state = () => page.evaluate(() => window.__petanque());
const shot = async (name) => { await page.screenshot({ path: resolve(`${OUT}/pet-${name}.png`) }); console.log('→', `pet-${name}.png`, JSON.stringify(await state())); };

await sleep(1200);
await shot('start');

const box = await page.locator('.pe-canvas').boundingBox();
const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.8;

/** Drag up for power, sideways for direction, then release. */
async function throwIt(dx, dyUp, tag) {
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + dx, cy - dyUp, { steps: 14 });
	await sleep(500); // the arc is rebuilt on the next tick
	if (tag) await shot(tag);
	await page.mouse.up();
	// Settle: the boule rolls for a few seconds of sim time.
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
}

await throwIt(0, 120, 'aim-arc');
console.log('after jack:', JSON.stringify(await state()));
await sleep(600);
await shot('after-jack');

// If the jack landed out of the window it is the opponent's to place — let the AI do it.
await page.waitForFunction(() => window.__petanque().match.phase === 'play', null, { timeout: 30000 }).catch(() => {});

// The loft knob: wheel down flattens the camera, which raises the lob.
await page.mouse.move(cx, cy);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await sleep(60); }
await sleep(600);
await shot('loft-high');
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 120); await sleep(60); }
await sleep(600);
await shot('loft-low');

const before = await state();
if (before.status === 'aim' && before.match.turn === 0) {
	await throwIt(20, 140, null);
	await sleep(800);
	await shot('after-boule');
}

// Wait out the AI reply so the turn alternation is visible in the log.
await sleep(3000);
console.log('later:', JSON.stringify(await state()));

await page.setViewportSize({ width: 390, height: 780 });
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await sleep(1200);
await shot('portrait');

/* Does the far jack actually read? A screenshot at this scale is unreadable to the eye, so count
   the halo's own pixels instead. Under ~150 px the ring is thinner than a hairline at 10 m. */
await page.setViewportSize({ width: 1000, height: 760 });
await page.evaluate(() => window.dispatchEvent(new Event('resize')));
await sleep(1500);
console.log('apparent size (px):', JSON.stringify((await state()).seen));
// Let the camera lerp finish, or every probe below samples a different pixel.
await sleep(2500);

/* Are the boules lit at all, and do they stand out from the ground? At 5 px across a boule is
   invisible in a screenshot, so read the pixels. Two numbers matter: the CENTRE pixel (pure boule,
   no ground mixed in) and the ground a few px away — contrast is what makes a boule findable. */
async function bouleLuma(tag) {
	// Re-read the projection for THIS frame: the look-at lerps for seconds after the last throw,
	// so a `seen` captured once and reused lands on bare ground and reads as "no difference".
	const seen = (await state()).seen;
	const shotPng = await page.locator('.pe-canvas').screenshot();
	const { data, info } = await sharp(shotPng).raw().toBuffer({ resolveWithObject: true });
	const lumaAt = (x, y) => {
		if (x < 0 || y < 0 || x >= info.width || y >= info.height) return NaN;
		const i = (y * info.width + x) * info.channels;
		return Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
	};
	const out = [];
	for (const b of seen) {
		if (b.side < 0) continue; // the jack is matte plastic, never part of this
		// 12 px out is past the boule but inside the halo's hole, so it is clean ground.
		const bg = Math.round([[12, 0], [-12, 0], [0, -12]].map(([dx, dy]) => lumaAt(b.px + dx, b.py + dy)).reduce((a, c) => a + c, 0) / 3);
		out.push(`side${b.side}@${b.m}m boule=${lumaAt(b.px, b.py)} sol=${bg}`);
	}
	console.log(`luma ${tag.padEnd(22)}`, out.join('  '));
	return shotPng;
}
/* Swept metalness 0.85 -> 0 live once: the boules only ever got PALER, and at 0 the steel one read
   133 against a 131 ground. Dark is the readable choice here, so what this guards is the contrast. */
const png = await bouleLuma('shipped');
const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
const near = (r, g, b, [tr, tg, tb]) => Math.abs(r - tr) + Math.abs(g - tg) + Math.abs(b - tb) < 90;
const TARGETS = { 'jack halo': [255, 193, 7], 'you halo': [48, 209, 88], 'foe halo': [255, 95, 86] };
const hits = Object.fromEntries(Object.keys(TARGETS).map((k) => [k, 0]));
for (let i = 0; i < data.length; i += info.channels)
	for (const [k, t] of Object.entries(TARGETS))
		if (near(data[i], data[i + 1], data[i + 2], t)) hits[k]++;
console.log(`halo pixels on a ${info.width}x${info.height} canvas:`, JSON.stringify(hits));
// The far third, blown up: the only way to actually SEE what a 22 px halo looks like.
await sharp(png)
	.extract({ left: Math.round(info.width * 0.3), top: Math.round(info.height * 0.18), width: Math.round(info.width * 0.4), height: Math.round(info.height * 0.25) })
	.resize({ width: 800, kernel: 'nearest' })
	.toFile(resolve(`${OUT}/pet-zoom.png`));
console.log('→ pet-zoom.png');

console.log(errs.length ? `PAGE ERRORS:\n${errs.join('\n')}` : 'no page errors');
await browser.close();
server.stop();
process.exit(0);
