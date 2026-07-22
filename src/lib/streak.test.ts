import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recordDailyDone, globalStreak, gameStreak } from './streak';

// Minimal localStorage shim (vitest runs in the node environment).
class MemStorage {
	private m = new Map<string, string>();
	getItem(k: string): string | null {
		return this.m.has(k) ? this.m.get(k)! : null;
	}
	setItem(k: string, v: string): void {
		this.m.set(k, v);
	}
	removeItem(k: string): void {
		this.m.delete(k);
	}
	clear(): void {
		this.m.clear();
	}
}

const setDay = (isoDay: string): void => {
	vi.setSystemTime(new Date(`${isoDay}T12:00:00Z`));
};

beforeEach(() => {
	vi.stubGlobal('localStorage', new MemStorage());
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('streak', () => {
	it('starts at 1 on the first completion', () => {
		setDay('2026-03-10');
		recordDailyDone('sudoku');
		expect(globalStreak().count).toBe(1);
		expect(gameStreak('sudoku').count).toBe(1);
		expect(globalStreak().playedToday).toBe(true);
	});

	it('increments on consecutive days', () => {
		setDay('2026-03-10');
		recordDailyDone('sudoku');
		setDay('2026-03-11');
		recordDailyDone('sudoku');
		setDay('2026-03-12');
		recordDailyDone('sudoku');
		expect(gameStreak('sudoku').count).toBe(3);
		expect(globalStreak().count).toBe(3);
	});

	it('is idempotent within a day', () => {
		setDay('2026-03-10');
		recordDailyDone('sudoku');
		recordDailyDone('sudoku');
		expect(gameStreak('sudoku').count).toBe(1);
	});

	it('resets to 1 after a skipped day', () => {
		setDay('2026-03-10');
		recordDailyDone('sudoku');
		setDay('2026-03-11');
		recordDailyDone('sudoku');
		setDay('2026-03-13'); // skipped the 12th
		recordDailyDone('sudoku');
		expect(gameStreak('sudoku').count).toBe(1);
	});

	it('is at risk (alive but not continued) the day after', () => {
		setDay('2026-03-10');
		recordDailyDone('sudoku');
		setDay('2026-03-11'); // not played yet today
		const v = gameStreak('sudoku');
		expect(v.count).toBe(1);
		expect(v.atRisk).toBe(true);
		expect(v.playedToday).toBe(false);
	});

	it('lapses to 0 once a full day is missed', () => {
		setDay('2026-03-10');
		recordDailyDone('sudoku');
		setDay('2026-03-12'); // two days later, untouched
		expect(gameStreak('sudoku').count).toBe(0);
	});

	it('tracks the global streak across different games', () => {
		setDay('2026-03-10');
		recordDailyDone('sudoku');
		setDay('2026-03-11');
		recordDailyDone('mots-meles'); // a different game the next day
		expect(globalStreak().count).toBe(2);
		expect(gameStreak('sudoku').count).toBe(1); // sudoku not played on the 11th → at risk
		expect(gameStreak('sudoku').atRisk).toBe(true);
		expect(gameStreak('mots-meles').count).toBe(1);
	});
});
