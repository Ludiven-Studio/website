import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveDailyRun, loadDailyRun, checkpointDailyClock, submitDaily } from './leaderboard';
import { globalStreak, gameStreak } from './streak';
import { balance, resetWalletCache } from './wallet';

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
	resetWalletCache(); // a brand new store: the wallet's cached parse belongs to the last one
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('daily run rewards', () => {
	it('a finished daily advances the streak and pays cocoins', () => {
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

/* The chrono must count play time, not wall-clock time: leaving mid-puzzle and coming
   back an hour later has to resume where the player left off. */
describe('daily run chrono pauses while away', () => {
	/* Stand-in for a game screen: it reads the epoch once on mount and keeps it in a ref,
	   exactly like every game's `startRef`. Re-reading it later would hide the bug. */
	const open = (game: string) => {
		const startRef = { current: loadDailyRun(game)?.startedAt ?? Date.now() };
		return {
			elapsed: () => Date.now() - startRef.current,
			move: () => saveDailyRun(game, { startedAt: startRef.current, done: false }),
			hide: () => checkpointDailyClock(game, Date.now() - startRef.current),
		};
	};

	it('a break between two visits is not billed', () => {
		const first = open('sudoku');
		first.move();
		vi.advanceTimersByTime(30_000); // 30 s of actual play
		first.move();

		vi.advanceTimersByTime(2 * 60 * 60_000); // …then two hours away
		expect(open('sudoku').elapsed()).toBe(30_000);
	});

	it('play time accumulates across several visits', () => {
		const first = open('aquarium');
		first.move();
		vi.advanceTimersByTime(10_000);
		first.move();

		vi.advanceTimersByTime(60 * 60_000); // an hour away

		const second = open('aquarium');
		expect(second.elapsed()).toBe(10_000); // picks the chrono back up
		vi.advanceTimersByTime(5_000);
		second.move();

		vi.advanceTimersByTime(24 * 60_000);
		expect(open('aquarium').elapsed()).toBe(15_000);
	});

	it('a checkpoint banks thinking time that no move recorded', () => {
		const s = open('tente');
		s.move();
		vi.advanceTimersByTime(90_000); // stares at the grid, plays nothing
		s.hide();

		vi.advanceTimersByTime(3 * 60 * 60_000);
		expect(open('tente').elapsed()).toBe(90_000);
	});

	it('without a checkpoint, only time up to the last move is kept', () => {
		const s = open('chemin');
		s.move();
		vi.advanceTimersByTime(20_000);
		s.move();
		vi.advanceTimersByTime(90_000); // idle, then the tab dies without firing anything

		expect(open('chemin').elapsed()).toBe(20_000);
	});

	it('a finished run keeps its final time untouched', () => {
		saveDailyRun('reines', { startedAt: Date.now(), done: true, finalTime: 4300 });
		vi.advanceTimersByTime(60 * 60_000);
		const run = loadDailyRun('reines')!;
		expect(run.finalTime).toBe(4300);
		checkpointDailyClock('reines', 999_999); // must not rewrite a closed attempt
		expect(loadDailyRun('reines')!.elapsedMs).toBeUndefined();
	});

	it('a fixed-duration blitz keeps burning while away', () => {
		// Méli-mélo is a 60 s race: pausing it would mean hunting words off the clock.
		const s = open('meli-melo');
		s.move();
		vi.advanceTimersByTime(10_000);
		s.move();
		vi.advanceTimersByTime(50_000); // away — the countdown must not stop

		expect(open('meli-melo').elapsed()).toBe(60_000);
	});

	it('a run saved before elapsedMs existed still resumes on wall-clock', () => {
		// Legacy shape: no elapsedMs field at all.
		localStorage.setItem(
			'ludiven-dailyrun-motifs-2026-03-10',
			JSON.stringify({ startedAt: Date.now() - 45_000, done: false }),
		);
		expect(open('motifs').elapsed()).toBe(45_000);
	});
});

/* What a full disk, an old version or a hand edit can leave under today's key. */
describe('a broken daily run in storage', () => {
	const key = (game: string) => `ludiven-dailyrun-${game}-2026-03-10`;

	it.each(['{', 'null', '[]', '"run"', '{"startedAt":"x"}', '{"done":"yes","startedAt":1}', '{"done":false,"startedAt":"abc"}'])(
		'%j reads as no run, and finishing still pays',
		(raw) => {
			localStorage.setItem(key('sudoku'), raw);
			expect(loadDailyRun('sudoku')).toBeNull();
			const before = balance();
			saveDailyRun('sudoku', { startedAt: Date.now(), done: true, finalTime: 900 });
			expect(balance()).toBe(before + 10);
			expect(gameStreak('sudoku').count).toBe(1);
		},
	);

	it('ignores an elapsedMs that is not a number instead of resuming at NaN', () => {
		localStorage.setItem(key('tente'), JSON.stringify({ startedAt: Date.now() - 5000, done: false, elapsedMs: 'abc' }));
		const run = loadDailyRun('tente');
		expect(Number.isFinite(run?.startedAt)).toBe(true);
	});

	it('keeps a finished run finished even with a broken chrono, so the attempt is not handed out again', () => {
		localStorage.setItem(key('reines'), JSON.stringify({ startedAt: null, done: true, finalTime: 4300 }));
		expect(loadDailyRun('reines')?.done).toBe(true);
	});

	it('a checkpoint on a broken run writes nothing', () => {
		localStorage.setItem(key('chemin'), '[]');
		checkpointDailyClock('chemin', 5000);
		expect(localStorage.getItem(key('chemin'))).toBe('[]');
	});
});

/* The network is stubbed: no request leaves the test. */
describe('the day of a daily score', () => {
	const best = (day: string) => localStorage.getItem(`ludiven-dailybest-sudoku-${day}`);

	it('an answer that arrives after midnight in Paris records the best on the day it was sent', async () => {
		localStorage.setItem('ludiven-player', 'Raph');
		vi.setSystemTime(new Date('2026-10-24T21:59:59Z')); // 23:59:59 in Paris
		vi.stubGlobal('fetch', vi.fn(async () => {
			vi.setSystemTime(new Date('2026-10-24T22:00:01Z'));
			return { ok: true } as Response;
		}));
		expect(await submitDaily('sudoku', 100, 'time')).toBe(true);
		expect(best('2026-10-24')).toBe('100');
		expect(best('2026-10-25')).toBeNull();
	});

	it('a stored best that is not a number does not block a real score', async () => {
		localStorage.setItem('ludiven-player', 'Raph');
		localStorage.setItem('ludiven-dailybest-sudoku-2026-03-10', 'NaN');
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as Response));
		expect(await submitDaily('sudoku', 500, 'time')).toBe(true);
		expect(best('2026-03-10')).toBe('500');
	});
});
