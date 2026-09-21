/* Guard: the camera, the controls and the views, played for real in the browser.
   Nine play-test complaints turned into one model — the bottom strip is the arm, the rest of the
   image is the camera, and the camera IS the aim. That last clause is why this file exists: the
   loft is now driven by the same gesture that frames the shot, so every piece of camera UI is one
   slip away from silently changing the throw. Test 5 is the guard on the signature mechanic.

   Run it twice, and the second run is the one that matters:
     node scripts/check-petanque-camera.mjs
     node scripts/check-petanque-camera.mjs --portrait

   Not covered here, and deliberately: the automatic switch to the top view when the JACK falls to
   the player to place. It needs the AI to throw an illegal jack, which no seed guarantees. What
   that switch switches to is asserted below (test 2, same `jackPhase` branch of the camera) and in
   render3d.camera.test.ts at both lane directions and three aspect ratios. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A phone is the hard case: a tall canvas is already spending its field on sky, so the vertical
// fov is clamped there and none of the gains below are allowed to come out of it.
const PORTRAIT = process.argv.includes('--portrait');
const VP = PORTRAIT ? { width: 390, height: 844 } : { width: 1000, height: 760 };
const PORT = 4372;
/* Readability as one deal independent number: body px * metres / canvas px, which reduces to
   BOULE_R / tan(fov / 2) and so depends on nothing but the field. BOULE_R is engine.ts:15.
   Computed, not measured — the first baseline here was read off rounded pixels and came out 1.8 %
   high, which is most of the gap this script is asked to resolve. */
const BOULE_R = 0.0375;
const perMetre = (fovDeg) => BOULE_R / Math.tan((fovDeg * Math.PI) / 360);
const BASE_PER_M = perMetre(58); // what the old, un-narrowed field gave

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

// Fullscreen the pitch: in `astro preview` the canvas runs past the fold, and a drag aimed at its
// lower half then lands on nothing.
await page.evaluate(() => {
	document.querySelector('.game-page')?.classList.add('gf-full');
	document.documentElement.classList.add('gf-full');
	window.dispatchEvent(new Event('resize'));
});
await sleep(1400);

const state = () => page.evaluate(() => window.__petanque());
const box = await page.locator('.pe-canvas').boundingBox();
const cx = box.x + box.width * 0.5;

// Ask the page where the arm starts rather than guessing a fraction: the strip is a clamp, so its
// share of the canvas is not the same number in the two viewports.
const arm0 = (await state()).arm;
const armY = box.y + arm0.top + (box.height - arm0.top) * 0.45;
const lookY = box.y + arm0.top * 0.45;
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

/* ---------- 3. you cannot throw outside the throwing view (complaint 9) ---------- */

const blocked = await drag(cx, armY, 0, -140);
const after = await state();
check(blocked === 0, `no power builds in the top view (power ${blocked})`);
check(after.status === 'aim', 'the top view never starts a throw');
check(after.view === 'jeu', 'a tap on the dead strip brings the throwing view back in one gesture');

await toView('tete');
const blockedTete = await drag(cx, armY, 0, -140);
check(blockedTete === 0, `no power builds in the head view either (power ${blockedTete})`);
check(await viewNow() === 'jeu', 'the same tap recovers from the head view');

/* ---------- 4. the throw works in the throwing view ---------- */

await toView('jeu');
const armed = await drag(cx, armY, 0, -132, 300);
check(armed > 0.3, `the arm strip arms a throw in the jeu view (power ${armed.toFixed(2)})`);
await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 5000 });
await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
await sleep(700);
const jacked = await state();
check(jacked.jack && jacked.jack.live, 'the jack is down');

/* ---------- 5. a camera drag aims, on both axes (complaints 1 and 5) ---------- */

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
	`a horizontal camera drag swings the aim (${seenBefore?.px} -> ${seenAfter?.px} px)`);
check(Math.abs(turned.loft - lofted.loft) < 1e-9, 'a horizontal drag leaves the loft alone');
await drag(cx, lookY, -120, 0, 200); // back down the lane axis, so the throw below lands on the pitch

/* ---------- 6. the arc still reads as an arc, and the lob still fits (complaint 5) ---------- */

// Hold a drag in the arm strip: the preview arc only exists while the throw is drawn back.
await page.mouse.move(cx, armY);
await page.mouse.down();
await page.mouse.move(cx, armY - 130, { steps: 14 });
await sleep(700);

// The walk-up is for reading the head. Drawing back must put the feet on the circle: an eye left
// five metres up the lane previews an arc that starts behind it, and 49 of 64 points went off the
// top of the frame before this was fixed.
const held = await state();
check(held.walk < 0.2, `drawing the arm back puts the feet back on the circle (walk ${held.walk.toFixed(2)} m)`);

const atLoft = async (wheel, times) => {
	for (let i = 0; i < times; i++) { await page.mouse.wheel(0, wheel); await sleep(60); }
	await sleep(800);
	return state();
};
const mid = await atLoft(120, 4);
check(mid.bow >= 12, `the arc bows off a straight line at mid loft (${mid.bow} px over ${mid.arc.n} pts, loft ${(mid.loft * 180 / Math.PI).toFixed(1)} deg)`);
check(mid.arcOnScreen >= 0.9,
	`the mid-loft arc stays inside the frame (${Math.round(mid.arcOnScreen * 100)}% on screen, off ${JSON.stringify(mid.arc)})`);
const high = await atLoft(-120, 10);
check(high.arcOnScreen >= 0.9,
	`the full lob stays inside the frame (${Math.round(high.arcOnScreen * 100)}% on screen at ${(high.loft * 180 / Math.PI).toFixed(1)} deg, off ${JSON.stringify(high.arc)})`);
await page.mouse.up(); // this one is a real boule
await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 5000 });
await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
await sleep(700);

/* ---------- 7. the turn-start walk-up plays, and gives the circle back (complaint 6) ---------- */

// Hands off from here until it is over: any contact cancels it, which is the point.
let introSeen = null;
for (let i = 0; i < 90; i++) {
	const s = await state();
	if (s.intro) { introSeen = s.intro; break; }
	if (s.status === 'end' || s.status === 'over') break;
	await sleep(300);
}
check(introSeen !== null, `the turn opens by walking up to the head (first stage ${introSeen ?? 'never fired'})`);
let walked = 0;
for (let i = 0; i < 90; i++) {
	const s = await state();
	walked = Math.max(walked, s.walk);
	if (!s.intro && walked > 0) break;
	await sleep(200);
}
check(walked > 1, `the walk-up actually moves the feet (+${walked.toFixed(1)} m)`);
await page.waitForFunction(() => window.__petanque().walk < 0.15, null, { timeout: 8000 })
	.then(() => check(true, 'the walk-up puts the player back on the circle'))
	.catch(async () => check(false, `the walk-up never came back (walk ${(await state()).walk.toFixed(2)} m)`));

/* Something on the ground to read at the end. Flat and gentle: the two throws above were aimed to
   exercise the extremes of the arc preview, and an extreme throw leaves the pitch. */
const myTurn = () => page.waitForFunction(() => {
	const s = window.__petanque();
	return s.status === 'aim' && s.match.turn === 0 && s.match.phase === 'play';
}, null, { timeout: 45000 });
for (let i = 0; i < 3; i++) {
	const s = await state();
	if (s.seen.some((x) => x.side >= 0)) break;
	if (s.status === 'end' || s.status === 'over') break;
	await myTurn();
	await page.mouse.move(cx, armY);
	for (let k = 0; k < 20; k++) { await page.mouse.wheel(0, 120); await sleep(40); } // flatten to a roulette
	await sleep(500);
	await drag(cx, armY, 0, -110, 300);
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 5000 }).catch(() => {});
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(800);
}

/* ---------- 8. no piece of camera UI may touch the loft ---------- */

const loft0 = (await state()).loft;
await toView('tete');
await toView('dessus');
await toView('jeu');
const wb = await page.locator('.pe-walk-bar').boundingBox();
await page.mouse.move(wb.x + wb.width / 2, wb.y + 2);
await page.mouse.down();
await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height - 2, { steps: 12 });
await page.mouse.move(wb.x + wb.width / 2, wb.y + 2, { steps: 12 });
await page.mouse.up();
await sleep(500);
const slid = (await state()).walk;
for (const k of ['w', 'w', 's', 'c']) { await page.keyboard.press(k); await sleep(150); }
await sleep(900);
const loft1 = (await state()).loft;
check(slid > 1, `the slider drags the player up the lane (${slid.toFixed(1)} m at the top)`);
check(loft1 === loft0, `views, slider and keys leave the loft bit for bit (${loft0} -> ${loft1})`);

/* ---------- 9. the head is readable (complaint 5) ---------- */

await page.keyboard.press('c');
await sleep(1200);
const fin = await state();
const ba = fin.seen.filter((x) => x.side >= 0);
check(fin.fov <= 58.05, `the vertical field is never wider than the old one (${fin.fov} deg)`);
if (!PORTRAIT) check(fin.fov <= 50.5, `the field is tightened on a wide canvas (${fin.fov} deg)`);
if (!ba.length) {
	check(false, `no boule down to measure (status ${fin.status}, turn ${fin.match.turn}, `
		+ `${fin.bs.length} bodies, ${fin.bs.filter((b) => b.live).length} live, left ${fin.match.left.join('/')})`);
} else {
	/* Read it off the biggest boule, because `body` is rounded to whole pixels and at 7 px one step
	   is already 14 % — wider than the gain claimed below. So the two halves are asked separately:
	   the gain is asked of `fov`, a real number, and the pixels are only asked to agree with that
	   field inside the rounding band. That second half is the one worth having — the halo formula
	   lives in two places, and a copy left on the old field would make this whole script lie. */
	const best = ba.reduce((a, x) => (x.body > a.body ? x : a));
	const perM = (best.body * best.m) / box.height;
	const want = perMetre(fin.fov);
	const band = (0.5 * best.m + best.body * 0.05) / box.height; // half a px of body, 0.1 m of range
	const ys = ba.map((x) => Math.round((x.py / box.height) * 100));
	console.log(`     ${ba.map((x) => `[s${x.side} ${x.m}m ${x.body}px y${Math.round((x.py / box.height) * 100)}%]`).join(' ')}`);
	check(perM + band >= BASE_PER_M, `boules are at least as big per metre as before (${perM.toFixed(4)} vs ${BASE_PER_M.toFixed(4)})`);
	check(Math.abs(perM - want) <= band,
		`the rendered boules follow the field (${perM.toFixed(4)}, field says ${want.toFixed(4)})`);
	if (!PORTRAIT) check(want >= BASE_PER_M * 1.15, `the field makes boules visibly bigger (${(want / BASE_PER_M).toFixed(2)}x)`);
	check(ys.every((p) => p > 8 && p < 92), `no boule sits on the horizon or under the chin (y ${ys.join('% ')}%)`);
}

console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await browser.close();
server.kill();
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
