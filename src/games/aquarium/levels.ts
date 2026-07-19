// Aquarium levels plan (1-100). Difficulty ramps the grid size and region sizes
// through generateAquarium's real params. A level = mark every cell to match the
// hidden solution; stars from solve time (scaled to the grid size).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export interface AquariumLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

export const aquariumLevels: LevelPlan<AquariumLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): AquariumLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		// 8×8 is the proven ceiling (difficile); 9×9 makes uniqueness-checking
		// exponential and can hang on a baked-in level seed.
		const size = Math.min(8, 6 + Math.floor((l - 1) / 40)); // 6 → 8
		// Regions grow from small (3-5) to large (4-7) with the ramp.
		const minRegion = Math.min(4, 3 + Math.floor((l - 1) / 50)); // 3 → 4
		const maxRegion = Math.min(7, 5 + Math.floor((l - 1) / 40)); // 5 → 7
		const diff: DiffLevel = { label: `Niveau ${l}`, size, minRegion, maxRegion };
		// ~2.2 s/cell for 3★, ~4 s/cell for 2★ (scaled to the grid area).
		const cells = size * size;
		return {
			seed: levelSeed(l),
			diff,
			threeStarCentis: cells * 220,
			twoStarCentis: cells * 400,
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
