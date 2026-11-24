import { describe, expect, it } from 'vitest';
import { checkCatalog, checkMix } from '../../supabase/functions/_shared/promoRules.mjs';
import type { Catalog } from '../../supabase/functions/_shared/promoRules.mjs';
import { ALL_APPS, mixRows, mixValue, setMix } from './promoMix';

const PG = 'com.ludivenstudio.petanquegame';
const catalog = (mix?: unknown): Catalog => ({ schema: 1, updated: '2026-11-25T00:00:00Z', entries: [], ...(mix === undefined ? {} : { mix }) }) as Catalog;

describe('checkMix: the rules LudivenTools reads (HouseMix.cs)', () => {
	it('accepts "*" and base ids, both formats, 0 and 100, and noConsent at 100', () => {
		expect(checkMix({ '*': { banner: { consent: 8, noConsent: 100 }, interstitial: { consent: 0 } }, [PG]: { banner: { consent: 100 } }, 'com.raphbenpro.petanquear': {} })).toEqual([]);
		expect(checkCatalog(catalog({ '*': { banner: { consent: 15 } } })).problems).toEqual([]);
		expect(checkCatalog(catalog()).problems).toEqual([]);
	});

	it('refuses a mix or a row that is not an object', () => {
		for (const m of [null, [], 8, 'x']) expect(checkMix(m)).toEqual(['mix is not an object of rows']);
		expect(checkMix({ '*': [8] })).toEqual(['mix: "*" is not an object of formats']);
		expect(checkMix({ '*': null })).toEqual(['mix: "*" is not an object of formats']);
		expect(checkMix({ '*': { banner: 8 } })).toEqual(['mix: "*"."banner" is not an object of consent cases']);
	});

	it('refuses a row that is neither "*" nor a base app id: test builds, capitals, junk', () => {
		const rows = [`${PG}.dev`, `${PG}.beta`, 'Com.Ludiven.App', 'all', '', 'com..x', '__proto__'];
		// Through JSON, as the catalogue arrives: "__proto__" stays a plain key.
		expect(checkMix(JSON.parse(JSON.stringify(Object.fromEntries(rows.map((r) => [r, {}])))))).toHaveLength(rows.length);
		expect(checkMix(JSON.parse('{"__proto__":{"banner":{"consent":5}}}'))).toEqual(['mix: "__proto__" is neither "*" nor a base app id']);
	});

	it('refuses an unknown format or case: typos never pass', () => {
		expect(checkMix({ '*': { baner: { consent: 8 }, rewarded: { consent: 1 } } })).toHaveLength(2);
		expect(checkMix({ '*': { banner: { concent: 8, none: 100 } } })).toHaveLength(2);
	});

	it('refuses values the apps would ignore, and decimals the admin never writes', () => {
		for (const v of [-1, 100.5, 101, 7.5, '8', null, true, [8], Infinity, NaN])
			expect(checkMix({ '*': { banner: { consent: v } } }), String(v)).toEqual(['mix: "*"."banner"."consent" is not a whole number from 0 to 100']);
	});

	it('keeps noConsent at 100 until Raphaël decides otherwise', () => {
		expect(checkMix({ '*': { banner: { noConsent: 50 } } })).toEqual(['mix: "*"."banner"."noConsent" must stay 100: without consent the apps show house ads only']);
		expect(checkCatalog(catalog({ [PG]: { interstitial: { noConsent: 0 } } })).problems).toHaveLength(1);
	});
});

describe('mixValue: what an app uses, as the apps resolve it', () => {
	it('takes the app row, then "*", then the code value', () => {
		const c = catalog({ '*': { banner: { consent: 20 } }, [PG]: { interstitial: { consent: 5 } } });
		expect(mixValue(c, PG, 'interstitial')).toEqual({ value: 5, from: 'row' });
		expect(mixValue(c, PG, 'banner')).toEqual({ value: 20, from: 'all' });
		expect(mixValue(c, ALL_APPS, 'interstitial')).toEqual({ value: 0, from: 'code' });
		expect(mixValue(catalog(), PG, 'banner')).toEqual({ value: 8, from: 'code' });
		expect(mixValue(catalog(), PG, 'banner', 'noConsent')).toEqual({ value: 100, from: 'code' });
	});

	it('skips a broken value, value by value, like the apps', () => {
		const c = catalog({ '*': { banner: { consent: 30 } }, [PG]: { banner: { consent: 250 } }, 'com.x.y': null });
		expect(mixValue(c, PG, 'banner')).toEqual({ value: 30, from: 'all' });
		expect(mixValue(c, 'com.x.y', 'banner')).toEqual({ value: 30, from: 'all' });
		expect(mixValue(catalog({ '*': { banner: { noConsent: 40 } } }), PG, 'banner', 'noConsent')).toEqual({ value: 100, from: 'code' });
	});
});

describe('setMix: edits that keep "mix" minimal', () => {
	it('writes whole numbers in range, and removes what empties', () => {
		const c = catalog();
		setMix(c, PG, 'banner', 12.4);
		setMix(c, ALL_APPS, 'interstitial', 150);
		expect(c.mix).toEqual({ [PG]: { banner: { consent: 12 } }, '*': { interstitial: { consent: 100 } } });
		expect(mixRows(c)).toEqual([PG]);
		setMix(c, PG, 'banner', null);
		setMix(c, ALL_APPS, 'interstitial', null);
		expect('mix' in c).toBe(false);
		expect(checkCatalog(c).problems).toEqual([]);
	});

	it('leaves the other formats and cases of a row alone', () => {
		const c = catalog({ [PG]: { banner: { consent: 9, noConsent: 100 }, interstitial: { consent: 3 } } });
		setMix(c, PG, 'banner', null);
		expect(c.mix).toEqual({ [PG]: { banner: { noConsent: 100 }, interstitial: { consent: 3 } } });
	});
});
