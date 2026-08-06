// Spectro levels plan (1-100). A level = one seeded melody run, graded on the final
// score. Cleared (1★) when the score reaches config.target; 2★/3★ ask for a cleaner
// trace. Difficulty ramps note count, tempo, and leap size — each raising the target
// as a fraction of the melody's max reachable score.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import { maxScore, type Diff } from './engine';

export interface SpectroLevelCfg {
	seed: number;
	diff: Diff;
	target: number; // clear score (1★)
	two: number; // 2★ score
	three: number; // 3★ score
}

/** Deterministic per-level seed so a given level is always the same melody. */
const levelSeed = (level: number): number => (Math.imul(level, 2246822519) ^ 0x27d4eb2f) >>> 0;

const basePlan: LevelPlan<SpectroLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score',
	config(level: number): SpectroLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1
		const count = Math.round(16 + t * 18); // 16 → 34 notes
		const diff: Diff = {
			label: `Niveau ${l}`,
			count,
			tempo: 1.0 + t * 1.2, // 1.0 → 2.2 bps
			maxStep: 2 + Math.floor(t * 3), // 2 → 5 semitone-degree leaps
			root: 55,
		};
		// Target as a share of the perfect run — clearing gets stricter as skills grow.
		const max = maxScore(count);
		const clearFrac = 0.4 + t * 0.22; // 40% → 62%
		const target = Math.round(max * clearFrac);
		const two = Math.round(max * (clearFrac + 0.13));
		const three = Math.round(max * (clearFrac + 0.24));
		return { seed: levelSeed(l), diff, target, two, three };
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.score >= cfg.three) return 3;
		if (r.score >= cfg.two) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `${cfg.two} pts`, three: `${cfg.three} pts` };
	},
};

// 101-200: longer and faster melodies with wider leaps, and a bigger share of the
// perfect run to clear. Shares stay under 1 so 3★ is always reachable.
export const spectroLevels = extendPlan('spectro', basePlan, {
	configExt: (base, level, baseLevel) => {
		const count = base.diff.count + 8;
		const max = maxScore(count);
		const clearFrac = 0.46 + 0.22 * ((baseLevel - 1) / (LEVEL_COUNT - 1)); // 46% → 68%
		return {
			...base,
			diff: {
				label: `Niveau ${level}`,
				count,
				tempo: base.diff.tempo + 0.35,
				maxStep: 6,
				root: base.diff.root,
			},
			target: Math.round(max * clearFrac),
			two: Math.round(max * (clearFrac + 0.13)),
			three: Math.round(max * (clearFrac + 0.24)),
		};
	},
});
