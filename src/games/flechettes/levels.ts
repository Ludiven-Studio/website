// Flechettes levels plan (1-100). A level = a fixed set of N throws at a given
// difficulty; you cash in the dartboard value of each dart (singles, doubles ×2,
// triples ×3, bull 25, bullseye 50). CLEARED (1★) when the total reaches
// config.target after the N throws; 2★/3★ at higher totals. Difficulty ramps the
// target and the aim-sweep speed (omega 2.2 → 4.3), so timing the two sweeps gets
// harder as you climb. Metric is 'score' (higher is better).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export const THROWS_PER_LEVEL = 5;

export interface FlechettesLevelCfg {
	seed: number;
	throws: number; // darts in the run
	diff: DiffLevel; // aim-sweep speed for the run
	target: number; // total points needed to clear (1★)
	twoStar: number; // total for 2★
	threeStar: number; // total for 3★
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

export const flechettesLevels: LevelPlan<FlechettesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score',
	config(level: number): FlechettesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1 ramp
		// Sweeps speed up from 2.2 (facile) to 4.3 (difficile) — harder to time.
		const omega = 2.2 + 2.1 * t;
		// Points needed ramps with difficulty. Max per dart = 60 (triple 20), so a
		// N-dart run tops out at 60·N; keep the target reachable but rising.
		const perDart = 14 + 22 * t; // ~14 (single-ish) → ~36 (double/triple hits)
		const target = Math.round(THROWS_PER_LEVEL * perDart);
		return {
			seed: levelSeed(l),
			throws: THROWS_PER_LEVEL,
			diff: { label: `Niveau ${l}`, omega },
			target,
			twoStar: Math.round(target * 1.25),
			threeStar: Math.round(target * 1.55),
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.score >= cfg.threeStar) return 3;
		if (r.score >= cfg.twoStar) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `${cfg.twoStar} pts`, three: `${cfg.threeStar} pts` };
	},
};
