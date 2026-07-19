// Reines levels plan (1-100). The engine's only difficulty knob is board size,
// and it only produces reliably unique boards up to 8x8 (frontier-fill region
// growth almost never yields a unique solution at n>=9). So the ramp goes 6 -> 8:
// levels 1-40 are 6x6, 41-75 are 7x7, 76-100 are 8x8. A level = solve the board;
// stars come from solve time, scaled to n^2 (bigger board = more cells to reason on).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export interface ReinesLevelCfg {
	seed: number;
	size: DiffLevel; // what generateReines needs ({ label, size })
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b9) >>> 0;

// Board size for a level. Capped at 8 — the generator can't guarantee a unique
// solution beyond that (see engine growRegions / countSolutions).
const sizeFor = (l: number): number => (l <= 40 ? 6 : l <= 75 ? 7 : 8);

export const reinesLevels: LevelPlan<ReinesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): ReinesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const n = sizeFor(l);
		// ~0.9 s/cell for 3 stars, ~1.7 s/cell for 2 stars.
		return {
			seed: levelSeed(l),
			size: { label: `Niveau ${l}`, size: n },
			threeStarCentis: n * n * 90,
			twoStarCentis: n * n * 170,
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
