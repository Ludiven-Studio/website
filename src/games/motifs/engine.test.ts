import { describe, it, expect } from 'vitest';
import { DIFFS, generateMotifs, countSolutions, shapeOf } from './engine';
import { mulberry32 } from '../prng';

describe('motifs engine', () => {
	it('generates a uniquely-solvable puzzle for every difficulty', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const p = generateMotifs(diff, mulberry32(9000 + diff.size));
			expect(countSolutions(p.clues, p.size), `"${key}" unique`).toBe(1);
		}
	});

	it('rectangles tile the whole grid without gaps or overlaps', () => {
		const p = generateMotifs(DIFFS.moyen, mulberry32(2024));
		const { size, rects, solution } = p;
		const seen = Array.from({ length: size }, () => new Array(size).fill(0));
		rects.forEach((rect) => {
			for (let r = rect.r0; r < rect.r0 + rect.h; r++)
				for (let c = rect.c0; c < rect.c0 + rect.w; c++) seen[r][c]++;
		});
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) {
				expect(seen[r][c], `cell ${r},${c} covered once`).toBe(1);
				expect(solution[r][c]).toBeGreaterThanOrEqual(0);
			}
	});

	it('each rectangle holds exactly one clue, matching its real shape/area', () => {
		const p = generateMotifs(DIFFS.facile, mulberry32(55));
		const { rects, clues } = p;
		// exactly one clue per rect (clues indexed by piece id)
		expect(clues.length).toBe(rects.length);
		clues.forEach((clue, id) => {
			const rect = rects[id];
			const inside =
				clue.r >= rect.r0 && clue.r < rect.r0 + rect.h &&
				clue.c >= rect.c0 && clue.c < rect.c0 + rect.w;
			expect(inside, `clue ${id} sits inside its rect`).toBe(true);
			if (clue.area != null) expect(clue.area).toBe(rect.h * rect.w);
			if (clue.shape !== 'any') expect(clue.shape).toBe(shapeOf(rect.h, rect.w));
		});
	});
});
