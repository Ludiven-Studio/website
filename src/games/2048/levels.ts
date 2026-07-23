// 2048 levels plan (1-100). Each level = reach a TARGET TILE within a move budget,
// on a fixed board size. The target grows across bands (64 → 128 → 256 → 512 →
// 1024 → 2048 → 4096), and within a band the move budget tightens as you progress.
// A level is WON the moment the target tile appears; LOST if the moves (or the
// 10-min clock) run out first. Metric = moves used (fewer is better) → stars from
// how few moves it took.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import { DIFFS, type DiffKey } from './engine';

export interface TwentyFortyEightLevelCfg {
	seed: number;
	diffKey: DiffKey; // board size (facile 5×5, moyen 4×4, difficile 3×3)
	target: number; // tile value to reach to win
	moves: number; // move budget (a level can run out of moves)
	twoStarMoves: number;
	threeStarMoves: number;
	label: string;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// Bands: target tile + board size + move-budget ramp (start → end across the band).
// Bigger boards give more room, so smaller targets pair with the tight 3×3 grid.
const BANDS: { min: number; max: number; target: number; diffKey: DiffKey; from: number; to: number }[] = [
	{ min: 1, max: 12, target: 64, diffKey: 'facile', from: 45, to: 30 },
	{ min: 13, max: 28, target: 128, diffKey: 'facile', from: 80, to: 55 },
	{ min: 29, max: 45, target: 256, diffKey: 'facile', from: 150, to: 110 },
	{ min: 46, max: 62, target: 256, diffKey: 'moyen', from: 130, to: 95 },
	{ min: 63, max: 78, target: 512, diffKey: 'moyen', from: 280, to: 210 },
	{ min: 79, max: 90, target: 1024, diffKey: 'moyen', from: 560, to: 430 },
	{ min: 91, max: 100, target: 2048, diffKey: 'moyen', from: 1100, to: 900 },
];

export const twentyFortyEightLevels: LevelPlan<TwentyFortyEightLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time', // score = moves used; fewer is better
	config(level: number): TwentyFortyEightLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const band = BANDS.find((b) => l <= b.max) ?? BANDS[BANDS.length - 1];
		const span = band.max - band.min;
		const t = span > 0 ? (l - band.min) / span : 0; // 0..1 within the band
		const moves = Math.round(band.from + (band.to - band.from) * t);
		return {
			seed: levelSeed(l),
			diffKey: band.diffKey,
			target: band.target,
			moves,
			// Reaching the target with fewer than ~65% / ~82% of the budget earns 3★ / 2★.
			threeStarMoves: Math.max(1, Math.round(moves * 0.65)),
			twoStarMoves: Math.max(1, Math.round(moves * 0.82)),
			label: `Niveau ${l}`,
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.score <= cfg.threeStarMoves) return 3;
		if (r.score <= cfg.twoStarMoves) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `≤ ${cfg.twoStarMoves} coups`, three: `≤ ${cfg.threeStarMoves} coups` };
	},
};

// Board size used by a level, exposed so the UI can label the grid.
export const levelSize = (level: number): number => DIFFS[twentyFortyEightLevels.config(level).diffKey].size;
