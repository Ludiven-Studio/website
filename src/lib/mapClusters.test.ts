import { describe, it, expect } from 'vitest';
import { centreOf, clusterBoxes, clusterPoints } from './mapClusters';

describe('clusterPoints', () => {
	it('keeps far points apart', () => {
		expect(clusterPoints([{ x: 0, y: 0 }, { x: 500, y: 0 }], 100)).toEqual([[0], [1]]);
	});

	it('merges close points in input order', () => {
		const pts = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 1000, y: 0 }, { x: 30, y: 20 }];
		expect(clusterPoints(pts, 100)).toEqual([[0, 1, 3], [2]]);
	});

	it('treats the radius as inclusive', () => {
		expect(clusterPoints([{ x: 0, y: 0 }, { x: 100, y: 0 }], 100)).toEqual([[0, 1]]);
	});

	it('gives nothing for nothing', () => {
		expect(clusterPoints([], 50)).toEqual([]);
	});
});

describe('clusterBoxes', () => {
	it('merges cards whose boxes overlap, round or not', () => {
		// 78 x 136 posters: 90 px above still overlaps, 80 px aside does not.
		expect(clusterBoxes([{ x: 0, y: 0 }, { x: 0, y: 90 }], 78, 136)).toEqual([[0, 1]]);
		expect(clusterBoxes([{ x: 0, y: 0 }, { x: 80, y: 0 }], 78, 136)).toEqual([[0], [1]]);
	});
});

describe('centreOf', () => {
	it('averages the members only', () => {
		const pts = [{ lat: 45, lng: 5 }, { lat: 99, lng: 99 }, { lat: 46, lng: 6 }];
		expect(centreOf([0, 2], (i) => pts[i])).toEqual({ lat: 45.5, lng: 5.5 });
	});
});
