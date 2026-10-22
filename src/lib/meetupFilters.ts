// Client-side filtering of the loaded events (spec §8). At launch there will be
// twenty events, not twenty thousand — the whole set is already in memory, so a
// server round-trip per filter click would only add latency.

import { challengeDayOrdinal, challengeWeekday } from './day';
import { isNearPlaces, NEAR_M, type Place } from './meetupPlaces';
import { seatsLeft, type MeetupEvent, type Role } from './meetupRules';
import { contestsOf, type MeetupTournament } from './meetups';

export type DateFilter = 'today' | 'weekend' | 'week' | 'fortnight' | 'all' | 'custom';
export type RoleFilter = 'all' | Role;
export type ShowFilter = 'all' | 'games' | 'tournaments';
/** As in the app: 'approved' keeps the checked and the declared ones, 'unknown' the rest. */
export type ApprovalFilter = 'all' | 'approved' | 'unknown';

/** Paris days, YYYY-MM-DD, both included. An empty `to` means the `from` day alone. */
export interface DayRange { from: string; to: string; }

export interface Filters extends DayRange {
	date: DateFilter;
	role: RoleFilter;
	freeSeatsOnly: boolean;
	nearPlaces: boolean;
	/** Kilometres around each saved place, one of NEAR_KM. */
	nearKm: number;
	/** Tournaments only: games carry no poster. */
	postersOnly: boolean;
	show: ShowFilter;
	approval: ApprovalFilter;
}

/** What "autour de mes lieux" offers, as in the app. */
export const NEAR_KM = [5, 10, 20, 30, 50] as const;

export const DEFAULT_FILTERS: Filters = {
	date: 'week', from: '', to: '', role: 'all', freeSeatsOnly: false, nearPlaces: false, nearKm: NEAR_M / 1000, postersOnly: false,
	show: 'all', approval: 'all',
};

export const DATE_LABEL: Record<DateFilter, string> = {
	today: "Aujourd'hui",
	weekend: 'Ce week-end',
	week: '7 jours',
	fortnight: '14 jours',
	all: 'Tout',
	custom: 'Dates…',
};

export const DATE_LABEL_EN: Record<DateFilter, string> = {
	today: 'Today',
	weekend: 'This weekend',
	week: '7 days',
	fortnight: '14 days',
	all: 'All',
	custom: 'Dates…',
};

/** The day counter of a YYYY-MM-DD, the same one challengeDayOrdinal gives an instant. */
const ordinalOf = (isoDay: string): number => Math.floor(Date.parse(`${isoDay}T12:00:00Z`) / 86400000);

const dayFormats = (locale: string) => ({
	shortDay: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
	dayNum: new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' }),
});
const DAY_FORMATS = { fr: dayFormats('fr-FR'), en: dayFormats('en-GB') };

/** "24 oct.", "24 – 27 oct." or "30 oct. – 2 nov.": the month once when both share it. */
export function rangeLabel({ from, to }: DayRange, lang: 'fr' | 'en' = 'fr'): string {
	if (!from) return (lang === 'en' ? DATE_LABEL_EN : DATE_LABEL).custom;
	const { shortDay, dayNum } = DAY_FORMATS[lang];
	const a = new Date(`${from}T12:00:00Z`);
	if (!to || to <= from) return shortDay.format(a);
	const b = new Date(`${to}T12:00:00Z`);
	const sameMonth = from.slice(0, 7) === to.slice(0, 7);
	return `${sameMonth ? dayNum.format(a) : shortDay.format(a)} – ${shortDay.format(b)}`;
}

/** Paris day of an instant, as a day counter. Comparing day numbers rather than
 *  instants keeps "aujourd'hui" on the Paris calendar without ever building a
 *  Paris-midnight timestamp (whose UTC offset moves twice a year). */
const dayOf = (iso: string): number => challengeDayOrdinal(new Date(iso));

/** The coming Saturday and Sunday, as day numbers. During a weekend it is the
 *  one you are in, not the next one. */
export function weekendDays(now: Date = new Date()): [number, number] {
	const today = challengeDayOrdinal(now);
	const wd = challengeWeekday(now); // 0 = Sunday
	if (wd === 0) return [today - 1, today];
	if (wd === 6) return [today, today + 1];
	const sat = today + (6 - wd);
	return [sat, sat + 1];
}

/** 'custom' reads `range`; with no day picked yet it keeps everything. */
export function matchesDate(
	e: { starts_at: string }, f: DateFilter, now: Date = new Date(), range?: DayRange,
): boolean {
	if (f === 'all') return true;
	const d = dayOf(e.starts_at);
	if (f === 'custom') {
		if (!range?.from) return true;
		const from = ordinalOf(range.from);
		const to = range.to && range.to > range.from ? ordinalOf(range.to) : from;
		return d >= from && d <= to;
	}
	const today = challengeDayOrdinal(now);
	if (f === 'today') return d === today;
	if (f === 'week') return d >= today && d <= today + 7;
	if (f === 'fortnight') return d >= today && d <= today + 14;
	const [sat, sun] = weekendDays(now);
	return d === sat || d === sun;
}

/** An event open to `any` welcomes everyone, so it survives every role filter —
 *  filtering it out would hide exactly the games easiest to join. */
export const matchesRole = (e: MeetupEvent, f: RoleFilter): boolean =>
	f === 'all' || e.role_needed === 'any' || e.role_needed === f;

export function applyFilters(
	events: readonly MeetupEvent[], f: Filters, now: Date = new Date(), places: readonly Place[] = [],
): MeetupEvent[] {
	// An empty list of places cannot constrain anything. Enforcing it would empty
	// the map with no way to tell why — the bar hides the toggle instead.
	if (f.show === 'tournaments') return [];
	const near = f.nearPlaces && places.length > 0;
	return events
		.filter((e) => e.status === 'open')
		.filter((e) => matchesDate(e, f.date, now, f))
		.filter((e) => matchesRole(e, f.role))
		.filter((e) => !f.freeSeatsOnly || seatsLeft(e) > 0)
		.filter((e) => !near || isNearPlaces(places, e.lat, e.lng, f.nearKm * 1000))
		.sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
}

/** Filters set away from their default, the date aside: the folded panel shows
 *  the date itself and counts these. */
export function activeCount(f: Filters, hasPlaces: boolean): number {
	return Number(f.role !== 'all') + Number(f.freeSeatsOnly) + Number(f.postersOnly)
		+ Number(f.nearPlaces && hasPlaces) + Number(f.show !== 'all') + Number(f.approval !== 'all');
}

/** A checked source or the organizer's yes both count as approved, as approvalLine words them. */
export const isApproved = (t: Pick<MeetupTournament, 'approval_source' | 'approval_declared'>): boolean =>
	Boolean(t.approval_source) || t.approval_declared === true;

/** The date, place, poster and approval filters: a tournament has no seats and no role.
 *  It stays while any of its contests falls in the range. poster_url is only set once
 *  the moderator approved the poster. */
export function applyTournamentFilters(
	tournaments: readonly MeetupTournament[], f: Filters, now: Date = new Date(), places: readonly Place[] = [],
): MeetupTournament[] {
	if (f.show === 'games') return [];
	const near = f.nearPlaces && places.length > 0;
	return tournaments
		.filter((t) => f.approval === 'all' || isApproved(t) === (f.approval === 'approved'))
		.filter((t) => !f.postersOnly || Boolean(t.poster_url))
		.filter((t) => contestsOf(t).some((c) => matchesDate(c, f.date, now, f)))
		.filter((t) => !near || isNearPlaces(places, t.lat, t.lng, f.nearKm * 1000));
}
