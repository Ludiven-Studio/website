// The dashboard's call to stats-admin (supabase/functions/stats-admin), signed in like /admin/pubs/.
// PUBLIC_STATS_ADMIN_URL, set in dev only, points at a local mock, with a fixed token and no sign-in.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../data/site';
import { accessToken } from './meetupAuth';
import type { Overview } from '../../supabase/functions/_shared/statsAdmin.mjs';

export type { AppStats, Count, Overview } from '../../supabase/functions/_shared/statsAdmin.mjs';

const LOCAL = import.meta.env.PUBLIC_STATS_ADMIN_URL as string | undefined;
export const STATS_URL = LOCAL || `${SUPABASE_URL}/functions/v1/stats-admin`;
export const STATS_LOCAL = !!LOCAL;

export class StatsError extends Error {
	constructor(public status: number, message: string) {
		super(message);
	}
}

export async function overview(refresh = false): Promise<Overview> {
	const token = STATS_LOCAL ? 'local-dev' : await accessToken();
	if (!token) throw new StatsError(401, 'not signed in');
	let res: Response;
	try {
		res = await fetch(STATS_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'overview', refresh }),
		});
	} catch {
		throw new StatsError(0, 'network error');
	}
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new StatsError(res.status, body.error ?? `HTTP ${res.status}`);
	return body as Overview;
}

/** The error in French for the page. */
export function statsMessage(e: unknown): string {
	const err = e instanceof StatsError ? e : new StatsError(0, String(e));
	if (err.status === 403) return "Ce compte n'a pas accès au tableau de bord.";
	if (err.status === 503) return "Le tableau de bord n'est pas encore installé (fonction stats-admin ou ses secrets).";
	if (err.status === 502) return "Umami n'a pas répondu (serveur de statistiques ou identifiants du compte « dashboard »).";
	if (err.status === 404) return "La fonction stats-admin n'est pas encore déployée.";
	if (err.status === 0) return 'Le serveur ne répond pas.';
	return `Refusé : ${err.message}`;
}

/** Totals over every app, for the tiles of /admin/. */
export function totals(o: Overview): { visitors7: number; apps: number; taps28: number; shows28: number } {
	let visitors7 = 0, taps28 = 0, shows28 = 0;
	for (const a of o.apps) {
		visitors7 += a.periods.d7?.visitors ?? 0;
		for (const r of a.ads ?? []) {
			taps28 += r.tap;
			shows28 += r.show;
		}
	}
	return { visitors7, apps: o.apps.length, taps28, shows28 };
}
