// Codecolor levels plan (1-100). Difficulty ramps the code length (3 → 6) and palette
// size across four bands; within a band the guess budget tightens as you progress.
// A level = crack the code; stars from how few guesses it took (metric = fewer is better).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';

export interface CodeColorLevelCfg {
	seed: number;
	slots: number; // code length
	colors: number; // palette size
	tries: number; // max guesses (a level can be lost)
	twoStarTries: number;
	threeStarTries: number;
	label: string;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// slots/colors per band. PALETTE has 8 hues, so colors ≤ 8.
const BANDS: { min: number; max: number; slots: number; colors: number }[] = [
	{ min: 1, max: 20, slots: 3, colors: 5 },
	{ min: 21, max: 45, slots: 4, colors: 6 },
	{ min: 46, max: 70, slots: 5, colors: 7 },
	{ min: 71, max: 100, slots: 6, colors: 8 },
];

export const codecolorLevels: LevelPlan<CodeColorLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time', // score = guesses used; fewer is better
	config(level: number): CodeColorLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const band = BANDS.find((b) => l <= b.max) ?? BANDS[BANDS.length - 1];
		const span = band.max - band.min;
		const t = span > 0 ? (l - band.min) / span : 0; // 0..1 within the band
		// Guess budget tightens from slots+7 (band start) to slots+4 (band end).
		const tries = Math.round(band.slots + 7 - 3 * t);
		return {
			seed: levelSeed(l),
			slots: band.slots,
			colors: band.colors,
			tries,
			threeStarTries: band.slots + 1,
			twoStarTries: band.slots + 3,
			label: `Niveau ${l}`,
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.score <= cfg.threeStarTries) return 3;
		if (r.score <= cfg.twoStarTries) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `≤ ${cfg.twoStarTries} essais`, three: `≤ ${cfg.threeStarTries} essais` };
	},
};
