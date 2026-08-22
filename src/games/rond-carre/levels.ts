// Rond & Carré levels plan (1-100). The engine is a fixed 6×6 grid whose only
// difficulty knob is the given count: the generator strips to a minimal unique
// set, then reveals `extraGivens` more clues (more = easier). We ramp from very
// generous early (many extra givens) to none late (bare minimum), so the board
// stays the same but the deduction load grows. A level = fill the grid without
// conflicts; stars from solve time (scaled to how many cells you must place).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import { SIZE, type DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface RondCarreLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// Max extra clues we ever hand out early (matches the "Facile" preset's generosity).
const MAX_EXTRA = 10;

const basePlan: LevelPlan<RondCarreLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): RondCarreLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		// Given ramp: L1 hands out MAX_EXTRA extra clues, tapering to 0 by the last levels.
		const extraGivens = Math.max(0, Math.round(MAX_EXTRA * (1 - (l - 1) / (LEVEL_COUNT - 1))));
		const diff: DiffLevel = { label: `Niveau ${l}`, extraGivens };
		// The minimal set is a single given (the ●/■ flip symmetry needs one seed cell),
		// so the player fills everything else. Star targets scale with that load.
		const emptyCells = Math.max(6, SIZE * SIZE - 1 - extraGivens);
		// ~2.5 s/cell for 3★, ~4.5 s/cell for 2★.
		return {
			seed: levelSeed(l),
			diff,
			threeStarCentis: emptyCells * 250,
			twoStarCentis: emptyCells * 450,
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

// 101-200: no extra clue, the leanest board out of a growing draw, and boards that
// may require the harder "all fillings of a line agree" technique (tier 2).
export const rondCarreLevels = extendPlan('rond-carre', basePlan, {
	configExt: (base, level) => {
		const t = (level - LEVEL_COUNT - 1) / (LEVEL_COUNT - 1); // 0 → 1
		const emptyCells = SIZE * SIZE - 1;
		return {
			...base,
			diff: { label: `Niveau ${level}`, extraGivens: 0, candidates: 3 + Math.round(t * 3), tier: 2 }, // 3 → 6
			threeStarCentis: emptyCells * 210,
			twoStarCentis: emptyCells * 380,
		};
	},
});
