/* Guard: the camera, the controls and the views, played for real in the browser.
   The model this file defends, after the launch-board round:
     - the camera is FREE and carries NO part of the throw. It used to be the loft, which meant
       aiming a plomb by putting the eye on the ground — exactly where the target stops being
       visible. The press point inside the board is the loft now: bottom grazing, top a plomb;
     - the DIRECTION is still sampled off the camera at the instant the board is touched, and both
       loft and direction are frozen for the rest of the drag (bar the sideways steer);
     - the slider and the wheel are the ZOOM, which walks the eye to the head and narrows the field,
       and neither may move the throw by one bit;
     - the jack is AIMED with a ring from the top view, then thrown at it.

   Run it twice, and the second run is the one that matters:
     node scripts/check-petanque-camera.mjs
     node scripts/check-petanque-camera.mjs --portrait

   The readability block at the end runs WINDOWED on purpose. The previous round measured it in
   fullscreen (1000x760) and reported a 21 % relative gain over a baseline that was already a speck;
   the page everyone lands on is `.pe-root` capped at 620 px with a 16/10 wrap, so every figure was
   1.5x optimistic and the answer had no absolute threshold to fail against. It has one now. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A phone is the hard case: a tall canvas is already spending its field on sky, so the vertical
// fov is clamped there and none of the gains below are allowed to come out of it.
const PORTRAIT = process.argv.includes('--portrait');
const VP = PORTRAIT ? { width: 390, height: 844 } : { width: 1000, height: 760 };
const PORT = 4372;

/* Readability as one deal-independent number: body px * metres / canvas px, which reduces to
   BOULE_R / tan(fov / 2) and so depends on nothing but the field. BOULE_R is engine.ts:15.
   Computed, not measured — the first baseline here was read off rounded pixels and came out 1.8 %
   high, which was most of the gap this script is asked to resolve. */
const BOULE_R = 0.0375;
const perMetre = (fovDeg) => BOULE_R / Math.tan((fovDeg * Math.PI) / 360);
const BASE_PER_M = perMetre(58); // what the old, un-narrowed field gave

/* Full zoom is a FIXED geometry, whatever the deal: the eye stops ZOOM_DIST of ground short of the
   head, one shoulder step sideways, crouched to ZOOM_EYE. So the boule's on-screen size at the head
   is an identity, not an average, and can be asserted as an absolute number. render3d.ts:329-333. */
const ZOOM_VFOV = 26, ZOOM_DIST = 1.5, ZOOM_EYE = 0.95, SHOULDER = 0.55 * 0.55;
const ZOOM_SLANT = Math.hypot(Math.hypot(ZOOM_DIST, SHOULDER), ZOOM_EYE - BOULE_R);
const zoomBodyPx = (H) => (perMetre(ZOOM_VFOV) * H) / ZOOM_SLANT;
/* The THROW limit, derived the same way the island derives it: the circle and the jack may sit
   against opposite touchlines, so the widest legal throw is the pitch width across the shortest
   legal jack distance. The camera goes to 2.8 rad, and owes the throw nothing. */
const YAW_MAX = Math.atan2(4, 6); // PITCH_W, MIN_JACK — 0.588 rad

const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));

const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };

await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });

// ModeToggle segments declare role="tab", so they are not buttons to the a11y tree.
await page.getByRole('tab', { name: /Libre/ }).click();
await sleep(700);

const goFull = async (on) => {
	await page.evaluate((v) => {
		document.querySelector('.game-page')?.classList.toggle('gf-full', v);
		document.documentElement.classList.toggle('gf-full', v);
		window.dispatchEvent(new Event('resize'));
	}, on);
	await sleep(1400);
};

// Fullscreen the pitch: in `astro preview` the canvas runs past the fold, and a drag aimed at its
// lower half then lands on nothing. Block 10 drops it again to measure the page people land on.
await goFull(true);

const state = () => page.evaluate(() => window.__petanque());
let box = await page.locator('.pe-canvas').boundingBox();
let cx = box.x + box.width * 0.5;

// Ask the page for the pad's box rather than guessing a fraction: it is a fixed 220x150 pad centred
// on the bottom edge, so its share of the canvas is not the same number in the two viewports — and
// its own height is not the canvas height, which the old derivation quietly assumed.
let arm0 = (await state()).arm;
let armY = box.y + arm0.cy;
let lookY = box.y + arm0.top * 0.45;
/* A client y that lands on a KNOWN loft. `t` is the LOFT (0 grazing, 1 plomb) and the board is drawn
   upside down on purpose, so t = 1 is the BOTTOM of the pad: a plomb is the gesture that starts low
   and swings through the whole pad. Inside the dead margin the island reports as `arm.pad`. */
const boardY = (t) => {
	const top = arm0.top + arm0.pad, bot = arm0.top + arm0.height - arm0.pad;
	return box.y + top + t * (bot - top);
};
console.log(`viewport ${VP.width}x${VP.height} · canvas ${Math.round(box.width)}x${Math.round(box.height)} `
	+ `· pad ${arm0.width}x${arm0.height} at ${arm0.left},${arm0.top}`);
check(lookY > box.y + 40 && armY < box.y + box.height - 10, 'the launch pad and the camera area are both reachable');

const viewNow = async () => (await state()).view;
// By position, not by name: under 420 px the segments drop their label and keep only the icon, so
// an accessible-name lookup would work in landscape and quietly miss in portrait.
const VIEW_IDX = { jeu: 0, tete: 1, dessus: 2 };
async function toView(k) {
	await page.locator('.pe-view').nth(VIEW_IDX[k]).click();
	await sleep(900); // the fov is eased
}

/** Press, drag, release. Returns the peak power seen while the drag was held. */
async function drag(x0, y0, dx, dy, hold = 260) {
	await page.mouse.move(x0, y0);
	await page.mouse.down();
	await page.mouse.move(x0 + dx, y0 + dy, { steps: 14 });
	await sleep(hold);
	const p = (await state()).power;
	await page.mouse.up();
	return p;
}

const settled = async () => {
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 6000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(700);
};

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ---------- 1. the three views exist and switch ---------- */

check(await page.locator('.pe-view').count() === 3, 'three view segments are on screen');
for (const k of ['tete', 'dessus', 'jeu']) {
	await toView(k);
	if ((await viewNow()) !== k) { check(false, `the ${k} segment selects its view`); break; }
}
check(await viewNow() === 'jeu', 'the view segments each select their view');

/* ---------- 2. the top view frames the legal jack window (complaint 7) ---------- */

const fovJeu = (await state()).fov;
await toView('dessus');
const top = await state();
check(!!top.topFrames && top.topFrames.circle && top.topFrames.near && top.topFrames.far,
	`the top view holds the circle and both 6 m / 10 m rings (${JSON.stringify(top.topFrames)})`);
// On a phone both views hit the VFOV_MAX clamp, which is the clamp doing its job.
check(top.fov >= fovJeu, `the top view is never tighter than the throwing view (${top.fov} vs ${fovJeu})`);
if (!PORTRAIT) check(top.fov > fovJeu + 2, `the top view opens the field wider (${top.fov} > ${fovJeu})`);

/* ---------- 3. the jack is aimed, then thrown at the ring ---------- */

const j0 = await state();
check(j0.match.phase === 'throw-jack', `the end opens on the jack (${j0.match.phase})`);
check(!!j0.jackAim, 'a target ring is already on the ground, so the screen is never blank');
const aimLegal = (p) => {
	const d = dist2(j0.match.circle, p);
	return d >= 6 - 1e-6 && d <= 10 + 1e-6;
};
check(!!j0.jackAim && aimLegal(j0.jackAim), `the default target is inside the legal window (${j0.jackAim ? dist2(j0.match.circle, j0.jackAim).toFixed(2) : '-'} m)`);

// Two taps at different places: the ring must follow the finger, and stay legal whatever it does.
const taps = [];
for (const fy of [0.3, 0.6]) {
	await page.mouse.click(cx + box.width * 0.08, box.y + box.height * fy);
	await sleep(300);
	taps.push((await state()).jackAim);
}
check(taps.every((p) => p && aimLegal(p)), `a tap moves the ring and it stays legal (${taps.map((p) => (p ? dist2(j0.match.circle, p).toFixed(2) : '-')).join(' / ')} m)`);
check(taps[0] && taps[1] && dist2(taps[0], taps[1]) > 0.5, `the two taps land in different places (${taps[0] && taps[1] ? dist2(taps[0], taps[1]).toFixed(2) : '-'} m apart)`);

// The strip must NOT throw here: the jack has its own path, and two ways to throw one jack means
// one of them ignores the ring the player just placed.
const stripInJack = await drag(cx, armY, 0, -140);
check(stripInJack === 0, `the strip stays inert while the jack is being aimed (power ${stripInJack})`);
check(await viewNow() === 'dessus', 'and it does not drop the top view mid-aim');

const wanted = (await state()).jackAim;
await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
await settled();
const jacked = await state();
/* Two legal outcomes, and the script has always described both — it just asserted one of them.
   The jack is thrown with a real spread, so missing the 6-10 m window is the rule doing its job,
   not a camera bug. Demanding `live` here went red in two of four consecutive runs, for a reason
   the very next branch prints as normal. What must hold is that it landed in ONE of the two. */
check(Boolean(jacked.jack && jacked.jack.live) || jacked.match.phase === 'place-jack',
	`the jack throw resolved (phase ${jacked.match.phase})`);
if (jacked.jack && jacked.jack.live && jacked.match.phase === 'play') {
	/* ONE throw, so the bound has to be one a single sample can carry. Measured over 2400 deals
	   (every surface x 3 relief amplitudes x 5 distances): mean 0.35 m, p95 0.80, max 2.51 — the
	   tail is a bounce off the relief, not the aim. A 1.2 m bound here would go red about one run
	   in seventy and teach everyone to re-run the guard. The tight claim belongs where it can be
	   made honestly, and it is in ai.test.ts as a distribution over the same sweep. */
	check(dist2(jacked.jack, wanted) < 3, `the jack goes to the ring, not somewhere else in the window (${dist2(jacked.jack, wanted).toFixed(2)} m off)`);
	check(dist2(jacked.jack, wanted) > 1e-6, 'and it is thrown, not placed — there is a spread');
} else {
	console.log('     (the jack missed the window; the hand-placing fallback took over)');
}
check(jacked.jackAim === null, 'the ring is cleared once the jack is gone');
check(jacked.view === 'jeu', `the view that was borrowed is given back (${jacked.view})`);

/* ---------- 4. you cannot throw outside the throwing view (complaint 9) ---------- */

await toView('dessus');
const blocked = await drag(cx, armY, 0, -140);
const after = await state();
check(blocked === 0, `no power builds in the top view (power ${blocked})`);
check(after.status === 'aim', 'the top view never starts a throw');
check(after.view === 'jeu', 'a tap on the dead strip brings the throwing view back in one gesture');

await toView('tete');
const blockedTete = await drag(cx, armY, 0, -140);
check(blockedTete === 0, `no power builds in the head view either (power ${blockedTete})`);
check(await viewNow() === 'jeu', 'the same tap recovers from the head view');

/* ---------- 5. the camera is free and owns nothing; the board owns the loft ---------- */

await toView('jeu');
const before5 = await state();
await drag(cx, lookY, 0, -90, 300); // pull up: the gaze follows the finger up (the lob below needs it)
const lifted = await state();
check(Math.abs(lifted.cam.pitch - before5.cam.pitch) > 0.02,
	`a vertical camera drag moves the eye (pitch ${before5.cam.pitch.toFixed(3)} -> ${lifted.cam.pitch.toFixed(3)})`);
/* THE inversion of this round, and the reason the block was rewritten: looking up used to lower the
   throw. Nobody could aim a plomb and see the head at the same time. */
check(lifted.loft === before5.loft,
	`and leaves the loft alone — the camera is not the throw any more (${before5.loft.toFixed(3)})`);

// Follow it by its slot in `seen`, never by its distance: swinging the camera is exactly what
// changes that distance, so matching on it compares a body to nothing.
const i5 = lifted.seen.findIndex((x) => x.px > 0 && x.px < box.width);
await drag(cx, lookY, 120, 0, 300);
const turned = await state();
const seenBefore = lifted.seen[i5], seenAfter = turned.seen[i5];
check(i5 >= 0 && !!seenAfter && Math.abs(seenAfter.px - seenBefore.px) > 20,
	`a horizontal camera drag swings the view (${seenBefore?.px} -> ${seenAfter?.px} px)`);
check(turned.loft === lifted.loft, 'a horizontal drag leaves the loft alone too');

/* The board, read as the mechanic it is: two presses at two heights, no drag, no throw. A tap is
   power 0, so these commit nothing — they only sample. */
const pressAt = async (t) => {
	await page.mouse.move(cx, boardY(t));
	await page.mouse.down();
	await sleep(200);
	const s = await state();
	await page.mouse.up();
	await sleep(200);
	return s;
};
const lowPress = await pressAt(0.02); // the TOP of the pad — the board is upside down on purpose
const highPress = await pressAt(0.98); // the BOTTOM of the pad
check(highPress.loft > lowPress.loft + 0.5,
	`the press point IS the loft (${(lowPress.loft * 180 / Math.PI).toFixed(1)} -> ${(highPress.loft * 180 / Math.PI).toFixed(1)} deg)`);
/* The inversion, asserted in SCREEN px off the PAD'S OWN BOX — not through boardY. boardY is this
   script's model of the island; if both flipped together every assertion above would still pass
   while the screen taught the opposite gesture. So: press 14 px inside each end, ask the loft. */
const padEnds = await page.evaluate(() => {
	const r = document.querySelector('.pe-arm').getBoundingClientRect();
	return { top: r.top + 14, bottom: r.bottom - 14 };
});
const pressY = async (y) => {
	await page.mouse.move(cx, y);
	await page.mouse.down();
	await sleep(200);
	const s = await state();
	await page.mouse.up();
	await sleep(200);
	return s;
};
const padTop = await pressY(padEnds.top), padBot = await pressY(padEnds.bottom);
check(padBot.loft > padTop.loft + 0.5,
	`pressing LOW on the pad lobs and pressing HIGH grazes (${(padTop.loft * 180 / Math.PI).toFixed(1)} -> ${(padBot.loft * 180 / Math.PI).toFixed(1)} deg)`);
check(lowPress.loft < 0.25, `the top of the pad is a roulette (${(lowPress.loft * 180 / Math.PI).toFixed(1)} deg)`);
/* 60 deg is the floor for something worth calling a plomb, and it is well past the 53 deg the old
   camera-driven loft topped out at — which is what "l'angle max n'est pas assez élevé" was. */
check(highPress.loft > 1.05, `and the bottom is a real plomb (${(highPress.loft * 180 / Math.PI).toFixed(1)} deg)`);
check(Math.abs(highPress.aim.board - 1) < 0.05 && highPress.aim.board > lowPress.aim.board,
	`the gauge reads the board back out of the loft (${lowPress.aim.board.toFixed(2)} -> ${highPress.aim.board.toFixed(2)})`);

/* The complaint was that the camera was not free: it was bridled to the throw's own +-34 deg. A
   long drag must now take the EYE well past that while the THROW stays inside it. */
/* Chained, not one long sweep: a phone canvas is 390 px wide, so a single drag that clears 34 deg
   would run off the glass and the browser would clamp it — which read as "the camera is still
   bridled" when it was the instrument that ran out of room. Each press re-bases on the current
   yaw, so the strokes add up. */
for (let i = 0; i < 6; i++) {
	if (Math.abs((await state()).cam.yaw) > YAW_MAX + 0.1) break;
	await drag(cx + box.width * 0.2, lookY, -box.width * 0.4, 0, 260);
	await sleep(120);
}
const freed = await state();
check(Math.abs(freed.cam.yaw) > YAW_MAX + 0.1, `a long drag takes the camera past the throwing limit (${freed.cam.yaw.toFixed(2)} rad vs ${YAW_MAX})`);
check(Math.abs(freed.aim.yaw) <= YAW_MAX + 1e-9, `and the aim is still clamped to it (${freed.aim.yaw.toFixed(2)} rad)`);

/* What the board owns once it is held. The LOFT was sampled at the press and cannot move: a pull of
   190 px would sweep the whole board on its way up, so the angle the player chose has to survive the
   pull that fires it. The yaw is the exception: dragging sideways in the board steers the throw, and
   only the throw. So the camera must sit still while the aim swings — the opposite of the rest of
   this file, where the camera leads and the aim follows.
   This block asserted "nothing may move" until the steering shipped, and went on passing by
   accident only while the aim happened to sit at its clamp. */
await page.mouse.move(cx, armY);
await page.mouse.down();
await page.mouse.move(cx, armY - 90, { steps: 8 });
await sleep(260);
const held5 = await state();
await page.mouse.move(cx + 200, armY - 90, { steps: 12 });
await sleep(260);
const dragged5 = await state();
check(held5.aim.frozen && dragged5.aim.frozen, 'the strip reports the aim as frozen while it is held');
check(dragged5.aim.loft === held5.aim.loft,
	`the loft cannot move once the strip is held (${held5.aim.loft} -> ${dragged5.aim.loft})`);
check(dragged5.cam.yaw === held5.cam.yaw && dragged5.cam.pitch === held5.cam.pitch,
	`and steering the throw leaves the camera where it was (yaw ${held5.cam.yaw.toFixed(3)} -> ${dragged5.cam.yaw.toFixed(3)})`);
check(dragged5.aim.yaw < held5.aim.yaw - 0.05 && Math.abs(dragged5.aim.yaw) <= YAW_MAX + 1e-9,
	`a sideways drag in the strip steers the throw, inside its limit (${held5.aim.yaw.toFixed(3)} -> ${dragged5.aim.yaw.toFixed(3)} rad)`);
check(held5.zoom === 0, `arming drops the zoom, so the arc never starts behind the eye (zoom ${held5.zoom})`);

/* ---------- 6. the arc still reads as an arc, and the lob still fits (complaint 5) ---------- */

// Still holding from block 5. The loft is chosen by WHERE the press lands, so the two throws below
// are armed at two heights on the board — which is the mechanic, stated as a test.
await page.mouse.move(cx, armY, { steps: 4 }); // back to power 0: a tap is not a throw
await sleep(120);
await page.mouse.up();
await sleep(200);

/* Block 5 left the eye swung 36 deg off the lane, and this block is about the LOFT. Left there,
   the far end of the arc leaves the frame sideways and the crop would be read as a lob bug — the
   yaw has to be controlled, not inherited. No key re-centres it, so it is driven back in closed
   loop off `cam.yaw`, which also avoids hard-coding YAW_PER_PX in here. */
const recentre = async () => {
	let px = 300; // rad -> px, refined from the first correction
	for (let i = 0; i < 6; i++) {
		const y0 = (await state()).cam.yaw;
		if (Math.abs(y0) < 0.02) break;
		await drag(cx, lookY, y0 * px, 0, 160);
		await sleep(150);
		const y1 = (await state()).cam.yaw;
		if (Math.abs(y1 - y0) > 1e-4) px = Math.abs((y0 * px) / (y0 - y1)); // measured, not guessed
	}
	return (await state()).cam.yaw;
};
const centred = await recentre();
check(Math.abs(centred) < 0.05, `the eye can be brought back onto the lane (yaw ${centred.toFixed(3)} rad)`);

/* Press at `t` on the board, then pull for power. `eye` tilts the camera first: the frame is now
   the player's business alone, and a lob wants the eye lifted the same way a real one wants a
   raised chin. Pulled to a y above the SEAM, not 130 px above the press: power is measured from
   the seam so the pad reads zero, and a press-relative pull stopped short of the seam and got
   cancelled by the safe zone — which is exactly what the safe zone is for. Since the inversion,
   a plomb is pressed at the pad's far end, so it drags the whole 150 px before it charges at all:
   that is the declared cost, and pulling to a seam-relative y is what keeps it out of this guard. */
const pullY = (px) => Math.max(box.y + 8, box.y + arm0.top - px);
const armAt = async (t, eye = 0) => {
	if (eye) { await drag(cx, lookY, 0, eye, 260); }
	await page.mouse.move(cx, boardY(t));
	await page.mouse.down();
	await page.mouse.move(cx, pullY(130), { steps: 14 });
	await sleep(700);
	return state();
};

/* WHICH HALF of the flight is lost, not which edge loses it, and not a fitted percentage. The edge
   does not discriminate: the arc starts inside the player's hand — below the eye and a shoulder
   across from it — so its first stretch is off frame at any loft. And a whole lob no longer fits by
   construction: the apex of a parabola sits atan(tan(loft)/2) above the launch line whatever the
   range, so 68.7 deg puts it 52 deg up while the landing is below the horizon — more than the 49 deg
   vertical field can hold. That is the declared cost of freeing the camera, and no threshold here
   can buy it back. What the preview exists to answer is WHERE IT LANDS, so that is what is asserted:
   from the apex down, not one point may be lost. `arc.at` gives each off point as a % of the flight. */
const lostOnTheWayDown = (s) => s.arc.at.filter((p) => p >= 50);
const lostOnTheWayUp = (s) => s.arc.at.filter((p) => p < 50);
/* There are exactly two things allowed to hide the arc, so there may be at most two stretches: the
   hand at the launch, and the apex over the top. Measured, not assumed — at a full plomb the first
   stretch leaves by the RIGHT (the shoulder the boule is thrown from) and the second by the top, so
   counting edges would have said two bugs. A third stretch means the arc entered the frame and
   dropped out of it again, which nothing in the geometry explains. Percentages are rounded, so
   consecutive samples land 100/n apart — twice that is a real gap, not rounding. */
const gaps = (s) => {
	const step = 200 / s.arc.n + 1;
	return s.arc.at.reduce((n, p, i) => n + (i && p - s.arc.at[i - 1] > step ? 1 : 0), s.arc.at.length ? 1 : 0);
};

/** Let a held throw go without firing it: anywhere back on the board is power 0, so releasing
 *  there throws nothing. Lifting the button up the pull would launch a real boule. */
const relax = async (t) => {
	await page.mouse.move(cx, boardY(t), { steps: 4 });
	await sleep(120);
	await page.mouse.up();
	await sleep(200);
};

const mid = await armAt(0.35); // high on the pad: a flatter throw
check(mid.zoom === 0, `drawing the arm back puts the feet back on the circle (zoom ${mid.zoom})`);
check(mid.bow >= 12, `the arc bows off a straight line at mid loft (${mid.bow} px over ${mid.arc.n} pts, loft ${(mid.loft * 180 / Math.PI).toFixed(1)} deg)`);
check(lostOnTheWayDown(mid).length === 0, `the mid-loft flight is whole from the apex to the ground (${JSON.stringify(mid.arc)})`);
check(gaps(mid) <= 1, `and a flat throw is hidden by one thing only, the hand (${gaps(mid)} stretch)`);
console.log(`     mid loft: ${lostOnTheWayUp(mid).length}/${mid.arc.n} points under the frame on the way up (the hand)`);

/* The safe zone, asked for as "coming back into the launch zone cancels the throw". Still holding
   the charged pull from `mid`: slide back down onto the board and let go. Nothing may leave. It
   needs no branch in the island because power starts at the seam, so this asserts the consequence
   rather than the code — a press-relative power would fail here and could not be made to pass. */
check(mid.power > 0.3, `the pull above the board really charges (power ${mid.power.toFixed(2)})`);
await page.mouse.move(cx, boardY(0.35), { steps: 4 });
await sleep(150);
const backIn = await state();
check(backIn.power === 0, `sliding back onto the board un-charges it (power ${backIn.power})`);
await relax(0.35);
const cancelled = await state();
check(cancelled.status === 'aim', `and releasing there throws nothing (status ${cancelled.status})`);

// Bottom of the pad, eye lifted: a full plomb. The lift is the declared cost of freeing the camera —
// the loft no longer tilts the view for you, so framing a 70 deg arc is now a thing you do.
// Negative: the finger leads the gaze, so lifting the eye is a drag UP.
const high = await armAt(0.98, -80);
check(lostOnTheWayDown(high).length === 0,
	`the full lob still shows where it lands at ${(high.loft * 180 / Math.PI).toFixed(1)} deg (${JSON.stringify(high.arc)})`);
check(gaps(high) <= 2, `and the lob is hidden by the hand and the apex, nothing else (${gaps(high)} stretches)`);
console.log(`     full lob: ${lostOnTheWayUp(high).length}/${high.arc.n} points over the frame on the way up — the apex, out of the field by geometry`);
check(high.loft > mid.loft + 0.3, `the board really drives the loft (${(mid.loft * 180 / Math.PI).toFixed(1)} -> ${(high.loft * 180 / Math.PI).toFixed(1)} deg)`);
await page.mouse.up(); // this one is a real boule
await settled();

/* ---------- 7. the turn-start walk-up plays, and gives the eye back (complaint 6) ---------- */

// Hands off from here until it is over: any contact cancels it, which is the point.
let introSeen = null, zoomed = 0;
for (let i = 0; i < 90; i++) {
	const s = await state();
	zoomed = Math.max(zoomed, s.zoomView);
	if (s.intro) { introSeen = s.intro; break; }
	if (s.status === 'end' || s.status === 'over') break;
	await sleep(300);
}
check(introSeen !== null, `the turn opens by going up to the head (first stage ${introSeen ?? 'never fired'})`);
for (let i = 0; i < 90; i++) {
	const s = await state();
	zoomed = Math.max(zoomed, s.zoomView);
	if (!s.intro && zoomed > 0) break;
	await sleep(200);
}
check(zoomed > 0.3, `the walk-up actually moves the eye (zoom reached ${zoomed.toFixed(2)})`);
await page.waitForFunction(() => window.__petanque().zoomView < 0.12, null, { timeout: 9000 })
	.then(() => check(true, 'the walk-up puts the player back on the circle'))
	.catch(async () => check(false, `the walk-up never came back (zoom ${(await state()).zoomView.toFixed(2)})`));

/* Something on the ground to read at the end. */
const myTurn = () => page.waitForFunction(() => {
	const s = window.__petanque();
	return s.status === 'aim' && s.match.turn === 0 && s.match.phase === 'play';
}, null, { timeout: 45000 });
for (let i = 0; i < 3; i++) {
	const s = await state();
	if (s.seen.filter((x) => x.side >= 0).length >= 2) break;
	if (s.status === 'end' || s.status === 'over') break;
	await myTurn();
	// Low on the board: a flat roulette that stays on the pitch. The two throws above were aimed at
	// the extremes of the arc preview, and an extreme throw leaves the ground bare.
	await drag(cx, boardY(0.12), 0, -110, 300);
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 5000 }).catch(() => {});
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(800);
}

/* ---------- 8. no piece of camera UI may touch the LOFT ---------- */

await myTurn().catch(() => {});
// Swung well off the lane first, so coming back to the eye has something to correct. Without this
// the re-centring check below would pass on a camera that was already pointing the right way.
await drag(cx + box.width * 0.2, lookY, -box.width * 0.35, 0, 260);
await sleep(300);
const s8 = await state();
const loft0 = s8.loft;
await toView('tete');
await toView('dessus');
await toView('jeu');
await sleep(600);
/* Coming home to the eye faces the head. The view used to be handed back pointing wherever it was
   left, which is how the jack ended up off screen after every trip to the top view. The AIM follows
   it — this is the one camera control that is allowed to, and it is the whole point of it. */
const home = await state();
const jackSeen = home.seen.find((x) => x.side === -1);
check(!!jackSeen && Math.abs(jackSeen.px - box.width / 2) < box.width * 0.2,
	`back in the eye, the jack is in the middle of the frame (${jackSeen ? jackSeen.px : '-'} px of ${Math.round(box.width)})`);
check(Math.abs(home.aim.yaw) <= YAW_MAX + 1e-9, `and the aim it carried over is still legal (${home.aim.yaw.toFixed(3)} rad)`);
const wb = await page.locator('.pe-zoom-bar').boundingBox();
await page.mouse.move(wb.x + wb.width / 2, wb.y + 2);
await page.mouse.down();
await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height - 2, { steps: 12 });
await page.mouse.move(wb.x + wb.width / 2, wb.y + 2, { steps: 12 });
await page.mouse.up();
await sleep(600);
const slid = (await state()).zoom;
// The wheel is the zoom now, in the game view. It used to be the loft, which is the whole point.
await page.mouse.move(cx, lookY);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await sleep(60); }
await sleep(400);
const wheeled = (await state()).zoom;
for (const k of ['w', 'w', 's', 'c']) { await page.keyboard.press(k); await sleep(150); }
await sleep(900);
const s8b = await state();
check(slid > 0.8, `a drag to the top of the slider reaches full zoom (${slid.toFixed(2)})`);
check(wheeled > 0.1, `the wheel zooms in the game view (${wheeled.toFixed(2)})`);
check(s8b.loft === loft0, `views, slider, wheel and keys leave the loft bit for bit (${loft0} -> ${s8b.loft})`);
check(s8b.aim.yaw === home.aim.yaw, `and the slider, the wheel and the keys leave the direction too (${home.aim.yaw.toFixed(3)} -> ${s8b.aim.yaw.toFixed(3)})`);

/* ---------- 9. the field is never made worse ---------- */

await page.keyboard.press('c');
await sleep(1200);
const fin = await state();
check(fin.fov <= 58.05, `the vertical field is never wider than the old one at zoom 0 (${fin.fov} deg)`);
if (!PORTRAIT) check(fin.fov <= 50.5, `the field is tightened on a wide canvas (${fin.fov} deg)`);

/* ---------- 10. the head is READABLE on the page people land on ---------- */

await goFull(false);
await page.locator('.pe-canvas').scrollIntoViewIfNeeded();
box = await page.locator('.pe-canvas').boundingBox();
cx = box.x + box.width * 0.5;
arm0 = (await state()).arm;
armY = box.y + arm0.cy;
lookY = box.y + arm0.top * 0.45;
console.log(`     windowed canvas ${Math.round(box.width)}x${Math.round(box.height)} — this is the one that decides`);

const flat = await state();
const baFlat = flat.seen.filter((x) => x.side >= 0);
if (baFlat.length) {
	const b0 = baFlat.reduce((a, x) => (x.body > a.body ? x : a));
	console.log(`     zoom 0: biggest boule ${b0.body} px at ${b0.m} m — the complaint, as a number`);
}

// Full zoom, and wait out the ease: the fov and the walk are both first-order.
await page.keyboard.press('w');
for (let i = 0; i < 6; i++) { await page.keyboard.press('w'); await sleep(120); }
await page.waitForFunction(() => window.__petanque().zoomView > 0.98, null, { timeout: 8000 }).catch(() => {});
await sleep(1200);
const zed = await state();
const ba = zed.seen.filter((x) => x.side >= 0 && x.py > -box.height && x.py < 2 * box.height);
// The identity, for the log: what a boule sitting exactly where the eye stopped would measure.
console.log(`     fov ${zed.fov} · zoom ${zed.zoomView} · a boule on the spot would be ${zoomBodyPx(box.height).toFixed(1)} px`);

if (!ba.length) {
	check(false, `no boule down to measure (status ${zed.status}, turn ${zed.match.turn}, `
		+ `${zed.bs.length} bodies, ${zed.bs.filter((b) => b.live).length} live, left ${zed.match.left.join('/')})`);
} else {
	/* Two halves, asked separately. `body` is rounded to whole pixels, so at zoom 0 one step was
	   already 14 % — wider than any gain worth claiming. The FIELD is a real number and carries the
	   absolute claim; the pixels are only asked to agree with it inside the rounding band. That
	   second half is the one that matters: the halo formula lives in two places, and a copy left on
	   the old field would make this whole script lie. */
	const ys = ba.map((x) => Math.round((x.py / box.height) * 100));
	const best = ba.reduce((a, x) => (x.body > a.body ? x : a));
	const perM = (best.body * best.m) / box.height;
	const want = perMetre(zed.fov);
	const band = (0.5 * best.m + best.body * 0.05) / box.height; // half a px of body, 0.1 m of range
	console.log(`     ${ba.map((x) => `[s${x.side} ${x.m}m ${x.body}px y${Math.round((x.py / box.height) * 100)}%]`).join(' ')}`);

	check(Math.abs(zed.fov - ZOOM_VFOV) < 0.6, `full zoom reaches the chosen stop (${zed.fov} vs ${ZOOM_VFOV} deg)`);
	check(perM + band >= BASE_PER_M, `boules are at least as big per metre as before (${perM.toFixed(4)} vs ${BASE_PER_M.toFixed(4)})`);
	check(Math.abs(perM - want) <= band,
		`the rendered boules follow the field (${perM.toFixed(4)}, field says ${want.toFixed(4)})`);
	/* THE assertion of this round. Absolute, windowed, and computed in advance from the geometry —
	   not a percentage over a baseline that was itself unreadable. 0.8x of the identity allows for
	   a boule sitting behind the one the eye stopped at. */
	/* THE assertion of this round, in two halves, because the identity above is stated at the point
	   the eye stops AT and the boules sit AROUND it.
	     · how close the eye gets is the design promise: ZOOM_DIST of ground short of the head, so
	       `ZOOM_SLANT` (1.78 m) to a boule on the spot, plus the cluster it sits in. Measured over
	       runs: 1.8-2.3 m. A regression in the walk shows up here first and unambiguously.
	     · the pixels then follow, since `perM` above already pins body x range / H to the field. */
	check(best.m <= ZOOM_SLANT + 1.1,
		`the eye really walks up to the head (nearest boule ${best.m} m, promise ${ZOOM_SLANT.toFixed(2)} m + the cluster)`);
	// 20 px on a 388 px canvas is 5 % of the height. The complaint this round answers measured 5 px.
	check(best.body >= 20,
		`and a boule at the head is actually readable (${best.body} px, was ${baFlat.length ? baFlat.reduce((a, x) => (x.body > a.body ? x : a)).body : '?'} px at zoom 0)`);
	/* The declared cost of 8x: at 1.5 m and 26 deg the eye holds about a metre of ground, so a boule
	   two metres behind the head is out of frame. Accepted — the slider is continuous and the head
	   view is one tap away — but printed every run so it can never drift further unnoticed.
	   WHICH boules fall out is a lottery: it depends on where the throws above happened to land, and
	   about one run in three frames none of them at all. Reported, not asserted — the readability
	   claim above is carried by `perM` against the field, which is a projection and holds off frame
	   too. Turning this into a check only makes the guard fail at random. */
	const out = ys.filter((p) => p <= 0 || p >= 100).length;
	console.log(`     full zoom holds ${ba.length - out}/${ba.length} of the boules in frame (y ${ys.join('% ')}%)`
		+ (out === ba.length ? ' — the known review-zoom lottery, see above' : ''));
}

/* ---------- 11. the launch pad can be SEEN, and it is a PAD ---------- */

// Computed style, never the source: an island's <style> is global, and a prefix collision from
// another island would repaint this and leave the source looking right.
const armCss = await page.evaluate(() => {
	const el = document.querySelector('.pe-arm');
	if (!el) return null;
	const cs = getComputedStyle(el), b = el.getBoundingClientRect();
	const cv = document.querySelector('.pe-canvas').getBoundingClientRect();
	return {
		h: b.height, w: b.width,
		// Its centre against the canvas centre, and how far its bottom sits off the canvas bottom.
		offCentre: (b.left + b.right) / 2 - (cv.left + cv.right) / 2,
		share: (b.width * b.height) / (cv.width * cv.height),
		hCanvas: cv.height,
		fromBottom: cv.bottom - b.bottom,
		bw: cs.borderTopWidth,
		style: cs.borderTopStyle,
		colour: cs.borderTopColor,
		label: document.querySelector('.pe-arm-label')?.textContent?.trim() ?? '',
	};
});
check(!!armCss, 'the launch pad is in the DOM');
if (armCss) {
	check(parseFloat(armCss.bw) >= 2, `its edge is a solid rule, not a hairline (${armCss.bw} ${armCss.style})`);
	check(armCss.style === 'solid', `and solid rather than dotted (${armCss.style})`);
	// An accent edge, not a grey one: the old 30 %-opacity white is why nobody found the pad.
	const rgb = (armCss.colour.match(/[\d.]+/g) ?? []).map(Number);
	check(rgb.length >= 3 && rgb[0] > 180 && rgb[2] < rgb[0] * 0.7, `and drawn in the accent colour (${armCss.colour})`);
	// The height is the one number that may not shrink freely: at 90 px a thumb crossed two
	// graduations by landing 25 px off. The rest is what "fixed and not too big" has to mean —
	// a bounded box, centred, near the bottom edge, and no longer a third of the picture.
	check(armCss.h >= 110 && armCss.h <= 160, `it is tall enough to aim on and no taller (${Math.round(armCss.h)} px)`);
	check(armCss.w <= 240, `it is a pad, not a band across the screen (${Math.round(armCss.w)} px wide)`);
	check(Math.abs(armCss.offCentre) <= 4, `centred on the canvas (off by ${Math.round(armCss.offCentre)} px)`);
	check(armCss.fromBottom > 0 && armCss.fromBottom < 40, `sitting just above the bottom edge (${Math.round(armCss.fromBottom)} px off it)`);
	/* Share of the canvas — gated only where the canvas has room to give any back. On the windowed
	   phone page the canvas is 16/10 of a 390 px column, i.e. 213 px tall, and a pad that clears the
	   110 px readability floor is a quarter of it whatever it is doing. Printing it there rather than
	   asserting it: a gate that cannot be met by a correct build is a gate that gets loosened until
	   it means nothing. The old full-width band took 52 % of that same canvas. */
	const shareTxt = `${Math.round(armCss.share * 100)} % of the canvas (the full-width band took 30 % in fullscreen, 52 % here)`;
	if (armCss.hCanvas >= 320) check(armCss.share < 0.16, `and it gives the pitch back — ${shareTxt}`);
	else console.log(`     canvas only ${Math.round(armCss.hCanvas)} px tall, too short to gate the share: pad is ${shareTxt}`);
	check(armCss.label.length > 10, `it says what it is for ("${armCss.label}")`);
}

/* The legend. Where the finger lands decides the angle, so a board with no graduations on it makes
   the only control that matters a secret — and the labels are what the help text names. */
const marks = await page.evaluate(() => [...document.querySelectorAll('.pe-board-mark')]
	.map((el) => ({ label: el.textContent.trim(), bottom: el.getBoundingClientRect().bottom, on: el.classList.contains('on') })));
check(marks.length >= 4, `the board is graduated (${marks.length} marks: ${marks.map((m) => m.label).join(', ')})`);
if (marks.length >= 2) {
	/* Bottom of the pad = plomb, top = grazing roulette. This is the inversion the board now teaches:
	   the lob is the gesture that starts lowest and has the whole pad to swing through, and drawn the
	   other way up the legend would name the opposite of what the thumb does. */
	const roulette = marks.find((m) => /roulette/i.test(m.label)), plomb = marks.find((m) => /plomb/i.test(m.label));
	check(!!roulette && !!plomb && plomb.bottom > roulette.bottom,
		'the plomb mark is below the roulette mark, which is the gesture it is teaching');
	check(marks.filter((m) => m.on).length === 1, `exactly one mark is lit, the one the loft is on (${marks.filter((m) => m.on).map((m) => m.label).join('/') || 'none'})`);
}

console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await browser.close();
server.stop();
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
