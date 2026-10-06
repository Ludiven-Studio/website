// meetups — the ONLY access path to the meetup_* tables (service_role, bypasses
// RLS). Backs /rencontres and the PetanqueMeet app: a public map of pétanque
// games. Reading is open; acting (create, join, report) needs a Supabase Auth
// session (Google or Apple), sent as the Authorization bearer. The account id is
// the organizer_id / player_id. Games posted before accounts keep their per-event
// `secret` as proof of ownership until they expire.
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
// Secrets: MEETUPS_ADMIN_KEY (seed, guard cleanup, moderation links), MEETUPS_IP_PEPPER
//          (quota and ban hashing), RESEND_API_KEY + MEETUPS_MOD_EMAIL (report mails;
//          sender MEETUPS_FROM_EMAIL, else COURSES_FROM_EMAIL)

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.0';
import { ipKey, ipQuotaEnabled } from '../_shared/ipKey.ts';

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
	if (isOffensive(s)) return null;
	return s;
}

// Short words match whole words only ("con" must not refuse "Constance"); stems
// long enough to be unambiguous match anywhere. Not a wall: reports are.
const BAD_WORDS = ['con', 'cons', 'conne', 'pd', 'pede', 'tg', 'ntm', 'fdp', 'pute', 'putes', 'bite', 'zob',
	'nazi', 'nazis', 'negre', 'bougnoule', 'youpin', 'gouine', 'tapette', 'merde', 'cul', 'teub'];
const BAD_STEMS = ['connard', 'connass', 'encul', 'salope', 'salaud', 'enfoire', 'batard', 'niquer', 'niquetamere',
	'hitler', 'pedophil', 'couille', 'branleur', 'putain', 'trouduc', 'fuck', 'bitch', 'nigger', 'nigga',
	'asshole', 'cunt', 'whore'];

function isOffensive(name: string): boolean {
	const flat = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
		.replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's');
	const words = flat.split(/[^a-z]+/).filter(Boolean);
	if (words.some((w) => BAD_WORDS.includes(w))) return true;
	const joined = words.join('');
	return BAD_STEMS.some((b) => joined.includes(b));
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

/** Open, not-yet-finished games one organizer may have on the map at once.
 *  A standing limit, not a daily one: posting and deleting three used to lock
 *  the day out with nothing to show for it. Deleting frees a slot at once. */
const MAX_ACTIVE_EVENTS = 3;
/** Daily creates per IP. Only a flood guard now, so it sits well above what one
 *  person does: three active games each for a household on one connection. */
const CREATE_IP_CAP = 12;
const JOIN_CAP = 20;

const ADMIN_KEY = Deno.env.get('MEETUPS_ADMIN_KEY') ?? '';

// ---- moderation ----

const REASONS = ['name', 'fake', 'no_show', 'other'];
const REASON_LABEL: Record<string, string> = {
	name: 'Prénom choquant', fake: 'Fausse partie', no_show: "Personne n'est venu", other: 'Autre',
};
/** Distinct reporters that hide a game until a human looks. Two distinct IPs
 *  among them, so one person with three phones on one box cannot do it alone. */
const HIDE_REPORTERS = 3;
/** Games a player was reported absent from before the moderator hears of it.
 *  Never an automatic ban: a flat tyre is not abuse. */
const NO_SHOW_ALERT = 3;
const HIDE_IPS = 2;
const REPORT_IP_CAP = 10;           // reports per IP per 24 h
/** An IP ban only stops a never-seen player from creating, and only this long:
 *  a carrier IP (CGNAT) is shared by thousands of people. */
const IP_BAN_MS = 48 * 3600_000;
const MOD_URL = 'https://www.ludiven-studio.fr/rencontres/moderation/';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const MOD_EMAIL = Deno.env.get('MEETUPS_MOD_EMAIL') ?? '';
const FROM_EMAIL = Deno.env.get('MEETUPS_FROM_EMAIL') ?? Deno.env.get('COURSES_FROM_EMAIL') ?? '';
const BANNED = 'Ton accès aux parties est suspendu.';

/** The moderation link's key for one game: HMAC of the event id, so a link
 *  forwarded by mistake opens that game only, and never reveals the admin key. */
async function modToken(eventId: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(ADMIN_KEY),
		{ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`mod:${eventId}`));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function isModToken(eventId: string, token: unknown): Promise<boolean> {
	if (!ADMIN_KEY || typeof token !== 'string') return false;
	const want = await modToken(eventId);
	if (token.length !== want.length) return false;
	let diff = 0;
	for (let i = 0; i < want.length; i++) diff |= token.charCodeAt(i) ^ want.charCodeAt(i);
	return diff === 0;
}

/** A banned player is refused everywhere. A banned IP only refuses a create from
 *  a player never seen before — the reinstall-and-come-back case. */
async function isBanned(db: SupabaseClient, playerId: string, ip: string | null, creating: boolean): Promise<boolean> {
	const { data: player } = await db.from('meetup_bans').select('subject').eq('subject', playerId).maybeSingle();
	if (player) return true;
	if (!creating || !ip) return false;
	const { data: ipBan } = await db.from('meetup_bans').select('subject')
		.eq('subject', ip).gt('expires_at', new Date().toISOString()).maybeSingle();
	if (!ipBan) return false;
	const { count: organized } = await db.from('meetup_events')
		.select('id', { count: 'exact', head: true }).eq('organizer_id', playerId);
	const { count: joined } = await db.from('meetup_signups')
		.select('id', { count: 'exact', head: true }).eq('player_id', playerId);
	return (organized ?? 0) + (joined ?? 0) === 0;
}

const LOGIN = 'Connecte-toi pour continuer.';

/** The signed-in account, or null. The anon key is a JWT too, with no user in it. */
async function authUid(db: SupabaseClient, req: Request): Promise<string | null> {
	const h = req.headers.get('Authorization') ?? '';
	const jwt = h.startsWith('Bearer ') ? h.slice(7) : '';
	if (!jwt) return null;
	const { data } = await db.auth.getUser(jwt);
	return data.user?.id ?? null;
}

/** Owner = the account that posted it, or the secret for a game posted before
 *  accounts. Secrets are uuids by construction, which also makes them safe in `or`. */
async function ownsEvent(db: SupabaseClient, eventId: string, secret: unknown, uid: string | null): Promise<boolean> {
	const ors: string[] = [];
	if (uid) ors.push(`organizer_id.eq.${uid}`);
	if (isUuid(secret)) ors.push(`secret.eq.${secret}`);
	if (!ors.length) return false;
	const { data } = await db.from('meetup_events').select('id').eq('id', eventId).or(ors.join(',')).maybeSingle();
	return Boolean(data);
}

async function ban(db: SupabaseClient, playerId: string, ip: string | null, eventId: string): Promise<void> {
	const rows: Record<string, unknown>[] = [{ subject: playerId, kind: 'player', event_id: eventId, expires_at: null }];
	if (ip) rows.push({ subject: ip, kind: 'ip', event_id: eventId, expires_at: new Date(Date.now() + IP_BAN_MS).toISOString() });
	await db.from('meetup_bans').upsert(rows, { onConflict: 'subject' });
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Never throws: a mail that fails must not lose the report, which is already saved. */
async function mailReport(eventId: string, ev: Record<string, unknown>, reason: string, count: number, hidden: boolean): Promise<void> {
	if (!RESEND_API_KEY || !MOD_EMAIL || !FROM_EMAIL || !ADMIN_KEY) return;
	try {
		const link = `${MOD_URL}?e=${eventId}&k=${await modToken(eventId)}`;
		const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">
<p><b>${esc(REASON_LABEL[reason] ?? reason)}</b> — ${count} signalement(s)${hidden ? ', <b>partie masquée</b>' : ''}.</p>
<p>${esc(String(ev.organizer_name ?? ''))} · ${esc(String(ev.label ?? ''))} · ${esc(String(ev.starts_at ?? ''))}</p>
<p><a href="${link}">Ouvrir la modération</a></p></div>`;
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ from: FROM_EMAIL, to: MOD_EMAIL, subject: `Rencontres : signalement (${REASON_LABEL[reason] ?? reason})`, html }),
		});
		if (!res.ok) console.error(`resend ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 300));
	} catch (e) {
		console.error(e);
	}
}

function isAdmin(v: unknown): boolean {
	if (!ADMIN_KEY || typeof v !== 'string' || v.length !== ADMIN_KEY.length) return false;
	let diff = 0;
	for (let i = 0; i < v.length; i++) diff |= v.charCodeAt(i) ^ ADMIN_KEY.charCodeAt(i);
	return diff === 0; // compare every char so a wrong key can't be found byte by byte
}

/** Count one action for the player AND for the IP. Both must stay under the cap:
 *  a shared café wifi is the case the player counter alone would miss, and a
 *  cleared localStorage is the case the IP counter alone would miss.
 *  Creates skip the player counter — MAX_ACTIVE_EVENTS is their real limit, and
 *  a second daily one on top would just be the old lockout under another name. */
async function overQuota(
	db: SupabaseClient, req: Request, playerId: string, kind: 'creates' | 'joins',
): Promise<boolean> {
	const day = parisDay();
	const creates = kind === 'creates';
	const cap = creates ? CREATE_IP_CAP : JOIN_CAP;
	const args = creates ? { p_creates: 1, p_joins: 0 } : { p_creates: 0, p_joins: 1 };
	const subjects: [string, string][] = creates ? [] : [['player', playerId]];
	const ip = await ipKey(req);
	if (ip) subjects.push(['ip', ip]);
	for (const [k, subject] of subjects) {
		const { data } = await db.rpc('meetup_bump_quota', { p_kind: k, p_subject: subject, p_day: day, ...args });
		if (typeof data === 'number' && data > cap) return true;
	}
	return false;
}

/** Games this organizer still has running. `status` alone is not enough: a game
 *  that has finished is over whether or not anyone cancelled it. */
async function activeEvents(db: SupabaseClient, ids: string[], nowIso: string): Promise<number> {
	if (!ids.length) return 0;
	const { count } = await db.from('meetup_events')
		.select('id', { count: 'exact', head: true })
		.in('organizer_id', ids).eq('status', 'open').gte('ends_at', nowIso);
	return count ?? 0;
}

/** The account, plus the device uuid it used before accounts: games and signups
 *  made then still belong to the same person. */
const identities = (uid: string | null, legacy: unknown): string[] =>
	[...new Set([uid, isUuid(legacy) ? legacy : null].filter((x): x is string => Boolean(x)))];

// ---- reads ----

// The single chokepoint for what a read may expose. `secret` is NOT here and
// must never be: add a column, and every action that returns an event exposes it.
const EVENT_COLS = 'id, spot_id, starts_at, ends_at, format, players_needed, role_needed, '
	+ 'organizer_name, organizer_seats, organizer_tag, status, hidden, created_at';
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
	// Lazy: `list` is the hot path and never needs to know who is asking.
	let uidOnce: Promise<string | null> | undefined;
	const whoAmI = (): Promise<string | null> => (uidOnce ??= authUid(db, req));

	try {
		switch (action) {
			// Everything the page needs in one call: the open, not-yet-finished
			// events, plus the known spots so the create form can offer them.
			// Expiry is this filter, not a cron — a static site has no scheduler.
			case 'list': {
				const { data: events, error } = await db.from('meetup_events')
					.select(EMBED).eq('status', 'open').eq('hidden', false).gte('ends_at', nowIso)
					.order('starts_at').limit(500);
				if (error) throw error;
				// Confirmed spots (the OSM seed, or pinned by two organizers) first, so a flood of
				// fresh user pins falls off the end instead of hiding real terrains.
				const { data: spots } = await db.from('meetup_spots').select(SPOT_COLS)
					.order('confirmed', { ascending: false }).order('created_at').limit(1000);
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
					.select('id, player_id, player_name, seats, role').eq('event_id', body.eventId).order('created_at');
				// Compare the secret in SQL so it never lands in a JS object that
				// could be serialised by accident.
				const uid = await whoAmI();
				const isOrganizer = await ownsEvent(db, body.eventId, body.secret, uid);
				// player_id is the only proof of identity for join/leave: never hand it out.
				// playerId: a signup made before accounts.
				const me = identities(uid, body.playerId);
				// `id` is the signup row, not the player: it only lets the organizer
				// point at one line in report_signup.
				const shaped = (signups ?? []).map((s) => ({
					id: s.id, player_name: s.player_name, seats: s.seats, role: s.role, is_me: me.includes(s.player_id),
				}));
				return json({ event: shapeEvent(data as Record<string, unknown>), signups: shaped, isOrganizer });
			}

			// « Mes parties ». Ownership is the secret, as everywhere else — organizer_id
			// would list someone else's games to anyone who copied their playerId.
			// Cancelled and finished games are returned too: a list that hides them
			// cannot explain why a slot is free, or let you reopen the link you shared.
			case 'my_events': {
				const items = Array.isArray(body.items) ? body.items : [];
				const pairs = (items as Record<string, unknown>[])
					// Secrets are uuid-shaped by construction, and checking that is also what
					// makes them safe to splice into the filter below.
					.filter((p) => isUuid(p?.eventId) && isUuid(p?.secret))
					.slice(0, 40);
				let events: Record<string, unknown>[] = [];
				if (pairs.length) {
					const filter = pairs.map((p) => `and(id.eq.${p.eventId},secret.eq.${p.secret})`).join(',');
					const { data, error } = await db.from('meetup_events').select(EMBED).or(filter).order('starts_at');
					if (error) throw error;
					events = (data ?? []).map((r) => shapeEvent(r as Record<string, unknown>));
				}
				// Plus every game of the account, on any device. Merged by id.
				const uid = await whoAmI();
				if (uid) {
					const { data, error } = await db.from('meetup_events').select(EMBED)
						.eq('organizer_id', uid).order('starts_at').limit(100);
					if (error) throw error;
					const seen = new Set(events.map((e) => e.id));
					for (const r of data ?? []) {
						const e = shapeEvent(r as Record<string, unknown>);
						if (!seen.has(e.id)) events.push(e);
					}
					events.sort((x, y) => String(x.starts_at).localeCompare(String(y.starts_at)));
				}
				// Counted by organizer, not off the list above: those two differ once a
				// secret is lost, and the number that decides the cap is this one.
				const active = await activeEvents(db, identities(uid, body.playerId), nowIso);
				return json({ events, active, max: MAX_ACTIVE_EVENTS });
			}

			case 'create_event': {
				const playerId = await whoAmI();
				if (!playerId) return bad(LOGIN, 401);
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

				const createIp = await ipKey(req);
				if (await isBanned(db, playerId, createIp, true)) return bad(BANNED, 403);

				if (await activeEvents(db, identities(playerId, body.playerId), nowIso) >= MAX_ACTIVE_EVENTS) {
					return bad(`Tu as déjà ${MAX_ACTIVE_EVENTS} parties en ligne. Supprimes-en une dans « Mes parties ».`, 429);
				}
				// Charged once, after validation and before any write, so a typo
				// never costs a slot and a rejected flood still does.
				if (await overQuota(db, req, playerId, 'creates')) {
					return bad("Trop de parties créées aujourd'hui. Réessaie demain.", 429);
				}

				let spotId: string;
				if (freePin) {
					spotId = (await resolveSpot(db, lat, lng, playerId)).id;
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
					organizer_id: playerId,
					organizer_name: name,
					organizer_seats: body.organizerSeats,
					organizer_ip: createIp,
				}).select('id, secret').single();
				if (error) throw error;
				// The one and only time `secret` leaves the database.
				return json({ id: created.id, secret: created.secret });
			}

			case 'update_event': {
				if (!isUuid(body.eventId)) return bad('bad request');
				if (!await ownsEvent(db, body.eventId, body.secret, await whoAmI())) return bad('forbidden', 403);
				const { data: own } = await db.from('meetup_events')
					.select('id, players_needed, organizer_seats')
					.eq('id', body.eventId).maybeSingle();
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

			// The other half of cancel: with nobody signed up there is no link anyone
			// holds and no one to tell, so the row goes for good rather than sitting in
			// the organizer's list forever. The signup check is the whole gate, and it
			// is made here and not in the client — the client can be lied to.
			case 'delete_event': {
				if (!isUuid(body.eventId)) return bad('bad request');
				if (!await ownsEvent(db, body.eventId, body.secret, await whoAmI())) return bad('forbidden', 403);
				const { data: own } = await db.from('meetup_events')
					.select('id').eq('id', body.eventId).maybeSingle();
				if (!own) return bad('forbidden', 403);
				const { count } = await db.from('meetup_signups')
					.select('id', { count: 'exact', head: true }).eq('event_id', body.eventId);
				if ((count ?? 0) > 0) return bad('Des joueurs sont inscrits : annule la partie plutôt que de la supprimer.', 409);
				const { error } = await db.from('meetup_events').delete().eq('id', body.eventId);
				if (error) throw error;
				return json({ ok: true });
			}

			// Cancelled, never deleted: the link has to keep working or a signed-up
			// player just finds a 404 and turns up anyway.
			case 'cancel_event': {
				if (!isUuid(body.eventId)) return bad('bad request');
				if (!await ownsEvent(db, body.eventId, body.secret, await whoAmI())) return bad('forbidden', 403);
				const { data: own } = await db.from('meetup_events')
					.select('id').eq('id', body.eventId).maybeSingle();
				if (!own) return bad('forbidden', 403);
				await db.from('meetup_events').update({ status: 'cancelled', updated_at: nowIso }).eq('id', body.eventId);
				return json({ ok: true });
			}

			case 'join': {
				if (!isUuid(body.eventId)) return bad('bad request');
				const playerId = await whoAmI();
				if (!playerId) return bad(LOGIN, 401);
				const name = cleanName(body.playerName);
				if (!name) return bad('Prénom invalide (2 à 24 caractères, sans lien).');
				if (!isSeats(body.seats)) return bad('Nombre de places invalide.');
				if (!isRole(body.role)) return bad('Rôle inconnu.');
				if (await isBanned(db, playerId, null, false)) return bad(BANNED, 403);
				if (await overQuota(db, req, playerId, 'joins')) {
					return bad("Trop d'inscriptions aujourd'hui. Réessaie demain.", 429);
				}
				// Seat counting is a race; the lock lives in the SQL function.
				const { data, error } = await db.rpc('meetup_join', {
					p_event: body.eventId, p_player: playerId, p_name: name,
					p_seats: body.seats, p_role: body.role,
				});
				if (error) throw error;
				const outcome = String(data);
				if (outcome === 'full') return bad('Plus de place.', 409);
				if (outcome === 'cancelled') return bad('Cette partie est annulée.', 409);
				if (outcome === 'past') return bad('Cette partie est passée.', 409);
				if (outcome === 'hidden') return bad('Cette partie est en cours de vérification.', 409);
				if (outcome !== 'ok') return bad('unknown event', 404);
				// Kept for a ban later; meetup_join stays unchanged in its signature.
				const joinIp = await ipKey(req);
				if (joinIp) {
					await db.from('meetup_signups').update({ ip: joinIp })
						.eq('event_id', body.eventId).eq('player_id', playerId);
				}
				return json({ ok: true });
			}

			// Anyone can report a game once. "Personne n'est venu" is the strong
			// signal, so it is only taken from a signed-up player, once the game started.
			case 'report': {
				if (!isUuid(body.eventId)) return bad('bad request');
				const playerId = await whoAmI();
				if (!playerId) return bad(LOGIN, 401);
				const reason = String(body.reason ?? '');
				if (!REASONS.includes(reason)) return bad('Motif inconnu.');
				const { data: ev } = await db.from('meetup_events').select(EMBED).eq('id', body.eventId).maybeSingle();
				if (!ev) return bad('unknown event', 404);
				if (reason === 'no_show') {
					const { data: mine } = await db.from('meetup_signups').select('id')
						.eq('event_id', body.eventId).eq('player_id', playerId).maybeSingle();
					if (!mine) return bad('Seuls les inscrits peuvent dire que personne n\u2019est venu.', 403);
					if (Date.parse(String((ev as Record<string, unknown>).starts_at)) > nowMs) {
						return bad('La partie n\u2019a pas encore commencé.', 409);
					}
				}
				const ip = await ipKey(req);
				if (ip) {
					const { count } = await db.from('meetup_reports').select('id', { count: 'exact', head: true })
						.eq('reporter_ip', ip).gte('created_at', new Date(nowMs - 86400_000).toISOString());
					if ((count ?? 0) >= REPORT_IP_CAP) return bad('Trop de signalements aujourd\u2019hui. Réessaie demain.', 429);
				}
				const { error } = await db.from('meetup_reports').insert(
					{ event_id: body.eventId, reporter_id: playerId, reporter_ip: ip, reason });
				// 23505: already reported by this player. Fine, nothing to add.
				if (error && error.code !== '23505') throw error;
				if (error) return json({ ok: true });

				const { data: reports } = await db.from('meetup_reports')
					.select('reporter_id, reporter_ip').eq('event_id', body.eventId).is('target_player', null);
				const all = reports ?? [];
				const ips = new Set(all.map((r) => r.reporter_ip).filter(Boolean));
				const shaped = shapeEvent(ev as Record<string, unknown>);
				let hidden = Boolean(shaped.hidden);
				// No pepper means no IP at all: fall back to reporters alone.
				const enoughIps = ipQuotaEnabled() ? ips.size >= HIDE_IPS : true;
				if (!hidden && all.length >= HIDE_REPORTERS && enoughIps) {
					await db.from('meetup_events').update({ hidden: true, updated_at: nowIso }).eq('id', body.eventId);
					hidden = true;
				}
				await mailReport(body.eventId, shaped, reason, all.length, hidden);
				return json({ ok: true });
			}

			// The organizer's side of "personne n'est venu": a signed-up player who
			// never turned up. Proved by the secret, like every organizer action.
			case 'report_signup': {
				if (!isUuid(body.eventId) || !isUuid(body.signupId)) return bad('bad request');
				if (!await ownsEvent(db, body.eventId, body.secret, await whoAmI())) return bad('forbidden', 403);
				const { data: own } = await db.from('meetup_events').select(EMBED)
					.eq('id', body.eventId).maybeSingle();
				if (!own) return bad('forbidden', 403);
				const ev = own as Record<string, unknown>;
				if (Date.parse(String(ev.starts_at)) > nowMs) return bad('La partie n\u2019a pas encore commencé.', 409);
				const { data: su } = await db.from('meetup_signups').select('player_id')
					.eq('id', body.signupId).eq('event_id', body.eventId).maybeSingle();
				if (!su) return bad('unknown signup', 404);
				const { data: org } = await db.from('meetup_events').select('organizer_id').eq('id', body.eventId).single();
				const { error } = await db.from('meetup_reports').insert({
					event_id: body.eventId, reporter_id: org!.organizer_id, reporter_ip: await ipKey(req),
					reason: 'no_show', target_player: su.player_id,
				});
				if (error && error.code !== '23505') throw error;
				if (error) return json({ ok: true });
				// Distinct games, so one angry organizer cannot reach the bar alone.
				const { data: strikes } = await db.from('meetup_reports').select('event_id')
					.eq('target_player', su.player_id).eq('reason', 'no_show');
				const games = new Set((strikes ?? []).map((r) => r.event_id)).size;
				if (games >= NO_SHOW_ALERT) await mailReport(body.eventId, shapeEvent(ev), 'no_show', games, false);
				return json({ ok: true });
			}

			// Apple requires it in the app. Open games are cancelled, not deleted, so
			// signed-up players still learn they are off. A ban outlives the account:
			// meetup_bans keeps only the id, which is no personal data on its own.
			case 'delete_account': {
				const uid = await whoAmI();
				if (!uid) return bad(LOGIN, 401);
				await db.from('meetup_events').update({ status: 'cancelled', hidden: true, updated_at: nowIso })
					.eq('organizer_id', uid).eq('status', 'open');
				await db.from('meetup_events').update({ organizer_name: 'Compte supprimé' }).eq('organizer_id', uid);
				await db.from('meetup_signups').delete().eq('player_id', uid);
				await db.from('meetup_reports').delete().eq('reporter_id', uid);
				const { error } = await db.auth.admin.deleteUser(uid);
				if (error) throw error;
				return json({ ok: true });
			}

			// The page behind the report mail's link. The token is per game.
			case 'mod_get': {
				if (!isUuid(body.eventId) || !await isModToken(body.eventId, body.token)) return bad('forbidden', 403);
				const { data: ev } = await db.from('meetup_events').select(EMBED).eq('id', body.eventId).maybeSingle();
				if (!ev) return bad('unknown event', 404);
				const { data: rows } = await db.from('meetup_signups')
					.select('id, player_id, player_name, seats').eq('event_id', body.eventId).order('created_at');
				const ids = (rows ?? []).map((r) => r.player_id as string);
				const { data: strikes } = ids.length
					? await db.from('meetup_reports').select('target_player, event_id').in('target_player', ids).eq('reason', 'no_show')
					: { data: [] };
				// player_id stays here: the page only needs a count per line.
				const signups = (rows ?? []).map((r) => ({
					id: r.id, player_name: r.player_name, seats: r.seats,
					no_shows: new Set((strikes ?? []).filter((x) => x.target_player === r.player_id).map((x) => x.event_id)).size,
				}));
				const { data: reports } = await db.from('meetup_reports')
					.select('reason, created_at').eq('event_id', body.eventId).is('target_player', null).order('created_at');
				return json({ event: shapeEvent(ev as Record<string, unknown>), signups, reports: reports ?? [] });
			}

			// restore: show it again, reports cleared. remove: cancel and hide.
			// ban_organizer: remove + ban, every open game of theirs hidden.
			// ban_signup: drop one signup (an offensive name) and ban that player.
			case 'moderate': {
				if (!isUuid(body.eventId) || !await isModToken(body.eventId, body.token)) return bad('forbidden', 403);
				const { data: ev } = await db.from('meetup_events')
					.select('id, organizer_id, organizer_ip').eq('id', body.eventId).maybeSingle();
				if (!ev) return bad('unknown event', 404);
				const what = String(body.do ?? '');
				if (what === 'restore') {
					await db.from('meetup_reports').delete().eq('event_id', body.eventId);
					await db.from('meetup_events').update({ hidden: false, updated_at: nowIso }).eq('id', body.eventId);
				} else if (what === 'remove' || what === 'ban_organizer') {
					// Cancelled, not deleted: signed-up players must still learn it is off.
					await db.from('meetup_events').update({ hidden: true, status: 'cancelled', updated_at: nowIso })
						.eq('id', body.eventId);
					if (what === 'ban_organizer') {
						await ban(db, ev.organizer_id as string, ev.organizer_ip as string | null, body.eventId);
						await db.from('meetup_events').update({ hidden: true, updated_at: nowIso })
							.eq('organizer_id', ev.organizer_id).eq('status', 'open');
					}
				} else if (what === 'ban_signup') {
					if (!isUuid(body.signupId)) return bad('bad signupId');
					const { data: su } = await db.from('meetup_signups').select('player_id, ip')
						.eq('id', body.signupId).eq('event_id', body.eventId).maybeSingle();
					if (!su) return bad('unknown signup', 404);
					await ban(db, su.player_id as string, su.ip as string | null, body.eventId);
					await db.from('meetup_signups').delete().eq('player_id', su.player_id);
				} else {
					return bad('unknown do');
				}
				return json({ ok: true });
			}

			case 'leave': {
				const ids = identities(await whoAmI(), body.playerId);
				if (!isUuid(body.eventId) || !ids.length) return bad('bad request');
				await db.from('meetup_signups').delete().eq('event_id', body.eventId).in('player_id', ids);
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
		console.error(e);
		return json({ error: 'server error' }, 500);
	}
});
