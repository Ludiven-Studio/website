import { describe, it, expect } from 'vitest';
import { DIFFS, generateChemin, countSolutions, hintReason } from './engine';
import { mulberry32, dateSeed } from '../prng';

const wallSetOf = (walls: [number, number][], n: number) => {
	const total = n * n;
	return new Set(walls.map(([a, b]) => Math.min(a, b) * total + Math.max(a, b)));
};

describe('chemin engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: Hamiltonian path, ordered checkpoints, walls, unique`, () => {
			const p = generateChemin(diff, mulberry32(30 + diff.size));
			const n = p.size;
			const total = n * n;
			const walls = wallSetOf(p.walls, n);

			// Path visits every cell exactly once.
			expect(p.path.length).toBe(total);
			expect(new Set(p.path.map(([r, c]) => `${r},${c}`)).size).toBe(total);

			// Consecutive path cells are adjacent AND never separated by a wall.
			for (let i = 1; i < p.path.length; i++) {
				const [r1, c1] = p.path[i - 1];
				const [r2, c2] = p.path[i];
				expect(Math.abs(r1 - r2) + Math.abs(c1 - c2)).toBe(1);
				const a = r1 * n + c1;
				const b = r2 * n + c2;
				expect(walls.has(Math.min(a, b) * total + Math.max(a, b))).toBe(false);
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

			// Exactly one solution, taking the walls into account.
			expect(countSolutions(p.numbers, n, p.k, walls, 2)).toBe(1);
		});
	}

	it('hintReason: non-empty explanation for the first step of a fresh puzzle', () => {
		const p = generateChemin(DIFFS.facile, mulberry32(42));
		const reason = hintReason([p.path[0]], p);
		expect(reason.length).toBeGreaterThan(0);
	});

	it('is deterministic: same seed -> identical puzzle (numbers, path, walls)', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateChemin(DIFFS.moyen, mulberry32(seed));
		const b = generateChemin(DIFFS.moyen, mulberry32(seed));
		expect(a.numbers).toEqual(b.numbers);
		expect(a.path).toEqual(b.path);
		expect(a.walls).toEqual(b.walls);
	});
});
