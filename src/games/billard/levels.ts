// Billard levels plan (1-100). A level = a seeded rack at a difficulty. The run is
// endless (no loss — a scratch just costs +1 stroke), so grading is purely on shots
// used: CLEARED (1★) once every colour ball is sunk, 2★/3★ for fewer strokes.
// Difficulty ramps the ball count (3 → 5), tightens the spread, and lets balls hug
// the cushions on the harder levels.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export interface BillardLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarShots: number;
	threeStarShots: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b9) >>> 0;

export const billardLevels: LevelPlan<BillardLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time', // score = strokes used (lower is better)
	config(level: number): BillardLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1 ramp
		const balls = Math.min(5, 3 + Math.floor((l - 1) / 34)); // 3 → 5
		const spread = Math.round(26 - 14 * t); // 26 → 12 (tighter clusters, harder breaks)
		const nearCushion = l > 55; // balls may hug the rails on the back half
		const diff: DiffLevel = { label: `Niveau ${l}`, balls, spread, nearCushion };
		// ~1.7 strokes/ball for 3★, ~2.7 strokes/ball for 2★ (rounded up so early levels stay fair).
		return {
			seed: levelSeed(l),
			diff,
			threeStarShots: Math.ceil(balls * 1.7),
			twoStarShots: Math.ceil(balls * 2.7),
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.score <= cfg.threeStarShots) return 3;
		if (r.score <= cfg.twoStarShots) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `≤ ${cfg.twoStarShots} coups`, three: `≤ ${cfg.threeStarShots} coups` };
	},
};
