import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { extendPlan, unlockedUpTo, LEVEL_COUNT, type LevelPlan } from './progression';
import { earn, buyUnlock, resetWalletCache } from './wallet';

class MemStorage {
	private m = new Map<string, string>();
	getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
	setItem(k: string, v: string): void { this.m.set(k, v); }
	removeItem(k: string): void { this.m.delete(k); }
	clear(): void { this.m.clear(); }
}

interface Cfg { seed: number; size: number; hard?: boolean }

const makePlan = (count: number): LevelPlan<Cfg> => ({
	count,
	metric: 'time',
	config: (l) => ({ seed: l * 1000, size: 3 + Math.floor(l / 20) }),
	stars: (l, r) => (r.score < l * 100 ? 3 : 1),
	starHint: (l) => ({ two: `≤ ${l * 2}s`, three: `≤ ${l}s` }),
});

const ext = (id: string, count = LEVEL_COUNT) =>
	extendPlan(id, makePlan(count), { configExt: (base) => ({ ...base, hard: true }) });

const unlock = (id: string): void => { earn(200); buyUnlock(id); };

beforeEach(() => {
	vi.stubGlobal('localStorage', new MemStorage());
	resetWalletCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('extendPlan', () => {
	it('doubles the count only once the pack is bought', () => {
		const plan = ext('sudoku');
		expect(plan.count).toBe(100);
		unlock('sudoku');
		expect(plan.count).toBe(200);
	});

	it('scales from the plan, not from LEVEL_COUNT', () => {
		const plan = ext('alchimie', 30);
		unlock('alchimie');
		expect(plan.count).toBe(60);
	});

	it('leaves levels 1..count untouched', () => {
		const plan = ext('sudoku');
		const base = makePlan(LEVEL_COUNT);
		for (const l of [1, 42, 100]) expect(plan.config(l)).toEqual(base.config(l));
	});

	it('maps 101-200 onto the upper half, in order', () => {
		const plan = ext('sudoku');
		unlock('sudoku');
		const sizes = Array.from({ length: 100 }, (_, i) => plan.config(101 + i).size);
		expect(sizes[0]).toBe(makePlan(LEVEL_COUNT).config(51).size);
		expect(sizes[99]).toBe(makePlan(LEVEL_COUNT).config(100).size);
		for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
	});

	it('reseeds the extended levels, deterministically and distinctly', () => {
		const plan = ext('sudoku');
		unlock('sudoku');
		expect(plan.config(101).seed).toBe(plan.config(101).seed);
		const seeds = new Set<number>();
		for (let l = 1; l <= 200; l++) seeds.add(plan.config(l).seed);
		expect(seeds.size).toBe(200);
	});

	it('applies the game hardening past the base count', () => {
		const plan = ext('sudoku');
		unlock('sudoku');
		expect(plan.config(100).hard).toBeUndefined();
		expect(plan.config(101).hard).toBe(true);
	});

	it('delegates stars and hints to the mapped base level', () => {
		const plan = ext('sudoku');
		unlock('sudoku');
		expect(plan.starHint(101)).toEqual(makePlan(LEVEL_COUNT).starHint(51));
		expect(plan.stars(101, { score: 5000, won: true })).toBe(makePlan(LEVEL_COUNT).stars(51, { score: 5000, won: true }));
	});
});

describe('unlockedUpTo', () => {
	it('caps on the progress count when present', () => {
		const stars = { 100: 3 } as Record<number, 1 | 2 | 3>;
		expect(unlockedUpTo({ stars, best: {} })).toBe(100);
		expect(unlockedUpTo({ stars, best: {}, count: 200 })).toBe(101);
	});
});
