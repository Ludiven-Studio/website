import { describe, it, expect } from 'vitest';
import {
	CLEAR,
	DIFFS,
	DIFF_ORDER,
	ROPE_GAP,
	ROPE_R,
	applyHint,
	clearOf,
	distToSeg,
	findHint,
	generateCordes,
	grabAt,
	isSolved,
	pathsCross,
	pathsTooClose,
	ropeAt,
	ropeFault,
	segCross,
	selfCrosses,
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
	detours: [1.5, 1],
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
		expect(ropeFault([a, { x: 0.5, y: 0.1 }, b], 0, [], bare)).toBe('passe trop près d’un piquet');
		expect(ropeFault([a, b], 0, bare.solution, bare)).toBe('croise une autre corde');
	});

	it('the clearance is wider than the peg itself', () => {
		// 0.05 off the peg: outside the drawn circle (0.04), inside the halo (0.064).
		expect(CLEAR).toBeGreaterThan(1);
		expect(ropeFault([a, { x: 0.5, y: 0.15 }, b], 0, [], bare)).toBe('passe trop près d’un piquet');
	});

	it('the rope is measured by its body, not by its centre line', () => {
		// Centre line 0.066 off the peg: just outside the halo (0.064), but half the rope is in it.
		expect(ropeFault([a, { x: 0.5, y: 0.166 }, b], 0, [], bare)).toBe('passe trop près d’un piquet');
		expect(ropeFault([a, { x: 0.5, y: 0.19 }, b], 0, [], bare)).toBeNull();
		// Same on the frame: the rope stops half a width short of it.
		expect(ropeFault([a, { x: 0.5, y: ROPE_R / 2 }, b], 0, [], bare)).toBe('sort du cadre');
	});

	it('two ropes may not run shoulder to shoulder', () => {
		// Neither of these crosses the answer above — only the first has its body against it.
		const near = [{ x: 0.35, y: 0.03 }, { x: 0.65, y: 0.03 }];
		const far = [{ x: 0.35, y: 0.08 }, { x: 0.65, y: 0.08 }];
		expect(pathsCross(bare.solution[0], near)).toBe(false);
		expect(ropeFault(bare.solution[0], 0, [null, near], bare)).toBe('passe trop près d’une corde');
		expect(ropeFault(bare.solution[0], 0, [null, far], bare)).toBeNull();
	});

	it('an unfinished board is not solved', () => {
		expect(isSolved([bare.solution[0], null], bare)).toBe(false);
		expect(isSolved([], bare)).toBe(false);
	});
});

describe('cordes picking', () => {
	/** Two pegs closer together than a finger's reach — the tap has to choose. */
	const crowd: CordesPuzzle = {
		ropes: 2,
		ends: [
			[{ x: 0.5, y: 0.5 }, { x: 0.1, y: 0.1 }],
			[{ x: 0.6, y: 0.5 }, { x: 0.9, y: 0.9 }],
		],
		solution: [],
		detours: [1, 1],
		pegR: 0.04,
	};
	const empty = [null, null];

	it('takes the nearest peg, not the first rope with one in reach', () => {
		expect(grabAt({ x: 0.58, y: 0.5 }, empty, crowd, 0.15)).toEqual({ rope: 1, end: 0 });
		expect(grabAt({ x: 0.52, y: 0.5 }, empty, crowd, 0.15)).toEqual({ rope: 0, end: 0 });
		expect(grabAt({ x: 0.9, y: 0.9 }, empty, crowd, 0.15)).toEqual({ rope: 1, end: 1 });
		expect(grabAt({ x: 0.5, y: 0.9 }, empty, crowd, 0.1)).toBeNull();
	});

	it('a rope left hanging is picked up by its head', () => {
		const ropes = [[{ x: 0.5, y: 0.5 }, { x: 0.3, y: 0.3 }], null];
		expect(grabAt({ x: 0.31, y: 0.3 }, ropes, crowd, 0.15)).toEqual({ rope: 0, end: -1 });
		// Still nearer to the peg it started from: that is a restart, not a resume.
		expect(grabAt({ x: 0.49, y: 0.5 }, ropes, crowd, 0.15)).toEqual({ rope: 0, end: 0 });
	});

	it('a tap off every peg rubs out the nearest rope', () => {
		const ropes = [[{ x: 0.5, y: 0.5 }, { x: 0.3, y: 0.3 }], [{ x: 0.6, y: 0.5 }, { x: 0.9, y: 0.9 }]];
		expect(ropeAt({ x: 0.4, y: 0.4 }, ropes, 0.05)).toBe(0);
		expect(ropeAt({ x: 0.75, y: 0.75 }, ropes, 0.05)).toBe(1);
		expect(ropeAt({ x: 0.1, y: 0.9 }, ropes, 0.05)).toBe(-1);
	});
});

/** The board's own answer must obey every rule the player is held to. */
function expectLegalBoard(p: CordesPuzzle, ropes: number): void {
	expect(p.ropes).toBe(ropes);
	expect(p.solution).toHaveLength(ropes);
	expect(p.ends).toHaveLength(ropes);
	expect(p.detours).toHaveLength(ropes);

	const pegs = p.ends.flat();
	for (let i = 0; i < pegs.length; i++) {
		// Every peg whole and loose inside the frame — nothing nailed to the edge any more.
		expect(Math.min(pegs[i].x, 1 - pegs[i].x, pegs[i].y, 1 - pegs[i].y)).toBeGreaterThanOrEqual(p.pegR);
		// A tap must never be ambiguous between two pegs.
		for (let j = i + 1; j < pegs.length; j++) expect(dist(pegs[i], pegs[j])).toBeGreaterThan(2 * p.pegR);
	}

	for (let r = 0; r < ropes; r++) {
		// Three peg-widths apart at least: closer than that and the eye pairs them up for free.
		expect(dist(p.ends[r][0], p.ends[r][1])).toBeGreaterThanOrEqual(6 * p.pegR);
		expect(p.detours[r]).toBeGreaterThanOrEqual(1);
		// A run with no bend simplifies down to its two pegs, so two points is a real route.
		expect(p.solution[r].length).toBeGreaterThanOrEqual(2);
		expect(p.solution[r][0]).toEqual(p.ends[r][0]);
		expect(p.solution[r][p.solution[r].length - 1]).toEqual(p.ends[r][1]);
		expect(ropeFault(p.solution[r], r, p.solution, p)).toBeNull();
	}
	expect(isSolved(p.solution, p)).toBe(true);

	// Legal is not enough: a route that shaves a halo or a neighbour cannot be redrawn with a
	// finger, so the board only ships routes with a spare half-width of rope on each side.
	for (let r = 0; r < ropes; r++) {
		for (let q = 0; q < ropes; q++) {
			if (q === r) continue;
			for (const peg of p.ends[q]) {
				for (let i = 0; i < p.solution[r].length - 1; i++) {
					expect(distToSeg(peg, p.solution[r][i], p.solution[r][i + 1]))
						.toBeGreaterThanOrEqual(clearOf(p.pegR) + ROPE_R);
				}
			}
			expect(pathsTooClose(p.solution[r], p.solution[q], ROPE_GAP + ROPE_R)).toBe(false);
		}
	}
}

const hardCount = (p: CordesPuzzle): number => p.detours.filter((d) => d >= 1.3).length;

// A board is up to 48 deals each solved on the raster, so a forty-board sample is well
// past the default five seconds.
describe('cordes generation', { timeout: 120_000 }, () => {
	const dealt = new Map<string, CordesPuzzle[]>();

	/** Boards of one shape, dealt once and shared between the assertions below. */
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

		it(`${diff.label}: every board ships a legal answer and enough forced detours`, () => {
			const boards = sample(diff);
			for (const p of boards) expectLegalBoard(p, diff.ropes);
			// The detour target is rejection sampling, so it is reached, not guaranteed.
			const reached = boards.filter((p) => hardCount(p) >= diff.hard).length;
			expect(reached).toBeGreaterThanOrEqual(36); // 90%
		});
	}

	it('hard tiers carry their fence: one peg seals an edge, none touches it', () => {
		for (const key of ['difficile', 'expert']) {
			for (const p of sample(DIFFS[key], 20)) {
				const edge = (peg: Pt): number => Math.min(peg.x, 1 - peg.x, peg.y, 1 - peg.y);
				const sealed = p.ends.flat().filter((peg) => edge(peg) < CLEAR * p.pegR);
				expect(sealed.length).toBeGreaterThanOrEqual(1);
			}
		}
	});

	it('a harder tier is never a flatter board', () => {
		const boards = [...DIFF_ORDER, 'expert'].map((k) => sample(DIFFS[k]));
		const got = boards.map((b) => meanBy(b, hardCount));
		for (let i = 1; i < got.length; i++) expect(got[i]).toBeGreaterThan(got[i - 1]);
	});

	it('every level 1-200 deals a legal board', () => {
		for (const level of [1, 30, 60, 90, 120, 180]) {
			const { diff } = cordesLevels.config(level);
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

		it(`${diff.label}: hints finish the board, one rope at a time`, { timeout: 60_000 }, () => {
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
