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

const src = (rot: number, mask?: number): Piece => ({ type: 'source', rot, mask, fixed: true });
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
	// PRISM_BEND: dir offsets per bend slot — left, straight, right of travel.
	const BEND = [3, 0, 1];

	it('splits white from EVERY face; rot cycles which colour bends where', () => {
		for (let rot = 0; rot < 3; rot++)
			for (let d = 0; d < 4; d++) {
				const b = empty(3);
				b[(1 - STEP[d][0]) * 3 + (1 - STEP[d][1])] = src(d);
				b[4] = prism(rot);
				const outIdx = (ch: number): number => {
					const o = (d + BEND[(ch + rot) % 3]) % 4;
					return (1 + STEP[o][0]) * 3 + (1 + STEP[o][1]);
				};
				for (let ch = 0; ch < 3; ch++) b[outIdx(ch)] = sensor();
				const t = trace(3, b);
				for (let ch = 0; ch < 3; ch++) expect(t.sensorMask.get(outIdx(ch))).toBe(1 << ch);
			}
	});

	it('never sends a channel back toward the source', () => {
		for (let rot = 0; rot < 3; rot++) {
			const b = empty(3);
			b[3] = src(1); // (1,0) fires E into the prism
			b[4] = prism(rot);
			const t = trace(3, b);
			// No segment leaves the prism travelling W (back along the entry).
			expect(t.segments.some((s) => s.r0 === 1 && s.c0 === 1 && s.c1 < 1)).toBe(false);
		}
	});

	it('a red-only ray through a second prism still turns left', () => {
		const b = empty(3);
		b[3] = src(1); // (1,0) fires E, white
		b[4] = prism(0); // (1,1): R left (N), G straight (E), B right (S)
		b[1] = prism(0); // (0,1) catches the red going N: red-only, turns left again (W)
		b[0] = sensor(); // (0,0)
		b[5] = sensor(); // (1,2): green went straight
		b[7] = sensor(); // (2,1): blue turned right (S)
		const t = trace(3, b);
		expect(t.sensorMask.get(0)).toBe(1);
		expect(t.sensorMask.get(5)).toBe(2);
		expect(t.sensorMask.get(7)).toBe(4);
	});
});

describe('lumen coloured sources', () => {
	it('a coloured source emits only its mask', () => {
		const b = empty(3);
		b[3] = src(1, 1); // (1,0) fires E, red only
		b[5] = sensor();
		const t = trace(3, b);
		expect(t.sensorMask.get(5)).toBe(1);
	});

	it('two primaries mix on one sensor without any prism', () => {
		const b = empty(3);
		b[3] = src(1, 1); // (1,0) red fires E
		b[7] = src(0, 4); // (2,1) blue fires N
		b[4] = sensor(); // (1,1): red + blue = magenta
		expect(trace(3, b).sensorMask.get(4)).toBe(5);
	});

	it('a coloured source through a prism keeps only its channel', () => {
		const b = empty(3);
		b[3] = src(1, 4); // (1,0) blue fires E
		b[4] = prism(0); // blue bends right (S)
		b[7] = sensor(); // (2,1)
		const t = trace(3, b);
		expect(t.sensorMask.get(7)).toBe(4);
		expect(t.sensorMask.size).toBe(1);
	});
});

describe('lumen mixing and sensors', () => {
	it('accumulates additively: R and G land on one sensor as yellow (3)', () => {
		const b = empty(3);
		b[3] = src(1); // (1,0) E
		b[4] = prism(0); // (1,1): G -> E, R -> N, B -> S
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

	it('colours sources as distinct primaries, and some facile deals stay white', () => {
		let coloured = 0, white = 0;
		for (let s = 0; s < 30; s++) {
			const p = generateLumen(DIFFS.facile, mulberry32(9000 + s * 41));
			const masks = p.fixed
				.filter((f) => f.piece.type === 'source')
				.map((f) => f.piece.mask ?? 7);
			if (masks.every((m) => m === 7)) { white++; continue; }
			coloured++;
			for (const m of masks) expect([1, 2, 4]).toContain(m);
			expect(new Set(masks).size).toBe(masks.length);
		}
		expect(coloured).toBeGreaterThan(0);
		expect(white).toBeGreaterThan(0);
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

describe('lumen scattered start', () => {
	for (const key of Object.keys(DIFFS)) {
		const diff = DIFFS[key];

		it(`${diff.label}: every piece opens on the board, off the solution, unsolved`, () => {
			for (let s = 0; s < 10; s++) {
				const p = generateLumen(diff, mulberry32(4400 + s * 23 + diff.size));
				expect(p.start.length).toBe(p.tray.length);

				const fixedCells = new Set(p.fixed.map((f) => f.idx));
				const solCells = new Set(p.solution.map((sl) => sl.idx));
				const used = new Set<number>();
				for (let i = 0; i < p.start.length; i++) {
					const pl = p.start[i];
					expect(fixedCells.has(pl.idx)).toBe(false);
					expect(solCells.has(pl.idx)).toBe(false);
					expect(used.has(pl.idx)).toBe(false);
					used.add(pl.idx);
					expect(pl.rot).toBeGreaterThanOrEqual(0);
					expect(pl.rot).toBeLessThan(ROTS[p.tray[i].type]);
				}
				expect(isSolved(p, p.start)).toBe(false);
			}
		});

		it(`${diff.label}: from the scatter, hints repair then place and win`, () => {
			for (let s = 0; s < 4; s++) {
				const p = generateLumen(diff, mulberry32(4700 + s * 19 + diff.size));
				let placements: (Placement | null)[] = p.start.map((pl) => ({ ...pl }));
				let steps = 0;
				for (;;) {
					const h = findHint(p, placements);
					if (!h) break;
					placements = applyHint(placements, h);
					// Worst case: one remove + one place per scattered piece.
					expect(++steps).toBeLessThanOrEqual(2 * p.solution.length);
				}
				expect(isSolved(p, placements)).toBe(true);
			}
		});
	}
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
		expect(rotCW('prism', 2)).toBe(0);
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
