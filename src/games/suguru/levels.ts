// Suguru levels plan (1-100). Difficulty ramps grid size (5×5 → 7×7) and the
// given-cell density (fewer clues = harder). Bounds stay within what the generator
// can build fast: sparser/bigger boards make countSolutions exponential, so the
// size caps at 7 and density never drops below the free-mode "difficile" (~47%).
// A level = solve the grid; stars from solve time, scaled to the grid's cell count.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface SuguruLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

const basePlan: LevelPlan<SuguruLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): SuguruLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		// 6×6/7×7 generation can take several seconds for pathological seeds (even with
		// the engine node caps), which would stall the level start. 5×5 is always instant,
		// so the ramp comes purely from density (generous early → sparse late).
		const size = 5;
		const cells = size * size;
		const density = 0.6 - 0.2 * ((l - 1) / (LEVEL_COUNT - 1)); // ~60% → ~40%
		const givens = Math.max(size + 1, Math.round(cells * density));
		const diff: DiffLevel = { label: `Niveau ${l}`, size, givens };
		// Time targets scale with the number of empty cells to fill.
		// ~2 s/empty for 3★, ~3.6 s/empty for 2★.
		const empties = Math.max(1, cells - givens);
		return {
			seed: levelSeed(l),
			diff,
			threeStarCentis: empties * 200,
			twoStarCentis: empties * 360,
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

// 101-200: still 5×5 (bigger grids can stall the generator), but fewer clues than any
// base level and ~12% less time per empty cell.
export const suguruLevels = extendPlan('suguru', basePlan, {
	configExt: (base, level) => {
		const givens = Math.max(6, base.diff.givens - 2);
		const empties = 25 - givens;
		return {
			...base,
			diff: { label: `Niveau ${level}`, size: 5, givens },
			threeStarCentis: empties * 175,
			twoStarCentis: empties * 320,
		};
	},
});
