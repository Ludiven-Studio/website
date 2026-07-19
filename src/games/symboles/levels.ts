// Symboles levels plan (1-100). A level is a fixed SET of N seeded QCM questions
// drawn from a difficulty tier that ramps with the level: the family pool widens
// (facile → moyen → difficile) and the questions get more varied. Metric is total
// solve time; stars gate on correctness (must nail all N) then reward speed.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import { DIFFS, generateQuestion, type DiffLevel, type Question } from './engine';
import { mulberry32 } from '../prng';

export const QUESTIONS_PER_LEVEL = 5;

export interface SymbolesLevelCfg {
	seed: number;
	tierLabel: string;
	questions: Question[];
	passCorrect: number; // min correct answers to clear the level
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

/** Difficulty tier for a level: pool widens as levels climb. */
function tierFor(level: number): { pool: DiffLevel; label: string } {
	if (level <= 25) return { pool: DIFFS.facile, label: DIFFS.facile.label };
	if (level <= 55) {
		// Mix easy + medium families so it ramps smoothly.
		return {
			pool: { label: 'Moyen', families: [...DIFFS.facile.families, ...DIFFS.moyen.families] },
			label: DIFFS.moyen.label,
		};
	}
	if (level <= 80) return { pool: DIFFS.moyen, label: DIFFS.moyen.label };
	// Top tier: all families, weighted toward the hard ones.
	return {
		pool: { label: 'Difficile', families: [...DIFFS.moyen.families, ...DIFFS.difficile.families, ...DIFFS.difficile.families] },
		label: DIFFS.difficile.label,
	};
}

export const symbolesLevels: LevelPlan<SymbolesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): SymbolesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const { pool, label } = tierFor(l);
		const seed = levelSeed(l);
		// Question i is fully reproducible from (seed, i).
		const questions = Array.from({ length: QUESTIONS_PER_LEVEL }, (_, i) =>
			generateQuestion(pool, mulberry32((seed + i * 0x9e3779b1) >>> 0)),
		);
		// Time budget grows with tier difficulty (harder rules take longer to read).
		const perQ = l <= 25 ? 600 : l <= 55 ? 800 : l <= 80 ? 1000 : 1200; // centis / question
		return {
			seed,
			tierLabel: label,
			questions,
			passCorrect: QUESTIONS_PER_LEVEL - 1, // allow one slip to clear (1★)
			threeStarCentis: perQ * QUESTIONS_PER_LEVEL,
			twoStarCentis: perQ * QUESTIONS_PER_LEVEL * 2,
		};
	},
	// Star rule combines correctness (gate) and speed. `stat` = number correct.
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		const cfg = this.config(level);
		const correct = r.stat ?? 0;
		if (!r.won || correct < cfg.passCorrect) return 0;
		if (correct >= QUESTIONS_PER_LEVEL && r.score <= cfg.threeStarCentis) return 3;
		if (correct >= QUESTIONS_PER_LEVEL) return 2;
		return 1; // cleared with one slip
	},
	starHint(level: number) {
		const cfg = this.config(level);
		const s = (c: number) => `${Math.round(c / 100)} s`;
		return {
			two: `${QUESTIONS_PER_LEVEL}/${QUESTIONS_PER_LEVEL}`,
			three: `${QUESTIONS_PER_LEVEL}/${QUESTIONS_PER_LEVEL} · ≤ ${s(cfg.threeStarCentis)}`,
		};
	},
};
