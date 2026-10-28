// Éclats levels plans. The website plays SITE: 1-100 in five worlds of twenty, 101-200 with the Expert
// pack. The Unity app (DragonsGemsSwipe ports APP) spreads the same climb over 1-250, five lands of fifty,
// 251-500 with the Expert pack. Each world adds one new thing on top of the last: locked chests, rocks,
// ice, a fifth colour. A level is won
// once N chests are open: a few on the board, the rest arriving at a fixed pace the preview shows,
// within a number of swipes: out of swipes, the level is lost. Each level's board is the candidate
// whose bot count sits nearest a smooth ramp, and its limit is the count a typical player wins within
// 80 % of the time, 65 % on a hard level (one in ten from 30) — picks.ts, written by scripts/eclats-levels.ts.
// Levels 1-10 are lessons on hand-made boards (LESSONS), and 1-20 have no limit: a new player learns,
// then plays freely. The stars count the swipes it took. metric 'time' with score = swipes (lower is better).

import type { LevelPlan, LevelResult } from '../../lib/progression';
import { LEVEL_COUNT, extendPlan } from '../../lib/progression';
import { FIRE_FULL, hash2, type Dir, type EclatsCfg } from './engine';
import { PICKS_APP, PICKS_APP_NIGHT, PICKS_SITE, type Pick } from './picks';

export interface World {
	from: number;
	name: string;
	novelty: string; // the one thing this world adds, shown on its first levels
}

/** The five worlds in order, then the Expert pack's. */
const WORLD_TEXTS: Omit<World, 'from'>[] = [
	{ name: 'La prairie', novelty: '4 gemmes ou plus fusionnent en une gemme plus forte, qui explose plus fort. Un carré de 4 lance une comète vers un coffre.' },
	{ name: 'Les coffres-forts', novelty: 'Coffres cadenassés : le premier éclat fait sauter le cadenas, le second ouvre le coffre.' },
	{ name: 'Les rochers', novelty: 'Rochers : ils ne glissent pas et arrêtent les blocs. Une explosion juste à côté les brise.' },
	{ name: 'Le glacier', novelty: 'Glace : un bloc gelé ne glisse plus. Une explosion juste à côté le dégèle ; il peut aussi exploser avec sa couleur.' },
	{ name: 'La cinquième gemme', novelty: 'Une cinquième couleur se mêle aux autres : les groupes se forment moins facilement.' },
	{ name: 'Les profondeurs', novelty: '' },
];

export interface EclatsLevelCfg extends EclatsCfg {
	limit: number; // swipes allowed, 0 = no limit
	hard: boolean; // one level in ten from 30: a bit harder, a typical player wins it two times in three
	three: number; // swipes for 3★
	two: number; // swipes for 2★
	lesson?: string; // levels 1-10: what this level teaches
	hint?: Dir; // the first swipe that shows it
}

export interface Lesson {
	text: string;
	layout?: string; // the hand-made board (engine LAYOUT_CODES), by rows from the top
	hint?: Dir;
	goal: number;
	fire?: number; // Bijou's gauge at the start
}

const rows = (...r: string[]): string => r.join('');

/**
 * Levels 1-10: one thing each, on a board made so that the suggested first swipe shows it (engine tests
 * prove each one). Chests arrive every 3 edge arrivals; no swipe limit.
 */
export const LESSONS: Lesson[] = [
	{ goal: 3, hint: 'left', text: 'Glisse ! Tous les blocs glissent jusqu’au bord. Trois gemmes de la même couleur qui se touchent explosent.',
		layout: rows('1.2..3.', '.2..1..', '.......', '..0.0.0', '.......', '3..1..2', '.1..2.3') },
	{ goal: 3, hint: 'down', text: 'Une explosion juste à côté d’un coffre l’ouvre. Ouvre tous les coffres demandés !',
		layout: rows('0...2.1', '..0..3.', '.2..1..', '.0....3', '.....1.', '.......', '...C3.2') },
	{ goal: 3, hint: 'down', text: 'Après une explosion, tout reglisse et les explosions s’enchaînent. De nouvelles gemmes arrivent du bord opposé, et une tombe au centre : « À venir » les annonce.',
		layout: rows('.2.0..2', '3....1.', '..22...', '.1..3..', '1....0.', '..1....', '.......') },
	{ goal: 4, hint: 'right', text: 'Quatre gemmes de la même couleur fusionnent en une gemme chargée.',
		layout: rows('.1..2..', '2..3..1', '..1....', '0.0.0.0', '.3...2.', '...1...', '3.2..1.') },
	{ goal: 4, hint: 'down', text: 'Une gemme chargée qui explose avec sa couleur fait sauter tout le carré autour d’elle, coffres compris.',
		layout: rows('.2.....', '3..C...', '..3.2.0', '.0...3.', '2..0...', '..a...1', '....1..') },
	{ goal: 4, hint: 'left', text: 'Cinq gemmes d’un coup montent de deux rangs : un joyau, qui explose encore plus large.',
		layout: rows('2..3..0', '.3..2..', '1.11.11', '..0..2.', '3...0.2', '.2.3...', '0....3.') },
	{ goal: 4, hint: 'down', text: 'Quatre gemmes en carré lancent une comète vers le coffre le plus proche.',
		layout: rows('2...0..', '.23...1', '...1...', '2.....0', '.2.....', '....3..', '.....C.') },
	{ goal: 5, hint: 'right', text: 'La couronne : quand elle explose avec sa couleur, toutes les gemmes de cette couleur sautent.',
		layout: rows('.0.2..1', '3...1..', '.2...0.', '1..3...', '0.v.0..', '..2..3.', '2..0..1') },
	{ goal: 5, hint: 'left', fire: FIRE_FULL - 3, text: 'Chaque gemme détruite remplit la jauge de Bijou. Pleine, touche Bijou : il crache trois boules de feu, d’abord sur les coffres !',
		layout: rows('1.2..3.', '.2..1..', '..C..C.', '..0.0.0', '.......', '3..1..2', '.1..2.3') },
	{ goal: 0, text: 'Moins tu utilises de coups, plus tu gagnes d’étoiles. À toi de jouer !' },
];

const levelSeed = (level: number): number => (Math.imul(level, 2654435761) ^ 0x3c6ef372) >>> 0;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A lesson's hand-made board; its candidates only change the arrivals. */
function lessonBoard(level: number, lesson: Lesson): EclatsCfg {
	return { seed: levelSeed(level), fifth: 0, goal: lesson.goal, chests: 0, locked: 0, chestEvery: 3, rocks: 0, ice: 0, fill: 0, layout: lesson.layout, fire: lesson.fire };
}

/** Levels 1-20 take as many swipes as they need: the first ten teach, the next ten let a new player play. */
export const FREE_LEVELS = 20;

/** One level in ten from 30 is a bit harder: its limit lets a typical player through two times in three, not four in five. */
export const isHard = (level: number): boolean => level % 10 === 0 && level >= 30;

/** The k-th candidate of a board: 0 is the board's own seed. */
export const pickSeed = (seed: number, k: number): number => (k === 0 ? seed : hash2(seed, k));

/** Star thresholds in swipes, inside the limit (at least the bot's count + 2): 3★ near the bot's count, 2★ halfway to the limit, 1★ any win. */
export function starsFor(par: number, limit: number): { three: number; two: number } {
	const three = Math.max(par, Math.min(par + Math.round(par * 0.15), limit - 2));
	return { three, two: Math.max(three + 1, Math.round((three + limit) / 2)) };
}

/** The stars of a level without a limit are counted against this one. */
export const starsLimit = (par: number): number => par + 4 + Math.round(par / 2);

/** One plan of levels: `count` in five worlds, the Expert pack doubling it. */
export interface LevelSet {
	count: number;
	worlds: World[];
	worldOf(level: number): World;
	/** The board of level 1-count, before its candidate is picked. */
	levelBoard(level: number): EclatsCfg;
	/** A level's board before its candidate is picked. */
	boardFor(level: number): EclatsCfg;
	/** The bot's swipe count each level is picked for: a smooth climb instead of a lucky draw. */
	targetPar(level: number): number;
	/** Level n's board with its picked candidate, its swipe limit, its star thresholds and, for 1-10, its lesson. */
	levelConfig(level: number): EclatsLevelCfg;
	picks: Pick[];
	levels: LevelPlan<EclatsLevelCfg>;
}

function levelSet(count: number, picks: Pick[]): LevelSet {
	const size = count / 5;
	const worlds: World[] = WORLD_TEXTS.map((w, i) => ({ from: i < 5 ? 1 + i * size : count + 1, ...w }));
	const worldOf = (level: number): World => [...worlds].reverse().find((w) => level >= w.from) ?? worlds[0];

	function levelBoard(level: number): EclatsCfg {
		const l = Math.max(1, Math.min(count, level));
		const w = Math.min(4, Math.floor((l - 1) / size)); // 0..4
		const t = ((l - 1) % size) / (size - 1); // 0..1 inside the world
		// A hazard ramps up in its own world, then stays at a gentler level in the next ones.
		const at = (world: number, a: number, b: number, after: number): number => (w < world ? 0 : w === world ? lerp(a, b, t) : after);
		const g = (l - 1) / (count - 1);
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

	/** The Expert pack, past count: everything at once, five colours, more chests. */
	function expertBoard(level: number): EclatsCfg {
		const t = (Math.min(2 * count, level) - count - 1) / (count - 1);
		return { seed: levelSeed(level), fifth: lerp(0.08, 0.14, t), goal: Math.round(lerp(12, 16, t)), chests: 3, locked: 3, chestEvery: 9, rocks: 2, ice: 3, fill: 0.5 };
	}

	function boardFor(level: number): EclatsCfg {
		const lesson = level >= 1 && level <= LESSONS.length ? LESSONS[level - 1] : null;
		if (lesson?.layout) return lessonBoard(level, lesson);
		return level > count ? expertBoard(level) : levelBoard(level);
	}

	const targetPar = (level: number): number =>
		level > count ? Math.round(lerp(14, 20, (level - count - 1) / (count - 1))) : Math.round(lerp(6, 16, (level - 1) / (count - 1)));

	function levelConfig(level: number): EclatsLevelCfg {
		const b = boardFor(level);
		const [k, par, limit] = picks[level - 1] ?? [0, targetPar(level), level <= FREE_LEVELS ? 0 : targetPar(level) + 4];
		const lesson = level >= 1 && level <= LESSONS.length ? LESSONS[level - 1] : null;
		return {
			...b, seed: pickSeed(b.seed, k), limit, hard: isHard(level), ...starsFor(par, limit || starsLimit(par)),
			...(lesson ? { lesson: lesson.text, hint: lesson.hint } : {}),
		};
	}

	const basePlan: LevelPlan<EclatsLevelCfg> = {
		count,
		metric: 'time', // score = swipes; fewer is better
		config: levelConfig,
		// `this.config`, not levelConfig: past count, extendPlan hands the hardened config in that way.
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

	// The Expert pack's levels are their own boards (expertBoard), not a reseeded replay of the upper half.
	const levels = extendPlan('eclats', basePlan, { configExt: (_base, level) => levelConfig(level) });
	return { count, worlds, worldOf, levelBoard, boardFor, targetPar, levelConfig, picks, levels };
}

/** The website: 100 levels in five worlds of 20, the Expert pack 101-200. */
export const SITE = levelSet(LEVEL_COUNT, PICKS_SITE);
/** The Unity app: the same climb over 250 levels, five lands of 50, the Expert pack 251-500. */
export const APP = levelSet(250, PICKS_APP);

/**
 * The app's night run, after its second ending: its levels 1-250 again, frozen chests and Perle's breath. The board is
 * the day's, with the day's deal unless that one cannot be cleared at night (scripts/eclats-levels.ts picks another).
 */
export function appNightBoard(level: number, candidate?: number): EclatsLevelCfg {
	const l = Math.max(1, Math.min(APP.count, level));
	const k = candidate ?? PICKS_APP_NIGHT[l - 1]?.[0] ?? APP.picks[l - 1][0];
	// No limit yet: that is what the night run measures on it.
	return { ...APP.levelConfig(l), seed: pickSeed(APP.boardFor(l).seed, k), night: true, frostChests: true, limit: 0 };
}

/** A night level with its own swipe limit and stars, measured like the day's (scripts/eclats-levels.ts night). */
export function appNightConfig(level: number): EclatsLevelCfg {
	const board = appNightBoard(level);
	const [, par, limit] = PICKS_APP_NIGHT[Math.max(1, Math.min(APP.count, level)) - 1] ?? [0, board.three, board.limit];
	return { ...board, limit, ...starsFor(par, limit || starsLimit(par)) };
}

export const COUNT = SITE.count;
export const WORLDS = SITE.worlds;
export const { worldOf, levelBoard, boardFor, targetPar, levelConfig } = SITE;
export const eclatsLevels = SITE.levels;

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
