import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed } from '../prng';
import { DIFFS, generateTente, countSolutions, findHint } from './engine';

describe('tente engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];
		it(`${key}: generates a uniquely-solvable puzzle`, () => {
			for (let s = 0; s < 6; s++) {
				const p = generateTente(diff, mulberry32(7000 + s * 31 + diff.size));
				// tents == trees count, counts add up
				expect(p.tents.length).toBe(p.trees.length);
				expect(p.rowCounts.reduce((a, b) => a + b, 0)).toBe(p.tents.length);
				expect(p.colCounts.reduce((a, b) => a + b, 0)).toBe(p.tents.length);
				// unique solution
				expect(countSolutions(p.trees, p.rowCounts, p.colCounts, p.size, 2)).toBe(1);
			}
		});
	}

	it('solution respects the no-touch rule and tents are off trees', () => {
		const p = generateTente(DIFFS.moyen, mulberry32(424242));
		const treeSet = new Set(p.trees.map(([r, c]) => r * 100 + c));
		const tentSet = new Set(p.tents.map(([r, c]) => r * 100 + c));
		for (const [r, c] of p.tents) {
			expect(treeSet.has(r * 100 + c)).toBe(false);
			for (let dr = -1; dr <= 1; dr++)
				for (let dc = -1; dc <= 1; dc++) {
					if (dr === 0 && dc === 0) continue;
					expect(tentSet.has((r + dr) * 100 + (c + dc))).toBe(false);
				}
		}
	});

	it('is reproducible from a seed (daily challenge)', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateTente(DIFFS.moyen, mulberry32(seed));
		const b = generateTente(DIFFS.moyen, mulberry32(seed));
		expect(a.trees).toEqual(b.trees);
		expect(a.tents).toEqual(b.tents);
	});

	const k = (r: number, c: number) => r * 100 + c;

	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];
		it(`${key}: findHint solves from empty, only proposing correct marks`, () => {
			for (let s = 0; s < 4; s++) {
				const p = generateTente(diff, mulberry32(9000 + s * 17 + diff.size));
				const solSet = new Set(p.tents.map(([r, c]) => k(r, c)));
				const marks: ('tent' | 'grass' | null)[][] = Array.from({ length: p.size }, () =>
					new Array<'tent' | 'grass' | null>(p.size).fill(null),
				);

				let placedTents = 0;
				const cap = p.size * p.size + 5; // safety bound (every hint fills >=1 empty cell)
				for (let step = 0; step < cap; step++) {
					const h = findHint(marks, p);
					if (!h) break;
					// Proposed value must always match the solution.
					if (h.value === 'tent') expect(solSet.has(k(h.r, h.c))).toBe(true);
					else expect(solSet.has(k(h.r, h.c))).toBe(false);
					marks[h.r][h.c] = h.value;
					if (h.value === 'tent') placedTents++;
				}

				// Every solution tent must end up placed.
				expect(placedTents).toBe(solSet.size);
				for (const [r, c] of p.tents) expect(marks[r][c]).toBe('tent');
			}
		});
	}

	it('findHint corrects a wrong player tent', () => {
		const p = generateTente(DIFFS.facile, mulberry32(555));
		const treeSet = new Set(p.trees.map(([r, c]) => k(r, c)));
		const solSet = new Set(p.tents.map(([r, c]) => k(r, c)));
		const marks: ('tent' | 'grass' | null)[][] = Array.from({ length: p.size }, () =>
			new Array<'tent' | 'grass' | null>(p.size).fill(null),
		);

		// Find a non-tree cell that is NOT a solution tent and plant a wrong tent there.
		let wrong: [number, number] | null = null;
		for (let r = 0; r < p.size && !wrong; r++)
			for (let c = 0; c < p.size && !wrong; c++)
				if (!treeSet.has(k(r, c)) && !solSet.has(k(r, c))) wrong = [r, c];
		expect(wrong).not.toBeNull();
		const [wr, wc] = wrong!;
		marks[wr][wc] = 'tent';

		const h = findHint(marks, p);
		expect(h).not.toBeNull();
		expect(h!.r).toBe(wr);
		expect(h!.c).toBe(wc);
		expect(h!.value).toBe('grass');
	});
});
