import { describe, expect, it } from 'vitest';
import { PATH_HIT, PATH_OUT, PATH_PLAIN, pathTint, predictThrow } from './render3d';
import { makeBoule, place, throwVelocity, type Sim, type Velocity } from './engine';
import { makeTerrain, SURFACES, PITCH_W } from './terrain';
import { wx, wz } from './render3d';

const FROM = { x: PITCH_W / 2, y: 1 };
const lob = throwVelocity(0, 1, 7, 0.9);
const sim = (...bs: ReturnType<typeof makeBoule>[]): Sim =>
	({ t: makeTerrain(4242, SURFACES['terre-battue'], 0.02, { slope: 0 }), bs: bs.map((b) => b), rng: 0 });
const predict = (s: Sim, v: Velocity = lob) => predictThrow(s, FROM, v, (c) => place(c.t, makeBoule(FROM.x, FROM.y, 0)));

describe('the aim path colour (Pétanque Game)', () => {
	it('is green onto the jack or theirs, orange onto ours or off the pitch, plain otherwise', () => {
		expect(pathTint({ struck: null, out: false }, 0)).toBe(PATH_PLAIN);
		expect(pathTint({ struck: -1, out: false }, 0)).toBe(PATH_HIT);
		expect(pathTint({ struck: 1, out: false }, 0)).toBe(PATH_HIT);
		expect(pathTint({ struck: 0, out: false }, 0)).toBe(PATH_OUT);
		expect(pathTint({ struck: null, out: true }, 1)).toBe(PATH_OUT);
	});

	it('reads what the throw meets first in the air, with the real engine', () => {
		const free = predict(sim());
		expect(free.land).not.toBeNull();
		expect(pathTint(free, 0)).toBe(PATH_PLAIN);
		// A boule sitting where the lob comes down: theirs turns the path green, ours orange.
		// Back from world coordinates to the pitch's: wx and wz only shift the origin.
		const at = { x: free.land!.x - wx(0), y: free.land!.z - wz(0) };
		const there = (side: 0 | 1) => place(sim().t, makeBoule(at.x, at.y, side));
		const theirs = predict(sim(there(1)));
		expect(theirs.struck).toBe(1);
		expect(pathTint(theirs, 0)).toBe(PATH_HIT);
		expect(pathTint(predict(sim(there(0))), 0)).toBe(PATH_OUT);
		// Far too strong: over the back board.
		const long = predict(sim(), throwVelocity(0, 1, 20, 0.6));
		expect(long.out).toBe(true);
		expect(pathTint(long, 0)).toBe(PATH_OUT);
	});
});
