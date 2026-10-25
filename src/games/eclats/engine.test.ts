import { describe, it, expect } from 'vitest';
import {
	N,
	arrivalAt,
	createGame,
	endlessStep,
	entryEdge,
	fifthNow,
	findGroups,
	play,
	previewGroups,
	slide,
	upcoming,
	STEP_MOVES,
	type Block,
	type Burst,
	type EclatsCfg,
	type Kind,
	type State,
	type Step,
} from './engine';
import { playBot } from './bot';
import { eclatsLevels, levelConfig } from './levels';
import { PICKS } from './picks';

const CFG: EclatsCfg = { seed: 7, fifth: 0, goal: 0, chests: 0, locked: 0, chestEvery: 0, rocks: 0, ice: 0, fill: 0, bombAt: 4, starAt: 6 };

/** An empty board: the test lays out the blocks. */
function blank(over: Partial<EclatsCfg> = {}): State {
	const s = createGame({ ...CFG, ...over });
	s.cells.fill(null);
	return s;
}

const at = (r: number, c: number): number => r * N + c;

function put(s: State, r: number, c: number, kind: Kind, color = 0, extra: Partial<Block> = {}): Block {
	const b: Block = { id: s.nextId++, kind, color, ice: false, lock: false, ...extra };
	s.cells[at(r, c)] = b;
	return b;
}

const bursts = (steps: Step[]): Burst[] => steps.filter((x): x is Burst => x.t === 'burst');

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

describe('specials', () => {
	it('a group of 4 leaves a bomb on its leading cell', () => {
		const s = blank();
		[0, 1, 2, 3].forEach((c) => put(s, 5, c, 'gem', 1));
		put(s, 0, 5, 'gem', 3); // something has to move
		const b = bursts(play(s, 'left')!)[0];
		expect(b.specials).toEqual([expect.objectContaining({ kind: 'bomb', cell: at(5, 0) })]);
		expect(b.popped).toHaveLength(3);
	});

	it('a star clears every gem of its colour', () => {
		const s = blank();
		[0, 1, 2].forEach((c) => put(s, 5, c, 'gem', 1));
		put(s, 5, 3, 'star', 2);
		put(s, 2, 2, 'gem', 2);
		put(s, 0, 5, 'gem', 2);
		put(s, 0, 4, 'gem', 3);
		const b = bursts(play(s, 'down')!)[0];
		expect(b.stars).toHaveLength(1);
		expect(b.popped.filter((p) => p.kind === 'gem' && p.color === 2)).toHaveLength(2);
	});
});

describe('bombs in a chain', () => {
	it('two bombs side by side both go off, and the blast opens a chest', () => {
		const s = blank();
		[0, 1, 2].forEach((c) => put(s, 5, c, 'gem', 0));
		put(s, 5, 3, 'bomb');
		put(s, 4, 4, 'bomb');
		put(s, 3, 5, 'chest');
		put(s, 0, 0, 'gem', 1); // so the swipe down moves something
		const b = bursts(play(s, 'down')!)[0];
		expect(b.blasts).toHaveLength(2);
		expect(b.opened).toHaveLength(1);
	});
});

describe('chests, rocks, ice', () => {
	it('an explosion beside a chest opens it; a locked one takes two', () => {
		const s = blank({ goal: 9 });
		[0, 1, 2].forEach((c) => put(s, 5, c, 'gem', 0));
		put(s, 4, 1, 'chest', 0, { lock: true });
		put(s, 0, 5, 'gem', 3);
		const b = bursts(play(s, 'down')!)[0];
		expect(b.unlocked).toHaveLength(1);
		expect(b.opened).toHaveLength(0);
		expect(s.cells.some((x) => x?.kind === 'chest' && !x.lock)).toBe(true);
	});

	it('an explosion breaks the rock beside it and thaws the ice beside it', () => {
		const s = blank();
		[1, 2, 3].forEach((c) => put(s, 5, c, 'gem', 0));
		put(s, 5, 0, 'rock');
		put(s, 4, 2, 'gem', 1, { ice: true });
		put(s, 0, 5, 'gem', 3);
		const b = bursts(play(s, 'down')!)[0];
		expect(b.popped.some((p) => p.kind === 'rock')).toBe(true);
		expect(b.thawed).toEqual([at(4, 2)]);
	});

	it('opening the last chest ends the level at once', () => {
		const s = blank({ goal: 1 });
		[0, 1, 2].forEach((c) => put(s, 5, c, 'gem', 0));
		put(s, 4, 0, 'chest');
		put(s, 0, 5, 'gem', 3);
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
		const right = entryEdge('left');
		expect(right.every((i) => arrive.cells[i] !== null)).toBe(true);
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
		for (let i = 0; i < N * N; i++) s.cells[i] = { id: s.nextId++, kind: 'gem', color: ((i % N) + Math.floor(i / N) * 2) % 4, ice: false, lock: false };
		s.cells[0] = null;
		const steps = play(s, 'left');
		// The swipe fills the board back up: unless something explodes, it is over.
		if (steps && !bursts(steps).length) expect(s.status).toBe('lost');
	});
});

describe('levels', () => {
	it('picks.ts matches the engine: the bot clears every level in the swipes recorded there', () => {
		// Fails after a change to the engine, the bot or a board: rerun scripts/eclats-levels.ts.
		expect(PICKS).toHaveLength(200);
		const stale: number[] = [];
		for (let l = 1; l <= 200; l++) {
			const run = playBot(levelConfig(l));
			if (!run.won || run.moves !== PICKS[l - 1][1]) stale.push(l);
		}
		expect(stale).toEqual([]);
	}, 60_000);

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
