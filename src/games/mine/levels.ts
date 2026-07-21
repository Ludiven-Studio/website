// La Mine aux Cocottes — levels plan (1-100). Fixed 8×8 board; difficulty ramps the
// colour count (5→6), the number of caged cocottes (1→8), and the cage strength
// (1→2 cracks), with a move budget scaled to the work. Stars come from moves left.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { Cfg } from './engine';

export interface MineLevelCfg {
	seed: number;
	cfg: Cfg;
	moves: number;
	twoStarLeft: number;
	threeStarLeft: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b1) >>> 0;

export function levelSetup(level: number): MineLevelCfg {
	const l = Math.max(1, Math.min(LEVEL_COUNT, level));
	const colors = l <= 40 ? 5 : 6;
	const cocottes = Math.min(10, 1 + Math.floor((l - 1) / 11)); // 1 → 10 (extra ones descend from the top)
	const cageHits = l > 60 ? 2 : 1;
	const cfg: Cfg = { rows: 8, cols: 8, colors, cocottes, cageHits };
	// Moves scale with the objective (cracks to make + queued cocottes to bring down),
	// tightening a touch as levels rise.
	const cracks = cocottes * cageHits;
	const moves = Math.max(9, Math.round((9 + cracks * 3.2) * (1 - 0.1 * (l / LEVEL_COUNT))));
	return {
		seed: levelSeed(l),
		cfg,
		moves,
		threeStarLeft: Math.max(1, Math.round(moves * 0.35)),
		twoStarLeft: Math.max(1, Math.round(moves * 0.15)),
	};
}

export const mineLevels: LevelPlan<MineLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score',
	config(level: number): MineLevelCfg {
		return levelSetup(level);
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = levelSetup(level);
		const left = r.stat ?? 0; // moves left at the win
		if (left >= cfg.threeStarLeft) return 3;
		if (left >= cfg.twoStarLeft) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = levelSetup(level);
		return { two: `${cfg.twoStarLeft} coups restants`, three: `${cfg.threeStarLeft} coups restants` };
	},
};
