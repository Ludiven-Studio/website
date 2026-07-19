// Meli-Melo levels plan (1-100). Score game: 90 s to reach a target number of Boggle
// points on a seeded grid. Difficulty ramps the point target and shrinks the grid's
// richness band (fewer findable points available), so higher levels leave less slack.
// A level is cleared when the final score reaches config.target; stars from higher
// score thresholds scaled to the target.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export interface MeliMeloLevelCfg {
	seed: number;
	diff: DiffLevel;
	target: number; // points to clear (1★)
	twoStarPoints: number;
	threeStarPoints: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

export const meliMeloLevels: LevelPlan<MeliMeloLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score',
	config(level: number): MeliMeloLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1
		// Grid richness band shrinks from generous to lean so late levels can't overshoot.
		const minPoints = Math.round(30 + 30 * t); // 30 → 60 findable pts available
		const maxPoints = Math.round(80 + 90 * t); // 80 → 170
		const diff: DiffLevel = { label: `Niveau ${l}`, minPoints, maxPoints };
		// Target ramps 8 → 45 pts to find within 90 s.
		const target = Math.round(8 + 37 * t);
		return {
			seed: levelSeed(l),
			diff,
			target,
			twoStarPoints: Math.round(target * 1.35),
			threeStarPoints: Math.round(target * 1.75),
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.score >= cfg.threeStarPoints) return 3;
		if (r.score >= cfg.twoStarPoints) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `≥ ${cfg.twoStarPoints} pts`, three: `≥ ${cfg.threeStarPoints} pts` };
	},
};
