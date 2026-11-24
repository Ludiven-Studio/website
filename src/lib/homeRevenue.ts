// The home's Revenus tile: the month's total in euros, net — the ads (LevelPlay, in dollars, at the ECB's rate) plus
// the real in-app purchases the apps saw this month (at the catalogue price, net estimated) — with the ads in
// dollars on the line under it.
import { toEur } from './income';
import { inAppBetween } from './inAppWeek';
import { unityShare } from './adNetworks';
import type { Purchases, Rates, Revenue } from './statsAdmin';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export interface RevenueTile { figure?: string; sub?: string }

/** Each part missing is named on the sub-line, and the figure adds only what is there. Nothing at all: no figure. */
export function revenueTile({ money, rates, seen, now }: { money: Revenue | null; rates: Rates | null; seen: Purchases | null; now: Date }): RevenueTile {
	const monthStart = money?.monthStart ?? `${now.toISOString().slice(0, 7)}-01`;
	const ads = money ? toEur(money.total.month, money.currency, rates) : null;
	const inApp = seen ? inAppBetween(seen, Date.parse(`${monthStart}T00:00:00Z`), now.getTime()).net : null;
	if (ads === null && inApp === null) {
		return money ? { sub: `ce mois · pub ${usd.format(money.total.month)}, taux BCE indisponible` } : {};
	}
	const unity = unityShare(money?.total.networks, 'month');
	const parts = [
		money ? `pub ${usd.format(money.total.month)}${unity === null ? '' : ` dont Unity Ads ${usd.format(unity)}`}${ads === null ? ' (non convertie)' : ''}` : 'pub non relevée',
		inApp === null ? 'achats non relevés' : `achats ≈ ${eur.format(inApp)}`,
	];
	return { figure: eur.format(Math.round(((ads ?? 0) + (inApp ?? 0)) * 100) / 100), sub: `net ce mois · ${parts.join(' · ')}` };
}
