import { describe, it, expect } from 'vitest';
import {
	addPlace, cleanPlaceName, isNearPlaces, nearestPlace, removePlace, MAX_PLACES, NEAR_M,
	type Place,
} from './meetupPlaces';

const LYON: Place = { name: 'Lyon', lat: 45.7578, lng: 4.8320 };
const CAMPING: Place = { name: 'Camping', lat: 44.9330, lng: 4.8910 };

describe('cleanPlaceName', () => {
	it('squeezes, trims and caps', () => {
		expect(cleanPlaceName('  Camping   le   Bontemps  ')).toBe('Camping le Bontemps');
		expect(cleanPlaceName('x'.repeat(40))).toHaveLength(24);
	});

	it('never yields an unlabelled chip', () => {
		expect(cleanPlaceName('   ')).toBe('Mon lieu');
	});
});

describe('addPlace', () => {
	it('puts the newest first and keeps the others', () => {
		const out = addPlace([LYON], 'Camping', CAMPING.lat, CAMPING.lng);
		expect(out.map((p) => p.name)).toEqual(['Camping', 'Lyon']);
	});

	it('renames in place rather than stacking two chips on one village', () => {
		// 200 m away: the same boulodrome, reached from the other side of the square.
		const out = addPlace([LYON], 'Chez moi', LYON.lat + 0.0018, LYON.lng);
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe('Chez moi');
	});

	it('drops the oldest past the cap', () => {
		let list: Place[] = [];
		for (let i = 0; i < MAX_PLACES + 2; i++) list = addPlace(list, `L${i}`, 45 + i * 0.5, 5);
		expect(list).toHaveLength(MAX_PLACES);
		expect(list[0].name).toBe(`L${MAX_PLACES + 1}`);
		expect(list.some((p) => p.name === 'L0')).toBe(false);
	});

	it('does not mutate its input', () => {
		const list = [LYON];
		addPlace(list, 'Camping', CAMPING.lat, CAMPING.lng);
		expect(list).toEqual([LYON]);
	});
});

describe('removePlace', () => {
	it('removes by index, so twin names stay separable', () => {
		const twins: Place[] = [{ ...LYON, name: 'Mon lieu' }, { ...CAMPING, name: 'Mon lieu' }];
		expect(removePlace(twins, 0)).toEqual([twins[1]]);
	});
});

describe('nearestPlace', () => {
	it('is null on an empty list rather than a fake zero', () => {
		expect(nearestPlace([], LYON.lat, LYON.lng)).toBeNull();
	});

	it('names which home port a game is close to', () => {
		const n = nearestPlace([LYON, CAMPING], CAMPING.lat + 0.01, CAMPING.lng);
		expect(n?.place.name).toBe('Camping');
		expect(n?.m).toBeLessThan(2000);
	});
});

describe('isNearPlaces', () => {
	it('answers for EITHER home port, which is the whole point', () => {
		const both = [LYON, CAMPING];
		expect(isNearPlaces(both, LYON.lat + 0.05, LYON.lng)).toBe(true);
		expect(isNearPlaces(both, CAMPING.lat - 0.05, CAMPING.lng)).toBe(true);
		// Halfway between them, ~45 km from each.
		expect(isNearPlaces(both, 45.3454, 4.8615)).toBe(false);
	});

	it('cannot be true with nothing saved', () => {
		expect(isNearPlaces([], LYON.lat, LYON.lng)).toBe(false);
	});

	it('takes the radius it is given', () => {
		expect(isNearPlaces([LYON], CAMPING.lat, CAMPING.lng)).toBe(false); // ~92 km
		expect(isNearPlaces([LYON], CAMPING.lat, CAMPING.lng, 4 * NEAR_M)).toBe(true);
	});
});
