// Motifs levels plan (1-100). Difficulty ramps grid size and the share of
// shape/area hints removed (relaxFrac). A level = split the whole grid into the
// hidden partition; stars from solve time (scaled to the grid size).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface MotifsLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

const basePlan: LevelPlan<MotifsLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): MotifsLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1
		const size = Math.min(7, 5 + Math.floor((l - 1) / 34)); // 5 → 7
		const relaxFrac = 0.15 + 0.65 * t; // 0.15 → 0.8
		const diff: DiffLevel = { label: `Niveau ${l}`, size, relaxFrac };
		// ~4 s/cell for 3★, ~7 s/cell for 2★.
		const cells = size * size;
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
		return { two: `≤ ${fmtCentis(cfg.twoStarCentis)}`, three: `≤ ${fmtCentis(cfg.threeStarCentis)}` };
	},
};

// 101-200: one grid size bigger (up to 8×8, past the Expert pill) with more hints removed,
// on a tighter per-cell clock.
export const motifsLevels = extendPlan('motifs', basePlan, {
	configExt: (base, level) => {
		const size = Math.min(8, base.diff.size + 1);
		const cells = size * size;
		return {
			...base,
			diff: { label: `Niveau ${level}`, size, relaxFrac: Math.min(0.9, base.diff.relaxFrac + 0.1) },
			threeStarCentis: cells * 360,
			twoStarCentis: cells * 630,
		};
	},
});
