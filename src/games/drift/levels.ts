// Drift levels plan (1-100). A level = complete one full lap of a seeded track
// (all checkpoints in order, then cross the start/finish line). Cleared (1★) on any
// valid lap; 2★/3★ come from the lap time. Difficulty ramps the track shape: more
// corners (controls 6→10), sharper turns (jitter/alt), and a narrower ribbon.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DriftDiff } from './engine';

export interface DriftLevelCfg {
	seed: number;
	diff: DriftDiff; // track shape fed to generateTrack
	twoStarCentis: number; // lap time (centiseconds) for 2★
	threeStarCentis: number; // lap time (centiseconds) for 3★
}

/** Deterministic per-level seed so a given level is always the same circuit. */
const levelSeed = (level: number): number => (Math.imul(level, 2246822519) ^ 0x165667b1) >>> 0;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const driftLevels: LevelPlan<DriftLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): DriftLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1 across the ramp

		// More corners as we climb: controls must stay EVEN (chicane alternation).
		const controls = 6 + 2 * Math.round(lerp(0, 2, t)); // 6, 8, 10
		const jitter = lerp(0.26, 0.46, t); // sharper radial variation
		const alt = lerp(0.18, 0.24, t); // stronger S-curves
		const width = lerp(15, 12, t); // narrower ribbon (harder line)
		const diff: DriftDiff = { label: `Niveau ${l}`, controls, jitter, width, alt };

		// A comfortable clean lap is ~24 s; the star bar tightens with the level so the
		// extra corners still leave a fair, reachable target. Times in centiseconds.
		const threeStarCentis = Math.round(lerp(2100, 3200, t)); // 21 s → 32 s
		const twoStarCentis = Math.round(lerp(2700, 4000, t)); // 27 s → 40 s
		return { seed: levelSeed(l), diff, threeStarCentis, twoStarCentis };
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
		const s = (c: number) => `${(c / 100).toFixed(1)} s`;
		return { two: `≤ ${s(cfg.twoStarCentis)}`, three: `≤ ${s(cfg.threeStarCentis)}` };
	},
};
