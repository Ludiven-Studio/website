// Réussite (Klondike) levels plan (1-100). A level = a seeded deal at a difficulty.
// Klondike is luck-dependent per deal and the engine ships no solver / winnable-deal
// generator, so we cannot guarantee every seed is beatable. To keep levels fair we ramp
// the deal from the most solvable settings (draw-1, unlimited recycles) up to the harder
// ones (draw-3, limited passes) only on the back half — early levels stay mostly winnable.
//
// CLEARED (1★) = the whole game is won (all 52 cards on the foundations). 2★ / 3★ reward a
// faster solve, with a moves ceiling as a tie-break so a slow-but-tidy clear can still shine.
// Metric = time (solve time in centiseconds; lower is better).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT } from '../../lib/progression';

export interface ReussiteLevelCfg {
	seed: number;
	draw: number; // 1 | 2 | 3
	passes: number; // stock recycles allowed (Infinity = unlimited)
	label: string; // e.g. "Pioche 1 · passes ∞"
	twoStarCentis: number;
	threeStarCentis: number;
	twoStarMoves: number;
	threeStarMoves: number;
}

// Well-spread deterministic seed per level (odd multiplier + xor so neighbours differ a lot).
const levelSeed = (level: number): number => (Math.imul(level, 2246822519) ^ 0x9e3779b9) >>> 0;

// Difficulty ramp: draw-1 (unlimited) for the solvable early game, draw-2 mid, draw-3 late,
// with pass limits appearing on the hardest stretch.
function ramp(l: number): { draw: number; passes: number; label: string } {
	if (l <= 40) return { draw: 1, passes: Infinity, label: 'Pioche 1 · passes ∞' };
	if (l <= 70) return { draw: 2, passes: Infinity, label: 'Pioche 2 · passes ∞' };
	if (l <= 90) return { draw: 3, passes: Infinity, label: 'Pioche 3 · passes ∞' };
	return { draw: 3, passes: 3, label: 'Pioche 3 · 3 passes' };
}

export const reussiteLevels: LevelPlan<ReussiteLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time', // score = solve time in centiseconds (lower is better)
	config(level: number): ReussiteLevelCfg {
		const l = Math.max(1, Math.min(LEVEL_COUNT, level));
		const { draw, passes, label } = ramp(l);
		const t = (l - 1) / (LEVEL_COUNT - 1); // 0 → 1
		// Time budget grows with difficulty: harder deals earn stars with a looser chrono.
		const threeStarCentis = Math.round((150 + 210 * t) * 100); // 2:30 → 6:00
		const twoStarCentis = Math.round((300 + 300 * t) * 100); // 5:00 → 10:00
		// Move ceiling: a clean Klondike solve is ~120-150 moves; loosen a touch as it hardens.
		const threeStarMoves = Math.round(140 + 60 * t); // 140 → 200
		const twoStarMoves = Math.round(200 + 80 * t); // 200 → 280
		return { seed: levelSeed(l), draw, passes, label, threeStarCentis, twoStarCentis, threeStarMoves, twoStarMoves };
	},
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		const moves = typeof r.stat === 'number' ? r.stat : Infinity;
		if (r.score <= cfg.threeStarCentis && moves <= cfg.threeStarMoves) return 3;
		if (r.score <= cfg.twoStarCentis && moves <= cfg.twoStarMoves) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		const mmss = (centis: number): string => {
			const s = Math.round(centis / 100);
			return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
		};
		return {
			two: `≤ ${mmss(cfg.twoStarCentis)} · ${cfg.twoStarMoves} coups`,
			three: `≤ ${mmss(cfg.threeStarCentis)} · ${cfg.threeStarMoves} coups`,
		};
	},
};
