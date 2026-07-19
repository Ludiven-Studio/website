// Golf levels plan (1-100). A level = one seeded, solo mini-golf hole at a ramped
// difficulty. Cleared (1★) when the ball is holed; 2★/3★ come from the stroke count
// (a clean skill signal: matching or beating par). The engine's generateHole is fully
// procedural from a seed + a DiffLevel, so each level is a deterministic, unique hole.
// metric 'time' with score = strokes (lower is better).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export interface GolfLevelCfg {
	seed: number;
	diff: DiffLevel; // hole shape fed to generateHole
	par: number; // expected strokes (mirrors the engine's par formula)
	twoStarStrokes: number; // ≤ this → 2★
	threeStarStrokes: number; // ≤ this → 3★
}

/** Deterministic per-level seed so a given level is always the same hole. */
const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b9) >>> 0;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const golfLevels: LevelPlan<GolfLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time', // score = strokes; fewer is better
	config(level: number): GolfLevelCfg {
		const l = clamp(level, 1, LEVEL_COUNT);
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1 across the ramp

		// Ramp the hole: longer corridor, more bends, narrower lane, tighter cup,
		// more chicane obstacles and relief patches as we climb.
		const length = Math.round(lerp(110, 280, t)); // 110 → 280 units
		const bends = Math.round(lerp(6, 14, t)); // 6 → 14 control points
		const width = lerp(16, 10.5, t); // wider (easy) → narrow (hard)
		const cupR = lerp(1.4, 1.0, t); // 1.4 → 1.0 (barely > ball at the top)
		const obstacles = Math.round(lerp(0, 4, t)); // 0 → 4 chicanes
		const slopes = Math.round(lerp(1, 3, t)); // 1 → 3 relief patches
		const diff: DiffLevel = { label: `Niveau ${l}`, length, bends, width, cupR, obstacles, slopes };

		// Same par formula the engine uses (engine.ts generateHole).
		const par = clamp(Math.round(length / 42) + 1, 2, 6);

		// Stars from strokes: 3★ = par or better (clean), 2★ = one over.
		return { seed: levelSeed(l), diff, par, threeStarStrokes: par, twoStarStrokes: par + 1 };
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0; // must hole the ball to clear
		const cfg = this.config(level);
		if (r.score <= cfg.threeStarStrokes) return 3;
		if (r.score <= cfg.twoStarStrokes) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `≤ ${cfg.twoStarStrokes} coups`, three: `≤ ${cfg.threeStarStrokes} coups` };
	},
};
