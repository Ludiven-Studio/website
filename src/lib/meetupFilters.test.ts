import { describe, it, expect } from 'vitest';
import { activeCount, applyFilters, applyTournamentFilters, matchesDate, matchesRole, rangeLabel, weekendDays, DEFAULT_FILTERS } from './meetupFilters';
import type { MeetupTournament } from './meetups';
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
	organizer_tag: 'abc123def456',
	hidden: false,
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

	it('keeps to the distance picked around the places', () => {
		// Saint-Jean-de-Bournay to Lyon is about 42 km.
		const lyon = ev({ lat: 45.7578, lng: 4.8320 });
		const places = [{ name: 'Maison', lat: 45.4489, lng: 5.1381 }];
		expect(applyFilters([lyon], { ...DEFAULT_FILTERS, nearPlaces: true, nearKm: 30 }, NOW, places)).toHaveLength(0);
		expect(applyFilters([lyon], { ...DEFAULT_FILTERS, nearPlaces: true, nearKm: 50 }, NOW, places)).toHaveLength(1);
	});

	it('does not mutate its input', () => {
		const list = [ev({ starts_at: inDays(3) }), ev({ starts_at: inDays(1) })];
		const before = list.map((e) => e.id);
		applyFilters(list, DEFAULT_FILTERS, NOW);
		expect(list.map((e) => e.id)).toEqual(before);
	});
});

describe('applyTournamentFilters', () => {
	const tour = (starts: string[]): MeetupTournament => ({
		id: `t${++n}`, spot_id: 's1', title: 'Concours', club_name: 'Club', starts_at: starts[0],
		format: 'doublette', category: 'open', entry_fee_cents: null, details: null, contact_phone: null,
		poster_status: 'none', poster_url: null, organizer_tag: 'abc', status: 'open', hidden: false,
		created_at: NOW.toISOString(), lat: 45.4489, lng: 5.1381, label: 'Place', commune: '',
		contests: starts.map((s) => ({ starts_at: s, format: 'doublette', category: 'open', entry_fee_cents: null })),
	} as MeetupTournament);

	it('keeps a tournament while any contest is in the range', () => {
		const later = tour([inDays(20)]);
		const twoDays = tour([inDays(-1), inDays(0)]);
		const today = { ...DEFAULT_FILTERS, date: 'today' as const };
		expect(applyTournamentFilters([later, twoDays], today, NOW)).toEqual([twoDays]);
		expect(applyTournamentFilters([later, twoDays], { ...DEFAULT_FILTERS, date: 'all' }, NOW)).toHaveLength(2);
	});

	it('keeps only approved posters when asked', () => {
		const bare = tour([inDays(1)]);
		const pending = { ...tour([inDays(1)]), poster_status: 'pending' as const };
		const shown = { ...tour([inDays(1)]), poster_status: 'approved' as const, poster_url: '/a.jpg' };
		const f = { ...DEFAULT_FILTERS, postersOnly: true };
		expect(applyTournamentFilters([bare, pending, shown], f, NOW)).toEqual([shown]);
		expect(applyTournamentFilters([bare, pending, shown], DEFAULT_FILTERS, NOW)).toHaveLength(3);
	});

	it('splits approved from unknown as the app does: the organizer\'s yes counts', () => {
		const checked = { ...tour([inDays(1)]), approval_source: 'Calendrier du comité de l’Isère' };
		const declared = { ...tour([inDays(1)]), approval_declared: true };
		const said = { ...tour([inDays(1)]), approval_declared: false };
		const unknown = tour([inDays(1)]);
		const all = [checked, declared, said, unknown];
		expect(applyTournamentFilters(all, { ...DEFAULT_FILTERS, approval: 'approved' }, NOW)).toEqual([checked, declared]);
		expect(applyTournamentFilters(all, { ...DEFAULT_FILTERS, approval: 'unknown' }, NOW)).toEqual([said, unknown]);
		expect(applyTournamentFilters(all, DEFAULT_FILTERS, NOW)).toHaveLength(4);
	});

	it('shows only games or only tournaments when asked', () => {
		const t = tour([inDays(1)]);
		const e = ev();
		expect(applyTournamentFilters([t], { ...DEFAULT_FILTERS, show: 'games' }, NOW)).toHaveLength(0);
		expect(applyFilters([e], { ...DEFAULT_FILTERS, show: 'tournaments' }, NOW)).toHaveLength(0);
		expect(applyTournamentFilters([t], { ...DEFAULT_FILTERS, show: 'tournaments' }, NOW)).toHaveLength(1);
		expect(applyFilters([e], { ...DEFAULT_FILTERS, show: 'games' }, NOW)).toHaveLength(1);
	});
});

describe('activeCount', () => {
	it('counts what the folded panel hides, never the date', () => {
		expect(activeCount({ ...DEFAULT_FILTERS, date: 'all' }, true)).toBe(0);
		expect(activeCount({ ...DEFAULT_FILTERS, role: 'tireur', postersOnly: true }, false)).toBe(2);
		// No place saved: the distance filter does nothing, so it does not count.
		expect(activeCount({ ...DEFAULT_FILTERS, nearPlaces: true }, false)).toBe(0);
		expect(activeCount({ ...DEFAULT_FILTERS, nearPlaces: true }, true)).toBe(1);
		expect(activeCount({ ...DEFAULT_FILTERS, show: 'tournaments', approval: 'approved' }, false)).toBe(2);
	});
});

describe('fortnight', () => {
	it('reaches the weekend after next', () => {
		expect(matchesDate(ev({ starts_at: inDays(12) }), 'week', NOW)).toBe(false);
		expect(matchesDate(ev({ starts_at: inDays(12) }), 'fortnight', NOW)).toBe(true);
		expect(matchesDate(ev({ starts_at: inDays(15) }), 'fortnight', NOW)).toBe(false);
	});
});

describe('custom dates', () => {
	// NOW is Monday 21 September; inDays(3) is Thursday the 24th, 17:00 Paris.
	const range = { from: '2026-09-24', to: '2026-09-26' };

	it('keeps both ends of the picked days', () => {
		expect(matchesDate(ev({ starts_at: inDays(2) }), 'custom', NOW, range)).toBe(false);
		expect(matchesDate(ev({ starts_at: inDays(3) }), 'custom', NOW, range)).toBe(true);
		expect(matchesDate(ev({ starts_at: inDays(5) }), 'custom', NOW, range)).toBe(true);
		expect(matchesDate(ev({ starts_at: inDays(6) }), 'custom', NOW, range)).toBe(false);
	});

	it('reads one day when the end is missing or before the start', () => {
		expect(matchesDate(ev({ starts_at: inDays(3) }), 'custom', NOW, { from: '2026-09-24', to: '' })).toBe(true);
		expect(matchesDate(ev({ starts_at: inDays(4) }), 'custom', NOW, { from: '2026-09-24', to: '2026-09-20' })).toBe(false);
	});

	it('counts the Paris day: 23:30 in Paris is still the 24th', () => {
		const day = { from: '2026-09-24', to: '' };
		expect(matchesDate({ starts_at: '2026-09-24T21:30:00Z' }, 'custom', NOW, day)).toBe(true);
		expect(matchesDate({ starts_at: '2026-09-24T22:30:00Z' }, 'custom', NOW, day)).toBe(false);
	});

	it('keeps everything until a day is picked', () => {
		expect(matchesDate(ev({ starts_at: inDays(40) }), 'custom', NOW, { from: '', to: '' })).toBe(true);
	});

	it('filters games through the same fields', () => {
		const inside = ev({ starts_at: inDays(4) });
		const outside = ev({ starts_at: inDays(9) });
		const f = { ...DEFAULT_FILTERS, date: 'custom' as const, ...range };
		expect(applyFilters([inside, outside], f, NOW).map((e) => e.id)).toEqual([inside.id]);
	});

	it('names the range the short way', () => {
		expect(rangeLabel({ from: '2026-10-24', to: '' })).toBe('24 oct.');
		expect(rangeLabel({ from: '2026-10-24', to: '2026-10-27' })).toBe('24 – 27 oct.');
		expect(rangeLabel({ from: '2026-10-30', to: '2026-11-02' })).toBe('30 oct. – 2 nov.');
	});

	it('names it in English on the English page', () => {
		expect(rangeLabel({ from: '', to: '' }, 'en')).toBe('Dates…');
		expect(rangeLabel({ from: '2026-10-24', to: '' }, 'en')).toBe('24 Oct');
		expect(rangeLabel({ from: '2026-10-24', to: '2026-10-27' }, 'en')).toBe('24 – 27 Oct');
		expect(rangeLabel({ from: '2026-10-30', to: '2026-11-02' }, 'en')).toBe('30 Oct – 2 Nov');
	});
});
