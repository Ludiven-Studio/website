// Client-side filtering of the loaded events (spec §8). At launch there will be
// twenty events, not twenty thousand — the whole set is already in memory, so a
// server round-trip per filter click would only add latency.

import { challengeDayOrdinal, challengeWeekday } from './day';
import { isNearPlaces, NEAR_M, type Place } from './meetupPlaces';
import { seatsLeft, type MeetupEvent, type Role } from './meetupRules';
import { contestsOf, type MeetupTournament } from './meetups';

export type DateFilter = 'today' | 'weekend' | 'week' | 'fortnight' | 'all' | 'custom';
export type RoleFilter = 'all' | Role;

/** Paris days, YYYY-MM-DD, both included. An empty `to` means the `from` day alone. */
export interface DayRange { from: string; to: string; }

export interface Filters extends DayRange {
	date: DateFilter;
	role: RoleFilter;
	freeSeatsOnly: boolean;
	nearPlaces: boolean;
	/** Kilometres around each saved place, one of NEAR_KM. */
	nearKm: number;
}

/** What "autour de mes lieux" offers, as in the app. */
export const NEAR_KM = [5, 10, 20, 30, 50] as const;

export const DEFAULT_FILTERS: Filters = {
	date: 'week', from: '', to: '', role: 'all', freeSeatsOnly: false, nearPlaces: false, nearKm: NEAR_M / 1000,
};

export const DATE_LABEL: Record<DateFilter, string> = {
	today: "Aujourd'hui",
	weekend: 'Ce week-end',
	week: '7 jours',
	fortnight: '14 jours',
	all: 'Tout',
	custom: 'Dates…',
};

/** The day counter of a YYYY-MM-DD, the same one challengeDayOrdinal gives an instant. */
const ordinalOf = (isoDay: string): number => Math.floor(Date.parse(`${isoDay}T12:00:00Z`) / 86400000);

const shortDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayNum = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', timeZone: 'UTC' });

/** "24 oct.", "24 – 27 oct." or "30 oct. – 2 nov.": the month once when both share it. */
export function rangeLabel({ from, to }: DayRange): string {
	if (!from) return DATE_LABEL.custom;
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
	const near = f.nearPlaces && places.length > 0;
	return events
		.filter((e) => e.status === 'open')
		.filter((e) => matchesDate(e, f.date, now, f))
		.filter((e) => matchesRole(e, f.role))
		.filter((e) => !f.freeSeatsOnly || seatsLeft(e) > 0)
		.filter((e) => !near || isNearPlaces(places, e.lat, e.lng, f.nearKm * 1000))
		.sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
}

/** The date and place filters only: a tournament has no seats and no role. It
 *  stays while any of its contests falls in the range. */
export function applyTournamentFilters(
	tournaments: readonly MeetupTournament[], f: Filters, now: Date = new Date(), places: readonly Place[] = [],
): MeetupTournament[] {
	const near = f.nearPlaces && places.length > 0;
	return tournaments
		.filter((t) => contestsOf(t).some((c) => matchesDate(c, f.date, now, f)))
		.filter((t) => !near || isNearPlaces(places, t.lat, t.lng, f.nearKm * 1000));
}
