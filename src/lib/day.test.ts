import { describe, it, expect } from 'vitest';
import { challengeDay, challengeDayNumber, challengeWeekday, dayBefore } from './day';
import { dateSeed } from '../games/prng';
import { todayKey, dailyWeekdayLabel, dailyDifficultyIndex } from './leaderboard';

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

	it('steps back one day', () => {
		expect(dayBefore('2026-08-03')).toBe('2026-08-02');
		expect(dayBefore('2026-01-01')).toBe('2025-12-31');
		expect(dayBefore('2026-03-01')).toBe('2026-02-28');
	});
});
