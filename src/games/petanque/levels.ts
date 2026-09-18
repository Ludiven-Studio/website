// Petanque levels plan (1-100+): every level is a whole tete-a-tete against an AI. Four knobs
// ramp together — the AI's skill, the surface (predictable clay → dispersive coarse gravel), the
// relief, and the target score. A LOSS scores 0 stars and unlocks nothing; a win grades on how
// few points you conceded, so a 13-0 is worth more than a 13-12.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import { MAX_SKILL, MIN_SKILL } from './ai';
import type { SurfaceId } from './terrain';

export interface PetanqueLevelCfg {
	seed: number;
	skill: number; // AI strength 0..1
	surface: SurfaceId;
	amp: number; // relief amplitude, m
	target: number; // points that win the match
}

const levelSeed = (level: number): number => (Math.imul(level, 2246822519) ^ 0x85ebca6b) >>> 0;

/* Where the BASE ladder tops out, well under the AI's MAX_SKILL. Measurement G0, an average player
   against a 0.95 AI: 25 % over a match to 5 and 14 % to 9 — level 100 would be a wall. The top
   skill is the Expert pack's to spend, not the base ladder's. */
const BASE_TOP_SKILL = 0.76;

const basePlan: LevelPlan<PetanqueLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score', // score = target - points conceded (higher = better)
	config(level: number): PetanqueLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1 ramp
		return {
			seed: levelSeed(l),
			// Bent, not linear: a straight ramp only reached a middling player's own strength at
			// level 68, so two thirds of the ladder was played against someone weaker.
			skill: Math.round((MIN_SKILL + (BASE_TOP_SKILL - MIN_SKILL) * Math.pow(t, 0.8)) * 100) / 100,
			surface: l <= 25 ? 'terre-battue' : l <= 60 ? 'gravier-fin' : 'gravier-gros',
			amp: Math.round((0.015 + 0.035 * t) * 1000) / 1000, // 1.5 → 5.0 cm
			// Length is not a second knob next to skill, it MULTIPLIES it: a match is N independent
			// menes, so a per-mene edge compounds. Measured against a 0.95 AI, an average player
			// wins 25 % to 5, 10 % to 11 and near nothing to 13. The ladder therefore stops at 9.
			target: l <= 25 ? 5 : l <= 65 ? 7 : 9,
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0; // beaten by the AI
		const { target } = this.config(level);
		const conceded = r.stat ?? target;
		// Thirds of the target, so a short match demands the same dominance as a long one.
		if (conceded <= target / 3) return 3;
		if (conceded <= (target * 2) / 3) return 2;
		return 1;
	},
	starHint(level: number) {
		const { target } = this.config(level);
		return {
			two: `gagne en concédant ≤ ${Math.floor((target * 2) / 3)} points`,
			three: `gagne en concédant ≤ ${Math.floor(target / 3)} points`,
		};
	},
};

// 101-200: the same ladder on coarse gravel throughout, with more relief, and spending the skill
// the base ladder left on the table — level 200 is the only one that meets the AI at full strength.
export const petanqueLevels = extendPlan('petanque', basePlan, {
	configExt: (base) => ({
		...base,
		skill: Math.min(MAX_SKILL, Math.round((base.skill + (MAX_SKILL - BASE_TOP_SKILL)) * 100) / 100),
		surface: 'gravier-gros' as SurfaceId,
		amp: Math.min(0.075, base.amp + 0.02),
	}),
});
