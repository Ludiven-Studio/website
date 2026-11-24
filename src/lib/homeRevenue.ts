// The admin home's money lines, read off the same count as /admin/revenus/ (`income`): the Revenus tile is the
// month's net total with its parts, the Statistiques tile's extra line the in-app purchases of the last 7 days.
import { income, periodLine, type Income } from './income';
import type { AppStoreSales, PlayOrders, Purchases, Rates, Revenue } from './statsAdmin';

const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export interface HomeMoney { money: Revenue | null; orders: PlayOrders | null; apple: AppStoreSales | null; seen: Purchases | null; rates: Rates | null; now: Date }

export const homeIncome = (h: HomeMoney): Income =>
	income({ revenue: h.money, orders: h.orders, apple: h.apple, seen: h.seen, rates: h.rates, now: h.now });

/** The Revenus tile: nothing read at all gives no figure. */
export function revenueTile(r: Income): { figure?: string; sub?: string } {
	if (!r.adsPaid && !r.inAppFrom.play && !r.inAppFrom.appstore) return {};
	const m = periodLine(r, 'month');
	return { figure: eur(m.total), sub: `net ce mois · ${m.parts}` };
}

/** The Statistiques tile's in-app line, the last 7 days; `why` when no source answered. */
export function weekLine(r: Income, why: string): string {
	if (!r.inAppFrom.play && !r.inAppFrom.appstore) return `Achats intégrés : ${why}`;
	const w = r.last7;
	return `Achats intégrés · 7 j : ${eur(w.play.net + w.appstore.net)} net (${eur(w.play.gross + w.appstore.gross)} payés)`;
}
