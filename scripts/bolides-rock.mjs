/* Throwaway: what does a rocket shell actually look like while it is in the air?
   The probe autopilots the hero onto a rocket pastille (reading __bolides(), steering with the
   arrow keys) and snaps the board across the whole flight window, one folder per build.

   This one is a frame grabber, not a meter. A first pass tried a bright-pixel count and it was
   worthless: the grab fires a pop ring, a burst and a shake, and the four splats fire their own
   rings, so the count triples on FX that are not the shell. Look at the frames instead.
   The grab check needs the hero to be ON the pastille — a slot vanishing from the list is just
   as likely to be a bot taking it, which is how the first run snapped a tar pickup.

   Usage: BASE=http://localhost:4321 OUT=D:/tmp/rock TAG=ship node scripts/bolides-rock.mjs */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = process.env.OUT || 'D:/tmp/rock';
const TAG = process.env.TAG || 'ship';
const FLIGHTS = Number(process.env.FLIGHTS || 6);
const DELAYS = [120, 260, 400, 540, 680, 820]; // ms after the grab, one per flight
const ROCKET = 3; // KIND.rocket
const GRAB_R = 3.5; // ITEM.doorR reach; closer than this and the pastille was ours

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));

await page.goto(`${BASE}/jeux/bolides`, { waitUntil: 'networkidle' });
await page.getByRole('tab', { name: /Libre/ }).click();
await page.locator('.bo-play', { hasText: 'Jouer' }).click();
await page.waitForSelector('.bo-leaderboard', { timeout: 20000 });
const board = page.locator('.bo-boardwrap');
const peek = () => page.evaluate(() => window.__bolides());
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Which arrow key raises `heading`? Sign conventions are not worth guessing.
const h0 = (await peek()).heading;
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(400);
await page.keyboard.up('ArrowRight');
const RIGHT = Math.sign(wrap((await peek()).heading - h0)) || 1;

let held = null;
const steer = async (key) => {
	if (held === key) return;
	if (held) await page.keyboard.up(held);
	held = key;
	if (key) await page.keyboard.down(key);
};

// A race is 180 s and one flight burns a lot of it (every peek and every shot costs sim clock),
// so the buzzer, not the driving, is what ends a run. Restart before each flight or every attempt
// after the first reports "no grab" while the end card sits there.
const freshRace = async () => {
	const again = page.locator('.bo-play', { hasText: 'Recommencer' });
	if (await again.count() && await again.isVisible()) {
		await again.click();
		await page.waitForSelector('.bo-leaderboard', { timeout: 20000 });
		await page.waitForTimeout(600);
	}
};

let shot = 0;
for (let f = 0; f < FLIGHTS; f++) {
	await freshRace();
	let target = null, ours = false;
	for (let step = 0; step < 900; step++) {
		const s = await peek();
		if (target && !s.items.some((i) => i.kind === ROCKET && Math.hypot(i.x - target.x, i.z - target.z) < 0.5)) {
			ours = Math.hypot(target.x - s.x, target.z - s.z) < GRAB_R;
			target = null;
			if (ours) break;
			continue; // a bot took it; pick the next one
		}
		const rockets = s.items.filter((i) => i.kind === ROCKET);
		if (!rockets.length) { await steer(null); await page.waitForTimeout(120); continue; }
		target = rockets.sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
		const err = wrap(Math.atan2(target.z - s.z, target.x - s.x) - s.heading);
		await steer(Math.abs(err) < 0.06 ? null : (Math.sign(err) === RIGHT ? 'ArrowRight' : 'ArrowLeft'));
		await page.waitForTimeout(60);
	}
	await steer(null);
	if (!ours) { console.log(`flight ${f}: no grab of our own, skipped`); continue; }

	// The crop is the point: a whole 1280 board reviewed at thumbnail size hides the very thing
	// this probe is about. Off the CANVAS, not the board wrap — the wrap carries the mode tabs,
	// so its centre sits up in the sky. The chase cam parks the car near the canvas centre and
	// the shells fly up the road from there, so the window straddles that point.
	const box = await page.locator('.bo-canvas').boundingBox();
	const clip = { x: box.x + box.width / 2 - 240, y: Math.max(0, box.y + box.height / 2 - 200), width: 480, height: 360 };
	// ONE frame per flight, at a chosen delay. Measured: a single screenshot under swiftshader
	// eats ~1.7 s of sim clock — longer than the whole flight — so a burst cannot film it. The
	// filmstrip is built across flights instead, one phase each. (The first version of this
	// probe fired a fixed 130 ms cadence and never once caught a shell in the air.)
	const ms = DELAYS[f % DELAYS.length];
	await page.waitForTimeout(ms);
	await page.screenshot({ path: `${OUT}/${TAG}-t${String(ms).padStart(4, '0')}ms-f${f}.png`, clip });
	shot++;
	console.log(`flight ${f}: snapped`);
	await page.waitForTimeout(1500);
}

await browser.close();
console.log(`${shot} frames -> ${OUT}`);
