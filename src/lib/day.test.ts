import { describe, it, expect } from 'vitest';
import { challengeDay, challengeDayNumber, challengeDayOrdinal, challengeWeekday, dayBefore } from './day';
import { dateSeed } from '../games/prng';
import { todayKey, dailyWeekdayLabel, dailyDifficultyIndex, dailyTierOrdinal } from './leaderboard';

describe('challenge day (Europe/Paris)', () => {
	it('formats as YYYY-MM-DD', () => {
		expect(challengeDay(new Date('2026-08-03T10:00:00Z'))).toBe('2026-08-03');
		expect(challengeDay(new Date('2026-01-09T10:00:00Z'))).toBe('2026-01-09');
	});

	it('rolls over at Paris midnight, not UTC midnight', () => {
		// 00:35 Paris on 3 August is still 22:35 UTC on the 2nd — the bug window.
		const justAfterMidnight = new Date('2026-08-02T22:35:00Z');
		expect(justAfterMidnight.toISOString().slice(0, 10)).toBe('2026-08-02'); // what UTC would have said
		expect(challengeDay(justAfterMidnight)).toBe('2026-08-03');
		// 23:30 Paris is still the same day.
		expect(challengeDay(new Date('2026-08-02T21:30:00Z'))).toBe('2026-08-02');
	});

	it('handles winter offset (+1)', () => {
		expect(challengeDay(new Date('2026-01-09T23:30:00Z'))).toBe('2026-01-10');
		expect(challengeDay(new Date('2026-01-09T22:30:00Z'))).toBe('2026-01-09');
	});

	it('gives every day-derived value the same boundary', () => {
		const d = new Date('2026-08-02T22:35:00Z'); // 3 August, 00:35 Paris — a Monday
		expect(todayKey(d)).toBe('2026-08-03');
		expect(dateSeed(d)).toBe(20260803);
		expect(challengeDayNumber(d)).toBe(20260803);
		expect(challengeWeekday(d)).toBe(1);
		expect(dailyWeekdayLabel(d)).toBe('Lundi');
		expect(dailyDifficultyIndex(d)).toBe(0); // Mon/Tue → easy
	});

	it('counts days since the epoch', () => {
		expect(challengeDayOrdinal(new Date('1970-01-01T12:00:00Z'))).toBe(0);
		const d = new Date('2026-08-03T10:00:00Z');
		expect(challengeDayOrdinal(d)).toBe(challengeDayOrdinal(new Date('2026-08-02T10:00:00Z')) + 1);
		// The epoch weekday anchor dailyTierOrdinal relies on: day 0 was a Thursday.
		expect((challengeDayOrdinal(d) + 4) % 7).toBe(challengeWeekday(d));
	});

	it('numbers the dailies of a tier one by one', () => {
		const at = (iso: string): number => dailyTierOrdinal(new Date(`${iso}T10:00:00Z`));
		// 2026-08-03 is a Monday: Mon/Tue share a tier, so Tuesday is the next draw…
		expect(at('2026-08-04')).toBe(at('2026-08-03') + 1);
		// …and the Monday after, once Wed-Sun have gone to the other two tiers.
		expect(at('2026-08-10')).toBe(at('2026-08-04') + 1);
		expect(at('2026-08-07')).toBe(at('2026-08-06') + 1); // Thu → Fri, the mid-week tier
	});

	it('steps back one day', () => {
		expect(dayBefore('2026-08-03')).toBe('2026-08-02');
		expect(dayBefore('2026-01-01')).toBe('2025-12-31');
		expect(dayBefore('2026-03-01')).toBe('2026-02-28');
	});
});
