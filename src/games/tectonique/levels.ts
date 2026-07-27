// Tectonique levels plan (1-100). The grid grows 6×6 → 8×8, the crystals and the blockers
// pile up with it. Scoring is the move count: the stars compare it to PAR, a near-optimal
// solve measured offline — rerun `npx tsx scripts/tectonique-par.ts` after touching the
// generator or the ramp below, and paste the table it prints.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { GenParams } from './engine';

export interface TectoniqueLevelCfg extends GenParams {
	seed: number;
	par: number; // moves of a near-optimal solve
}

/** Stable per-level seed: one band can change without disturbing the others. */
export const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

const clampLevel = (level: number): number => Math.max(1, Math.min(LEVEL_COUNT, level));

/** Near-optimal moves per level, printed by scripts/tectonique-par.ts. */
const PAR: number[] = [
	20, 11, 17, 13, 13, 18, 14, 8, 13, 14, 10, 10, 12, 19, 11, 14, 19, 19, 21, 25,
	18, 16, 17, 13, 15, 21, 17, 20, 22, 18, 17, 15, 17, 24, 23, 29, 46, 22, 36, 29,
	22, 26, 23, 25, 23, 31, 20, 30, 38, 25, 24, 46, 35, 35, 38, 23, 29, 19, 35, 36,
	32, 31, 19, 47, 34, 27, 39, 47, 26, 54, 32, 49, 38, 41, 51, 41, 51, 29, 49, 46,
	62, 35, 39, 36, 36, 41, 48, 68, 75, 60, 35, 42, 31, 54, 36, 54, 68, 46, 51, 69,
];

const targets = (par: number): { three: number; two: number } => ({
	three: Math.round(par * 1.2),
	two: Math.round(par * 1.8),
});

export const tectoniqueLevels: LevelPlan<TectoniqueLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): TectoniqueLevelCfg {
		const l = clampLevel(level);
		const n = Math.min(8, 6 + Math.floor((l - 1) / 34));
		const crystals = Math.min(8, 3 + Math.floor((l - 1) / 16));
		// A post freezes its whole line, so they stay rare; the rocks carry the difficulty.
		const locks = Math.min(2, Math.floor((l - 1) / 40));
		return {
			n,
			crystals,
			rowLocks: locks,
			colLocks: locks,
			allLocks: l >= 70 ? 1 : 0,
			rocks: Math.min(5, 1 + Math.floor((l - 1) / 20)),
			holes: n - 2,
			seed: levelSeed(l),
			par: PAR[l - 1] ?? 8 * crystals,
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const t = targets(this.config(level).par);
		if (r.score <= t.three) return 3;
		if (r.score <= t.two) return 2;
		return 1;
	},
	starHint(level: number) {
		const t = targets(this.config(level).par);
		return { two: `≤ ${t.two} coups`, three: `≤ ${t.three} coups` };
	},
};

/** Free play and the daily share three bands; the daily picks with the server's difficulty index. */
export const TECTONIQUE_BANDS: GenParams[] = [
	{ n: 6, crystals: 4, rowLocks: 0, colLocks: 0, allLocks: 0, rocks: 2, holes: 4 },
	{ n: 7, crystals: 6, rowLocks: 1, colLocks: 1, allLocks: 0, rocks: 3, holes: 5 },
	{ n: 8, crystals: 8, rowLocks: 1, colLocks: 1, allLocks: 1, rocks: 4, holes: 6 },
];
