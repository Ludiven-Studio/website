// The dashboard's call to stats-admin (supabase/functions/stats-admin), signed in like /admin/pubs/.
// PUBLIC_STATS_ADMIN_URL, set in dev only, points at a local mock, with a fixed token and no sign-in.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../data/site';
import { accessToken } from './meetupAuth';
import type { Board, Overview, PurchaseKind, Purchases, Revenue } from '../../supabase/functions/_shared/statsAdmin.mjs';
import type { PlayOrders } from '../../supabase/functions/_shared/playSales.mjs';

export type { PlayOrder, PlayOrders, PlayTotal } from '../../supabase/functions/_shared/playSales.mjs';
export type { AppStats, Board, BoardApp, Count, Overview, Purchase, PurchaseKind, Purchases, Revenue, RevenueApp, RevenueDay, RevenueNetwork } from '../../supabase/functions/_shared/statsAdmin.mjs';

const LOCAL = import.meta.env.PUBLIC_STATS_ADMIN_URL as string | undefined;
export const STATS_URL = LOCAL || `${SUPABASE_URL}/functions/v1/stats-admin`;
export const STATS_LOCAL = !!LOCAL;

export class StatsError extends Error {
	constructor(public status: number, message: string) {
		super(message);
	}
}

export function overview(refresh = false): Promise<Overview> {
	return call<Overview>({ action: 'overview', refresh });
}

/** The purchases that went through over the last 30 days, newest first (Umami's iap_result events). */
export function purchases(refresh = false): Promise<Purchases> {
	return call<Purchases>({ action: 'purchases', refresh });
}

/** The apps' paid products by the short id their iap_result events carry, with the catalogue price in France
 *  (the apps' Shop catalogues and docs/store.md), not what the buyer paid in their own currency. */
export const PRODUCTS: Record<string, { name: string; price: string }> = {
	hearts: { name: 'Cœurs illimités', price: '6,99 €' },
	coins1: { name: '2 000 pièces', price: '1,99 €' },
	coins2: { name: '6 000 pièces', price: '4,99 €' },
	coins3: { name: '15 000 pièces', price: '9,99 €' },
	coins_s: { name: '1 000 pièces', price: '0,99 €' },
	coins_m: { name: '3 000 pièces', price: '2,49 €' },
	coins_l: { name: '8 000 pièces', price: '4,99 €' },
	no_ads: { name: 'Sans publicité', price: '2,99 €' },
	full: { name: "L'aventure complète", price: '4,99 € (3,99 € au lancement)' },
	wardrobe: { name: 'Le grand dressing', price: '1,99 €' },
	premium: { name: 'Premium (Pétanque Scan)', price: '9,99 €' },
};

export const STORES: Record<string, string> = { play: 'Google Play', appstore: 'App Store' };

export const KINDS: Record<PurchaseKind, string> = {
	real: 'réel', unchecked: 'réel (non vérifié)', tester: 'testeur', promo: 'promo', dev: 'simulé', beta: 'simulé (bêta)',
};
/** The kinds the page counts and shows by default. */
export const COUNTED_KINDS: readonly PurchaseKind[] = ['real', 'unchecked'];

/** Google Play's orders of the last 30 days with their real price (the Play Console's sales reports). */
export function playOrders(refresh = false): Promise<PlayOrders> {
	return call<PlayOrders>({ action: 'orders', refresh });
}

/** The studio board of /admin/versions/. */
export function board(): Promise<Board> {
	return call<Board>({ action: 'board' });
}

/** The ad revenue of /admin/revenus/ (LevelPlay), cached an hour unless refresh. */
export function revenue(refresh = false): Promise<Revenue> {
	return call<Revenue>({ action: 'revenue', refresh });
}

async function call<T>(payload: Record<string, unknown>): Promise<T> {
	const token = STATS_LOCAL ? 'local-dev' : await accessToken();
	if (!token) throw new StatsError(401, 'not signed in');
	let res: Response;
	try {
		res = await fetch(STATS_URL, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});
	} catch {
		throw new StatsError(0, 'network error');
	}
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new StatsError(res.status, body.error ?? `HTTP ${res.status}`);
	return body as T;
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
