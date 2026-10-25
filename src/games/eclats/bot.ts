// A greedy player for Éclats: it tries the four swipes, plays each on a copy and keeps the best.
// It sees exactly what a player sees (the board and the arrival stream are both deterministic).
// Used by the tests to prove every level winnable and by scripts/eclats-levels.ts to set each
// level's par. `casual` mixes in random swipes to stand in for a player who is not optimising.

import { DIRS, N, cloneState, countWaves, createGame, emptyCells, play, type Dir, type EclatsCfg, type State } from './engine';
import { mulberry32 } from '../prng';

/** Pairs of same-colour neighbours: groups in the making. */
function pairs(s: State): number {
	let n = 0;
	for (let i = 0; i < N * N; i++) {
		const b = s.cells[i];
		if (!b || b.kind !== 'gem') continue;
		const right = i % N < N - 1 ? s.cells[i + 1] : null;
		const down = i + N < N * N ? s.cells[i + N] : null;
		if (right?.kind === 'gem' && right.color === b.color) n++;
		if (down?.kind === 'gem' && down.color === b.color) n++;
	}
	return n;
}

/** Charged gems on the board: power stored for later. */
const power = (s: State): number => s.cells.reduce((t, b) => t + (b?.kind === 'gem' ? b.rank - 1 : 0), 0);

/** Gems right beside a chest: the next explosion there opens it. */
function chestContacts(s: State): number {
	let n = 0;
	for (let i = 0; i < N * N; i++) {
		if (s.cells[i]?.kind !== 'chest') continue;
		const [r, c] = [Math.floor(i / N), i % N];
		for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
			const rr = r + dr;
			const cc = c + dc;
			if (rr >= 0 && rr < N && cc >= 0 && cc < N && s.cells[rr * N + cc]?.kind === 'gem') n++;
		}
	}
	return n;
}

export function bestMove(s: State): Dir | null {
	let best: Dir | null = null;
	let bestV = -Infinity;
	for (const d of DIRS) {
		const t = cloneState(s);
		const steps = play(t, d);
		if (!steps) continue;
		const opened = t.opened - s.opened;
		let v = opened * 1000 + (t.score - s.score) + countWaves(steps) * 15 + emptyCells(t) * 14 + pairs(t) * 4 + chestContacts(t) * 6 + power(t) * 6;
		if (t.status === 'won') v += 1e6;
		if (t.status === 'lost') v -= 1e6;
		if (v > bestV) {
			bestV = v;
			best = d;
		}
	}
	return best;
}

export interface BotRun {
	won: boolean;
	moves: number;
	score: number;
	opened: number;
	waves: number[]; // per move
}

export function playBot(cfg: EclatsCfg, opts: { casual?: number; maxMoves?: number; seed?: number } = {}): BotRun {
	const s = createGame(cfg);
	const rng = mulberry32(opts.seed ?? 1);
	const max = opts.maxMoves ?? 400;
	const waves: number[] = [];
	while (s.status === 'playing' && s.moves < max) {
		let d = bestMove(s);
		if (!d) break;
		if (opts.casual && rng() >= opts.casual) {
			const ok = DIRS.filter((x) => play(cloneState(s), x));
			d = ok[Math.floor(rng() * ok.length)];
		}
		const steps = play(s, d)!;
		waves.push(countWaves(steps));
	}
	return { won: s.status === 'won', moves: s.moves, score: s.score, opened: s.opened, waves };
}
