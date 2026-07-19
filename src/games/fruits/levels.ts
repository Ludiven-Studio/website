// Calcul de fruits levels plan (1-100). A level = ONE seeded fruit-algebra
// question at a difficulty tier. Difficulty ramps the engine params: the tier
// climbs facile → moyen (a × link) → difficile (a real system), and the value
// ceiling grows so the arithmetic gets heavier. Cleared = answered correctly;
// a wrong answer fails the level (no partial). Stars come from solve time,
// scaled by tier (harder puzzles fairly get more time).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

export interface FruitsLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// Tier per level: first third facile (additions), next third moyen (one × link),
// last third difficile (simultaneous system). `max` climbs inside the run.
const tierOf = (l: number): { mul: boolean; system: boolean; label: string } => {
	if (l <= 33) return { mul: false, system: false, label: 'Facile' };
	if (l <= 66) return { mul: true, system: false, label: 'Moyen' };
	return { mul: false, system: true, label: 'Difficile' };
};

export const fruitsLevels: LevelPlan<FruitsLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): FruitsLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = tierOf(l);
		const max = Math.min(15, 8 + Math.floor((l - 1) / 14)); // 8 → 15 value ceiling
		const diff: DiffLevel = { label: `Niveau ${l}`, n: 3, max, mul: t.mul, system: t.system };
		// Base time budget per tier, +bigger numbers cost a little more.
		const tierBase = t.system ? 42 : t.mul ? 30 : 20; // seconds for 3★
		const bump = Math.floor((l - 1) / 14) * 2; // slower target as numbers grow
		const threeSec = tierBase + bump;
		return {
			seed: levelSeed(l),
			diff,
			threeStarCentis: threeSec * 100,
			twoStarCentis: Math.round(threeSec * 1.9) * 100,
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
		const s = (c: number) => `${Math.round(c / 100)} s`;
		return { two: `≤ ${s(cfg.twoStarCentis)}`, three: `≤ ${s(cfg.threeStarCentis)}` };
	},
};
