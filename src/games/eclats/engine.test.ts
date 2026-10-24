import { describe, it, expect } from 'vitest';
import {
	COLS,
	ROWS,
	around,
	createGame,
	digRow,
	endTurn,
	gemAt,
	gravity,
	groundAt,
	hardDrop,
	lockPiece,
	move,
	offsets,
	pieceAt,
	pieceCells,
	resolveWave,
	rotate,
	settle,
	toggleFlag,
	digPioche,
	scanRadar,
	type EclatsCfg,
	type Gem,
	type State,
} from './engine';
import { playBot } from './bot';
import { eclatsLevels, levelConfig } from './levels';
import { PICKS } from './picks';

const CFG: EclatsCfg = {
	seed: 7, colors: 4, depth: 4, treasures: 3, traps: 0, hard: 0, pile: 0, ice: 0, locks: 0,
	fallMs: 900, trios: 0.4, clues: 0, bonusEvery: 1,
};

/** An empty board with no piece and a ground chosen by the test. */
function blank(over: Partial<EclatsCfg> = {}): State {
	const s = createGame({ ...CFG, ...over });
	s.piece = null;
	s.board.fill(null);
	s.ground.treasure.fill(0);
	s.ground.trap.fill(0);
	s.ground.hard.fill(0);
	s.ground.dug.fill(0);
	s.boosters = { pioche: 0, radar: 0, sablier: 0 };
	return s;
}

function put(s: State, r: number, c: number, color: number, extra: Partial<Gem> = {}): Gem {
	const g: Gem = { id: s.nextId++, color, kind: 'gem', ice: false, lock: false, ...extra };
	s.board[r * COLS + c] = g;
	return g;
}

const B = ROWS - 1; // bottom row

describe('pieces', () => {
	it('are the same for a seed and an index, whatever was played before', () => {
		expect(pieceAt(CFG, 5)).toEqual(pieceAt(CFG, 5));
		expect(pieceAt(CFG, 5)).not.toEqual(pieceAt({ ...CFG, seed: 8 }, 5));
	});

	it('never deal three of one colour in a trio', () => {
		for (let n = 0; n < 500; n++) {
			const p = pieceAt(CFG, n);
			if (p.colors.length === 3) expect(new Set(p.colors).size).toBeGreaterThan(1);
		}
	});

	it('turn clockwise about the pivot', () => {
		expect(offsets('I2', 0)).toEqual([[0, 0], [0, -1]]);
		expect(offsets('I2', 1)).toEqual([[0, 0], [1, 0]]);
		expect(offsets('I2', 2)).toEqual([[0, 0], [0, 1]]);
	});

	it('kick off a wall when turned against it', () => {
		const s = blank();
		s.piece = { shape: 'I3', rot: 0, x: COLS - 1, y: 3, colors: [0, 1, 2] };
		expect(rotate(s)).toBe(true);
		expect(pieceCells(s.piece).every((p) => p.c >= 0 && p.c < COLS)).toBe(true);
	});

	it('split over a gap: each gem falls on its own', () => {
		const s = blank();
		put(s, B, 3, 0);
		s.piece = { shape: 'I2', rot: 1, x: 3, y: 2, colors: [1, 2] }; // flat over columns 3-4
		hardDrop(s);
		lockPiece(s);
		expect(gemAt(s, B - 1, 3)?.color).toBe(1);
		expect(gemAt(s, B, 4)?.color).toBe(2);
	});

	it('cannot move into the wall', () => {
		const s = blank();
		s.piece = { shape: 'I2', rot: 0, x: 0, y: 3, colors: [0, 1] };
		expect(move(s, -1)).toBe(false);
		expect(move(s, 1)).toBe(true);
	});
});

describe('bursts and digging', () => {
	it('a flat line of three digs three columns one cell each', () => {
		const s = blank();
		[1, 2, 3].forEach((c) => put(s, B, c, 0));
		const w = resolveWave(s)!;
		expect(w.popped).toHaveLength(3);
		expect(w.digs.map((d) => d.c)).toEqual([1, 2, 3]);
		expect([1, 2, 3].map((c) => digRow(s.ground, c))).toEqual([1, 1, 1]);
		expect(resolveWave(s)).toBeNull();
	});

	it('an upright line of three drills one column three cells deep', () => {
		const s = blank();
		[B, B - 1, B - 2].forEach((r) => put(s, r, 4, 2));
		const w = resolveWave(s)!;
		expect(w.digs.map((d) => [d.c, d.r])).toEqual([[4, 0], [4, 1], [4, 2]]);
	});

	it('gems above a burst fall, and a new line bursts as the next wave', () => {
		const s = blank();
		put(s, B, 0, 1);
		put(s, B, 1, 1);
		put(s, B, 2, 0);
		[3, 4].forEach((c) => put(s, B, c, 0));
		put(s, B - 1, 2, 1); // lands at the bottom once the line of 0 bursts
		put(s, B - 2, 2, 3);
		const w1 = resolveWave(s)!;
		expect(w1.popped.map((p) => p.c).sort()).toEqual([2, 3, 4]);
		const w2 = resolveWave(s)!;
		expect(w2.chain).toBe(2);
		expect(w2.popped.map((p) => p.c).sort()).toEqual([0, 1, 2]);
		expect(w2.points).toBe(3 * 10 * 2);
	});

	it('unearthing a treasure counts it and pays out a booster', () => {
		const s = blank();
		s.ground.treasure[groundAt(s.ground, 0, 2)] = 1;
		[1, 2, 3].forEach((c) => put(s, B, c, 0));
		const w = resolveWave(s)!;
		const d = w.digs.find((x) => x.c === 2)!;
		expect(d.treasure).toBe(true);
		expect(d.booster).not.toBeNull();
		expect(s.found).toBe(1);
	});

	it('the last treasure wins the level and pays no booster', () => {
		const s = blank({ treasures: 1 });
		s.ground.treasure[groundAt(s.ground, 0, 2)] = 1;
		[1, 2, 3].forEach((c) => put(s, B, c, 0));
		const w = resolveWave(s)!;
		expect(w.digs.find((x) => x.c === 2)!.booster).toBeNull();
		expect(resolveWave(s)).toBeNull();
		endTurn(s);
		expect(s.status).toBe('won');
	});

	it('a hard cell cracks on the first dig and opens on the second', () => {
		const s = blank();
		s.ground.hard[groundAt(s.ground, 0, 5)] = 1;
		[B, B - 1].forEach((r) => put(s, r, 5, 1));
		put(s, B - 2, 5, 1);
		const w = resolveWave(s)!;
		expect(w.digs.map((d) => d.opened)).toEqual([false, true, true]);
		expect(digRow(s.ground, 5)).toBe(2);
	});
});

describe('special gems', () => {
	it('four in a line leave a bomb on the gem that just landed', () => {
		const s = blank();
		[0, 1, 2].forEach((c) => put(s, B, c, 3));
		s.piece = { shape: 'I2', rot: 0, x: 3, y: 2, colors: [3, 1] };
		hardDrop(s);
		lockPiece(s);
		const w = resolveWave(s)!;
		expect(w.specials).toEqual([expect.objectContaining({ kind: 'bomb', c: 3 })]);
		expect(w.popped).toHaveLength(3);
		const bomb = gemAt(s, B, 3)!;
		expect(bomb.kind).toBe('bomb');
	});

	it('a bomb in a line blows its 3×3 square', () => {
		const s = blank();
		put(s, B, 2, 0, { kind: 'bomb' });
		put(s, B, 3, 0);
		put(s, B, 4, 0);
		put(s, B, 1, 2); // in the blast, not in the line
		put(s, B - 1, 2, 1);
		const w = resolveWave(s)!;
		expect(w.blasts).toEqual([{ r: B, c: 2 }]);
		expect(w.popped.map((p) => p.c).sort()).toEqual([1, 2, 2, 3, 4]);
	});

	it('five in a line leave a rainbow, which clears its colour when it bursts', () => {
		const s = blank();
		[0, 1, 2, 3, 4].forEach((c) => put(s, B, c, 1));
		const w = resolveWave(s)!;
		expect(w.specials.map((x) => x.kind)).toEqual(['rainbow']);
		const rainbow = s.board.findIndex((g) => g?.kind === 'rainbow');
		expect(Math.floor(rainbow / COLS)).toBe(B);
		const rc = rainbow % COLS;
		// Elsewhere on the board, two gems of colour 2 beside it, and another one far away.
		put(s, B, rc === 6 ? 5 : rc + 1, 2);
		put(s, B, rc === 6 ? 4 : rc === 5 ? 4 : rc + 2, 2);
		put(s, 3, 6, 2);
		const w2 = resolveWave(s)!;
		expect(w2.popped.filter((p) => p.color === 2 && p.kind === 'gem')).toHaveLength(3);
		expect(s.board.some((g) => g?.color === 2 && g.kind === 'gem')).toBe(false);
	});

	it('a crossing of two lines of three makes a bomb', () => {
		const s = blank();
		[1, 2, 3].forEach((c) => put(s, B, c, 0));
		put(s, B - 1, 1, 0);
		put(s, B - 2, 1, 0);
		const w = resolveWave(s)!;
		expect(w.specials.map((x) => x.kind)).toEqual(['bomb']);
	});
});

describe('hazards', () => {
	it('ice takes the first hit, the gem the second', () => {
		const s = blank();
		put(s, B, 1, 0, { ice: true });
		put(s, B, 2, 0);
		put(s, B, 3, 0);
		const w = resolveWave(s)!;
		expect(w.cracked).toEqual([{ r: B, c: 1 }]);
		expect(gemAt(s, B, 1)?.ice).toBe(false);
		expect(w.digs.map((d) => d.c)).toEqual([2, 3]);
	});

	it('a locked gem holds what is on it, cannot line up, and opens when a neighbour bursts', () => {
		const s = blank();
		put(s, B - 2, 0, 1, { lock: true }); // floating, pinned
		put(s, B - 4, 0, 2);
		gravity(s);
		expect(gemAt(s, B - 2, 0)?.lock).toBe(true);
		expect(gemAt(s, B - 3, 0)?.color).toBe(2);
		// Under columns 1-2, two rows of filler that cannot line up; then colour 1 level with the lock.
		[[B, 0], [B - 1, 2]].forEach(([r, k]) => { put(s, r, 1, k); put(s, r, 2, (k + 3) % 4); });
		put(s, B - 2, 1, 1);
		put(s, B - 2, 2, 1);
		expect(resolveWave(s)).toBeNull(); // three of colour 1 in a row, but the locked one does not count
		// The gem sitting on it bursts in a line of three: that opens it.
		put(s, B - 3, 1, 2);
		put(s, B - 3, 2, 2);
		const w = resolveWave(s)!;
		expect(w.popped.map((p) => [p.r, p.c])).toEqual([[B - 3, 0], [B - 3, 1], [B - 3, 2]]);
		expect(w.unlocked).toContainEqual({ r: B - 2, c: 0 });
		expect(gemAt(s, B, 0)?.color).toBe(1); // free now: it fell
	});

	it('a dug trap pushes a row of stones with one gap under the pile', () => {
		const s = blank();
		s.ground.trap[groundAt(s.ground, 0, 4)] = 1;
		put(s, B, 0, 2);
		[3, 4, 5].forEach((c) => put(s, B, c, 1));
		resolveWave(s);
		expect(s.pendingStones).toBe(1);
		expect(resolveWave(s)).toBeNull();
		expect(endTurn(s)).toBe(true);
		const stones = Array.from({ length: COLS }, (_, c) => gemAt(s, B, c)?.kind === 'stone');
		expect(stones.filter(Boolean)).toHaveLength(COLS - 1);
		expect(s.board.some((g) => g?.color === 2 && g.kind === 'gem')).toBe(true);
	});

	it('a stone breaks when a gem bursts next to it', () => {
		const s = blank();
		put(s, B, 0, 0, { kind: 'stone' });
		[1, 2, 3].forEach((c) => put(s, B, c, 2));
		const w = resolveWave(s)!;
		expect(w.popped.some((p) => p.kind === 'stone')).toBe(true);
		expect(gemAt(s, B, 0)).toBeNull();
		expect(w.digs.map((d) => d.c)).toEqual([1, 2, 3]);
	});
});

describe('ground and boosters', () => {
	it('numbers count the treasures among the eight neighbours', () => {
		const s = blank();
		s.ground.treasure[groundAt(s.ground, 1, 1)] = 1;
		s.ground.treasure[groundAt(s.ground, 0, 2)] = 1;
		expect(around(s.ground, 0, 1).treasures).toBe(2);
		expect(around(s.ground, 2, 0).treasures).toBe(1);
		expect(around(s.ground, 3, 6).treasures).toBe(0);
	});

	it('clues open surface cells with no treasure or trap', () => {
		for (let seed = 1; seed < 40; seed++) {
			const s = createGame({ ...CFG, seed, clues: 2, traps: 2 });
			const open = Array.from({ length: COLS }, (_, c) => c).filter((c) => s.ground.dug[c]);
			expect(open).toHaveLength(2);
			for (const c of open) expect(s.ground.treasure[c] + s.ground.trap[c]).toBe(0);
		}
	});

	it('the pickaxe digs any hidden cell, however deep', () => {
		const s = blank({ treasures: 1 });
		s.boosters.pioche = 1;
		expect(digPioche(s, 3, 6)!.treasure).toBe(false);
		expect(digPioche(s, 2, 6)).toBeNull(); // spent
		s.boosters.pioche = 1;
		s.ground.treasure[groundAt(s.ground, 3, 5)] = 1;
		expect(digPioche(s, 3, 5)!.treasure).toBe(true);
		expect(s.status).toBe('won');
	});

	it('the radar shows a cell without digging it', () => {
		const s = blank();
		s.boosters.radar = 1;
		expect(scanRadar(s, 2, 2)).toBe(true);
		expect(s.ground.seen[groundAt(s.ground, 2, 2)]).toBe(1);
		expect(s.ground.dug[groundAt(s.ground, 2, 2)]).toBe(0);
	});

	it('flags only mark hidden cells, and digging clears them', () => {
		const s = blank();
		expect(toggleFlag(s, 0, 3)).toBe(true);
		[2, 3, 4].forEach((c) => put(s, B, c, 0));
		resolveWave(s);
		expect(s.ground.flag[groundAt(s.ground, 0, 3)]).toBe(0);
		expect(toggleFlag(s, 0, 3)).toBe(false);
	});

	it('every game starts with one pickaxe', () => {
		expect(createGame(CFG).boosters.pioche).toBe(1);
	});
});

describe('game over and endless', () => {
	it('loses when a new piece cannot appear', () => {
		const s = blank();
		for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) put(s, r, c, (r + c * 2) % 4, { kind: 'stone' });
		endTurn(s);
		expect(s.status).toBe('lost');
	});

	it('endless mode deals a fresh ground once every treasure is found', () => {
		const s = createGame({ ...CFG, treasures: 1 }, { endless: true });
		s.piece = null;
		s.found = 1;
		const before = s.ground;
		endTurn(s);
		expect(s.status).toBe('playing');
		expect(s.field).toBe(1);
		expect(s.ground).not.toBe(before);
		expect(s.found).toBe(0);
		expect(s.cfg.treasures).toBe(2);
	});

	it('settle runs every wave of a turn', () => {
		const s = blank();
		[1, 2, 3].forEach((c) => put(s, B, c, 0));
		const waves = settle(s);
		expect(waves).toHaveLength(1);
		expect(s.piece).not.toBeNull();
	});
});

describe('levels', () => {
	it('picks.ts matches the engine: the bot clears every level in the pieces recorded there', () => {
		// Fails after a change to the engine, the bot or a board: rerun scripts/eclats-levels.ts.
		expect(PICKS).toHaveLength(200);
		const stale: number[] = [];
		for (let l = 1; l <= 200; l++) {
			const cfg = levelConfig(l);
			const run = playBot(cfg);
			if (!run.won || run.pieces !== PICKS[l - 1][1]) stale.push(l);
		}
		expect(stale).toEqual([]);
	}, 60_000);

	it('stars ask for fewer pieces at 3★ than at 2★', () => {
		for (const l of [1, 20, 21, 50, 99, 100, 150, 200]) {
			const cfg = eclatsLevels.config(l);
			expect(cfg.three).toBeGreaterThan(3);
			expect(cfg.two).toBeGreaterThan(cfg.three);
			expect(eclatsLevels.stars(l, { won: true, score: cfg.three })).toBe(3);
			expect(eclatsLevels.stars(l, { won: true, score: cfg.two })).toBe(2);
			expect(eclatsLevels.stars(l, { won: true, score: cfg.two + 1 })).toBe(1);
			expect(eclatsLevels.stars(l, { won: false, score: 1 })).toBe(0);
		}
	});
});
