import { describe, it, expect } from 'vitest';
import { DIFFS, generateQuestion, cellKey } from './engine';
import { mulberry32 } from '../prng';

describe('matrices engine', () => {
	it('produces a 3×3 grid with exactly one correct option among six, all distinct', () => {
		for (const key of Object.keys(DIFFS)) {
			for (let s = 0; s < 30; s++) {
				const q = generateQuestion(DIFFS[key], mulberry32(1000 * (s + 1) + DIFFS[key].vary));
				expect(q.grid.length, `${key} grid size`).toBe(9);
				expect(q.options.length, `${key} options`).toBe(6);
				expect(q.answerIndex).toBe(8);
				const answerKey = cellKey(q.grid[8]);
				const keys = q.options.map(cellKey);
				expect(new Set(keys).size, `${key} options distinct`).toBe(6);
				expect(keys.filter((k) => k === answerKey).length, `${key} exactly one correct`).toBe(1);
			}
		}
	});

	it('varies exactly `diff.vary` attributes across the grid', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const q = generateQuestion(diff, mulberry32(424242 + diff.vary));
			const distinct = (sel: (c: (typeof q.grid)[number]) => unknown) => new Set(q.grid.map(sel)).size;
			const varied = [
				distinct((c) => c.shape),
				distinct((c) => c.color),
				distinct((c) => c.count),
				distinct((c) => c.rotation),
			].filter((n) => n > 1).length;
			expect(varied, `${key} varying count`).toBe(diff.vary);
		}
	});

	it('is deterministic for a given seed', () => {
		const a = generateQuestion(DIFFS.moyen, mulberry32(2026));
		const b = generateQuestion(DIFFS.moyen, mulberry32(2026));
		expect(a).toEqual(b);
		expect(a.rule.length).toBeGreaterThan(0);
	});
});
