import { describe, it, expect } from 'vitest';
import {
	makeLevel, step, isSettled, foxesLeft, aimToVelocity, predictTrajectory,
	encodeScore, decodeScore, DIFFS,
} from './engine';
import { mulberry32 } from '../prng';

const settle = (w: ReturnType<typeof makeLevel>, frames = 240) => {
	for (let i = 0; i < frames; i++) step(w, 1 / 60);
};

describe('cocotte engine', () => {
	it('makeLevel is deterministic with 3/4/5 foxes, allocated cocottes, bodies in bounds', () => {
		for (const key of Object.keys(DIFFS)) {
			const d = DIFFS[key];
			const a = makeLevel(7, d);
			const b = makeLevel(7, d);
			expect(a.bodies.length).toBe(b.bodies.length);
			expect(foxesLeft(a)).toBe(d.foxes);
			expect(a.cocottes).toBe(Infinity); // unlimited shots
			for (const body of a.bodies) {
				if (body.tag === 'ground') continue;
				expect(body.x).toBeGreaterThan(0);
				expect(body.x).toBeLessThan(a.w);
				expect(body.y).toBeLessThanOrEqual(a.groundY + 1);
				if (body.tag === 'crate') expect(body.mat).not.toBeNull(); // blocks have a material
			}
		}
	});

	it('structures are stable: after settling no fox falls on its own', () => {
		for (const key of Object.keys(DIFFS)) {
			const w = makeLevel(42, DIFFS[key]);
			settle(w, 300);
			expect(isSettled(w), `${key} settles`).toBe(true);
			expect(foxesLeft(w), `${key} no spontaneous KO`).toBe(DIFFS[key].foxes);
		}
	});

	it('a dropped body falls under gravity and comes to rest on the ground', () => {
		const w = makeLevel(1, DIFFS.facile);
		const c = w.cocotte!;
		c.x = 60; c.y = 40; c.vx = 0; c.vy = 0;
		settle(w, 400);
		expect(c.vy).toBeLessThan(12);
		expect(c.y).toBeGreaterThan(w.groundY - c.r - 4);
		expect(c.y).toBeLessThan(w.groundY + 1);
	});

	it('circle-circle impact transfers momentum (struck body moves, striker slows)', () => {
		const w = makeLevel(1, DIFFS.facile);
		// cocotte (striker) into a fox (struck), in open space, head-on
		const a = w.cocotte!;
		a.x = 80; a.y = 80; a.vx = 120; a.vy = 0;
		const b = w.bodies.find((x) => x.tag === 'fox')!;
		b.x = 80 + a.r + b.r - 0.5; b.y = 80; b.vx = 0; b.vy = 0; b.hp = 9999; // don't let it explode here
		step(w, 1 / 240);
		expect(b.vx, 'struck moves forward').toBeGreaterThan(20);
		expect(a.vx, 'striker slows').toBeLessThan(120);
	});

	it('a fox loses HP on a hard impact and explodes at 0; a gentle touch barely hurts', () => {
		const hard = makeLevel(3, DIFFS.difficile);
		const fox = hard.bodies.find((b) => b.tag === 'fox')!;
		fox.x = 70; fox.y = 90; fox.vx = 0; fox.vy = 0;
		const c = hard.cocotte!;
		c.x = 70 - (fox.r + c.r) + 1; c.y = 90; c.vx = 240; c.vy = 0; c.launched = true;
		const hp0 = fox.hp;
		const e = step(hard, 1 / 120);
		expect(fox.hp).toBeLessThan(hp0);
		// 240 closing on a difficile fox (hp 85) → > maxHp damage → down this step
		expect(fox.defeated || fox.hp <= 0).toBe(true);
		expect(e.foxesDown).toBeGreaterThanOrEqual(1);

		const soft = makeLevel(3, DIFFS.facile);
		const fox2 = soft.bodies.find((b) => b.tag === 'fox')!;
		fox2.x = 70; fox2.y = 90; fox2.vx = 0; fox2.vy = 0;
		const c2 = soft.cocotte!;
		c2.x = 70 - (fox2.r + c2.r) + 1; c2.y = 90; c2.vx = 20; c2.vy = 0;
		const hp2 = fox2.hp;
		step(soft, 1 / 120);
		expect(fox2.hp).toBe(hp2); // closing 20 < HIT_MIN → no damage
	});

	it('a tnt block detonates on a hard hit, blasting and damaging a nearby fox', () => {
		const w = makeLevel(9, DIFFS.facile);
		const tnt = w.bodies.find((b) => b.tag === 'crate')!;
		tnt.mat = 'tnt'; tnt.hw = 5.5; tnt.hh = 5.5; tnt.x = 120; tnt.y = 120; tnt.vx = 0; tnt.vy = 0;
		const fox = w.bodies.find((b) => b.tag === 'fox')!;
		fox.x = 126; fox.y = 120; fox.vx = 0; fox.vy = 0; // within the blast radius
		const hp0 = fox.hp;
		const c = w.cocotte!;
		c.x = 120 - (c.r + tnt.hw) + 1; c.y = 120; c.vx = 220; c.vy = 0; c.launched = true;
		const e = step(w, 1 / 120);
		expect(tnt.defeated, 'tnt consumed').toBe(true);
		expect(e.blasts.length, 'an explosion happened').toBeGreaterThanOrEqual(1);
		expect(fox.hp).toBeLessThan(hp0); // blast hurt the fox
	});

	it('blocks have durability (maxHp>0, tnt=0) and break after a hard enough hit', () => {
		const w = makeLevel(11, DIFFS.facile);
		for (const b of w.bodies) if (b.tag === 'crate') {
			if (b.mat === 'tnt') expect(b.maxHp).toBe(0);
			else expect(b.maxHp).toBeGreaterThan(0);
		}
		const crate = w.bodies.find((b) => b.tag === 'crate' && b.mat !== 'tnt')!;
		crate.x = 80; crate.y = 120; crate.vx = 0; crate.vy = 0; crate.hp = 10; crate.maxHp = 10; // fragile
		const c = w.cocotte!;
		c.x = 80 - (c.r + crate.hw) + 1; c.y = 120; c.vx = 240; c.vy = 0; c.launched = true;
		const e = step(w, 1 / 120);
		expect(crate.defeated, 'block shattered').toBe(true);
		expect(e.breaks.length, 'a break event was emitted').toBeGreaterThanOrEqual(1);
	});

	it('a gentle bump does not damage a block', () => {
		const w = makeLevel(11, DIFFS.facile);
		const crate = w.bodies.find((b) => b.tag === 'crate' && b.mat !== 'tnt')!;
		crate.x = 80; crate.y = 120; crate.vx = 0; crate.vy = 0;
		const hp0 = crate.hp;
		const c = w.cocotte!;
		c.x = 80 - (c.r + crate.hw) + 1; c.y = 120; c.vx = 30; c.vy = 0; // closing 30 < BLOCK_HIT_MIN
		step(w, 1 / 120);
		expect(crate.hp).toBe(hp0);
	});

	it('any dynamic body knocked far off the field is removed (so the world can settle)', () => {
		const w = makeLevel(12, DIFFS.facile);
		const cue = w.cocotte!;
		cue.x = w.w + 100; cue.y = 50;
		step(w, 1 / 60);
		expect(cue.defeated).toBe(true);
	});

	it('a fox knocked off the field is defeated', () => {
		const w = makeLevel(5, DIFFS.facile);
		const fox = w.bodies.find((b) => b.tag === 'fox')!;
		fox.y = w.h + 50; // fell below the screen
		const e = step(w, 1 / 60);
		expect(fox.defeated).toBe(true);
		expect(e.foxesDown).toBeGreaterThanOrEqual(1);
	});

	it('aimToVelocity ignores tiny pulls, caps power, shoots opposite the pull', () => {
		expect(aimToVelocity({ x: 1, y: 0 })).toBeNull();
		const v = aimToVelocity({ x: 20, y: 10 })!;
		expect(v.vx).toBeLessThan(0);
		expect(v.vy).toBeLessThan(0);
		const big = aimToVelocity({ x: 100, y: 0 })!;
		const huge = aimToVelocity({ x: 999, y: 0 })!;
		expect(Math.hypot(huge.vx, huge.vy)).toBeCloseTo(Math.hypot(big.vx, big.vy), 4); // capped
	});

	it('predictTrajectory arcs up then falls back to the ground', () => {
		const w = makeLevel(1, DIFFS.facile);
		const pts = predictTrajectory(w, w.slingshot, { vx: 60, vy: -120 }, 200);
		expect(pts.length).toBeGreaterThan(3);
		expect(pts[0].y).toBeLessThan(w.slingshot.y); // launched upward
		expect(pts[pts.length - 1].y).toBeLessThanOrEqual(w.groundY + 0.001); // ends at/over ground
	});

	it('encodeScore/decodeScore round-trips and orders by cocottes then time', () => {
		expect(decodeScore(encodeScore(4, 33.2))).toEqual({ cocottes: 4, timeSec: 33.2 });
		expect(encodeScore(3, 99)).toBeLessThan(encodeScore(4, 1));
		expect(encodeScore(4, 10)).toBeLessThan(encodeScore(4, 20));
	});

	it('is deterministic for a given seed (same body layout)', () => {
		const a = makeLevel(2026, DIFFS.moyen);
		const b = makeLevel(2026, DIFFS.moyen);
		expect(a.bodies.map((x) => [x.tag, Math.round(x.x), Math.round(x.y)]))
			.toEqual(b.bodies.map((x) => [x.tag, Math.round(x.x), Math.round(x.y)]));
		// touch mulberry32 so the shared prng import is exercised
		expect(typeof mulberry32(1)()).toBe('number');
	});
});
