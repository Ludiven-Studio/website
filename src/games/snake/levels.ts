// Snake levels plan (1-100). A level = eat a TARGET number of apples before dying.
// Difficulty ramps over four bands: the SNAKE_DIFFS tier (facile → moyen → difficile,
// then a custom "expert" tier) sets speed + rock count, and within each band the apple
// target rises. WON when the target is reached; LOST if the snake dies first.
// metric = 'score' (apples eaten, higher is better). Stars reward eating past the target.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import { SNAKE_DIFFS, type SnakeDiff } from './engine';

export interface SnakeLevelCfg {
	seed: number;
	diff: SnakeDiff; // speed + rocks for this level
	target: number; // apples to eat to win
	twoStarApples: number; // eat this many for 2★
	threeStarApples: number; // eat this many for 3★
	label: string;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// A tougher tier past "difficile": very fast + a dense rock field.
const EXPERT: SnakeDiff = { label: 'Expert', baseTick: 95, minTick: 52, accel: 5, rocks: 18 };

// Four bands: difficulty tier fixed per band, apple target ramps from `from` → `to`.
const BANDS: { min: number; max: number; diff: SnakeDiff; from: number; to: number }[] = [
	{ min: 1, max: 25, diff: SNAKE_DIFFS.facile, from: 4, to: 12 },
	{ min: 26, max: 50, diff: SNAKE_DIFFS.moyen, from: 10, to: 20 },
	{ min: 51, max: 75, diff: SNAKE_DIFFS.difficile, from: 16, to: 30 },
	{ min: 76, max: 100, diff: EXPERT, from: 24, to: 42 },
];

export const snakeLevels: LevelPlan<SnakeLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score', // score = apples eaten; more is better
	config(level: number): SnakeLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const band = BANDS.find((b) => l <= b.max) ?? BANDS[BANDS.length - 1];
		const span = band.max - band.min;
		const t = span > 0 ? (l - band.min) / span : 0; // 0..1 within the band
		const target = Math.round(band.from + (band.to - band.from) * t);
		return {
			seed: levelSeed(l),
			diff: band.diff,
			target,
			// Reaching the target = 1★. Eating +25% past it = 2★, +50% = 3★.
			twoStarApples: target + Math.max(2, Math.round(target * 0.25)),
			threeStarApples: target + Math.max(4, Math.round(target * 0.5)),
			label: `Niveau ${l}`,
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0; // target not reached (died first)
		const cfg = this.config(level);
		if (r.score >= cfg.threeStarApples) return 3;
		if (r.score >= cfg.twoStarApples) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `${cfg.twoStarApples} pommes`, three: `${cfg.threeStarApples} pommes` };
	},
};
