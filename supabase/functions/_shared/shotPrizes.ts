// shot-prizes' rules, apart so they are tested without a database or Unity (shotPrizes_test.ts).
// Pétanque Game's shooting challenge pays the best places of its Unity Leaderboards rankings: the day's and the
// week's first three (owner's call, 2026-11-17: few players yet). The same table as the game's
// ShotChallenge.DayPrizes / WeekPrizes.

export const DAY_BOARD = 'shots_day';
export const WEEK_BOARD = 'shots_week';

/** (last rank, coins), best first. */
export const DAY_PRIZES: readonly [number, number][] = [[1, 300], [3, 150]];
export const WEEK_PRIZES: readonly [number, number][] = [[1, 1500], [3, 800]];

/** Rows older than this go (pg_cron's own purge, apart from the snapshots): the game claims within days. */
export const KEEP_DAYS = 30;

/** Lines read beyond the paid places, for the deleted accounts' lines skipped. */
export const SPARE_LINES = 20;

/** `rank` from 1. */
export function prize(week: boolean, rank: number): number {
	if (!(rank >= 1)) return 0;
	for (const [last, coins] of week ? WEEK_PRIZES : DAY_PRIZES) if (rank <= last) return coins;
	return 0;
}

/** How many places a ranking pays. */
export const paidPlaces = (week: boolean): number => (week ? WEEK_PRIZES : DAY_PRIZES).at(-1)![0];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * The periods closing on `day` (UTC, « YYYY-MM-DD », sent by the cron job as computed a minute before
 * midnight): the day, and the week on a Sunday (the week runs Monday to Sunday, as the game's rankings reset).
 * Each period is named by its first day. Null when `day` is not today at `now`: past midnight Unity has reset
 * the rankings, and reading them would close the finished period empty.
 */
export function closing(day: string, now: Date): { board: string; week: boolean; period: string }[] | null {
	if (!DAY_RE.test(day) || day !== iso(now)) return null;
	const d = new Date(day + 'T00:00:00Z');
	const out = [{ board: DAY_BOARD, week: false, period: day }];
	if (d.getUTCDay() === 0) out.push({ board: WEEK_BOARD, week: true, period: iso(new Date(d.getTime() - 6 * 86_400_000)) });
	return out;
}

/** One line of Unity's Leaderboards Admin API « Get Scores ». */
export interface UnityScore {
	playerId: string;
	rank: number; // from 0
	score: number;
	metadata?: string;
}

export interface PrizeRow {
	board: string;
	period: string;
	player_id: string;
	rank: number;
	score: number;
	coins: number;
}

/** A line the game marked gone as its account was deleted (metadata « gone »: "1"). */
function gone(metadata: string | undefined): boolean {
	if (!metadata) return false;
	try {
		return JSON.parse(metadata)?.gone === '1';
	} catch {
		return false;
	}
}

/**
 * The rows to keep from a ranking's best lines, in Unity's order: deleted accounts' lines skipped and the
 * places counted again without them, as the game's screen shows them; the paid places with a score over 0,
 * no name. The score is the value's whole part (its fractions only break ties in the game).
 */
export function rowsFrom(results: UnityScore[], board: string, week: boolean, period: string): PrizeRow[] {
	const rows: PrizeRow[] = [];
	let rank = 0;
	for (const r of [...results].sort((a, b) => a.rank - b.rank)) {
		if (gone(r.metadata) || typeof r.playerId !== 'string' || r.playerId.length === 0) continue;
		rank++;
		const score = Math.floor(r.score + 1e-6);
		const coins = score > 0 ? prize(week, rank) : 0;
		if (coins > 0) rows.push({ board, period, player_id: r.playerId, rank, score, coins });
	}
	return rows;
}
