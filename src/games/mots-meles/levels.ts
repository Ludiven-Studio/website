// Mots-mêlés levels plan (1-100). Difficulty ramps grid size, word count, and the
// allowed directions (reading order → + diagonals + reversed → 8-way). A level =
// find ALL the theme's words; stars from total solve time (scaled to word count + size).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { DiffLevel } from './engine';

interface Dir { dr: number; dc: number; }
const FWD: Dir[] = [{ dr: 0, dc: 1 }, { dr: 1, dc: 0 }]; // →  ↓
const DIAG: Dir[] = [{ dr: 1, dc: 1 }, { dr: 1, dc: -1 }]; // ↘  ↙
const REV_HV: Dir[] = [{ dr: 0, dc: -1 }, { dr: -1, dc: 0 }]; // ←  ↑
const DIAG_UP: Dir[] = [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }]; // ↖  ↗

export interface MotsMelesLevelCfg {
	seed: number;
	diff: DiffLevel;
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

export const motsMelesLevels: LevelPlan<MotsMelesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): MotsMelesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const size = Math.min(13, 9 + Math.floor((l - 1) / 25)); // 9 → 13
		const count = Math.min(11, 7 + Math.floor((l - 1) / 25)); // 7 → 11 words
		// Directions ramp with the same thresholds as the free-mode difficulties.
		const dirs =
			l > 66 ? [...FWD, ...DIAG, ...REV_HV, ...DIAG_UP] // 8 directions
			: l > 33 ? [...FWD, ...DIAG, ...REV_HV] // + diagonals + reversed
			: FWD; // reading order only
		const diff: DiffLevel = { label: `Niveau ${l}`, size, count, dirs };
		// Time target scales with word count and grid area (bigger grid = harder to scan).
		const perWord = 200 + 12 * size; // centis/word, grows with grid size
		return {
			seed: levelSeed(l),
			diff,
			threeStarCentis: count * perWord,
			twoStarCentis: count * perWord * 2,
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
