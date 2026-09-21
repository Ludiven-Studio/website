// meetups — the ONLY access path to the meetup_* tables (service_role, bypasses
// RLS). Backs /rencontres: a public map of pétanque games, no accounts. Identity
// is the browser's playerId() uuid; an organizer proves ownership with the
// per-event `secret`, handed back exactly once at creation.
//
// Reads go through here too (unlike games/game_scores, which anon reads
// directly). Two reasons: the page needs a join + a seats aggregate + a
// different shape for the ?e= deep link, and `secret` lives in meetup_events —
// the only way it can never leak is for the table to have no reader at all.
// The invariant to keep: ZERO anon grants on any meetup_* object, and `secret`
// never named in EVENT_COLS.
//
// The validation rules are mirrored in src/lib/meetupRules.ts for the form. THIS
// copy is the authority — a Deno root cannot import from src/.
// scripts/check-rencontres.mjs runs an agreement block over both.
//
// Deploy:  supabase functions deploy meetups
// Secrets: MEETUPS_ADMIN_KEY (seed + guard cleanup), MEETUPS_IP_PEPPER (quota hashing)

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const bad = (reason: string, status = 400): Response => json({ error: reason }, status);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

// ---- rules (mirror of src/lib/meetupRules.ts) ----

const FORMATS = ['tete-a-tete', 'doublette', 'triplette', 'melee', 'mini-tournoi'];
const ROLES = ['any', 'tireur', 'pointeur'];
const PLAYERS_NEEDED = [2, 4, 6, 8, 12, 16];
const MAX_NAME = 24;
const MAX_SEATS = 4;
const MAX_DURATION_MS = 12 * 3600_000;
const MAX_AHEAD_MS = 60 * 86400_000;

/** null = unusable. A URL or a tag is not a first name, and this is the only
 *  free-text field in the product — so the only ad surface. */
function cleanName(raw: unknown): string | null {
	const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
	if (s.length < 2) return null;
	if (/[<>]/.test(s)) return null;
	if (/https?:\/\/|www\.|\.(com|fr|net|org|io)\b/i.test(s)) return null;
	return s;
}

const isFormat = (v: unknown): boolean => FORMATS.includes(String(v));
const isRole = (v: unknown): boolean => ROLES.includes(String(v));
const isPlayersNeeded = (v: unknown): boolean => typeof v === 'number' && PLAYERS_NEEDED.includes(v);
const isSeats = (v: unknown): boolean =>
	typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_SEATS;
const isPlausibleFr = (lat: number, lng: number): boolean =>
	Number.isFinite(lat) && Number.isFinite(lng) && lat >= 41 && lat <= 52 && lng >= -6 && lng <= 10;

/** null = valid slot. */
function validateSlot(startsAt: unknown, endsAt: unknown, now: number): string | null {
	const start = Date.parse(String(startsAt));
	const end = Date.parse(String(endsAt));
	if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Date invalide.';
	if (start <= now) return 'La partie doit être dans le futur.';
	if (start > now + MAX_AHEAD_MS) return "Pas plus de 60 jours à l'avance.";
	if (end <= start) return 'La fin doit être après le début.';
	if (end - start > MAX_DURATION_MS) return 'Une partie dure au plus 12 heures.';
	return null;
}

// ---- identity & quotas ----

/** Paris day — the same boundary as every other day-shaped value on the site
 *  (src/lib/day.ts). A UTC day would reset quotas at 2am local. */
const parisDay = (d: Date = new Date()): string =>
	new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
		.format(d);

const CREATE_CAP = 3;
const JOIN_CAP = 20;

const ADMIN_KEY = Deno.env.get('MEETUPS_ADMIN_KEY') ?? '';
const IP_PEPPER = Deno.env.get('MEETUPS_IP_PEPPER') ?? '';

function isAdmin(v: unknown): boolean {
	if (!ADMIN_KEY || typeof v !== 'string' || v.length !== ADMIN_KEY.length) return false;
	let diff = 0;
	for (let i = 0; i < v.length; i++) diff |= v.charCodeAt(i) ^ ADMIN_KEY.charCodeAt(i);
	return diff === 0; // compare every char so a wrong key can't be found byte by byte
}

/** Peppered SHA-256 of the caller's IP. The pepper is what makes this not
 *  personal data: the whole IPv4 space hashes in minutes, so a bare digest is
 *  reversible and would still be an identifier. No pepper set = no IP quota,
 *  rather than a false sense of one. */
async function ipKey(req: Request): Promise<string | null> {
	if (!IP_PEPPER) return null;
	const fwd = req.headers.get('x-forwarded-for') ?? '';
	const ip = (fwd.split(',')[0] || req.headers.get('cf-connecting-ip') || '').trim();
	if (!ip) return null;
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${IP_PEPPER}:${ip}`));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Count one action for the player AND for the IP. Both must stay under the cap:
 *  a shared café wifi is the case the player counter alone would miss, and a
 *  cleared localStorage is the case the IP counter alone would miss. */
async function overQuota(
	db: SupabaseClient, req: Request, playerId: string, kind: 'creates' | 'joins',
): Promise<boolean> {
	const day = parisDay();
	const cap = kind === 'creates' ? CREATE_CAP : JOIN_CAP;
	const args = kind === 'creates' ? { p_creates: 1, p_joins: 0 } : { p_creates: 0, p_joins: 1 };
	const subjects: [string, string][] = [['player', playerId]];
	const ip = await ipKey(req);
	if (ip) subjects.push(['ip', ip]);
	for (const [k, subject] of subjects) {
		const { data } = await db.rpc('meetup_bump_quota', { p_kind: k, p_subject: subject, p_day: day, ...args });
		if (typeof data === 'number' && data > cap) return true;
	}
	return false;
}

// ---- reads ----

// The single chokepoint for what a read may expose. `secret` is NOT here and
// must never be: add a column, and every action that returns an event exposes it.
const EVENT_COLS = 'id, spot_id, starts_at, ends_at, format, players_needed, role_needed, '
	+ 'organizer_name, organizer_seats, status, created_at';
const SPOT_COLS = 'id, lat, lng, label, commune, source, confirmed';

interface SpotRow { id: string; lat: number; lng: number; label: string; commune: string; source: string; confirmed: boolean; }

/** Flatten the embedded spot + sum the signups into `seats_taken`. The client
 *  never sees the nested shape. */
function shapeEvent(row: Record<string, unknown>): Record<string, unknown> {
	const spot = (row.meetup_spots ?? {}) as Partial<SpotRow>;
	const signups = (row.meetup_signups ?? []) as { seats: number }[];
	const taken = signups.reduce((a, s) => a + (s.seats ?? 0), 0);
	const { meetup_spots: _s, meetup_signups: _u, ...rest } = row;
	return {
		...rest,
		lat: spot.lat ?? 0,
		lng: spot.lng ?? 0,
		label: spot.label ?? '',
		commune: spot.commune ?? '',
		confirmed: spot.confirmed ?? false,
		seats_taken: (rest.organizer_seats as number ?? 0) + taken,
	};
}

const EMBED = `${EVENT_COLS}, meetup_spots!inner(${SPOT_COLS}), meetup_signups(seats)`;

// ---- reverse geocoding (Nominatim) ----

/** Take the 1 req/s slot, atomically. Returns false when another invocation
 *  holds it — we then skip geocoding entirely rather than sleep: a label is
 *  worth less than a fast POST, and the next event on this spot retries. */
async function takeGeocodeSlot(db: SupabaseClient): Promise<boolean> {
	const { data } = await db.from('meetup_geocode_throttle')
		.update({ last_at: new Date().toISOString() })
		.eq('id', true)
		.lt('last_at', new Date(Date.now() - 1100).toISOString())
		.select('id');
	return Boolean(data && data.length);
}

/** Never throws and never blocks the caller: a third party being down must not
 *  stop someone posting a game. */
async function reverseGeocode(lat: number, lng: number): Promise<{ label: string; commune: string } | null> {
	try {
		const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`;
		const res = await fetch(url, {
			headers: { 'User-Agent': 'LudivenStudio-Rencontres/1.0 (contact@ludiven-studio.fr)', 'Accept-Language': 'fr' },
			signal: AbortSignal.timeout(4000),
		});
		if (!res.ok) return null;
		const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
		const commune = a.village ?? a.town ?? a.city ?? a.municipality ?? a.county ?? '';
		const place = a.hamlet ?? a.road ?? a.suburb ?? a.neighbourhood ?? '';
		if (!commune && !place) return null;
		return { label: [commune, place].filter(Boolean).join(' — '), commune };
	} catch {
		return null;
	}
}

/** Resolve a pin to a spot, naming it if it is new and still nameless. */
async function resolveSpot(db: SupabaseClient, lat: number, lng: number, organizer: string): Promise<SpotRow> {
	const { data, error } = await db.rpc('meetup_upsert_spot', {
		p_lat: lat, p_lng: lng, p_organizer: organizer, p_source: 'user',
	});
	if (error) throw error;
	let spot = data as SpotRow;
	if (!spot.label && await takeGeocodeSlot(db)) {
		const named = await reverseGeocode(spot.lat, spot.lng);
		if (named) {
			const { data: up } = await db.from('meetup_spots')
				.update({ label: named.label, commune: named.commune }).eq('id', spot.id).select(SPOT_COLS).single();
			if (up) spot = up as SpotRow;
		}
	}
	return spot;
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
	if (req.method !== 'POST') return bad('method not allowed', 405);

	let body: Record<string, unknown>;
	try { body = await req.json(); } catch { return bad('invalid JSON body'); }

	const action = String(body.action ?? '');
	const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
	const nowIso = new Date().toISOString();
	const nowMs = Date.now();

	try {
		switch (action) {
			// Everything the page needs in one call: the open, not-yet-finished
			// events, plus the known spots so the create form can offer them.
			// Expiry is this filter, not a cron — a static site has no scheduler.
			case 'list': {
				const { data: events, error } = await db.from('meetup_events')
					.select(EMBED).eq('status', 'open').gte('ends_at', nowIso)
					.order('starts_at').limit(500);
				if (error) throw error;
				const { data: spots } = await db.from('meetup_spots').select(SPOT_COLS).limit(1000);
				return json({
					events: (events ?? []).map((r) => shapeEvent(r as Record<string, unknown>)),
					spots: spots ?? [],
				});
			}

			// The ?e= deep link. Unlike `list` this returns cancelled and finished
			// events: telling a signed-up player "annulé" is the ONLY way they can
			// ever find out — nothing notifies anyone.
			case 'get_event': {
				if (!isUuid(body.eventId)) return bad('bad eventId');
				const { data, error } = await db.from('meetup_events').select(EMBED).eq('id', body.eventId).maybeSingle();
				if (error) throw error;
				if (!data) return bad('unknown event', 404);
				const { data: signups } = await db.from('meetup_signups')
					.select('player_id, player_name, seats, role').eq('event_id', body.eventId).order('created_at');
				// Compare the secret in SQL so it never lands in a JS object that
				// could be serialised by accident.
				let isOrganizer = false;
				if (typeof body.secret === 'string' && body.secret) {
					const { data: own } = await db.from('meetup_events')
						.select('id').eq('id', body.eventId).eq('secret', body.secret).maybeSingle();
					isOrganizer = Boolean(own);
				}
				return json({ event: shapeEvent(data as Record<string, unknown>), signups: signups ?? [], isOrganizer });
			}

			case 'create_event': {
				if (!isUuid(body.playerId)) return bad('bad playerId');
				const slotError = validateSlot(body.startsAt, body.endsAt, nowMs);
				if (slotError) return bad(slotError);
				if (!isFormat(body.format)) return bad('Format inconnu.');
				if (!isPlayersNeeded(body.playersNeeded)) return bad('Nombre de joueurs invalide.');
				if (!isRole(body.roleNeeded)) return bad('Rôle inconnu.');
				if (!isSeats(body.organizerSeats)) return bad('Nombre de places invalide.');
				if ((body.organizerSeats as number) > (body.playersNeeded as number)) {
					return bad("Tu prends plus de places qu'il n'y en a.");
				}
				const name = cleanName(body.organizerName);
				if (!name) return bad('Prénom invalide (2 à 24 caractères, sans lien).');

				const lat = Number(body.lat), lng = Number(body.lng);
				const freePin = !isUuid(body.spotId);
				if (freePin && !isPlausibleFr(lat, lng)) return bad('Position hors zone.');

				// Charged once, after validation and before any write, so a typo
				// never costs a slot and a rejected flood still does.
				if (await overQuota(db, req, body.playerId, 'creates')) {
					return bad("Trop de parties créées aujourd'hui. Réessaie demain.", 429);
				}

				let spotId: string;
				if (freePin) {
					spotId = (await resolveSpot(db, lat, lng, body.playerId)).id;
				} else {
					const { data: known } = await db.from('meetup_spots').select('id').eq('id', body.spotId).maybeSingle();
					if (!known) return bad('unknown spot', 404);
					spotId = known.id as string;
				}

				const { data: created, error } = await db.from('meetup_events').insert({
					spot_id: spotId,
					starts_at: new Date(String(body.startsAt)).toISOString(),
					ends_at: new Date(String(body.endsAt)).toISOString(),
					format: body.format,
					players_needed: body.playersNeeded,
					role_needed: body.roleNeeded,
					organizer_id: body.playerId,
					organizer_name: name,
					organizer_seats: body.organizerSeats,
				}).select('id, secret').single();
				if (error) throw error;
				// The one and only time `secret` leaves the database.
				return json({ id: created.id, secret: created.secret });
			}

			case 'update_event': {
				if (!isUuid(body.eventId) || typeof body.secret !== 'string') return bad('bad request');
				const { data: own } = await db.from('meetup_events')
					.select('id, players_needed, organizer_seats')
					.eq('id', body.eventId).eq('secret', body.secret).maybeSingle();
				if (!own) return bad('forbidden', 403);

				const patch: Record<string, unknown> = { updated_at: nowIso };
				if ('startsAt' in body || 'endsAt' in body) {
					const slotError = validateSlot(body.startsAt, body.endsAt, nowMs);
					if (slotError) return bad(slotError);
					patch.starts_at = new Date(String(body.startsAt)).toISOString();
					patch.ends_at = new Date(String(body.endsAt)).toISOString();
				}
				if ('format' in body) { if (!isFormat(body.format)) return bad('Format inconnu.'); patch.format = body.format; }
				if ('roleNeeded' in body) { if (!isRole(body.roleNeeded)) return bad('Rôle inconnu.'); patch.role_needed = body.roleNeeded; }
				if ('playersNeeded' in body) {
					if (!isPlayersNeeded(body.playersNeeded)) return bad('Nombre de joueurs invalide.');
					// Shrinking below what is already taken would make the counter lie.
					const { data: signups } = await db.from('meetup_signups').select('seats').eq('event_id', body.eventId);
					const taken = (own.organizer_seats as number)
						+ (signups ?? []).reduce((a, s) => a + ((s as { seats: number }).seats ?? 0), 0);
					if ((body.playersNeeded as number) < taken) return bad(`Il y a déjà ${taken} joueurs inscrits.`);
					patch.players_needed = body.playersNeeded;
				}
				const { error } = await db.from('meetup_events').update(patch).eq('id', body.eventId);
				if (error) throw error;
				return json({ ok: true });
			}

			// Cancelled, never deleted: the link has to keep working or a signed-up
			// player just finds a 404 and turns up anyway.
			case 'cancel_event': {
				if (!isUuid(body.eventId) || typeof body.secret !== 'string') return bad('bad request');
				const { data: own } = await db.from('meetup_events')
					.select('id').eq('id', body.eventId).eq('secret', body.secret).maybeSingle();
				if (!own) return bad('forbidden', 403);
				await db.from('meetup_events').update({ status: 'cancelled', updated_at: nowIso }).eq('id', body.eventId);
				return json({ ok: true });
			}

			case 'join': {
				if (!isUuid(body.eventId) || !isUuid(body.playerId)) return bad('bad request');
				const name = cleanName(body.playerName);
				if (!name) return bad('Prénom invalide (2 à 24 caractères, sans lien).');
				if (!isSeats(body.seats)) return bad('Nombre de places invalide.');
				if (!isRole(body.role)) return bad('Rôle inconnu.');
				if (await overQuota(db, req, body.playerId, 'joins')) {
					return bad("Trop d'inscriptions aujourd'hui. Réessaie demain.", 429);
				}
				// Seat counting is a race; the lock lives in the SQL function.
				const { data, error } = await db.rpc('meetup_join', {
					p_event: body.eventId, p_player: body.playerId, p_name: name,
					p_seats: body.seats, p_role: body.role,
				});
				if (error) throw error;
				const outcome = String(data);
				if (outcome === 'full') return bad('Plus de place.', 409);
				if (outcome === 'cancelled') return bad('Cette partie est annulée.', 409);
				if (outcome === 'past') return bad('Cette partie est passée.', 409);
				if (outcome !== 'ok') return bad('unknown event', 404);
				return json({ ok: true });
			}

			case 'leave': {
				if (!isUuid(body.eventId) || !isUuid(body.playerId)) return bad('bad request');
				await db.from('meetup_signups').delete().eq('event_id', body.eventId).eq('player_id', body.playerId);
				return json({ ok: true });
			}

			// One-off OSM import (scripts/seed-meetup-spots.mjs). Admin-keyed so the
			// service_role key never has to sit on a laptop; routing it through the
			// same merge path also makes re-running it a no-op.
			case 'seed_spots': {
				if (!isAdmin(body.adminKey)) return bad('forbidden', 403);
				const rows = Array.isArray(body.spots) ? body.spots : [];
				if (rows.length > 200) return bad('batch too large');
				const countSpots = async (): Promise<number> =>
					(await db.from('meetup_spots').select('id', { count: 'exact', head: true })).count ?? 0;
				const before = await countSpots();
				for (const raw of rows as Record<string, unknown>[]) {
					const lat = Number(raw.lat), lng = Number(raw.lng);
					if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
					await db.rpc('meetup_upsert_spot', {
						p_lat: lat, p_lng: lng, p_organizer: null, p_source: 'osm',
						p_osm_id: raw.osmId ? String(raw.osmId) : null,
						p_label: String(raw.label ?? ''), p_commune: String(raw.commune ?? ''),
					});
				}
				// Counted, not inferred: the script's idempotence proof is "second
				// run creates 0", so a guessed number would prove nothing.
				return json({ ok: true, seen: rows.length, created: (await countSpots()) - before });
			}

			// Cleanup hatch for scripts/check-rencontres.mjs, which writes real rows
			// against production. Without it the guard would silt up the live map.
			case 'admin_purge_player': {
				if (!isAdmin(body.adminKey)) return bad('forbidden', 403);
				if (!isUuid(body.targetPlayerId)) return bad('bad targetPlayerId');
				await db.from('meetup_signups').delete().eq('player_id', body.targetPlayerId);
				// Signups cascade from the event; spots go last, once nothing points at them.
				await db.from('meetup_events').delete().eq('organizer_id', body.targetPlayerId);
				await db.from('meetup_spots').delete().eq('first_organizer', body.targetPlayerId).eq('source', 'user');
				await db.from('meetup_quota').delete().eq('subject', body.targetPlayerId);
				// Every create charged two counters, the player AND the IP. Clearing only the
				// player leaves the guard's runs banning its own machine for the rest of the
				// day, with an empty map as the only symptom. Same caller, same hash.
				const purgeIp = await ipKey(req);
				if (purgeIp) await db.from('meetup_quota').delete().eq('subject', purgeIp);
				return json({ ok: true });
			}

			default:
				return bad(`unknown action '${action}'`);
		}
	} catch (e) {
		return json({ error: 'server error', detail: String(e) }, 500);
	}
});
