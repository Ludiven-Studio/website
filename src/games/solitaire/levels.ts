// Solitaire (peg solitaire) levels plan (1-100). A level = a seeded, always-solvable
// starting position at rising difficulty. The engine has few knobs: board variant
// (cross / triangle) and how many pegs the position starts with. So the ramp grows the
// starting peg count 5 → 10 (the generator cap) over the run, and drops in a full board
// (32-peg cross or 14-peg triangle — the real endgame) every 10th level and for the final
// stretch. Clearing = one peg left (a win is always exactly one peg), so time is the only
// differentiator: 1★ = solved, 2★/3★ = solved fast (thresholds scale with peg count).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import { createLayout, initialPegs, generateDaily, pegCount, type Variant } from './engine';

export interface SolitaireLevelCfg {
	seed: number;
	variant: Variant;
	full: boolean; // full board (initialPegs) vs a seeded partial position
	count: number; // starting peg count (informational; full board uses the layout's own)
	twoStarCentis: number;
	threeStarCentis: number;
}

const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b9) >>> 0;

// Is this a "boss" full-board level? Every 10th, plus the last 5.
const isFullLevel = (level: number): boolean => level % 10 === 0 || level > LEVEL_COUNT - 5;

/** Build the seeded starting pegs for a level (deterministic). */
export function levelPegs(cfg: SolitaireLevelCfg): boolean[] {
	if (cfg.full) return initialPegs(createLayout(cfg.variant));
	return generateDaily(cfg.seed, cfg.count);
}

export const solitaireLevels: LevelPlan<SolitaireLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): SolitaireLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const full = isFullLevel(l);
		// Full boards alternate cross / triangle by parity; partial positions are always the
		// cross (the backward-walk generator only builds solvable cross positions).
		const variant: Variant = full ? (l % 20 === 0 ? 'triangle' : 'anglais') : 'anglais';
		// Partial positions grow 5 → 10 pegs across the run (10 is the generator's cap).
		const count = full
			? pegCount(initialPegs(createLayout(variant)))
			: Math.max(5, Math.min(10, 5 + Math.floor(((l - 1) * 6) / LEVEL_COUNT)));
		// Time budget scales with the position size: ~2.2 s/peg for 3★, ~4 s/peg for 2★.
		return {
			seed: levelSeed(l),
			variant,
			full,
			count,
			threeStarCentis: count * 220,
			twoStarCentis: count * 400,
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
