// Tapis levels plan (1-100). Two piece kinds only — crates that slide and stack, pillars
// bolted to the frame — so a push stays easy to read. The grid grows 6×6 → 7×7 and the
// crystals pile up with it. Scoring counts coups, and a coup is a belt, not a cell: driving
// the same line on and on, either way, stays one coup. The stars compare that count to PAR,
// a near-optimal solve measured offline — rerun `npx tsx scripts/tectonique-par.ts` after
// touching the generator or the ramp below, and paste the tables it prints.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
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
	5, 6, 7, 1, 2, 4, 0, 4, 2, 4, 4, 1, 4, 2, 5, 1, 1, 1, 5, 2,
	3, 8, 3, 2, 1, 3, 2, 1, 6, 6, 5, 2, 7, 0, 3, 8, 6, 4, 4, 5,
	0, 8, 9, 0, 0, 1, 3, 3, 8, 1, 0, 6, 3, 5, 5, 2, 2, 3, 2, 7,
	5, 3, 1, 3, 9, 0, 1, 8, 9, 4, 0, 4, 8, 2, 0, 4, 1, 1, 1, 2,
	2, 6, 1, 5, 5, 8, 5, 1, 7, 0, 3, 2, 9, 3, 9, 0, 2, 3, 1, 2,
];

/** Near-optimal coups per level, printed by scripts/tectonique-par.ts. */
const PAR: number[] = [
	5, 5, 6, 6, 6, 6, 7, 7, 7, 6, 9, 9, 8, 7, 9, 9, 8, 9, 10, 10,
	10, 10, 12, 11, 11, 11, 11, 13, 11, 12, 13, 11, 13, 13, 13, 14, 14, 14, 16, 16,
	14, 14, 16, 17, 16, 14, 15, 17, 15, 19, 19, 18, 19, 18, 21, 18, 19, 18, 17, 20,
	21, 20, 18, 20, 19, 21, 22, 22, 21, 17, 25, 25, 25, 23, 25, 20, 24, 24, 24, 23,
	25, 25, 23, 24, 26, 24, 23, 26, 28, 21, 28, 28, 21, 25, 22, 29, 28, 29, 23, 26,
];

// Coups are coarse — a whole belt each — so a slip costs a bigger share of the par than a stray
// cell used to. The slack widens to match, otherwise three stars would mean playing it perfectly.
const targets = (par: number): { three: number; two: number } => ({
	three: Math.round(par * 1.3),
	two: Math.round(par * 2),
});

const basePlan: LevelPlan<TectoniqueLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): TectoniqueLevelCfg {
		const l = clampLevel(level);
		const n = l >= 45 ? 7 : 6;
		const crystals = Math.min(n === 6 ? 7 : 9, 4 + Math.floor((l - 1) / 9));
		// Crates and pillars only: the crystals carry the ramp, the pillars give a push
		// somewhere to stop other than the outer wall.
		return {
			n,
			crystals,
			rowLocks: 0,
			colLocks: 0,
			allLocks: 0,
			rocks: 0,
			pillars: l < 6 ? 0 : Math.min(3, 1 + Math.floor((l - 6) / 32)),
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

// 101-200: an 8×8 floor, two more crystals and one more pillar. PAR is not measured
// for these, so it is scaled off the base one — the crystals carry most of the coup count.
export const tectoniqueLevels = extendPlan('tectonique', basePlan, {
	configExt: (base) => {
		const n = 8;
		const crystals = Math.min(11, base.crystals + 2);
		return {
			...base,
			n,
			crystals,
			pillars: base.pillars + 1,
			holes: n - 2,
			par: Math.round((base.par * crystals * 1.1) / base.crystals),
		};
	},
});

/** Free play and the daily share three bands; the daily picks with the server's difficulty index.
    The fourth is the Expert pill, which the daily never deals. */
export const TECTONIQUE_BANDS: GenParams[] = [
	{ n: 6, crystals: 4, rowLocks: 0, colLocks: 0, allLocks: 0, rocks: 0, pillars: 1, holes: 4 },
	{ n: 6, crystals: 6, rowLocks: 0, colLocks: 0, allLocks: 0, rocks: 0, pillars: 2, holes: 4 },
	{ n: 7, crystals: 8, rowLocks: 0, colLocks: 0, allLocks: 0, rocks: 0, pillars: 2, holes: 5 },
	{ n: 8, crystals: 10, rowLocks: 0, colLocks: 0, allLocks: 0, rocks: 0, pillars: 3, holes: 6 },
];
