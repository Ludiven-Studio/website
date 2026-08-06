// Levels-mode progression client. Talks to the `submit-level` Edge Function
// (server-side best-retained upsert) and reads the RLS-protected game_progress
// table. Mirrors to localStorage for instant paint + offline play.
//
// A game opts into levels mode by exporting a LevelPlan (see below) and calling
// getProgression / submitLevel — no per-game backend change beyond its games row.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../data/site';
import { leaderboardEnabled } from './leaderboard';
import { playerId } from './scores';
import { hasUnlock } from './wallet';

// Stays 100: ~30 levels.ts use it as the ramp denominator, so raising it would flatten
// every difficulty curve. The Expert pack raises `plan.count` instead.
export const LEVEL_COUNT = 100;

/** Result of a finished level run. `score` = time in centiseconds (time games) or points (score games).
    `stat` is an optional secondary metric a game may use for its star rule (e.g. lives left, hints used). */
export interface LevelResult {
	score: number;
	won: boolean;
	stat?: number;
	raw?: Record<string, unknown>;
}

/** Per-game difficulty ramp + star rules. Cfg is the game's own difficulty shape. */
export interface LevelPlan<Cfg> {
	count: number; // LEVEL_COUNT
	metric: 'time' | 'score'; // decides best-retained direction (time = lower is better)
	config(level: number): Cfg;
	/** Stars earned for a finished run — 0 = failed (no unlock). */
	stars(level: number, r: LevelResult): 0 | 1 | 2 | 3;
	/** Human hint of the 2★ / 3★ targets, shown in the UI. */
	starHint(level: number): { two: string; three: string };
}

export interface GameProgress {
	stars: Record<number, 1 | 2 | 3>; // level → best stars (absent = never cleared)
	best: Record<number, number>; // level → best score/time
	count?: number; // effective level cap — the plan's, once the Expert pack is bought
}

const emptyProgress = (): GameProgress => ({ stars: {}, best: {} });

export interface ExtendOpts<Cfg> {
	/** Which base level an extended level replays. Default: the upper half, in order. */
	mapBack?(level: number, baseCount: number): number;
	/** The real hardening, written per game — this is where the Expert notch goes. */
	configExt(base: Cfg, level: number, baseLevel: number): Cfg;
}

/** Deterministic reshuffle of a level seed, so 101-200 are new boards, not replays. */
const mixSeed = (seed: number, level: number): number => {
	let x = (Math.imul(seed | 0, 2654435761) ^ Math.imul(level, 40503)) >>> 0;
	x = Math.imul(x ^ (x >>> 16), 2246822507) >>> 0;
	x = Math.imul(x ^ (x >>> 13), 3266489909) >>> 0;
	return ((x ^ (x >>> 16)) >>> 0) % 1_000_000;
};

/**
 * Double a game's level plan: 101-200 replay the upper half of the ramp with a fresh seed
 * and the game's own hardening on top. `count` is a getter, so LevelOutcome and useLevels
 * pick the new cap up on their own the moment the pack is bought.
 */
export function extendPlan<Cfg>(gameId: string, plan: LevelPlan<Cfg>, opts: ExtendOpts<Cfg>): LevelPlan<Cfg> {
	const base = plan.count;
	// The extended half stretches the upper half of the ramp over twice as many levels.
	const start = Math.floor(base / 2) + 1;
	const back = (l: number): number => Math.max(1, Math.min(base, opts.mapBack
		? opts.mapBack(l, base)
		: base <= 1 ? 1 : start + Math.floor(((l - base - 1) * (base - start)) / (base - 1))));
	return {
		get count(): number {
			return hasUnlock(gameId) ? base * 2 : base;
		},
		metric: plan.metric,
		config(level: number): Cfg {
			if (level <= base) return plan.config(level);
			const b = back(level);
			const cfg = { ...plan.config(b) } as Cfg & { seed?: number };
			if (typeof cfg.seed === 'number') cfg.seed = mixSeed(cfg.seed, level);
			return opts.configExt(cfg, level, b);
		},
		// Plans grade with `this.config(level)`. Past the base count that has to resolve to the
		// hardened config, so `this` is swapped for one that hands back exactly that.
		stars(level, r) {
			if (level <= base) return plan.stars(level, r);
			const cfg = this.config(level);
			return plan.stars.call({ ...plan, config: () => cfg }, back(level), r);
		},
		starHint(level) {
			if (level <= base) return plan.starHint(level);
			const cfg = this.config(level);
			return plan.starHint.call({ ...plan, config: () => cfg }, back(level));
		},
	};
}

const localKey = (gameId: string): string => `ludiven-progress-${gameId}`;

function loadLocal(gameId: string): GameProgress {
	try {
		const raw = localStorage.getItem(localKey(gameId));
		if (!raw) return emptyProgress();
		const p = JSON.parse(raw) as GameProgress;
		return { stars: p.stars ?? {}, best: p.best ?? {} };
	} catch {
		return emptyProgress();
	}
}

function saveLocal(gameId: string, p: GameProgress): void {
	try {
		localStorage.setItem(localKey(gameId), JSON.stringify(p));
	} catch {
		/* storage unavailable — stay in memory only */
	}
}

/** Highest playable level: one past the highest cleared level (min 1). */
export function unlockedUpTo(p: GameProgress): number {
	let max = 0;
	for (const lvl of Object.keys(p.stars)) {
		const n = Number(lvl);
		if (p.stars[n] >= 1 && n > max) max = n;
	}
	return Math.min(p.count ?? LEVEL_COUNT, max + 1);
}

/** Read the player's progression: localStorage first (instant), then reconcile with the server. */
export async function getProgression(gameId: string): Promise<GameProgress> {
	const local = loadLocal(gameId);
	if (!leaderboardEnabled()) return local;
	try {
		const res = await fetch(
			`${SUPABASE_URL}/rest/v1/game_progress?game_id=eq.${encodeURIComponent(gameId)}` +
				`&player_id=eq.${playerId()}&select=level,stars,best_score`,
			{ headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
		);
		if (!res.ok) return local;
		const rows: { level: number; stars: number; best_score: number }[] = await res.json();
		const merged = mergeIntoLocal(local, rows);
		saveLocal(gameId, merged);
		return merged;
	} catch {
		return local;
	}
}

/** Server rows win on higher stars; keep local best on ties (server is source of truth once synced). */
function mergeIntoLocal(local: GameProgress, rows: { level: number; stars: number; best_score: number }[]): GameProgress {
	const merged: GameProgress = { stars: { ...local.stars }, best: { ...local.best } };
	for (const r of rows) {
		const stars = Math.max(1, Math.min(3, r.stars)) as 1 | 2 | 3;
		if (!merged.stars[r.level] || stars >= merged.stars[r.level]) {
			merged.stars[r.level] = stars;
			merged.best[r.level] = r.best_score;
		}
	}
	return merged;
}

export interface SubmitLevelArgs {
	gameId: string;
	level: number;
	stars: 1 | 2 | 3;
	score: number;
	metricIsTime: boolean; // decides which score is "better" when updating the local mirror
	rawData?: Record<string, unknown>;
}

/** Record a cleared level. Updates the local mirror immediately, then posts to the server. */
export async function submitLevel(args: SubmitLevelArgs): Promise<GameProgress> {
	const { gameId, level, stars, score, metricIsTime } = args;
	// Optimistic local update — keep best stars, best score on a tie.
	const local = loadLocal(gameId);
	const prevStars = local.stars[level] ?? 0;
	const prevBest = local.best[level];
	const better = prevBest == null || (metricIsTime ? score < prevBest : score > prevBest);
	if (stars > prevStars || (stars === prevStars && better)) {
		local.stars[level] = Math.max(stars, prevStars) as 1 | 2 | 3;
		local.best[level] = stars > prevStars ? score : better ? score : prevBest;
	}
	saveLocal(gameId, local);

	if (leaderboardEnabled()) {
		try {
			await fetch(`${SUPABASE_URL}/functions/v1/submit-level`, {
				method: 'POST',
				headers: {
					apikey: SUPABASE_ANON_KEY,
					Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					game_id: gameId,
					player_id: playerId(),
					level,
					stars,
					score: Math.round(score),
					raw_data: args.rawData ?? null,
				}),
			});
		} catch {
			/* offline — the local mirror already reflects the result */
		}
	}
	return local;
}
