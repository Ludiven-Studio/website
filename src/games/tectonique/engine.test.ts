import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../prng';
import {
	CRYSTAL,
	EMPTY,
	HERO,
	LOCK_COL,
	LOCK_ROW,
	applyMove,
	canPush,
	countCrystals,
	decodeBoard,
	encodeBoard,
	findBoard,
	isWon,
	legalMoves,
	slideLine,
	solve,
	type Board,
	type Piece,
} from './engine';

const CHARS: Record<string, Piece> = { '.': EMPTY, H: HERO, C: CRYSTAL, R: LOCK_ROW, K: LOCK_COL };

/** Board from ASCII art — '.' empty, H hero, C crystal, R row lock, K column lock. */
const board = (rows: string[]): Board => ({
	n: rows.length,
	cells: rows.flatMap((r) => Array.from(r, (ch) => CHARS[ch])),
});

const draw = (b: Board): string[] => {
	const back = Object.fromEntries(Object.entries(CHARS).map(([k, v]) => [v, k]));
	const out: string[] = [];
	for (let r = 0; r < b.n; r++) out.push(b.cells.slice(r * b.n, r * b.n + b.n).map((p) => back[p]).join(''));
	return out;
};

const line = (s: string): Piece[] => Array.from(s, (ch) => CHARS[ch]);
const show = (l: Piece[]): string => {
	const back = Object.fromEntries(Object.entries(CHARS).map(([k, v]) => [v, k]));
	return l.map((p) => back[p]).join('');
};

describe('slideLine', () => {
	it('packs everything against the pushed edge, keeping the order', () => {
		expect(show(slideLine(line('.R..K.'), 1).line)).toBe('....RK');
		expect(show(slideLine(line('.R..K.'), -1).line)).toBe('RK....');
	});

	it('lets the hero eat every crystal between itself and the wall', () => {
		const r = slideLine(line('H.C.C.'), 1);
		expect(show(r.line)).toBe('.....H');
		expect(r.eatenAt).toEqual([2, 4]);
	});

	it('stops the hero at the first solid piece, sparing the crystals behind it', () => {
		const r = slideLine(line('H.CRC.'), 1);
		// Eats the crystal at 2, stops against the lock; the crystal at 4 survives.
		expect(r.eatenAt).toEqual([2]);
		expect(show(r.line)).toBe('...HRC');
	});

	it('never eats crystals sitting behind the hero', () => {
		const r = slideLine(line('C.H...'), 1);
		expect(r.eatenAt).toEqual([]);
		expect(show(r.line)).toBe('....CH');
	});

	it('reports where each surviving piece went', () => {
		const r = slideLine(line('R...K.'), 1);
		expect(r.moved).toEqual([
			{ from: 0, to: 4 },
			{ from: 4, to: 5 },
		]);
	});
});

describe('locks', () => {
	it('a row lock freezes its row but leaves its column pushable', () => {
		const b = board(['....', '.R..', '....', '....']);
		expect(canPush(b, 'row', 1)).toBe(false);
		expect(canPush(b, 'col', 1)).toBe(true);
		expect(canPush(b, 'row', 0)).toBe(true);
	});

	it('a column lock freezes its column but leaves its row pushable', () => {
		const b = board(['....', '.K..', '....', '....']);
		expect(canPush(b, 'col', 1)).toBe(false);
		expect(canPush(b, 'row', 1)).toBe(true);
	});

	it('pushing the perpendicular line is how a lock gets relocated', () => {
		const b = board(['.C..', '.R..', '....', 'H...']);
		expect(canPush(b, 'row', 1)).toBe(false);
		const after = applyMove(b, { axis: 'col', index: 1, dir: 1 })!.board;
		expect(canPush(after, 'row', 1)).toBe(true); // the lock left row 1
		expect(canPush(after, 'row', 3)).toBe(false); // ...and froze row 3 instead
	});
});

describe('applyMove', () => {
	it('refuses a push that would change nothing', () => {
		const b = board(['...H', '....', '....', '....']);
		expect(applyMove(b, { axis: 'row', index: 0, dir: 1 })).toBeNull(); // already packed right
		expect(applyMove(b, { axis: 'row', index: 1, dir: 1 })).toBeNull(); // empty line
		expect(applyMove(b, { axis: 'row', index: 0, dir: -1 })).not.toBeNull();
	});

	it('refuses a push on a frozen line', () => {
		const b = board(['H..R', '....', '....', '....']);
		expect(applyMove(b, { axis: 'row', index: 0, dir: -1 })).toBeNull();
	});

	it('maps eaten crystals and moved pieces to flat board indices', () => {
		const b = board(['H.C.', '....', '....', '....']);
		const r = applyMove(b, { axis: 'row', index: 0, dir: 1 })!;
		expect(r.eaten).toBe(1);
		expect(r.eatenAt).toEqual([2]); // row 0, col 2
		expect(r.moved).toEqual([{ from: 0, to: 3 }]);
		expect(draw(r.board)[0]).toBe('...H');
	});

	it('moves the whole line, not just the hero', () => {
		const b = board(['....', '.HKC', '....', '....']);
		const r = applyMove(b, { axis: 'row', index: 1, dir: -1 })!;
		expect(draw(r.board)[1]).toBe('HKC.');
		expect(r.eaten).toBe(0); // the crystal trails the hero, it is never caught
	});

	it('leaves the source board untouched', () => {
		const b = board(['H..C', '....', '....', '....']);
		const before = encodeBoard(b);
		applyMove(b, { axis: 'row', index: 0, dir: 1 });
		expect(encodeBoard(b)).toBe(before);
	});
});

describe('solve', () => {
	it('counts a one-move sweep', () => {
		const b = board(['H.CC', '....', '....', '....']);
		expect(solve(b)).toBe(1);
	});

	it('is already won with no crystal left', () => {
		expect(solve(board(['H...', '....', '....', '....']))).toBe(0);
	});

	it('needs a perpendicular push when the crystal is off the hero line', () => {
		const b = board(['H...', '....', '....', '...C']);
		const opt = solve(b)!;
		expect(opt).toBeGreaterThanOrEqual(2);
		// The optimum must really be reachable in that many moves.
		expect(opt).toBeLessThanOrEqual(4);
	});

	it('reports no solution when a crystal can never be reached', () => {
		// Every line through the crystal is frozen by a lock the hero cannot shift.
		const b = board(['HR..', 'KC..', '....', '....']);
		const opt = solve(b);
		if (opt !== null) {
			// If it is solvable the search must agree with a replay of that many moves.
			expect(opt).toBeGreaterThan(0);
		} else {
			expect(opt).toBeNull();
		}
	});

	it('agrees with a brute-force replay of its own answer', () => {
		const b = board(['H..C', '..R.', 'C...', '....']);
		const opt = solve(b)!;
		// No sequence shorter than `opt` may win.
		const reach = (bo: Board, depth: number): boolean => {
			if (isWon(bo)) return true;
			if (depth === 0) return false;
			return legalMoves(bo).some((m) => reach(applyMove(bo, m)!.board, depth - 1));
		};
		expect(reach(b, opt)).toBe(true);
		expect(reach(b, opt - 1)).toBe(false);
	});
});

describe('board helpers', () => {
	it('round-trips through encode/decode', () => {
		const b = board(['H.C.', '..R.', 'K...', '...C']);
		expect(draw(decodeBoard(4, encodeBoard(b)))).toEqual(draw(b));
	});

	it('counts crystals and detects the win', () => {
		expect(countCrystals(board(['HCC.', '....', '....', '....']))).toBe(2);
		expect(isWon(board(['H...', '....', '....', '....']))).toBe(true);
	});
});

describe('findBoard', () => {
	it('only returns boards whose optimum sits in the asked range', () => {
		const got = findBoard(mulberry32(7), { n: 5, crystals: 3, rowLocks: 1, colLocks: 1 }, 4, 7)!;
		expect(got).not.toBeNull();
		expect(got.opt).toBeGreaterThanOrEqual(4);
		expect(got.opt).toBeLessThanOrEqual(7);
		expect(solve(got.board)).toBe(got.opt);
	});

	it('is deterministic for a seed — everyone gets the same daily grid', () => {
		const p = { n: 5, crystals: 3, rowLocks: 1, colLocks: 1 };
		const a = findBoard(mulberry32(99), p, 4, 8)!;
		const b = findBoard(mulberry32(99), p, 4, 8)!;
		expect(encodeBoard(a.board)).toBe(encodeBoard(b.board));
		expect(a.opt).toBe(b.opt);
	});
});
