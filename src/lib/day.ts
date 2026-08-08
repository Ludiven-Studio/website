// The one and only definition of "which day it is".
//
// Everything day-shaped — the puzzle seed, the daily-run localStorage keys, the
// leaderboard rows, the streaks, the wallet reward — must agree, otherwise the
// challenge rolls over at three different instants. It used to: the seed and the
// server were on UTC while the local keys were on the device clock, so between
// midnight and 2am (Paris, summer) a French player got a fresh run on yesterday's
// grid with yesterday's leaderboard.
//
// The site is French, so the day is Europe/Paris. Keep the Edge Function
// (supabase/functions/submit-score) on the same zone.

export const CHALLENGE_TZ = 'Europe/Paris';

const parts = new Intl.DateTimeFormat('en-CA', {
	timeZone: CHALLENGE_TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

/** Current challenge day as YYYY-MM-DD, in Europe/Paris. */
export const challengeDay = (d: Date = new Date()): string => {
	const f = parts.formatToParts(d);
	const get = (t: string): string => f.find((p) => p.type === t)?.value ?? '01';
	return `${get('year')}-${get('month')}-${get('day')}`;
};

/** YYYYMMDD as an integer — the PRNG seed input. */
export const challengeDayNumber = (d: Date = new Date()): number => Number(challengeDay(d).replace(/-/g, ''));

/** Days elapsed since 1970-01-01 — a contiguous counter, for content walked day after day. */
export const challengeDayOrdinal = (d: Date = new Date()): number =>
	Math.floor(Date.parse(`${challengeDay(d)}T12:00:00Z`) / 86400000);

/** Day of week of the challenge day (0=Sunday), in Europe/Paris. Noon UTC dodges any DST edge. */
export const challengeWeekday = (d: Date = new Date()): number => new Date(`${challengeDay(d)}T12:00:00Z`).getUTCDay();

/** The YYYY-MM-DD before the given one. */
export const dayBefore = (isoDay: string): string =>
	new Date(Date.parse(`${isoDay}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
