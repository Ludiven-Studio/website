import { describe, it, expect } from 'vitest';
import {
	DIFFS,
	DIFF_ORDER,
	ROTS,
	STEP,
	applyHint,
	boardFrom,
	findHint,
	generateLumen,
	isSolved,
	rotCW,
	trace,
	type LumenPuzzle,
	type Piece,
	type Placement,
} from './engine';
import { mulberry32, dateSeed } from '../prng';

const src = (rot: number): Piece => ({ type: 'source', rot, fixed: true });
const sensor = (expect = 0): Piece => ({ type: 'sensor', rot: 0, expect, fixed: true });
const mirror = (rot: number): Piece => ({ type: 'mirror', rot, fixed: false });
const prism = (rot: number): Piece => ({ type: 'prism', rot, fixed: false });

const empty = (size: number): (Piece | null)[] => new Array(size * size).fill(null);

/** Placements that replay the shipped construction (tray is shuffled, match by type). */
function solutionPlacements(p: LumenPuzzle): (Placement | null)[] {
	const used = new Set<number>();
	return p.tray.map((tp) => {
		const j = p.solution.findIndex((s, k) => !used.has(k) && s.type === tp.type);
		expect(j).toBeGreaterThanOrEqual(0);
		used.add(j);
		return { idx: p.solution[j].idx, rot: p.solution[j].rot };
	});
}

describe('lumen mirrors', () => {
	// rot 0 = `/`, rot 1 = `\`: expected outgoing travel dir per incoming travel dir.
	const TABLE = [[1, 0, 3, 2], [3, 2, 1, 0]];

	it('reflects every incoming direction per the / and \\ tables', () => {
		for (const rot of [0, 1])
			for (let d = 0; d < 4; d++) {
				const out = TABLE[rot][d];
				const b = empty(3);
				b[(1 - STEP[d][0]) * 3 + (1 - STEP[d][1])] = src(d);
				b[4] = mirror(rot);
				const target = (1 + STEP[out][0]) * 3 + (1 + STEP[out][1]);
				b[target] = sensor();
				const t = trace(3, b);
				expect(t.sensorMask.get(target)).toBe(7);
				expect(t.sensorMask.size).toBe(1);
			}
	});
});

describe('lumen prisms', () => {
	it('splits white through the input face: G straight, R left, B right', () => {
		for (let rot = 0; rot < 4; rot++) {
			const a = (rot + 2) % 4; // accepted travel direction
			const b = empty(3);
			b[(1 - STEP[a][0]) * 3 + (1 - STEP[a][1])] = src(a);
			b[4] = prism(rot);
			const gIdx = (1 + STEP[a][0]) * 3 + (1 + STEP[a][1]);
			const rIdx = (1 + STEP[(a + 3) % 4][0]) * 3 + (1 + STEP[(a + 3) % 4][1]);
			const bIdx = (1 + STEP[(a + 1) % 4][0]) * 3 + (1 + STEP[(a + 1) % 4][1]);
			b[gIdx] = sensor();
			b[rIdx] = sensor();
			b[bIdx] = sensor();
			const t = trace(3, b);
			expect(t.sensorMask.get(gIdx)).toBe(2);
			expect(t.sensorMask.get(rIdx)).toBe(1);
			expect(t.sensorMask.get(bIdx)).toBe(4);
		}
	});

	it('absorbs rays hitting any other face', () => {
		for (let rot = 0; rot < 4; rot++)
			for (let d = 0; d < 4; d++) {
				if (d === (rot + 2) % 4) continue;
				const b = empty(3);
				const sIdx = (1 - STEP[d][0]) * 3 + (1 - STEP[d][1]);
				b[sIdx] = src(d);
				b[4] = prism(rot);
				for (let i = 0; i < 9; i++) if (i !== 4 && i !== sIdx && b[i] === null) b[i] = sensor();
				expect(trace(3, b).sensorMask.size).toBe(0);
			}
	});

	it('a red-only ray through a second prism still turns left', () => {
		const b = empty(3);
		b[3] = src(1); // (1,0) fires E, white
		b[4] = prism(3); // (1,1) input face W: splits
		b[1] = prism(2); // (0,1) input face S: catches the red going N
		b[0] = sensor(); // (0,0): red turned left (W)
		b[5] = sensor(); // (1,2): green went straight
		b[7] = sensor(); // (2,1): blue turned right (S)
		const t = trace(3, b);
		expect(t.sensorMask.get(0)).toBe(1);
		expect(t.sensorMask.get(5)).toBe(2);
		expect(t.sensorMask.get(7)).toBe(4);
	});
});

describe('lumen mixing and sensors', () => {
	it('accumulates additively: R and G land on one sensor as yellow (3)', () => {
		const b = empty(3);
		b[3] = src(1); // (1,0) E
		b[4] = prism(3); // (1,1): G -> E, R -> N, B -> S
		b[1] = mirror(0); // (0,1) `/`: red N -> E
		b[2] = mirror(1); // (0,2) `\`: red E -> S
		b[5] = sensor(); // (1,2): green from the W, red from the N
		expect(trace(3, b).sensorMask.get(5)).toBe(3);
	});

	it('a sensor stops the beam', () => {
		const b = empty(3);
		b[3] = src(1);
		b[4] = sensor();
		b[5] = sensor();
		const t = trace(3, b);
		expect(t.sensorMask.get(4)).toBe(7);
		expect(t.sensorMask.has(5)).toBe(false);
	});
});

describe('lumen trace termination', () => {
	it('a closed square of four mirrors terminates (absorbed back at the source)', () => {
		const b = empty(5);
		b[2 * 5] = src(0); // (2,0) fires N along the west leg
		b[0] = mirror(0); // (0,0) `/`: N -> E
		b[4] = mirror(1); // (0,4) `\`: E -> S
		b[24] = mirror(0); // (4,4) `/`: S -> W
		b[20] = mirror(1); // (4,0) `\`: W -> N, back up into the source
		const t = trace(5, b);
		expect(t.segments.length).toBe(5);
		const len = t.segments.reduce((a, s) => a + Math.abs(s.r1 - s.r0) + Math.abs(s.c1 - s.c0), 0);
		expect(len).toBe(16); // one full lap of the square
	});

	it('two sources facing each other absorb both beams', () => {
		const b = empty(3);
		b[0] = src(1); // (0,0) E
		b[2] = src(3); // (0,2) W
		const t = trace(3, b);
		expect(t.segments.length).toBe(2);
		for (const s of t.segments) expect(Math.abs(s.c1 - s.c0)).toBe(2);
	});
});

describe('lumen generation', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: solvable by construction, never solved empty, every piece load-bearing`, () => {
			for (let s = 0; s < 10; s++) {
				const p = generateLumen(diff, mulberry32(1200 + s * 37 + diff.size));
				expect(p.size).toBe(diff.size);

				const sensors = p.fixed.filter((f) => f.piece.type === 'sensor');
				expect(sensors.length).toBeGreaterThanOrEqual(1);
				for (const f of sensors) {
					expect(f.piece.expect).toBeGreaterThan(0);
					expect(f.piece.expect).toBeLessThanOrEqual(7);
				}
				expect(p.fixed.some((f) => f.piece.type === 'source')).toBe(true);

				expect(p.tray.length).toBeGreaterThan(0);
				expect(p.tray.length).toBe(p.solution.length);
				const trayTypes = p.tray.map((t) => t.type).sort();
				const solTypes = p.solution.map((t) => t.type).sort();
				expect(trayTypes).toEqual(solTypes);

				const none = new Array<Placement | null>(p.tray.length).fill(null);
				expect(isSolved(p, none)).toBe(false);

				const full = solutionPlacements(p);
				expect(isSolved(p, full)).toBe(true);

				for (let i = 0; i < full.length; i++) {
					const without = full.slice();
					without[i] = null;
					expect(isSolved(p, without)).toBe(false);
				}
			}
		});
	}

	it('respects tier piece budgets', () => {
		for (const key of DIFF_ORDER) {
			const diff = DIFFS[key];
			const p = generateLumen(diff, mulberry32(5150 + diff.size));
			expect(p.tray.filter((t) => t.type === 'mirror').length).toBeLessThanOrEqual(diff.mirrors);
			expect(p.tray.filter((t) => t.type === 'prism').length).toBeLessThanOrEqual(diff.prisms);
			expect(p.fixed.filter((f) => f.piece.type === 'source').length).toBe(diff.sources);
		}
	});

	it('is deterministic: same seed -> identical puzzle', () => {
		const seed = dateSeed(new Date('2026-08-21T00:00:00Z'));
		for (const key of ['facile', 'expert']) {
			const a = generateLumen(DIFFS[key], mulberry32(seed));
			const b = generateLumen(DIFFS[key], mulberry32(seed));
			expect(a).toEqual(b);
		}
	});
});

describe('lumen board assembly', () => {
	it('ignores nulls and never overwrites a fixed cell', () => {
		const p = generateLumen(DIFFS.facile, mulberry32(808));
		const none = new Array<Placement | null>(p.tray.length).fill(null);
		const bare = boardFrom(p, none);
		expect(bare.filter(Boolean).length).toBe(p.fixed.length);

		const onFixed = none.slice();
		onFixed[0] = { idx: p.fixed[0].idx, rot: 0 };
		const b = boardFrom(p, onFixed);
		expect(b[p.fixed[0].idx]).toBe(p.fixed[0].piece);
	});

	it('first placement wins a contested cell', () => {
		const p = generateLumen(DIFFS.facile, mulberry32(808));
		const idx = p.solution[0].idx;
		const both = new Array<Placement | null>(p.tray.length).fill(null);
		both[0] = { idx, rot: 0 };
		both[1] = { idx, rot: 1 };
		const b = boardFrom(p, both);
		expect(b[idx]?.type).toBe(p.tray[0].type);
		expect(b[idx]?.rot).toBe(0);
	});

	it('rotCW wraps per piece type', () => {
		expect(rotCW('mirror', 1)).toBe(0);
		expect(rotCW('prism', 3)).toBe(0);
		expect(rotCW('prism', 0)).toBe(1);
	});
});

describe('lumen hints', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: from empty, hints place the whole solution and win`, () => {
			for (let s = 0; s < 4; s++) {
				const p = generateLumen(diff, mulberry32(300 + s * 17 + diff.size));
				let placements: (Placement | null)[] = new Array(p.tray.length).fill(null);
				let steps = 0;
				for (;;) {
					const h = findHint(p, placements);
					if (!h) break;
					expect(h.kind).toBe('place'); // nothing to repair on a clean board
					expect(h.reason.length).toBeGreaterThan(0);
					placements = applyHint(placements, h);
					expect(++steps).toBeLessThanOrEqual(p.solution.length);
				}
				expect(steps).toBe(p.solution.length);
				expect(isSolved(p, placements)).toBe(true);
				expect(findHint(p, placements)).toBeNull();
			}
		});
	}

	it('a piece on a wrong cell gets pulled back first', () => {
		const p = generateLumen(DIFFS.moyen, mulberry32(9091));
		const solCells = new Set(p.solution.map((s) => s.idx));
		const fixedCells = new Set(p.fixed.map((f) => f.idx));
		let stray = -1;
		for (let i = 0; i < p.size * p.size; i++)
			if (!solCells.has(i) && !fixedCells.has(i)) { stray = i; break; }
		expect(stray).toBeGreaterThanOrEqual(0);

		const placements = new Array<Placement | null>(p.tray.length).fill(null);
		placements[0] = { idx: stray, rot: 0 };
		const h = findHint(p, placements);
		expect(h?.kind).toBe('remove');
		expect((h as { trayIndex: number }).trayIndex).toBe(0);
	});

	it('a wrong rotation on the right cell gets rotated, not removed', () => {
		const p = generateLumen(DIFFS.moyen, mulberry32(9091));
		const slot = p.solution[0];
		const ti = p.tray.findIndex((t) => t.type === slot.type);
		const placements = new Array<Placement | null>(p.tray.length).fill(null);
		placements[ti] = { idx: slot.idx, rot: (slot.rot + 1) % ROTS[slot.type] };
		const h = findHint(p, placements);
		expect(h?.kind).toBe('rotate');
		expect((h as { trayIndex: number; rot: number }).trayIndex).toBe(ti);
		expect((h as { trayIndex: number; rot: number }).rot).toBe(slot.rot);
	});

	it('applyHint never mutates its input', () => {
		const p = generateLumen(DIFFS.facile, mulberry32(77));
		const placements = new Array<Placement | null>(p.tray.length).fill(null);
		const h = findHint(p, placements);
		expect(h).not.toBeNull();
		const next = applyHint(placements, h!);
		expect(placements.every((x) => x === null)).toBe(true);
		expect(next.some((x) => x !== null)).toBe(true);
	});
});
