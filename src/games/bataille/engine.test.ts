import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed } from '../prng';
import {
	DIFFS,
	generateBataille,
	countSolutions,
	segType,
	findHint,
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
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];
		it(`${key}: generates a uniquely-solvable puzzle`, () => {
			for (let s = 0; s < 4; s++) {
				const p = generateBataille(diff, mulberry32(9000 + s * 37 + diff.size));
				// counts match
				const rc = new Array(p.size).fill(0);
				const cc = new Array(p.size).fill(0);
				let ships = 0;
				for (let r = 0; r < p.size; r++)
					for (let c = 0; c < p.size; c++)
						if (p.solution[r][c]) {
							rc[r]++;
							cc[c]++;
							ships++;
						}
				expect(rc).toEqual(p.rowCounts);
				expect(cc).toEqual(p.colCounts);
				expect(ships).toBe(diff.fleet.reduce((a, b) => a + b, 0));
				expect(noTouch(p.solution)).toBe(true);
				expect(countSolutions(p.size, p.fleet, p.rowCounts, p.colCounts, p.given, 2)).toBe(1);
			}
		}, 20000);
	}

	it('segType reads ship shapes', () => {
		const p = generateBataille(DIFFS.facile, mulberry32(321));
		for (let r = 0; r < p.size; r++)
			for (let c = 0; c < p.size; c++) {
				const s = segType(p.solution, r, c);
				if (p.solution[r][c]) expect(s).not.toBeNull();
				else expect(s).toBeNull();
			}
	});

	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];
		it(`${key}: findHint solves from empty marks, always proposing solution-correct cells`, () => {
			for (let s = 0; s < 3; s++) {
				const p = generateBataille(diff, mulberry32(7100 + s * 53 + diff.size));
				const marks = emptyMarks(p.size);
				let steps = 0;
				const maxSteps = p.size * p.size + 5;
				while (!allShipsMarked(marks, p) && steps < maxSteps) {
					const h = findHint(marks, p);
					expect(h).not.toBeNull();
					if (!h) break;
					// Target is free (never a given), and currently undecided.
					expect(p.given[h.r][h.c]).toBeNull();
					expect(marks[h.r][h.c]).toBe(0);
					// Proposed value must agree with the solution.
					const want: 'ship' | 'water' = p.solution[h.r][h.c] ? 'ship' : 'water';
					expect(h.value).toBe(want);
					expect(typeof h.reason).toBe('string');
					expect(h.reason.length).toBeGreaterThan(0);
					marks[h.r][h.c] = (h.value === 'ship' ? 1 : 2) as Mark;
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
		const p = generateBataille(DIFFS.facile, mulberry32(8123));
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
		expect(h!.r).toBe(wr);
		expect(h!.c).toBe(wc);
		expect(h!.value).toBe('water');
	});

	it('findHint corrects a wrong water mark (should be ship)', () => {
		const p = generateBataille(DIFFS.facile, mulberry32(8456));
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
		expect(h!.r).toBe(wr);
		expect(h!.c).toBe(wc);
		expect(h!.value).toBe('ship');
	});

	it('findHint returns null once solved', () => {
		const p = generateBataille(DIFFS.facile, mulberry32(8789));
		const marks = emptyMarks(p.size);
		for (let r = 0; r < p.size; r++)
			for (let c = 0; c < p.size; c++)
				if (p.given[r][c] === null) marks[r][c] = (p.solution[r][c] ? 1 : 2) as Mark;
		expect(findHint(marks, p)).toBeNull();
	});

	it('is reproducible from a seed (daily challenge)', () => {
		const seed = dateSeed(new Date('2026-06-13T00:00:00Z'));
		const a = generateBataille(DIFFS.moyen, mulberry32(seed));
		const b = generateBataille(DIFFS.moyen, mulberry32(seed));
		expect(a.solution).toEqual(b.solution);
		expect(a.given).toEqual(b.given);
	});
});
