import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../prng';
import {
	FEUILLES_BANDS,
	allReachable,
	emptyFlow,
	generateBoard,
	paint,
	spawnLeaves,
	startStroke,
	tickLeaves,
	type Dir,
	type FeuillesBoard,
	type Leaf,
} from './engine';

/** A bare 5x5 meadow: vortex at (3,3), rocks wherever the test puts them. */
const bare = (over: Partial<FeuillesBoard> = {}): FeuillesBoard => ({
	n: 5,
	rocks: new Array(25).fill(false),
	vortex: 18,
	...over,
});

/** Paint a run of cells with one stroke; returns the flow and the stroke id. */
const stroke = (b: FeuillesBoard, f: ReturnType<typeof emptyFlow>, steps: Array<[number, Dir]>) => {
	const s = startStroke(f);
	let flow = s.flow;
	const dissolved: number[] = [];
	for (const [cell, dir] of steps) {
		const r = paint(b, flow, s.id, cell, dir);
		flow = r.flow;
		dissolved.push(...r.dissolved);
	}
	return { flow, id: s.id, dissolved };
};

const leavesAt = (...cells: number[]): Leaf[] => cells.map((cell, id) => ({ id, cell }));

describe('paint', () => {
	it('lays arrows, but never on a rock or the vortex', () => {
		const b = bare({ rocks: Object.assign(new Array(25).fill(false), { 7: true }) });
		let f = emptyFlow(5);
		const s = startStroke(f);
		f = paint(b, s.flow, s.id, 6, 1).flow;
		expect(f.dirs[6]).toBe(1);
		expect(paint(b, f, s.id, 7, 1).painted).toBe(false);
		expect(paint(b, f, s.id, b.vortex, 1).painted).toBe(false);
	});

	it('crossing cuts the old stroke: downstream dissolves, upstream stays and merges', () => {
		const b = bare();
		const a = stroke(b, emptyFlow(5), [[0, 1], [1, 1], [2, 1], [3, 1]]);
		const c = stroke(b, a.flow, [[2, 2], [7, 2], [12, 2]]);
		expect(c.dissolved).toEqual([3]);
		expect(c.flow.dirs[3]).toBeNull();
		expect(c.flow.dirs[0]).toBe(1);
		expect(c.flow.dirs[2]).toBe(2); // rerouted at the crossing
		// A leaf at A's source rides A then the new stroke down, stalling past 12.
		let leaves = leavesAt(0);
		for (let i = 0; i < 6; i++) leaves = tickLeaves(b, c.flow.dirs, leaves).leaves;
		expect(leaves.map((l) => l.cell)).toEqual([17]);
	});
});

describe('tickLeaves', () => {
	it('moves every leaf one cell along its arrow, piles ride together', () => {
		const b = bare();
		const f = stroke(b, emptyFlow(5), [[0, 1], [1, 1]]).flow;
		// Two leaves stacked on 0, one on 1, one adrift on 20.
		const r = tickLeaves(b, f.dirs, leavesAt(0, 0, 1, 20));
		expect(r.leaves.map((l) => l.cell)).toEqual([1, 1, 2, 20]);
		expect(r.moved).toBe(true);
	});

	it('stalls against a rock and against the hedge', () => {
		const b = bare({ rocks: Object.assign(new Array(25).fill(false), { 2: true }) });
		const f = stroke(b, emptyFlow(5), [[1, 1], [4, 1]]).flow;
		const r = tickLeaves(b, f.dirs, leavesAt(1, 4));
		expect(r.leaves.map((l) => l.cell)).toEqual([1, 4]);
		expect(r.moved).toBe(false);
	});

	it('the vortex swallows a whole pile at once, ids preserved', () => {
		const b = bare();
		const f = stroke(b, emptyFlow(5), [[17, 1]]).flow;
		const r = tickLeaves(b, f.dirs, leavesAt(17, 17, 3));
		expect(r.leaves.map((l) => l.cell)).toEqual([3]);
		expect(r.collected.map((l) => l.id)).toEqual([0, 1]);
	});
});

describe('spawnLeaves', () => {
	it('falls only on free cells, stacks allowed, ids keep counting', () => {
		const rocks = new Array(25).fill(false);
		for (let i = 0; i < 20; i++) rocks[i] = true; // only 20..24 stay free
		rocks[18] = false; // vortex must stay clear of rocks
		const b = bare({ rocks });
		const r = spawnLeaves(mulberry32(7), b, 30, 5);
		expect(r.leaves).toHaveLength(30);
		expect(r.nextId).toBe(35);
		expect(r.leaves.every((l) => !b.rocks[l.cell] && l.cell !== b.vortex)).toBe(true);
	});
});

describe('generateBoard', () => {
	it.each(FEUILLES_BANDS.map((b, i) => [i, b] as const))('band %i keeps every free cell reachable', (_, band) => {
		for (let seed = 1; seed <= 25; seed++) {
			const b = generateBoard(mulberry32(seed * 977), band);
			expect(b.rocks.filter(Boolean)).toHaveLength(band.rocks);
			expect(b.rocks[b.vortex]).toBe(false);
			expect(allReachable(b)).toBe(true);
		}
	});

	it('is deterministic in the seed', () => {
		const a = generateBoard(mulberry32(42), FEUILLES_BANDS[0]);
		const b = generateBoard(mulberry32(42), FEUILLES_BANDS[0]);
		expect(a).toEqual(b);
	});
});
