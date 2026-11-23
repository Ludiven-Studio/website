// The ad networks of the LevelPlay report as the admin pages read them. LevelPlay's spelling of a network varies
// (unityAds, Unity Ads, UnityAds Bidding, an instance name), so Unity Ads is any name holding « unity ».
import type { RevenueNetwork } from './statsAdmin';

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function isUnityAds(n: Pick<RevenueNetwork, 'network' | 'name'>): boolean {
	return squash(`${n.network} ${n.name}`).includes('unity');
}

/** Unity Ads' share of a period over every network spelled as Unity; null when the report has no split. */
export function unityShare(networks: RevenueNetwork[] | undefined, period: 'month' | 'last30'): number | null {
	if (!networks) return null;
	return Math.round(networks.filter(isUnityAds).reduce((s, n) => s + n[period], 0) * 100) / 100;
}

/** The label under « Par régie »: LevelPlay's own spelling, so a name the page does not know shows as it is. */
export function networkLabel(n: Pick<RevenueNetwork, 'network'>): string {
	return n.network === '?' ? 'sans régie dans le relevé' : n.network;
}
