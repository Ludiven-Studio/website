// Home ports, kept in this browser and nowhere else.
//
// The first player to answer the map said it plainly: campsite from April to
// September, Lyon the rest of the year, and happy to drive. "Autour de moi"
// serves exactly one of those at a time, so half his games are invisible
// whichever one he is standing in. There are no accounts here, so the list is
// localStorage — which also means it costs the server nothing.

import { distanceM } from './meetupGeo';

export interface Place { name: string; lat: number; lng: number; }

export const MAX_PLACES = 4;
/** Two pins this close are the same home port: adding one renames the other
 *  instead of stacking a second chip on the same village. */
export const SAME_PLACE_M = 500;
/** What "près de mes lieux" means. A pétanque game is worth a drive. */
export const NEAR_M = 30_000;

const KEY = 'ludiven-meetup-places';

export const cleanPlaceName = (raw: string): string =>
	raw.replace(/\s+/g, ' ').trim().slice(0, 24) || 'Mon lieu';

/** The list is the caller's, so every rule here is testable without storage. */
export function addPlace(list: readonly Place[], name: string, lat: number, lng: number): Place[] {
	const rest = list.filter((p) => distanceM(p.lat, p.lng, lat, lng) > SAME_PLACE_M);
	return [{ name: cleanPlaceName(name), lat, lng }, ...rest].slice(0, MAX_PLACES);
}

/** By index, not by name: nothing stops two places being called "Mon lieu". */
export const removePlace = (list: readonly Place[], index: number): Place[] =>
	list.filter((_, i) => i !== index);

export function nearestPlace(
	list: readonly Place[], lat: number, lng: number,
): { place: Place; m: number } | null {
	let best: { place: Place; m: number } | null = null;
	for (const place of list) {
		const m = distanceM(lat, lng, place.lat, place.lng);
		if (!best || m < best.m) best = { place, m };
	}
	return best;
}

export function isNearPlaces(
	list: readonly Place[], lat: number, lng: number, maxM: number = NEAR_M,
): boolean {
	const n = nearestPlace(list, lat, lng);
	return n !== null && n.m <= maxM;
}

export function readPlaces(): Place[] {
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		if (!Array.isArray(raw)) return [];
		return (raw as Place[])
			.filter((p) => Boolean(p) && typeof p.name === 'string'
				&& Number.isFinite(p.lat) && Number.isFinite(p.lng))
			.slice(0, MAX_PLACES);
	} catch { return []; }
}

export function savePlaces(list: readonly Place[]): void {
	try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ }
}
