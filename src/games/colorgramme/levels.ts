// Colorgramme levels plan (1-100). Difficulty ramps grid size (5→8) and colour
// count (2→3). A level = fully reconstruct the hidden picture; stars from solve
// time, scaled to the cell count.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface ColorgrammeLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

const basePlan: LevelPlan<ColorgrammeLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): ColorgrammeLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const size = Math.min(8, 5 + Math.floor((l - 1) / 33)); // 5 → 8
		const colors = l <= 20 ? 2 : 3; // 2 colours to warm up, then 3
		const diff: DiffLevel = { label: `Niveau ${l}`, size, colors };
		const cells = size * size;
		// ~1.6 s/cell for 3★, ~3 s/cell for 2★.
		return {
			seed: levelSeed(l),
			diff,
			threeStarCentis: cells * 160,
			twoStarCentis: cells * 300,
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

// 101-200: 9×9 grids, one size past the Expert pill, on a tighter clock per cell.
export const colorgrammeLevels = extendPlan('colorgramme', basePlan, {
	configExt: (base, level) => {
		const t = (level - LEVEL_COUNT) / LEVEL_COUNT; // 0 → 1 across the extended half
		const size = 9;
		const cells = size * size;
		return {
			...base,
			diff: { label: `Niveau ${level}`, size, colors: 3 },
			threeStarCentis: Math.round(cells * (150 - 25 * t)),
			twoStarCentis: Math.round(cells * (280 - 45 * t)),
		};
	},
});
