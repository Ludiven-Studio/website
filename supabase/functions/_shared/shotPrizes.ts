// shot-prizes' rules, apart so they are tested without a database or Unity (shotPrizes_test.ts).
// Pétanque Game's shooting challenge pays the best places of its Unity Leaderboards rankings: the day's
// best ten, the week's best fifty, less and less down the ranking (owner's call, 2026-11-17). The same table
// as the game's ShotChallenge.DayPrizes / WeekPrizes.

export const DAY_BOARD = 'shots_day';
export const WEEK_BOARD = 'shots_week';

/** (last rank, coins), best first. */
export const DAY_PRIZES: readonly [number, number][] = [[1, 500], [2, 300], [3, 200], [4, 150], [5, 125], [6, 100], [7, 90], [8, 80], [9, 70], [10, 60]];
export const WEEK_PRIZES: readonly [number, number][] = [[1, 2000], [2, 1200], [3, 800], [10, 400], [20, 200], [50, 100]];

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

export const DAY_MS = 86_400_000;

/** A period's first instant and its end (Unity's reset), in ms. */
export function bounds(week: boolean, period: string): { start: number; end: number } {
	const start = Date.parse(period + 'T00:00:00Z');
	return { start, end: start + (week ? 7 : 1) * DAY_MS };
}

/**
 * When the snapshot reads the closing rankings a last time: 10 s before Unity's reset. Unity's Admin API reads only
 * the live ranking (a reset one only if archived, and the game's rankings are not: an archive keeps every name for
 * good), so the last seconds before the reset are never counted; the reading a minute earlier stays the fallback.
 */
export const LAST_READ_MS = 10_000;

/** No reading of a period starts later than this before its end: it could come back from the reset ranking. */
export const READ_MARGIN_MS = 2_000;

/** Whether a reading started at `startedAt` may stand for the period: before the reset, with some margin. */
export function readable(week: boolean, period: string, startedAt: number): boolean {
	const { start, end } = bounds(week, period);
	return startedAt >= start && startedAt < end - READ_MARGIN_MS;
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
