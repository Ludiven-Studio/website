// Suite mystère levels plan (1-100). A level is a fixed set of N seeded QCM
// questions at a difficulty tier; the player answers them in sequence and the
// level is CLEARED once all N are answered (wrong answers don't fail it).
// Metric = 'time' (total time for the set); stars come from time AND correctness:
// 3★ needs a perfect set under the fast target, 2★ a near-perfect set under the
// medium target, 1★ = simply finishing. Difficulty ramps the family pool the
// questions are drawn from (facile → moyen → difficile), matching the engine.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import { DIFF_ORDER } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export const SUITE_QUESTIONS = 5; // questions per level

export interface SuiteLevelCfg {
	seed: number;
	diffIndex: number; // index into DIFF_ORDER (0 facile … 2 difficile)
	count: number; // SUITE_QUESTIONS
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// Ramp: facile for the first third, moyen for the middle, difficile after ~66%.
const diffIndexFor = (l: number): number => {
	const t = l / LEVEL_COUNT;
	if (t > 0.66) return Math.min(DIFF_ORDER.length - 1, 2);
	if (t > 0.33) return 1;
	return 0;
};

const basePlan: LevelPlan<SuiteLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): SuiteLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const diffIndex = diffIndexFor(l);
		// Time budget per question shrinks as levels climb; harder tiers get more time.
		const perQ = 9 - 4 * (l / LEVEL_COUNT) + diffIndex * 1.5; // seconds/question
		const threeStarCentis = Math.round(SUITE_QUESTIONS * perQ * 100);
		return {
			seed: levelSeed(l),
			diffIndex,
			count: SUITE_QUESTIONS,
			threeStarCentis,
			twoStarCentis: Math.round(threeStarCentis * 1.8),
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		const correct = r.stat ?? 0; // questions answered correctly
		// 3★: perfect set, fast. 2★: at most one miss, under the medium target. Else 1★.
		if (correct >= cfg.count && r.score <= cfg.threeStarCentis) return 3;
		if (correct >= cfg.count - 1 && r.score <= cfg.twoStarCentis) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return {
			two: `≥ ${cfg.count - 1}/${cfg.count} en ≤ ${fmtCentis(cfg.twoStarCentis)}`,
			three: `${cfg.count}/${cfg.count} en ≤ ${fmtCentis(cfg.threeStarCentis)}`,
		};
	},
};

// 101-200: the Expert family pool (non-obvious recurrences), 7 questions per set
// instead of 5, and ~15% less time per question.
export const suiteLevels = extendPlan('suite', basePlan, {
	configExt: (base, _level, baseLevel) => {
		const count = SUITE_QUESTIONS + 2;
		// Keep the "difficile" per-question budget and cut 15% off it.
		const perQ = (9 - 4 * (baseLevel / LEVEL_COUNT) + (DIFF_ORDER.length - 1) * 1.5) * 0.85;
		const threeStarCentis = Math.round(count * perQ * 100);
		return {
			...base,
			diffIndex: DIFF_ORDER.length, // 'expert', appended past the three free tiers
			count,
			threeStarCentis,
			twoStarCentis: Math.round(threeStarCentis * 1.8),
		};
	},
});
