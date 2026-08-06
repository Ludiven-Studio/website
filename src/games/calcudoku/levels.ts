// Calcudoku levels plan (1-100). Difficulty ramps grid size then cage size:
// 4×4 (1-30), 5×5 (31-65), 6×6 (66-100), with maxCage growing within each band.
// A level = solve the grid; stars from solve time (scaled to the grid size).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface CalcudokuLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

const basePlan: LevelPlan<CalcudokuLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): CalcudokuLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		// Grid size band, then cage complexity rising within the band.
		let size: number;
		let maxCage: number;
		if (l <= 30) {
			size = 4;
			maxCage = l <= 15 ? 2 : 3; // 4×4 : pairs first, then triominoes
		} else if (l <= 65) {
			size = 5;
			maxCage = l <= 48 ? 3 : 4; // 5×5 : up to 4-cell cages late
		} else {
			size = 6;
			maxCage = l <= 82 ? 3 : 4; // 6×6 : biggest cages at the very end
		}
		const diff: DiffLevel = { label: `Niveau ${l}`, size, maxCage };
		// Time targets scale with the grid: ~n²·k seconds. Bigger boards get more slack.
		const cells = size * size;
		const threeStarCentis = cells * (size === 4 ? 300 : size === 5 ? 400 : 550);
		const twoStarCentis = cells * (size === 4 ? 600 : size === 5 ? 800 : 1100);
		return { seed: levelSeed(l), diff, threeStarCentis, twoStarCentis };
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

const EXPERT_SIZE = 7;

// 101-200: 7×7 only (past the Expert pill), cages one cell bigger than the base ramp,
// and a tighter clock per cell.
export const calcudokuLevels = extendPlan('calcudoku', basePlan, {
	configExt: (base, level) => {
		const cells = EXPERT_SIZE * EXPERT_SIZE;
		return {
			...base,
			diff: { label: `Niveau ${level}`, size: EXPERT_SIZE, maxCage: Math.min(5, base.diff.maxCage + 1) },
			threeStarCentis: cells * 520,
			twoStarCentis: cells * 1000,
		};
	},
});
