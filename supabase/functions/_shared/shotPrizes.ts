// shot-prizes' rules, apart so they are tested without a database or Unity (shotPrizes_test.ts).
// Pétanque Game's shooting challenge pays the best places of its Unity Leaderboards rankings: the day's
// best ten, the week's best fifty. The same table as the game's ShotChallenge.DayPrizes / WeekPrizes.

export const DAY_BOARD = 'shots_day';
export const WEEK_BOARD = 'shots_week';

/** (last rank, coins), best first. */
export const DAY_PRIZES: readonly [number, number][] = [[1, 300], [3, 150], [10, 75]];
export const WEEK_PRIZES: readonly [number, number][] = [[1, 1500], [3, 800], [10, 300], [50, 100]];

/** Rows older than this go: the game claims a prize within days. */
export const KEEP_DAYS = 30;

/** `rank` from 1. */
export function prize(week: boolean, rank: number): number {
	if (!(rank >= 1)) return 0;
	for (const [last, coins] of week ? WEEK_PRIZES : DAY_PRIZES) if (rank <= last) return coins;
	return 0;
}

/** How many places a ranking pays. */
export const paidPlaces = (week: boolean): number => (week ? WEEK_PRIZES : DAY_PRIZES).at(-1)![0];

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The periods a run at `now` closes. Run a minute before midnight UTC, it closes the day, and the week
 * on a Sunday (the week runs Monday to Sunday, as the game's rankings reset). Each period is named by
 * its first day.
 */
export function closing(now: Date): { board: string; week: boolean; period: string }[] {
	const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	const out = [{ board: DAY_BOARD, week: false, period: iso(day) }];
	if (day.getUTCDay() === 0) {
		const monday = new Date(day.getTime() - 6 * 86_400_000);
		out.push({ board: WEEK_BOARD, week: true, period: iso(monday) });
	}
	return out;
}

/** One line of Unity's Leaderboards Admin API « Get Scores ». */
export interface UnityScore {
	playerId: string;
	rank: number; // from 0
	score: number;
}

export interface PrizeRow {
	board: string;
	period: string;
	player_id: string;
	rank: number;
	score: number;
	coins: number;
}

/**
 * The rows to keep from a ranking's best lines: the paid places with a score over 0, no name. The score
 * shown is the value's whole part (its fractions only break ties in the game).
 */
export function rowsFrom(results: UnityScore[], board: string, week: boolean, period: string): PrizeRow[] {
	const rows: PrizeRow[] = [];
	for (const r of results) {
		const rank = r.rank + 1;
		const score = Math.floor(r.score + 1e-6);
		const coins = score > 0 ? prize(week, rank) : 0;
		if (coins > 0 && typeof r.playerId === 'string' && r.playerId.length > 0) {
			rows.push({ board, period, player_id: r.playerId, rank, score, coins });
		}
	}
	return rows;
}
