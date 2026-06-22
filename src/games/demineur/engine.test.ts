import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed } from '../prng';
import {
	SIZES,
	DIFFS,
	generateDemineur,
	solve,
	findHint,
	reveal,
	revealSolution,
	isWin,
	isLose,
	emptyState,
	FLAGGED,
	REVEALED,
	type DemineurPuzzle,
	type PlayerGrid,
} from './engine';

const countMines = (p: DemineurPuzzle): number =>
	p.mines.reduce((a, row) => a + row.filter(Boolean).length, 0);

const revealedCount = (s: PlayerGrid): number =>
	s.reduce((a, row) => a + row.filter((v) => v === REVEALED).length, 0);

describe('demineur engine', () => {
	for (const key of Object.keys(SIZES)) {
		const sl = SIZES[key];
		const diff = DIFFS[key];
		it(`${key}: generates a no-guess solvable board`, () => {
			for (let s = 0; s < 4; s++) {
				const p = generateDemineur(sl, diff, mulberry32(5000 + s * 41 + sl.size));
				// Start is safe and opens a cascade.
				expect(p.mines[p.start.r][p.start.c]).toBe(false);
				expect(p.adjacent[p.start.r][p.start.c]).toBe(0);
				const opened = reveal(emptyState(p.size), p, p.start);
				expect(revealedCount(opened)).toBeGreaterThan(1);
				// The full technique set always solves it (no guessing).
				expect(solve(p, { useSubset: true, useEnum: true }).solved).toBe(true);
			}
		}, 20000);
	}

	it('mine count matches the requested density (no fallback for these seeds)', () => {
		const sl = SIZES.facile;
		const p = generateDemineur(sl, DIFFS.facile, mulberry32(12345));
		expect(countMines(p)).toBe(sl.mines);
	});

	it('is reproducible from a seed (daily challenge)', () => {
		const seed = dateSeed(new Date('2026-06-22T00:00:00Z'));
		const a = generateDemineur(SIZES.moyen, DIFFS.moyen, mulberry32(seed));
		const b = generateDemineur(SIZES.moyen, DIFFS.moyen, mulberry32(seed));
		expect(a.mines).toEqual(b.mines);
		expect(a.adjacent).toEqual(b.adjacent);
		expect(a.start).toEqual(b.start);
	});

	for (const key of Object.keys(SIZES)) {
		const sl = SIZES[key];
		const diff = DIFFS[key];
		it(`${key}: findHint solves from the opening to a win`, () => {
			for (let s = 0; s < 3; s++) {
				const p = generateDemineur(sl, diff, mulberry32(8800 + s * 53 + sl.size));
				let state = reveal(emptyState(p.size), p, p.start);
				let steps = 0;
				const maxSteps = p.size * p.size + 5;
				while (!isWin(state, p) && steps < maxSteps) {
					const h = findHint(state, p);
					expect(h).not.toBeNull();
					if (!h) break;
					expect(h.cells.length).toBeGreaterThan(0);
					expect(h.reason.length).toBeGreaterThan(0);
					for (const { r, c } of h.cells) {
						const isMine = p.mines[r][c];
						expect(h.value).toBe(isMine ? 'mine' : 'safe');
						if (h.value === 'safe') state = reveal(state, p, { r, c });
						else {
							state = state.map((row) => row.slice());
							state[r][c] = FLAGGED;
						}
					}
					steps++;
				}
				expect(isWin(state, p)).toBe(true);
				expect(isLose(state, p)).toBe(false);
			}
		}, 20000);
	}

	it('findHint corrects a wrongly placed flag', () => {
		const p = generateDemineur(SIZES.facile, DIFFS.facile, mulberry32(2024));
		// Flag a non-mine cell → must be corrected to 'safe'.
		let target: [number, number] | null = null;
		for (let r = 0; r < p.size && !target; r++)
			for (let c = 0; c < p.size && !target; c++) if (!p.mines[r][c]) target = [r, c];
		const [fr, fc] = target!;
		const state = emptyState(p.size);
		state[fr][fc] = FLAGGED;
		const h = findHint(state, p);
		expect(h).not.toBeNull();
		expect(h!.value).toBe('safe');
		expect(h!.cells).toEqual([{ r: fr, c: fc }]);
	});

	it('win/lose detection', () => {
		const p = generateDemineur(SIZES.facile, DIFFS.facile, mulberry32(777));
		const sol = revealSolution(p);
		expect(isWin(sol, p)).toBe(true);
		expect(isLose(sol, p)).toBe(false);
		// Reveal a mine → lose.
		let mineCell: [number, number] | null = null;
		for (let r = 0; r < p.size && !mineCell; r++)
			for (let c = 0; c < p.size && !mineCell; c++) if (p.mines[r][c]) mineCell = [r, c];
		const [mr, mc] = mineCell!;
		const lost = reveal(emptyState(p.size), p, { r: mr, c: mc });
		expect(isLose(lost, p)).toBe(true);
	});
});
