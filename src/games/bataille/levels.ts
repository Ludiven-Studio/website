// Bataille navale levels plan (1-100). Difficulty ramps board size, fleet size,
// and the sonars available. A level = sink the whole fleet; score = shots + sonars
// (fewer is better), so metric 'time' (lower = better) is used, with score = cost.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { SizeLevel } from './engine';

export interface BatailleLevelCfg {
	seed: number;
	sizeLvl: SizeLevel;
	twoStarCost: number;
	threeStarCost: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 22695477) ^ 0x1b56c4e9) >>> 0;

// Fleet for a level: base ships plus extra ones as levels ramp. Kept sparse enough
// to always place (no-touch) on the given board.
function fleetFor(size: number, l: number): number[] {
	const fleet = [2, 2, 3];
	if (l > 15) fleet.push(3);
	if (l > 35) fleet.push(4);
	if (l > 60) fleet.push(4);
	if (l > 80) fleet.push(5);
	// A longest ship must fit the board.
	return fleet.filter((len) => len <= size).sort((a, b) => b - a);
}

export const batailleLevels: LevelPlan<BatailleLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time', // score = shots + sonars, lower is better → 'time' direction
	config(level: number): BatailleLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const size = Math.min(12, 8 + Math.floor((l - 1) / 25)); // 8 → 12
		const fleet = fleetFor(size, l);
		const shipCells = fleet.reduce((a, b) => a + b, 0);
		// Sonars ramp down as levels get harder (10 → 4).
		const sonars = Math.max(4, 10 - Math.floor((l - 1) / 14));
		const sizeLvl: SizeLevel = { label: `Niveau ${l}`, size, fleet, sonars };
		// Perfect play ≈ shipCells hits + a few probes. 3★ near-optimal, 2★ generous.
		const threeStarCost = Math.round(shipCells + size * 1.4);
		const twoStarCost = Math.round(shipCells + size * 3.2);
		return { seed: levelSeed(l), sizeLvl, threeStarCost, twoStarCost };
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.score <= cfg.threeStarCost) return 3;
		if (r.score <= cfg.twoStarCost) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `≤ ${cfg.twoStarCost} coups`, three: `≤ ${cfg.threeStarCost} coups` };
	},
};
