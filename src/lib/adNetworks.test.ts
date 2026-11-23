import { describe, expect, it } from 'vitest';
import { isUnityAds, networkLabel, unityShare } from './adNetworks';
import { revenueSummary } from '../../supabase/functions/_shared/statsAdmin.mjs';

const net = (network: string, month: number, last30 = month) => ({ network, name: network, month, last30 });

describe('Unity Ads in the revenue report', () => {
	it.each(['unityAds', 'UnityAds', 'Unity Ads', 'unity', 'Unity Ads Bidding', 'unity_ads', 'UNITY-ADS', 'Unity Ads - rewarded'])('counts « %s » as Unity Ads', (spelling) => {
		expect(isUnityAds(net(spelling, 1))).toBe(true);
	});

	it.each(['ironSource', 'ironSourceExchange', 'meta', 'googleAdMob', '?'])('leaves « %s » out', (spelling) => {
		expect(isUnityAds(net(spelling, 1))).toBe(false);
	});

	it('adds up every Unity spelling, per period, and has no share without a split', () => {
		const networks = [net('unityAds', 1.2, 1.3), net('Unity Ads Bidding', 0.65, 0.7), net('ironSource', 0.1)];
		expect(unityShare(networks, 'month')).toBe(1.85);
		expect(unityShare(networks, 'last30')).toBe(2);
		expect(unityShare(undefined, 'month')).toBeNull();
	});

	it('finds Unity whatever field LevelPlay names the network in', () => {
		const now = new Date('2026-11-23T15:00:00Z');
		for (const field of ['networkName', 'adNetwork', 'network', 'adSource', 'adSourceName', 'providerName', 'instanceName']) {
			const r = revenueSummary([{ date: '2026-11-20', appName: 'Pétanque Game', [field]: 'Unity Ads', revenue: 1.5 }], now);
			expect(unityShare(r.total.networks, 'month')).toBe(1.5);
		}
	});

	it('names the report fields, so a network field under another name shows', () => {
		const r = revenueSummary([{ date: '2026-11-20', appName: 'Nino Rush', mediationNetwork: 'unityAds', revenue: 1 }], new Date('2026-11-23T15:00:00Z'));
		expect(r.fields).toEqual(['appName', 'date', 'mediationNetwork', 'revenue']);
		expect(r.total.networks).toEqual([{ network: '?', name: '?', month: 1, last30: 1 }]);
	});

	it('labels a network with its raw LevelPlay spelling', () => {
		expect(networkLabel({ network: 'unityAds' })).toBe('unityAds');
		expect(networkLabel({ network: 'Unity Ads Bidding' })).toBe('Unity Ads Bidding');
		expect(networkLabel({ network: '?' })).toBe('sans régie dans le relevé');
	});
});
