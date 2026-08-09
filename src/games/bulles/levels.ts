// Bulles levels plan (1-100). A level = one seeded raft, proved clearable by the engine's
// solver, which is also where its par comes from. Cleared (1★) when the board is emptied;
// 2★/3★ come from the shot count against that par, handed back through LevelResult.stat —
// the plan can't work the par out on its own without dealing the board, which is far too
// costly to do once per level just to draw a hint.
// metric 'time' with score = shots (lower is better).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { DiffLevel } from './engine';

/** Shots over par each star still allows. */
export const THREE_STAR_OVER = 1;
export const TWO_STAR_OVER = 5;

export interface BullesLevelCfg {
	seed: number;
	diff: DiffLevel;
}

/** Deterministic per-level seed so a given level is always the same raft. */
const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b9) >>> 0;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const basePlan: LevelPlan<BullesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time', // score = shots; fewer is better
	config(level: number): BullesLevelCfg {
		const l = clamp(level, 1, LEVEL_COUNT);
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1 across the ramp

		// A wider, deeper raft of more colours, broken into more patches and speckled with
		// more strays as we climb — every one of those makes a shot clear less.
		const diff: DiffLevel = {
			label: `Niveau ${l}`,
			cols: Math.round(lerp(6, 10, t)),
			filled: Math.round(lerp(3, 8, t)),
			colours: Math.round(lerp(3, 6, t)),
			blobs: Math.round(lerp(3, 10, t)),
			noise: lerp(0.1, 0.45, t),
			ragged: lerp(0.2, 0.4, t),
			wantPar: Math.round(lerp(3, 21, t)),
		};
		return { seed: levelSeed(l), diff };
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0; // the raft has to come down whole
		const par = r.stat ?? 0;
		if (r.score <= par + THREE_STAR_OVER) return 3;
		if (r.score <= par + TWO_STAR_OVER) return 2;
		return 1;
	},
	starHint() {
		return { two: `≤ par + ${TWO_STAR_OVER} tirs`, three: `≤ par + ${THREE_STAR_OVER} tir` };
	},
};

// 101-200: a wider raft of one more colour than the Expert pill, broken into more patches.
// Not a deeper one — rows are what a shot has to dig through, and past eight the board stops
// being a puzzle and turns into a grind. Par is the board's own, so the star targets follow.
export const bullesLevels = extendPlan('bulles', basePlan, {
	configExt: (base, level) => {
		const d = base.diff;
		return {
			...base,
			diff: {
				label: `Niveau ${level}`,
				cols: Math.min(11, d.cols + 1),
				filled: d.filled,
				colours: Math.min(7, d.colours + 1),
				blobs: Math.min(12, d.blobs + 2),
				noise: Math.min(0.5, d.noise + 0.04),
				ragged: d.ragged,
				wantPar: d.wantPar + 3,
			},
		};
	},
});
