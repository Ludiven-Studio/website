/* Flow tests for /rencontres, over a FAKE backend.
   scripts/check-rencontres.mjs hits production, so it can only afford the happy
   path and needs an admin key to clean up. This one answers the meetups function
   itself from a table in this file, which buys the cases that matter and cost
   nothing: a refused publish, a full game, someone else's game, an edit, a
   cancellation.

   The bug it exists for: a publish refused by the server painted its message in a
   banner at the top of a page two screens tall, while the player was looking at
   the button. It read as "Publier ne fait rien", and nothing on screen said the
   game had not been posted. So the assertions below are not only "the message is
   in the DOM" — they check it is inside the viewport.

     node scripts/check-rencontres-flows.mjs

   No key, no network, no writes. Tiles are cut off and the service worker is
   blocked: a SW would serve the function call itself and route() would never see
   it. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const PORT = 4402;
const BASE = `http://localhost:${PORT}`;
const HOME = { lat: 45.4489, lng: 5.1381 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const iso = (msAhead) => new Date(Date.now() + msAhead).toISOString();

// ---- the fake meetups function ----

const S1 = uuid(101);
const S2 = uuid(102);
const E_OTHER = uuid(201);
const E_FULL = uuid(202);

const makeBackend = () => {
	let next = 900;
	const state = {
		refuseNextCreate: false,
		spots: [
			{ id: S1, lat: HOME.lat, lng: HOME.lng, label: 'Boulodrome du Parc', commune: 'Saint-Jean-de-Bournay', confirmed: true },
			{ id: S2, lat: 45.4700, lng: 5.1700, label: 'Terrain des Écoles', commune: 'Artas', confirmed: false },
		],
		events: [
			{
				id: E_OTHER, spot_id: S2, starts_at: iso(30 * 3600e3), ends_at: iso(33 * 3600e3),
				format: 'doublette', players_needed: 4, role_needed: 'tireur',
				organizer_name: 'Léa', organizer_seats: 1, status: 'open',
				lat: 45.4700, lng: 5.1700, label: 'Terrain des Écoles', commune: 'Artas',
				confirmed: false, seats_taken: 1,
			},
			{
				id: E_FULL, spot_id: S2, starts_at: iso(54 * 3600e3), ends_at: iso(57 * 3600e3),
				format: 'triplette', players_needed: 6, role_needed: 'any',
				organizer_name: 'Marcel', organizer_seats: 6, status: 'open',
				lat: 45.4600, lng: 5.1600, label: 'Terrain des Écoles', commune: 'Artas',
				confirmed: true, seats_taken: 6,
			},
		],
		signups: { [E_OTHER]: [], [E_FULL]: [] },
		secrets: {},
	};

	const ok = (body) => ({ status: 200, body });
	const bad = (error, status = 400) => ({ status, body: { error } });

	const handle = (b) => {
		const find = () => state.events.find((e) => e.id === b.eventId);
		switch (b.action) {
			case 'list':
				return ok({ events: state.events.filter((e) => e.status === 'open'), spots: state.spots });
			case 'get_event': {
				const e = find();
				if (!e) return bad('unknown event', 404);
				return ok({ event: e, signups: state.signups[e.id] ?? [], isOrganizer: Boolean(b.secret) && b.secret === state.secrets[e.id] });
			}
			case 'create_event': {
				if (state.refuseNextCreate) {
					state.refuseNextCreate = false;
					return bad("Trop de parties créées aujourd'hui. Réessaie demain.", 429);
				}
				const id = uuid(next++);
				const secret = `secret-${id}`;
				state.secrets[id] = secret;
				state.signups[id] = [];
				state.events.push({
					id, spot_id: S1, starts_at: b.startsAt, ends_at: b.endsAt,
					format: b.format, players_needed: b.playersNeeded, role_needed: b.roleNeeded,
					organizer_name: b.organizerName, organizer_seats: b.organizerSeats, status: 'open',
					lat: b.lat, lng: b.lng, label: 'Boulodrome du Parc', commune: 'Saint-Jean-de-Bournay',
					confirmed: true, seats_taken: b.organizerSeats,
				});
				return ok({ id, secret });
			}
			case 'update_event': {
				const e = find();
				if (!e || state.secrets[e.id] !== b.secret) return bad('forbidden', 403);
				Object.assign(e, {
					starts_at: b.startsAt, ends_at: b.endsAt, format: b.format,
					players_needed: b.playersNeeded, role_needed: b.roleNeeded,
				});
				return ok({ ok: true });
			}
			case 'cancel_event': {
				const e = find();
				if (!e || state.secrets[e.id] !== b.secret) return bad('forbidden', 403);
				e.status = 'cancelled';
				return ok({ ok: true });
			}
			case 'join': {
				const e = find();
				if (!e) return bad('unknown event', 404);
				if (e.seats_taken + b.seats > e.players_needed) return bad('Plus de place.', 409);
				state.signups[e.id] = [...(state.signups[e.id] ?? []), {
					player_id: b.playerId, player_name: b.playerName, seats: b.seats, role: b.role,
				}];
				e.seats_taken += b.seats;
				return ok({ ok: true });
			}
			case 'leave': {
				const e = find();
				if (!e) return bad('unknown event', 404);
				const gone = (state.signups[e.id] ?? []).find((s) => s.player_id === b.playerId);
				if (gone) {
					state.signups[e.id] = state.signups[e.id].filter((s) => s !== gone);
					e.seats_taken -= gone.seats;
				}
				return ok({ ok: true });
			}
			default:
				return bad(`unhandled ${b.action}`, 500);
		}
	};

	return { state, handle };
};

// ---- harness ----

const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ } await sleep(300); }

const backend = makeBackend();
const browser = await chromium.launch();
// Short on purpose: the whole bug was feedback landing outside a small window.
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, serviceWorkers: 'block' });
await ctx.route('**/functions/v1/meetups', async (route) => {
	const body = JSON.parse(route.request().postData() || '{}');
	const r = backend.handle(body);
	await route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
});
await ctx.route(/tile\.openstreetmap\.org/, (route) => route.abort());

const page = await ctx.newPage();
page.on('pageerror', (e) => fail.push(`THROW ${e.message}`));

/** The assertion the page-level banner would have passed and the player still
 *  saw nothing: in the DOM AND on screen. */
const onScreen = async (selector) => {
	const box = await page.locator(selector).first().boundingBox();
	const vh = page.viewportSize().height;
	return Boolean(box) && box.y + box.height > 0 && box.y < vh;
};

const clickMap = async (fx, fy) => {
	await page.locator('.re-map').scrollIntoViewIfNeeded();
	const b = await page.locator('.re-map').boundingBox();
	await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
};

try {
	await page.goto(`${BASE}/rencontres/`, { waitUntil: 'networkidle' });
	await page.waitForSelector('.re-map', { timeout: 15000 });
	await page.locator('.re-segbtn', { hasText: 'Tout' }).click();
	check(await page.locator('.re-item').count() === 2, 'les deux parties du faux serveur sont listees');

	// ---- 1. A refused publish must say so, under the button that was pressed ----
	backend.state.refuseNextCreate = true;
	await page.locator('.re-bar .re-btn', { hasText: 'Poser une partie' }).click();
	await page.waitForSelector('.re-form');
	await clickMap(0.5, 0.5);
	check(await page.locator('.re-pinstate--set').count() === 1, 'le clic sur la carte pose l epingle');

	const field = (label) => page.locator('.re-form label').filter({ hasText: label });
	await field('Ton prénom').locator('input').fill('Raph');
	const submit = page.locator('.re-form button[type="submit"]');
	await submit.scrollIntoViewIfNeeded();
	await submit.click();
	await page.waitForSelector('.re-form .re-error', { timeout: 10000 });
	check(
		(await page.locator('.re-form .re-error').innerText()).includes('Trop de parties'),
		'le refus serveur s affiche dans le formulaire',
	);
	check(await onScreen('.re-form .re-error'), 'et il est dans la fenetre, pas deux ecrans plus haut');
	check(await page.locator('.re-form').count() === 1, 'le formulaire reste ouvert pour reessayer');
	check(await page.locator('.re-secret').count() === 0, 'rien ne laisse croire que la partie est passee');

	// ---- 2. The retry succeeds, and says so just as clearly ----
	await submit.scrollIntoViewIfNeeded();
	await submit.click();
	await page.waitForSelector('.re-secret', { timeout: 10000 });
	check(await page.locator('.re-form').count() === 0, 'apres publication le formulaire disparait');
	check(
		(await page.locator('.re-secret .re-ok--loud').innerText()).includes('en ligne'),
		'une confirmation explicite remplace le formulaire',
	);
	check(await onScreen('.re-secret'), 'la confirmation est amenee dans la fenetre');
	check(
		(await page.locator('.re-secretlink').inputValue()).includes('k='),
		'le lien d organisateur est rendu une fois',
	);
	check(await page.locator('.re-panel').count() === 1, 'la fiche de la partie creee est ouverte');

	// ---- 3. My own game: modify and cancel, never join ----
	check(await page.locator('.re-panel .re-ok').first().innerText() === 'Tu organises cette partie.', 'je suis reconnu organisateur');
	check(await page.locator('.re-join').count() === 0, "l organisateur ne se voit pas proposer de s'inscrire");
	await page.locator('.re-panel .re-btn', { hasText: 'Modifier la partie' }).click();
	await page.waitForSelector('.re-form');
	await page.locator('.re-form label').filter({ hasText: 'Format' }).locator('select').selectOption('triplette');
	await page.locator('.re-form button[type="submit"]').click();
	await page.waitForSelector('.re-panel .re-ok--loud', { timeout: 10000 });
	check(
		(await page.locator('.re-panel .re-ok--loud').innerText()).includes('Modifications enregistrées'),
		'une modification confirme, au lieu de revenir sans un mot',
	);
	check((await page.locator('.re-panel h2').innerText()).includes('Triplette'), 'et la fiche montre le nouveau format');

	// ---- 4. Cancelling ----
	page.on('dialog', (d) => d.accept());
	await page.locator('.re-panel .re-btn--danger').click();
	await page.waitForSelector('.re-banner--off', { timeout: 10000 });
	check(true, 'annuler affiche le bandeau rouge');
	await page.locator('.re-close').click();

	// ---- 5. Someone else's game: join, leave, and keep the terrain ----
	// The cancelled game is off the list, so the earliest item is Léa's.
	await page.locator('.re-item .re-card').first().click();
	await page.waitForSelector('.re-panel', { timeout: 10000 });
	check((await page.locator('.re-who').innerText()).includes('Léa'), "la fiche ouverte est bien celle d un autre");
	check(await page.locator('.re-join').count() === 1, "la partie d un autre propose de s'inscrire");
	check(await page.locator('.re-btn--danger').count() === 0, 'et ne propose pas de l annuler');
	await page.locator('.re-join label').filter({ hasText: 'Prénom' }).locator('input').fill('Raph');
	await page.locator('.re-join button[type="submit"]').click();
	await page.waitForSelector('.re-panel .re-ok--loud', { timeout: 10000 });
	check((await page.locator('.re-seats').innerText()).includes('2 / 4'), 'le compteur passe a 2 / 4');
	check(await onScreen('.re-panel .re-ok--loud'), "l inscription est confirmee a l ecran");
	await page.locator('.re-actions .re-btn', { hasText: 'désinscrire' }).click();
	await page.waitForSelector('.re-join', { timeout: 10000 });
	check((await page.locator('.re-seats').innerText()).includes('1 / 4'), 'la desinscription redescend a 1 / 4');

	await page.locator('.re-tools .re-btn', { hasText: 'Enregistrer ce lieu' }).click();
	check(await page.locator('.re-place').count() === 1, 'le terrain de la partie devient un lieu enregistre');
	check(
		await page.locator('.re-tools .re-btn', { hasText: 'Lieu enregistré' }).isDisabled(),
		'le bouton dit que c est fait au lieu de renommer le lieu en silence',
	);
	await page.locator('.re-close').click();

	// ---- 6. A full game offers nothing to press ----
	await page.locator('.re-card', { hasText: 'Triplette' }).first().click();
	await page.waitForSelector('.re-panel', { timeout: 10000 });
	check((await page.locator('.re-seats').innerText()).includes('complet'), 'la partie pleine se dit complete');
	check(await page.locator('.re-join button[type="submit"]').isDisabled(), 'et son bouton est inactif');
	await page.locator('.re-close').click();

	// ---- 7. A terrain with no game is no longer a dead dot ----
	// Its tooltip named it and that was all it did; 115 of them shipped that way.
	await page.locator('.re-map').scrollIntoViewIfNeeded();
	await page.locator('.re-pin--spot').first().click();
	await page.waitForSelector('.re-panel', { timeout: 10000 });
	check((await page.locator('.re-panel h2').innerText()).includes('Boulodrome'), 'cliquer un terrain ouvre sa fiche');
	await page.locator('.re-panel .re-btn', { hasText: 'Enregistrer ce lieu' }).click();
	check(await page.locator('.re-place').count() === 2, 'un terrain peut devenir un lieu enregistre');
	await page.locator('.re-pin--spot').first().click();
	await page.waitForSelector('.re-panel', { timeout: 10000 });
	await page.locator('.re-panel .re-btn', { hasText: 'Poser une partie ici' }).click();
	await page.waitForSelector('.re-form', { timeout: 10000 });
	check(await page.locator('.re-pinstate--set').count() === 1, 'poser une partie sur ce terrain part avec l epingle deja posee');
	check(await page.locator('.re-form button[type="submit"]').isEnabled(), 'donc le bouton publier est actif tout de suite');
} catch (e) {
	fail.push(`EXCEPTION ${e.message}`);
} finally {
	await browser.close();
	server.kill();
}

console.log(fail.length ? `\n${fail.length} echec(s):\n- ${fail.join('\n- ')}` : '\nTout est vert.');
process.exit(fail.length ? 1 : 0);
