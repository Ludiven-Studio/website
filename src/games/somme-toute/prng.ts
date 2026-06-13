/**
 * Deterministic PRNG for the daily challenge.
 * Same seed -> same sequence -> same puzzle for everyone on a given day.
 * Never use Math.random for that mode (would break the shared leaderboard).
 */

export type Rng = () => number;

/** mulberry32 — fast, seedable, good-enough distribution for puzzle generation. */
export function mulberry32(seed: number): Rng {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Date -> integer seed (YYYYMMDD in UTC). Defaults to today. */
export function dateSeed(date: Date = new Date()): number {
	const y = date.getUTCFullYear();
	const m = date.getUTCMonth() + 1;
	const d = date.getUTCDate();
	return y * 10000 + m * 100 + d;
}
