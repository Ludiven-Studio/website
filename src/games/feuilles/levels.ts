// Feuilles levels plan (1-100). The score is the chrono in centiseconds. The star
// thresholds are anchored on the supply bound: leaves fall one every `spawnEvery`
// beats, so collecting `target` can never beat the rain — the formula, not taste,
// sets the floor (see difficulty-tuning-by-measure).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import type { GenParams } from './engine';

const TICK_S = 0.42; // one beat of wind, mirrors TICK in the island

export interface FeuillesLevelCfg extends GenParams {
	seed: number;
}

/** Stable per-level seed. */
export const levelSeed = (level: number): number =>
	(Math.imul(level * 16 + 7, 22695477) ^ 0x2c9d64f1) >>> 0;

const clampLevel = (level: number): number => Math.max(1, Math.min(LEVEL_COUNT, level));

/** Seconds an ideal run needs: wait out the rain, plus a crossing's worth of travel. */
const parSec = (cfg: GenParams): number =>
	Math.ceil(TICK_S * (cfg.spawnEvery * Math.max(0, cfg.target - cfg.startLeaves) + 2 * cfg.n));

// Drawing the currents and the leaves' detours cost real time on top of the supply
// bound, so the slack is wide: three stars ride the storm, two follow it.
const targets = (cfg: GenParams): { three: number; two: number } => {
	const p = parSec(cfg);
	return { three: Math.round(p * 1.5 + 5), two: Math.round(p * 2.5 + 15) };
};

const fmtSec = (s: number): string => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

const basePlan: LevelPlan<FeuillesLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time',
	config(level: number): FeuillesLevelCfg {
		const l = clampLevel(level);
		const n = l < 34 ? 6 : l < 67 ? 7 : 8;
		const target = 20 + Math.floor((l - 1) * 0.4);
		return {
			n,
			rocks: Math.round(n * n * 0.13) + Math.floor(((l - 1) % 33) / 14),
			target,
			startLeaves: Math.round(target / 3),
			spawnEvery: n === 8 ? 1 : 2,
			seed: levelSeed(l),
		};
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const t = targets(this.config(level));
		if (r.score <= t.three * 100) return 3;
		if (r.score <= t.two * 100) return 2;
		return 1;
	},
	starHint(level: number) {
		const t = targets(this.config(level));
		return { two: `≤ ${fmtSec(t.two)}`, three: `≤ ${fmtSec(t.three)}` };
	},
};

// 101-200: a heavier storm — more leaves wanted, denser rocks, rain every beat.
export const feuillesLevels = extendPlan('feuilles', basePlan, {
	configExt: (base) => ({
		...base,
		rocks: base.rocks + 2,
		target: base.target + 15,
		startLeaves: Math.round((base.target + 15) / 3),
		spawnEvery: 1,
	}),
});
