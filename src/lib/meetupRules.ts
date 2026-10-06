// Shape and validation of a pétanque meetup. Closed lists everywhere: the first
// name is the ONLY free text in the whole product.
//
// The `meetups` Edge Function holds its own copy of these rules (Deno root, it
// cannot import from src/). The SERVER copy is the authority — this one only
// keeps the form from proposing something the server will reject. When they
// disagree, fix this file, not the function. scripts/check-rencontres.mjs runs
// an agreement block over both.

export const FORMATS = ['tete-a-tete', 'doublette', 'triplette', 'melee', 'mini-tournoi'] as const;
export type Format = (typeof FORMATS)[number];

export const ROLES = ['any', 'tireur', 'pointeur'] as const;
export type Role = (typeof ROLES)[number];

/** Total seats, organizer included. A closed list so "3 joueurs" can't exist. */
export const PLAYERS_NEEDED = [2, 4, 6, 8, 12, 16] as const;

export const MAX_NAME = 24;
export const MAX_SEATS = 4;
export const MAX_DURATION_MS = 12 * 3600_000;
export const MAX_AHEAD_MS = 60 * 86400_000;
/** Open, not-yet-finished games one organizer may have at once. Deleting one
 *  frees a slot immediately — it is a standing limit, not a daily count. */
export const MAX_ACTIVE_EVENTS = 3;

export const FORMAT_LABEL: Record<Format, string> = {
	'tete-a-tete': 'Tête-à-tête',
	doublette: 'Doublette',
	triplette: 'Triplette',
	melee: 'Mêlée',
	'mini-tournoi': 'Mini-tournoi',
};

export const ROLE_LABEL: Record<Role, string> = {
	any: 'Peu importe',
	tireur: 'Tireur',
	pointeur: 'Pointeur',
};

/** One row of the map, spot already joined and seats already counted — the shape
 *  the `meetups` function returns, never the raw table. `secret` is not here and
 *  must never be. */
export interface MeetupEvent {
	id: string;
	spot_id: string;
	starts_at: string;
	ends_at: string;
	format: Format;
	players_needed: number;
	role_needed: Role;
	organizer_name: string;
	organizer_seats: number;
	/** Opaque per organizer: lets a player mute one without seeing organizer_id. */
	organizer_tag: string;
	status: 'open' | 'cancelled';
	/** Hidden after reports, until a moderator looks. `list` never returns these. */
	hidden: boolean;
	lat: number;
	lng: number;
	label: string;
	commune: string;
	confirmed: boolean;
	seats_taken: number;
}

export interface MeetupSignup {
	/** The signup row, not the player: only used to point at it in report_signup. */
	id: string;
	/** Set by the server from the caller's playerId; other players' ids are never sent. */
	is_me: boolean;
	player_name: string;
	seats: number;
	role: Role;
}

export interface MeetupSpot {
	id: string;
	lat: number;
	lng: number;
	label: string;
	commune: string;
	confirmed: boolean;
}

export const REPORT_REASONS = ['name', 'fake', 'no_show', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_LABEL: Record<ReportReason, string> = {
	name: 'Prénom choquant',
	fake: 'Fausse partie',
	no_show: "Personne n'est venu",
	other: 'Autre',
};

export const seatsLeft = (e: MeetupEvent): number => Math.max(0, e.players_needed - e.seats_taken);

/** Collapse whitespace and cap the length. Returns null when the result is
 *  unusable or smells like an ad: a URL or a tag is not a first name, and this
 *  field is the only place either could ever land. */
export function cleanName(raw: unknown): string | null {
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

export const isFormat = (v: unknown): v is Format => FORMATS.includes(v as Format);
export const isRole = (v: unknown): v is Role => ROLES.includes(v as Role);
export const isPlayersNeeded = (v: unknown): boolean =>
	typeof v === 'number' && (PLAYERS_NEEDED as readonly number[]).includes(v);
export const isSeats = (v: unknown): boolean =>
	typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_SEATS;

export interface EventDraft {
	startsAt: string;
	endsAt: string;
	format: unknown;
	playersNeeded: unknown;
	roleNeeded: unknown;
	organizerName: unknown;
	organizerSeats: unknown;
}

/** null = valid. Otherwise a French message ready to show under the form. */
export function validateEvent(d: EventDraft, now: Date = new Date()): string | null {
	const start = Date.parse(d.startsAt);
	const end = Date.parse(d.endsAt);
	if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Date invalide.';
	if (start <= now.getTime()) return 'La partie doit être dans le futur.';
	if (start > now.getTime() + MAX_AHEAD_MS) return 'Pas plus de 60 jours à l\'avance.';
	if (end <= start) return 'La fin doit être après le début.';
	if (end - start > MAX_DURATION_MS) return 'Une partie dure au plus 12 heures.';
	if (!isFormat(d.format)) return 'Format inconnu.';
	if (!isPlayersNeeded(d.playersNeeded)) return 'Nombre de joueurs invalide.';
	if (!isRole(d.roleNeeded)) return 'Rôle inconnu.';
	if (!cleanName(d.organizerName)) return 'Prénom invalide (2 à 24 caractères, sans lien).';
	if (!isSeats(d.organizerSeats)) return 'Nombre de places invalide.';
	if ((d.organizerSeats as number) > (d.playersNeeded as number)) return 'Tu prends plus de places qu\'il n\'y en a.';
	return null;
}

/** null = valid. */
export function validateSignup(name: unknown, seats: unknown, role: unknown): string | null {
	if (!cleanName(name)) return 'Prénom invalide (2 à 24 caractères, sans lien).';
	if (!isSeats(seats)) return 'Nombre de places invalide.';
	if (!isRole(role)) return 'Rôle inconnu.';
	return null;
}
