import { describe, expect, it } from 'vitest';
import type { Catalog, CatalogEntry } from '../../supabase/functions/_shared/promoRules.mjs';
import { pendingChanges, pendingLabel } from './promoPending';
import { setWeightIn } from './promoShares';
import { setMix } from './promoMix';

const PG = 'com.ludivenstudio.petanquegame';
const MEET = 'com.ludivenstudio.petanquemeet';
const ad = (id: string, app: string, weights?: CatalogEntry['weights']): CatalogEntry =>
	({ id, title: { fr: id }, text: { fr: '' }, image: '', link: {}, app: [app], groups: [], hideIn: [], weight: 1, ...(weights ? { weights } : {}) }) as CatalogEntry;
const base = (): Catalog => ({
	schema: 1, updated: '2026-11-25T00:00:00Z',
	entries: [ad('pg', PG, { [MEET]: 2 }), ad('meet', MEET, { [MEET]: 1 })],
}) as Catalog;
const copy = (c: Catalog): Catalog => JSON.parse(JSON.stringify(c)) as Catalog;

describe('pendingChanges: what « Tout enregistrer » will send', () => {
	it('counts nothing on an untouched draft, and the label still says something is pending', () => {
		const p = pendingChanges(base(), base());
		expect(p).toEqual({ weights: 0, mix: 0, ads: 0, total: 0 });
		expect(pendingLabel(p)).toBe('Modifications en attente');
	});

	it('counts one row per app and platform, not one per cell, and not as an edit of the ad', () => {
		const draft = copy(base());
		setWeightIn(draft.entries[0], MEET, 'android', 5);
		setWeightIn(draft.entries[1], MEET, 'android', 3);
		expect(pendingChanges(base(), draft)).toMatchObject({ weights: 1, ads: 0, total: 1 });
		setWeightIn(draft.entries[0], MEET, 'ios', 4);
		expect(pendingChanges(base(), draft)).toMatchObject({ weights: 2, total: 2 });
	});

	it('counts each mix row changed, added or removed', () => {
		const draft = copy(base());
		setMix(draft, '*', 'banner', 15);
		setMix(draft, PG, 'interstitial', 20);
		expect(pendingChanges(base(), draft)).toMatchObject({ mix: 2, total: 2 });
		const back = copy(draft);
		setMix(back, PG, 'interstitial', null);
		expect(pendingChanges(draft, back)).toMatchObject({ mix: 1, total: 1 });
	});

	it('counts ads added, removed and edited, and sums everything', () => {
		const draft = copy(base());
		draft.entries[0].title.fr = 'Pétanque Game';
		draft.entries = draft.entries.filter((e) => e.id !== 'meet');
		draft.entries.push(ad('nino', 'com.ludivenstudio.ninorush'));
		const p = pendingChanges(base(), draft);
		expect(p.ads).toBe(3);
		expect(p.total).toBe(p.weights + p.mix + p.ads);
		expect(pendingLabel({ weights: 0, mix: 0, ads: 1, total: 1 })).toBe('1 modification');
		expect(pendingLabel(p)).toBe(`${p.total} modifications`);
	});
});
