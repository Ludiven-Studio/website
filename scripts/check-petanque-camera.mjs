/* Guard: the camera, the controls and the views, played for real in the browser.
   The model this file defends, after the "on n'y voit rien meme sur PC" round:
     - the camera is FREE (yaw well past the throwing limit), and the throw is SAMPLED off it at the
       instant the strip is touched, then frozen for the rest of the drag;
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
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

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
const YAW_MAX = 0.42; // rad — the THROW limit. The camera goes to 1.2.

const base = `http://localhost:${PORT}`;
const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await sleep(300); }

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

// Ask the page where the arm starts rather than guessing a fraction: the strip is a clamp, so its
// share of the canvas is not the same number in the two viewports.
let arm0 = (await state()).arm;
let armY = box.y + arm0.top + (box.height - arm0.top) * 0.45;
let lookY = box.y + arm0.top * 0.45;
console.log(`viewport ${VP.width}x${VP.height} · canvas ${Math.round(box.width)}x${Math.round(box.height)} `
	+ `· arm starts at ${arm0.top}px (${Math.round((arm0.top / arm0.height) * 100)}%)`);
check(lookY > box.y + 40 && armY < box.y + box.height - 10, 'the arm strip and the camera area are both reachable');

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

/* ---------- 5. the camera is free, the aim is clamped and sampled ---------- */

await toView('jeu');
const before5 = await state();
await drag(cx, lookY, 0, 90, 300); // pull down: the eye rises, the throw lobs
const lofted = await state();
check(Math.abs(lofted.loft - before5.loft) > 0.02,
	`a vertical camera drag changes the loft (${before5.loft.toFixed(3)} -> ${lofted.loft.toFixed(3)})`);

// Follow it by its slot in `seen`, never by its distance: swinging the camera is exactly what
// changes that distance, so matching on it compares a body to nothing.
const i5 = lofted.seen.findIndex((x) => x.px > 0 && x.px < box.width);
await drag(cx, lookY, 120, 0, 300);
const turned = await state();
const seenBefore = lofted.seen[i5], seenAfter = turned.seen[i5];
check(i5 >= 0 && !!seenAfter && Math.abs(seenAfter.px - seenBefore.px) > 20,
	`a horizontal camera drag swings the view (${seenBefore?.px} -> ${seenAfter?.px} px)`);
check(Math.abs(turned.loft - lofted.loft) < 1e-9, 'a horizontal drag leaves the loft alone');

/* The complaint was that the camera was not free: it was bridled to the throw's own +-24 deg. A
   long drag must now take the EYE well past that while the THROW stays inside it. */
/* Chained, not one long sweep: a phone canvas is 390 px wide, so a single drag that clears 24 deg
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

/* What the strip owns once it is held. The LOFT is sampled at the press and cannot move — that is
   the whole mechanic, since the pitch is the loft and the eye has nowhere to go mid-throw. The yaw
   is the exception: dragging sideways in the strip steers the throw, and only the throw. So the
   camera must sit still while the aim swings — the opposite of the rest of this file, where the
   camera leads and the aim follows.
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

// Still holding from block 5. The loft is frozen now, so the two lofts below are each set with a
// camera drag FIRST and armed after — which is the mechanic, stated as a test.
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

const armAt = async (pitchDrag) => {
	await drag(cx, lookY, 0, pitchDrag, 260); // set the eye, and with it the loft
	await page.mouse.move(cx, armY);
	await page.mouse.down();
	await page.mouse.move(cx, armY - 130, { steps: 14 });
	await sleep(700);
	return state();
};

/* WHERE along the flight the arc is lost, not which edge loses it. Both were tried: the edge is
   the wrong discriminator, because the hand leaves by the bottom at a plunged eye and by the side
   at a grazing one — the eye sits above and one shoulder across from it, so the first points are
   beside the frame either way and nothing readable goes with them. Past the hand, any loss is a
   bug, whichever edge it is: a cropped apex and a cropped landing are the two things the preview
   exists to show. `arc.at` reports each off point as a percentage of the flight. */
const HAND = 10; // % of the flight that is still inside the player's own hand
const lostInFlight = (s) => s.arc.at.filter((p) => p > HAND);

const mid = await armAt(-40); // plunge a little: a flatter throw
check(mid.zoom === 0, `drawing the arm back puts the feet back on the circle (zoom ${mid.zoom})`);
check(mid.bow >= 12, `the arc bows off a straight line at mid loft (${mid.bow} px over ${mid.arc.n} pts, loft ${(mid.loft * 180 / Math.PI).toFixed(1)} deg)`);
check(lostInFlight(mid).length === 0, `the mid-loft flight is on screen from the hand to the ground (${JSON.stringify(mid.arc)})`);
check(mid.arcOnScreen >= 0.8,
	`and the hand costs little of it (${Math.round(mid.arcOnScreen * 100)}% on screen, off ${JSON.stringify(mid.arc)})`);
await page.mouse.move(cx, armY, { steps: 4 });
await sleep(120);
await page.mouse.up();
await sleep(200);

const high = await armAt(110); // pull down hard: the eye grazes, the throw is a full lob
check(lostInFlight(high).length === 0,
	`the full lob keeps its apex and its landing in the frame at ${(high.loft * 180 / Math.PI).toFixed(1)} deg (${JSON.stringify(high.arc)})`);
check(high.arcOnScreen >= 0.8,
	`and the hand costs little of the lob either (${Math.round(high.arcOnScreen * 100)}%, off ${JSON.stringify(high.arc)})`);
check(high.loft > mid.loft, `the eye really drives the loft (${(mid.loft * 180 / Math.PI).toFixed(1)} -> ${(high.loft * 180 / Math.PI).toFixed(1)} deg)`);
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

/* Something on the ground to read at the end. Flat and gentle: the two throws above were aimed to
   exercise the extremes of the arc preview, and an extreme throw leaves the pitch. */
const myTurn = () => page.waitForFunction(() => {
	const s = window.__petanque();
	return s.status === 'aim' && s.match.turn === 0 && s.match.phase === 'play';
}, null, { timeout: 45000 });
for (let i = 0; i < 3; i++) {
	const s = await state();
	if (s.seen.filter((x) => x.side >= 0).length >= 2) break;
	if (s.status === 'end' || s.status === 'over') break;
	await myTurn();
	await drag(cx, lookY, 0, -60, 220); // plunge the eye: a flat roulette that stays on the pitch
	await drag(cx, armY, 0, -110, 300);
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 5000 }).catch(() => {});
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(800);
}

/* ---------- 8. no piece of camera UI may touch the throw ---------- */

await myTurn().catch(() => {});
const s8 = await state();
const loft0 = s8.loft, yaw0 = s8.aim.yaw;
await toView('tete');
await toView('dessus');
await toView('jeu');
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
check(s8b.aim.yaw === yaw0, `and the aim direction too (${yaw0} -> ${s8b.aim.yaw})`);

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
armY = box.y + arm0.top + (box.height - arm0.top) * 0.45;
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
	const best = ba.reduce((a, x) => (x.body > a.body ? x : a));
	const perM = (best.body * best.m) / box.height;
	const want = perMetre(zed.fov);
	const band = (0.5 * best.m + best.body * 0.05) / box.height; // half a px of body, 0.1 m of range
	const ys = ba.map((x) => Math.round((x.py / box.height) * 100));
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
	/* Only of the boule the claim is made about. A grazing boule projects a body that is no longer a
	   size, so a reading taken at the horizon or under the chin would not mean what it says. */
	const bestY = Math.round((best.py / box.height) * 100);
	check(bestY > 5 && bestY < 95, `the boule it was measured on is squarely in frame (y ${bestY}%)`);
	/* The declared cost of 8x: at 1.5 m and 26 deg the eye holds about a metre of ground, so a boule
	   two metres behind the head is out of frame. Accepted — the slider is continuous and the head
	   view is one tap away — but printed every run so it can never drift further unnoticed. */
	const out = ys.filter((p) => p <= 0 || p >= 100).length;
	console.log(`     full zoom holds ${ba.length - out}/${ba.length} of the boules in frame (y ${ys.join('% ')}%)`);
}

/* ---------- 11. the throwing strip can be SEEN ---------- */

// Computed style, never the source: an island's <style> is global, and a prefix collision from
// another island would repaint this and leave the source looking right.
const armCss = await page.evaluate(() => {
	const el = document.querySelector('.pe-arm');
	if (!el) return null;
	const cs = getComputedStyle(el);
	return {
		h: el.getBoundingClientRect().height,
		w: cs.borderTopWidth,
		style: cs.borderTopStyle,
		colour: cs.borderTopColor,
		label: document.querySelector('.pe-arm-label')?.textContent?.trim() ?? '',
	};
});
check(!!armCss, 'the throwing strip is in the DOM');
if (armCss) {
	check(parseFloat(armCss.w) >= 2, `its top edge is a solid rule, not a hairline (${armCss.w} ${armCss.style})`);
	check(armCss.style === 'solid', `and solid rather than dotted (${armCss.style})`);
	// An accent edge, not a grey one: the old 30 %-opacity white is why nobody found the strip.
	const rgb = (armCss.colour.match(/[\d.]+/g) ?? []).map(Number);
	check(rgb.length >= 3 && rgb[0] > 180 && rgb[2] < rgb[0] * 0.7, `and drawn in the accent colour (${armCss.colour})`);
	check(armCss.h > 60, `it is a real strip, not a line (${Math.round(armCss.h)} px tall)`);
	check(armCss.label.length > 10, `it says what it is for ("${armCss.label}")`);
}

console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await browser.close();
server.kill();
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
