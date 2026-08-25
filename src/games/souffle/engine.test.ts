import { describe, it, expect } from 'vitest';
import {
	SOUFFLE_BANDS,
	applyGust,
	flowersLeft,
	generateSouffle,
	glide,
	isWon,
	openDirs,
	startState,
	type Dir,
	type SoufflePuzzle,
} from './engine';
import { mulberry32 } from '../prng';

/** '.' meadow · 'O' rock · 'P' feather. Flowers come as a second block, '*'. */
function make(rows: string[], blooms: string[] = []): SoufflePuzzle {
	const n = rows.length;
	const cells = rows.join('');
	const rocks = Array.from(cells, (ch) => ch === 'O');
	const start = cells.indexOf('P');
	const flowers = blooms.length
		? Array.from(blooms.join(''), (ch) => ch === '*')
		: new Array<boolean>(n * n).fill(false);
	return { n, rocks, flowers, start, par: 0, walk: [] };
}

describe('souffle — glide', () => {
	it('runs to the hedge and lists every cell crossed, landing last', () => {
		const p = make(['P...', '....', '....', '....']);
		expect(glide(p.n, p.rocks, p.start, 1)).toEqual([1, 2, 3]);
		expect(glide(p.n, p.rocks, p.start, 2)).toEqual([4, 8, 12]);
	});

	it('stops on the cell before a rock', () => {
		const p = make(['P..O', '....', '....', '....']);
		expect(glide(p.n, p.rocks, p.start, 1)).toEqual([1, 2]);
	});

	it('is empty when the very first cell is blocked — that gust is refused', () => {
		const p = make(['PO..', '....', '....', '....']);
		expect(glide(p.n, p.rocks, p.start, 1)).toEqual([]);
		expect(glide(p.n, p.rocks, p.start, 0)).toEqual([]); // the hedge, right above
	});
});

describe('souffle — gusts', () => {
	it('brushes every flower crossed, landing cell included', () => {
		const p = make(['P..O', '....', '....', '....'], ['.**.', '....', '....', '....']);
		const s = applyGust(p, startState(p), 1);
		expect(s).not.toBeNull();
		expect(s!.pos).toBe(2);
		expect(flowersLeft(s!)).toBe(0);
		expect(s!.gusts).toBe(1);
	});

	it('leaves the flowers off the path alone', () => {
		const p = make(['P...', '....', '....', '....'], ['....', '.*..', '....', '....']);
		const s = applyGust(p, startState(p), 1);
		expect(flowersLeft(s!)).toBe(1);
		expect(isWon(s!)).toBe(false);
	});

	it('returns null on a blocked gust and never touches the old state', () => {
		const p = make(['PO..', '....', '....', '....'], ['....', '*...', '....', '....']);
		const s0 = startState(p);
		expect(applyGust(p, s0, 1)).toBeNull();
		const s1 = applyGust(p, s0, 2);
		expect(s1!.flowers).not.toBe(s0.flowers);
		expect(flowersLeft(s0)).toBe(1); // s0 kept its flower: undo is just keeping old states
	});

	it('names the open dirs, and only those', () => {
		const p = make(['PO..', '....', '....', '....']);
		expect(openDirs(p, p.start)).toEqual([2]);
	});
});

describe('souffle — boards', () => {
	for (const [band, params] of SOUFFLE_BANDS.entries()) {
		it(`band ${band} deals the asked flowers and its walk clears them all`, () => {
			for (let seed = 0; seed < 8; seed++) {
				const p = generateSouffle(mulberry32(900 + seed * 7), params);
				expect(p.flowers.filter(Boolean)).toHaveLength(params.flowers);
				expect(p.flowers[p.start]).toBe(false);
				expect(p.rocks.filter(Boolean)).toHaveLength(params.rocks);
				expect(p.par).toBe(p.walk.length);
				expect(p.par).toBeGreaterThanOrEqual(2);

				let s = startState(p);
				for (const d of p.walk) {
					const next = applyGust(p, s, d as Dir);
					expect(next).not.toBeNull(); // a refused gust would desync the solution
					s = next!;
				}
				expect(isWon(s)).toBe(true);
				expect(s.gusts).toBe(p.par);
			}
		});
	}

	it('is the same board twice from one seed', () => {
		const a = generateSouffle(mulberry32(41), SOUFFLE_BANDS[1]);
		const b = generateSouffle(mulberry32(41), SOUFFLE_BANDS[1]);
		expect(a.rocks).toEqual(b.rocks);
		expect(a.flowers).toEqual(b.flowers);
		expect(a.start).toBe(b.start);
		expect(a.walk).toEqual(b.walk);
	});

	it('the bands climb', () => {
		const par = SOUFFLE_BANDS.map((p, i) => generateSouffle(mulberry32(5 + i), p).par);
		for (let i = 1; i < par.length; i++) expect(par[i]).toBeGreaterThan(par[i - 1]);
	});
});
