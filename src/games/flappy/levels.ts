// Flappy levels plan (1-100). A level = play one run. It CLEARS (1★) when the run's
// final score (pipes cleared) reaches the target. 2★/3★ come from higher scores.
// Difficulty ramps the target AND the course: gaps shrink, pipes tighten, scroll speeds up.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';

export interface FlappyLevelCfg {
	seed: number;
	gapH: number; // gap opening height at the start of the run
	pipeSpacing: number; // distance between consecutive pipes
	speed: number; // horizontal scroll speed, units / s
	target: number; // pipes to clear for 1★
	twoStar: number; // score for 2★
	threeStar: number; // score for 3★
}

/** Deterministic per-level seed so a given level is always the same course. */
const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b1) >>> 0;

/** Smooth lerp over the 1..100 span, `p` in [0,1]. */
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

const basePlan: LevelPlan<FlappyLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score',
	config(level: number): FlappyLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const p = (l - 1) / (LEVEL_COUNT - 1); // 0 at level 1, 1 at level 100

		// Course tightens with the level (gaps ⤵, spacing ⤵, speed ⤴).
		const gapH = Math.round(lerp(34, 20, p) * 10) / 10; // 34 → 20 (below "difficile" 23 at the top)
		const pipeSpacing = Math.round(lerp(84, 50, p)); // 84 → 50
		const speed = Math.round(lerp(36, 56, p)); // 36 → 56

		// Target rises: level 1 ≈ 3 pipes, level 100 ≈ 62 pipes. Grows a touch faster near the top.
		const target = Math.round(lerp(3, 40, p) + 22 * p * p);
		return {
			seed: levelSeed(l),
			gapH,
			pipeSpacing,
			speed,
			target,
			twoStar: Math.round(target * 1.5),
			threeStar: target * 2,
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.score >= cfg.threeStar) return 3;
		if (r.score >= cfg.twoStar) return 2;
		return 1;
	},
	starHint(level: number): { two: string; three: string } {
		const cfg = this.config(level);
		return { two: `${cfg.twoStar} pts`, three: `${cfg.threeStar} pts` };
	},
};

// 101-200: the course picks up where level 100 stops and ends past the Expert pill.
export const flappyLevels = extendPlan('flappy', basePlan, {
	configExt: (base, level) => {
		const p = (level - LEVEL_COUNT) / LEVEL_COUNT; // 0 → 1 across the extended half
		const target = Math.round(lerp(62, 95, p));
		return {
			...base,
			gapH: Math.round(lerp(20, 17, p) * 10) / 10,
			pipeSpacing: Math.round(lerp(50, 42, p)),
			speed: Math.round(lerp(56, 64, p)),
			target,
			twoStar: Math.round(target * 1.5),
			threeStar: target * 2,
		};
	},
});
