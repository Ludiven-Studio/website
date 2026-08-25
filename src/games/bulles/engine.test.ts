import { describe, it, expect } from 'vitest';
import {
	DIFFS,
	DIFF_ORDER,
	MAX_AIM,
	MIN_POP,
	R,
	applyShot,
	boardW,
	centreOf,
	countBubbles,
	dealSurvival,
	descend,
	fly,
	generateBulles,
	gridOf,
	groupAt,
	isLost,
	landings,
	neighbours,
	nextColour,
	orphans,
	palette,
	randomRow,
	ray,
	rowLen,
	shooterOf,
	shotBudget,
	solve,
	type Grid,
} from './engine';
import { mulberry32 } from '../prng';

/** A grid with `filled` full rows of the given colours, read left to right, -1 for a hole. */
function make(cols: number, rows: number, rowsOfColour: number[][]): Grid {
	const g: Grid = { cols, rows, cells: new Int8Array(cols * rows).fill(-1) };
	rowsOfColour.forEach((row, r) => row.forEach((v, c) => (g.cells[r * cols + c] = v)));
	return g;
}

describe('bulles — grid', () => {
	it('odd rows hold one bubble less', () => {
		expect(rowLen(8, 0)).toBe(8);
		expect(rowLen(8, 1)).toBe(7);
	});

	it('neighbourhood is mutual', () => {
		const g = make(6, 6, []);
		for (let r = 0; r < 6; r++) {
			for (let c = 0; c < rowLen(6, r); c++) {
				const k = r * 6 + c;
				for (const n of neighbours(g, k)) expect(neighbours(g, n)).toContain(k);
			}
		}
	});

	it('a neighbour is a bubble away', () => {
		const g = make(6, 6, []);
		for (let k = 0; k < 6 * 6; k++) {
			const a = centreOf(g, k);
			for (const n of neighbours(g, k)) {
				const b = centreOf(g, n);
				expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(2 * R, 6);
			}
		}
	});

	it('a patch is every same colour reachable from the cell', () => {
		const g = make(5, 4, [
			[0, 0, 1, 0, 0],
			[0, 1, 1, 1],
		]);
		expect(groupAt(g, 0).sort((a, b) => a - b)).toEqual([0, 1, 5]);
		expect(groupAt(g, 2).length).toBe(4);
	});
});

describe('bulles — shots', () => {
	it('below three the bubble only sticks', () => {
		const g = make(5, 5, [[2, 0, -1, -1, -1]]);
		const blast = applyShot(g, 2, 0);
		expect(blast.popped).toEqual([]);
		expect(g.cells[2]).toBe(0);
	});

	it('three of a colour come down', () => {
		const g = make(5, 5, [[0, 0, -1, 2, -1]]);
		const blast = applyShot(g, 2, 0);
		expect(blast.popped.length).toBe(MIN_POP);
		expect(g.cells[0]).toBe(-1);
		expect(g.cells[3]).toBe(2); // the odd colour out stays, for now
	});

	it('what the patch was holding falls with it', () => {
		// Row 0 is all 0s; row 1 hangs a lone 1 under it. Pop the row and the 1 has nothing left.
		const g = make(4, 5, [
			[0, 0, -1, -1],
			[1, -1, -1],
		]);
		const blast = applyShot(g, 2, 0);
		expect(blast.popped.length).toBe(3);
		expect(blast.dropped).toEqual([4]);
		expect(countBubbles(g)).toBe(0);
	});

	it('the raft reaching the lane is a loss', () => {
		const g = make(4, 4, [[0]]);
		expect(isLost(g)).toBe(false);
		g.cells[3 * 4] = 0;
		expect(isLost(g)).toBe(true);
	});

	it('descend drops every bubble straight down by one row', () => {
		const g = make(6, 8, [[0, 1, 2, 3, 4, 5]]);
		const before = Array.from({ length: 6 }, (_, c) => centreOf(g, c));
		descend(g, new Array(6).fill(-1)); // empty ceiling: only the shift is tested
		// Row 0 is gone, its bubbles are now in row 1 at the same x, one ROW_H lower.
		for (let c = 0; c < 6; c++) {
			expect(g.cells[6 + c]).toBe(c); // colours were 0..5 left to right
			const now = centreOf(g, 6 + c);
			expect(now.x).toBeCloseTo(before[c].x, 6);
			expect(now.y).toBeCloseTo(before[c].y + Math.sqrt(3), 6);
		}
	});

	it('descend keeps neighbourhoods mutual (parity stays consistent)', () => {
		const g = make(6, 8, [[0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4]]);
		descend(g, randomRow(6, 3, () => 0.5));
		for (let k = 0; k < g.cols * g.rows; k++) {
			if (g.cells[k] < 0) continue;
			for (const n of neighbours(g, k)) {
				const a = centreOf(g, k);
				const b = centreOf(g, n);
				expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(2 * R, 6);
			}
		}
	});

	it('descend that pushes a bubble to the lane is a loss', () => {
		const g = dealSurvival(6, 3, 1, 4, () => 0.5); // one row, board is 4 tall
		expect(isLost(g)).toBe(false);
		for (let i = 0; i < 3; i++) descend(g, randomRow(6, 3, () => 0.5));
		expect(isLost(g)).toBe(true);
	});

	it('orphans are what the ceiling no longer holds', () => {
		const g = make(4, 5, [[0, -1, -1, -1], [], [1, -1, -1]]);
		expect(orphans(g)).toEqual([8]);
	});
});

describe('bulles — flight', () => {
	const raft = (): Grid => make(6, 8, [[0, 0, 0, 0, 0, 0]]);

	it('a shot straight up lands under the middle of the ceiling', () => {
		const f = fly(raft(), 0);
		expect(f).not.toBeNull();
		expect(f!.cell).toBeGreaterThanOrEqual(6); // row 1, the ceiling row being full
		expect(f!.path.length).toBe(2); // cannon, then where it stopped
	});

	it('a wide shot bounces off the wall and the path says where', () => {
		const g = raft();
		const f = fly(g, 1.2);
		expect(f).not.toBeNull();
		expect(f!.path.length).toBeGreaterThan(2);
		const bounce = f!.path[1];
		expect(Math.min(bounce.x - R, boardW(g.cols) - R - bounce.x)).toBeCloseTo(0, 6);
	});

	it('every landing hangs on something and is free', () => {
		const g = raft();
		for (const [cell] of landings(g)) {
			expect(g.cells[cell]).toBe(-1);
			expect(neighbours(g, cell).some((n) => g.cells[n] >= 0)).toBe(true);
		}
	});

	it('the aim is repeatable', () => {
		const g = raft();
		expect(fly(g, 0.4)!.cell).toBe(fly(g, 0.4)!.cell);
	});

	it('the sight line stays in the board and ends where the bubble stops', () => {
		const g = raft();
		for (let i = -20; i <= 20; i++) {
			const angle = (i / 20) * MAX_AIM;
			const pts = ray(g, angle);
			expect(pts.length).toBeGreaterThanOrEqual(2);
			expect(pts[0]).toEqual(shooterOf(g));
			for (const p of pts) {
				expect(p.x).toBeGreaterThanOrEqual(R - 1e-6);
				expect(p.x).toBeLessThanOrEqual(boardW(g.cols) - R + 1e-6);
			}
			const f = fly(g, angle);
			if (!f) continue;
			const end = pts[pts.length - 1];
			const cell = centreOf(g, f.cell);
			// Free contact point, so it sits within a bubble of the cell it settles in.
			expect(Math.hypot(end.x - cell.x, end.y - cell.y)).toBeLessThan(2 * R);
		}
	});

	it('the sight sweeps smoothly — no jump between neighbouring angles', () => {
		const g = raft();
		let prev: { x: number; y: number } | null = null;
		for (let i = -60; i <= 60; i++) {
			const pts = ray(g, (i / 60) * 0.8);
			const end = pts[pts.length - 1];
			if (prev && pts.length === 2) expect(Math.hypot(end.x - prev.x, end.y - prev.y)).toBeLessThan(R);
			prev = pts.length === 2 ? end : null;
		}
	});
});

describe('bulles — colours', () => {
	it('the cannon only loads a colour still on the board', () => {
		const g = make(5, 5, [[1, 1, 3, -1, -1]]);
		expect(palette(g)).toEqual([1, 3]);
		for (let s = 0; s < 40; s++) expect(palette(g)).toContain(nextColour(g, 12345, s));
	});

	it('the colour of a shot depends on the board and the count, nothing else', () => {
		const g = make(5, 5, [[0, 1, 2, -1, -1]]);
		expect(nextColour(g, 99, 7)).toBe(nextColour(g, 99, 7));
	});
});

describe('bulles — boards', () => {
	for (const tier of DIFF_ORDER) {
		const diff = DIFFS[tier];

		it(`${tier} deals a board the solver clears`, () => {
			for (let s = 0; s < 6; s++) {
				const p = generateBulles(diff, mulberry32(4200 + s * 13));
				const g = gridOf(p);
				expect(p.colours).toBe(diff.colours);
				expect(palette(g).length).toBe(diff.colours);
				expect(countBubbles(g)).toBeGreaterThan(diff.cols * 2);
				expect(isLost(g)).toBe(false);

				const shots = solve(g, p.seed, 0, shotBudget(countBubbles(g), diff.colours));
				expect(shots).not.toBeNull();
				expect(shots!.length).toBe(p.par);
			}
		});

		it(`${tier} lands on the par it ships`, () => {
			const p = generateBulles(diff, mulberry32(777));
			const g = gridOf(p);
			// Replaying the solver's own angles has to empty the board in exactly par shots.
			const shots = solve(g, p.seed, 0, p.par)!;
			for (let i = 0; i < shots.length; i++) {
				const colour = nextColour(g, p.seed, i);
				const f = fly(g, shots[i]);
				expect(f).not.toBeNull();
				applyShot(g, f!.cell, colour);
			}
			expect(countBubbles(g)).toBe(0);
		});

		it(`${tier} is the same board twice from one seed`, () => {
			const a = generateBulles(diff, mulberry32(31));
			const b = generateBulles(diff, mulberry32(31));
			expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
			expect(a.seed).toBe(b.seed);
			expect(a.par).toBe(b.par);
		});
	}

	it('the tiers climb', () => {
		const par = DIFF_ORDER.map((t) => DIFFS[t].wantPar);
		for (let i = 1; i < par.length; i++) expect(par[i]).toBeGreaterThan(par[i - 1]);
	});
});
