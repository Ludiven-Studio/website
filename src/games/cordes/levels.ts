// Cordes levels plan (1-100). Three ropes on a small frame, up to six on a wide one. Every
// rope has to refuse the straight line between its two pegs: one rope you can just join up
// is one rope the player never thinks about.
// A level = tie every rope; stars come from solve time.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import { frameFor, type DiffLevel } from './engine';
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
		const side = frameFor(ropes);
		return {
			seed: levelSeed(l),
			diff: { label: `Niveau ${l}`, ropes, cols: side, rows: side, tangle: ropes },
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
		const side = frameFor(ropes);
		return {
			...base,
			diff: { label: `Niveau ${level}`, ropes, cols: side, rows: side, tangle: ropes },
			threeStarCentis: targets(ropes, 600, 560),
			twoStarCentis: targets(ropes, 1400, 1200),
		};
	},
});
