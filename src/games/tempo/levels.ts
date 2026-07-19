// Tempo levels plan (1-100). A level = play ONE seeded song run at a difficulty
// tier. It CLEARS (1★) when the run's final score reaches the target; 2★/3★ come
// from higher scores. Difficulty ramps the target AND the chart: more lanes
// (4 → 5 → 6) and a faster starting tempo. A run that ends below target — or on
// energy-out (too many misses) — is a loss (0★).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';

export interface TempoLevelCfg {
	seed: number;
	diff: number; // ENDLESS_OPTS tier index: 0 (4 lanes) · 1 (5 lanes) · 2 (6 lanes)
	speed: number; // starting-tempo multiplier fed to buildEndlessChart
	target: number; // score for 1★
	twoStar: number; // score for 2★
	threeStar: number; // score for 3★
}

/** Deterministic per-level seed so a given level is always the same song. */
const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b1) >>> 0;

/** Smooth lerp over the 1..100 span, `p` in [0,1]. */
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

export const tempoLevels: LevelPlan<TempoLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score',
	config(level: number): TempoLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const p = (l - 1) / (LEVEL_COUNT - 1); // 0 at level 1, 1 at level 100

		// Lane tier climbs in thirds: 1-33 → 4 lanes, 34-66 → 5 lanes, 67-100 → 6 lanes.
		const diff = Math.min(2, Math.floor((l - 1) / 34));
		// Starting tempo speeds up within each ramp; caps just under "difficile" (1.3).
		const speed = Math.round(lerp(0.8, 1.25, p) * 100) / 100;

		// Target rises with the level: level 1 ≈ 1200 pts, level 100 ≈ 12000 pts.
		// A bit steeper near the top so the last tiers still ask for near-clean play.
		const target = Math.round(lerp(1200, 8500, p) + 3500 * p * p);
		return {
			seed: levelSeed(l),
			diff,
			speed,
			target,
			twoStar: Math.round(target * 1.4),
			threeStar: Math.round(target * 1.9),
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = tempoLevels.config(level);
		if (r.score >= cfg.threeStar) return 3;
		if (r.score >= cfg.twoStar) return 2;
		return 1;
	},
	starHint(level: number): { two: string; three: string } {
		const cfg = tempoLevels.config(level);
		return { two: `${cfg.twoStar} pts`, three: `${cfg.threeStar} pts` };
	},
};
