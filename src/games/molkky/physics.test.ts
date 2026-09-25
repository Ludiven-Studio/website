import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPhysics, MolkkyWorld, simulateThrow, standardLayout, PINS_Z, PIN_H, RAPIER_VERSION } from './physics';
import { aimAt } from './ai';

beforeAll(() => loadPhysics());

describe('mölkky physics', () => {
	it('names the vendored engine after the installed package', () => {
		const pkg = JSON.parse(readFileSync('node_modules/@dimforge/rapier3d-deterministic-compat/package.json', 'utf8'));
		expect(RAPIER_VERSION).toBe(pkg.version);
	});

	it('starts with twelve numbered pins in four rows, all standing', () => {
		const lay = standardLayout();
		expect(lay.map((s) => s.n).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
		const w = MolkkyWorld.create();
		for (let i = 0; i < 240; i++) w.step(); // two seconds of nothing
		expect(w.fallen()).toEqual([]);
		for (const p of w.pinViews()) expect(p.y).toBeCloseTo(PIN_H / 2, 2);
		w.free();
	});

	it('knocks pins down with a throw at the front of the pack, and nothing with a throw wide', () => {
		const w = MolkkyWorld.create();
		const hit = simulateThrow(w, aimAt(0, PINS_Z, 0.3));
		expect(hit.length).toBeGreaterThan(0);
		const wide = simulateThrow(w, aimAt(1.2, PINS_Z, 0.3));
		expect(wide).toEqual([]);
		expect(w.fallen()).toEqual([]); // trying throws never touches the real board
		w.free();
	});

	it('replays a throw on a copy with the same result, bit for bit', () => {
		const w = MolkkyWorld.create();
		const th = aimAt(0.03, PINS_Z + 0.1, 0.35);
		const a = w.clone(), b = w.clone();
		a.throwStick(th); b.throwStick(th);
		a.settle(); b.settle();
		expect(JSON.stringify(a.pinViews())).toBe(JSON.stringify(b.pinViews()));
		a.free(); b.free(); w.free();
	});

	it('stands fallen pins back up where they lie, apart from each other', () => {
		const w = MolkkyWorld.create();
		w.throwStick(aimAt(0, PINS_Z, 0.3));
		const down = w.settle();
		expect(down.length).toBeGreaterThan(0);
		const before = new Map(w.pinViews().map((p) => [p.n, p]));
		w.raise();
		expect(w.fallen()).toEqual([]);
		const pins = w.pinViews();
		for (const p of pins) {
			if (!down.includes(p.n)) continue;
			const b = before.get(p.n)!;
			expect(Math.hypot(p.x - b.x, p.z - b.z)).toBeLessThan(0.15); // near where it fell
		}
		for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
			expect(Math.hypot(pins[i].x - pins[j].x, pins[i].z - pins[j].z)).toBeGreaterThan(0.05);
		}
		for (let i = 0; i < 240; i++) w.step();
		expect(w.fallen()).toEqual([]); // and they stay up
		w.free();
	});

	it('settles a throw fast enough for the AI to try a dozen', () => {
		const w = MolkkyWorld.create();
		const t0 = performance.now();
		for (let k = 0; k < 6; k++) simulateThrow(w, aimAt((k - 2.5) * 0.05, PINS_Z, 0.3));
		const per = (performance.now() - t0) / 6;
		console.log(`one throw to rest: ${per.toFixed(1)} ms`);
		expect(per).toBeLessThan(150);
		w.free();
	});
});
