// Mots Tournés levels plan (1-100). Difficulty ramps grid size (4×4 → 6×5), word
// count (3-4 → 5-6) and word length range, plus the number of wall cells. A level =
// trace every themed word (the paths tile the grid); stars from solve time, scaled
// to the total cell count so a bigger grid gets more time.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface MotsTournesLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

const basePlan: LevelPlan<MotsTournesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): MotsTournesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1 ramp

		// Grid grows 4×4 → 6×5 across the run.
		const rows = 4 + Math.floor(t * 2 + 1e-9); // 4 → 6
		const cols = 4 + Math.floor(t * 1 + 1e-9); // 4 → 5
		const cells = rows * cols;

		const diff: DiffLevel = {
			label: `Niveau ${l}`,
			rows,
			cols,
			minWords: 3 + Math.floor(t * 2 + 1e-9), // 3 → 5
			maxWords: 4 + Math.floor(t * 2 + 1e-9), // 4 → 6
			minLen: 4,
			maxLen: 6 + Math.floor(t * 2 + 1e-9), // 6 → 8
			maxEmpty: 2 + Math.floor(t * 2 + 1e-9), // 2 → 4
		};

		// ~1.6 s/cell for 3★, ~2.8 s/cell for 2★.
		return {
			seed: levelSeed(l),
			diff,
			threeStarCentis: cells * 160,
			twoStarCentis: cells * 280,
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
		return { two: `≤ ${fmtCentis(cfg.twoStarCentis)}`, three: `≤ ${fmtCentis(cfg.threeStarCentis)}` };
	},
};

// 101-200: the Expert grid (6×6), one word more, longer words and a tighter clock.
export const motsTournesLevels = extendPlan('mots-tournes', basePlan, {
	configExt: (base, level) => {
		const rows = 6, cols = 6;
		const cells = rows * cols;
		return {
			...base,
			diff: {
				...base.diff,
				label: `Niveau ${level}`,
				rows,
				cols,
				minWords: base.diff.minWords + 1,
				maxWords: base.diff.maxWords + 1,
				maxLen: Math.min(9, base.diff.maxLen + 1),
				maxEmpty: base.diff.maxEmpty + 1,
			},
			threeStarCentis: cells * 145,
			twoStarCentis: cells * 250,
		};
	},
});
