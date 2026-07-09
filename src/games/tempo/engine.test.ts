import { describe, it, expect } from 'vitest';
import { SPEEDS, LANES, buildEndlessChart, generateEndlessSong, judgeTiming, comboMult, rankOf } from './engine';

describe('tempo engine', () => {
	it('builds a deterministic endless chart with valid, strictly-timed tiles', () => {
		const c = buildEndlessChart(42, 1, { count: 200 });
		expect(buildEndlessChart(42, 1, { count: 200 })).toEqual(c); // deterministic
		expect(c.tiles.length).toBe(200);
		let t = -1;
		for (const tile of c.tiles) {
			expect(tile.lane).toBeGreaterThanOrEqual(0);
			expect(tile.lane).toBeLessThan(LANES);
			expect(tile.time).toBeGreaterThan(t); // strictly increasing hit times
			t = tile.time;
		}
		expect(c.key).toBeGreaterThan(0);
	});

	it('lane follows pitch: same note → same lane, low pitch left (monotonic), different lane → different note', () => {
		const tiles = buildEndlessChart(7, 1, { count: 300 }).tiles;
		const map = new Map<number, number>();
		for (const t of tiles) {
			if (map.has(t.midi)) expect(map.get(t.midi)).toBe(t.lane);
			else map.set(t.midi, t.lane);
		}
		const sorted = [...map.entries()].sort((a, b) => a[0] - b[0]);
		for (let i = 1; i < sorted.length; i++) expect(sorted[i][1]).toBeGreaterThanOrEqual(sorted[i - 1][1]);
		for (let i = 1; i < tiles.length; i++) {
			if (tiles[i].lane !== tiles[i - 1].lane) expect(tiles[i].midi).not.toBe(tiles[i - 1].midi);
		}
	});

	it('has short and long (hold) tiles', () => {
		const tiles = buildEndlessChart(5, 1, { count: 300 }).tiles;
		expect(tiles.some((t) => t.hold)).toBe(true);
		expect(tiles.some((t) => !t.hold)).toBe(true);
	});

	it('speed scales the chart faster', () => {
		expect(buildEndlessChart(3, 1.3, { count: 200 }).totalTime).toBeLessThan(buildEndlessChart(3, 0.8, { count: 200 }).totalTime);
		expect(SPEEDS.length).toBe(3);
	});

	it('accelerates: later notes come closer together', () => {
		const c = buildEndlessChart(77, 1, { count: 300, rampSec: 20 });
		const gap = (i: number): number => c.tiles[i + 1].time - c.tiles[i].time;
		const early = (gap(2) + gap(3) + gap(4)) / 3;
		const late = (gap(250) + gap(251) + gap(252)) / 3;
		expect(late).toBeLessThan(early * 0.7);
	});

	it('endless tune generation is deterministic', () => {
		expect(generateEndlessSong(99, 100)).toEqual(generateEndlessSong(99, 100));
	});

	it('judges timing windows and rejects far taps', () => {
		expect(judgeTiming(0)).toEqual({ grade: 'Parfait', points: 100 });
		expect(judgeTiming(0.09)!.grade).toBe('Parfait');
		expect(judgeTiming(0.15)!.grade).toBe('Bien');
		expect(judgeTiming(0.25)!.grade).toBe('Ok');
		expect(judgeTiming(0.4)).toBeNull();
	});

	it('combo multiplier and ranks behave', () => {
		expect(comboMult(0)).toBe(1);
		expect(comboMult(10)).toBe(2);
		expect(rankOf(95)).toBe('S');
		expect(rankOf(10)).toBe('D');
	});
});
