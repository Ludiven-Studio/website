/* Guard for /rencontres. It hits the REAL backend — there is no local Supabase
   here — so three things keep it from silting up the live map:
     · fixed test player uuids, injected before the island boots;
     · a fixed off-map coordinate (Bay of Biscay) that also exercises, for free,
       the "Nominatim found nothing" fallback;
     · admin_purge_player in a finally.
   Without MEETUPS_ADMIN_KEY it writes NOTHING and still runs every read check.

     $env:MEETUPS_ADMIN_KEY = '...'; node scripts/check-rencontres.mjs

   The agreement block is the point of the whole file: the validation rules exist
   twice (src/lib/meetupRules.ts for the form, supabase/functions/meetups for the
   authority) because a Deno root cannot import from src/. Each case is refused by
   the shipped form AND by the deployed function, or they have drifted. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = 4401;
const BASE = `http://localhost:${PORT}`;
const KEY = process.env.MEETUPS_ADMIN_KEY ?? '';
const PLAYER_A = '00000000-0000-4000-8000-00000000a001';
const PLAYER_B = '00000000-0000-4000-8000-00000000a002';
const OFF_MAP = { lat: 43.0, lng: -3.0 };

const site = readFileSync(new URL('../src/data/site.ts', import.meta.url), 'utf8');
const pick = (n) => site.match(new RegExp(`${n}\\s*=\\s*'([^']+)'`))?.[1];
const SUPABASE_URL = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) fail.push(what); };

const fn = async (payload) => {
	const r = await fetch(`${SUPABASE_URL}/functions/v1/meetups`, {
		method: 'POST',
		headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
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

const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { cwd: resolve('.'), shell: true, stdio: 'ignore' });
for (let i = 0; i < 100; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* not up yet */ } await sleep(300); }

const browser = await chromium.launch();
const newPage = async (playerId) => {
	const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
	await ctx.addInitScript((id) => localStorage.setItem('ludiven-player-id', id), playerId);
	const page = await ctx.newPage();
	page.on('pageerror', (e) => fail.push(`THROW ${e.message}`));
	return page;
};

const A = await newPage(PLAYER_A);
let eventId = null;

try {
	// ---- 1. The page stands up ----
	await A.goto(`${BASE}/rencontres/`, { waitUntil: 'networkidle' });
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
		['creneau dans le passe', { ...GOOD, when: local(-86400e3) }, 'futur'],
		['creneau a plus de 60 jours', { ...GOOD, when: local(70 * 86400e3) }, '60 jours'],
		['plus de places que le format', { ...GOOD, players: 2, seats: 4 }, 'places'],
	];

	for (const [label, draft, needle] of CASES) {
		await setForm(draft);
		await A.locator('.re-form button[type="submit"]').click();
		const shown = await A.locator('.re-form .re-error').innerText().catch(() => '');
		const clientRefuses = shown.includes(needle);

		const startsAt = new Date(draft.when).toISOString();
		const srv = await fn({
			action: 'create_event', playerId: PLAYER_A, ...OFF_MAP,
			startsAt, endsAt: new Date(Date.parse(startsAt) + 3 * 3600e3).toISOString(),
			format: 'doublette', playersNeeded: draft.players, roleNeeded: 'any',
			organizerName: draft.name, organizerSeats: draft.seats,
		});
		check(clientRefuses && !srv.ok, `${label}: refuse des deux cotes (client="${shown}" / serveur=${srv.status})`);
	}
	await A.locator('.re-formactions .re-btn--ghost', { hasText: 'Annuler' }).click();

	if (!KEY) {
		console.log('\nMEETUPS_ADMIN_KEY absente : aucune ecriture, controles de lecture seuls.');
	} else {
		// ---- 5. The write path, against production, under a marker identity ----
		const made = await fn({
			action: 'create_event', playerId: PLAYER_A, ...OFF_MAP,
			startsAt: iso(2 * 86400e3), endsAt: iso(2 * 86400e3 + 3 * 3600e3),
			format: 'doublette', playersNeeded: 4, roleNeeded: 'any',
			organizerName: 'Guard', organizerSeats: 1,
		});
		check(made.ok && made.body.id && made.body.secret, 'create_event rend un id et un secret');
		eventId = made.body.id;
		const secret = made.body.secret;

		// The pin is 600 km offshore: Nominatim finds nothing, and the fallback
		// must still produce a usable card instead of an empty one.
		await A.goto(`${BASE}/rencontres/?e=${eventId}&k=${secret}`, { waitUntil: 'networkidle' });
		await A.waitForSelector('.re-panel', { timeout: 15000 });
		check((await A.locator('.re-where').innerText()).trim().length > 2, 'geocodage muet: la fiche a quand meme un lieu');
		check(await A.locator('.re-panel .re-btn--danger').count() > 0, 'le lien secret ouvre le mode organisateur');
		check((await A.locator('.re-seats').innerText()).includes('1 / 4'), 'le compteur part a 1 / 4');

		// ---- 6. .ics ----
		const dl = A.waitForEvent('download', { timeout: 10000 });
		await A.locator('.re-tools .re-btn', { hasText: 'agenda' }).click();
		const file = await dl;
		check(file.suggestedFilename() === 'petanque.ics', `le .ics se telecharge (${file.suggestedFilename()})`);

		// ---- 7. A second player joins, the counter follows ----
		const B = await newPage(PLAYER_B);
		await B.goto(`${BASE}/rencontres/?e=${eventId}`, { waitUntil: 'networkidle' });
		await B.waitForSelector('.re-panel', { timeout: 15000 });
		check(await B.locator('.re-panel .re-btn--danger').count() === 0, 'sans le secret, pas de bouton annuler');
		await B.locator('.re-join label').filter({ hasText: 'Prénom' }).locator('input').fill('Bob');
		await B.locator('.re-join button[type="submit"]').click();
		await B.waitForSelector('.re-ok', { timeout: 15000 });
		check((await B.locator('.re-seats').innerText()).includes('2 / 4'), 'l inscription fait monter le compteur a 2 / 4');
		check((await B.locator('.re-who').innerText()).includes('Bob'), 'le prenom apparait dans la liste');

		await B.locator('.re-actions .re-btn', { hasText: 'désinscrire' }).click();
		await B.waitForSelector('.re-join', { timeout: 15000 });
		check((await B.locator('.re-seats').innerText()).includes('1 / 4'), 'la desinscription redescend a 1 / 4');

		// ---- 8. Cancelling is visible to whoever holds the link ----
		A.on('dialog', (d) => d.accept());
		await A.locator('.re-panel .re-btn--danger').click();
		await A.waitForSelector('.re-banner--off', { timeout: 15000 });
		check(true, 'l organisateur annule et la fiche le dit');
		await B.reload({ waitUntil: 'networkidle' });
		await B.waitForSelector('.re-panel', { timeout: 15000 });
		check(await B.locator('.re-banner--off').count() > 0, "l inscrit voit l'annulation en rouvrant le lien");

		// A cancelled game is off the map but still reachable by its link (§7).
		await B.goto(`${BASE}/rencontres/`, { waitUntil: 'networkidle' });
		await B.waitForSelector('.re-list', { timeout: 15000 });
		await B.locator('.re-segbtn', { hasText: 'Tout' }).click();
		check(!(await B.locator('.re-list').innerText()).includes('Guard'), 'une partie annulee sort de la carte');
	}
} catch (e) {
	fail.push(`EXCEPTION ${e.message}`);
} finally {
	if (KEY) {
		for (const p of [PLAYER_A, PLAYER_B]) {
			const r = await fn({ action: 'admin_purge_player', adminKey: KEY, targetPlayerId: p });
			check(r.ok, `nettoyage de ${p}`);
		}
	}
	await browser.close();
	server.kill();
}

console.log(fail.length ? `\n${fail.length} echec(s):\n- ${fail.join('\n- ')}` : '\nTout est vert.');
process.exit(fail.length ? 1 : 0);
