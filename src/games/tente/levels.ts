// Tente (Tents & Trees) levels plan (1-100). Difficulty ramps the board size
// (6 → 12) with the tent count scaling to the board area, matching the density of
// the free-mode DIFFS. A level = solve the grid; stars come from the solve time,
// scaled to the tent count. Tente can't be lost, so a finished run always wins.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface TenteLevelCfg extends DiffLevel {
	seed: number;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

const basePlan: LevelPlan<TenteLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): TenteLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const size = Math.min(12, 6 + Math.floor((l - 1) / 14)); // 6 → 12
		const tents = Math.max(4, Math.round(size * size * 0.17)); // ~17% of the board (as in DIFFS)
		// ~5 s/tent for 3★, ~9 s/tent for 2★ — larger grids give proportionally more time.
		return {
			label: `Niveau ${l}`,
			size,
			tents,
			seed: levelSeed(l),
			threeStarCentis: tents * 500,
			twoStarCentis: tents * 900,
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

// 101-200: always the 12×12 board, six more tents than the base level, on a 10% tighter clock.
export const tenteLevels = extendPlan('tente', basePlan, {
	configExt: (base, level) => {
		const tents = Math.min(30, base.tents + 6);
		return {
			...base,
			label: `Niveau ${level}`,
			size: 12,
			tents,
			threeStarCentis: tents * 450,
			twoStarCentis: tents * 800,
		};
	},
});
