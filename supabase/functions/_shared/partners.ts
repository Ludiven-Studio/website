// Partner searches on a tournament's contest: the rules, kept apart from meetups/index.ts so
// they can be tested without a database. The app mirrors them in App.Meetups.Core
// (PartnerSearch.cs); this copy is the authority, and its refusals are shown as they come.

export const P_POSTERS = ['solo', 'pair'];
export const P_LEVELS = ['loisir', 'confirme', 'competition'];
export const P_REASONS = ['fake', 'offensive', 'other'];
export const P_REASON_LABEL: Record<string, string> = {
	fake: 'Fausse annonce', offensive: 'Propos déplacés', other: 'Autre',
};
export const P_MAX_NOTE = 120;
/** Open searches per player, all tournaments together. */
export const P_MAX_OPEN = 5;
/** New numbers a player can ask for per day, and per IP. */
export const P_CONTACTS_PER_DAY = 10;
export const P_CONTACTS_PER_IP_DAY = 30;
/** As for tournaments: two reporters from two IPs hide a search at once. */
export const P_HIDE_REPORTERS = 2;
export const P_HIDE_IPS = 2;

/** A stored contest of a tournament, as `meetup_tournaments.contests` holds it. */
export interface StoredContest {
	starts_at: string;
	format: string;
	category: string;
}

/** Players in a team of this format; 0 when the format takes no partner. */
export function teamSize(format: string): number {
	return format === 'doublette' ? 2 : format === 'triplette' ? 3 : format === 'tete-a-tete' ? 1 : 0;
}

/** Players the team still needs: a player alone in triplette needs two. */
export function missing(format: string, poster: string): number {
	return Math.max(0, teamSize(format) - (poster === 'pair' ? 2 : 1));
}

/** One line, at most 120 characters, no link, no markup. "" when empty, null when refused. */
export function cleanPartnerNote(raw: unknown, offensive: (s: string) => boolean): string | null {
	const s = String(raw ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, P_MAX_NOTE);
	if (/[<>]/.test(s)) return null;
	if (/https?:\/\/|www\.|\.(com|fr|net|org|io)\b/i.test(s)) return null;
	if (s && offensive(s)) return null;
	return s;
}

/** The tournament's contest a search names, by start, format and category. */
export function findContest(contests: unknown, startsAt: unknown, format: unknown, category: unknown): StoredContest | null {
	const at = Date.parse(String(startsAt));
	if (!Array.isArray(contests) || !Number.isFinite(at)) return null;
	for (const c of contests as StoredContest[]) {
		if (c && Date.parse(String(c.starts_at)) === at && c.format === format && c.category === category) return c;
	}
	return null;
}

/** The number as stored, E.164: a French one may be typed as dialled ("06 12 34 56 78"), any
 *  other with its country code ("+32 470 12 34 56", "0032…"). null when refused or empty. */
export function cleanPartnerPhone(raw: unknown): string | null {
	let s = String(raw ?? '').replace(/[\s.\-()/]/g, '');
	if (s.startsWith('00')) s = '+' + s.slice(2);
	else if (/^0[1-9]\d{8}$/.test(s)) s = '+33' + s.slice(1);
	return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

/** The fields of a new search from the request, or the refusal to show. */
export function partnerFields(
	body: Record<string, unknown>, contests: unknown, nowMs: number, offensive: (s: string) => boolean,
): Record<string, unknown> | string {
	const contest = findContest(contests, body.contestStartsAt, body.format, body.category);
	if (!contest || teamSize(contest.format) < 2) return 'Choisis une épreuve en équipe de ce concours.';
	if (Date.parse(contest.starts_at) <= nowMs) return 'Cette épreuve a déjà commencé.';
	const poster = String(body.poster ?? '');
	if (!P_POSTERS.includes(poster)) return 'Annonce invalide.';
	if (missing(contest.format, poster) === 0) return 'Ton équipe est déjà complète pour cette épreuve.';
	const level = String(body.level ?? '');
	if (!P_LEVELS.includes(level)) return 'Niveau inconnu.';
	const note = cleanPartnerNote(body.note, offensive);
	if (note === null) return 'Mot invalide (120 caractères, sans lien).';
	const phone = cleanPartnerPhone(body.phone);
	if (!phone) return 'Donne un numéro de téléphone pour qu’on te joigne : français, ou avec son indicatif (+32…).';
	return {
		poster, level, note, phone,
		contest_starts_at: new Date(contest.starts_at).toISOString(),
		format: contest.format, category: contest.category,
	};
}

/** What anyone may see of a search: never the number, never the author's id. */
export function shapePartnerSearch(row: Record<string, unknown>, uid: string | null, contacts?: number): Record<string, unknown> {
	const mine = Boolean(uid) && uid === row.player_id;
	const shaped: Record<string, unknown> = {
		id: row.id,
		tournamentId: row.tournament_id,
		firstName: row.first_name,
		poster: row.poster,
		contest: { startsAt: row.contest_starts_at, format: row.format, category: row.category },
		level: row.level,
		note: row.note ?? '',
		mine,
	};
	if (mine) shaped.contacts = contacts ?? 0;
	return shaped;
}
