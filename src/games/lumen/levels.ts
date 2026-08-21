// Lumen levels plan (1-100). The grid grows 5 → 7, mirrors 2 → 5 and prisms arrive at
// level 20 (two from 70): colour mixing is the difficulty, not the board size.
// A level = every sensor on its exact colour; stars come from solve time.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { DiffLevel } from './engine';
import { fmtCentis } from '../../lib/scoreFormat';

export interface LumenLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 40507) ^ 0x2f6e2b1) >>> 0;

// A fixed slice of reading time plus a per-piece budget: each tray piece is one
// placement decision, so pieces dominate the clock, not cells.
const targets = (pieces: number, base: number, perPiece: number): number => base + pieces * perPiece;

const basePlan: LevelPlan<LumenLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): LumenLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const size = 5 + (l >= 35 ? 1 : 0) + (l >= 69 ? 1 : 0); // 5 → 7
		const mirrors = 2 + Math.min(3, Math.floor((l - 1) / 25)); // 2 → 5
		const prisms = l >= 70 ? 2 : l >= 20 ? 1 : 0;
		// Ray budget: sensors <= sources + 2*prisms, with slack so mixes can appear.
		const sensors = 2 + (l >= 45 ? 1 : 0) + (l >= 70 ? 1 : 0); // 2 → 4
		const pieces = mirrors + prisms;
		return {
			seed: levelSeed(l),
			diff: {
				label: `Niveau ${l}`,
				size,
				sources: l < 20 || l >= 45 ? 2 : 1,
				mirrors,
				prisms,
				sensors,
				walls: Math.min(3, Math.floor(l / 25)),
				decoys: 0,
			},
			threeStarCentis: targets(pieces, 1200, 900),
			twoStarCentis: targets(pieces, 2600, 1800),
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

// 101-200: 8×8, two sources, two prisms and fixed decoy mirrors that lie about the
// path. Decoys tax every deduction, so the clock is looser per piece.
export const lumenLevels = extendPlan('lumen', basePlan, {
	configExt: (base, level) => {
		const mirrors = level > 150 ? 5 : 4;
		const pieces = mirrors + 2;
		return {
			...base,
			diff: {
				label: `Niveau ${level}`,
				size: 8,
				sources: 2,
				mirrors,
				prisms: 2,
				sensors: 4,
				walls: 3,
				decoys: 2,
			},
			threeStarCentis: targets(pieces, 1800, 1200),
			twoStarCentis: targets(pieces, 3800, 2400),
		};
	},
});
