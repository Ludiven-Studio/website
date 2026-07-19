// Chemin (Zip) levels plan (1-100). Difficulty ramps the grid size up (5 → 7) and
// the checkpoint count down (4 → 3): a bigger grid with fewer numbered anchors is
// harder to deduce. A level = draw the unique Hamiltonian path; stars from solve
// time (scaled to the cell count).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export interface CheminLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

export const cheminLevels: LevelPlan<CheminLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): CheminLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		// Grid grows 5 → 7 across the run; checkpoints thin out 4 → 3 (fewer anchors = harder).
		const size = Math.min(7, 5 + Math.floor((l - 1) / 34)); // 5 → 7
		const checkpoints = Math.max(3, 4 - Math.floor((l - 1) / 50)); // 4 → 3
		const cells = size * size;
		const diff: DiffLevel = { label: `Niveau ${l}`, size, checkpoints };
		// ~2.2 s/cell for 3★, ~4 s/cell for 2★.
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
