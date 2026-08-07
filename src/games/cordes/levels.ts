// Cordes levels plan (1-100). Three ropes on a small frame, up to six on a wide one. Two
// things get harder: the number of routes sharing the space, and how many of them refuse
// to be drawn straight — a board where joining the dots works is not a puzzle.
// A level = tie every rope; stars come from solve time.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface CordesLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 1103515245) ^ 0x2f6e1b3d) >>> 0;

// Reading the board is a fixed cost; every extra rope is another hand-drawn curve.
const targets = (ropes: number, base: number, perRope: number): number => base + ropes * perRope;

const basePlan: LevelPlan<CordesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): CordesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const ropes = Math.min(6, 3 + Math.floor((l - 1) / 25)); // 3 → 6
		const side = Math.min(7, 5 + Math.floor((l - 1) / 34)); // 5 → 7
		const tangle = Math.min(4, 2 + Math.floor((l - 1) / 40)); // 2 → 4
		return {
			seed: levelSeed(l),
			diff: { label: `Niveau ${l}`, ropes, cols: side, rows: side, tangle },
			threeStarCentis: targets(ropes, 400, 500),
			twoStarCentis: targets(ropes, 1000, 1100),
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

// 101-200: seven then eight ropes on the widest frame. Past six the free space stops being
// obvious — most routes have exactly one way round — so the clock stays generous per rope.
export const cordesLevels = extendPlan('cordes', basePlan, {
	configExt: (base, level) => {
		const ropes = level > 150 ? 8 : 7;
		return {
			...base,
			diff: { label: `Niveau ${level}`, ropes, cols: 8, rows: 8, tangle: level > 150 ? 5 : 4 },
			threeStarCentis: targets(ropes, 600, 560),
			twoStarCentis: targets(ropes, 1400, 1200),
		};
	},
});
