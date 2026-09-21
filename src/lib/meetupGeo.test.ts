import { describe, it, expect } from 'vitest';
import { distanceM, boundsAround, nearest, formatDistance, isPlausibleFr, MERGE_M } from './meetupGeo';

// Saint-Jean-de-Bournay, the launch area.
const SJB = { lat: 45.4489, lng: 5.1381 };

describe('distanceM', () => {
	it('is zero for the same point', () => {
		expect(distanceM(SJB.lat, SJB.lng, SJB.lat, SJB.lng)).toBe(0);
	});

	it('matches a known separation', () => {
		// Lyon Part-Dieu: ~41 km as the crow flies (48 km is the ROAD distance —
		// the number this test was first written against, and it was wrong).
		// Cross-check by hand: Δlat 0.312° ≈ 34.6 km, Δlng 0.279°·cos45.6° ≈ 21.7 km.
		const d = distanceM(SJB.lat, SJB.lng, 45.7605, 4.8595);
		expect(d).toBeGreaterThan(40_000);
		expect(d).toBeLessThan(42_000);
	});

	it('resolves the merge scale', () => {
		// 0.0002° of latitude ≈ 22 m — inside the merge radius, and it must not
		// round to zero or every pin in a village would fuse.
		const d = distanceM(SJB.lat, SJB.lng, SJB.lat + 0.0002, SJB.lng);
		expect(d).toBeGreaterThan(15);
		expect(d).toBeLessThan(MERGE_M);
	});

	it('is symmetric', () => {
		expect(distanceM(45, 5, 46, 6)).toBeCloseTo(distanceM(46, 6, 45, 5), 6);
	});
});

describe('boundsAround', () => {
	it('contains every point within the radius', () => {
		const b = boundsAround(SJB.lat, SJB.lng, 1000);
		for (const [dLat, dLng] of [[0.008, 0], [-0.008, 0], [0, 0.012], [0, -0.012]]) {
			const lat = SJB.lat + dLat, lng = SJB.lng + dLng;
			if (distanceM(SJB.lat, SJB.lng, lat, lng) > 1000) continue;
			expect(lat).toBeGreaterThanOrEqual(b.south);
			expect(lat).toBeLessThanOrEqual(b.north);
			expect(lng).toBeGreaterThanOrEqual(b.west);
			expect(lng).toBeLessThanOrEqual(b.east);
		}
	});

	it('widens longitude with latitude', () => {
		const here = boundsAround(45, 5, 1000);
		const north = boundsAround(60, 5, 1000);
		expect(north.east - north.west).toBeGreaterThan(here.east - here.west);
	});
});

describe('nearest', () => {
	const spots = [
		{ lat: 45.4489, lng: 5.1381, id: 'a' },
		{ lat: 45.4491, lng: 5.1381, id: 'b' },
		{ lat: 45.5, lng: 5.2, id: 'c' },
	];

	it('finds the closest inside the radius', () => {
		expect(nearest(spots, 45.44895, 5.1381, MERGE_M)?.id).toBe('a');
	});

	it('returns null when nothing is close enough', () => {
		expect(nearest(spots, 46, 6, MERGE_M)).toBeNull();
	});
});

describe('formatDistance', () => {
	it('reads in French', () => {
		expect(formatDistance(452)).toBe('450 m');
		expect(formatDistance(2400)).toBe('2,4 km');
		expect(formatDistance(17_300)).toBe('17 km');
	});
});

describe('isPlausibleFr', () => {
	it('accepts the launch area and the guard coordinate', () => {
		expect(isPlausibleFr(SJB.lat, SJB.lng)).toBe(true);
		expect(isPlausibleFr(43.0, -3.0)).toBe(true); // check-rencontres.mjs pins here
	});

	it('rejects the ocean on the other side of the world', () => {
		expect(isPlausibleFr(-20, -150)).toBe(false);
		expect(isPlausibleFr(NaN, 5)).toBe(false);
	});
});
