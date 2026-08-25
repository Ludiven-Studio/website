import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../prng';
import type { Dir } from './engine';
import {
	LEAVES_BANDS,
	allCollected,
	emptyFlow,
	generateLeaves,
	paint,
	startStroke,
	tickLeaves,
	type LeavesPuzzle,
} from './leaves';

/** A bare 5x5 meadow: vortex bottom-right area, no rocks, leaves wherever the test puts them. */
const bare = (over: Partial<LeavesPuzzle> = {}): LeavesPuzzle => ({
	n: 5,
	rocks: new Array(25).fill(false),
	vortex: 18, // (3,3)
	leaves: [],
	solution: new Array(25).fill(null),
	par: 0,
	...over,
});

/** Paint a run of cells with one stroke; returns the flow and the stroke id. */
const stroke = (p: LeavesPuzzle, f: ReturnType<typeof emptyFlow>, steps: Array<[number, Dir]>) => {
	const s = startStroke(f);
	let flow = s.flow;
	const dissolved: number[] = [];
	for (const [cell, dir] of steps) {
		const r = paint(p, flow, s.id, cell, dir);
		flow = r.flow;
		dissolved.push(...r.dissolved);
	}
	return { flow, id: s.id, dissolved };
};

describe('paint', () => {
	it('lays arrows, but never on a rock or the vortex', () => {
		const p = bare({ rocks: Object.assign(new Array(25).fill(false), { 7: true }) });
		let f = emptyFlow(5);
		const s = startStroke(f);
		f = paint(p, s.flow, s.id, 6, 1).flow;
		expect(f.dirs[6]).toBe(1);
		expect(paint(p, f, s.id, 7, 1).painted).toBe(false);
		expect(paint(p, f, s.id, p.vortex, 1).painted).toBe(false);
	});

	it('is pure: the old flow is untouched', () => {
		const p = bare();
		const f0 = emptyFlow(5);
		const s = startStroke(f0);
		paint(p, s.flow, s.id, 6, 1);
		expect(s.flow.dirs[6]).toBeNull();
	});

	it('crossing cuts the old stroke: downstream dissolves, upstream stays and merges', () => {
		const p = bare();
		// Stroke A runs right along the top row: 0→1→2→3.
		const a = stroke(p, emptyFlow(5), [[0, 1], [1, 1], [2, 1], [3, 1]]);
		// Stroke B crosses at 2, heading down.
		const b = stroke(p, a.flow, [[2, 2], [7, 2], [12, 2]]);
		expect(b.dissolved).toEqual([3]); // A's tail evaporated
		expect(b.flow.dirs[3]).toBeNull();
		expect(b.flow.dirs[0]).toBe(1); // A's upstream intact…
		expect(b.flow.dirs[1]).toBe(1);
		expect(b.flow.dirs[2]).toBe(2); // …and rerouted at the crossing
		// A leaf at A's source now rides A then B down to (2,2)=12 and stalls there.
		let leaves = [0];
		for (let i = 0; i < 6; i++) leaves = tickLeaves(p, b.flow.dirs, leaves).leaves;
		expect(leaves).toEqual([17]); // one past 12, then stalls at arrowless 17
	});

	it('re-crossing your own stroke cuts your own tail too', () => {
		const p = bare();
		// A hook that comes back onto itself: 0→1→2, down to 7, left to 6, up onto 1.
		const a = stroke(p, emptyFlow(5), [[0, 1], [1, 1], [2, 2], [7, 3], [6, 0], [1, 0]]);
		expect(a.dissolved).toEqual(expect.arrayContaining([2, 7, 6]));
		expect(a.flow.dirs[0]).toBe(1);
		expect(a.flow.dirs[1]).toBe(0);
		expect(a.flow.dirs[2]).toBeNull();
	});
});

describe('tickLeaves', () => {
	it('moves every leaf one cell along its arrow, all at once', () => {
		const p = bare();
		const f = stroke(p, emptyFlow(5), [[0, 1], [1, 1], [5, 1]]).flow;
		const r = tickLeaves(p, f.dirs, [0, 1, 5, 20]);
		expect(r.leaves).toEqual([1, 2, 6, 20]); // 20 has no arrow, it rests
		expect(r.moved).toBe(true);
	});

	it('stalls against a rock and against the hedge', () => {
		const p = bare({ rocks: Object.assign(new Array(25).fill(false), { 2: true }) });
		const f = stroke(p, emptyFlow(5), [[1, 1], [4, 1]]).flow;
		const r = tickLeaves(p, f.dirs, [1, 4]);
		expect(r.leaves).toEqual([1, 4]); // rock ahead, hedge ahead
		expect(r.moved).toBe(false);
	});

	it('the vortex swallows arriving leaves, and leaves never collide', () => {
		const p = bare();
		const f = stroke(p, emptyFlow(5), [[16, 1], [17, 1]]).flow;
		// Two leaves in file on the same stream, one about to fall in.
		const r1 = tickLeaves(p, f.dirs, [17, 16]);
		expect(r1.leaves).toEqual([-1, 17]);
		expect(r1.collected).toEqual([0]);
		const r2 = tickLeaves(p, f.dirs, r1.leaves);
		expect(r2.leaves).toEqual([-1, -1]);
		expect(allCollected(r2.leaves)).toBe(true);
	});
});

describe('generateLeaves', () => {
	it.each(LEAVES_BANDS.map((b, i) => [i, b] as const))('band %i deals a meadow its own solution clears', (_, band) => {
		for (let seed = 1; seed <= 15; seed++) {
			const p = generateLeaves(mulberry32(seed * 977), band);
			expect(p.leaves).toHaveLength(band.leaves);
			expect(new Set(p.leaves).size).toBe(band.leaves);
			expect(p.rocks.filter(Boolean)).toHaveLength(band.rocks);
			expect(p.leaves.every((c) => p.solution[c] != null)).toBe(true);
			expect(p.par).toBe(p.solution.filter((d) => d != null).length);
			// Riding the shipped currents brings every leaf to the vortex.
			let leaves = p.leaves.slice();
			for (let t = 0; t < p.par + 2 && !allCollected(leaves); t++) {
				leaves = tickLeaves(p, p.solution, leaves).leaves;
			}
			expect(allCollected(leaves)).toBe(true);
		}
	});

	it('is deterministic in the seed', () => {
		const a = generateLeaves(mulberry32(42), LEAVES_BANDS[0]);
		const b = generateLeaves(mulberry32(42), LEAVES_BANDS[0]);
		expect(a).toEqual(b);
	});
});
