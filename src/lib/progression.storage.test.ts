import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getProgression, submitLevel, unlockedUpTo } from './progression';

class MemStorage {
	private m = new Map<string, string>();
	getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
	setItem(k: string, v: string): void { this.m.set(k, v); }
	removeItem(k: string): void { this.m.delete(k); }
	clear(): void { this.m.clear(); }
}

// What an old version, a full disk or a hand edit can leave in storage. The network is stubbed to fail,
// so only the local copy is read and written.
const KEY = 'ludiven-progress-sudoku';
const stored = () => JSON.parse(localStorage.getItem(KEY)!);

beforeEach(() => {
	vi.stubGlobal('localStorage', new MemStorage());
	vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as Response));
});
afterEach(() => vi.unstubAllGlobals());

describe('a broken progression in storage', () => {
	it.each(['{', 'null', '[]', '"x"', '{"stars":"1","best":{}}', '{"stars":[3,3,3],"best":[1,2,3]}'])(
		'%j still records the next win',
		async (raw) => {
			localStorage.setItem(KEY, raw);
			await submitLevel({ gameId: 'sudoku', level: 1, stars: 3, score: 100, metricIsTime: true });
			expect(stored()).toEqual({ stars: { 1: 3 }, best: { 1: 100 } });
		},
	);

	it('keeps the valid levels and drops the rest', async () => {
		localStorage.setItem(KEY, JSON.stringify({
			stars: { 1: 3, 2: 9, 3: '2', 4: 0, '-1': 3, '1.5': 2, abc: 1, 5: 2 },
			best: { 1: 40, 2: null, 5: 'fast', 6: 12 },
		}));
		const p = await getProgression('sudoku', true);
		expect(p.stars).toEqual({ 1: 3, 5: 2 });
		expect(p.best).toEqual({ 1: 40, 6: 12 });
	});

	it('a forged star count cannot unlock the whole ladder', async () => {
		localStorage.setItem(KEY, JSON.stringify({ stars: { 99: 999 }, best: {} }));
		const p = await getProgression('sudoku', true);
		expect(unlockedUpTo({ ...p, count: 100 })).toBe(1);
	});
});

describe('hostile results', () => {
	it.each([NaN, Infinity])('a score of %s keeps the level cleared and the stored file readable', async (score) => {
		await submitLevel({ gameId: 'sudoku', level: 2, stars: 2, score, metricIsTime: true });
		const p = await getProgression('sudoku', true);
		expect(p.stars[2]).toBe(2);
		expect(() => stored()).not.toThrow();
	});
});
