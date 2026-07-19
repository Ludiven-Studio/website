// Angry levels plan (1-100). A level = a seeded fortress layout at a ramping
// difficulty, cleared when every fox is down before the shot budget runs out.
// Stars come from shots left (fewer cocottes used = better) — a clean,
// deterministic skill signal, like luge grading on lives.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export interface AngryLevelCfg {
	seed: number;
	diff: DiffLevel; // layout params fed to makeLevel (foxes, hp, sturdiness)
	budget: number; // cocottes allowed this level; running out with foxes left = loss
}

/** Deterministic per-level seed so a given level is always the same fortress. */
const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x9e3779b1) >>> 0;

/** foxes 3 → 7, hp 30 → 90 over the ramp; the budget gives extra shots that thin out. */
function levelDiff(l: number): DiffLevel {
	const foxes = Math.min(7, 3 + Math.floor((l - 1) / 20)); // 3 … 7
	const hp = 30 + Math.round((l - 1) * (60 / (LEVEL_COUNT - 1))); // 30 … 90
	const sturdiness = 1 + Math.floor((l - 1) / 25); // 1 … 4
	return { label: `Niveau ${l}`, foxes, hp, margin: 0, sturdiness };
}

/** Shots allowed = foxes + a shrinking bonus (early levels forgiving, late tight). */
function levelBudget(l: number, foxes: number): number {
	const bonus = Math.max(1, 4 - Math.floor((l - 1) / 25)); // +4 … +1
	return foxes + bonus;
}

export const angryLevels: LevelPlan<AngryLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score', // score = shots left, so more-left ranks higher
	config(level: number): AngryLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const diff = levelDiff(l);
		return { seed: levelSeed(l), diff, budget: levelBudget(l, diff.foxes) };
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		const left = r.stat ?? 0; // shots left after clearing
		// 3★ = clear with a comfortable margin, 2★ = a little spare, 1★ = any clear.
		const three = cfg.budget - cfg.diff.foxes; // used ≈ one shot per fox
		const two = Math.max(1, three - 2);
		if (left >= three) return 3;
		if (left >= two) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		const three = cfg.budget - cfg.diff.foxes;
		const two = Math.max(1, three - 2);
		return { two: `≥ ${two} cocottes restantes`, three: `≥ ${three} cocottes restantes` };
	},
};
