// Rond & Carré levels plan (1-100). The engine is a fixed 6×6 grid whose only
// difficulty knob is the given count: the generator strips to a minimal unique
// set, then reveals `extraGivens` more clues (more = easier). We ramp from very
// generous early (many extra givens) to none late (bare minimum), so the board
// stays the same but the deduction load grows. A level = fill the grid without
// conflicts; stars from solve time (scaled to how many cells you must place).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import { SIZE, type DiffLevel } from './engine';

export interface RondCarreLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// Max extra clues we ever hand out early (matches the "Facile" preset's generosity).
const MAX_EXTRA = 10;

export const rondCarreLevels: LevelPlan<RondCarreLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): RondCarreLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		// Given ramp: L1 hands out MAX_EXTRA extra clues, tapering to 0 by the last levels.
		const extraGivens = Math.max(0, Math.round(MAX_EXTRA * (1 - (l - 1) / (LEVEL_COUNT - 1))));
		const diff: DiffLevel = { label: `Niveau ${l}`, extraGivens };
		// Cells the player must fill ≈ total minus the minimal set (~14) minus extras.
		// Estimate empties so star targets scale with the actual deduction load.
		const emptyCells = Math.max(6, SIZE * SIZE - 14 - extraGivens);
		// ~4 s/cell for 3★, ~7 s/cell for 2★.
		return {
			seed: levelSeed(l),
			diff,
			threeStarCentis: emptyCells * 400,
			twoStarCentis: emptyCells * 700,
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
