import { describe, it, expect } from 'vitest';
import { buildTrack, locate, pointAt, headingAt, NEBULA_RING } from './track';
import { createRace, stepRace, SHIPS, COLORS, BOT_NAMES, LAPS, driftLevel, type Controls } from './race';
import { mulberry32 } from '../prng';

const track = buildTrack(NEBULA_RING);
const DT = 1 / 60;

const botsOnly = (seed: number) =>
	createRace(
		track,
		BOT_NAMES.slice(0, 6).map((name, k) => ({ ship: SHIPS[k % SHIPS.length], name, color: COLORS[k], player: false, skill: 0.94 + (k % 3) * 0.03 })),
		mulberry32(seed),
	);

describe('kart track', () => {
	it('is a closed loop about a kilometre long', () => {
		expect(track.length).toBeGreaterThan(900);
		expect(track.length).toBeLessThan(1300);
		const a = track.n - 1;
		expect(Math.hypot(track.px[a] - track.px[0], track.pz[a] - track.pz[0])).toBeLessThan(3);
	});
	it('never runs close to itself', () => {
		for (let i = 0; i < track.n; i++)
			for (let j = i + 1; j < track.n; j++) {
				const along = Math.min(j - i, track.n - (j - i)) * (track.length / track.n);
				if (along < 60) continue;
				expect(Math.hypot(track.px[i] - track.px[j], track.pz[i] - track.pz[j])).toBeGreaterThan(track.wall * 2);
			}
	});
	it('locates a point on the centre line', () => {
		const q = locate(track, track.px[100], track.pz[100]);
		expect(q.i === 100 || q.i === 99).toBe(true);
		expect(Math.abs(q.lat)).toBeLessThan(0.01);
	});
});

describe('kart race', () => {
	for (const seed of [1, 2, 3]) {
		it(`six bots finish ${LAPS} laps (seed ${seed})`, () => {
			const r = botsOnly(seed);
			let worst = 0;
			while (!r.done && r.time < 400) {
				stepRace(r, null, DT);
				for (const k of r.karts) worst = Math.max(worst, Math.abs(k.lat) - track.wall);
				for (const k of r.karts) k.events.length = 0;
			}
			expect(r.done).toBe(true);
			expect(worst).toBeLessThan(0.05);
			for (const k of r.karts) {
				expect(k.lapTimes.length).toBe(LAPS);
				for (const lt of k.lapTimes) expect(lt).toBeLessThan(75);
			}
			const times = r.karts.map((k) => k.finishTime).sort((a, b) => a - b);
			console.log(`seed ${seed}: finish ${times.map((t) => t.toFixed(1)).join(' ')}, laps ${r.karts[0].lapTimes.map((t) => t.toFixed(1)).join(' ')}`);
		});
	}

	it('a player holding the throttle into a wall stays on the track', () => {
		const r = createRace(track, [{ ship: SHIPS[0], name: 'Toi', color: COLORS[0], player: true }], mulberry32(5), 0);
		const c: Controls = { steer: 1, throttle: 1, brake: false, drift: false, item: false };
		for (let i = 0; i < 60 * 20; i++) {
			stepRace(r, c, DT);
			expect(Math.abs(r.karts[0].lat)).toBeLessThanOrEqual(track.wall);
		}
	});

	it('a held drift charges a mini-turbo that boosts on release', () => {
		const r = createRace(track, [{ ship: SHIPS[0], name: 'Toi', color: COLORS[0], player: true }], mulberry32(5), 0);
		const k = r.karts[0];
		// On the start straight, by the left wall, at speed.
		const pt = pointAt(track, 30, 8);
		Object.assign(k, { x: pt.x, z: pt.z, y: pt.y, seg: pt.i, s: 30, heading: headingAt(track, pt.i), speed: 22 });
		// Hop to the right, then counter-steer so the slide stays on the straight.
		stepRace(r, { steer: 1, throttle: 1, brake: false, drift: true, item: false }, DT);
		for (let i = 0; i < 90; i++) stepRace(r, { steer: -1, throttle: 1, brake: false, drift: true, item: false }, DT);
		expect(k.drift).toBe(1);
		expect(driftLevel(k.driftCharge)).toBe(1);
		stepRace(r, { steer: 0, throttle: 1, brake: false, drift: false, item: false }, DT);
		expect(k.drift).toBe(0);
		expect(k.boost).toBeGreaterThan(0.5);
	});
});
