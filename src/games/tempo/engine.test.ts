import { describe, it, expect } from 'vitest';
import { SONGS, SPEEDS, LANES, buildChart, dailySong, judgeTiming, comboMult, rankOf, generateEndlessSong, buildEndlessChart } from './engine';

describe('tempo engine', () => {
	it('ships several public-domain songs with notes', () => {
		expect(SONGS.length).toBeGreaterThanOrEqual(3);
		for (const s of SONGS) {
			expect(s.notes.length).toBeGreaterThan(6);
			expect(s.tempo).toBeGreaterThan(0);
		}
	});

	it('builds a deterministic chart with valid, non-repeating lanes', () => {
		for (const s of SONGS) {
			const a = buildChart(s, 1);
			expect(buildChart(s, 1)).toEqual(a); // deterministic
			expect(a.tiles.length).toBe(s.notes.length);
			let prev = -1;
			let t = -1;
			for (const tile of a.tiles) {
				expect(tile.lane).toBeGreaterThanOrEqual(0);
				expect(tile.lane).toBeLessThan(LANES);
				expect(tile.lane).not.toBe(prev); // never twice in the same lane in a row
				expect(tile.time).toBeGreaterThan(t); // strictly increasing hit times
				prev = tile.lane;
				t = tile.time;
			}
			expect(a.totalTime).toBeGreaterThan(a.tiles[a.tiles.length - 1].time);
		}
	});

	it('speed scales the chart faster', () => {
		const slow = buildChart(SONGS[0], 0.8).totalTime;
		const fast = buildChart(SONGS[0], 1.3).totalTime;
		expect(fast).toBeLessThan(slow);
		expect(SPEEDS.length).toBe(3);
	});

	it('picks a deterministic daily song within range', () => {
		expect(dailySong(5)).toBe(dailySong(5));
		for (const seed of [0, 1, 99, 123456]) {
			expect(dailySong(seed)).toBeGreaterThanOrEqual(0);
			expect(dailySong(seed)).toBeLessThan(SONGS.length);
		}
	});

	it('judges timing windows and rejects far taps', () => {
		expect(judgeTiming(0)).toEqual({ grade: 'Parfait', points: 100 });
		expect(judgeTiming(0.09)!.grade).toBe('Parfait');
		expect(judgeTiming(0.15)!.grade).toBe('Bien');
		expect(judgeTiming(0.25)!.grade).toBe('Ok');
		expect(judgeTiming(0.4)).toBeNull();
	});

	it('generates a deterministic endless tune with some hold tiles', () => {
		expect(generateEndlessSong(77, 200)).toEqual(generateEndlessSong(77, 200));
		const chart = buildChart(generateEndlessSong(77, 200), 1);
		expect(chart.tiles.length).toBe(200);
		expect(chart.tiles.some((t) => t.hold)).toBe(true); // long notes present
		expect(chart.tiles.some((t) => !t.hold)).toBe(true); // and short ones
	});

	it('endless chart accelerates: later notes come closer together', () => {
		const c = buildEndlessChart(77, 1, { count: 300, rampSec: 20 });
		expect(c.tiles.length).toBe(300);
		expect(buildEndlessChart(77, 1, { count: 300, rampSec: 20 })).toEqual(c); // deterministic
		let prev = -1;
		for (const t of c.tiles) {
			expect(t.lane).toBeGreaterThanOrEqual(0);
			expect(t.lane).not.toBe(prev);
			prev = t.lane;
		}
		const gap = (i: number): number => c.tiles[i + 1].time - c.tiles[i].time;
		// average early gap noticeably larger than average late gap
		const early = (gap(2) + gap(3) + gap(4)) / 3;
		const late = (gap(250) + gap(251) + gap(252)) / 3;
		expect(late).toBeLessThan(early * 0.7);
	});

	it('marks long song notes as hold tiles', () => {
		// "Au clair de la lune" ends on half notes → holds exist in fixed songs too.
		expect(buildChart(SONGS[0], 1).tiles.some((t) => t.hold)).toBe(true);
	});

	it('combo multiplier and ranks behave', () => {
		expect(comboMult(0)).toBe(1);
		expect(comboMult(10)).toBe(2);
		expect(rankOf(95)).toBe('S');
		expect(rankOf(10)).toBe('D');
	});
});
