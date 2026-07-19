// Pavage levels plan (1-100). Difficulty ramps board size and the number of
// blocked cells, feeding the generator's real params (DiffLevel). A level =
// cover the whole grid with the pieces; stars from solve time (scaled to size).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export interface PavageLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

export const pavageLevels: LevelPlan<PavageLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): PavageLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1
		const size = Math.min(7, 5 + Math.floor(t * 3)); // 5 → 7
		const blocked = Math.max(3, Math.round(3 + t * 4)); // 3 → 7
		const diff: DiffLevel = { label: `Niveau ${l}`, size, blocked };
		// ~4 s/cell of playable area for 3★, ~7 s/cell for 2★.
		const cells = size * size - blocked;
		return {
			seed: levelSeed(l),
			diff,
			threeStarCentis: cells * 400,
			twoStarCentis: cells * 700,
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
