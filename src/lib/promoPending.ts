// /admin/pubs/: the changes waiting for « Tout enregistrer », counted as the page marks them: one per weights row
// and platform, one per mix row, one per ad added, removed or edited otherwise.
import type { Catalog, CatalogEntry } from '../../supabase/functions/_shared/promoRules.mjs';
import { rowChanged, showingApps, type Platform } from './promoShares';

export interface Pending {
	weights: number;
	mix: number;
	ads: number;
	total: number;
}

const PLATFORMS: Platform[] = ['android', 'ios'];
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// An ad's weights per app are counted in their rows, not as an edit of the ad.
function withoutWeights(e: CatalogEntry): Omit<CatalogEntry, 'weights'> {
	const copy = { ...e };
	delete copy.weights;
	return copy;
}

export function pendingChanges(published: Catalog, draft: Catalog, others: readonly string[] = []): Pending {
	let weights = 0;
	for (const app of new Set([...showingApps(published, others), ...showingApps(draft, others)]))
		for (const p of PLATFORMS) if (rowChanged(published, draft, app, p)) weights++;

	let mix = 0;
	for (const row of new Set([...Object.keys(published.mix ?? {}), ...Object.keys(draft.mix ?? {})]))
		if (!same(published.mix?.[row], draft.mix?.[row])) mix++;

	const before = new Map(published.entries.map((e) => [e.id, e]));
	const after = new Set(draft.entries.map((e) => e.id));
	let ads = draft.entries.filter((e) => !before.has(e.id) || !same(withoutWeights(before.get(e.id)!), withoutWeights(e))).length;
	ads += [...before.keys()].filter((id) => !after.has(id)).length;

	return { weights, mix, ads, total: weights + mix + ads };
}

/** The bar's label: « 3 modifications », or a plain one when only the order or the date moved. */
export function pendingLabel(p: Pending): string {
	if (p.total === 0) return 'Modifications en attente';
	return `${p.total} modification${p.total > 1 ? 's' : ''}`;
}
