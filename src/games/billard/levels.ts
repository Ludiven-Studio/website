// Billard levels plan (1-100+): each level is an 8-BALL match against an AI whose strength
// (aim accuracy + shot selection, 0..1) ramps with the level. A LOSS to the AI scores 0 stars
// and doesn't unlock the next level; a WIN unlocks it, and the more of the opponent's balls
// still on the table when you sink the black, the more dominant the win → more stars.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';

export interface BillardLevelCfg {
	seed: number;
	skill: number; // AI strength 0..1
}

const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b9) >>> 0;

const basePlan: LevelPlan<BillardLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score', // score = opponent balls still on the table when you win (higher = better)
	config(level: number): BillardLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1 ramp
		return { seed: levelSeed(l), skill: Math.round((0.25 + 0.65 * t) * 100) / 100 }; // 0.25 → 0.90
	},
	stars(_level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0; // lost to the AI
		const left = r.stat ?? 0; // opponent balls left when you sank the black
		return left >= 5 ? 3 : left >= 2 ? 2 : 1;
	},
	starHint() {
		return { two: 'gagne en laissant ≥2 boules adverses', three: 'gagne en laissant ≥5 boules adverses' };
	},
};

// 101-200: the same ladder but a notch stronger (Expert pack).
export const billardLevels = extendPlan('billard', basePlan, {
	configExt: (base) => ({ ...base, skill: Math.min(0.98, base.skill + 0.08) }),
});
