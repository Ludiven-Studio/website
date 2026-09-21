import { describe, it, expect } from 'vitest';
import { applyFilters, matchesDate, matchesRole, weekendDays, DEFAULT_FILTERS } from './meetupFilters';
import { challengeDayOrdinal } from './day';
import type { MeetupEvent } from './meetupRules';

// A Monday, 14:00 Paris.
const NOW = new Date('2026-09-21T12:00:00Z');
const inDays = (d: number, h = 3): string => new Date(NOW.getTime() + d * 86400_000 + h * 3600_000).toISOString();

let n = 0;
const ev = (over: Partial<MeetupEvent> = {}): MeetupEvent => ({
	id: `e${++n}`,
	spot_id: 's1',
	starts_at: inDays(1),
	ends_at: inDays(1, 6),
	format: 'doublette',
	players_needed: 4,
	role_needed: 'any',
	organizer_name: 'Raph',
	organizer_seats: 1,
	status: 'open',
	lat: 45.4489,
	lng: 5.1381,
	label: 'Place',
	commune: 'Saint-Jean-de-Bournay',
	confirmed: true,
	seats_taken: 1,
	...over,
});

describe('weekendDays', () => {
	it('points at the coming Saturday from midweek', () => {
		const [sat, sun] = weekendDays(NOW); // Monday
		expect(sat).toBe(challengeDayOrdinal(NOW) + 5);
		expect(sun).toBe(sat + 1);
	});

	it('stays on the weekend you are already in', () => {
		const sat = new Date('2026-09-26T12:00:00Z');
		const sun = new Date('2026-09-27T12:00:00Z');
		expect(weekendDays(sat)[0]).toBe(challengeDayOrdinal(sat));
		expect(weekendDays(sun)[1]).toBe(challengeDayOrdinal(sun));
		expect(weekendDays(sun)[0]).toBe(challengeDayOrdinal(sun) - 1);
	});
});

describe('matchesDate', () => {
	it('splits today, the weekend and the week', () => {
		const today = ev({ starts_at: inDays(0, 6) });
		const saturday = ev({ starts_at: inDays(5) });
		const far = ev({ starts_at: inDays(20) });

		expect(matchesDate(today, 'today', NOW)).toBe(true);
		expect(matchesDate(saturday, 'today', NOW)).toBe(false);
		expect(matchesDate(saturday, 'weekend', NOW)).toBe(true);
		expect(matchesDate(today, 'weekend', NOW)).toBe(false);
		expect(matchesDate(saturday, 'week', NOW)).toBe(true);
		expect(matchesDate(far, 'week', NOW)).toBe(false);
		expect(matchesDate(far, 'all', NOW)).toBe(true);
	});

	it('counts the Paris day, not the UTC day', () => {
		// 23:30 Paris on the 22nd is 21:30 UTC — UTC would still say the 22nd here,
		// so this only proves the boundary when the two disagree: 00:30 Paris on the
		// 22nd is 22:30 UTC on the 21st, and must NOT count as "today" (the 21st).
		const justAfterParisMidnight = ev({ starts_at: '2026-09-21T22:30:00Z' });
		expect(justAfterParisMidnight.starts_at.slice(0, 10)).toBe('2026-09-21'); // what UTC would say
		expect(matchesDate(justAfterParisMidnight, 'today', NOW)).toBe(false);
	});
});

describe('matchesRole', () => {
	it('never hides a game open to everyone', () => {
		expect(matchesRole(ev({ role_needed: 'any' }), 'tireur')).toBe(true);
		expect(matchesRole(ev({ role_needed: 'tireur' }), 'tireur')).toBe(true);
		expect(matchesRole(ev({ role_needed: 'pointeur' }), 'tireur')).toBe(false);
		expect(matchesRole(ev({ role_needed: 'pointeur' }), 'all')).toBe(true);
	});
});

describe('applyFilters', () => {
	it('drops cancelled and full games, and sorts by start', () => {
		const later = ev({ starts_at: inDays(3), ends_at: inDays(3, 6) });
		const sooner = ev({ starts_at: inDays(1), ends_at: inDays(1, 6) });
		const cancelled = ev({ status: 'cancelled' });
		const full = ev({ seats_taken: 4, players_needed: 4 });

		const out = applyFilters([later, cancelled, full, sooner], { ...DEFAULT_FILTERS, freeSeatsOnly: true }, NOW);
		expect(out.map((e) => e.id)).toEqual([sooner.id, later.id]);
	});

	it('keeps a full game when the seats filter is off', () => {
		const full = ev({ seats_taken: 4, players_needed: 4 });
		expect(applyFilters([full], DEFAULT_FILTERS, NOW)).toHaveLength(1);
	});

	it('keeps a game near ANY saved place, which is the point of having several', () => {
		const here = ev();
		const lyon = ev({ lat: 45.7578, lng: 4.8320 });
		const paris = ev({ lat: 48.8566, lng: 2.3522 });
		const places = [{ name: 'Maison', lat: 45.4489, lng: 5.1381 }, { name: 'Lyon', lat: 45.7578, lng: 4.8320 }];
		const f = { ...DEFAULT_FILTERS, nearPlaces: true };

		expect(applyFilters([here, lyon, paris], f, NOW, places).map((e) => e.id)).toEqual([here.id, lyon.id]);
		// No place saved: the flag constrains nothing, rather than emptying the map.
		expect(applyFilters([here, lyon, paris], f, NOW)).toHaveLength(3);
	});

	it('does not mutate its input', () => {
		const list = [ev({ starts_at: inDays(3) }), ev({ starts_at: inDays(1) })];
		const before = list.map((e) => e.id);
		applyFilters(list, DEFAULT_FILTERS, NOW);
		expect(list.map((e) => e.id)).toEqual(before);
	});
});
