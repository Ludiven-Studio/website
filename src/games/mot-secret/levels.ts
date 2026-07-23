// Mot-secret levels plan (1-100). Difficulty ramps the word length (4 → 7) across four
// bands; within a band the guess budget tightens as you progress. A level = find the
// hidden word; stars from how few guesses it took (metric = fewer is better).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';

export interface MotSecretLevelCfg {
	seed: number;
	len: number; // word length
	tries: number; // max guesses (a level can be lost)
	twoStarTries: number;
	threeStarTries: number;
	label: string;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// Word length per band. Solution pool has words for lengths 4-8 (none at 9).
const BANDS: { min: number; max: number; len: number }[] = [
	{ min: 1, max: 20, len: 4 },
	{ min: 21, max: 45, len: 5 },
	{ min: 46, max: 70, len: 6 },
	{ min: 71, max: 100, len: 7 },
];

export const motSecretLevels: LevelPlan<MotSecretLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time', // score = guesses used; fewer is better
	config(level: number): MotSecretLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const band = BANDS.find((b) => l <= b.max) ?? BANDS[BANDS.length - 1];
		const span = band.max - band.min;
		const t = span > 0 ? (l - band.min) / span : 0; // 0..1 within the band
		// Guess budget tightens from 7 (band start) to 5 (band end).
		const tries = Math.round(7 - 2 * t);
		return {
			seed: levelSeed(l),
			len: band.len,
			tries,
			threeStarTries: Math.max(2, tries - 3),
			twoStarTries: Math.max(3, tries - 1),
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
