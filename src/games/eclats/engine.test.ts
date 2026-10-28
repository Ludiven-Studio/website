import { describe, it, expect } from 'vitest';
import {
	CENTRE_ORDER,
	FIRE_FULL,
	LIGHT_SWIPES,
	MAX_RANK,
	N,
	arrivalAt,
	breathe,
	canBreathe,
	createGame,
	movesLeft,
	outOfMoves,
	revive,
	endlessStep,
	entryEdge,
	fifthNow,
	findGroups,
	nextCentre,
	play,
	previewGroups,
	slide,
	upcoming,
	visible,
	STEP_MOVES,
	type Block,
	type Burst,
	type EclatsCfg,
	type Kind,
	type State,
	type Step,
} from './engine';
import { playBot } from './bot';
import { APP, FREE_LEVELS, SITE, appNightConfig, eclatsLevels, levelConfig, starsLimit } from './levels';

const CFG: EclatsCfg = { seed: 7, fifth: 0, goal: 0, chests: 0, locked: 0, chestEvery: 0, rocks: 0, ice: 0, fill: 0 };
const B = N - 1; // the bottom row

/** An empty board: the test lays out the blocks. */
function blank(over: Partial<EclatsCfg> = {}): State {
	const s = createGame({ ...CFG, ...over });
	s.cells.fill(null);
	return s;
}

const at = (r: number, c: number): number => r * N + c;

function put(s: State, r: number, c: number, kind: Kind, color = 0, extra: Partial<Block> = {}): Block {
	const b: Block = { id: s.nextId++, kind, color, rank: 1, ice: false, lock: false, ...extra };
	s.cells[at(r, c)] = b;
	return b;
}

const bursts = (steps: Step[]): Burst[] => steps.filter((x): x is Burst => x.t === 'burst');
/** Swipe down with gems on the bottom row: a gem dropped in the top-right corner makes the swipe legal. */
const swipeDown = (s: State): Burst => {
	put(s, 0, N - 1, 'gem', 3);
	return bursts(play(s, 'down')!)[0];
};

describe('sliding', () => {
	it('slides every block to the wall, in order, without merging', () => {
		const s = blank();
		put(s, 0, 3, 'gem', 0);
		put(s, 0, 5, 'gem', 1);
		expect(slide(s, 'left')).toBe(true);
		expect(s.cells[at(0, 0)]?.color).toBe(0);
		expect(s.cells[at(0, 1)]?.color).toBe(1);
		expect(s.cells[at(0, 2)]).toBeNull();
	});

	it('rocks and frozen gems stay put and stop what slides into them', () => {
		const s = blank();
		put(s, 2, 1, 'rock');
		put(s, 2, 4, 'gem', 2);
		put(s, 3, 2, 'gem', 1, { ice: true });
		put(s, 3, 5, 'gem', 3);
		slide(s, 'left');
		expect(s.cells[at(2, 1)]?.kind).toBe('rock');
		expect(s.cells[at(2, 2)]?.color).toBe(2);
		expect(s.cells[at(3, 2)]?.ice).toBe(true);
		expect(s.cells[at(3, 3)]?.color).toBe(3);
	});

	it('refuses a swipe that moves nothing', () => {
		const s = blank();
		put(s, 0, 0, 'gem', 0);
		expect(play(s, 'left')).toBeNull();
		expect(play(s, 'up')).toBeNull();
		expect(s.moves).toBe(0);
	});
});

describe('explosions', () => {
	it('three of a colour touching by their sides explode; two do not', () => {
		const s = blank();
		put(s, 5, 0, 'gem', 1);
		put(s, 5, 1, 'gem', 1);
		put(s, 4, 0, 'gem', 1);
		put(s, 0, 5, 'gem', 2);
		put(s, 1, 5, 'gem', 2);
		const g = findGroups(s, 'down');
		expect(g).toHaveLength(1);
		expect(g[0]).toHaveLength(3);
	});

	it('gems of every rank group by their colour', () => {
		const s = blank();
		put(s, 5, 0, 'gem', 1, { rank: 3 });
		put(s, 5, 1, 'gem', 1);
		put(s, 5, 2, 'gem', 1, { rank: 2 });
		expect(findGroups(s)[0]).toHaveLength(3);
	});

	it('a group is ordered outward from its leading cell along the swipe', () => {
		const s = blank();
		[1, 2, 3].forEach((c) => put(s, 4, c, 'gem', 0));
		expect(findGroups(s, 'right')[0][0]).toBe(at(4, 3));
		expect(findGroups(s, 'left')[0][0]).toBe(at(4, 1));
	});

	it('a swipe that lines up three makes them explode, then the board slides again', () => {
		const s = blank();
		put(s, 5, 0, 'gem', 2);
		put(s, 5, 1, 'gem', 2);
		put(s, 5, 4, 'gem', 2);
		put(s, 4, 4, 'gem', 3);
		const steps = play(s, 'left')!;
		const b = bursts(steps);
		expect(b[0].popped.map((p) => p.cell).sort((x, y) => x - y)).toEqual([at(5, 0), at(5, 1), at(5, 2)]);
		expect(b[0].fused).toEqual([]);
		expect(steps[0].t).toBe('slide');
	});

	it('the preview shows the groups the slide itself makes, before any arrival', () => {
		const s = blank();
		put(s, 5, 0, 'gem', 2);
		put(s, 5, 1, 'gem', 2);
		put(s, 5, 4, 'gem', 2);
		expect(previewGroups(s, 'left')).toHaveLength(1);
		expect(previewGroups(s, 'up')).toHaveLength(0);
	});

	it('a chain numbers its waves 1, 2, 3…, with a slide or arrivals between two of them', () => {
		let found = 0;
		for (let seed = 1; seed < 60 && found < 5; seed++) {
			const s = createGame({ ...CFG, seed, fill: 0.55 });
			for (let m = 0; m < 30 && s.status === 'playing'; m++) {
				const dir = (['up', 'right', 'down', 'left'] as const).find((d) => previewGroups(s, d).length) ?? 'left';
				const steps = play(s, dir) ?? play(s, 'right') ?? play(s, 'up') ?? play(s, 'down');
				if (!steps) break;
				const b = bursts(steps);
				if (b.length < 2) continue;
				found++;
				expect(b.map((x) => x.wave)).toEqual(b.map((_, i) => i + 1));
				for (let k = 1; k < steps.length; k++) if (steps[k].t === 'burst' && steps[k - 1].t === 'burst') throw new Error('two waves with nothing between');
			}
		}
		expect(found).toBeGreaterThan(0);
	});
});

describe('fusions', () => {
	it('four of a colour fuse into one gem a rank up, on the leading cell', () => {
		const s = blank();
		[0, 1, 2, 3].forEach((c) => put(s, B, c, 'gem', 1));
		const b = swipeDown(s);
		expect(b.fused).toEqual([expect.objectContaining({ cell: at(B, 0), rank: 2, color: 1 })]);
		expect(b.popped).toHaveLength(3);
		expect(b.popped.every((p) => p.into === at(B, 0))).toBe(true);
		expect(s.cells.some((x) => x?.kind === 'gem' && x.rank === 2 && x.color === 1)).toBe(true);
	});

	it('five or more climb two ranks, from the highest rank in the group', () => {
		const s = blank();
		[0, 1, 2, 3, 4].forEach((c) => put(s, B, c, 'gem', 1, { rank: c === 2 ? 2 : 1 }));
		expect(swipeDown(s).fused[0].rank).toBe(4);
	});

	it('a charged gem in a trio releases a 3×3 blast', () => {
		const s = blank();
		[0, 1, 2].forEach((c) => put(s, B, c, 'gem', 1, { rank: c === 2 ? 2 : 1 }));
		put(s, B, 3, 'gem', 2);
		put(s, B, 5, 'gem', 0);
		const b = swipeDown(s);
		expect(b.releases).toEqual([expect.objectContaining({ cell: at(B, 2), rank: 2 })]);
		expect(b.popped.some((p) => p.cell === at(B, 3))).toBe(true);
		expect(b.popped.some((p) => p.cell === at(B, 5))).toBe(false);
	});

	it('a jewel releases a 5×5 blast', () => {
		const s = blank();
		[0, 1, 2].forEach((c) => put(s, B, c, 'gem', 1, { rank: c === 2 ? 3 : 1 }));
		put(s, B, 4, 'gem', 2);
		put(s, B, 5, 'gem', 0);
		const b = swipeDown(s);
		expect(b.popped.some((p) => p.cell === at(B, 4))).toBe(true);
		expect(b.popped.some((p) => p.cell === at(B, 5))).toBe(false);
	});

	it('a crown clears its whole colour, and never fuses further', () => {
		const s = blank();
		[0, 1, 2, 3].forEach((c) => put(s, B, c, 'gem', 1, { rank: c === 2 ? MAX_RANK : 1 }));
		put(s, B, 5, 'gem', 1);
		put(s, 0, 0, 'gem', 1);
		const b = swipeDown(s);
		expect(b.fused).toEqual([]);
		expect(b.releases[0].rank).toBe(MAX_RANK);
		expect(b.popped.filter((p) => p.color === 1)).toHaveLength(6);
	});

	it('a charged gem caught in a blast goes off too', () => {
		const s = blank();
		[0, 1, 2].forEach((c) => put(s, B, c, 'gem', 1, { rank: c === 2 ? 2 : 1 }));
		put(s, B, 3, 'gem', 2, { rank: 2 });
		put(s, B, 4, 'gem', 0);
		const b = swipeDown(s);
		expect(b.releases).toHaveLength(2);
		expect(b.popped.some((p) => p.cell === at(B, 4))).toBe(true);
	});
});

describe('squares and comets', () => {
	it('a 2×2 square sends a comet to the nearest chest, and it opens', () => {
		const s = blank({ goal: 5 });
		[[B - 1, 0], [B - 1, 1], [B, 0], [B, 1]].forEach(([r, c]) => put(s, r, c, 'gem', 1));
		put(s, B, 4, 'chest');
		const b = swipeDown(s);
		expect(b.comets).toEqual([{ from: at(B, 0), to: at(B, 4) }]);
		expect(b.opened).toEqual([at(B, 4)]);
		expect(b.popped.find((p) => p.kind === 'chest')?.late).toBe(true);
	});

	it('a comet never aims at a chest the wave opens anyway', () => {
		const s = blank({ goal: 5 });
		[[B - 1, 0], [B - 1, 1], [B, 0], [B, 1]].forEach(([r, c]) => put(s, r, c, 'gem', 1));
		put(s, B, 2, 'chest');
		put(s, B, 5, 'chest');
		const b = swipeDown(s);
		expect(b.comets[0].to).toBe(at(B, 5));
		expect(b.opened.sort((x, y) => x - y)).toEqual([at(B, 2), at(B, 5)]);
	});

	it('without a chest, a comet flies to the thickest 3×3 at least three cells away', () => {
		const s = blank();
		[[B - 1, 0], [B - 1, 1], [B, 0], [B, 1]].forEach(([r, c]) => put(s, r, c, 'gem', 1));
		[3, 4, 5].forEach((c) => put(s, B, c, 'gem', c % 2 ? 2 : 0));
		put(s, B - 1, 4, 'gem', 2);
		const b = swipeDown(s);
		expect(b.comets[0].to).toBe(at(B - 1, 4));
		expect(b.popped.filter((p) => p.late)).toHaveLength(4);
	});
});

describe('chests, rocks, ice', () => {
	it('an explosion beside a chest opens it; a locked one takes two', () => {
		const s = blank({ goal: 9 });
		[0, 1, 2].forEach((c) => put(s, B, c, 'gem', 0));
		put(s, B - 1, 1, 'chest', 0, { lock: true });
		const b = swipeDown(s);
		expect(b.unlocked).toHaveLength(1);
		expect(b.opened).toHaveLength(0);
		expect(s.cells.some((x) => x?.kind === 'chest' && !x.lock)).toBe(true);
	});

	it('a fusion opens the chest beside the gem it leaves', () => {
		const s = blank({ goal: 9 });
		[0, 1, 2, 3].forEach((c) => put(s, B, c, 'gem', 0));
		put(s, B - 1, 0, 'chest');
		expect(swipeDown(s).opened).toEqual([at(B - 1, 0)]);
	});

	it('an explosion breaks the rock beside it and thaws the ice beside it', () => {
		const s = blank();
		[1, 2, 3].forEach((c) => put(s, B, c, 'gem', 0));
		put(s, B, 0, 'rock');
		put(s, B - 1, 2, 'gem', 1, { ice: true });
		const b = swipeDown(s);
		expect(b.popped.some((p) => p.kind === 'rock')).toBe(true);
		expect(b.thawed).toEqual([at(B - 1, 2)]);
	});

	it('opening the last chest ends the level at once', () => {
		const s = blank({ goal: 1 });
		[0, 1, 2].forEach((c) => put(s, B, c, 'gem', 0));
		put(s, B - 1, 0, 'chest');
		put(s, 0, N - 1, 'gem', 3);
		const steps = play(s, 'down')!;
		expect(s.status).toBe('won');
		expect(steps[steps.length - 1].t).toBe('burst');
	});
});

describe('arrivals', () => {
	it('the stream is fixed by the seed and the arrival number alone', () => {
		expect(arrivalAt(CFG, 12)).toEqual(arrivalAt(CFG, 12));
		const a = Array.from({ length: 40 }, (_, n) => arrivalAt(CFG, n).color);
		expect(new Set(a).size).toBe(4); // four colours, no fifth
	});

	it('chests arrive at a fixed pace, so the preview can announce them', () => {
		const cfg = { ...CFG, chestEvery: 5 };
		const kinds = Array.from({ length: 15 }, (_, n) => arrivalAt(cfg, n).kind);
		expect(kinds.filter((k) => k === 'chest')).toHaveLength(3);
		expect(kinds[4]).toBe('chest');
		const s = createGame(cfg);
		expect(upcoming(s, 5)[4].kind).toBe('chest');
	});

	it('new blocks enter by the edge opposite the swipe', () => {
		const s = blank();
		put(s, 2, 5, 'gem', 0);
		const steps = play(s, 'left')!;
		const arrive = steps.find((x) => x.t === 'arrive')!;
		expect(entryEdge('left').every((i) => arrive.cells[i] !== null)).toBe(true);
	});

	it('one gem drops at the centre each swipe, the one the preview showed', () => {
		const s = blank();
		put(s, 0, 0, 'gem', 0);
		const colour = nextCentre(s);
		const steps = play(s, 'right')!;
		const arrive = steps.find((x) => x.t === 'arrive');
		if (!arrive || arrive.t !== 'arrive') throw new Error('no arrivals');
		const mid = arrive.cells[CENTRE_ORDER[0]];
		expect(mid?.id).toBe(arrive.centre);
		expect(mid?.color).toBe(colour);
		expect(s.centred).toBe(1);
	});

	it('the centre gem takes the nearest free cell when the centre is taken', () => {
		const s = blank();
		put(s, 3, 3, 'rock');
		put(s, 0, 0, 'gem', 0);
		const arrive = play(s, 'right')!.find((x) => x.t === 'arrive');
		if (!arrive || arrive.t !== 'arrive') throw new Error('no arrivals');
		expect(arrive.cells[at(2, 3)]?.id).toBe(arrive.centre);
	});

	it('endless mode adds a little of the fifth colour every few swipes', () => {
		const s = createGame(CFG);
		expect(fifthNow(s)).toBe(0);
		s.moves = STEP_MOVES * 2;
		expect(endlessStep(s)).toBe(2);
		expect(fifthNow(s)).toBeCloseTo(0.08);
	});
});

describe('setup and the end', () => {
	it('nothing explodes before the first swipe, and chests and rocks start away from the walls', () => {
		for (let seed = 1; seed < 40; seed++) {
			const s = createGame({ ...CFG, seed, fill: 0.6, chests: 3, rocks: 2 });
			expect(findGroups(s)).toEqual([]);
			s.cells.forEach((b, i) => {
				if (b?.kind !== 'chest' && b?.kind !== 'rock') return;
				const [r, c] = [Math.floor(i / N), i % N];
				expect(r > 0 && r < N - 1 && c > 0 && c < N - 1).toBe(true);
			});
		}
	});

	it('a full board loses', () => {
		const s = blank();
		for (let i = 0; i < N * N; i++) s.cells[i] = { id: s.nextId++, kind: 'gem', color: ((i % N) + Math.floor(i / N) * 2) % 4, rank: 1, ice: false, lock: false };
		s.cells[0] = null;
		const steps = play(s, 'left');
		// The swipe fills the board back up: unless something explodes, it is over.
		if (steps && !bursts(steps).length) expect(s.status).toBe('lost');
	});
});

describe("Bijou's breath", () => {
	const gemsGone = (steps: Step[]): number => bursts(steps).reduce((t, b) => t + b.popped.filter((p) => p.kind === 'gem').length, 0);

	it('every gem a move destroys fills the gauge, up to full', () => {
		const s = blank();
		for (const c of [0, 1, 2]) put(s, B, c, 'gem', 0);
		put(s, 0, N - 1, 'gem', 3);
		const steps = play(s, 'down')!;
		expect(gemsGone(steps)).toBeGreaterThanOrEqual(3);
		expect(s.fire).toBe(gemsGone(steps));

		const t = blank();
		for (const c of [0, 1, 2]) put(t, B, c, 'gem', 0);
		t.fire = FIRE_FULL - 1;
		swipeDown(t);
		expect(t.fire).toBe(FIRE_FULL);
	});

	it('only a full gauge breathes, and a breath is not a swipe', () => {
		const s = blank();
		put(s, 3, 3, 'gem', 0);
		s.fire = FIRE_FULL - 1;
		expect(canBreathe(s)).toBe(false);
		expect(breathe(s)).toBeNull();
		s.fire = FIRE_FULL;
		const steps = breathe(s)!;
		expect(steps.map((x) => x.t)).toEqual(['breath', 'burst']);
		expect(s.fire).toBe(0);
		expect(s.moves).toBe(0);
		expect(s.cells[at(3, 3)]).toBeNull();
	});

	it('the fireballs land on the chests first, nearest Bijou, then on the thickest 3×3', () => {
		const s = blank({ goal: 5 });
		put(s, 5, 1, 'chest');
		put(s, 1, 5, 'chest');
		for (let r = 4; r < N; r++) for (let c = 4; c < N; c++) put(s, r, c, 'gem', (r + c) % 4);
		put(s, 0, 0, 'gem', 1);
		s.fire = FIRE_FULL;
		const steps = breathe(s)!;
		expect(steps[0].t === 'breath' && steps[0].balls).toEqual([at(1, 5), at(5, 1), at(5, 5)]);
		expect(s.opened).toBe(2);
		expect(s.cells.filter((b) => b).length).toBe(1); // the gem no fireball reached
		expect(s.status).toBe('playing');
	});

	it('opening the last chest with a breath wins', () => {
		const s = blank({ goal: 1 });
		put(s, 3, 3, 'chest');
		s.fire = FIRE_FULL;
		breathe(s);
		expect(s.status).toBe('won');
	});

	it('a full board is not lost while Bijou can breathe, and his breath makes room', () => {
		const s = blank();
		for (let i = 0; i < N * N; i++) s.cells[i] = { id: s.nextId++, kind: 'gem', color: ((i % N) + Math.floor(i / N) * 2) % 4, rank: 1, ice: false, lock: false };
		s.cells[0] = null;
		s.fire = FIRE_FULL;
		const steps = play(s, 'left')!;
		// The swipe fills the board back up without a group (seed 7): a loss, but for the gauge.
		expect(bursts(steps)).toEqual([]);
		expect(s.cells.every((b) => b)).toBe(true);
		expect(s.status).toBe('playing');
		expect(play(s, 'right')).toBeNull();
		expect(breathe(s)).not.toBeNull();
		expect(s.cells.filter((b) => !b).length).toBeGreaterThanOrEqual(9);
	});
});

describe('the swipe limit', () => {
	it('out of swipes before the last chest, the level is lost and takes no more swipes', () => {
		const s = blank({ goal: 5, limit: 1 });
		put(s, B, 0, 'gem', 0);
		put(s, 0, N - 1, 'gem', 1);
		expect(movesLeft(s)).toBe(1);
		play(s, 'down');
		expect(movesLeft(s)).toBe(0);
		expect(s.status).toBe('lost');
		expect(play(s, 'up')).toBeNull();
	});

	it('a full gauge as the swipes run out: Bijou breathes first, and his breath can still win', () => {
		const s = blank({ goal: 5, limit: 1 });
		put(s, 0, N - 1, 'gem', 1);
		s.fire = FIRE_FULL;
		play(s, 'down');
		expect(s.status).toBe('playing');
		expect(play(s, 'up')).toBeNull();

		const win = blank({ goal: 1, limit: 3 });
		put(win, 3, 3, 'chest');
		win.moves = 3;
		win.fire = FIRE_FULL;
		breathe(win);
		expect(win.status).toBe('won');

		const lose = blank({ goal: 2, limit: 3 });
		put(lose, 3, 3, 'chest');
		lose.moves = 3;
		lose.fire = FIRE_FULL;
		breathe(lose);
		expect(lose.opened).toBe(1);
		expect(lose.status).toBe('lost');
	});

	it('a revive plays a lost level on: more swipes and a full gauge', () => {
		const s = blank({ goal: 5, limit: 1 });
		put(s, 0, N - 1, 'gem', 1);
		expect(revive(s, 5)).toBe(false);
		play(s, 'down');
		expect(s.status).toBe('lost');
		expect(revive(s, 5)).toBe(true);
		expect(s.status).toBe('playing');
		expect(movesLeft(s)).toBe(5);
		expect(canBreathe(s)).toBe(true);
	});

	it('without a limit, swipes never run out', () => {
		const s = blank();
		expect(movesLeft(s)).toBe(Infinity);
		expect(outOfMoves(s)).toBe(false);
	});
});

describe('levels', () => {
	it('the website has 100 levels in worlds of 20, the app the same climb over 250 in lands of 50', () => {
		expect(SITE.count).toBe(100);
		expect(SITE.worlds.map((w) => w.from)).toEqual([1, 21, 41, 61, 81, 101]);
		expect(eclatsLevels.config(57)).toEqual(SITE.levelConfig(57));
		expect(APP.count).toBe(250);
		expect(APP.worlds.map((w) => w.from)).toEqual([1, 51, 101, 151, 201, 251]);
	});

	it('every level past the free ones lets the bot through with room, one in ten from 30 is harder, and its stars sit inside its limit', () => {
		for (const set of [SITE, APP]) {
			for (let l = 1; l <= 2 * set.count; l++) {
				const cfg = set.levels.config(l);
				const par = set.picks[l - 1][1];
				if (l <= FREE_LEVELS) expect(cfg.limit).toBe(0);
				else expect(cfg.limit).toBeGreaterThanOrEqual(par + 2);
				expect(cfg.three).toBeLessThan(cfg.two);
				expect(cfg.two).toBeLessThan(cfg.limit || starsLimit(par));
				expect(cfg.hard).toBe(l % 10 === 0 && l >= 30);
			}
		}
	});

	it('the first levels are lessons: nothing explodes before the first swipe, and the suggested one shows the lesson', () => {
		const first = (l: number): { s: State; b: Burst[] } => {
			const cfg = levelConfig(l);
			const s = createGame(cfg);
			expect(findGroups(s), `level ${l} starts with a group`).toEqual([]);
			return { s, b: bursts(play(s, cfg.hint!)!) };
		};
		const gems = (b: Burst, color?: number): number => b.popped.filter((p) => p.kind === 'gem' && (color === undefined || p.color === color)).length;
		expect(gems(first(1).b[0], 0)).toBe(3);
		expect(first(2).b[0].opened.length).toBeGreaterThanOrEqual(1);
		expect(first(3).b.length).toBeGreaterThanOrEqual(2);
		expect(first(4).b[0].fused.some((f) => f.rank === 2)).toBe(true);
		const charged = first(5).b[0];
		expect(charged.releases.some((z) => z.rank === 2) && charged.opened.length >= 1).toBe(true);
		expect(first(6).b[0].fused.some((f) => f.rank === 3)).toBe(true);
		const comet = first(7).b[0];
		expect(comet.comets.length >= 1 && comet.opened.length >= 1).toBe(true);
		const crown = first(8).b[0];
		expect(crown.releases.some((z) => z.rank === MAX_RANK) && gems(crown, 0) >= 6).toBe(true);
		expect(canBreathe(first(9).s)).toBe(true);
		for (let l = 1; l <= 10; l++) expect(levelConfig(l).lesson, `level ${l}`).toBeTruthy();
		expect(levelConfig(11).lesson).toBeUndefined();
	});

	it('picks.ts matches the engine: the bot clears every level in the swipes recorded there', () => {
		// Fails after a change to the engine, the bot or a board: rerun scripts/eclats-levels.ts.
		const stale: string[] = [];
		for (const [name, set] of [['site', SITE], ['app', APP]] as const) {
			expect(set.picks).toHaveLength(2 * set.count);
			for (let l = 1; l <= 2 * set.count; l++) {
				const run = playBot(set.levelConfig(l));
				if (!run.won || run.moves !== set.picks[l - 1][1]) stale.push(`${name} ${l}`);
			}
		}
		expect(stale).toEqual([]);
	}, 240_000);

	it('stars ask for fewer swipes at 3★ than at 2★', () => {
		for (const l of [1, 20, 21, 50, 99, 100, 150, 200]) {
			const cfg = eclatsLevels.config(l);
			expect(cfg.two).toBeGreaterThan(cfg.three);
			expect(eclatsLevels.stars(l, { won: true, score: cfg.three })).toBe(3);
			expect(eclatsLevels.stars(l, { won: true, score: cfg.two })).toBe(2);
			expect(eclatsLevels.stars(l, { won: true, score: cfg.two + 1 })).toBe(1);
			expect(eclatsLevels.stars(l, { won: false, score: 1 })).toBe(0);
		}
	});
});

describe('night', () => {
	const SWIPES = ['left', 'down', 'right', 'up'] as const;
	const cheb = (a: number, b: number): number => Math.max(Math.abs(Math.floor(a / N) - Math.floor(b / N)), Math.abs((a % N) - (b % N)));
	/** The cells an explosion lights: what it took, and their neighbours. */
	const litBy = (steps: Step[]): Set<number> => {
		const out = new Set<number>();
		for (const b of bursts(steps)) for (const p of b.popped) for (let j = 0; j < N * N; j++) if (cheb(j, p.cell) <= 1) out.add(j);
		return out;
	};
	/** A swipe that moves something, in a fixed order. */
	const anySwipe = (s: State, k: number): Step[] => {
		for (let d = 0; d < 4; d++) {
			const steps = play(s, SWIPES[(k + d) % 4]);
			if (steps) return steps;
		}
		throw new Error('nothing moves');
	};

	it('by day nothing is dark: no lights, no fireflies, everything shows, no night step', () => {
		const s = createGame(APP.levelConfig(37));
		expect(s.light).toEqual([]);
		expect(s.flies).toEqual([]);
		expect(visible(s).every(Boolean)).toBe(true);
		expect(anySwipe(s, 0).some((x) => x.t === 'night')).toBe(false);
	});

	it('plays every move exactly as by day', () => {
		for (const level of [12, 37, 140, 230]) {
			const cfg = APP.levelConfig(level);
			const day = createGame(cfg);
			const night = createGame({ ...cfg, night: true, flies: 3 });
			expect(night.cells).toEqual(day.cells);
			for (let k = 0; k < 14 && day.status === 'playing'; k++) {
				const a = play(day, SWIPES[k % 4]);
				const b = play(night, SWIPES[k % 4]);
				expect(!!b).toBe(!!a);
				if (b) expect(b.at(-1)!.t).toBe('night');
				for (const key of ['cells', 'score', 'opened', 'fire', 'arrivals', 'centred', 'moves', 'status'] as const) expect(night[key]).toEqual(day[key]);
			}
		}
	});

	it('places its fireflies on distinct cells, the same every time, and moves each one step per swipe', () => {
		const cfg: EclatsCfg = { ...APP.levelConfig(60), night: true, flies: 4 };
		const a = createGame(cfg);
		const b = createGame(cfg);
		expect(a.flies).toEqual(b.flies);
		expect(new Set(a.flies).size).toBe(4);
		for (let k = 0; k < 10 && a.status === 'playing'; k++) {
			const before = a.flies.slice();
			anySwipe(a, k);
			anySwipe(b, k);
			expect(a.flies).toEqual(b.flies);
			expect(new Set(a.flies).size).toBe(4);
			a.flies.forEach((f, i) => expect(cheb(f, before[i])).toBe(1));
		}
	});

	it('lights what an explosion took and its neighbours for two swipes', () => {
		const s = blank({ night: true });
		for (let c = 0; c < 3; c++) put(s, B, c, 'gem', 0);
		swipeDown(s);
		expect(s.light[at(B, 0)]).toBe(LIGHT_SWIPES);
		expect(s.light[at(B - 1, 3)]).toBe(LIGHT_SWIPES);
		expect(s.light[at(B - 2, 0)]).toBe(0);
		for (let k = 0; k < 3; k++) {
			const before = s.light.slice();
			const lit = litBy(anySwipe(s, k));
			s.light.forEach((l, i) => expect(l).toBe(lit.has(i) ? LIGHT_SWIPES : Math.max(0, before[i] - 1)));
		}
	});

	it('a breath lights like any explosion, but fades nothing and leaves the fireflies where they are', () => {
		const s = createGame({ ...APP.levelConfig(60), night: true, flies: 2, fire: FIRE_FULL });
		anySwipe(s, 0);
		const light = s.light.slice();
		const flies = s.flies.slice();
		const moves = s.moves;
		const steps = breathe(s)!;
		expect(steps.at(-1)!.t).toBe('night');
		expect(s.flies).toEqual(flies);
		expect(s.moves).toBe(moves);
		const lit = litBy(steps);
		expect(lit.size).toBeGreaterThan(0);
		s.light.forEach((l, i) => expect(l).toBe(lit.has(i) ? LIGHT_SWIPES : light[i]));
	});

	it('shows lit cells, the fireflies and their neighbours, chests and rocks, and around glowing gems', () => {
		const s = blank({ night: true });
		put(s, 0, 0, 'chest');
		put(s, 0, 6, 'rock');
		put(s, 3, 3, 'gem', 1, { rank: 2 });
		put(s, 6, 6, 'gem', 0);
		s.flies = [at(6, 0)];
		s.light[at(0, 3)] = 1;
		const v = visible(s);
		const shows = (r: number, c: number): boolean => v[at(r, c)];
		expect([shows(0, 3), shows(1, 3)]).toEqual([true, false]); // lit
		expect([shows(5, 1), shows(6, 1), shows(4, 0)]).toEqual([true, true, false]); // firefly
		expect([shows(0, 0), shows(1, 0), shows(0, 6), shows(1, 6)]).toEqual([true, false, true, false]); // chest, rock
		expect([shows(2, 2), shows(4, 4), shows(5, 5), shows(6, 6)]).toEqual([true, true, false, false]); // glow, plain gem
	});

	it("the app's night run replays its boards, fireflies four to one, two more swipes where limited", () => {
		expect(appNightConfig(1).flies).toBe(4);
		expect(appNightConfig(250).flies).toBe(1);
		for (const level of [5, 20, 21, 120, 250]) {
			const day = APP.levelConfig(level);
			const n = appNightConfig(level);
			expect(n.night).toBe(true);
			expect([n.seed, n.layout, n.goal, n.lesson]).toEqual([day.seed, day.layout, day.goal, day.lesson]);
			const more = day.limit > 0 ? 2 : 0;
			expect([n.limit, n.three, n.two]).toEqual([day.limit + more, day.three + more, day.two + more]);
		}
	});
});
