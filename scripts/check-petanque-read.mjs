/* Guard: the four things added so you can READ the game.
     1. the head view orbits the other way round on the vertical axis;
     2. the eye goes and looks at the boule that just stopped, then comes back;
     3. the distance rings are on the ground during play and gone while anything rolls;
     4. the end of an end shows the table, and the table agrees with the score.
   Plays one complete end in Libre against the AI — same harness as check-petanque-turns.
   The table is read off the DOM and the rings out of the scene graph: "the toggle is on" and
   "there are rings on the ground" are two different claims, and only the second one is the ask. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4369;
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ locale: process.env.PET_LANG || 'fr-FR', viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
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

// In `astro preview` the canvas runs past the fold and a drag aimed at its lower half lands on
// nothing.
await page.evaluate(() => {
	document.querySelector('.game-page')?.classList.add('gf-full');
	document.documentElement.classList.add('gf-full');
	window.dispatchEvent(new Event('resize'));
});
await sleep(1200);

const state = () => page.evaluate(() => window.__petanque());
const box = await page.locator('.pe-canvas').boundingBox();
const cx = box.x + box.width * 0.5;
/* The launch pad is a fixed box centred on the bottom edge, so its centre is asked for rather than
   derived: (top + height) / 2 used the CANVAS height and only held while the pad reached the bottom. */
const arm = await page.evaluate(() => window.__petanque().arm);
const cy = box.y + arm.cy;
/* Pulls aim at the SEAM, not 132 px above the press: power is measured from the pad's top, so a
   press-relative pull from the middle of the pad wastes half the pad as dead travel. */
const seam = box.y + arm.top;
const lookY = box.y + arm.top * 0.45; // camera area, above the pad

const drag = async (x, y, dx, dy, steps = 10) => {
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx, y + dy, { steps });
	await page.mouse.up();
	await sleep(260);
};
const toView = async (k) => {
	await page.locator(`.pe-view:nth-child(${['jeu', 'tete', 'dessus'].indexOf(k) + 1})`).click();
	await sleep(500);
};
const liveBoules = (s) => s.bs.filter((b) => b.live && b.side >= 0).length;

/* ---------- 1. the vertical axis of the head view ---------- */

/* Run mid-end and not at the open: the game opens on the jack, which is aimed from the top view,
   and a camera drag there moves nothing — which read as "the inversion broke the game view".
   Stated as a RELATION, never as "down must raise the eye": the game view is the reference the
   complaint was made against, so the claim is that the same gesture now moves the two the other
   way round. An absolute direction here would only be my guess about which way is natural. */
async function checkInversion() {
	const camBefore = (await state()).cam.pitch;
	await drag(cx, lookY, 0, 70);
	const camAfter = (await state()).cam.pitch;

	await toView('tete');
	const headBefore = (await state()).head.pitch;
	await drag(cx, lookY, 0, 70);
	const afterHead = await state();
	const headAfter = afterHead.head.pitch;

	const dCam = camAfter - camBefore, dHead = headAfter - headBefore;
	console.log(`     the same downward drag: game view ${dCam.toFixed(3)} rad · head view ${dHead.toFixed(3)} rad`);
	check(Math.abs(dCam) > 0.02, `a vertical drag still moves the game view (${dCam.toFixed(3)} rad)`);
	check(Math.abs(dHead) > 0.02, `and it moves the head view too (${dHead.toFixed(3)} rad)`);
	/* Absolute directions now, both asked for by the player. Game view: the finger leads the gaze, so a
	   downward drag looks down (pitch up). Head view: the orbit is unchanged, a downward drag lifts the
	   eye over the head (pitch up). The old "opposite way round" rule died when the game view flipped. */
	check(dCam > 0, `the game view looks the way the finger goes (drag down looks down, ${dCam.toFixed(3)} rad)`);
	check(dHead > 0, `the head view keeps its orbit direction (drag down lifts the eye, ${dHead.toFixed(3)} rad)`);

	/* Why the inversion could be scoped to one line: the head view carries its own angles, so
	   orbiting it cannot reach the loft. The only way this change could have cost a throw. */
	await toView('jeu');
	check((await state()).loft === afterHead.loft, `and orbiting the head leaves the loft alone (${afterHead.loft})`);
	console.log('');
}

/* ---------- 2-4. one full end ---------- */

async function humanThrow() {
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx, seam - 132, { steps: 12 });
	await sleep(250);
	const armed = (await state()).power;
	await page.mouse.up();
	if (armed < 0.3) return false;
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 4000 });
	// Read WHILE it rolls: a ring is a measurement, and a measurement of a moving boule is a lie.
	await sleep(400);
	rolling.push(await state());
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(250);
	return true;
}

async function placeJack() {
	await page.mouse.click(cx, box.y + box.height * 0.42);
	await sleep(250);
	await page.getByRole('button', { name: /Poser ici/ }).click({ timeout: 4000 });
	await sleep(400);
}

async function throwJack() {
	await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 4000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 40000 });
	await sleep(350);
}

const rolling = []; // states sampled mid-roll
const resting = []; // states sampled with everything at rest, mid-end
let sawReview = false;
let scoreBefore = null;
let inverted = false; // block 1, run once the player is actually aiming a boule

for (let step = 0; step < 60; step++) {
	const s = await state();
	if (s.match.endNo !== 1 || s.status === 'end' || s.status === 'over') break;

	if (s.status === 'rolling') {
		if (s.intro) sawReview = true;
		await sleep(200);
		continue;
	}
	if (s.status === 'placing') { if (s.match.turn === 0) await placeJack(); else await sleep(300); continue; }
	if (s.status === 'aim' && s.match.phase === 'throw-jack') {
		if (s.match.turn === 0) await throwJack(); else await sleep(300);
		continue;
	}
	if (s.match.phase === 'play' && liveBoules(s) > 0) {
		resting.push(s);
		scoreBefore = s.match.scores.slice();
	}
	// The look at the last boule runs right after a settle, so it is caught here and not mid-roll.
	if (s.intro) sawReview = true;
	if (s.match.turn !== 0) { await sleep(250); continue; }
	/* Not during the walk-up: it runs on EVERY turn, a drag cancels it, and the eye is not on the
	   circle while it plays. Waited out rather than skipped — skipping meant the branch was never
	   once taken and the block silently never ran. */
	if (!inverted) {
		await page.waitForFunction(() => !window.__petanque().intro, null, { timeout: 9000 }).catch(() => {});
		if ((await state()).view === 'jeu') { inverted = true; await checkInversion(); continue; }
	}
	if (!(await humanThrow())) { await sleep(300); continue; }
}

/* ---------- 2. the review beat ---------- */

check(inverted, 'the player got a turn to aim from the circle (block 1 ran)');
check(sawReview, 'the eye goes and looks at the boule that just stopped');
const back = await state();
check(back.intro === null, `and it comes back on its own (intro ${back.intro})`);

/* ---------- 3. the rings ---------- */

check(resting.length > 0, `the end was actually played (${resting.length} samples at rest)`);
if (resting.length) {
	const bad = resting.filter((s) => !s.dists.visible || s.dists.rings !== liveBoules(s));
	console.log(`     at rest: ${resting.map((s) => `${s.dists.rings}/${liveBoules(s)}`).join(' ')}`);
	check(bad.length === 0,
		bad.length ? `a ring per boule, always (${bad[0].dists.rings} rings for ${liveBoules(bad[0])} boules)` : 'one ring per boule on the ground, every time');
}
const rollingSeen = rolling.filter((s) => s.status === 'rolling');
console.log(`     mid-roll: ${rollingSeen.map((s) => (s.dists.visible ? 'shown' : 'hidden')).join(' ')}`);
check(rollingSeen.length > 0 && rollingSeen.every((s) => !s.dists.visible),
	`the rings are gone while a boule rolls (${rollingSeen.length} samples)`);

// The toggle has to reach the ground, not just the button.
await page.locator('.pe-act[aria-label*="Cercles"]').click();
await sleep(400);
const off = await state();
check(off.dists.on === false && off.dists.visible === false, 'the toggle takes the rings off the ground');
await page.locator('.pe-act[aria-label*="Cercles"]').click();
await sleep(400);
check((await state()).dists.on === true, 'and puts them back');

/* ---------- 4. the table ---------- */

await page.waitForSelector('.pe-table', { timeout: 20000 }).catch(() => {});
const fin = await state();

/* ---------- 5. the end of an end shows the LAYOUT, not the next empty lane ---------- */

/* `finishEnd` scores and advances in the same beat, so the circle jumps to where the jack was and
   the game view re-seats itself there — with its back to the boules just counted. Measured before
   the fix: 7 live bodies, all seven projected off-frame, behind a card sitting dead centre.
   The circle is taken from the last sample at REST, because `match.circle` is already the next
   end's by the time the card is up — that swap is the bug itself. */
{
	const canvas = await page.evaluate(() => {
		const r = document.querySelector('.pe-canvas').getBoundingClientRect();
		const el = document.querySelector('.pe-endcard');
		const c = el ? el.getBoundingClientRect() : null;
		return { w: r.width, h: r.height, card: c ? { x: c.x - r.x, y: c.y - r.y, w: c.width, h: c.height } : null };
	});
	const live = fin.bs.filter((b) => b.live);
	const seen = fin.seen.filter((b) => b.m !== undefined);
	const inFrame = seen.filter((b) => b.px >= 0 && b.px <= canvas.w && b.py >= 0 && b.py <= canvas.h);
	console.log(`     plan final: ${inFrame.length}/${seen.length} corps dans le cadre`
		+ ` · ${live.length} vivants · vue ${fin.view}`);
	check(seen.length > 0 && inFrame.length === seen.length,
		`every boule still on the ground is in frame (${inFrame.length}/${seen.length})`);

	check(!!canvas.card, 'the verdict card is up');
	if (canvas.card) {
		const c = canvas.card;
		const under = seen.filter((b) => b.px >= c.x && b.px <= c.x + c.w && b.py >= c.y && b.py <= c.y + c.h);
		const share = (c.w * c.h) / (canvas.w * canvas.h);
		/* The largest unbroken band left over, not "how far right does it reach". Standing up there is
		   no side to dock to — 214 px of card in a 390 px canvas — and the card takes the bottom band
		   instead. One metric has to answer for both shapes, or the two guards mean different things
		   by "aside". Kept in step with scripts/snap-petanque-phone.mjs. */
		const free = Math.max(c.x * canvas.h, (canvas.w - c.x - c.w) * canvas.h,
			canvas.w * c.y, canvas.w * (canvas.h - c.y - c.h)) / (canvas.w * canvas.h);
		console.log(`     carte ${Math.round(c.w)}x${Math.round(c.h)} @ ${Math.round(c.x)},${Math.round(c.y)}`
			+ ` · ${(share * 100).toFixed(0)} % du terrain · bande libre ${(free * 100).toFixed(0)} %`
			+ ` · ${under.length} corps dessous`);
		// Same three numbers the end-of-match panel is held to: on a side, small, and off the boules.
		check(free >= 0.55, `the card leaves the layout a band to live in (${(free * 100).toFixed(0)} %)`);
		check(share <= 0.35, `and it is a panel, not a curtain (${(share * 100).toFixed(0)} % of the pitch)`);
		check(under.length === 0, `no boule is hidden behind the verdict (${under.length})`);
	}

	/* Framed from the wrong end would pass every check above: the layout is still all in frame, just
	   seen from behind. So the eye is asked which SIDE of the head it stands on, against the circle
	   this end was actually thrown from. */
	const from = resting.length ? resting[resting.length - 1].match.circle : null;
	const hf = fin.jack && fin.jack.live
		? { x: fin.jack.x, y: fin.jack.y }
		: live.length
			? { x: live.reduce((a, b) => a + b.x, 0) / live.length, y: live.reduce((a, b) => a + b.y, 0) / live.length }
			: null;
	if (from && hf && fin.cam.eye) {
		const dot = (fin.cam.eye.x - hf.x) * (from.x - hf.x) + (fin.cam.eye.y - hf.y) * (from.y - hf.y);
		console.log(`     oeil ${fin.cam.eye.x.toFixed(1)},${fin.cam.eye.y.toFixed(1)} · tete ${hf.x.toFixed(1)},${hf.y.toFixed(1)}`
			+ ` · cercle joue ${from.x.toFixed(1)},${from.y.toFixed(1)} · dot ${dot.toFixed(2)}`);
		check(dot > 0, `the eye stands on the side the end was thrown from (dot ${dot.toFixed(2)})`);
	} else check(false, 'the circle, the head and the eye were all readable');
}

const table = await page.evaluate(() => {
	const el = document.querySelector('.pe-table');
	if (!el) return null;
	return [...el.querySelectorAll('li')].map((li) => ({
		won: li.classList.contains('won'),
		who: li.children[1]?.textContent?.trim() ?? '',
		d: li.querySelector('.pe-table-d')?.textContent?.trim() ?? '',
		star: (li.querySelector('.pe-table-pt')?.textContent ?? '').trim(),
	}));
});
check(!!table, 'the end of the end shows the table');
if (table) {
	console.log(`     ${table.map((r) => `${r.who} ${r.d}${r.won ? ' *' : ''}`).join(' | ')}`);
	const metres = table.map((r) => (r.d.endsWith('cm') ? parseFloat(r.d) / 100 : parseFloat(r.d)));
	const sorted = metres.every((m, i) => i === 0 || m >= metres[i - 1] - 1e-9);
	const stars = table.filter((r) => r.star === '★').length;
	const got = scoreBefore ? fin.match.scores[0] + fin.match.scores[1] - scoreBefore[0] - scoreBefore[1] : -1;

	check(table.length === fin.bs.filter((b) => b.live && b.side >= 0).length,
		`every boule on the ground is in it (${table.length} rows)`);
	check(sorted, `nearest first (${metres.map((m) => m.toFixed(2)).join(' ')})`);
	check(stars === table.filter((r) => r.won).length, 'the star and the highlight mark the same rows');
	/* The point of the table: it must not be able to disagree with the score printed beside it.
	   That is why `bouleTable` asks `endScore` instead of re-deriving the rule from distances. */
	check(stars === got, `it counts exactly the points that were scored (${stars} starred, ${got} scored)`);
	if (stars > 0) {
		const who = table.find((r) => r.star === '★').who;
		check(table.filter((r) => r.star === '★').every((r) => r.who === who), 'and they all belong to one side');
		check(table[0].star === '★', 'the nearest boule is one of them');
	}
}

console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await browser.close();
server.stop();
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
