// Cocottes vs Renards levels plan (1-100). A level = survive a fixed number of
// waves under a difficulty that ramps with the level. Cleared = you reach the
// target wave with at least one nest standing. Stars come from nests left (fewer
// raids = better) — a clean, deterministic skill signal for the tower-defense.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import { LANES } from './engine';

export interface CocottesLevelCfg {
	seed: number;
	hpMul: number; // fox HP multiplier (baseline before the per-wave ramp)
	speedMul: number; // fox speed multiplier
	spawnMul: number; // wave-interval multiplier (<1 = waves arrive faster)
	startGrain: number; // starting wheat
	targetWave: number; // survive up to (and including) this wave to clear
}

/** Deterministic per-level seed so a given level is always the same siege. */
const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b1) >>> 0;

/** Waves to survive: ramps 5 → ~34 across the 100 levels. */
const targetWaveFor = (level: number): number => 5 + Math.floor((level - 1) * 0.3);

export const cocottesRenardsLevels: LevelPlan<CocottesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score',
	config(level: number): CocottesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1
		return {
			seed: levelSeed(l),
			hpMul: 0.85 + t * 0.7, // 0.85 (easy) → 1.55 (brutal)
			speedMul: 0.9 + t * 0.35, // 0.9 → 1.25
			spawnMul: 1.15 - t * 0.45, // 1.15 (slow waves) → 0.7 (relentless)
			startGrain: Math.round(275 - t * 125), // 275 → 150 wheat to open with
			targetWave: targetWaveFor(l),
		};
	},
	stars(_level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const nests = r.stat ?? 0; // lanes still standing at clear
		if (nests >= LANES) return 3; // no nest lost
		if (nests >= LANES - 1) return 2; // one nest lost
		return 1;
	},
	starHint(level: number) {
		const wave = targetWaveFor(level);
		return {
			two: `Survivre à ${wave} vagues en perdant ≤ 1 nid`,
			three: `Survivre à ${wave} vagues sans perdre de nid`,
		};
	},
};
