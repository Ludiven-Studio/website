// Client-side filtering of the loaded events (spec §8). At launch there will be
// twenty events, not twenty thousand — the whole set is already in memory, so a
// server round-trip per filter click would only add latency.

import { challengeDayOrdinal, challengeWeekday } from './day';
import { isNearPlaces, type Place } from './meetupPlaces';
import { seatsLeft, type MeetupEvent, type Role } from './meetupRules';

export type DateFilter = 'today' | 'weekend' | 'week' | 'all';
export type RoleFilter = 'all' | Role;

export interface Filters {
	date: DateFilter;
	role: RoleFilter;
	freeSeatsOnly: boolean;
	nearPlaces: boolean;
}

export const DEFAULT_FILTERS: Filters = { date: 'week', role: 'all', freeSeatsOnly: false, nearPlaces: false };

export const DATE_LABEL: Record<DateFilter, string> = {
	today: "Aujourd'hui",
	weekend: 'Ce week-end',
	week: '7 jours',
	all: 'Tout',
};

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

export function matchesDate(e: MeetupEvent, f: DateFilter, now: Date = new Date()): boolean {
	if (f === 'all') return true;
	const d = dayOf(e.starts_at);
	const today = challengeDayOrdinal(now);
	if (f === 'today') return d === today;
	if (f === 'week') return d >= today && d <= today + 7;
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
		.filter((e) => matchesDate(e, f.date, now))
		.filter((e) => matchesRole(e, f.role))
		.filter((e) => !f.freeSeatsOnly || seatsLeft(e) > 0)
		.filter((e) => !near || isNearPlaces(places, e.lat, e.lng))
		.sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
}
