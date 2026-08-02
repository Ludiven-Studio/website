import { describe, it, expect } from 'vitest';
import {
	DIFFS,
	generateReines,
	countSolutions,
	solveByLogic,
	findConflicts,
	findHint,
	applyHint,
	type CellState,
} from './engine';
import { mulberry32, dateSeed } from '../prng';

const adjacent = (r1: number, c1: number, r2: number, c2: number) =>
	Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;

describe('reines engine', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: valid solution, n regions, unique`, () => {
			const p = generateReines(diff, mulberry32(100 + diff.size));
			const n = p.size;

			// One queen per row & column.
			expect(new Set(p.solution).size).toBe(n);
			p.solution.forEach((c) => expect(c).toBeGreaterThanOrEqual(0));

			// No two queens adjacent.
			for (let r = 0; r < n; r++)
				for (let r2 = r + 1; r2 < n; r2++)
					expect(adjacent(r, p.solution[r], r2, p.solution[r2])).toBe(false);

			// One queen per region + regions cover the grid with ids 0..n-1.
			const regionOfQueen = new Set(p.solution.map((c, r) => p.regions[r][c]));
			expect(regionOfQueen.size).toBe(n);
			const ids = new Set<number>();
			for (let r = 0; r < n; r++)
				for (let c = 0; c < n; c++) {
					expect(p.regions[r][c]).toBeGreaterThanOrEqual(0);
					ids.add(p.regions[r][c]);
				}
			expect(ids.size).toBe(n);

			// Exactly one solution.
			expect(countSolutions(p.regions, n, 2)).toBe(1);
		});
	}

	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: every board has a guess-free logical path`, () => {
			// Many seeds: the logic filter must hold, not just on a lucky draw.
			for (let s = 0; s < 15; s++) {
				const p = generateReines(diff, mulberry32(5000 + s * 37 + diff.size));
				const tier = diff.size >= 8 ? 4 : 3;
				const derived = solveByLogic(p.regions, p.size, tier);
				expect(derived).not.toBeNull();
				expect(derived).toEqual(p.solution);
				expect(countSolutions(p.regions, p.size, 2)).toBe(1);
			}
		});
	}

	it('solveByLogic rejects a multi-solution board', () => {
		// Region = column: every non-adjacent permutation is a valid solution.
		const n = 6;
		const regions = Array.from({ length: n }, () => Array.from({ length: n }, (_, c) => c));
		expect(countSolutions(regions, n, 2)).toBe(2);
		expect(solveByLogic(regions, n, 4)).toBeNull();
	});

	it('is deterministic: same seed -> identical puzzle', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateReines(DIFFS.moyen, mulberry32(seed));
		const b = generateReines(DIFFS.moyen, mulberry32(seed));
		expect(a.regions).toEqual(b.regions);
		expect(a.solution).toEqual(b.solution);
	});
});

describe('reines conflict detection', () => {
	// Reconstruction of the user's screenshot (6×6).
	// ids: yellow0 pink1 orange2 green3 blue4 teal5. Queens at (4,3) and (5,5).
	const queens: [number, number][] = [
		[4, 3],
		[5, 5],
	];

	it('distinct regions, different row/col, non-adjacent -> NO conflict', () => {
		// Reading A: (5,5) is teal (its own region), (4,3) is blue.
		const regionsA = [
			[0, 1, 1, 2, 2, 2],
			[0, 0, 0, 2, 2, 2],
			[0, 0, 0, 2, 2, 2],
			[0, 0, 3, 3, 2, 2],
			[3, 3, 3, 4, 4, 5],
			[3, 3, 3, 4, 4, 5],
		];
		expect(findConflicts(regionsA, queens).cells.size).toBe(0);
	});

	it('same (wrapping) region -> conflict, reason "zone"', () => {
		// Reading B: the blue region wraps down to (5,5); teal is only (4,5).
		const regionsB = [
			[0, 1, 1, 2, 2, 2],
			[0, 0, 0, 2, 2, 2],
			[0, 0, 0, 2, 2, 2],
			[0, 0, 3, 3, 2, 2],
			[3, 3, 3, 4, 4, 5],
			[3, 3, 3, 4, 4, 4],
		];
		const c = findConflicts(regionsB, queens);
		expect(c.cells.has('4,3')).toBe(true);
		expect(c.cells.has('5,5')).toBe(true);
		expect([...c.reasons]).toEqual(['zone']);
		expect(c.regions.has(4)).toBe(true);
	});

	it('flags row, column and adjacency too', () => {
		const reg = Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, () => r));
		// same row
		expect([...findConflicts(reg, [[0, 0], [0, 2]]).reasons]).toEqual(['ligne']);
		// same column (different regions since region = row index)
		expect([...findConflicts(reg, [[0, 1], [2, 1]]).reasons]).toEqual(['colonne']);
		// diagonal contact, different rows/cols/regions
		expect([...findConflicts(reg, [[0, 0], [1, 1]]).reasons]).toEqual(['contact']);
	});

	it('ignores out-of-bounds queens (no undefined-equality false positive)', () => {
		const reg = [
			[0, 1],
			[2, 3],
		];
		// Both out of bounds, not adjacent / same row / col: undefined===undefined must NOT fire "zone".
		expect(findConflicts(reg, [[5, 5], [8, 2]]).cells.size).toBe(0);
		// One valid, one out of bounds, not adjacent -> no conflict.
		expect(findConflicts(reg, [[0, 0], [9, 9]]).cells.size).toBe(0);
	});

	it('a uniquely-placed solution never conflicts', () => {
		for (const key of Object.keys(DIFFS)) {
			const p = generateReines(DIFFS[key], mulberry32(13 + DIFFS[key].size));
			const sol: [number, number][] = p.solution.map((c, r) => [r, c]);
			expect(findConflicts(p.regions, sol).cells.size).toBe(0);
		}
	});
});

describe('reines findHint', () => {
	const emptyMarks = (n: number): CellState[][] =>
		Array.from({ length: n }, () => new Array(n).fill(0) as CellState[]);

	it('placing a hint queen keeps the crosses of that row', () => {
		const p = generateReines(DIFFS.facile, mulberry32(77));
		const n = p.size;
		const marks = emptyMarks(n);
		const target = p.solution[0];
		// Cross every other cell of row 0, plus a queen to be replaced.
		for (let c = 0; c < n; c++) if (c !== target) marks[0][c] = 1;
		const wrong = (target + 2) % n;
		marks[0][wrong] = 2;

		const next = applyHint(marks, { r: 0, c: target, value: 'queen', reason: '' });
		expect(next[0][target]).toBe(2);
		expect(next[0][wrong]).toBe(0); // the other queen of the row is dropped
		for (let c = 0; c < n; c++)
			if (c !== target && c !== wrong) expect(next[0][c]).toBe(1); // crosses survive
		expect(marks[0][target]).toBe(0); // input grid untouched (pure)
	});

	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: hints solve the grid, every queen on the solution`, () => {
			const p = generateReines(diff, mulberry32(200 + diff.size));
			const n = p.size;
			let marks = emptyMarks(n);

			// Repeatedly apply hints until all solution queens are placed.
			const cap = n * n * 4; // generous safety bound vs. infinite loop
			let placed = 0;
			for (let step = 0; step < cap; step++) {
				placed = 0;
				for (let r = 0; r < n; r++) if (marks[r][p.solution[r]] === 2) placed++;
				if (placed === n) break;

				const h = findHint(marks, p);
				expect(h).not.toBeNull();
				if (!h) break;

				// Any proposed queen must sit on the solution.
				if (h.value === 'queen') expect(p.solution[h.r]).toBe(h.c);
				// Any proposed cross must NOT be a solution queen cell.
				if (h.value === 'cross') expect(p.solution[h.r] === h.c).toBe(false);
				// Generated boards have a full logical path: the unjustified
				// "reveal" fallback must never fire.
				expect(h.reason).not.toBe('La reine de cette ligne va ici.');

				marks = applyHint(marks, h);
			}

			expect(placed).toBe(n);
			// Final placement matches the solution exactly, row by row.
			for (let r = 0; r < n; r++) expect(marks[r][p.solution[r]]).toBe(2);
		});
	}

	it('corrects a misplaced queen back to the solution cell', () => {
		const p = generateReines(DIFFS.facile, mulberry32(321));
		const n = p.size;
		const marks = emptyMarks(n);

		// Put a queen on row 0 at a wrong column (anything but the solution).
		const wrong = (p.solution[0] + 1) % n;
		marks[0][wrong] = 2;

		const h = findHint(marks, p);
		expect(h).not.toBeNull();
		expect(h!.value).toBe('queen');
		expect(h!.r).toBe(0);
		expect(h!.c).toBe(p.solution[0]); // proposes the correct cell of that row
		expect(h!.reason).toContain('mal placée');
	});

	it('returns null once every queen is placed and every other cell crossed', () => {
		const p = generateReines(DIFFS.facile, mulberry32(99));
		const n = p.size;
		const marks = emptyMarks(n);
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++) marks[r][c] = (p.solution[r] === c ? 2 : 1) as CellState;
		expect(findHint(marks, p)).toBeNull();
	});

	it('emits crosses for attacked empties after all queens are placed', () => {
		const p = generateReines(DIFFS.facile, mulberry32(99));
		const n = p.size;
		const marks = emptyMarks(n);
		for (let r = 0; r < n; r++) marks[r][p.solution[r]] = 2;
		const h = findHint(marks, p);
		expect(h).not.toBeNull();
		expect(h!.value).toBe('cross');
		expect(p.solution[h!.r] === h!.c).toBe(false);
	});
});
