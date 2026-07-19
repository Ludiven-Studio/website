// Lettres Croisées levels plan (1-100). Difficulty ramps the base word length
// (6 → 7 letters) and the grid word count (5 → 9). A level = fill every grid word;
// stars come from the solve time, scaled to the target word count.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export interface LettresCroiseesLevelCfg {
	seed: number;
	diff: DiffLevel;
	words: number; // expected grid word count (for star scaling)
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

export const lettresCroiseesLevels: LevelPlan<LettresCroiseesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): LettresCroiseesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		// Base length 6 for the first ~40 levels, then 7. Longer base = more subwords.
		const baseLen = l <= 40 ? 6 : 7;
		// Word count ramps 5 → 9 across the run; the max stays 2 above the min.
		const minWords = Math.min(7, 5 + Math.floor((l - 1) / 33)); // 5 → 7
		const extra = Math.min(2, Math.floor((l - 1) / 50)); // widen the window late
		const maxWords = minWords + 1 + extra; // 6 → 9
		// Longer minimum word later on = fewer easy 3-letter fills.
		const minLen = l <= 20 ? 3 : 4;
		const words = maxWords; // grade against the top of the range
		const diff: DiffLevel = { label: `Niveau ${l}`, baseLen, minWords, maxWords, minLen };
		// ~7 s/word for 3★, ~12 s/word for 2★ (composing from a wheel is slower than clicking).
		return {
			seed: levelSeed(l),
			diff,
			words,
			threeStarCentis: words * 700,
			twoStarCentis: words * 1200,
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.score <= cfg.threeStarCentis) return 3;
		if (r.score <= cfg.twoStarCentis) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		const s = (c: number) => `${Math.round(c / 100)} s`;
		return { two: `≤ ${s(cfg.twoStarCentis)}`, three: `≤ ${s(cfg.threeStarCentis)}` };
	},
};
