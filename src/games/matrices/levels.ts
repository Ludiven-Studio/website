// Matrices levels plan (1-100). A level = a fixed SET of N seeded QCM questions
// at a difficulty tier. Cleared when all N are answered; stars from how many were
// right, with the 3★ tier also gated on total solve time. Difficulty ramps the
// number of varying features (2 → 4) and widens the template pool.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel, TemplateName } from './engine';

export const QUESTIONS_PER_LEVEL = 5;

export interface MatricesLevelCfg {
	seed: number;
	diff: DiffLevel;
	count: number; // questions in this level (== QUESTIONS_PER_LEVEL)
	perfectCentis: number; // total-time budget for the 3★ time gate
}

const ALL_TEMPLATES: TemplateName[] = ['simple', 'dots', 'wheel', 'quad'];

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// Feature count ramps 2 → 4 across the 100 levels (Facile → Difficile).
const varyFor = (l: number): number => Math.min(4, 2 + Math.floor((l - 1) / 34));
const tierLabel = (vary: number): string => (vary <= 2 ? 'Facile' : vary === 3 ? 'Moyen' : 'Difficile');

export const matricesLevels: LevelPlan<MatricesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score', // best-retained = most correct answers (higher is better)
	config(level: number): MatricesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const vary = varyFor(l);
		const diff: DiffLevel = { label: tierLabel(vary), vary, templates: ALL_TEMPLATES };
		// ~9 s/question at the top tier down to ~7 s for a snappy 3★ time gate.
		const perQuestion = 900 - Math.round(2 * (l - 1)); // centis, 900 → ~700
		return {
			seed: levelSeed(l),
			diff,
			count: QUESTIONS_PER_LEVEL,
			perfectCentis: perQuestion * QUESTIONS_PER_LEVEL,
		};
	},
	// score = correct count (0..N); stat = total time in centis.
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		const cfg = this.config(level);
		const n = cfg.count;
		if (!r.won || r.score < Math.ceil(n * 0.6)) return 0; // need ≥60% right to clear
		if (r.score < n) return 1; // cleared but not perfect
		// Perfect: 3★ if fast enough, else 2★.
		return (r.stat ?? Infinity) <= cfg.perfectCentis ? 3 : 2;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		const s = Math.round(cfg.perfectCentis / 100);
		return { two: `${cfg.count}/${cfg.count} bonnes`, three: `${cfg.count}/${cfg.count} en ≤ ${s} s` };
	},
};
