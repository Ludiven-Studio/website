/* Guard for /petanque-meet. It hits the REAL backend — there is no local Supabase
   here — so three things keep it from silting up the live map:
     · fixed test player uuids, injected before the island boots;
     · a fixed off-map coordinate (Bay of Biscay) that also exercises, for free,
       the "Nominatim found nothing" fallback;
     · admin_purge_player in a finally.
   Acting (create, join, report) needs a Supabase Auth session, which a script
   cannot get through Google or Apple. So the write path only runs with a test
   account's access token AND the admin key; otherwise it is skipped, and every
   read check plus the "401 without a session" checks still run.

     $env:MEETUPS_ADMIN_KEY = '...'; $env:MEETUPS_TEST_JWT = '...'; node scripts/check-rencontres.mjs

   MEETUPS_TEST_JWT must belong to a THROWAWAY account: the cleanup purges every
   game it owns. MEETUPS_TEST_JWT_B (a second one) adds the join checks.

   The agreement block is the point of the whole file: the validation rules exist
   twice (src/lib/meetupRules.ts for the form, supabase/functions/meetups for the
   authority) because a Deno root cannot import from src/. Each case is refused by
   the shipped form AND by the deployed function, or they have drifted. Without a
   token the function answers 401 before validating, so only the form half runs. */
import { chromium } from 'playwright';
import { startServer } from './preview-server.mjs';
import { readFileSync } from 'node:fs';

const PORT = 4401;
const BASE = `http://localhost:${PORT}`;
const KEY = process.env.MEETUPS_ADMIN_KEY ?? '';
const JWT_A = process.env.MEETUPS_TEST_JWT ?? '';
const JWT_B = process.env.MEETUPS_TEST_JWT_B ?? '';
const PLAYER_A = '00000000-0000-4000-8000-00000000a001';
const PLAYER_B = '00000000-0000-4000-8000-00000000a002';
const OFF_MAP = { lat: 43.0, lng: -3.0 };
const AUTH_KEY = 'ludiven-meetup-auth'; // storageKey in src/lib/meetupAuth.ts

const claims = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString() || '{}');
const UID_A = JWT_A ? claims(JWT_A).sub : null;
const UID_B = JWT_B ? claims(JWT_B).sub : null;

const site = readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8');
const pick = (n) => site.match(new RegExp(`${n}\\s*=\\s*'([^']+)'`))?.[1];
const SUPABASE_URL = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };

const skip = (what, why) => console.log(`skip  ${what} (${why})`);

/** `jwt` = a signed-in call; without it, the anon key as the page sends it signed out. */
const fn = async (payload, jwt = null) => {
	const r = await fetch(`${SUPABASE_URL}/functions/v1/meetups`, {
		method: 'POST',
		headers: { apikey: ANON, Authorization: `Bearer ${jwt ?? ANON}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
	return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
};

const iso = (msAhead) => new Date(Date.now() + msAhead).toISOString();
const local = (msAhead) => {
	const d = new Date(Date.now() + msAhead);
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const server = await startServer(PORT);

const browser = await chromium.launch();
/** `jwt`: a stored session the island picks up as signed in. 'fake': the UI is
 *  signed in but every call goes out with the anon key, so the form opens and no
 *  write can land. */
const newPage = async (playerId, jwt = null) => {
	const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
	await ctx.addInitScript((id) => localStorage.setItem('ludiven-player-id', id), playerId);
	// The filters fold away by default; the checks below drive them.
	await ctx.addInitScript(() => localStorage.setItem('ludiven-meetup-filters-open', '1'));
	if (jwt) {
		const real = jwt !== 'fake';
		const c = real ? claims(jwt) : { sub: playerId, email: 'guard@example.invalid', exp: Math.floor(Date.now() / 1000) + 3600 };
		const session = {
			access_token: real ? jwt : 'guard-fake', refresh_token: 'guard', token_type: 'bearer',
			expires_in: c.exp - Math.floor(Date.now() / 1000), expires_at: c.exp,
			user: { id: c.sub, email: c.email ?? '', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
		};
		await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [AUTH_KEY, JSON.stringify(session)]);
		if (!real) {
			await ctx.route(`${SUPABASE_URL}/functions/v1/meetups`, (route) => route.continue({
				headers: { ...route.request().headers(), authorization: `Bearer ${ANON}` },
			}));
		}
	}
	const page = await ctx.newPage();
	page.on('pageerror', (e) => fail.push(`THROW ${e.message}`));
	return page;
};

const A = await newPage(PLAYER_A, JWT_A || 'fake');
let eventId = null;

try {
	// ---- 1. The page stands up ----
	await A.goto(`${BASE}/petanque-meet/`, { waitUntil: 'networkidle' });
	await A.waitForSelector('.re-map', { timeout: 15000 });
	const box = await A.locator('.re-map').boundingBox();
	check(box && box.height > 200, `la carte a une hauteur reelle (${Math.round(box?.height ?? 0)} px)`);
	await A.waitForSelector('.leaflet-tile-loaded', { timeout: 20000 }).catch(() => {});
	check(await A.locator('.leaflet-tile-loaded').count() > 0, 'des tuiles OSM sont chargees');
	check(await A.locator('.leaflet-control-attribution a[href*="openstreetmap"]').count() > 0, 'attribution OSM visible');
	check(await A.locator('.re-empty, .re-item').count() > 0, 'la liste a un etat (vide ou peuplee), pas un blanc');

	// ---- 2. Filters ----
	await A.locator('.re-segbtn', { hasText: 'Tout' }).click();
	check(await A.locator('.re-segbtn[aria-pressed="true"]').innerText() === 'Tout', 'le filtre date bascule');

	// ---- 2bis. Tiles must not evict the game art ----
	// Map tiles are <img>, so before the ludiven-tiles rule was placed AHEAD of the
	// image rule they landed in ludiven-images (150 entries) and three pans flushed
	// the key art of every game. The symptom would surface on pages that have no
	// map, which is why this is measured and not left to the eye.
	const cacheCounts = async () => A.evaluate(async () => {
		const out = {};
		for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
		return out;
	});
	await A.evaluate(() => navigator.serviceWorker?.ready);
	await A.reload({ waitUntil: 'networkidle' }); // a registered SW only controls the NEXT load
	const controlled = await A.evaluate(() => Boolean(navigator.serviceWorker?.controller));
	const before = await cacheCounts();
	const pan = await A.locator('.re-map').boundingBox();
	for (let i = 0; i < 3; i++) {
		await A.mouse.move(pan.x + pan.width * 0.7, pan.y + pan.height * 0.6);
		await A.mouse.down();
		await A.mouse.move(pan.x + pan.width * 0.25, pan.y + pan.height * 0.35, { steps: 12 });
		await A.mouse.up();
		await sleep(1200);
	}
	const after = await cacheCounts();
	check(controlled, 'le service worker controle la page');
	check((after['ludiven-tiles'] ?? 0) > 0, `les tuiles vont dans ludiven-tiles (${after['ludiven-tiles'] ?? 0} entrees)`);
	check(
		(after['ludiven-images'] ?? 0) === (before['ludiven-images'] ?? 0),
		`ludiven-images ne bouge pas (${before['ludiven-images'] ?? 0} -> ${after['ludiven-images'] ?? 0})`,
	);

	// ---- 2ter. Home ports, which live only in this browser ----
	// The first player to answer the map summers at a campsite and winters in Lyon.
	// Nothing here touches the backend, so the whole feature is one localStorage
	// round trip — and that round trip is the only thing that can break it, hence
	// the reload.
	const addPlaceNamed = async (label) => {
		await A.locator('.re-places .re-btn', { hasText: 'Enregistrer ce lieu' }).click();
		await A.locator('.re-naming input').fill(label);
		await A.locator('.re-naming button[type="submit"]').click();
	};
	await addPlaceNamed('Camping');
	// Drag first: two pins within 500 m are the same home port, so without this the
	// second save would rename the first and the count would stay at 1.
	const drag = await A.locator('.re-map').boundingBox();
	await A.mouse.move(drag.x + drag.width * 0.7, drag.y + drag.height * 0.6);
	await A.mouse.down();
	await A.mouse.move(drag.x + drag.width * 0.2, drag.y + drag.height * 0.3, { steps: 12 });
	await A.mouse.up();
	await addPlaceNamed('Lyon');
	check(await A.locator('.re-place').count() === 2, `deux lieux enregistres (${await A.locator('.re-place').count()})`);
	check((await A.locator('.re-places').innerText()).includes('Camping'), 'le nom donne est celui affiche');
	check(await A.locator('.re-pin--home').count() === 2, 'chaque lieu a sa pastille sur la carte');
	check(await A.locator('.re-places .re-check').count() === 1, 'le filtre "mes lieux" apparait avec les lieux');

	await A.reload({ waitUntil: 'networkidle' });
	await A.waitForSelector('.re-map', { timeout: 15000 });
	check(await A.locator('.re-place').count() === 2, 'les lieux survivent au rechargement');

	await A.locator('.re-place-off').first().click();
	await A.locator('.re-place-off').first().click();
	check(await A.locator('.re-places .re-check').count() === 0, 'sans lieu, le filtre disparait au lieu de vider la carte');
	check(await A.locator('.re-hint--places').count() === 1, "l'invitation a enregistrer un lieu revient");

	// ---- 2quater. "Plutôt une appli à télécharger" — it already is one ----
	await A.locator('.re-install').click();
	await A.waitForSelector('.re-sheet', { timeout: 5000 });
	check((await A.locator('.re-sheet').innerText()).length > 40, "la fiche d'installation dit quoi faire");
	await A.locator('.re-sheet .re-btn--ghost', { hasText: 'Fermer' }).click();
	check(await A.locator('.re-sheet').count() === 0, 'elle se referme');

	// ---- 2quinquies. Signed out: browsing is open, acting asks for a login ----
	const S = await newPage(PLAYER_B);
	await S.goto(`${BASE}/petanque-meet/`, { waitUntil: 'networkidle' });
	await S.waitForSelector('.re-map', { timeout: 15000 });
	check(await S.locator('.re-empty, .re-item').count() > 0, 'deconnecte: la liste se charge');
	await S.locator('.re-bar .re-btn', { hasText: 'Poser une partie' }).click();
	await S.waitForSelector('.re-login', { timeout: 5000 }).catch(() => {});
	check(await S.locator('.re-form').count() === 0, 'deconnecte: pas de formulaire de creation');
	// Browse-only site (WEB_LOGIN false): the sheet sends people to the app.
	check((await S.locator('.re-login').innerText().catch(() => '')).includes("dans l'appli"), 'deconnecte: la fiche renvoie vers l appli');
	check(await S.locator('.re-login .re-btn', { hasText: 'Continuer avec' }).count() === 0, 'aucune connexion proposee sur le site');
	await S.locator('.re-login .re-btn--ghost', { hasText: 'Fermer' }).click();
	check(await S.locator('.re-login').count() === 0, 'la fiche de connexion se referme');
	await S.context().close();

	// ---- 3. Zero anon grant: the tables have no reader but the function ----
	const direct = await fetch(`${SUPABASE_URL}/rest/v1/meetup_events?select=id&limit=1`, {
		headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
	});
	const directBody = await direct.text();
	check(!direct.ok && !directBody.trim().startsWith('['), `meetup_events refuse la lecture anon (${direct.status})`);
	const directSpots = await fetch(`${SUPABASE_URL}/rest/v1/meetup_spots?select=id&limit=1`, {
		headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
	});
	check(!directSpots.ok, `meetup_spots refuse la lecture anon (${directSpots.status})`);

	// ---- 4. Agreement: the form and the function refuse the same five drafts ----
	await A.locator('.re-bar .re-btn', { hasText: 'Poser une partie' }).click();
	await A.waitForSelector('.re-form');
	await A.locator('.re-map').scrollIntoViewIfNeeded();
	const mapBox = await A.locator('.re-map').boundingBox();
	await A.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
	check(await A.locator('.re-pinstate--set').count() > 0, 'un clic sur la carte pose l epingle');

	const field = (label) => A.locator('.re-form label').filter({ hasText: label });
	const setForm = async (v) => {
		await field('Quand').locator('input').fill(v.when);
		await field('Joueurs au total').locator('select').selectOption(String(v.players));
		await field('Ton prénom').locator('input').fill(v.name);
		await field('Tu viens à').locator('select').selectOption(String(v.seats));
	};
	const GOOD = { when: local(86400e3), players: 4, name: 'Guard', seats: 1 };
	const CASES = [
		['prenom trop court', { ...GOOD, name: 'A' }, 'Prénom'],
		['prenom qui est une pub', { ...GOOD, name: 'Lea www.spam.com' }, 'Prénom'],
		['prenom grossier', { ...GOOD, name: 'Connard' }, 'Prénom'],
		['prenom grossier deguise', { ...GOOD, name: 'c0nnard' }, 'Prénom'],
		['creneau dans le passe', { ...GOOD, when: local(-86400e3) }, 'futur'],
		['creneau a plus de 60 jours', { ...GOOD, when: local(70 * 86400e3) }, '60 jours'],
		['plus de places que le format', { ...GOOD, players: 2, seats: 4 }, 'places'],
	];

	for (const [label, draft, needle] of CASES) {
		await setForm(draft);
		await A.locator('.re-form button[type="submit"]').click();
		const shown = await A.locator('.re-form .re-error').innerText().catch(() => '');
		const clientRefuses = shown.includes(needle);

		if (!JWT_A) {
			check(clientRefuses, `${label}: refuse par le formulaire (client="${shown}")`);
			continue;
		}
		const startsAt = new Date(draft.when).toISOString();
		const srv = await fn({
			action: 'create_event', ...OFF_MAP,
			startsAt, endsAt: new Date(Date.parse(startsAt) + 3 * 3600e3).toISOString(),
			format: 'doublette', playersNeeded: draft.players, roleNeeded: 'any',
			organizerName: draft.name, organizerSeats: draft.seats,
		}, JWT_A);
		// 401 would be a dead token, not a refusal of the draft.
		check(clientRefuses && !srv.ok && srv.status !== 401, `${label}: refuse des deux cotes (client="${shown}" / serveur=${srv.status})`);
	}
	if (!JWT_A) skip('accord cote serveur', 'MEETUPS_TEST_JWT absent, le serveur repond 401 avant de valider');
	await A.locator('.re-formactions .re-btn--ghost', { hasText: 'Annuler' }).click();

	// ---- 4bis. Moderation, read-only: refusals that never reach a write ----
	// A random game id: the reason is checked first, then the game, and the insert
	// only comes after both, so none of these can leave a row behind.
	const NO_GAME = '00000000-0000-4000-8000-0000000000ff';
	if (JWT_A) {
		const badReason = await fn({ action: 'report', eventId: NO_GAME, reason: 'spam' }, JWT_A);
		check(badReason.status === 400 && /Motif/.test(badReason.body.error ?? ''), `report: motif inconnu refuse (${badReason.status} ${badReason.body.error})`);
		const goodReason = await fn({ action: 'report', eventId: NO_GAME, reason: 'fake' }, JWT_A);
		check(goodReason.status === 404, `report: un motif valide passe la validation, partie inconnue (${goodReason.status})`);
	} else {
		skip('report: validation du motif', 'MEETUPS_TEST_JWT absent');
	}

	// ---- 4ter. Acting without a session is refused before anything is read ----
	// Each is a 401 with the login message, whatever the body says: the legacy
	// playerId no longer stands for a person. Every body is also one an older
	// deployment would refuse (past slot, unknown game), so none can ever write.
	const anonCalls = [
		['create_event', { action: 'create_event', playerId: PLAYER_A, ...OFF_MAP, startsAt: iso(-86400e3), endsAt: iso(-86400e3 + 3 * 3600e3), format: 'doublette', playersNeeded: 4, roleNeeded: 'any', organizerName: 'Guard', organizerSeats: 1 }],
		['join', { action: 'join', eventId: NO_GAME, playerId: PLAYER_A, playerName: 'Guard', seats: 1, role: 'any' }],
		['report', { action: 'report', eventId: NO_GAME, playerId: PLAYER_A, reason: 'fake' }],
		['delete_account', { action: 'delete_account' }],
	];
	for (const [label, body] of anonCalls) {
		const r = await fn(body);
		check(r.status === 401 && /Connecte-toi/.test(r.body.error ?? ''), `${label} sans session: 401 (${r.status} ${r.body.error})`);
	}
	const modNoToken = await fn({ action: 'mod_get', eventId: NO_GAME, token: 'nope' });
	check(modNoToken.status === 403, `mod_get sans le bon jeton est refuse (${modNoToken.status})`);
	const modBlind = await fn({ action: 'moderate', eventId: NO_GAME, token: 'nope', do: 'remove' });
	check(modBlind.status === 403, `moderate sans le bon jeton est refuse (${modBlind.status})`);

	// ---- 4quater. Tournaments: same gates ----
	const listed = await fn({ action: 'list' });
	check(Array.isArray(listed.body.tournaments), 'list rend un tableau tournaments');
	check((listed.body.tournaments ?? []).every((t) => !('poster_path' in t) && !('organizer_id' in t)),
		'un tournoi liste ne montre ni chemin d affiche ni organizer_id');
	check((listed.body.tournaments ?? []).every((t) => t.poster_url === null || t.poster_status === 'approved'),
		'seule une affiche validee a une URL publique');
	for (const [label, body] of [
		['create_tournament', { action: 'create_tournament', ...OFF_MAP, startsAt: iso(-86400e3), clubName: 'Guard', title: 'Guard', format: 'doublette', category: 'open' }],
		['report_tournament', { action: 'report_tournament', tournamentId: NO_GAME, reason: 'fake' }],
		['upload_poster', { action: 'upload_poster', tournamentId: NO_GAME, image: 'AAAA' }],
	]) {
		const r = await fn(body);
		check(r.status === 401 && /Connecte-toi/.test(r.body.error ?? ''), `${label} sans session: 401 (${r.status} ${r.body.error})`);
	}
	// A shared ?t= link opens the tournament's panel, poster included when approved.
	const someT = (listed.body.tournaments ?? []).find((t) => t.poster_url) ?? (listed.body.tournaments ?? [])[0];
	if (someT) {
		const T = await newPage(PLAYER_A);
		await T.goto(`${BASE}/petanque-meet/?t=${someT.id}`);
		await T.waitForSelector('.re-tournament', { timeout: 10000 }).catch(() => {});
		check((await T.locator('.re-tournament h2').innerText().catch(() => '')).includes(someT.title), 'le lien ?t= ouvre la fiche du tournoi');
		if (someT.poster_url) {
			await T.waitForTimeout(1500);
			const w = await T.locator('.re-poster').evaluate((i) => i.naturalWidth).catch(() => 0);
			check(w > 0, `l'affiche validee s'affiche (CSP img-src) (${w} px)`);
		}
		await T.close();
	} else {
		skip('lien ?t=', 'aucun tournoi en ligne');
	}
	const tModBlind = await fn({ action: 'moderate_tournament', tournamentId: NO_GAME, token: 'nope', do: 'approve_poster' });
	check(tModBlind.status === 403, `moderate_tournament sans le bon jeton est refuse (${tModBlind.status})`);

	if (!KEY || !JWT_A) {
		skip('ecritures (sections 5 a 9)', !KEY ? 'MEETUPS_ADMIN_KEY absente' : 'MEETUPS_TEST_JWT absent, agir demande une session');
	} else {
		// ---- 5. The write path, against production, under a throwaway account ----
		const made = await fn({
			action: 'create_event', ...OFF_MAP,
			startsAt: iso(2 * 86400e3), endsAt: iso(2 * 86400e3 + 3 * 3600e3),
			format: 'doublette', playersNeeded: 4, roleNeeded: 'any',
			organizerName: 'Guard', organizerSeats: 1,
		}, JWT_A);
		check(made.ok && made.body.id && made.body.secret, 'create_event rend un id et un secret');
		eventId = made.body.id;
		const secret = made.body.secret;

		// The pin is 600 km offshore: Nominatim finds nothing, and the fallback
		// must still produce a usable card instead of an empty one. No ?k=: the
		// account alone must make A the organizer.
		await A.goto(`${BASE}/petanque-meet/?e=${eventId}`, { waitUntil: 'networkidle' });
		await A.waitForSelector('.re-panel', { timeout: 15000 });
		check((await A.locator('.re-where').innerText()).trim().length > 2, 'geocodage muet: la fiche a quand meme un lieu');
		check(await A.locator('.re-panel .re-btn--danger').count() > 0, 'le compte ouvre le mode organisateur, sans secret');
		check(Boolean(secret), 'le secret revient quand meme, pour les anciens clients');
		check((await A.locator('.re-seats').innerText()).includes('1 / 4'), 'le compteur part a 1 / 4');

		// ---- 6. .ics ----
		const dl = A.waitForEvent('download', { timeout: 10000 });
		await A.locator('.re-tools .re-btn', { hasText: 'agenda' }).click();
		const file = await dl;
		check(file.suggestedFilename() === 'petanque.ics', `le .ics se telecharge (${file.suggestedFilename()})`);

		// ---- 7. A second player joins, the counter follows ----
		const B = await newPage(PLAYER_B, JWT_B || null);
		await B.goto(`${BASE}/petanque-meet/?e=${eventId}`, { waitUntil: 'networkidle' });
		await B.waitForSelector('.re-panel', { timeout: 15000 });
		check(await B.locator('.re-panel .re-btn--danger').count() === 0, 'un autre joueur n a pas de bouton annuler');
		if (!JWT_B) {
			skip('inscription / desinscription', 'MEETUPS_TEST_JWT_B absent');
		} else {
			await B.locator('.re-join label').filter({ hasText: 'Prénom' }).locator('input').fill('Bob');
			await B.locator('.re-join button[type="submit"]').click();
			await B.waitForSelector('.re-ok', { timeout: 15000 });
			check((await B.locator('.re-seats').innerText()).includes('2 / 4'), 'l inscription fait monter le compteur a 2 / 4');
			check((await B.locator('.re-who').innerText()).includes('Bob'), 'le prenom apparait dans la liste');

			await B.locator('.re-actions .re-btn', { hasText: 'désinscrire' }).click();
			await B.waitForSelector('.re-join', { timeout: 15000 });
			check((await B.locator('.re-seats').innerText()).includes('1 / 4'), 'la desinscription redescend a 1 / 4');
		}

		// ---- 8. Cancelling is visible to whoever holds the link ----
		A.on('dialog', (d) => d.accept());
		await A.locator('.re-panel .re-btn--danger').click();
		await A.waitForSelector('.re-banner--off', { timeout: 15000 });
		check(true, 'l organisateur annule et la fiche le dit');
		await B.reload({ waitUntil: 'networkidle' });
		await B.waitForSelector('.re-panel', { timeout: 15000 });
		check(await B.locator('.re-banner--off').count() > 0, "l inscrit voit l'annulation en rouvrant le lien");

		// A cancelled game is off the map but still reachable by its link (§7).
		await B.goto(`${BASE}/petanque-meet/`, { waitUntil: 'networkidle' });
		await B.waitForSelector('.re-list', { timeout: 15000 });
		await B.locator('.re-segbtn', { hasText: 'Tout' }).click();
		check(!(await B.locator('.re-list').innerText()).includes('Guard'), 'une partie annulee sort de la carte');

		// ---- 8bis. Tournament and poster, end to end ----
		// The poster must stay private until approved: that is the whole promise.
		const tMade = await fn({
			action: 'create_tournament', ...OFF_MAP, startsAt: iso(10 * 86400e3),
			clubName: 'Guard Club', title: 'Guard Open', format: 'triplette', category: 'open',
			entryFeeCents: 500, contactPhone: '06 12 34 56 78',
		}, JWT_A);
		check(tMade.ok && tMade.body.id, `create_tournament rend un id (${tMade.status} ${tMade.body.error ?? ''})`);
		const tBad = await fn({
			action: 'create_tournament', ...OFF_MAP, startsAt: iso(10 * 86400e3),
			clubName: 'Guard', title: 'www.pub.fr', format: 'triplette', category: 'open',
		}, JWT_A);
		check(tBad.status === 400, `un titre avec un lien est refuse (${tBad.status} ${tBad.body.error})`);
		if (tMade.body.id) {
			const tid = tMade.body.id;
			const inList = () => fn({ action: 'list' }).then((r) => (r.body.tournaments ?? []).find((t) => t.id === tid));
			check(Boolean(await inList()), 'le tournoi est sur la carte tout de suite');
			// 1x1 white JPEG.
			const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
			const notImage = await fn({ action: 'upload_poster', tournamentId: tid, image: btoa('hello') }, JWT_A);
			check(notImage.status === 400, `upload_poster refuse ce qui n est pas une image (${notImage.status})`);
			const up = await fn({ action: 'upload_poster', tournamentId: tid, image: JPEG }, JWT_A);
			check(up.ok && up.body.posterStatus === 'pending', `upload_poster: affiche en attente (${up.status} ${up.body.error ?? ''})`);
			const pending = await inList();
			check(pending?.poster_status === 'pending' && pending?.poster_url === null, 'en attente: aucune URL publique');
			if (JWT_B) {
				const other = await fn({ action: 'upload_poster', tournamentId: tid, image: JPEG }, JWT_B);
				check(other.status === 403, `un autre compte ne change pas l affiche (${other.status})`);
				const rep = await fn({ action: 'report_tournament', tournamentId: tid, reason: 'poster' }, JWT_B);
				check(rep.ok, `report_tournament passe (${rep.status} ${rep.body.error ?? ''})`);
			}
			const { createHmac } = await import('node:crypto');
			const token = createHmac('sha256', KEY).update(`mod:t:${tid}`).digest('hex');
			const mod = await fn({ action: 'mod_get_tournament', tournamentId: tid, token });
			check(mod.ok && typeof mod.body.posterPreview === 'string', 'la moderation voit l affiche en attente');
			const ok = await fn({ action: 'moderate_tournament', tournamentId: tid, token, do: 'approve_poster' });
			check(ok.ok, `approve_poster passe (${ok.status} ${ok.body.error ?? ''})`);
			const approved = await inList();
			check(approved?.poster_status === 'approved' && /\/public\/posters\//.test(approved?.poster_url ?? ''),
				'validee: l affiche a une URL publique');
			if (approved?.poster_url) {
				const img = await fetch(approved.poster_url);
				check(img.ok && /image\/jpeg/.test(img.headers.get('content-type') ?? ''), `l URL publique sert l image (${img.status})`);
			}
			const del = await fn({ action: 'delete_tournament', tournamentId: tid }, JWT_A);
			check(del.ok, 'delete_tournament passe');
			check(!(await inList()), 'le tournoi supprime sort de la carte');
		}

		// ---- 9. The purge must give creating back ----
		// A create charges the account's active cap AND the IP counter. This guard
		// runs from a real machine, so a purge that forgets either leaves it refused
		// for the day — "refused, with an empty map", which reads as a server bug
		// rather than as leftovers. It happened.
		const quotaCreate = () => fn({
			action: 'create_event', ...OFF_MAP,
			startsAt: iso(3 * 86400e3), endsAt: iso(3 * 86400e3 + 3 * 3600e3),
			format: 'doublette', playersNeeded: 4, roleNeeded: 'any',
			organizerName: 'Guard', organizerSeats: 1,
		}, JWT_A);
		let refused = false;
		for (let i = 0; i < 8 && !refused; i++) refused = (await quotaCreate()).status === 429;
		check(refused, 'la creation finit par refuser (parties en ligne au plafond)');
		await fn({ action: 'admin_purge_player', adminKey: KEY, targetPlayerId: UID_A });
		check((await quotaCreate()).ok, 'apres le nettoyage, une creation repasse');
	}
} catch (e) {
	fail.push(`EXCEPTION ${e.message}`);
} finally {
	if (KEY && JWT_A) {
		for (const p of [UID_A, UID_B].filter(Boolean)) {
			const r = await fn({ action: 'admin_purge_player', adminKey: KEY, targetPlayerId: p });
			check(r.ok, `nettoyage de ${p}`);
		}
	}
	await browser.close();
	server.stop();
}

console.log(fail.length ? `\n${fail.length} echec(s):\n- ${fail.join('\n- ')}` : '\nTout est vert.');
process.exit(fail.length ? 1 : 0);
