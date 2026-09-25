/* Guard: pétanque 1v1 over the REAL Supabase Realtime. Two browser contexts, joined by friend code,
   then a whole opening played by hand — jack, placement if it lands out of the window, four boules.
   Three things must hold, and they fail in different ways:
     1. the two peers stand on the SAME ground (seed alone is not checked — the heightfield is);
     2. after every throw both boards hold the same boules to 1e-9, and the same rules state;
     3. the aim stream reaches the other screen while a peer draws back, and is dropped after.
   Unlike billard this is not pure lockstep: the host snaps positions at rest, so (2) is the
   assertion that the snap actually landed. Needs network. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 4371;
const BOULES = 4;
const base = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle'] });
const errs = [];
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };

const mk = async (label) => {
	const ctx = await browser.newContext({ locale: process.env.PET_LANG || 'fr-FR', viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	page.on('pageerror', (e) => errs.push(`[${label}] THROW ${e.message}`));
	await page.goto(`${base}/jeux/petanque/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.pe-canvas');
	try { await page.locator('.tuto-close').click({ timeout: 2500 }); } catch {}
	await page.waitForFunction(() => window.__petanque && window.__petanque().status === 'aim', null, { timeout: 15000 });
	return page;
};

/* In `astro preview` the canvas runs past the fold, so a drag aimed at its lower half lands on
   nothing. But fullscreen HIDES the mode toggle, so this only happens once the lobby is done. */
const goFull = async (page) => {
	await page.evaluate(() => {
		document.querySelector('.game-page')?.classList.add('gf-full');
		document.documentElement.classList.add('gf-full');
		window.dispatchEvent(new Event('resize'));
	});
	await sleep(1200);
};

const snap = (p) => p.evaluate(() => (window.__petanque ? window.__petanque() : null));

const A = await mk('A'), B = await mk('B');

// ModeToggle segments declare role="tab", which overrides the implicit button role.
await A.getByRole('tab', { name: /ligne/i }).click();
await A.locator('button:has-text("Créer un code")').click();
await sleep(2500);
const code = (await A.locator('.pe-mp-code strong').textContent().catch(() => null))?.trim();
console.log('code:', code);
if (!code) {
	console.log('FAIL: no code (Supabase unreachable?)');
	await browser.close(); server.stop(); process.exit(1);
}

await B.getByRole('tab', { name: /ligne/i }).click();
await B.locator('.pe-mp-join input').fill(code);
await B.locator('.pe-mp-join button:has-text("Rejoindre")').click();

let a = null, b = null;
for (let i = 0; i < 60; i++) {
	await sleep(400);
	a = await snap(A); b = await snap(B);
	if (a?.online && b?.online && a.bodies > 0 && b.bodies > 0) break;
}
if (!(a?.online && b?.online)) {
	console.log('FAIL: both peers did not reach a live match', { a: a?.online, b: b?.online });
	await browser.close(); server.stop(); process.exit(1);
}
console.log(`A side ${a.online.side} host=${a.online.host} · B side ${b.online.side} host=${b.online.host}`);

check(a.online.side !== b.online.side, `les deux joueurs ont des sièges différents (${a.online.side}/${b.online.side})`);
check(a.online.host !== b.online.host, 'exactement un hôte');
check(JSON.stringify(a.terrain) === JSON.stringify(b.terrain),
	`le même terrain des deux côtés (${JSON.stringify(a.terrain)} vs ${JSON.stringify(b.terrain)})`);

const boxes = new Map();
for (const p of [A, B]) { await goFull(p); boxes.set(p, await p.locator('.pe-canvas').boundingBox()); }
const at = (p, fx, fy) => {
	const box = boxes.get(p);
	return { x: box.x + box.width * fx, y: box.y + box.height * fy };
};

/* One throw. The gauge is read BEFORE the release: a negated wait on `status !== 'rolling'` passes
   instantly on exactly the failure it should catch, so a dead drag would certify itself. */
/* Middle of the launch pad, asked of the page. The pad is a fixed box centred on the bottom edge, so
   a fraction of the canvas misses it — and its centre is reported rather than derived, because the
   old (top + height) / 2 read the CANVAS height.
   `seam` is the pad's top, and the pull below aims there rather than 130 px above the press: power
   is measured from the seam, so a press-relative pull from the middle of the pad only charges
   130 - 75 = 55 px. That read as "la visée n'a pas pris" at power 0.29 — the drag worked, the
   instrument was pulling 75 px of dead travel. */
const armAt = async (page) => {
	const box = boxes.get(page);
	const arm = await page.evaluate(() => window.__petanque().arm);
	return { x: box.x + arm.cx, y: box.y + arm.cy, seam: box.y + arm.top };
};

async function throwOn(page, other) {
	const s = await armAt(page);
	const pull = s.seam - 130;
	await page.mouse.move(s.x, s.y);
	await page.mouse.down();
	await page.mouse.move(s.x, pull, { steps: 14 });
	await sleep(300);
	const armedSnap = await snap(page);
	const armed = armedSnap.power;
	// The thrower must see their OWN arc — the guest's used to stop after two points (applySync left
	// every synced boule "airborne", and the preview took its first fall for our landing).
	const who = armedSnap.online.host ? 'host' : 'guest';
	ownArc[who] = Math.max(ownArc[who] ?? 0, armedSnap.arcPx.length);
	if (armed < 0.3) {
		await page.mouse.up();
		return `la visée n'a pas pris (puissance ${armed})`;
	}
	// The other screen must be watching us draw back. Kept inside the drag: the stream stops on
	// release, so asking afterwards can only ever read stale.
	let seen = null;
	for (let i = 0; i < 12; i++) {
		seen = await snap(other);
		if (seen?.oppAim?.live && seen.rayVisible) break;
		await page.mouse.move(s.x + (i % 2 ? 3 : -3), pull - (i % 3), { steps: 2 });
		await sleep(150);
	}
	aimSeen = aimSeen || !!seen?.oppAim?.live;
	raySeen = raySeen || !!seen?.rayVisible;
	await page.mouse.up();
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 5000 });
	for (const p of [page, other]) {
		await p.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 45000 });
	}
	await sleep(900); // the host snaps at rest, the guest drains it in its own onSettled
	return null;
}

async function placeOn(page) {
	const t = at(page, 0.5, 0.42);
	await page.mouse.click(t.x, t.y);
	await sleep(300);
	await page.getByRole('button', { name: /Poser ici/ }).click({ timeout: 5000 });
	await sleep(800);
}

/* The jack is aimed with a ring and thrown with a button, so it never streams an aim — which is
   why `aimSeen` below now means a real boule was watched being drawn back, not the jack. */
async function throwJackOn(page) {
	await page.getByRole('button', { name: /Lancer le bouchon/ }).click({ timeout: 6000 });
	await page.waitForFunction(() => window.__petanque().status === 'rolling', null, { timeout: 5000 });
	for (const p of [A, B]) {
		await p.waitForFunction(() => window.__petanque().status !== 'rolling', null, { timeout: 45000 });
	}
	await sleep(900);
}

/** Every float both boards hold, in a form a string compare can judge. */
const ground = (s) => s.bs.map((x) => `${x.side}:${x.x.toFixed(9)},${x.y.toFixed(9)},${x.z.toFixed(9)},${x.live ? 1 : 0}`).join('|');
const rules = (s) => `${s.match.turn}/${s.match.phase}/${s.match.left.join('-')}/${s.match.scores.join('-')}/${s.match.endNo}`;

let aimSeen = false, raySeen = false;
const ownArc = {};
let drift = null, ruleDrift = null, dead = null;
let thrown = 0;

for (let step = 0; step < 40 && thrown < BOULES + 1; step++) {
	a = await snap(A); b = await snap(B);
	if (a.status === 'rolling' || b.status === 'rolling') { await sleep(300); continue; }
	if (a.status === 'over' || a.status === 'end') break;

	if (drift === null && ground(a) !== ground(b)) drift = `les boules divergent après ${thrown} lancers`;
	if (ruleDrift === null && rules(a) !== rules(b)) ruleDrift = `les règles divergent après ${thrown} lancers (${rules(a)} vs ${rules(b)})`;

	const turn = a.match.turn;
	const page = a.online.side === turn ? A : B;
	const other = page === A ? B : A;

	if (a.status === 'placing') {
		if ((await snap(page)).status === 'placing') await placeOn(page);
		else await sleep(400);
		continue;
	}

	if (a.match.phase === 'throw-jack') {
		await throwJackOn(page);
		thrown++;
		continue;
	}

	const why = await throwOn(page, other);
	if (why) { dead = why; break; }
	thrown++;
	const x = await snap(A), y = await snap(B);
	console.log(`     lancer ${thrown}: sol ${x.bs.length}/${y.bs.length} · tour ${x.match.turn}/${y.match.turn} · restants ${x.match.left.join('-')} vs ${y.match.left.join('-')}`);
}

a = await snap(A); b = await snap(B);

check(dead === null, dead ?? 'chaque joueur peut viser sur son tour');
check(thrown >= BOULES, `${BOULES} boules jouées (${thrown - 1} après le bouchon)`);
check(drift === null, drift ?? 'les positions concordent à 1e-9 après chaque lancer');
check(ruleDrift === null, ruleDrift ?? 'les règles concordent après chaque lancer');
check(ground(a) === ground(b), 'le sol final est identique des deux côtés');
check(a.match.scores.join('-') === b.match.scores.join('-'), `les scores concordent (${a.match.scores} vs ${b.match.scores})`);
check(aimSeen, 'la visée adverse arrive sur l’autre écran');
check(raySeen, 'le rayon de visée adverse est affiché');
check(!a.oppAim?.live && !b.oppAim?.live, 'le rayon est retiré après le lancer');
check((ownArc.host ?? 0) > 20 && (ownArc.guest ?? 0) > 20,
	`chaque joueur voit sa propre trajectoire en visant (hôte ${ownArc.host ?? '-'} pts, invité ${ownArc.guest ?? '-'} pts)`);

console.log(errs.length ? `\nPAGE ERRORS:\n${errs.join('\n')}` : '\nno page errors');
await browser.close();
server.stop();
if (fail.length || errs.length) { console.log(`\n${fail.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
process.exit(0);
