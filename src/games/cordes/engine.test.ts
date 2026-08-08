import { describe, it, expect } from 'vitest';
import {
	DIFFS,
	DIFF_ORDER,
	applyHint,
	coilCount,
	detours,
	distToSeg,
	findHint,
	generateCordes,
	isNailed,
	isSolved,
	pathsCross,
	ropeFault,
	segCross,
	selfCrosses,
	spikeCount,
	tangleCount,
	tangleDepth,
	wallCount,
	type CordesPuzzle,
	type DiffLevel,
	type Pt,
} from './engine';
import { cordesLevels } from './levels';
import { mulberry32, dateSeed } from '../prng';

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Two ropes that must go round each other, plus a legal answer for them. */
const bare: CordesPuzzle = {
	ropes: 2,
	ends: [
		[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }],
		[{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }],
	],
	solution: [
		[{ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.02 }, { x: 0.7, y: 0.02 }, { x: 0.9, y: 0.5 }],
		[{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }],
	],
	anchored: [false, false],
	pegR: 0.04,
};

describe('cordes geometry', () => {
	it('only a proper crossing counts', () => {
		const a = { x: 0, y: 0 };
		const b = { x: 1, y: 1 };
		expect(segCross(a, b, { x: 0, y: 1 }, { x: 1, y: 0 })).toBe(true);
		expect(segCross(a, b, { x: 2, y: 0 }, { x: 3, y: 1 })).toBe(false); // parallel
		expect(segCross(a, b, b, { x: 2, y: 0 })).toBe(false); // shared end
		expect(segCross(a, b, { x: 0.5, y: 0.5 }, { x: 1, y: 0 })).toBe(false); // T-junction
		expect(segCross(a, b, { x: 0.5, y: 0.5 }, { x: 2, y: 2 })).toBe(false); // collinear overlap
	});

	it('distToSeg clamps to the ends', () => {
		const a = { x: 0, y: 0 };
		const b = { x: 1, y: 0 };
		expect(distToSeg({ x: 0.5, y: 0.3 }, a, b)).toBeCloseTo(0.3);
		expect(distToSeg({ x: 2, y: 0 }, a, b)).toBeCloseTo(1);
		expect(distToSeg({ x: 0.5, y: 0.5 }, a, a)).toBeCloseTo(Math.hypot(0.5, 0.5));
	});

	it('a rope only loops when it really comes back on itself', () => {
		expect(selfCrosses([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(false);
		expect(selfCrosses([
			{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.2 }, { x: 0.3, y: 0.7 }, { x: 0.9, y: 0.5 },
		])).toBe(true);
	});

	it('pathsCross is symmetric', () => {
		const p = [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }];
		const q = [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }];
		expect(pathsCross(p, q)).toBe(true);
		expect(pathsCross(q, p)).toBe(true);
		expect(pathsCross(p, [{ x: 0, y: 0.9 }, { x: 1, y: 0.9 }])).toBe(false);
	});
});

describe('cordes rules', () => {
	const [a, b] = bare.ends[0];

	it('accepts a route that goes round', () => {
		expect(ropeFault(bare.solution[0], 0, bare.solution, bare)).toBeNull();
		expect(ropeFault([...bare.solution[0]].reverse(), 0, bare.solution, bare)).toBeNull();
		expect(isSolved(bare.solution, bare)).toBe(true);
	});

	it('names what is wrong', () => {
		expect(ropeFault([a], 0, [], bare)).toBe('trop court');
		expect(ropeFault([a, { x: 0.5, y: 0.5 }], 0, [], bare)).toBe('ne relie pas ses deux piquets');
		expect(ropeFault([a, { x: -0.2, y: 0.5 }, b], 0, [], bare)).toBe('sort du cadre');
		expect(ropeFault([
			a, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.2 }, { x: 0.3, y: 0.7 }, b,
		], 0, [], bare)).toBe('se croise elle-même');
		expect(ropeFault([a, { x: 0.5, y: 0.1 }, b], 0, [], bare)).toBe('passe sur un piquet');
		expect(ropeFault([a, b], 0, bare.solution, bare)).toBe('croise une autre corde');
	});

	it('an unfinished board is not solved', () => {
		expect(isSolved([bare.solution[0], null], bare)).toBe(false);
		expect(isSolved([], bare)).toBe(false);
	});
});

/** The board's own answer must obey every rule the player is held to. */
function expectLegalBoard(p: CordesPuzzle, ropes: number): void {
	expect(p.ropes).toBe(ropes);
	expect(p.solution).toHaveLength(ropes);
	expect(p.ends).toHaveLength(ropes);
	expect(p.anchored).toHaveLength(ropes);

	const pegs = p.ends.flat();
	for (let i = 0; i < pegs.length; i++) {
		expect(pegs[i].x).toBeGreaterThanOrEqual(0);
		expect(pegs[i].x).toBeLessThanOrEqual(1);
		expect(pegs[i].y).toBeGreaterThanOrEqual(0);
		expect(pegs[i].y).toBeLessThanOrEqual(1);
		// A tap must never be ambiguous between two pegs.
		for (let j = i + 1; j < pegs.length; j++) expect(dist(pegs[i], pegs[j])).toBeGreaterThan(2 * p.pegR);
	}

	for (let r = 0; r < ropes; r++) {
		// The flag has to tell the truth: a wall is a rope with both pegs nailed to the frame.
		expect(isNailed(p.ends[r][0]) && isNailed(p.ends[r][1])).toBe(p.anchored[r]);
		// Three peg-widths apart at least: closer than that and the eye pairs them up for free.
		expect(dist(p.ends[r][0], p.ends[r][1])).toBeGreaterThanOrEqual(6 * p.pegR);
		expect(p.solution[r].length).toBeGreaterThan(2);
		expect(p.solution[r][0]).toEqual(p.ends[r][0]);
		expect(p.solution[r][p.solution[r].length - 1]).toEqual(p.ends[r][1]);
		expect(ropeFault(p.solution[r], r, p.solution, p)).toBeNull();
	}
	expect(isSolved(p.solution, p)).toBe(true);
}

// Ranking a hundred deals against each other costs a tenth of a second on the widest board,
// which puts a forty-board sample well past the default five seconds.
describe('cordes generation', { timeout: 60_000 }, () => {
	const dealt = new Map<string, CordesPuzzle[]>();

	/**
	 * Boards of one shape. Dealt once and shared between the assertions below: a board is a
	 * hundred deals ranked against each other, which makes it by far the slowest thing here.
	 */
	const sample = (diff: DiffLevel, n = 40): CordesPuzzle[] => {
		const got = dealt.get(diff.label) ?? [];
		for (let s = got.length; s < n; s++) got.push(generateCordes(diff, mulberry32(2200 + s * 41 + diff.ropes)));
		dealt.set(diff.label, got);
		return got.slice(0, n);
	};

	const meanBy = (boards: CordesPuzzle[], f: (p: CordesPuzzle) => number): number =>
		boards.reduce((s, p) => s + f(p), 0) / boards.length;

	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: every board ships a legal answer, and a ruler is never that answer`, () => {
			// Walls and spikes are built, not hoped for, so every board must have them all. The
			// tangle is only rejection sampling on top, so it is a floor, not the target.
			const boards = sample(diff);
			for (const p of boards) {
				expectLegalBoard(p, diff.ropes);
				expect(wallCount(p)).toBe(diff.walls);
				expect(spikeCount(p)).toBe(diff.spikes);
				expect(tangleCount(p)).toBeGreaterThanOrEqual(2);
				// Two spikes always catch somebody: that is the whole reason they are dealt.
				if (diff.coils >= 2) expect(coilCount(p)).toBeGreaterThanOrEqual(2);
			}
			if (diff.coils >= 3) {
				const coiled = boards.filter((p) => coilCount(p) >= 3).length;
				expect(coiled).toBeGreaterThanOrEqual(32); // 80% ask for three real detours
			}
			if (diff.nested >= 1) {
				const deep = boards.filter((p) => tangleDepth(p) >= 2).length;
				expect(deep).toBeGreaterThanOrEqual(24); // 60% carry a rope caught on both sides
			}
		});
	}

	it('a spike is nailed by one end only, and its free tip is out in the open', () => {
		for (const p of sample(DIFFS.expert, 20)) {
			const spikes = p.ends.filter(([a, b]) => isNailed(a) !== isNailed(b));
			expect(spikes).toHaveLength(DIFFS.expert.spikes);
			for (const [a, b] of spikes) {
				const tip = isNailed(a) ? b : a;
				// A tip a step from the edge is rounded for nothing; the cost is the reach.
				expect(Math.min(tip.x, 1 - tip.x, tip.y, 1 - tip.y)).toBeGreaterThan(0.15);
			}
		}
	});

	it('a harder tier is never a flatter board', () => {
		// The bug this guards: walls slice the board, and a slice holding one lone rope is a
		// pocket where that rope crosses nobody. Difficile used to buy a second wall with its
		// fifth rope, which left one rope per slice and made it *shallower* than Moyen.
		const boards = [...DIFF_ORDER, 'expert'].map((k) => sample(DIFFS[k]));
		for (const f of [tangleDepth, coilCount, (p: CordesPuzzle) => Math.max(...detours(p))]) {
			const got = boards.map((b) => meanBy(b, f));
			for (let i = 1; i < got.length; i++) expect(got[i]).toBeGreaterThan(got[i - 1]);
		}
	});

	it('every level 1-200 deals a legal board', () => {
		for (const level of [1, 30, 60, 90, 120, 180]) {
			const { diff } = cordesLevels.config(level);
			expect(diff.walls + diff.spikes).toBeLessThanOrEqual(diff.ropes - 2);
			for (const p of sample(diff, 12)) expectLegalBoard(p, diff.ropes);
		}
	});

	it('is deterministic: same seed -> identical board', () => {
		const seed = dateSeed(new Date('2026-08-07T00:00:00Z'));
		const a = generateCordes(DIFFS.moyen, mulberry32(seed));
		const b = generateCordes(DIFFS.moyen, mulberry32(seed));
		expect(a.ends).toEqual(b.ends);
		expect(a.solution).toEqual(b.solution);
	});

	it('ropes get more numerous with the difficulty', () => {
		expect(DIFF_ORDER).toHaveLength(3);
		const counts = [...DIFF_ORDER, 'expert'].map((k) => DIFFS[k].ropes);
		for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
	});
});

describe('cordes hints', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: hints finish the board, one rope at a time`, () => {
			for (let s = 0; s < 8; s++) {
				const p = generateCordes(diff, mulberry32(1500 + s * 19 + diff.ropes));
				let ropes: (Pt[] | null)[] = [];
				let steps = 0;
				while (!isSolved(ropes, p)) {
					const h = findHint(ropes, p);
					expect(h).not.toBeNull();
					if (!h) break;
					ropes = applyHint(ropes, h, p);
					expect(++steps).toBeLessThanOrEqual(p.ropes);
				}
				expect(isSolved(ropes, p)).toBe(true);
			}
		});
	}

	it('a hint rubs out the rope that was in its way', () => {
		// Rope 0 drawn straight is legal on its own — it only blocks the rope nobody has tied yet.
		const ropes: (Pt[] | null)[] = [[bare.ends[0][0], bare.ends[0][1]], null];
		expect(ropeFault(ropes[0]!, 0, ropes, bare)).toBeNull();
		const h = findHint(ropes, bare);
		expect(h).toEqual({ rope: 1, path: bare.solution[1] });
		const next = applyHint(ropes, h!, bare);
		expect(next[1]).toEqual(bare.solution[1]);
		expect(next[0]).toBeNull();
		expect(ropes[0]).not.toBeNull(); // the caller board is untouched
	});

	it('returns null once every rope is tied', () => {
		const p = generateCordes(DIFFS.facile, mulberry32(11));
		expect(findHint(p.solution, p)).toBeNull();
	});
});
