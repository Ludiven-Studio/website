// Demineur levels plan (1-100). Difficulty ramps board size, mine density, and the
// deduction techniques required (subset, then enumeration). A level = clear the board
// without hitting a mine; stars from solve time (scaled to the mine count).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { SizeLevel, DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface DemineurLevelCfg {
	seed: number;
	sizeLvl: SizeLevel;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

const basePlan: LevelPlan<DemineurLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): DemineurLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const size = Math.min(16, 8 + Math.floor((l - 1) / 12)); // 8 → 16
		const density = 0.12 + 0.08 * (l / LEVEL_COUNT); // 12% → 20% mines
		const mines = Math.max(6, Math.round(size * size * density));
		const sizeLvl: SizeLevel = { label: `Niveau ${l}`, size, mines };
		const diff: DiffLevel = { label: `Niveau ${l}`, useSubset: l > 25, useEnum: l > 60 };
		// ~3 s/mine for 3★, ~5.5 s/mine for 2★.
		return {
			seed: levelSeed(l),
			sizeLvl,
			diff,
			threeStarCentis: mines * 300,
			twoStarCentis: mines * 550,
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

// 101-200: full 16×16 boards, denser than the Expert pill, on a tighter clock per mine.
export const demineurLevels = extendPlan('demineur', basePlan, {
	configExt: (base, level) => {
		const t = (level - LEVEL_COUNT) / LEVEL_COUNT; // 0 → 1 across the extended half
		const size = 16;
		const mines = Math.round(size * size * (0.205 + 0.025 * t)); // 20.5% → 23%
		return {
			...base,
			sizeLvl: { label: `Niveau ${level}`, size, mines },
			diff: { label: `Niveau ${level}`, useSubset: true, useEnum: true },
			threeStarCentis: mines * 270,
			twoStarCentis: mines * 500,
		};
	},
});
