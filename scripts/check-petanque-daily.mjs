/* M7 guard: the daily shooting course is WIRED, not just tuned.

   Measurement H proves the course spreads a field fairly; this proves the island actually runs it.
   Four things can break independently and none of them show up in a screenshot:
     · the ?defi deep link lands on the course and not on a match;
     · a station puts its target AND its guards on the ground (a `serree` is 3 boules, not 1);
     · a settled boule is GRADED and the course steps to the next station;
     · the run is persisted, so a reload resumes where it stopped instead of restarting at 0.

   The throw is a real mouse drag, like a player's — the whole point is to exercise the aim
   pipeline, not to call a function the player never touches. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4367;
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`THROW ${e.message}`));

const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };
const state = () => page.evaluate(() => window.__petanque());

await page.goto(`${base}/jeux/petanque/?defi`, { waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
await page.waitForFunction(() => window.__petanque && window.__petanque().daily && window.__petanque().status === 'aim', null, { timeout: 20000 });

const start = await state();
check(start.daily.station === 0, `?defi opens the course at station 1 (got ${start.daily.station + 1})`);
check(start.daily.points === 0, 'the course starts at 0 pt');
check(start.daily.surface !== 'sable', `the ground is never sand (got ${start.daily.surface})`);
// One target plus its guards, and no jack: a match laid by mistake would have a jack and no station.
check(start.bodies >= 1 && start.bodies <= 3, `the station is on the ground (${start.bodies} boules)`);
check(start.jack === null, 'the course has no jack');
check(await page.locator('.pe-stat', { hasText: 'Atelier 1/12' }).count() > 0, 'the HUD shows the station counter');

// The AI must stay out of the daily. It plays on `turn === AI`, so the seat is the guard.
check(start.match.turn === 0, 'the course never hands the turn to the AI');

// Not fullscreen here: the canvas runs past the fold, and a drag aimed below it hits nothing.
await page.locator('.pe-canvas').scrollIntoViewIfNeeded();
const box = await page.locator('.pe-canvas').boundingBox();
// The strip is clamped in px, so its top is asked for rather than guessed as a share of the height.
const arm = await page.evaluate(() => window.__petanque().arm);
const cx = box.x + box.width * 0.5, cy = box.y + (arm.top + arm.height) / 2;

/** Drag up for power, sideways for direction, release — the player's own gesture. */
async function throwIt(dx, dyUp) {
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + dx, cy - dyUp, { steps: 14 });
	await sleep(400);
	// Check the gauge BEFORE releasing. Waiting on `status !== 'rolling'` alone passes instantly
	// when the drag missed the canvas, so a throw that never happened would read as a pass.
	const armed = await page.evaluate(() => window.__petanque().power);
	if (armed < 0.06) throw new Error(`the aim drag never reached the canvas (power ${armed})`);
	await page.mouse.up();
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 10000 });
	await page.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 60000 });
}

await throwIt(0, 150);
await page.waitForFunction(() => window.__petanque().daily.grades.length === 1, null, { timeout: 20000 });
const after = await state();
check(after.daily.grades.length === 1, `the boule was graded (${after.daily.grades[0]} pt)`);
check([0, 1, 3, 5].includes(after.daily.grades[0]), 'the grade is one of 0/1/3/5');

// The card holds for STATION_CARD_MS, then station 2 is laid. This is the step that a missing
// nextEnd() branch would break — the course would sit on a graded station forever.
await page.waitForFunction(() => window.__petanque().status === 'aim' && window.__petanque().bodies >= 1, null, { timeout: 15000 });
check((await state()).daily.station === 1, 'the course advances to station 2');

// Resume: the attempt is stored per device, so a reload must not hand out a second try at 0.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.pe-canvas');
try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
// ModeToggle segments declare role="tab", so they are not buttons to the a11y tree.
await page.getByRole('tab', { name: /Défi/ }).click();
await page.waitForFunction(() => window.__petanque().daily && window.__petanque().status === 'aim', null, { timeout: 20000 });
const back = await state();
check(back.daily.station === 1, `a reload resumes at station 2 (got ${back.daily.station + 1})`);
check(back.daily.points === after.daily.points, `the points survive the reload (${back.daily.points})`);

// Leaving for free play must drop the course, or a match would be graded as a station.
await page.getByRole('tab', { name: /Libre/ }).click();
await sleep(800);
check((await state()).daily === null, 'Libre leaves the course');

console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await browser.close();
server.stop();
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
