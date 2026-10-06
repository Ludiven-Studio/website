import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTerrain, SURFACES, PITCH_W, PITCH_L, heightAt, gradAt } from './terrain';
import {
	makeBoule, makeJack, place, throwVelocity, stepSim, settle, isSettled, cloneSim,
	speed2, dist2, BOULE_R, type Sim, type Impact,
} from './engine';

const level = () => makeTerrain(4242, SURFACES['terre-battue'], 0.02, { slope: 0 });

function thrown(t = level(), speed = 7, elev = 0.5, rng = 0): Sim {
	const b = makeBoule(PITCH_W / 2, 0.6, 0);
	const v = throwVelocity(0, 1, speed, elev);
	b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.rolling = false;
	return { t, bs: [b], rng };
}

describe('terrain', () => {
	it('samples inside the heightfield and extends past the edges', () => {
		const t = level();
		expect(Number.isFinite(heightAt(t, 0, 0))).toBe(true);
		expect(heightAt(t, -5, -5)).toBeCloseTo(heightAt(t, 0, 0), 6);
		expect(heightAt(t, PITCH_W + 9, PITCH_L + 9)).toBeCloseTo(heightAt(t, PITCH_W, PITCH_L), 3);
	});

	it('gradient matches a finite difference of the height', () => {
		const t = makeTerrain(7, SURFACES['gravier-fin'], 0.05);
		const g = { gx: 0, gy: 0 };
		const x = 1.63, y = 5.27, e = 0.004;
		gradAt(t, x, y, g);
		expect(g.gx).toBeCloseTo((heightAt(t, x + e, y) - heightAt(t, x - e, y)) / (2 * e), 4);
		expect(g.gy).toBeCloseTo((heightAt(t, x, y + e) - heightAt(t, x, y - e)) / (2 * e), 4);
	});

	it('is a pure function of the seed', () => {
		const a = makeTerrain(99, SURFACES.sable, 0.03);
		const b = makeTerrain(99, SURFACES.sable, 0.03);
		expect(Array.from(a.hs)).toEqual(Array.from(b.hs));
		expect(a.pebbles).toEqual(b.pebbles);
	});
});

describe('flight and roll', () => {
	it('flies, lands, rolls, then stops', () => {
		const s = thrown();
		const imp: Impact[] = [];
		const airborne: number[] = [];
		for (let k = 0; k < 200 && !isSettled(s.bs); k++) {
			stepSim(s, 1 / 120, imp);
			airborne.push(s.bs[0].z);
		}
		expect(Math.max(...airborne)).toBeGreaterThan(BOULE_R + 0.2); // it really left the ground
		expect(imp.some((i) => i.kind === 'ground')).toBe(true);
		settle(s);
		expect(isSettled(s.bs)).toBe(true);
		expect(speed2(s.bs[0])).toBe(0);
		expect(s.bs[0].y).toBeGreaterThan(2);
	});

	it('never ends up under the ground', () => {
		const t = makeTerrain(31, SURFACES['gravier-gros'], 0.06);
		const s = thrown(t, 8, 0.45);
		for (let k = 0; k < 900; k++) {
			stepSim(s, 1 / 120);
			const b = s.bs[0];
			if (!b.live) break;
			expect(b.z).toBeGreaterThanOrEqual(heightAt(t, b.x, b.y) + b.r - 1e-3);
		}
	});

	// A 3 % faux plat cannot overcome a 26 % rolling friction, so a parked boule stays parked —
	// that is correct, and why this asserts on the asymmetry of a roll, not on spontaneous motion.
	it('a faux plat carries a rolling boule further downhill than uphill', () => {
		const ramp = makeTerrain(5, SURFACES['terre-battue'], 0.001, { slope: 0 });
		for (let j = 0; j < ramp.ny; j++)
			for (let i = 0; i < ramp.nx; i++) ramp.hs[j * ramp.nx + i] = -j * 0.05 * 0.03;
		const go = (vy: number) => {
			const b = place(ramp, makeBoule(2, 7.5, 0));
			b.vy = vy;
			settle({ t: ramp, bs: [b], rng: 0 }, undefined, 30);
			return Math.abs(b.y - 7.5);
		};
		expect(go(1.5)).toBeGreaterThan(go(-1.5) * 1.1);
		expect(go(0)).toBe(0); // 3 % is far below the friction threshold, so it does not creep

		const flat = makeTerrain(5, SURFACES['terre-battue'], 0, { slope: 0 });
		const still = makeBoule(2, 5, 0);
		still.vy = 1.5;
		const s2: Sim = { t: flat, bs: [still], rng: 0 };
		settle(s2, undefined, 30);
		expect(still.x).toBeCloseTo(2, 6); // dead level: no sideways wander at all
	});

	it('leaving the pitch kills the boule', () => {
		const t = level();
		const b = makeBoule(2, 14.5, 0);
		b.vy = 6;
		const s: Sim = { t, bs: [b], rng: 0 };
		settle(s);
		expect(b.live).toBe(false);
	});

	it('harder ground means a shorter roll', () => {
		const roll = (id: 'terre-battue' | 'sable') => {
			const s = thrown(makeTerrain(11, SURFACES[id], 0.005, { slope: 0 }), 6.5, 0.52);
			settle(s, undefined, 30);
			return s.bs[0].y;
		};
		expect(roll('terre-battue')).toBeGreaterThan(roll('sable') + 1.5);
	});
});

describe('collisions', () => {
	it('a centred shot at equal mass is a carreau: the shooter stops, the target goes', () => {
		const t = level();
		const target = makeBoule(2, 8, 1);
		target.z = heightAt(t, 2, 8) + BOULE_R;
		const shooter = makeBoule(2, 7.6, 0);
		shooter.z = target.z;
		shooter.vy = 9;
		const s: Sim = { t, bs: [shooter, target], rng: 0 };
		for (let k = 0; k < 20; k++) stepSim(s, 1 / 240);
		expect(speed2(shooter)).toBeLessThan(0.8);
		expect(speed2(target)).toBeGreaterThan(7);
	});

	it('the jack is much lighter, so a boule sends it flying', () => {
		const t = level();
		const jack = makeJack(2, 8);
		jack.z = heightAt(t, 2, 8) + jack.r;
		const b = makeBoule(2, 7.5, 0);
		b.z = heightAt(t, 2, 7.5) + BOULE_R;
		b.vy = 5;
		const s: Sim = { t, bs: [b, jack], rng: 0 };
		settle(s, undefined, 30);
		expect(jack.y > 9 || !jack.live).toBe(true);
		expect(speed2(b)).toBe(0);
	});

	// The carreau is not special-cased anywhere: it falls out of an equal-mass near-head-on impact.
	// What it rests on is the impulse being textbook, so lock that down — a retune of the ground
	// constants must never quietly change how much speed the shooter keeps.
	// A flat pebble-free bench on purpose: over a real approach the relief and the pebbles nudge the
	// shooter off line before contact, so that setup measures the approach, not the impulse.
	it('an off-centre hit leaves the shooter v*sin(theta), sin(theta) = offset / 2r', () => {
		const t = makeTerrain(1, SURFACES['terre-battue'], 0, { slope: 0, noPebbles: true });
		for (const off of [0.01, 0.02, 0.035]) {
			const target = place(t, makeBoule(2, 8, 1));
			const shooter = place(t, makeBoule(2 + off, 7.8, 0));
			shooter.vy = 9;
			const s: Sim = { t, bs: [shooter, target], rng: 0 };
			for (let k = 0; k < 400 && !stepSim(s, 1 / 240).hitBoule; k++);
			const theory = 9 * (off / (2 * BOULE_R));
			expect(speed2(shooter)).toBeGreaterThan(theory * 0.8);
			expect(speed2(shooter)).toBeLessThan(theory * 1.3); // restitution adds a little back
		}
	});

	it('a weak centred hit touches the target without clearing it', () => {
		const t = level();
		const target = place(t, makeBoule(2, 8, 1));
		const shooter = place(t, makeBoule(2, 7.6, 0));
		shooter.vy = 2;
		const s: Sim = { t, bs: [shooter, target], rng: 0 };
		settle(s, undefined, 30);
		expect(target.y - 8).toBeGreaterThan(0); // it was hit
		expect(target.y - 8).toBeLessThan(1); // but it stayed put — the daily's 1-point grade
	});

	it('boules never overlap once settled', () => {
		const t = level();
		const bs = [makeBoule(2, 8, 1), makeBoule(2.05, 8.3, 1), makeBoule(1.9, 8.2, 0)];
		for (const b of bs) b.z = heightAt(t, b.x, b.y) + b.r;
		const shooter = makeBoule(2, 6.5, 0);
		shooter.vy = 8;
		const s: Sim = { t, bs: [...bs, shooter], rng: 0 };
		settle(s, undefined, 30);
		for (let i = 0; i < s.bs.length; i++)
			for (let k = i + 1; k < s.bs.length; k++) {
				if (!s.bs[i].live || !s.bs[k].live) continue;
				expect(dist2(s.bs[i], s.bs[k])).toBeGreaterThan(2 * BOULE_R - 1e-3);
			}
	});
});

describe('determinism', () => {
	it('the same throws replay to the same final positions', () => {
		const run = () => {
			const t = makeTerrain(20260917, SURFACES['gravier-gros'], 0.05);
			const s: Sim = { t, bs: [], rng: 0 };
			for (let k = 0; k < 6; k++) {
				const b = makeBoule(2, 0.6, (k % 2) as 0 | 1);
				const v = throwVelocity(0.1 - k * 0.04, 1, 7 + k * 0.2, 0.4 + k * 0.02);
				b.vx = v.vx; b.vy = v.vy; b.vz = v.vz; b.rolling = false;
				s.bs.push(b);
				settle(s, undefined, 30);
			}
			return s.bs.map((b) => [b.x, b.y, b.z, b.live ? 1 : 0]);
		};
		expect(run()).toEqual(run());
	});

	it('a preview on a clone leaves the real sim untouched', () => {
		const s = thrown(makeTerrain(3, SURFACES['gravier-fin'], 0.04));
		const before = { rng: s.rng, bs: s.bs.map((b) => ({ ...b })) };
		const preview = cloneSim(s);
		settle(preview, undefined, 30);
		expect(s.rng).toBe(before.rng);
		expect(s.bs).toEqual(before.bs);
	});

	// Math.hypot and Math.pow are not guaranteed bit-identical across JS engines, and the online
	// match replays throws rather than streaming positions. A drift here is a desync there.
	it('the engine uses no wall clock, no Math.random and no fuzzy transcendentals', () => {
		const src = readFileSync(join(process.cwd(), 'src', 'games', 'petanque', 'engine.ts'), 'utf8');
		const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
		for (const banned of ['Math.random', 'Date.now', 'performance.now', 'Math.hypot', 'Math.pow'])
			expect(body.includes(banned)).toBe(false);
	});
});
