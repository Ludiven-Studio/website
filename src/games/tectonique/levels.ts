// Tectonique levels plan (1-100). The grid grows 6×6 → 10×10, the crystals and the locks
// pile up with it. Scoring is the chrono alone, so the stars are time budgets: they scale
// with the number of crystals to fetch and the size of the plate to shuffle.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { GenParams } from './engine';

export interface TectoniqueLevelCfg extends GenParams {
	seed: number;
	twoStar: number; // centiseconds
	threeStar: number;
}

/** Stable per-level seed: one band can change without disturbing the others. */
export const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

const clampLevel = (level: number): number => Math.max(1, Math.min(LEVEL_COUNT, level));

export const tectoniqueLevels: LevelPlan<TectoniqueLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): TectoniqueLevelCfg {
		const l = clampLevel(level);
		const n = Math.min(10, 6 + Math.floor((l - 1) / 20));
		const crystals = Math.min(10, 3 + Math.floor((l - 1) / 13));
		const locks = Math.min(3, 1 + Math.floor((l - 1) / 34));
		const three = (6 + 5 * crystals + 2 * (n - 6)) * 100;
		return {
			n,
			crystals,
			rowLocks: locks,
			colLocks: locks,
			allLocks: Math.min(2, Math.floor((l - 1) / 34)),
			holes: n - 3,
			seed: levelSeed(l),
			threeStar: three,
			twoStar: three * 2,
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.score <= cfg.threeStar) return 3;
		if (r.score <= cfg.twoStar) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `≤ ${Math.round(cfg.twoStar / 100)} s`, three: `≤ ${Math.round(cfg.threeStar / 100)} s` };
	},
};

/** Free play and the daily share three bands; the daily picks with the server's difficulty index. */
export const TECTONIQUE_BANDS: GenParams[] = [
	{ n: 6, crystals: 4, rowLocks: 1, colLocks: 1, allLocks: 0, holes: 3 },
	{ n: 8, crystals: 6, rowLocks: 2, colLocks: 2, allLocks: 1, holes: 5 },
	{ n: 10, crystals: 8, rowLocks: 3, colLocks: 3, allLocks: 2, holes: 7 },
];
