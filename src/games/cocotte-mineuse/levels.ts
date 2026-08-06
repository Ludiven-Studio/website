// Cocotte Mineuse levels plan (1-100). A level = one dig run on a fixed seed and a
// difficulty that ramps with the level. Cleared (1★) when the final score reaches
// the level target; 2★ / 3★ for beating it by a margin. Score = depth + ores + jewels
// (scoreOf), so the ramp tightens the flood (faster ticks), thickens the stones and
// thins the ore — you have to dig smarter and craft to keep pace.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { MineDiff } from './engine';

export interface CocotteMineuseCfg {
	seed: number;
	diff: MineDiff;
	target: number; // score to clear the level (1★)
}

/** Deterministic per-level seed so a given level is always the same mine. */
const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b1) >>> 0;

/** 0 at level 1, 1 at level 100 — the ramp parameter. */
const ramp = (level: number): number => (Math.max(1, Math.min(LEVEL_COUNT, level)) - 1) / (LEVEL_COUNT - 1);

const basePlan: LevelPlan<CocotteMineuseCfg> = {
	count: LEVEL_COUNT,
	metric: 'score',
	config(level: number): CocotteMineuseCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = ramp(l);
		const diff: MineDiff = {
			label: `Niveau ${l}`,
			tickMs: Math.round(220 - t * 55), // 220 (lvl 1) → 165 (lvl 100): grid + flood get quicker
			lampDrainPerSec: 1 / Math.round(100 - t * 35), // 1/100 → 1/65: lamp dims sooner
			workbenchDrainFactor: 0.25,
			stoneDensity: 0.06 + t * 0.07, // 0.06 → 0.13: more falling-stone danger
			oreRichness: 1.2 - t * 0.3, // 1.2 → 0.9: leaner veins, less free score
		};
		// Target grows almost linearly: shallow at first (reachable by digging a bit and
		// grabbing surface ore), steep late (needs deeper runs + crafted jewels).
		const target = Math.round(60 + l * 14 + t * l * 3);
		return { seed: levelSeed(l), diff, target };
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const target = this.config(level).target;
		if (r.score >= target * 1.8) return 3;
		if (r.score >= target * 1.35) return 2;
		return 1;
	},
	starHint(level: number) {
		const target = this.config(level).target;
		return { two: `Score ≥ ${Math.round(target * 1.35)}`, three: `Score ≥ ${Math.round(target * 1.8)}` };
	},
};

// 101-200: the Expert mine — quicker ticks (so a quicker downpour), thicker stone,
// leaner ore — and a score target raised by a quarter.
export const cocotteMineuseLevels = extendPlan('cocotte-mineuse', basePlan, {
	configExt: (base, level) => ({
		...base,
		diff: {
			...base.diff,
			label: `Niveau ${level}`,
			tickMs: Math.max(145, base.diff.tickMs - 20),
			lampDrainPerSec: base.diff.lampDrainPerSec * 1.18,
			stoneDensity: Math.min(0.17, base.diff.stoneDensity + 0.04),
			oreRichness: Math.max(0.8, base.diff.oreRichness - 0.1),
		},
		target: Math.round(base.target * 1.25),
	}),
});
