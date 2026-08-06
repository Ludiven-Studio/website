// Cocotte Foot levels plan (1-100). A level = a SOLO match: you (+ an AI teammate on
// harder levels) vs AI opponents, first to `target` goals. Difficulty ramps the goal
// target, the opponent bot skill, and the team size (1v1 → 2v2). A win = 1★; the extra
// stars come from the goal MARGIN (how dominant the win was). metric 'score' = margin.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';

export interface FootLevelCfg {
	teamSize: 1 | 2; // 1v1 (early) → 2v2 (from level 26)
	target: number; // goals to reach to win the match
	oppSkill: number; // opponent bot skill 0..1 (reaction sharpness + aggression)
	mateSkill: number; // your AI teammate skill 0..1 (kept a touch below the opponent)
	twoStarMargin: number; // win by this margin → 2★
	threeStarMargin: number; // win by this margin → 3★
}

const clampLevel = (level: number): number => Math.max(1, Math.min(LEVEL_COUNT, level));

const basePlan: LevelPlan<FootLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score', // margin — higher is better
	config(level: number): FootLevelCfg {
		const l = clampLevel(level);
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0..1 ramp
		const teamSize: 1 | 2 = l >= 26 ? 2 : 1;
		// Target climbs 3 → 8 goals across the ladder.
		const target = Math.min(8, 3 + Math.floor(t * 5.5));
		// Opponent skill ramps 0.2 → 1; your teammate trails a bit so you carry the match.
		const oppSkill = Math.min(1, 0.2 + t * 0.85);
		const mateSkill = Math.max(0.15, oppSkill - 0.2);
		// Dominance thresholds scale with the target so a longer match needs a wider gap.
		const twoStarMargin = Math.max(2, Math.round(target * 0.4));
		const threeStarMargin = Math.max(3, Math.round(target * 0.7));
		return { teamSize, target, oppSkill, mateSkill, twoStarMargin, threeStarMargin };
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		const margin = r.score; // your goals − opponent goals
		if (margin >= cfg.threeStarMargin) return 3;
		if (margin >= cfg.twoStarMargin) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `+${cfg.twoStarMargin} d'écart`, three: `+${cfg.threeStarMargin} d'écart` };
	},
};

// 101-200: longer matches, opponents at full skill, a weaker teammate and wider star margins.
export const footLevels = extendPlan('foot', basePlan, {
	configExt: (base) => {
		const target = Math.min(12, base.target + 2);
		return {
			...base,
			target,
			oppSkill: 1,
			mateSkill: Math.max(0.15, base.mateSkill - 0.15),
			twoStarMargin: Math.max(3, Math.round(target * 0.5)),
			threeStarMargin: Math.max(4, Math.round(target * 0.8)),
		};
	},
});
