// Circuit levels plan (1-100). The grid grows 4 → 9 and the tree gets stringier
// (bias 0.25 → 0.85): long corridors of elbows read far worse than a bushy tree full
// of T-pieces. A level = light the whole network; stars come from solve time.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface CircuitLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x5c1f3a7b) >>> 0;

// A fixed slice of thinking time plus a per-cell budget: small grids are dominated by
// reading the board, big ones by the taps.
const targets = (cells: number, base: number, perCell: number): number => base + cells * perCell;

const basePlan: LevelPlan<CircuitLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): CircuitLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const size = Math.min(9, 4 + Math.floor((l - 1) / 17)); // 4 → 9
		const bias = 0.25 + 0.6 * ((l - 1) / (LEVEL_COUNT - 1)); // bushy → stringy
		const cells = size * size;
		return {
			seed: levelSeed(l),
			diff: { label: `Niveau ${l}`, size, wrap: false, bias },
			threeStarCentis: targets(cells, 600, 130),
			twoStarCentis: targets(cells, 1400, 260),
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

// 101-200: the grid loops on itself (the Expert pill). Losing the borders costs the
// player their whole opening — every edge tile stops being a free deduction — so the
// clock is *looser* per cell even though the boards are much harder.
export const circuitLevels = extendPlan('circuit', basePlan, {
	configExt: (base, level) => {
		const size = level > 150 ? 9 : 8;
		const cells = size * size;
		return {
			...base,
			diff: { label: `Niveau ${level}`, size, wrap: true, bias: 0.9 },
			threeStarCentis: targets(cells, 900, 190),
			twoStarCentis: targets(cells, 2000, 360),
		};
	},
});
