import { describe, it, expect } from 'vitest';
import {
	generateBoard, trySwap, findRuns, hasMatch, cagedLeft, findHint,
	isGem, isCage, type Cfg, type Cell, type Gem, type Board,
} from './engine';

const gem = (color: number): Gem => ({ color, id: 0 });
const cage = (hits = 2): Cell => ({ cage: true, hits });
const mk = (grid: Cell[][], cfg: Partial<Cfg> = {}): Board => ({
	grid,
	cfg: { rows: grid.length, cols: grid[0].length, colors: 6, cocottes: 0, cageHits: 2, ...cfg },
});

describe('generateBoard', () => {
	it('produces a board with no initial match, a valid move, and the right cage count', () => {
		const cfg: Cfg = { rows: 8, cols: 8, colors: 6, cocottes: 3, cageHits: 2 };
		const b = generateBoard(12345, cfg);
		expect(hasMatch(b.grid)).toBe(false);
		expect(findHint(b)).not.toBeNull();
		expect(cagedLeft(b.grid)).toBe(3);
		// cages live in the bottom band (rows 5-7 for an 8-row board), none higher
		const cageRows: number[] = [];
		b.grid.forEach((row, r) => { if (row.some(isCage)) cageRows.push(r); });
		expect(cageRows.every((r) => r >= 5)).toBe(true);
	});
});

describe('findRuns / hasMatch', () => {
	it('detects a horizontal run of 3', () => {
		const grid: Cell[][] = [
			[gem(1), gem(1), gem(1), gem(2)],
			[gem(3), gem(4), gem(5), gem(6)],
		];
		expect(hasMatch(grid)).toBe(true);
		const runs = findRuns(grid);
		expect(runs.length).toBe(1);
		expect(runs[0].cells.length).toBe(3);
		expect(runs[0].horizontal).toBe(true);
	});
	it('reports no match when there is none', () => {
		expect(hasMatch([[gem(1), gem(2), gem(3)], [gem(4), gem(5), gem(6)]])).toBe(false);
	});
});

describe('trySwap', () => {
	it('is valid when it forms a match', () => {
		const b = mk([
			[gem(5), gem(1), gem(1)],
			[gem(1), gem(5), gem(5)],
		]);
		const res = trySwap(b, [0, 0], [1, 0]); // row0 becomes 1,1,1
		expect(res.valid).toBe(true);
		expect(res.steps.length).toBeGreaterThanOrEqual(1);
		expect(res.gained).toBeGreaterThan(0);
	});
	it('is invalid (board unchanged) when it forms no match', () => {
		const b = mk([[gem(1), gem(2), gem(3)], [gem(4), gem(5), gem(6)]]);
		const res = trySwap(b, [0, 0], [0, 1]);
		expect(res.valid).toBe(false);
		expect(res.grid).toBe(b.grid);
	});
});

describe('cocotte cages', () => {
	const setup = (cageHits: number) => mk([
		[gem(1), gem(3), gem(4)],
		[gem(2), gem(1), gem(1)],
		[cage(cageHits), gem(5), gem(6)],
	], { cocottes: 1 });

	it('cracks (but does not free) a 2-hit cage adjacent to a match', () => {
		const b = setup(2);
		const res = trySwap(b, [1, 0], [0, 0]); // row1 → 1,1,1, and (1,0) is above the cage
		expect(res.valid).toBe(true);
		expect(res.freed).toBe(0);
		expect(cagedLeft(res.grid)).toBe(1);
	});
	it('frees a 1-hit cage adjacent to a match', () => {
		const b = setup(1);
		const res = trySwap(b, [1, 0], [0, 0]);
		expect(res.valid).toBe(true);
		expect(res.freed).toBe(1);
		expect(cagedLeft(res.grid)).toBe(0);
	});
	it('a freed cocotte leaves an explosive egg that detonates its whole column', () => {
		const b = setup(1); // cage at (2,0), column 0 has 3 rows
		const res = trySwap(b, [1, 0], [0, 0]);
		expect(res.steps.some((s) => s.freedPos.length === 1)).toBe(true);
		// a later beat clears the entire column 0 (the egg blast)
		expect(res.steps.some((s) => s.cleared.filter(([, c]) => c === 0).length >= 3)).toBe(true);
	});
});

describe('specials', () => {
	it('creates a special from a run of 4', () => {
		const b = mk([
			[gem(1), gem(1), gem(2), gem(1)],
			[gem(3), gem(4), gem(1), gem(5)],
		]);
		const res = trySwap(b, [0, 2], [1, 2]); // row0 → 1,1,1,1
		expect(res.valid).toBe(true);
		const hasSpecial = res.steps[0].grid.flat().some((g) => isGem(g) && !!(g as Gem).special);
		expect(hasSpecial).toBe(true);
	});
});

describe('findHint', () => {
	it('returns a swap that is actually valid', () => {
		const b = mk([
			[gem(5), gem(1), gem(1)],
			[gem(1), gem(5), gem(5)],
			[gem(2), gem(3), gem(4)],
		]);
		const h = findHint(b);
		expect(h).not.toBeNull();
		const res = trySwap(b, h!.a, h!.b);
		expect(res.valid).toBe(true);
	});
});
