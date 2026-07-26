import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../prng';
import {
	cloneBoard,
	countCrystals,
	decodeBoard,
	encodeBoard,
	generate,
	generateDetailed,
	heroIndex,
	isWon,
	movers,
	slack,
	slide,
	HERO,
	LOCK_ALL,
	LOCK_COL,
	LOCK_ROW,
	PLATE,
	ROCK,
	VOID,
	type Board,
	type GenParams,
	type Tile,
} from './engine';
import { TECTONIQUE_BANDS, tectoniqueLevels } from './levels';
import { LEVEL_COUNT } from '../../lib/progression';

/** '.' void · '#' crate · 'H' hero · 'O' rock · 'R'/'K'/'B' post holding the row / the column / both.
    Crystals come as a second block, '*'. */
const TILE: Record<string, Tile> = {
	'.': VOID, '#': PLATE, H: HERO, R: LOCK_ROW, K: LOCK_COL, B: LOCK_ALL, O: ROCK,
};

function board(rows: string[], gems: string[] = []): Board {
	const n = rows.length;
	const floor = rows.flatMap((r) => Array.from(r, (ch) => TILE[ch]));
	const crystals = gems.length
		? gems.flatMap((r) => Array.from(r, (ch) => ch === '*'))
		: new Array<boolean>(n * n).fill(false);
	return { n, floor, crystals };
}

const BACK: Record<number, string> = {
	[VOID]: '.', [PLATE]: '#', [HERO]: 'H', [LOCK_ROW]: 'R', [LOCK_COL]: 'K', [LOCK_ALL]: 'B', [ROCK]: 'O',
};

const show = (b: Board): string[] => {
	const out: string[] = [];
	for (let r = 0; r < b.n; r++) out.push(b.floor.slice(r * b.n, r * b.n + b.n).map((t) => BACK[t]).join(''));
	return out;
};

describe('slack', () => {
	it('measures the room left on both sides of a line', () => {
		expect(slack(board(['.##.', '....', '....', '....']), 'row', 0)).toEqual({ min: -1, max: 1 });
	});

	it('counts the holes inside a line — the crates close them as they pile up', () => {
		expect(slack(board(['#..#', '....', '....', '....']), 'row', 0)).toEqual({ min: -2, max: 2 });
	});

	it('is zero on an empty line', () => {
		expect(slack(board(['....', '....', '....', '....']), 'row', 2)).toEqual({ min: 0, max: 0 });
	});

	it('is zero on the side where a rock already touches the wall', () => {
		expect(slack(board(['O#..', '....', '....', '....']), 'row', 0)).toEqual({ min: 0, max: 2 });
	});

	it('lets the other axis carry a post away', () => {
		const b = board(['R#..', '....', '....', '....']);
		expect(show(slide(b, 'col', 0, 3).board)).toEqual(['.#..', '....', '....', 'R...']);
	});

	it('nails a line down whole when a post holds it', () => {
		expect(slack(board(['R#..', '....', '....', '....']), 'row', 0)).toEqual({ min: 0, max: 0 });
		expect(slack(board(['B...', '....', '....', '....']), 'col', 0)).toEqual({ min: 0, max: 0 });
	});

	it('caps the slide at what a rock can do, since the floor carries it', () => {
		// The rock has a single cell left before the wall, so the whole line slides one — no more.
		expect(slack(board(['#.O.', '....', '....', '....']), 'row', 0)).toEqual({ min: -1, max: 1 });
		expect(show(slide(board(['#.O.', '....', '....', '....']), 'row', 0, 3).board)[0]).toBe('.#.O');
	});
});

describe('slide', () => {
	it('keeps the gaps while nothing jams', () => {
		expect(show(slide(board(['#.#.', '....', '....', '....']), 'row', 0, 1).board)[0]).toBe('.#.#');
	});

	it('packs everything against the wall on a full push', () => {
		const r = slide(board(['#.#.', '....', '....', '....']), 'row', 0, 4);
		expect(show(r.board)[0]).toBe('..##');
		expect(r.shift).toBe(2); // the line travels as far as its furthest piece
	});

	it('lets a crate fall behind the floor, which is what stacks them', () => {
		// The floor slides 2, the rock rides it the full 2, but the crate jams on the wall
		// after 1 — it has slid one cell back across the floor.
		const r = slide(board(['O.#.', '....', '....', '....']), 'row', 0, 3);
		expect(show(r.board)[0]).toBe('..O#');
		expect(r.shift).toBe(2);
		expect(r.moves).toEqual([{ from: 0, to: 2 }, { from: 2, to: 3 }]);
	});

	it('carries a rock the whole way, since it rides the floor', () => {
		expect(show(slide(board(['#.O.', '....', '....', '....']), 'col', 2, 3).board)).toEqual(
			['#...', '....', '....', '..O.'],
		);
	});

	it('returns the very same board when nothing can move', () => {
		const b = board(['R#..', '....', '....', '....']);
		const r = slide(b, 'row', 0, -1);
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

	it('takes a nudge back while nothing jams', () => {
		const b = board(['.H#.', '..#.', '....', '....']);
		const there = slide(b, 'row', 0, 1).board;
		expect(show(slide(there, 'row', 0, -1).board)).toEqual(show(b));
	});

	it('never gives the gaps back once they are packed', () => {
		const there = slide(board(['#.#.', '....', '....', '....']), 'row', 0, 3).board;
		expect(show(slide(there, 'row', 0, -3).board)[0]).toBe('##..');
	});
});

describe('piece trips', () => {
	// Whatever draws the pieces has to follow `moves`. Shifting the whole line by `shift`
	// instead used to overlap the jammed pieces and walk the end of the line off the grid.
	it('leaves a jammed piece out of the trips', () => {
		const r = slide(board(['#..#', '....', '....', '....']), 'row', 0, 4);
		expect(show(r.board)[0]).toBe('..##');
		expect(r.shift).toBe(2);
		expect(r.moves).toEqual([{ from: 0, to: 2 }]); // the crate already on the wall never budged
	});

	it('stays on the board across a whole generated walk', () => {
		let jams = 0; // slides where a piece stayed put while the line moved — the case that broke
		for (const p of TECTONIQUE_BANDS) {
			const { board: start, walk } = generateDetailed(mulberry32(11), p);
			let b = start;
			let drawn = new Map<number, Tile>(start.floor.flatMap((t, i) => (t === VOID ? [] : [[i, t]])));
			for (const m of walk) {
				const r = slide(b, m.axis, m.index, m.shift);
				const onLine = b.floor.filter((t, i) =>
					t !== VOID && (m.axis === 'row' ? Math.floor(i / b.n) === m.index : i % b.n === m.index));
				if (r.shift && r.moves.length < onLine.length) jams++;

				const next = new Map(drawn);
				for (const mv of r.moves) next.delete(mv.from);
				for (const mv of r.moves) next.set(mv.to, drawn.get(mv.from) as Tile);
				drawn = next;
				b = r.board;
			}
			expect([...drawn].sort((x, y) => x[0] - y[0])).toEqual(
				b.floor.flatMap((t, i) => (t === VOID ? [] : [[i, t]])),
			);
		}
		expect(jams).toBeGreaterThan(0);
	});
});

describe('movers', () => {
	it('leaves out the crate that is already against the wall', () => {
		expect(movers(board(['#..#', '....', '....', '....']), 'row', 0, 1)).toEqual([0]);
	});

	it('names nobody when a jammed rock caps the line', () => {
		expect(movers(board(['..O#', '....', '....', '....']), 'row', 0, 1)).toEqual([]);
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
	const params: GenParams = { n: 8, crystals: 6, rowLocks: 2, colLocks: 2, allLocks: 1, rocks: 3, holes: 5 };

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
		expect(b.floor.filter((t) => t === LOCK_ALL)).toHaveLength(1);
		expect(b.floor.filter((t) => t === ROCK)).toHaveLength(3);
	});

	it('never drops a crystal under the hero', () => {
		for (let s = 0; s < 30; s++) {
			const b = generate(mulberry32(s), params);
			expect(b.crystals[heroIndex(b)]).toBe(false);
		}
	});

	it('always leaves some line able to move', () => {
		for (const p of TECTONIQUE_BANDS) {
			for (let s = 0; s < 30; s++) expect(movableLines(generate(mulberry32(s), p))).toBeGreaterThan(0);
		}
	});

	// The walk is the only proof the grid is solvable — packing makes moves final, so replaying
	// it has to still clear every crystal on every band and every level we ship.
	it('ships a walk that clears all 100 levels', () => {
		for (let l = 1; l <= LEVEL_COUNT; l++) {
			const cfg = tectoniqueLevels.config(l);
			const { board: start, walk } = generateDetailed(mulberry32(cfg.seed), cfg);
			expect(countCrystals(start)).toBe(cfg.crystals);
			let b = start;
			for (const m of walk) b = slide(b, m.axis, m.index, m.shift).board;
			expect(isWon(b), `level ${l}`).toBe(true);
		}
	});

	it('ships a walk that eats every crystal it dropped', () => {
		for (const p of TECTONIQUE_BANDS) {
			for (let s = 0; s < 20; s++) {
				const { board: start, walk } = generateDetailed(mulberry32(300 + s), p);
				expect(countCrystals(start)).toBe(p.crystals);
				let b = start;
				for (const m of walk) b = slide(b, m.axis, m.index, m.shift).board;
				expect(isWon(b)).toBe(true);
			}
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

