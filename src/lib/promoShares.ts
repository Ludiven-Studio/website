// How often each house ad comes up in a given app: the apps' draw (LudivenTools, ExternalTools/HouseAds:
// HousePicker.cs) replayed on the catalogue, for the admin's weights table.
import type { Catalog, CatalogEntry } from '../../supabase/functions/_shared/promoRules.mjs';

export type Platform = 'android' | 'ios';
export type Spot = 'banner' | 'video';

export interface ShareContext {
	platform: Platform;
	spot: Spot;
	/** Ids of the entries whose app is on the phone. Android only: iOS cannot tell. */
	installed?: ReadonlySet<string>;
	now?: Date;
}

/** shown: drawn, with `share` of the draws. later: drawn only once the entries before it are gone. */
export type ShareState = 'shown' | 'later' | 'self' | 'off' | 'out';

export interface Share {
	id: string;
	state: ShareState;
	weight: number;
	share: number;
	/** Why it is out, in French for the page. */
	reason?: string;
}

export interface AppShares {
	weighted: boolean;
	rows: Share[];
}

// An empty or odd id would cover every app: only real app ids count (the build refuses the others).
const APP_ID = /^[A-Za-z]\w*(\.[A-Za-z]\w*)+$/;
const matches = (appId: string, id: string): boolean => APP_ID.test(id) && appId.startsWith(id);

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s !== '') : []);

/** The id the apps look up in `weights`: without a ".dev" or ".beta" ending (HousePicker.BaseAppId). */
export const baseAppId = (appId: string): string => appId.replace(/\.(dev|beta)$/, '');

/** The key of `weights` the app reads: its base id, exactly. */
export function weightKey(entry: CatalogEntry, appId: string): string | undefined {
	const id = baseAppId(appId);
	return isObject(entry.weights) && APP_ID.test(id) && Object.hasOwn(entry.weights, id) ? id : undefined;
}

/** An app named in any entry's weights draws by those weights and drops the group order. */
export function isWeighted(catalog: Catalog, appId: string): boolean {
	return (catalog.entries ?? []).some((e) => weightKey(e, appId) !== undefined);
}

const plain = (w: unknown): number => (typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : 0);

/** The weight an entry's `weights` value gives on the platform: a number counts on both, { android, ios } on its own;
 *  undefined when it says nothing for this platform (the entry then takes `weight`). */
export function platformWeight(value: unknown, platform: Platform): number | undefined {
	if (isObject(value)) return Object.hasOwn(value, platform) ? plain(value[platform]) : undefined;
	return plain(value);
}

/** The entry's weight in the app on the platform: its weights' when the app is weighted and named there, else `weight` (1 when absent). */
export function weightIn(entry: CatalogEntry, appId: string, weighted: boolean, platform: Platform): number {
	const key = weighted ? weightKey(entry, appId) : undefined;
	const own = key !== undefined ? platformWeight((entry.weights as Record<string, unknown>)[key], platform) : undefined;
	if (own !== undefined) return own;
	return entry.weight === undefined ? 1 : plain(entry.weight);
}

/** Sets the entry's weight in the app on one platform, keeping the other: a number when both match, so the app
 *  versions that read numbers only keep the entry; { android, ios } when they differ. */
export function setWeightIn(entry: CatalogEntry, appId: string, platform: Platform, weight: number): void {
	const other: Platform = platform === 'android' ? 'ios' : 'android';
	const keep = weightIn(entry, appId, true, other);
	const id = baseAppId(appId);
	const w = Math.max(0, Number.isFinite(weight) ? weight : 0);
	entry.weights = { ...(entry.weights ?? {}), [id]: w === keep ? w : platform === 'android' ? { android: w, ios: keep } : { android: keep, ios: w } };
}

/** True when a weights value differs between platforms: the app versions that read numbers only drop that entry. */
export const perPlatform = (entry: CatalogEntry): boolean => isObject(entry.weights) && Object.values(entry.weights).some(isObject);

/** True when the app never shows the entry: its `app` ids (its own ad) and its `hideIn` ids, with or without `app`
 * (Raphaël, 2026-11-26), as the apps' HousePicker.IsHiddenIn. */
export function hiddenIn(entry: CatalogEntry, appId: string): boolean {
	return [...strings(entry.app), ...strings(entry.hideIn)].some((id) => matches(appId, id));
}

/** The groups of the entry that advertises the app, by `app` only; none when it has no entry. */
export function groupsOf(catalog: Catalog, appId: string): string[] {
	const own = (catalog.entries ?? []).find((e) => strings(e.app).some((id) => matches(appId, id)));
	return own ? strings(own.groups) : [];
}

function inGroups(entry: CatalogEntry, groups: string[]): boolean {
	const mine = strings(entry.groups);
	return groups.length === 0 || mine.length === 0 || mine.some((g) => groups.includes(g));
}

function inSpot(entry: CatalogEntry, spot: Spot): boolean {
	const clips = isObject(entry.clips) && Object.keys(entry.clips).length > 0;
	if (!Array.isArray(entry.spots)) return spot === 'banner' || clips;
	return entry.spots.includes(spot) && (spot === 'banner' || clips);
}

function hasLink(entry: CatalogEntry, platform: Platform): boolean {
	const link = isObject(entry.link) ? entry.link : {};
	if (link.web) return true;
	return platform === 'android' ? !!link.android : !!link.ios;
}

function datesOk(entry: CatalogEntry, now: Date): boolean {
	const t = now.getTime();
	const at = (s: unknown): number => (typeof s === 'string' ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) || !s.includes('T') ? s : s + 'Z') : NaN);
	const start = at(entry.start);
	const end = at(entry.end);
	return !(t < start) && !(t >= end);
}

/** Each entry's part of the draws in the app, as the app picks: eligible entries, the first non-empty tier, then by weight.
 *  The share leaves out the rule that the ad just shown is not drawn twice in a row. */
export function shares(catalog: Catalog, appId: string, ctx: ShareContext): AppShares {
	const weighted = isWeighted(catalog, appId);
	const groups = groupsOf(catalog, appId);
	const now = ctx.now ?? new Date();
	const installed = ctx.platform === 'android' ? ctx.installed ?? new Set<string>() : new Set<string>();
	const rows: Share[] = [];
	const tiers: Share[][] = [[], [], [], []];
	for (const e of catalog.entries ?? []) {
		const weight = weightIn(e, appId, weighted, ctx.platform);
		const row: Share = { id: e.id, state: 'out', weight, share: 0 };
		rows.push(row);
		if (hiddenIn(e, appId)) Object.assign(row, { state: 'self', reason: 'sa propre pub, ou masquée ici' });
		else if (weight <= 0) Object.assign(row, { state: 'off', reason: 'poids 0' });
		else if (!inSpot(e, ctx.spot)) row.reason = ctx.spot === 'video' ? 'pas de vidéo' : 'pas en bannière';
		else if (Array.isArray(e.platforms) && !e.platforms.includes(ctx.platform)) row.reason = `pas sur ${ctx.platform === 'ios' ? 'iOS' : 'Android'}`;
		else if (!datesOk(e, now)) row.reason = 'hors de ses dates';
		else if (!hasLink(e, ctx.platform)) row.reason = 'pas de lien pour cette plateforme';
		else {
			const other = !weighted && !inGroups(e, groups);
			tiers[(installed.has(e.id) ? 2 : 0) + (other ? 1 : 0)].push(row);
		}
	}
	const drawn = tiers.find((t) => t.length > 0) ?? [];
	const total = drawn.reduce((s, r) => s + r.weight, 0);
	for (const tier of tiers)
		for (const r of tier) {
			r.state = tier === drawn ? 'shown' : 'later';
			r.share = tier === drawn && total > 0 ? r.weight / total : 0;
			if (tier !== drawn) r.reason = installed.has(r.id) ? 'déjà installée : seulement à défaut' : 'autre groupe : seulement à défaut';
		}
	return { weighted, rows };
}

/** The apps that show house ads: those the catalogue advertises, those named in a weights, then the known others. */
export function showingApps(catalog: Catalog, others: readonly string[] = []): string[] {
	const ids: string[] = [];
	const add = (id: string) => { if (!ids.includes(id)) ids.push(id); };
	for (const e of catalog.entries ?? []) strings(e.app).forEach(add);
	for (const e of catalog.entries ?? []) if (isObject(e.weights)) Object.keys(e.weights).forEach(add);
	others.forEach(add);
	return ids;
}

/** True when the draft draws differently from the published catalogue in the app on the platform. */
export function rowChanged(published: Catalog, draft: Catalog, appId: string, platform: Platform): boolean {
	const wp = isWeighted(published, appId);
	const wd = isWeighted(draft, appId);
	if (wp !== wd) return true;
	const before = new Map((published.entries ?? []).map((e) => [e.id, e]));
	return (draft.entries ?? []).some((d) => {
		const p = before.get(d.id);
		return !!p && weightIn(p, appId, wp, platform) !== weightIn(d, appId, wd, platform);
	});
}

/** The published catalogue with only the draft's weights of one app on one platform: what « Valider » sends.
 *  Turning the weighted mode on or off counts for both platforms, as the apps read it. Entries new or gone in
 *  the draft are left as published. */
export function applyRow(published: Catalog, draft: Catalog, appId: string, platform: Platform): Catalog {
	const next = JSON.parse(JSON.stringify(published)) as Catalog;
	const weighted = isWeighted(draft, appId);
	const id = baseAppId(appId);
	const drafted = new Map((draft.entries ?? []).map((e) => [e.id, e]));
	for (const e of next.entries ?? []) {
		const d = drafted.get(e.id);
		if (!d) continue;
		if (weighted) setWeightIn(e, appId, platform, weightIn(d, appId, true, platform));
		else if (isObject(e.weights) && Object.hasOwn(e.weights, id)) {
			const rest = Object.fromEntries(Object.entries(e.weights).filter(([k]) => k !== id));
			if (Object.keys(rest).length) e.weights = rest;
			else delete e.weights;
		}
	}
	return next;
}
