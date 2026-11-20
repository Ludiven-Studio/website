import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { groupsOf, isWeighted, shares, showingApps, weightIn, type ShareContext } from './promoShares';
import type { Catalog, CatalogEntry } from '../../supabase/functions/_shared/promoRules.mjs';

const PG = 'com.ludivenstudio.petanquegame';
const MEET = 'com.ludivenstudio.petanquemeet';
const DG = 'com.ludivenstudio.dragonsgems';
const DOMINO = 'com.ludivenstudio.dominoland';

const entry = (id: string, app: string | null, groups: string[], over: Partial<CatalogEntry> = {}): CatalogEntry => ({
	id,
	title: { fr: id },
	image: `img/${id}.png`,
	clips: { fr: `clips/${id}.mp4` },
	link: { android: app ?? 'com.x.y', ios: '1' },
	...(app ? { app: [app], hideIn: [app] } : {}),
	groups,
	...over,
});
const cat = (entries: CatalogEntry[]): Catalog => ({ schema: 1, updated: '2026-11-20T00:00:00Z', entries });
const base = () => [
	entry('meet', MEET, ['petanque']),
	entry('game', PG, ['petanque']),
	entry('dragon', DG, ['games']),
];
const android: ShareContext = { platform: 'android', spot: 'banner', now: new Date('2026-11-20T12:00:00Z') };
const pct = (c: Catalog, app: string, ctx = android) =>
	Object.fromEntries(shares(c, app, ctx).rows.map((r) => [r.id, Math.round(r.share * 1000) / 10]));
const state = (c: Catalog, app: string, ctx = android) => Object.fromEntries(shares(c, app, ctx).rows.map((r) => [r.id, r.state]));

describe('group mode, as the apps draw today', () => {
	it('shows the own group first, the other only when nothing else is left', () => {
		expect(pct(cat(base()), PG)).toEqual({ meet: 100, game: 0, dragon: 0 });
		expect(state(cat(base()), PG)).toEqual({ meet: 'shown', game: 'self', dragon: 'later' });
	});

	it('falls back to the other group when the own one is installed (Android only)', () => {
		const installed = new Set(['meet']);
		expect(pct(cat(base()), PG, { ...android, installed })).toEqual({ meet: 0, game: 0, dragon: 100 });
		expect(pct(cat(base()), PG, { ...android, platform: 'ios', installed })).toEqual({ meet: 100, game: 0, dragon: 0 });
	});

	it('takes every group for an app with no entry, or one in both groups', () => {
		expect(groupsOf(cat(base()), DOMINO)).toEqual([]);
		expect(pct(cat(base()), DOMINO)).toEqual({ meet: 33.3, game: 33.3, dragon: 33.3 });
		const both = base().map((e) => (e.id === 'game' ? { ...e, groups: ['petanque', 'games'] } : e));
		expect(pct(cat(both), PG)).toEqual({ meet: 50, game: 0, dragon: 50 });
	});

	it('splits by weight, and a weight of 0 or a missing link leaves an entry out', () => {
		const e = base();
		e.push(entry('scan', 'com.raphbenpro.petanquear', ['petanque'], { weight: 3 }));
		expect(pct(cat(e), PG)).toEqual({ meet: 25, game: 0, dragon: 0, scan: 75 });
		e[0].weight = 0;
		expect(state(cat(e), PG).meet).toBe('off');
		e[3].link = { android: 'com.raphbenpro.petanquear' };
		expect(pct(cat(e), PG, { ...android, platform: 'ios' }).dragon).toBe(100);
	});

	it('keeps the video for entries with clips, and an entry within its dates', () => {
		const e = base();
		e[0].clips = undefined;
		expect(state(cat(e), PG, { ...android, spot: 'video' }).meet).toBe('out');
		e[0].clips = { fr: 'x.mp4' };
		e[0].end = '2026-11-20';
		expect(shares(cat(e), PG, android).rows[0].reason).toBe('hors de ses dates');
	});
});

describe('weighted mode', () => {
	it('drops the group order once the app is named in any weights', () => {
		const e = base();
		e[2].weights = { [PG]: 1 };
		expect(isWeighted(cat(e), PG)).toBe(true);
		expect(isWeighted(cat(e), MEET)).toBe(false);
		expect(pct(cat(e), PG)).toEqual({ meet: 50, game: 0, dragon: 50 });
		expect(pct(cat(e), MEET)).toEqual({ meet: 0, game: 100, dragon: 0 });
	});

	it('reads weights[app], else weight, and 0 turns an entry off in that app only', () => {
		const e = base();
		e[0].weight = 2;
		e[0].weights = { [PG]: 0, [DG]: 6 };
		e[2].weights = { [PG]: 3 };
		expect(weightIn(e[0], PG, true)).toBe(0);
		expect(state(cat(e), PG).meet).toBe('off');
		expect(pct(cat(e), PG)).toEqual({ meet: 0, game: 0, dragon: 100 });
		expect(pct(cat(e), DG)).toEqual({ meet: 85.7, game: 14.3, dragon: 0 });
		expect(pct(cat(e), MEET)).toEqual({ meet: 0, game: 100, dragon: 0 });
	});

	it('reads a test build under its base id, and that exact key only', () => {
		const e = base();
		e[0].weights = { [PG]: 2, [`${PG}.dev`]: 0, 'com.ludivenstudio': 5 };
		expect(weightIn(e[0], `${PG}.dev`, true)).toBe(2);
		expect(weightIn(e[0], `${PG}.beta`, true)).toBe(2);
		expect(weightIn(e[0], PG, true)).toBe(2);
		expect(weightIn(e[0], `${PG}.other`, true)).toBe(1);
		expect(isWeighted(cat(e), `${PG}.beta`)).toBe(true);
		expect(isWeighted(cat(e), DG)).toBe(false);
	});

	it('still puts an installed app last', () => {
		const e = base();
		e[2].weights = { [PG]: 1 };
		expect(pct(cat(e), PG, { ...android, installed: new Set(['dragon']) })).toEqual({ meet: 100, game: 0, dragon: 0 });
	});

	it.each([
		['an empty key', { '': 5 }],
		['a bare word', { petanque: 5 }],
		['a prototype key', JSON.parse('{"__proto__": 5}')],
		['an array', [5]],
		['null', null],
	])('ignores %s instead of weighting every app', (_, weights) => {
		const e = base();
		e[2].weights = weights as Record<string, number>;
		expect(isWeighted(cat(e), PG)).toBe(false);
		expect(pct(cat(e), PG)).toEqual({ meet: 100, game: 0, dragon: 0 });
	});

	it.each([[-1], [NaN], [Infinity], ['3'], [null]])('reads a hostile weight %j as 0, never a negative share', (w) => {
		const e = base();
		e[2].weights = { [PG]: w as number };
		expect(weightIn(e[2], PG, true)).toBe(0);
		expect(pct(cat(e), PG)).toEqual({ meet: 100, game: 0, dragon: 0 });
	});

	it('gives every share 0 rather than NaN when nothing is left', () => {
		const e = base().map((x) => ({ ...x, weight: 0 }));
		expect(Object.values(pct(cat(e), DOMINO))).toEqual([0, 0, 0]);
	});
});

describe('the catalogue online', () => {
	const live = JSON.parse(readFileSync('public/promo/v1/catalog.json', 'utf8')) as Catalog;

	it('lists the apps the catalogue advertises, then the others asked for', () => {
		expect(showingApps(live, [DOMINO])).toEqual([MEET, PG, 'com.raphbenpro.petanquear', DG, 'com.ludivenstudio.ninorush', DOMINO]);
	});

	it('sums to 100 % in every app that draws something', () => {
		for (const app of showingApps(live, [DOMINO]))
			for (const platform of ['android', 'ios'] as const)
				for (const spot of ['banner', 'video'] as const) {
					const total = shares(live, app, { platform, spot }).rows.reduce((s, r) => s + r.share, 0);
					expect(total).toBeCloseTo(1, 9);
				}
	});
});
