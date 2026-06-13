import { describe, it, expect } from 'vitest';
import { DIFFS, generateChemin, countSolutions } from './engine';
import { mulberry32, dateSeed } from '../prng';

describe('chemin engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: Hamiltonian path, ordered checkpoints, unique`, () => {
			const p = generateChemin(diff, mulberry32(30 + diff.size));
			const n = p.size;

			// Path visits every cell exactly once.
			expect(p.path.length).toBe(n * n);
			const seen = new Set(p.path.map(([r, c]) => `${r},${c}`));
			expect(seen.size).toBe(n * n);

			// Consecutive path cells are orthogonally adjacent.
			for (let i = 1; i < p.path.length; i++) {
				const [r1, c1] = p.path[i - 1];
				const [r2, c2] = p.path[i];
				expect(Math.abs(r1 - r2) + Math.abs(c1 - c2)).toBe(1);
			}

			// Checkpoints appear in increasing order along the path.
			let last = 0;
			for (const [r, c] of p.path) {
				const lab = p.numbers[r][c];
				if (lab !== 0) {
					expect(lab).toBe(last + 1);
					last = lab;
				}
			}
			expect(last).toBe(p.k);

			// Exactly one solution.
			expect(countSolutions(p.numbers, n, p.k, 2)).toBe(1);
		});
	}

	it('is deterministic: same seed -> identical puzzle', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateChemin(DIFFS.facile, mulberry32(seed));
		const b = generateChemin(DIFFS.facile, mulberry32(seed));
		expect(a.numbers).toEqual(b.numbers);
		expect(a.path).toEqual(b.path);
	});
});
