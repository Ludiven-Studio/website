// Pong levels plan (1-100). A level = a solo match vs the AI to a target score.
// Difficulty ramps the ball serve speed, the AI reaction (tracking cap) and its
// aiming error, plus the target points. Stars come from the winning margin
// (opponent points conceded — fewer = better), a deterministic skill signal.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';

export interface PongLevelCfg {
	seed: number;
	target: number; // points to reach to win the match (first to N)
	serveSpeed: number; // ball serve speed (units/s)
	aiReaction: number; // AI tracking cap as a fraction of paddleSpeed (higher = sharper)
	aiError: number; // AI aim jitter in field units (higher = looser)
}

/** Deterministic per-level seed so a given level is always the same match. */
const levelSeed = (level: number): number => (Math.imul(level, 2246822519) ^ 0x9e3779b1) >>> 0;

export const pongLevels: LevelPlan<PongLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score', // score = winning margin; higher is better
	config(level: number): PongLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1
		return {
			seed: levelSeed(l),
			target: Math.min(11, 3 + Math.floor((l - 1) / 12)), // 3 → 11 points
			serveSpeed: 70 + t * 60, // 70 → 130 units/s
			aiReaction: 0.6 + t * 0.42, // 0.60 → 1.02 × paddleSpeed
			aiError: 22 - t * 20, // 22 → 2 field units of jitter
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const target = this.config(level).target;
		const conceded = Math.max(0, target - Math.round(r.score)); // score = margin (target - oppScore)
		if (conceded === 0) return 3; // shutout
		if (conceded <= Math.ceil(target / 3)) return 2; // won comfortably
		return 1;
	},
	starHint(level: number) {
		const target = this.config(level).target;
		const two = Math.ceil(target / 3);
		return {
			two: `En concédant ≤ ${two} point${two > 1 ? 's' : ''}`,
			three: 'Sans concéder de point',
		};
	},
};
