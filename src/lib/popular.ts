// The catalogue's « Top 5 »: games ranked by their game_scores rows (one per player and day for a
// daily) over the last weeks. Read once at build time, so the page itself makes no request.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../data/site';
import { DAILY_LB } from '../data/dailyLb';

export interface PlayRow {
	game_id: string;
}

/** The window of the catalogue's Top, shown in its header. */
export const POPULAR_DAYS = 30;

// PostgREST answers 1000 rows at most per request.
const PAGE = 1000;

// A few games log their daily under `<id>-t`.
const CATALOGUE_ID: Record<string, string> = Object.fromEntries(
	Object.entries(DAILY_LB).flatMap(([id, cfg]) => (cfg.lbId ? [[cfg.lbId, id]] : [])),
);

/** Catalogue ids, most played first. Games nobody played are left out; ties keep `known`'s order. */
export function rankPlayed(rows: PlayRow[], known: string[]): string[] {
	const count = new Map<string, number>();
	for (const r of rows) {
		const id = CATALOGUE_ID[r.game_id] ?? r.game_id;
		if (known.includes(id)) count.set(id, (count.get(id) ?? 0) + 1);
	}
	return known.filter((id) => count.has(id)).sort((a, b) => count.get(b)! - count.get(a)!);
}

const reads = new Map<number, Promise<PlayRow[] | null>>();

/** The `count` most played of `ids` over the last `days` days, [] when Supabase can't be reached.
 *  The pages of one build share one read. */
export async function topPlayed(ids: string[], count: number, days: number): Promise<string[]> {
	if (!reads.has(days)) reads.set(days, fetchPlayRows(days));
	const rows = await reads.get(days)!;
	if (!rows) console.warn('[popular] game_scores unreachable: no « Top » in this build');
	return rankPlayed(rows ?? [], ids).slice(0, count);
}

/** Every row of the last `days` days, or null when Supabase can't be reached. */
export async function fetchPlayRows(days: number, now: Date = new Date()): Promise<PlayRow[] | null> {
	const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
	const rows: PlayRow[] = [];
	try {
		for (let offset = 0; ; offset += PAGE) {
			const res = await fetch(
				`${SUPABASE_URL}/rest/v1/game_scores?challenge_date=gte.${since}&select=game_id&order=id&limit=${PAGE}&offset=${offset}`,
				{ headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }, signal: AbortSignal.timeout(10_000) },
			);
			// 416: the offset went past the last row, which a full last page leads to.
			if (res.status === 416) return rows;
			if (!res.ok) return null;
			const page: PlayRow[] = await res.json();
			rows.push(...page);
			if (page.length < PAGE) return rows;
		}
	} catch {
		return null;
	}
}
