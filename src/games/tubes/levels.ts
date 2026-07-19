// Tubes (water sort) levels plan (1-100). Difficulty ramps the colour count
// (4→9) and tube height (4→6). A level = solve the puzzle; stars come from the
// solve time against per-level targets.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export interface TubesLevelCfg {
	seed: number;
	diff: DiffLevel; // fed straight to generateWaterSort
	twoStarCentis: number; // solve under this → 2★
	threeStarCentis: number; // solve under this → 3★
}

const levelSeed = (level: number): number => (Math.imul(level, 40503) ^ 0x6d2b79f5) >>> 0;

/** Smooth colour/height ramp: harder puzzles need more colours, then taller tubes. */
function difficultyFor(level: number): { colors: number; height: number } {
	if (level <= 20) return { colors: 4, height: 4 };
	if (level <= 40) return { colors: 5, height: 4 };
	if (level <= 60) return { colors: 6, height: 4 };
	if (level <= 80) return { colors: level <= 70 ? 7 : 8, height: level <= 70 ? 4 : 5 };
	return { colors: 9, height: level <= 90 ? 5 : 6 };
}

/** Star time budget grows with difficulty (more colours/height = more pours). */
function timeTargets(colors: number, height: number): { two: number; three: number } {
	// Rough pour count ≈ colors × height; ~2.4 s/pour for 3★, ~4 s/pour for 2★ (centiseconds).
	const pours = colors * height;
	return { three: Math.round(pours * 240), two: Math.round(pours * 400) };
}

export const tubesLevels: LevelPlan<TubesLevelCfg> = {
	count: LEVEL_COUNT,
	config(level: number): TubesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const { colors, height } = difficultyFor(l);
		const t = timeTargets(colors, height);
		return {
			seed: levelSeed(l),
			diff: { label: `Niveau ${l}`, colors, empties: 2, height },
			twoStarCentis: t.two,
			threeStarCentis: t.three,
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
		const fmt = (c: number) => `${Math.round(c / 100)} s`;
		return { two: `≤ ${fmt(cfg.twoStarCentis)}`, three: `≤ ${fmt(cfg.threeStarCentis)}` };
	},
};
