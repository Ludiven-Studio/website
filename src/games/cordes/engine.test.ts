import { describe, it, expect } from 'vitest';
import {
	DIFFS,
	DIFF_ORDER,
	applyHint,
	distToSeg,
	findHint,
	generateCordes,
	isSolved,
	pathsCross,
	ropeFault,
	segCross,
	selfCrosses,
	tangleCount,
	type CordesPuzzle,
	type Pt,
} from './engine';
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

	const pegs = p.ends.flat();
	for (let i = 0; i < pegs.length; i++) {
		expect(pegs[i].x).toBeGreaterThan(0);
		expect(pegs[i].x).toBeLessThan(1);
		expect(pegs[i].y).toBeGreaterThan(0);
		expect(pegs[i].y).toBeLessThan(1);
		// A tap must never be ambiguous between two pegs.
		for (let j = i + 1; j < pegs.length; j++) expect(dist(pegs[i], pegs[j])).toBeGreaterThan(2 * p.pegR);
	}

	for (let r = 0; r < ropes; r++) {
		// Three peg-widths apart at least: closer than that and the eye pairs them up for free.
		expect(dist(p.ends[r][0], p.ends[r][1])).toBeGreaterThanOrEqual(6 * p.pegR);
		expect(p.solution[r].length).toBeGreaterThan(2);
		expect(p.solution[r][0]).toEqual(p.ends[r][0]);
		expect(p.solution[r][p.solution[r].length - 1]).toEqual(p.ends[r][1]);
		expect(ropeFault(p.solution[r], r, p.solution, p)).toBeNull();
	}
	expect(isSolved(p.solution, p)).toBe(true);
}

describe('cordes generation', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: every board ships a legal answer`, () => {
			for (let s = 0; s < 60; s++) expectLegalBoard(generateCordes(diff, mulberry32(700 + s * 37 + diff.ropes)), diff.ropes);
		});
	}

	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: a ruler is never the answer`, () => {
			// The target is every rope, reached by rejection; the odd board that runs out of
			// tries still has to leave at most one rope joinable with a straight line.
			let full = 0;
			for (let s = 0; s < 60; s++) {
				const p = generateCordes(diff, mulberry32(2200 + s * 41 + diff.ropes));
				const t = tangleCount(p);
				expect(t).toBeGreaterThanOrEqual(diff.tangle - 1);
				if (t >= diff.tangle) full++;
			}
			expect(full).toBeGreaterThanOrEqual(54);
		});
	}

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
