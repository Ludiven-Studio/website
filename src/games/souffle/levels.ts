// Souffle levels plan (1-100). The score is the gust count, so the plan rides the
// 'time' metric (lower is better). Par is not tabulated: the generator records the
// walk the flowers were dropped on, so par is re-derived from the level seed on
// demand — the same deterministic deal the island plays.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import { mulberry32 } from '../prng';
import { generateSouffle, type GenParams } from './engine';

export interface SouffleLevelCfg extends GenParams {
	seed: number;
}

/** Stable per-level seed. */
export const levelSeed = (level: number): number =>
	(Math.imul(level * 16 + 3, 22695477) ^ 0x51f7ab2d) >>> 0;

const clampLevel = (level: number): number => Math.max(1, Math.min(LEVEL_COUNT, level));

/** The recorded walk of this very deal — the par the island shows. Cheap: ~60 short walks. */
const parOf = (cfg: SouffleLevelCfg): number => generateSouffle(mulberry32(cfg.seed), cfg).par;

// Par is the wind's own walk, and unlimited undo lets a patient player search for it:
// three stars mean matching the wind, two leave room for a couple of stray gusts.
const targets = (par: number): { three: number; two: number } => ({
	three: par,
	two: par + Math.max(2, Math.round(par * 0.35)),
});

const basePlan: LevelPlan<SouffleLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): SouffleLevelCfg {
		const l = clampLevel(level);
		const n = Math.min(10, 6 + Math.floor((l - 1) / 20));
		return {
			n,
			rocks: Math.round(n * n * 0.13),
			flowers: Math.min(10, 3 + Math.floor((l - 1) / 14)),
			gusts: 8 + Math.floor((l - 1) / 6),
			seed: levelSeed(l),
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const t = targets(parOf(this.config(level)));
		if (r.score <= t.three) return 3;
		if (r.score <= t.two) return 2;
		return 1;
	},
	starHint(level: number) {
		const t = targets(parOf(this.config(level)));
		return { two: `≤ ${t.two} souffles`, three: `≤ ${t.three} souffles` };
	},
};

// 101-200: one grid size up, denser rocks, two more flowers on a longer walk.
export const souffleLevels = extendPlan('souffle', basePlan, {
	configExt: (base) => {
		const n = Math.min(11, base.n + 1);
		return {
			...base,
			n,
			rocks: Math.round(n * n * 0.14),
			flowers: Math.min(12, base.flowers + 2),
			gusts: base.gusts + 6,
		};
	},
});
