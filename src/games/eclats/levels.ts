// Éclats levels plan (1-100, 101-200 with the Expert pack). Five worlds of twenty levels, each
// adding one new thing on top of the last: traps, ice, hard ground, locks. A level is won once
// every treasure is unearthed; the stars count the pieces it took, against the bot's own count
// on that level. Each level's ground is the candidate whose bot count sits nearest a smooth
// ramp (picks.ts, written by scripts/eclats-levels.ts), so no level is a freebie or a slog.
// metric 'time' with score = pieces (lower is better).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import { hash2, type EclatsCfg } from './engine';
import { PICKS } from './picks';

export interface World {
	from: number;
	name: string;
	novelty: string; // the one thing this world adds, shown once
}

export const WORLDS: World[] = [
	{ from: 1, name: 'La prairie', novelty: '' },
	{ from: 21, name: 'La grotte aux pièges', novelty: 'Pièges : un piège creusé pousse une ligne de pierres sous ta pile. La pastille rouge d’une case creusée compte les pièges voisins.' },
	{ from: 41, name: 'Le glacier', novelty: 'Glace : une gemme gelée demande deux éclats, le premier casse la glace.' },
	{ from: 61, name: 'La carrière', novelty: 'Roche : une case de sol fendue demande deux coups avant de s\'ouvrir.' },
	{ from: 81, name: 'La forteresse', novelty: 'Cadenas : une gemme verrouillée ne tombe pas et ne s\'aligne pas tant qu\'une voisine n\'a pas éclaté.' },
	{ from: 101, name: 'Les profondeurs', novelty: '' },
];

export const worldOf = (level: number): World => [...WORLDS].reverse().find((w) => level >= w.from) ?? WORLDS[0];

export interface EclatsLevelCfg extends EclatsCfg {
	three: number; // pieces for 3★
	two: number; // pieces for 2★
}

const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x3c6ef372) >>> 0;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The board of a level, before its star thresholds. */
export function levelBoard(level: number): EclatsCfg {
	const l = Math.max(1, Math.min(LEVEL_COUNT, level));
	const w = Math.min(4, Math.floor((l - 1) / 20)); // 0..4
	const t = ((l - 1) % 20) / 19; // 0..1 inside the world
	const g = (l - 1) / (LEVEL_COUNT - 1); // 0..1 across the game
	const at = (world: number, a: number, b: number, after = b): number => (w < world ? 0 : w === world ? lerp(a, b, t) : after);
	return {
		seed: levelSeed(l),
		colors: l <= 5 ? 3 : l <= 90 ? 4 : 5,
		depth: w === 0 ? 4 : w === 1 ? Math.round(lerp(4, 5, t)) : 5,
		treasures: Math.round(lerp(3, 5, t) + w * 0.6),
		traps: Math.round(at(1, 1, 3, 2)),
		ice: Math.round(at(2, 2, 6, 3)),
		hard: at(3, 0.15, 0.35, 0.25),
		locks: Math.round(at(4, 2, 5)),
		pile: l <= 3 ? 0 : w < 2 ? 2 : 3,
		fallMs: Math.round(lerp(1150, 600, g)),
		trios: lerp(0.25, 0.45, g),
		clues: 2,
		bonusEvery: 1,
	};
}

/** 101-200: five colours, every hazard at once, a deeper ground and a quicker fall. */
function expertBoard(level: number): EclatsCfg {
	const t = (Math.min(200, level) - 101) / 99;
	return {
		seed: levelSeed(level),
		colors: 5,
		depth: 5,
		treasures: Math.round(lerp(6, 8, t)),
		traps: 3,
		ice: 4,
		hard: 0.3,
		locks: Math.round(lerp(3, 5, t)),
		pile: 3,
		fallMs: Math.round(lerp(560, 450, t)),
		trios: 0.45,
		clues: 2,
		bonusEvery: 1,
	};
}

/** A level's board before its ground is picked. */
export const boardFor = (level: number): EclatsCfg => (level > LEVEL_COUNT ? expertBoard(level) : levelBoard(level));

/** The k-th candidate ground of a board: 0 is the board's own seed. */
export const pickSeed = (seed: number, k: number): number => (k === 0 ? seed : hash2(seed, k));

/** The bot's piece count each level is picked for: a smooth climb instead of a lucky draw. */
export const targetPar = (level: number): number =>
	level > LEVEL_COUNT ? Math.round(lerp(15, 21, (level - 101) / 99)) : Math.round(lerp(7, 16, (level - 1) / (LEVEL_COUNT - 1)));

/** Star thresholds in pieces: the bot's count plus room for the falling clock and for thinking. */
export function starsFor(par: number): { three: number; two: number } {
	const three = par + 3 + Math.round(par * 0.3);
	return { three, two: three + 4 + Math.round(par * 0.5) };
}

/** Level n's board with its picked ground and star thresholds. */
export function levelConfig(level: number): EclatsLevelCfg {
	const b = boardFor(level);
	const [k, par] = PICKS[level - 1] ?? [0, targetPar(level)];
	return { ...b, seed: pickSeed(b.seed, k), ...starsFor(par) };
}

const basePlan: LevelPlan<EclatsLevelCfg> = {
	count: LEVEL_COUNT,
	metric: 'time', // score = pieces; fewer is better
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
		return { two: `≤ ${cfg.two} pièces`, three: `≤ ${cfg.three} pièces` };
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
export const TIERS: Record<TierKey, Tier> = {
	facile: { label: 'Facile', cfg: { colors: 4, depth: 4, treasures: 4, traps: 0, ice: 0, hard: 0, locks: 0, pile: 2, fallMs: 1000, trios: 0.3, clues: 2, bonusEvery: 1 } },
	moyen: { label: 'Moyen', cfg: { colors: 4, depth: 5, treasures: 5, traps: 1, ice: 2, hard: 0.1, locks: 0, pile: 2, fallMs: 800, trios: 0.38, clues: 2, bonusEvery: 1 } },
	difficile: { label: 'Difficile', cfg: { colors: 4, depth: 5, treasures: 6, traps: 2, ice: 3, hard: 0.2, locks: 2, pile: 3, fallMs: 650, trios: 0.42, clues: 2, bonusEvery: 1 } },
	expert: { label: 'Expert', cfg: { colors: 5, depth: 5, treasures: 7, traps: 3, ice: 4, hard: 0.3, locks: 4, pile: 3, fallMs: 520, trios: 0.45, clues: 2, bonusEvery: 1 } },
};
