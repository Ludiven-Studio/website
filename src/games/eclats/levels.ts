// Éclats levels plan (1-100, 101-200 with the Expert pack). Five worlds of twenty levels, each
// adding one new thing on top of the last: locked chests, rocks, ice, a fifth colour. A level is won
// once N chests are open: a few on the board, the rest arriving at a fixed pace the preview shows.
// The stars count the swipes it took, against the bot's own
// count on that level. Each level's board is the candidate whose bot count sits nearest a smooth
// ramp (picks.ts, written by scripts/eclats-levels.ts), so no level is a freebie or a slog.
// metric 'time' with score = swipes (lower is better).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import { hash2, type EclatsCfg } from './engine';
import { PICKS } from './picks';

export interface World {
	from: number;
	name: string;
	novelty: string; // the one thing this world adds, shown on its first levels
}

export const WORLDS: World[] = [
	{ from: 1, name: 'La prairie', novelty: '4 gemmes ou plus fusionnent en une gemme plus forte, qui explose plus fort. Un carré de 4 lance une comète vers un coffre.' },
	{ from: 21, name: 'Les coffres-forts', novelty: 'Coffres cadenassés : le premier éclat fait sauter le cadenas, le second ouvre le coffre.' },
	{ from: 41, name: 'Les rochers', novelty: 'Rochers : ils ne glissent pas et arrêtent les blocs. Une explosion juste à côté les brise.' },
	{ from: 61, name: 'Le glacier', novelty: 'Glace : un bloc gelé ne glisse plus. Une explosion juste à côté le dégèle ; il peut aussi exploser avec sa couleur.' },
	{ from: 81, name: 'La cinquième gemme', novelty: 'Une cinquième couleur se mêle aux autres : les groupes se forment moins facilement.' },
	{ from: 101, name: 'Les profondeurs', novelty: '' },
];

export const worldOf = (level: number): World => [...WORLDS].reverse().find((w) => level >= w.from) ?? WORLDS[0];

export interface EclatsLevelCfg extends EclatsCfg {
	three: number; // swipes for 3★
	two: number; // swipes for 2★
}

const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x3c6ef372) >>> 0;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The board of level 1-100, before its candidate is picked. */
export function levelBoard(level: number): EclatsCfg {
	const l = Math.max(1, Math.min(LEVEL_COUNT, level));
	const w = Math.min(4, Math.floor((l - 1) / 20)); // 0..4
	const t = ((l - 1) % 20) / 19; // 0..1 inside the world
	// A hazard ramps up in its own world, then stays at a gentler level in the next ones.
	const at = (world: number, a: number, b: number, after: number): number => (w < world ? 0 : w === world ? lerp(a, b, t) : after);
	const g = (l - 1) / (LEVEL_COUNT - 1);
	return {
		seed: levelSeed(l),
		fifth: at(4, 0.06, 0.16, 0.16),
		goal: Math.round(lerp(6, 10, t) + w * 1.2),
		chests: 3,
		locked: Math.round(at(1, 1, 3, 2)),
		chestEvery: Math.round(lerp(12, 9, g)),
		rocks: Math.round(at(2, 1, 3, 2)),
		ice: Math.round(at(3, 2, 5, 3)),
		fill: 0.55,
	};
}

/** 101-200: everything at once, five colours, more chests. */
function expertBoard(level: number): EclatsCfg {
	const t = (Math.min(200, level) - 101) / 99;
	return { seed: levelSeed(level), fifth: lerp(0.08, 0.14, t), goal: Math.round(lerp(12, 16, t)), chests: 3, locked: 3, chestEvery: 9, rocks: 2, ice: 3, fill: 0.5 };
}

/** A level's board before its candidate is picked. */
export const boardFor = (level: number): EclatsCfg => (level > LEVEL_COUNT ? expertBoard(level) : levelBoard(level));

/** The k-th candidate of a board: 0 is the board's own seed. */
export const pickSeed = (seed: number, k: number): number => (k === 0 ? seed : hash2(seed, k));

/** The bot's swipe count each level is picked for: a smooth climb instead of a lucky draw. */
export const targetPar = (level: number): number =>
	level > LEVEL_COUNT ? Math.round(lerp(14, 20, (level - 101) / 99)) : Math.round(lerp(6, 16, (level - 1) / (LEVEL_COUNT - 1)));

/** Star thresholds in swipes: the bot's count plus room for a person. */
export function starsFor(par: number): { three: number; two: number } {
	const three = par + 2 + Math.round(par * 0.3);
	return { three, two: three + 3 + Math.round(par * 0.5) };
}

/** Level n's board with its picked candidate and star thresholds. */
export function levelConfig(level: number): EclatsLevelCfg {
	const b = boardFor(level);
	const [k, par] = PICKS[level - 1] ?? [0, targetPar(level)];
	return { ...b, seed: pickSeed(b.seed, k), ...starsFor(par) };
}

const basePlan: LevelPlan<EclatsLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time', // score = swipes; fewer is better
	config: levelConfig,
	// `this.config`, not levelConfig: past 100, extendPlan hands the hardened config in that way.
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3 {
		if (!r.won) return 0;
		const cfg = this.config(level);
		if (r.score <= cfg.three) return 3;
		if (r.score <= cfg.two) return 2;
		return 1;
	},
	starHint(level: number) {
		const cfg = this.config(level);
		return { two: `≤ ${cfg.two} coups`, three: `≤ ${cfg.three} coups` };
	},
};

// 101-200 are their own boards (expertBoard), not a reseeded replay of 51-100.
export const eclatsLevels = extendPlan('eclats', basePlan, {
	configExt: (_base, level) => levelConfig(level),
});

/* ---------- Free play and the daily challenge ---------- */

export type TierKey = 'facile' | 'moyen' | 'difficile' | 'expert';
export const TIER_ORDER: TierKey[] = ['facile', 'moyen', 'difficile'];

type Tier = { label: string; cfg: Omit<EclatsCfg, 'seed'> };

/** Free play: endless, scored in points; the fifth colour creeps in every few swipes (engine `fifthNow`). */
export const TIERS: Record<TierKey, Tier> = {
	facile: { label: 'Facile', cfg: { fifth: 0, goal: 0, chests: 1, locked: 0, chestEvery: 40, rocks: 0, ice: 0, fill: 0.5 } },
	moyen: { label: 'Moyen', cfg: { fifth: 0.06, goal: 0, chests: 1, locked: 0, chestEvery: 40, rocks: 0, ice: 0, fill: 0.55 } },
	difficile: { label: 'Difficile', cfg: { fifth: 0.12, goal: 0, chests: 1, locked: 0, chestEvery: 40, rocks: 0, ice: 0, fill: 0.6 } },
	expert: { label: 'Expert', cfg: { fifth: 0.18, goal: 0, chests: 1, locked: 0, chestEvery: 40, rocks: 0, ice: 0, fill: 0.6 } },
};

/** The daily challenge: N chests, the arrivals announced, fewest swipes wins. */
export const DAILY: Record<TierKey, Tier> = {
	facile: { label: 'Facile', cfg: { fifth: 0, goal: 8, chests: 3, locked: 1, chestEvery: 12, rocks: 0, ice: 0, fill: 0.55 } },
	moyen: { label: 'Moyen', cfg: { fifth: 0, goal: 10, chests: 3, locked: 2, chestEvery: 11, rocks: 1, ice: 0, fill: 0.55 } },
	difficile: { label: 'Difficile', cfg: { fifth: 0.08, goal: 12, chests: 3, locked: 2, chestEvery: 10, rocks: 2, ice: 2, fill: 0.55 } },
	expert: { label: 'Expert', cfg: { fifth: 0.12, goal: 14, chests: 3, locked: 3, chestEvery: 9, rocks: 2, ice: 3, fill: 0.55 } },
};
