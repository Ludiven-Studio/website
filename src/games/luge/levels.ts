// Luge levels plan (1-100). A level = reach a target distance under a difficulty
// baseline that ramps with the level. Stars come from lives left (fewer crashes =
// better) — a clean, deterministic skill signal for an endless runner.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import { LUGE } from './engine';

export interface LugeLevelCfg {
	seed: number;
	baseline: number; // meters of difficulty pre-ramp (fed to setDifficultyBaseline)
	targetDist: number; // meters to travel to clear the level
}

/** Deterministic per-level seed so a given level is always the same descent. */
const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b1) >>> 0;

export const lugeLevels: LevelPlan<LugeLevelCfg> = {
	count: LEVEL_COUNT,
	config(level: number): LugeLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		return {
			seed: levelSeed(l),
			baseline: (l - 1) * 50, // level 100 ≈ 4950 m in → near the top-difficulty asymptote
			targetDist: 450 + l * 65, // level 1 ≈ 515 m … level 100 ≈ 6950 m
		};
	},
	stars(_level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const lives = r.stat ?? 0;
		if (lives >= LUGE.lives) return 3; // no crash
		if (lives >= LUGE.lives - 1) return 2; // one crash
		return 1;
	},
	starHint() {
		return { two: 'En perdant ≤ 1 vie', three: 'Sans perdre de vie' };
	},
};
