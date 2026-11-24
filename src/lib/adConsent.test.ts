import { describe, expect, it } from 'vitest';
import { consentTable } from './adConsent';
import type { AppStats, Consent } from './statsAdmin';

const app = (id: string, name: string, domain: string, consent: Consent | null | undefined, visitors = 100): AppStats => ({
	id, name, domain, consent, events: null, hosts: null, ads: null, retention: null, errors: [],
	periods: { d1: null, d7: null, d28: { visitors, visits: visitors, pageviews: 0 } },
	purchases: { items: null, results: null }, signIn: { providers: null, results: null },
});
const c = (pairs: [string, number][]) => pairs.map(([key, count]) => ({ key, count }));

describe('the ad consent card', () => {
	it('gives each platform its accept and refuse shares, and the launches still unasked', () => {
		const t = consentTable([app('w-pg', 'Pétanque Game', 'com.ludivenstudio.petanquegame', {
			answers: c([['yes', 30], ['no', 10]]), opens: c([['yes', 100], ['unasked', 50]]),
			platforms: [
				{ platform: 'android', visitors: 40, answers: c([['yes', 24], ['no', 6]]), opens: c([['yes', 60], ['no', 10], ['unasked', 30]]) },
				{ platform: 'ios', visitors: 20, answers: c([['yes', 6], ['no', 4]]), opens: [] },
			],
		})]);
		expect(t.rows.map((r) => [r.platform, r.yes, r.no, r.accept, r.refuse])).toEqual([['android', 24, 6, 0.8, 0.2], ['ios', 6, 4, 0.6, 0.4]]);
		expect(t.rows[0].none).toEqual({ kind: 'exact', rate: 0.3, launches: 100 });
		// No launch state on that platform: the visitors who gave no answer in the period, as an estimate.
		expect(t.rows[1].none).toEqual({ kind: 'estimate', rate: 0.5, visitors: 20 });
	});

	it('shows both platforms together when Umami could not split them', () => {
		const t = consentTable([app('w-dg', "Dragon's Gems", 'com.ludivenstudio.dragonsgems', { answers: c([['yes', 3], ['no', 1]]), opens: [], platforms: null }, 10)]);
		expect(t.rows).toHaveLength(1);
		expect(t.rows[0]).toMatchObject({ platform: null, accept: 0.75, none: { kind: 'estimate', rate: 0.6, visitors: 10 } });
	});

	it('never estimates below zero, and has no share without an answer', () => {
		const t = consentTable([
			app('a', 'A', 'com.ludivenstudio.a', { answers: c([['yes', 12]]), opens: null, platforms: null }, 5),
			app('b', 'B', 'com.ludivenstudio.b', { answers: [], opens: c([['unasked', 4]]), platforms: null }, 5),
		]);
		expect(t.rows[0].none).toEqual({ kind: 'estimate', rate: 0, visitors: 5 });
		expect(t.rows[1]).toMatchObject({ accept: null, refuse: null, none: { kind: 'exact', rate: 1, launches: 4 } });
	});

	it('lists the apps without a consent event apart, and leaves the website out', () => {
		const t = consentTable([
			app('n', 'Nino Rush', 'com.ludivenstudio.ninorush', { answers: [], opens: [], platforms: null }),
			app('d', 'Dominoland', 'com.ludivenstudio.dominoland', undefined),
			app('s', 'Site', 'www.ludiven-studio.fr', { answers: [], opens: [], platforms: null }),
			app('s2', 'Site 2', 'ludiven-studio.fr', null),
		]);
		expect(t).toEqual({ rows: [], silent: ['Nino Rush'], unread: ['Dominoland'] });
	});

	it('puts the apps with the most answers first, their platforms together', () => {
		const one = (yes: number): Consent => ({ answers: c([['yes', yes]]), opens: [], platforms: [
			{ platform: 'android', visitors: 9, answers: c([['yes', yes - 1]]), opens: [] },
			{ platform: 'ios', visitors: 9, answers: c([['yes', 1]]), opens: [] },
		] });
		const t = consentTable([app('a', 'A', 'com.x.a', one(3)), app('b', 'B', 'com.x.b', one(9))]);
		expect(t.rows.map((r) => `${r.app} ${r.platform}`)).toEqual(['B android', 'B ios', 'A android', 'A ios']);
	});
});
