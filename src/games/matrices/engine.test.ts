import { describe, it, expect } from 'vitest';
import { DIFFS, generateQuestion, cellKey, N_OPTIONS, type TemplateName } from './engine';
import { mulberry32 } from '../prng';

const ALL_TEMPLATES: TemplateName[] = ['simple', 'dots', 'wheel', 'quad'];

describe('matrices engine', () => {
	it('produces a 3×3 grid with exactly one correct option, all visually distinct', () => {
		for (const key of Object.keys(DIFFS)) {
			for (let s = 0; s < 40; s++) {
				const q = generateQuestion(DIFFS[key], mulberry32(1000 * (s + 1) + DIFFS[key].simpleVary));
				expect(q.grid.length, `${key} grid size`).toBe(9);
				expect(q.options.length, `${key} options`).toBe(N_OPTIONS);
				expect(q.answerIndex).toBe(8);
				const answerKey = cellKey(q.grid[8]);
				const keys = q.options.map(cellKey);
				expect(new Set(keys).size, `${key} options distinct`).toBe(N_OPTIONS);
				expect(keys.filter((k) => k === answerKey).length, `${key} exactly one correct`).toBe(1);
			}
		}
	});

	it('answer is never a trivial copy of the left or top neighbour', () => {
		for (const key of Object.keys(DIFFS)) {
			for (let s = 0; s < 40; s++) {
				const q = generateQuestion(DIFFS[key], mulberry32(53 * (s + 2) + DIFFS[key].simpleVary));
				const a = cellKey(q.grid[8]);
				expect(a, `${key} != left`).not.toBe(cellKey(q.grid[7]));
				expect(a, `${key} != top`).not.toBe(cellKey(q.grid[5]));
			}
		}
	});

	it('every template family generates valid, solvable matrices', () => {
		const expectedContainer: Record<TemplateName, (c: string) => boolean> = {
			simple: (c) => c === 'plain',
			dots: (c) => ['triangle', 'square', 'circle'].includes(c),
			wheel: (c) => c === 'wheel8',
			quad: (c) => c === 'quad',
		};
		for (const t of ALL_TEMPLATES) {
			for (let s = 0; s < 20; s++) {
				const q = generateQuestion(DIFFS.difficile, mulberry32(900 + s), t);
				expect(expectedContainer[t](q.grid[8].container), `${t} container`).toBe(true);
				const answerKey = cellKey(q.grid[8]);
				const keys = q.options.map(cellKey);
				expect(new Set(keys).size, `${t} options distinct`).toBe(N_OPTIONS);
				expect(keys.filter((k) => k === answerKey).length, `${t} one correct`).toBe(1);
			}
		}
	});

	it('varies on both axes (a non-constant row and a non-constant column exist)', () => {
		for (const t of ALL_TEMPLATES) {
			const q = generateQuestion(DIFFS.difficile, mulberry32(321 + t.length), t);
			const rowVaries = [0, 1, 2].some((r) => new Set([0, 1, 2].map((c) => cellKey(q.grid[r * 3 + c]))).size > 1);
			const colVaries = [0, 1, 2].some((c) => new Set([0, 1, 2].map((r) => cellKey(q.grid[r * 3 + c]))).size > 1);
			expect(rowVaries, `${t} a row varies`).toBe(true);
			expect(colVaries, `${t} a column varies`).toBe(true);
		}
	});

	it('is deterministic for a given seed', () => {
		const a = generateQuestion(DIFFS.moyen, mulberry32(2026));
		const b = generateQuestion(DIFFS.moyen, mulberry32(2026));
		expect(a).toEqual(b);
		expect(a.rule.length).toBeGreaterThan(0);
	});
});
