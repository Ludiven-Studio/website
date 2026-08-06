// Sudoku levels plan (1-100). Difficulty ramps grid size (4×4 → 6×6 → 9×9) and
// the share of removed cells within each size band. A level = solve the grid;
// stars from solve time, scaled to the grid's cell count and difficulty.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import { SIZES, type Variant, type DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface SudokuLevelCfg {
	seed: number;
	variant: Variant;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// Size bands and their removed-cell fraction ramp (start → end across the band).
const BANDS: { max: number; min: number; variant: Variant; from: number; to: number }[] = [
	{ min: 1, max: 15, variant: SIZES['4'], from: 0.38, to: 0.5 },
	{ min: 16, max: 40, variant: SIZES['6'], from: 0.4, to: 0.55 },
	{ min: 41, max: 100, variant: SIZES['9'], from: 0.42, to: 0.62 },
];

const basePlan: LevelPlan<SudokuLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): SudokuLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const band = BANDS.find((b) => l <= b.max) ?? BANDS[BANDS.length - 1];
		const span = band.max - band.min;
		const t = span > 0 ? (l - band.min) / span : 0; // 0..1 within the band
		const removeFrac = band.from + (band.to - band.from) * t;
		const variant = band.variant;
		const diff: DiffLevel = { label: `Niveau ${l}`, removeFrac };
		// Time targets scale with empty-cell count and difficulty. ~1.6 s/empty for
		// 3★, ~3 s/empty for 2★ (a fuller/harder grid gives more time).
		const empties = Math.max(1, Math.round(variant.size * variant.size * removeFrac));
		return {
			seed: levelSeed(l),
			variant,
			diff,
			threeStarCentis: empties * 160,
			twoStarCentis: empties * 300,
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

// 101-200: 9×9 only, emptier than the Expert pill, and on a tighter clock per empty cell.
export const sudokuLevels = extendPlan('sudoku', basePlan, {
	configExt: (base, level) => {
		const removeFrac = Math.min(0.72, base.diff.removeFrac + 0.1);
		const empties = Math.round(SIZES['9'].size ** 2 * removeFrac);
		return {
			...base,
			variant: SIZES['9'],
			diff: { label: `Niveau ${level}`, removeFrac },
			threeStarCentis: empties * 150,
			twoStarCentis: empties * 280,
		};
	},
});
