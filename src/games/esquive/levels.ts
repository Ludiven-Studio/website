// Esquive levels plan (1-100). A level = one asteroid run. Cleared when the survived
// time reaches the level target; 2★/3★ for surviving longer. Difficulty ramps the
// spawn gap (950→650 ms), forward speed, and field density with the level, so later
// levels ask for more dodging under a tighter field. Score is in tenths of a second.

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';
import type { EsquiveDiff } from './engine';

export interface EsquiveLevelCfg {
	seed: number;
	diff: EsquiveDiff;
	targetTenths: number; // survive this long (tenths of a second) to clear the level
}

/** Deterministic per-level seed so a given level is always the same asteroid field. */
const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x9e3779b1) >>> 0;

/** Survival target in tenths of a second: level 1 ≈ 18 s … level 100 ≈ 75 s. */
const targetTenths = (l: number): number => 180 + Math.round((l - 1) * 5.8);

export const esquiveLevels: LevelPlan<EsquiveLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'score',
	config(level: number): EsquiveLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1
		// Difficulty baked into the level (no separate diff pill): the field starts denser
		// and faster on higher levels, and its ramps bite sooner.
		const diff: EsquiveDiff = {
			label: `Niveau ${l}`,
			spawnEveryMs: Math.round(950 - 300 * t), // 950 → 650 ms
			baseSpeed: 22 + 12 * t, // 22 → 34 units/s
			rampEveryMs: Math.round(8000 - 2200 * t), // 8.0 → 5.8 s between steps
			speedRamp: 0.15 + 0.06 * t, // +15% → +21% speed per step
			spawnRamp: 55 + 30 * t, // -55 → -85 ms off the gap per step
			minSpawnMs: Math.round(300 - 90 * t), // 300 → 210 ms floor
			burstEveryMs: Math.round(26000 - 9000 * t), // density wall builds sooner on high levels
		};
		return { seed: levelSeed(l), diff, targetTenths: targetTenths(l) };
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const target = this.config(level).targetTenths;
		if (r.score >= Math.round(target * 1.6)) return 3;
		if (r.score >= Math.round(target * 1.3)) return 2;
		return 1;
	},
	starHint(level: number) {
		const target = this.config(level).targetTenths;
		const s = (tenths: number) => `${Math.round(tenths / 10)} s`;
		return { two: `≥ ${s(target * 1.3)}`, three: `≥ ${s(target * 1.6)}` };
	},
};
