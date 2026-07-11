import { describe, it, expect } from 'vitest';
import { SPEEDS, LANES, buildEndlessChart, generateEndlessSong, judgeTiming, comboMult, rankOf } from './engine';

describe('tempo engine', () => {
	it('builds a deterministic endless chart with valid, strictly-timed tiles', () => {
		const c = buildEndlessChart(42, 1, { count: 200 });
		expect(buildEndlessChart(42, 1, { count: 200 })).toEqual(c); // deterministic
		// ≥ count notes are generated (whole phrases); rests drop out, so a few fewer tiles.
		expect(c.tiles.length).toBeGreaterThan(150);
		expect(c.tiles.length).toBeLessThan(260);
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

	it('never places two different pitches back-to-back in the same column', () => {
		const tiles = buildEndlessChart(11, 1, { count: 400 }).tiles;
		for (let i = 1; i < tiles.length; i++) {
			if (tiles[i].lane === tiles[i - 1].lane) expect(tiles[i].midi).toBe(tiles[i - 1].midi);
		}
	});

	it('never emits a note shorter than a quarter, locked to the beat grid', () => {
		const song = generateEndlessSong(11, 400);
		let total = 0;
		for (const n of song.notes) {
			expect(n.dur).toBeGreaterThanOrEqual(1); // noire minimum
			expect(Number.isInteger(n.dur)).toBe(true); // on the grid
			total += n.dur;
		}
		expect(total % 16).toBe(0); // whole 16-beat phrases → bars never drift vs the backing
	});

	it('varies note durations from the very first phrase', () => {
		for (const seed of [3, 11, 42]) {
			const durs = new Set(
				generateEndlessSong(seed, 400)
					.notes.filter((n) => !n.rest)
					.slice(0, 12)
					.map((n) => n.dur),
			);
			expect(durs.size).toBeGreaterThanOrEqual(2);
		}
	});

	it('has short and long (hold) tiles, holds staying a minority', () => {
		const tiles = buildEndlessChart(5, 1, { count: 300 }).tiles;
		expect(tiles.some((t) => t.hold)).toBe(true);
		expect(tiles.some((t) => !t.hold)).toBe(true);
		expect(tiles.filter((t) => t.hold).length).toBeLessThan(tiles.length * 0.3);
	});

	it('speed scales the chart faster', () => {
		expect(buildEndlessChart(3, 1.3, { count: 200 }).totalTime).toBeLessThan(buildEndlessChart(3, 0.8, { count: 200 }).totalTime);
		expect(SPEEDS.length).toBe(3);
	});

	it('accelerates: later beats come closer together', () => {
		const c = buildEndlessChart(77, 1, { count: 300, rampSec: 20, maxMult: 1.7 });
		// Compare beat lengths on the grid (duration-independent).
		const bt = c.beatTimes;
		const early = bt[1] - bt[0];
		const late = bt[281] - bt[280];
		expect(late).toBeLessThan(early * 0.65);
	});

	it('carries one chord per bar with valid diatonic roots and thirds', () => {
		const c = buildEndlessChart(42, 1, { count: 200 });
		expect(c.chords.length).toBeGreaterThanOrEqual(Math.floor(c.beatTimes.length / 4));
		for (const ch of c.chords) {
			expect([0, 2, 4, 5, 7, 9, 11]).toContain(ch.root);
			expect([3, 4]).toContain(ch.third);
		}
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
