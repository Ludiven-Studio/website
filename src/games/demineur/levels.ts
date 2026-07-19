// Demineur levels plan (1-100). Difficulty ramps board size, mine density, and the
// deduction techniques required (subset, then enumeration). A level = clear the board
// without hitting a mine; stars from solve time (scaled to the mine count).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { SizeLevel, DiffLevel } from './engine';

export interface DemineurLevelCfg {
	seed: number;
	sizeLvl: SizeLevel;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

export const demineurLevels: LevelPlan<DemineurLevelCfg> = {
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
		const s = (c: number) => `${Math.round(c / 100)} s`;
		return { two: `≤ ${s(cfg.twoStarCentis)}`, three: `≤ ${s(cfg.threeStarCentis)}` };
	},
};
