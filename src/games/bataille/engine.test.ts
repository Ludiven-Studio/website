import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed } from '../prng';
import {
	SIZES,
	DIFFS,
	generateBataille,
	countSolutions,
	segType,
	findHint,
	proximity,
	type Mark,
	type BataillePuzzle,
} from './engine';

const emptyMarks = (n: number): Mark[][] =>
	Array.from({ length: n }, () => new Array<Mark>(n).fill(0));

// Effective ship grid: given ship OR player ship.
const effShips = (marks: Mark[][], p: BataillePuzzle): boolean[][] =>
	p.solution.map((row, r) =>
		row.map((_, c) => p.given[r][c] === 'ship' || marks[r][c] === 1),
	);

const allShipsMarked = (marks: Mark[][], p: BataillePuzzle): boolean => {
	const eff = effShips(marks, p);
	for (let r = 0; r < p.size; r++)
		for (let c = 0; c < p.size; c++) if (p.solution[r][c] && !eff[r][c]) return false;
	return true;
};

const noTouch = (grid: boolean[][]): boolean => {
	const n = grid.length;
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++)
			if (grid[r][c])
				// only diagonal contact is forbidden between distinct ships; here we just
				// assert no diagonal ship neighbour (ships never touch diagonally)
				for (const [dr, dc] of [
					[-1, -1],
					[-1, 1],
					[1, -1],
					[1, 1],
				])
					if (grid[r + dr]?.[c + dc]) return false;
	return true;
};

describe('bataille engine', () => {
	for (const sk of Object.keys(SIZES)) {
		const sl = SIZES[sk];
		it(`${sk}: generates a uniquely-solvable puzzle`, () => {
			for (let s = 0; s < 4; s++) {
				const p = generateBataille(sl, DIFFS.difficile, mulberry32(9000 + s * 37 + sl.size));
				let ships = 0;
				for (let r = 0; r < p.size; r++)
					for (let c = 0; c < p.size; c++) if (p.solution[r][c]) ships++;
				expect(ships).toBe(sl.fleet.reduce((a, b) => a + b, 0));
				expect(noTouch(p.solution)).toBe(true);
				// Every clue sits on water and reports the true 8-neighbour ship count.
				for (const cl of p.clues) {
					expect(p.solution[cl.r][cl.c]).toBe(false);
					expect(p.given[cl.r][cl.c]).toBe('water');
					expect(cl.n).toBe(proximity(p.solution, cl.r, cl.c, p.size));
				}
				expect(countSolutions(p.size, p.fleet, p.clues, p.given, 2)).toBe(1);
			}
		}, 20000);
	}

	it('segType reads ship shapes', () => {
		const p = generateBataille(SIZES['5'], DIFFS.facile, mulberry32(321));
		for (let r = 0; r < p.size; r++)
			for (let c = 0; c < p.size; c++) {
				const s = segType(p.solution, r, c);
				if (p.solution[r][c]) expect(s).not.toBeNull();
				else expect(s).toBeNull();
			}
	});

	for (const sk of Object.keys(SIZES)) {
		const sl = SIZES[sk];
		it(`${sk}: findHint solves from empty marks, always proposing solution-correct cells`, () => {
			for (let s = 0; s < 3; s++) {
				const p = generateBataille(sl, DIFFS.difficile, mulberry32(7100 + s * 53 + sl.size));
				const marks = emptyMarks(p.size);
				let steps = 0;
				const maxSteps = p.size * p.size + 5;
				while (!allShipsMarked(marks, p) && steps < maxSteps) {
					const h = findHint(marks, p);
					expect(h).not.toBeNull();
					if (!h) break;
					expect(h.cells.length).toBeGreaterThan(0);
					expect(typeof h.reason).toBe('string');
					expect(h.reason.length).toBeGreaterThan(0);
					for (const { r, c } of h.cells) {
						// Target is free (never a given), and currently undecided.
						expect(p.given[r][c]).toBeNull();
						expect(marks[r][c]).toBe(0);
						// Proposed value must agree with the solution.
						const want: 'ship' | 'water' = p.solution[r][c] ? 'ship' : 'water';
						expect(h.value).toBe(want);
						marks[r][c] = (h.value === 'ship' ? 1 : 2) as Mark;
					}
					steps++;
				}
				expect(allShipsMarked(marks, p)).toBe(true);
				// Every cell now agrees with the solution (ships and water both correct).
				for (let r = 0; r < p.size; r++)
					for (let c = 0; c < p.size; c++) {
						const eff = p.given[r][c] === 'ship' || marks[r][c] === 1;
						expect(eff).toBe(p.solution[r][c]);
					}
			}
		}, 20000);
	}

	it('findHint corrects a wrong player mark', () => {
		const p = generateBataille(SIZES['6'], DIFFS.difficile, mulberry32(8123));
		// Find a free water cell (solution false) and mark it as a ship → must be corrected.
		let target: [number, number] | null = null;
		for (let r = 0; r < p.size && !target; r++)
			for (let c = 0; c < p.size && !target; c++)
				if (p.given[r][c] === null && !p.solution[r][c]) target = [r, c];
		expect(target).not.toBeNull();
		const [wr, wc] = target!;
		const marks = emptyMarks(p.size);
		marks[wr][wc] = 1; // wrong: ship where solution is water
		const h = findHint(marks, p);
		expect(h).not.toBeNull();
		expect(h!.cells).toEqual([{ r: wr, c: wc }]);
		expect(h!.value).toBe('water');
	});

	it('findHint corrects a wrong water mark (should be ship)', () => {
		const p = generateBataille(SIZES['6'], DIFFS.difficile, mulberry32(8456));
		let target: [number, number] | null = null;
		for (let r = 0; r < p.size && !target; r++)
			for (let c = 0; c < p.size && !target; c++)
				if (p.given[r][c] === null && p.solution[r][c]) target = [r, c];
		expect(target).not.toBeNull();
		const [wr, wc] = target!;
		const marks = emptyMarks(p.size);
		marks[wr][wc] = 2; // wrong: water where solution is ship
		const h = findHint(marks, p);
		expect(h).not.toBeNull();
		expect(h!.cells).toEqual([{ r: wr, c: wc }]);
		expect(h!.value).toBe('ship');
	});

	it('findHint returns null once solved', () => {
		const p = generateBataille(SIZES['6'], DIFFS.difficile, mulberry32(8789));
		const marks = emptyMarks(p.size);
		for (let r = 0; r < p.size; r++)
			for (let c = 0; c < p.size; c++)
				if (p.given[r][c] === null) marks[r][c] = (p.solution[r][c] ? 1 : 2) as Mark;
		expect(findHint(marks, p)).toBeNull();
	});

	it('a clue marked 0 makes all its neighbours water in a single hint', () => {
		// Single 2-ship in the top-left; a "0" clue at (3,3) far from any ship.
		const p: BataillePuzzle = {
			size: 4,
			fleet: [2],
			solution: [
				[true, true, false, false],
				[false, false, false, false],
				[false, false, false, false],
				[false, false, false, false],
			],
			clues: [{ r: 3, c: 3, n: 0 }],
			given: [
				[null, null, null, null],
				[null, null, null, null],
				[null, null, null, null],
				[null, null, null, 'water'],
			] as BataillePuzzle['given'],
		};
		const h = findHint(emptyMarks(4), p)!;
		expect(h).not.toBeNull();
		expect(h.value).toBe('water');
		// More than one cell at once (all orthogonal neighbours of the 0 clue).
		expect(h.cells.length).toBeGreaterThan(1);
		for (const { r, c } of h.cells) expect(p.solution[r][c]).toBe(false);
		// The two in-bounds orthogonal neighbours of (3,3) are proposed (not the diagonal (2,2)).
		const has = (r: number, c: number) => h.cells.some((x) => x.r === r && x.c === c);
		expect(has(2, 3) && has(3, 2)).toBe(true);
		expect(has(2, 2)).toBe(false);
	});

	it('easier levels reveal at least as many clues', () => {
		const g = (k: keyof typeof DIFFS) =>
			generateBataille(SIZES['6'], DIFFS[k], mulberry32(4242)).clues.length;
		expect(g('facile')).toBeGreaterThanOrEqual(g('difficile'));
	});

	it('is reproducible from a seed (daily challenge)', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateBataille(SIZES['7'], DIFFS.moyen, mulberry32(seed));
		const b = generateBataille(SIZES['7'], DIFFS.moyen, mulberry32(seed));
		expect(a.solution).toEqual(b.solution);
		expect(a.clues).toEqual(b.clues);
	});
});
