import { describe, it, expect } from 'vitest';
import {
	DIFFS,
	generateWaterSort,
	findSolution,
	findHint,
	applyMove,
	legalMove,
	isSolved,
	topBlock,
	type Tube,
} from './engine';
import { mulberry32 } from '../prng';

describe('tubes engine', () => {
	it('generates a solvable puzzle with correct colour counts for every difficulty', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const p = generateWaterSort(diff, mulberry32(5000 + diff.colors));
			expect(p.tubesCount, `${key} tube count`).toBe(diff.colors + diff.empties);
			// each colour appears exactly `height` times, nothing else
			const counts = new Map<number, number>();
			for (const t of p.tubes) for (const c of t) counts.set(c, (counts.get(c) || 0) + 1);
			expect(counts.size).toBe(diff.colors);
			for (const [, n] of counts) expect(n).toBe(diff.height);
			// not already solved, and solvable
			expect(isSolved(p.tubes, diff.height)).toBe(false);
			expect(findSolution(p.tubes, diff.height)).not.toBeNull();
		}
	});

	it('is deterministic for a given seed', () => {
		const a = generateWaterSort(DIFFS.moyen, mulberry32(999));
		const b = generateWaterSort(DIFFS.moyen, mulberry32(999));
		expect(a.tubes).toEqual(b.tubes);
	});

	it('legalMove / applyMove move the whole top block, capped by room', () => {
		const height = 4;
		const tubes: Tube[] = [[1, 1, 2, 2], [2], []];
		expect(legalMove(tubes, 0, 1, height)).toBe(true); // top 2,2 onto 2
		expect(legalMove(tubes, 0, 2, height)).toBe(true); // onto empty
		expect(legalMove(tubes, 1, 0, height)).toBe(false); // tube 0 is full → no room
		const next = applyMove(tubes, { from: 0, to: 1 }, height);
		expect(next[0]).toEqual([1, 1]);
		expect(next[1]).toEqual([2, 2, 2]); // moved both 2s
		// cap by room: only 1 slot free
		const tight: Tube[] = [[3, 3, 3], [5, 5, 5]];
		const capped = applyMove(tight, { from: 1, to: 0 }, 4);
		expect(capped[0]).toEqual([3, 3, 3, 5]);
		expect(capped[1]).toEqual([5, 5]);
	});

	it('topBlock counts the contiguous top colour', () => {
		expect(topBlock([1, 2, 2, 2])).toBe(3);
		expect(topBlock([2, 2, 1, 2])).toBe(1);
		expect(topBlock([])).toBe(0);
	});

	it('findHint always returns a legal move and solves the puzzle when followed', () => {
		const p = generateWaterSort(DIFFS.facile, mulberry32(2026));
		let tubes = p.tubes.map((t) => t.slice());
		let guard = 0;
		while (!isSolved(tubes, p.height) && guard++ < 500) {
			const h = findHint(tubes, p.height);
			expect(h, 'hint available while unsolved').not.toBeNull();
			expect(legalMove(tubes, h!.from, h!.to, p.height)).toBe(true);
			tubes = applyMove(tubes, { from: h!.from, to: h!.to }, p.height);
		}
		expect(isSolved(tubes, p.height)).toBe(true);
	});

	it('isSolved accepts empty or single-colour-full tubes only', () => {
		expect(isSolved([[1, 1, 1, 1], [], [2, 2, 2, 2]], 4)).toBe(true);
		expect(isSolved([[1, 1, 1, 2]], 4)).toBe(false);
		expect(isSolved([[1, 1, 1]], 4)).toBe(false); // not full
	});
});
