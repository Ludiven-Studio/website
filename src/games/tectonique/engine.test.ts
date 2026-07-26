import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../prng';
import {
	cloneBoard,
	countCrystals,
	decodeBoard,
	encodeBoard,
	frozen,
	generate,
	generateDetailed,
	heroIndex,
	isWon,
	slack,
	slide,
	HERO,
	LOCK_COL,
	LOCK_ROW,
	PLATE,
	VOID,
	type Board,
	type GenParams,
	type Tile,
} from './engine';

/** '.' void · '#' slab · 'H' hero · 'R' row lock · 'K' column lock. Crystals come as a second block, '*'. */
const TILE: Record<string, Tile> = { '.': VOID, '#': PLATE, H: HERO, R: LOCK_ROW, K: LOCK_COL };

function board(rows: string[], gems: string[] = []): Board {
	const n = rows.length;
	const floor = rows.flatMap((r) => Array.from(r, (ch) => TILE[ch]));
	const crystals = gems.length
		? gems.flatMap((r) => Array.from(r, (ch) => ch === '*'))
		: new Array<boolean>(n * n).fill(false);
	return { n, floor, crystals };
}

const BACK: Record<number, string> = { [VOID]: '.', [PLATE]: '#', [HERO]: 'H', [LOCK_ROW]: 'R', [LOCK_COL]: 'K' };

const show = (b: Board): string[] => {
	const out: string[] = [];
	for (let r = 0; r < b.n; r++) out.push(b.floor.slice(r * b.n, r * b.n + b.n).map((t) => BACK[t]).join(''));
	return out;
};

describe('slack', () => {
	it('measures the room left on both sides of a line', () => {
		expect(slack(board(['.##.', '....', '....', '....']), 'row', 0)).toEqual({ min: -1, max: 1 });
	});

	it('ignores the holes inside a line — only the outermost slabs matter', () => {
		expect(slack(board(['#..#', '....', '....', '....']), 'row', 0)).toEqual({ min: 0, max: 0 });
	});

	it('is zero on an empty line', () => {
		expect(slack(board(['....', '....', '....', '....']), 'row', 2)).toEqual({ min: 0, max: 0 });
	});

	it('is zero on a frozen line', () => {
		const b = board(['R#..', '....', '....', '....']);
		expect(frozen(b, 'row', 0)).toBe(true);
		expect(slack(b, 'row', 0)).toEqual({ min: 0, max: 0 });
	});

	it('lets the other axis carry a lock away and thaw the line', () => {
		const b = board(['R#..', '....', '....', '....']);
		expect(frozen(b, 'col', 0)).toBe(false);
		expect(frozen(slide(b, 'col', 0, 3).board, 'row', 0)).toBe(false);
	});
});

describe('slide', () => {
	it('translates the whole line and keeps the gaps', () => {
		expect(show(slide(board(['#.#.', '....', '....', '....']), 'row', 0, 1).board)[0]).toBe('.#.#');
	});

	it('clamps at the wall instead of squashing', () => {
		const r = slide(board(['##..', '....', '....', '....']), 'row', 0, 5);
		expect(r.shift).toBe(2);
		expect(show(r.board)[0]).toBe('..##');
	});

	it('returns the very same board when nothing can move', () => {
		const b = board(['R#..', '....', '....', '....']);
		const r = slide(b, 'row', 0, 1);
		expect(r.board).toBe(b);
		expect(r.shift).toBe(0);
	});

	it('moves columns too', () => {
		const b = board(['#...', '#...', '....', '....']);
		expect(show(slide(b, 'col', 0, 2).board)).toEqual(['....', '....', '#...', '#...']);
	});

	it('eats every crystal the hero sweeps, endpoints included', () => {
		const b = board(['H#..', '....', '....', '....'], ['.**.', '....', '....', '....']);
		const r = slide(b, 'row', 0, 2);
		expect(r.eaten.slice().sort()).toEqual([1, 2]);
		expect(countCrystals(r.board)).toBe(0);
	});

	it('leaves the crystals where they are — they never ride the floor', () => {
		const b = board(['H#..', '....', '....', '....'], ['....', '..*.', '....', '....']);
		const r = slide(b, 'row', 0, 2);
		expect(r.board.crystals[6]).toBe(true);
		expect(r.eaten).toEqual([]);
	});

	it('does not eat under a line the hero is not on', () => {
		const b = board(['H#..', '##..', '....', '....'], ['....', '.*..', '....', '....']);
		expect(slide(b, 'row', 1, 2).eaten).toEqual([]);
	});

	it('eats backwards as well', () => {
		const b = board(['..#H', '....', '....', '....'], ['.**.', '....', '....', '....']);
		expect(slide(b, 'row', 0, -2).eaten.slice().sort()).toEqual([1, 2]);
	});

	it('is reversible on the floor, so the puzzle has no dead end', () => {
		const b = board(['.H#.', '..#.', '....', '....']);
		const there = slide(b, 'row', 0, 1).board;
		expect(show(slide(there, 'row', 0, -1).board)).toEqual(show(b));
	});
});

describe('board helpers', () => {
	it('reads the hero position and the win condition', () => {
		const b = board(['H#..', '....', '....', '....'], ['..*.', '....', '....', '....']);
		expect(heroIndex(b)).toBe(0);
		expect(isWon(b)).toBe(false);
		expect(isWon(slide(b, 'row', 0, 2).board)).toBe(true);
	});

	it('round-trips through encode/decode', () => {
		const b = board(['H#..', '..R.', '.K..', '....'], ['..*.', '....', '*...', '....']);
		expect(decodeBoard(4, encodeBoard(b))).toEqual(b);
	});

	it('clones without sharing the layers', () => {
		const b = board(['H#..', '....', '....', '....'], ['.*..', '....', '....', '....']);
		const c = cloneBoard(b);
		c.floor[0] = VOID;
		c.crystals[1] = false;
		expect(b.floor[0]).toBe(HERO);
		expect(b.crystals[1]).toBe(true);
	});
});

describe('generate', () => {
	const params: GenParams = { n: 8, crystals: 6, rowLocks: 2, colLocks: 2, holes: 5 };

	it('is deterministic for a given seed', () => {
		expect(encodeBoard(generate(mulberry32(7), params))).toBe(encodeBoard(generate(mulberry32(7), params)));
	});

	it('lays out the asked-for pieces', () => {
		const b = generate(mulberry32(42), params);
		expect(b.n).toBe(8);
		expect(countCrystals(b)).toBe(6);
		expect(b.floor.filter((t) => t === HERO)).toHaveLength(1);
		expect(b.floor.filter((t) => t === LOCK_ROW)).toHaveLength(2);
		expect(b.floor.filter((t) => t === LOCK_COL)).toHaveLength(2);
	});

	it('never drops a crystal under the hero', () => {
		for (let s = 0; s < 30; s++) {
			const b = generate(mulberry32(s), params);
			expect(b.crystals[heroIndex(b)]).toBe(false);
		}
	});

	it('always leaves some line able to move', () => {
		for (let s = 0; s < 30; s++) {
			const b = generate(mulberry32(s), params);
			expect(movableLines(b)).toBeGreaterThan(0);
		}
	});

	it('ships a walk that eats every crystal it dropped', () => {
		for (let s = 0; s < 20; s++) {
			const { board: start, walk } = generateDetailed(mulberry32(300 + s), params);
			expect(countCrystals(start)).toBe(params.crystals);
			let b = start;
			for (const m of walk) b = slide(b, m.axis, m.index, m.shift).board;
			expect(isWon(b)).toBe(true);
		}
	});
});

function movableLines(b: Board): number {
	let count = 0;
	for (let i = 0; i < b.n; i++) {
		for (const axis of ['row', 'col'] as const) {
			const sl = slack(b, axis, i);
			if (sl.min < 0 || sl.max > 0) count++;
		}
	}
	return count;
}

