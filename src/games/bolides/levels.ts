// Course de peinture levels (1-200). A level is one race: it CLEARS (1★) when the peak share of
// the arena reaches the target before the buzzer. 2★ is a bigger share, 3★ is winning the race.
//
// Both ramps are measured, not guessed (scripts/bolides-lvl.ts, 300 seeded races per difficulty
// with the AI driving the player seat). Two findings shaped this:
//
//  - Bot difficulty does NOT change the share a driver can reach: median 34 / 36 / 35 % on
//    Facile / Moyen / Difficile. It changes the pacing only. So difficulty is flavour here, and
//    the target carries the challenge.
//  - The target saturates near the knockout line. Going from 45 % to 49 % moves the clear rate
//    from 21 % to 13 %, because the race ends the moment anyone crosses 50 %. A ladder built on
//    the target alone is flat for its whole top half.
//
// Hence one axis per half: 1-100 grows the target on a full-length race, 101-200 keeps that
// target and cuts the clock, which is a live knob all the way down (35 % clears 55 % of the time
// at 180 s, 24 % at 75 s). Calibrated so an AVERAGE driver clears — the AI wins exactly one race
// in four, i.e. chance — which leaves 2★ and 3★ to carry the skill.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import { CFG } from './engine';

export interface BolidesLevelCfg {
	seed: number;
	diff: number; // index into DIFFS
	target: number; // % of the arena to reach for 1★
	twoStar: number; // % for 2★ (3★ is winning the race)
	limit: number; // race length in seconds
}

/** Deterministic per-level seed so a given level is always the same arena. */
const levelSeed = (level: number): number => (Math.imul(level, 2246822519) ^ 0x85ebca6b) >>> 0;

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

// A share above the knockout line cannot be held: the race ends the moment anyone crosses it.
const CEIL = CFG.winPct - 1;
const TOP_TARGET = 35; // level 100, measured at a 55 % clear rate

const basePlan: LevelPlan<BolidesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score',
	config(level: number): BolidesLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const p = (l - 1) / (LEVEL_COUNT - 1);
		// 10 % at level 1 is a formality (p10 of measured runs is 24 %), 35 % at level 100. The
		// square term keeps the middle gentle and puts the squeeze where the ladder should bite.
		const target = Math.round(lerp(10, TOP_TARGET - 5, p) + 5 * p * p);
		return {
			seed: levelSeed(l),
			diff: l <= 25 ? 0 : l <= 60 ? 1 : 2,
			target,
			twoStar: Math.min(CEIL, target + 6),
			limit: CFG.timeLimit,
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.stat === 1) return 3; // won the race — the only star the target cannot buy
		if (r.score / 10 >= cfg.twoStar) return 2; // score travels in tenths, like the daily
		return 1;
	},
	starHint(level: number): { two: string; three: string } {
		const cfg = this.config(level);
		return { two: `${cfg.twoStar} % du bitume`, three: 'gagner la course' };
	},
};

// 101-200: same target as level 100, on a clock that shrinks from the full race down to 75 s
// (a 55 % clear rate down to 24 %). Every race on Difficile.
export const bolidesLevels = extendPlan('bolides', basePlan, {
	configExt: (base, level) => {
		const p = (level - LEVEL_COUNT) / LEVEL_COUNT; // 0 → 1 across the extended half
		const limit = Math.round(lerp(CFG.timeLimit, 75, p) / 5) * 5;
		return { ...base, diff: 2, target: TOP_TARGET, twoStar: TOP_TARGET + 6, limit };
	},
});
