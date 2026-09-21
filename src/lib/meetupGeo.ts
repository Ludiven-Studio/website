// Distances on the map, without PostGIS and without a map library. The same
// haversine runs in SQL (meetup_upsert_spot) for the 30 m spot merge.

export const EARTH_R = 6371000;
/** Two pins closer than this are the same boulodrome — otherwise one place ends
 *  up as a dozen near-identical markers. */
export const MERGE_M = 30;

const rad = (d: number): number => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
	const dLat = rad(bLat - aLat);
	const dLng = rad(bLng - aLng);
	const s = Math.sin(dLat / 2) ** 2
		+ Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface Bounds { south: number; north: number; west: number; east: number; }

/** Box that contains every point within `m` metres — the cheap prefilter before
 *  the exact haversine. Degenerate near the poles; we are in Isère. */
export function boundsAround(lat: number, lng: number, m: number): Bounds {
	const dLat = (m / EARTH_R) * (180 / Math.PI);
	const dLng = dLat / Math.max(0.01, Math.cos(rad(lat)));
	return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
}

/** Nearest item within `maxM`, or null. */
export function nearest<T extends { lat: number; lng: number }>(
	items: readonly T[], lat: number, lng: number, maxM = Infinity,
): T | null {
	let best: T | null = null;
	let bestD = maxM;
	for (const it of items) {
		const d = distanceM(lat, lng, it.lat, it.lng);
		if (d <= bestD) { bestD = d; best = it; }
	}
	return best;
}

/** "450 m" / "2,4 km" / "17 km" — French decimal comma. */
export function formatDistance(m: number): string {
	if (m < 1000) return `${Math.round(m / 10) * 10} m`;
	const km = m / 1000;
	return km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`;
}

/** Keep a free pin plausible: anywhere in metropolitan France plus a margin.
 *  A pin in the Pacific is a bug or a prank, never a boulodrome. */
export function isPlausibleFr(lat: number, lng: number): boolean {
	return Number.isFinite(lat) && Number.isFinite(lng)
		&& lat >= 41 && lat <= 52 && lng >= -6 && lng <= 10;
}
