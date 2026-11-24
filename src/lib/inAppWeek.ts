// The home tile's in-app figure: the purchases the apps saw (iap_result, as the stats page's « Derniers achats »
// table lists them), real ones only, at the catalogue price in France. The stores' own reports lag by days and
// need their keys, so they stay on /admin/revenus/.
import { COUNTED_KINDS, PRODUCTS, type Purchases } from './statsAdmin';

const WEEK = 7 * 86_400_000;
/** French VAT out, then the store's 15 %: an estimate, the buyers' countries and the stores' cuts vary. */
export const NET_SHARE = (1 / 1.2) * 0.85;

/** A product's catalogue price in euros, the first one written (« 4,99 € (3,99 € au lancement) » is 4.99). */
export function cataloguePrice(item: string): number | null {
	if (!Object.hasOwn(PRODUCTS, item)) return null;
	const m = /(\d+),(\d{2})/.exec(PRODUCTS[item].price);
	return m ? Number(`${m[1]}.${m[2]}`) : null;
}

export interface InAppWeek { count: number; gross: number; net: number; unpriced: number }

/** The real purchases of the last 7 days, rolling, up to `now`. */
export function inAppWeek(p: Purchases, now: Date): InAppWeek {
	const since = now.getTime() - WEEK;
	let count = 0, gross = 0, unpriced = 0;
	for (const b of p.purchases) {
		const t = Date.parse(b.at);
		if (!COUNTED_KINDS.includes(b.kind) || !(t >= since && t <= now.getTime())) continue;
		count++;
		const price = cataloguePrice(b.item);
		if (price === null) unpriced++;
		else gross += price;
	}
	gross = Math.round(gross * 100) / 100;
	return { count, gross, net: Math.round(gross * NET_SHARE * 100) / 100, unpriced };
}
