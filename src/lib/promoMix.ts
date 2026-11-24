// The admin's house-ad mix table (/admin/pubs/): what each app does per format, as the apps resolve "mix" (the app's
// row, then "*", then their code's value), and the edits that keep the catalogue's "mix" minimal.
import { MIX_DEFAULTS, MIX_NO_CONSENT, type Catalog, type MixCase, type MixFormat } from '../../supabase/functions/_shared/promoRules.mjs';

export const ALL_APPS = '*';

export interface MixValue {
	value: number;
	/** row: set on this row; all: from "*"; code: the apps' own value, nothing set. */
	from: 'row' | 'all' | 'code';
}

const valid = (v: unknown, c: MixCase): v is number =>
	typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 && (c === 'consent' || v === MIX_NO_CONSENT);

/** The % of house ads an app uses for one format and consent case; `row` is "*" or a base app id. */
export function mixValue(catalog: Catalog, row: string, format: MixFormat, c: MixCase = 'consent'): MixValue {
	// A broken row (null, a number) reads as nothing set: the apps ignore it the same way.
	const at = (r: string) => {
		const formats = Object.hasOwn(catalog.mix ?? {}, r) ? catalog.mix![r] : undefined;
		const cases = formats && typeof formats === 'object' ? formats[format] : undefined;
		return cases && typeof cases === 'object' ? cases[c] : undefined;
	};
	const own = at(row);
	if (valid(own, c)) return { value: own, from: 'row' };
	const all = row === ALL_APPS ? undefined : at(ALL_APPS);
	if (valid(all, c)) return { value: all, from: 'all' };
	return { value: c === 'noConsent' ? MIX_NO_CONSENT : MIX_DEFAULTS[format], from: 'code' };
}

/** Sets or clears (null) one consent value; empty formats, rows and "mix" itself are removed. */
export function setMix(catalog: Catalog, row: string, format: MixFormat, value: number | null, c: MixCase = 'consent'): void {
	const mix = { ...(catalog.mix ?? {}) };
	const formats = { ...(Object.hasOwn(mix, row) ? mix[row] : {}) };
	const cases = { ...(formats[format] ?? {}) };
	if (value === null) delete cases[c];
	else cases[c] = Math.round(Math.min(100, Math.max(0, value)));
	if (Object.keys(cases).length) formats[format] = cases;
	else delete formats[format];
	if (Object.keys(formats).length) mix[row] = formats;
	else delete mix[row];
	if (Object.keys(mix).length) catalog.mix = mix;
	else delete catalog.mix;
}

/** The app rows "mix" holds, besides "*": the form shows them even for an app that no longer shows house ads. */
export const mixRows = (catalog: Catalog): string[] => Object.keys(catalog.mix ?? {}).filter((r) => r !== ALL_APPS);
