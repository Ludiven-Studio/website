// Tectonique levels plan (1-100). The grid grows 6×6 → 8×8, the crystals and the blockers
// pile up with it. Scoring counts coups, and a coup is a belt, not a cell: driving the same
// line on and on, either way, stays one coup. The stars compare that count to PAR, a
// near-optimal solve measured offline — rerun `npx tsx scripts/tectonique-par.ts` after
// touching the generator or the ramp below, and paste the tables it prints.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { GenParams } from './engine';

export interface TectoniqueLevelCfg extends GenParams {
	seed: number;
	par: number; // coups of a near-optimal solve
}

/** Stable per-level seed. `salt` picks between the grids the ramp could have dealt this level,
    so one of them can be re-rolled for difficulty without disturbing the others. */
export const levelSeed = (level: number, salt = 0): number =>
	(Math.imul(level * 16 + salt, 22695477) ^ 0x1b56c4e9) >>> 0;

const clampLevel = (level: number): number => Math.max(1, Math.min(LEVEL_COUNT, level));

/** Which candidate grid each level kept, printed by scripts/tectonique-par.ts alongside PAR. */
const SALT: number[] = [
	0, 2, 2, 8, 5, 3, 1, 9, 7, 4, 4, 4, 5, 4, 3, 3, 5, 1, 5, 9,
	9, 6, 1, 3, 1, 0, 3, 0, 7, 0, 0, 1, 0, 5, 2, 6, 0, 1, 0, 1,
	7, 1, 1, 0, 3, 5, 1, 6, 4, 8, 8, 1, 9, 7, 5, 2, 3, 2, 0, 8,
	8, 2, 0, 0, 8, 0, 9, 0, 7, 2, 5, 2, 6, 8, 4, 5, 3, 9, 9, 0,
	7, 1, 2, 0, 0, 7, 8, 1, 2, 4, 5, 1, 8, 6, 1, 2, 0, 4, 5, 0,
];

/** Near-optimal coups per level, printed by scripts/tectonique-par.ts. */
const PAR: number[] = [
	7, 6, 7, 7, 7, 7, 7, 8, 9, 9, 9, 9, 10, 10, 10, 9, 10, 13, 11, 12,
	12, 12, 12, 11, 13, 13, 12, 14, 14, 14, 14, 15, 16, 16, 16, 14, 16, 17, 18, 18,
	16, 17, 18, 18, 19, 19, 18, 19, 19, 20, 21, 22, 18, 19, 20, 19, 22, 22, 23, 24,
	23, 22, 23, 21, 26, 24, 24, 24, 22, 25, 26, 25, 24, 27, 26, 26, 28, 28, 28, 29,
	27, 32, 27, 29, 28, 29, 30, 33, 32, 30, 24, 29, 32, 33, 32, 32, 33, 33, 34, 33,
];

// Coups are coarse — a whole belt each — so a slip costs a bigger share of the par than a stray
// cell used to. The slack widens to match, otherwise three stars would mean playing it perfectly.
const targets = (par: number): { three: number; two: number } => ({
	three: Math.round(par * 1.3),
	two: Math.round(par * 2),
});

export const tectoniqueLevels: LevelPlan<TectoniqueLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): TectoniqueLevelCfg {
		const l = clampLevel(level);
		const n = l >= 55 ? 8 : l >= 25 ? 7 : 6;
		const crystals = Math.min(n === 6 ? 6 : n === 7 ? 8 : 10, 4 + Math.floor((l - 1) / 10));
		// A post freezes its whole line, so they stay rare; the rocks and the pillars carry the
		// difficulty — a pillar is what stops every push from ending against the outer wall.
		const locks = l >= 40 ? 2 : l >= 14 ? 1 : 0;
		return {
			n,
			crystals,
			rowLocks: locks,
			colLocks: locks,
			allLocks: l >= 55 ? 1 : 0,
			rocks: Math.min(n - 2, 2 + Math.floor((l - 1) / 12)),
			pillars: l < 8 ? 0 : Math.min(3, 1 + Math.floor((l - 8) / 30)),
			holes: n - 2,
			seed: levelSeed(l, SALT[l - 1] ?? 0),
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
	{ n: 6, crystals: 5, rowLocks: 0, colLocks: 0, allLocks: 0, rocks: 2, pillars: 1, holes: 4 },
	{ n: 7, crystals: 7, rowLocks: 1, colLocks: 1, allLocks: 0, rocks: 4, pillars: 2, holes: 5 },
	{ n: 8, crystals: 10, rowLocks: 1, colLocks: 1, allLocks: 1, rocks: 5, pillars: 3, holes: 6 },
];
