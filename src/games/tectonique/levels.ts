// Tectonique levels plan (1-100). Grids come pre-solved from grids.ts, so the star
// thresholds are absolute rather than guessed: 3★ = the proven optimum, 2★ = two moves
// over it, 1★ = solved at all. Difficulty ramps through the bands baked into that file
// (4×4 / 2 crystals / 1 lock → 6×6 / 5 crystals / 4 locks).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import { TECTONIQUE_LEVELS, type PackedGrid } from './grids';

export interface TectoniqueLevelCfg {
	grid: PackedGrid;
	twoStarMoves: number;
	threeStarMoves: number;
}

export const tectoniqueLevels: LevelPlan<TectoniqueLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time', // score = moves played, fewer is better → the 'time' direction
	config(level: number): TectoniqueLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const grid = TECTONIQUE_LEVELS[l - 1];
		return { grid, threeStarMoves: grid.opt, twoStarMoves: grid.opt + 2 };
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
