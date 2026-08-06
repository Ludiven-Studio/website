import { describe, it, expect } from 'vitest';
import {
	BIT,
	DIFFS,
	applyHint,
	danglingSides,
	findHint,
	generateCircuit,
	isSolved,
	litCells,
	neighbour,
	parTurns,
	rotCW,
	rotate,
	turnsTo,
	type CircuitPuzzle,
} from './engine';
import { mulberry32, dateSeed } from '../prng';

const popcount = (m: number): number => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

const OPP = [2, 3, 0, 1];

describe('circuit tiles', () => {
	it('four quarter-turns are the identity', () => {
		for (let m = 0; m < 16; m++) {
			expect(rotate(m, 4)).toBe(m);
			expect(rotCW(rotCW(rotCW(rotCW(m))))).toBe(m);
			expect(rotate(m, -1)).toBe(rotate(m, 3));
		}
	});

	it('rotation moves each arm one side clockwise', () => {
		expect(rotCW(BIT[0])).toBe(BIT[1]); // N -> E
		expect(rotCW(BIT[3])).toBe(BIT[0]); // W -> N
		expect(rotCW(0b0101)).toBe(0b1010); // vertical straight -> horizontal
		expect(rotCW(0b1111)).toBe(0b1111); // the cross is its own rotation
	});

	it('turnsTo gives the shortest way round', () => {
		expect(turnsTo(BIT[0], BIT[0])).toBe(0);
		expect(turnsTo(BIT[0], BIT[1])).toBe(1);
		expect(turnsTo(BIT[0], BIT[3])).toBe(3);
		expect(turnsTo(0b0101, 0b0101)).toBe(0); // straight: two turns are a no-op
		expect(turnsTo(0b1111, 0b1111)).toBe(0);
	});
});

describe('circuit neighbours', () => {
	it('falls off a plain grid', () => {
		expect(neighbour(0, 0, 4, false)).toBe(-1); // north of the top-left corner
		expect(neighbour(0, 3, 4, false)).toBe(-1); // west of it
		expect(neighbour(0, 1, 4, false)).toBe(1);
		expect(neighbour(0, 2, 4, false)).toBe(4);
	});

	it('wraps round a looping grid', () => {
		expect(neighbour(0, 0, 4, true)).toBe(12); // north of row 0 is row 3
		expect(neighbour(0, 3, 4, true)).toBe(3); // west of column 0 is column 3
		expect(neighbour(15, 2, 4, true)).toBe(3);
		expect(neighbour(15, 1, 4, true)).toBe(12);
	});

	it('is symmetric on both grids', () => {
		for (const wrap of [false, true])
			for (let i = 0; i < 25; i++)
				for (let d = 0; d < 4; d++) {
					const nb = neighbour(i, d, 5, wrap);
					if (nb >= 0) expect(neighbour(nb, OPP[d], 5, wrap)).toBe(i);
				}
	});
});

/** The generated solution must be a spanning tree of the whole grid. */
function expectSpanningTree(p: CircuitPuzzle): void {
	const total = p.size * p.size;
	let arms = 0;
	for (let i = 0; i < total; i++) {
		expect(p.solution[i]).toBeGreaterThan(0); // no orphan tile
		arms += popcount(p.solution[i]);
		for (let d = 0; d < 4; d++) {
			if (!(p.solution[i] & BIT[d])) continue;
			const nb = neighbour(i, d, p.size, p.wrap);
			expect(nb).toBeGreaterThanOrEqual(0); // never points off the grid
			expect(p.solution[nb] & BIT[OPP[d]]).toBeTruthy(); // the neighbour answers
		}
	}
	expect(arms).toBe(2 * (total - 1)); // exactly total-1 links…
	expect(litCells(p.solution, p.size, p.wrap, p.source).every(Boolean)).toBe(true); // …and connected
	expect(isSolved(p.solution, p.size, p.wrap, p.source)).toBe(true);
}

describe('circuit generation', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: the solution is a spanning tree of the grid`, () => {
			for (let s = 0; s < 25; s++) expectSpanningTree(generateCircuit(diff, mulberry32(400 + s * 29 + diff.size)));
		});

		it(`${diff.label}: the dealt board is a rotation of the solution, never already solved`, () => {
			for (let s = 0; s < 25; s++) {
				const p = generateCircuit(diff, mulberry32(9000 + s * 41 + diff.size));
				expect(isSolved(p.start, p.size, p.wrap, p.source)).toBe(false);
				for (let i = 0; i < p.start.length; i++) {
					expect([0, 1, 2, 3].map((t) => rotate(p.start[i], t))).toContain(p.solution[i]);
					expect(popcount(p.start[i])).toBe(popcount(p.solution[i]));
				}
				expect(parTurns(p.start, p.solution)).toBeGreaterThan(0);
				expect(parTurns(p.solution, p.solution)).toBe(0);
			}
		});
	}

	it('is deterministic: same seed -> identical puzzle', () => {
		const seed = dateSeed(new Date('2026-08-06T00:00:00Z'));
		const a = generateCircuit(DIFFS.moyen, mulberry32(seed));
		const b = generateCircuit(DIFFS.moyen, mulberry32(seed));
		expect(a.solution).toEqual(b.solution);
		expect(a.start).toEqual(b.start);
		expect(a.source).toBe(b.source);
	});

	it('only Expert loops on itself', () => {
		expect(DIFFS.expert.wrap).toBe(true);
		for (const k of ['facile', 'moyen', 'difficile']) expect(DIFFS[k].wrap).toBe(false);
	});
});

describe('circuit win check', () => {
	it('a loose end is not a win, even with everything lit', () => {
		const p = generateCircuit(DIFFS.facile, mulberry32(4242));
		const masks = p.solution.slice();
		// Add an arm nobody answers: pick a tile that is not already a cross.
		const i = masks.findIndex((m) => m !== 15);
		const free = [0, 1, 2, 3].find((d) => !(masks[i] & BIT[d])) as number;
		masks[i] |= BIT[free];
		expect(danglingSides(masks, i, p.size, p.wrap)).toContain(free);
		expect(isSolved(masks, p.size, p.wrap, p.source)).toBe(false);
	});

	it('a network cut off from the generator is not a win', () => {
		const p = generateCircuit(DIFFS.facile, mulberry32(1234));
		const masks = p.solution.slice();
		// Sever one link from the source: both sides drop it, so no end dangles.
		const d = [0, 1, 2, 3].find((x) => masks[p.source] & BIT[x]) as number;
		const nb = neighbour(p.source, d, p.size, p.wrap);
		masks[p.source] &= ~BIT[d];
		masks[nb] &= ~BIT[OPP[d]];
		expect(danglingSides(masks, p.source, p.size, p.wrap)).toEqual([]);
		expect(isSolved(masks, p.size, p.wrap, p.source)).toBe(false);
	});

	it('lights only what the generator actually feeds', () => {
		const p = generateCircuit(DIFFS.moyen, mulberry32(77));
		const lit = litCells(p.start, p.size, p.wrap, p.source);
		expect(lit[p.source]).toBe(true);
		expect(lit.every(Boolean)).toBe(false); // the dealt board is never complete
	});
});

describe('circuit hints', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: hints finish the board, one tile at a time`, () => {
			for (let s = 0; s < 4; s++) {
				const p = generateCircuit(diff, mulberry32(600 + s * 13 + diff.size));
				let masks = p.start.slice();
				const cap = p.size * p.size + 1;
				let steps = 0;
				while (!isSolved(masks, p.size, p.wrap, p.source)) {
					const h = findHint(masks, p);
					expect(h).not.toBeNull();
					if (!h) break;
					expect(masks[h.idx]).not.toBe(p.solution[h.idx]); // never a tile already in place
					expect(h.turns).toBeGreaterThanOrEqual(1);
					expect(h.turns).toBeLessThanOrEqual(3);
					expect(rotate(masks[h.idx], h.turns)).toBe(h.mask);
					expect(h.reason.length).toBeGreaterThan(0);
					masks = applyHint(masks, h);
					expect(++steps).toBeLessThanOrEqual(cap);
				}
				expect(isSolved(masks, p.size, p.wrap, p.source)).toBe(true);
			}
		});
	}

	it('returns null once the network is complete', () => {
		const p = generateCircuit(DIFFS.facile, mulberry32(21));
		expect(findHint(p.solution.slice(), p)).toBeNull();
	});

	it('leaves the caller grid untouched', () => {
		const p = generateCircuit(DIFFS.facile, mulberry32(33));
		const masks = p.start.slice();
		const h = findHint(masks, p);
		expect(h).not.toBeNull();
		const next = applyHint(masks, h!);
		expect(masks).toEqual(p.start);
		expect(next[h!.idx]).toBe(h!.mask);
	});
});
