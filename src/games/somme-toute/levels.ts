// Somme Toute levels plan (1-100). Difficulty ramps board size (4→6), the value
// range (maxVal 5→9), and the number of holes to fill (6→13). A level = balance
// every row and column; stars from solve time, scaled to the hole count.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { Diff } from './engine';

export interface SommeTouteLevelCfg {
	seed: number;
	diff: Diff;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

export const sommeTouteLevels: LevelPlan<SommeTouteLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): SommeTouteLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0..1 across the whole ramp
		const size = Math.min(6, 4 + Math.floor(t * 3)); // 4 → 6
		const maxVal = Math.min(9, 5 + Math.round(t * 4)); // 5 → 9
		const holes = Math.min(size * size - 1, 6 + Math.round(t * 7)); // 6 → 13
		const diff: Diff = { label: `Niveau ${l}`, size, maxVal, holes };
		// Time targets scale with the hole count. ~2.2 s/hole for 3★, ~4 s/hole for 2★.
		return {
			seed: levelSeed(l),
			diff,
			threeStarCentis: holes * 220,
			twoStarCentis: holes * 400,
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
