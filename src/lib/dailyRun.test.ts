import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveDailyRun, loadDailyRun } from './leaderboard';
import { globalStreak, gameStreak } from './streak';
import { balance } from './wallet';

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

beforeEach(() => {
	vi.stubGlobal('localStorage', new MemStorage());
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('daily run rewards', () => {
	it('a finished daily advances the streak and pays cocottes', () => {
		const before = balance();
		saveDailyRun('sudoku', { startedAt: Date.now(), done: true, finalTime: 4300 });
		expect(gameStreak('sudoku').count).toBe(1);
		expect(globalStreak().count).toBe(1);
		expect(balance()).toBe(before + 10);
	});

	it('giving up spends the attempt but earns nothing', () => {
		const before = balance();
		saveDailyRun('sudoku', { startedAt: Date.now(), done: true, abandoned: true });
		// The attempt is closed — no replay today…
		expect(loadDailyRun('sudoku')?.done).toBe(true);
		expect(loadDailyRun('sudoku')?.abandoned).toBe(true);
		// …but it must not look like a win.
		expect(gameStreak('sudoku').count).toBe(0);
		expect(globalStreak().count).toBe(0);
		expect(balance()).toBe(before);
	});

	it('an abandoned run does not block a later real win from paying', () => {
		saveDailyRun('tente', { startedAt: Date.now(), done: false });
		const before = balance();
		saveDailyRun('tente', { startedAt: Date.now(), done: true, finalTime: 900 });
		expect(gameStreak('tente').count).toBe(1);
		expect(balance()).toBe(before + 10);
	});
});
