// Casse-Briques levels plan (1-100). A level = clear the whole brick field with a
// limited number of lives. Difficulty ramps over four bands: the BREAKOUT_DIFFS tier
// (facile → moyen → difficile, then a custom "expert") sets rows / 2-hit density / ball
// speed, and within each band the starting lives shrink from generous to tight.
// WON when the field is cleared; LOST if all lives are spent first.
// metric = 'score' (points; higher is better). Stars reward finishing with lives to spare.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import { BREAKOUT_DIFFS, type BreakoutDiff } from './engine';

export interface CasseBriquesLevelCfg {
	seed: number;
	diff: BreakoutDiff; // rows + hp density + ball speed for this level
	lives: number; // lives granted for this level
	twoStarLives: number; // finish with this many lives left for 2★
	threeStarLives: number; // finish with this many lives left for 3★
	label: string;
}

const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x51ed270b) >>> 0;

// A tougher tier past "difficile": a full 9-row wall, dense 2-hit bricks, fast ball.
const EXPERT: BreakoutDiff = { label: 'Expert', rows: 9, twoHpChance: 0.7, speed: 104, density: 0.95 };

// Four bands: difficulty tier fixed per band, starting lives ramp from `from` → `to`.
const BANDS: { min: number; max: number; diff: BreakoutDiff; from: number; to: number }[] = [
	{ min: 1, max: 25, diff: BREAKOUT_DIFFS.facile, from: 5, to: 3 },
	{ min: 26, max: 50, diff: BREAKOUT_DIFFS.moyen, from: 5, to: 3 },
	{ min: 51, max: 75, diff: BREAKOUT_DIFFS.difficile, from: 4, to: 3 },
	{ min: 76, max: 100, diff: EXPERT, from: 4, to: 2 },
];

export const casseBriquesLevels: LevelPlan<CasseBriquesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score', // score = points earned; more is better
	config(level: number): CasseBriquesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const band = BANDS.find((b) => l <= b.max) ?? BANDS[BANDS.length - 1];
		const span = band.max - band.min;
		const t = span > 0 ? (l - band.min) / span : 0; // 0..1 within the band
		const lives = Math.max(2, Math.round(band.from + (band.to - band.from) * t));
		return {
			seed: levelSeed(l),
			diff: band.diff,
			lives,
			// Clearing = 1★. Finishing with a life to spare = 2★, two lives = 3★.
			twoStarLives: 2,
			threeStarLives: 3,
			label: `Niveau ${l}`,
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0; // field not cleared (out of lives)
		const cfg = this.config(level);
		const livesLeft = (r.raw?.livesLeft as number) ?? 1;
		if (livesLeft >= cfg.threeStarLives) return 3;
		if (livesLeft >= cfg.twoStarLives) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `${cfg.twoStarLives} vies restantes`, three: `${cfg.threeStarLives} vies restantes` };
	},
};
