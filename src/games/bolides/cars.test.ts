import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BOLIDES, DEFAULT_CAR, carBars, carById, carCfg, selectedCar } from './cars';
import { CFG } from './engine';
import { resetWalletCache } from '../../lib/wallet';

class MemStorage {
	private m = new Map<string, string>();
	getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
	setItem(k: string, v: string): void { this.m.set(k, v); }
	removeItem(k: string): void { this.m.delete(k); }
	clear(): void { this.m.clear(); }
}

beforeEach(() => {
	vi.stubGlobal('localStorage', new MemStorage());
	resetWalletCache();
});
afterEach(() => {
	vi.unstubAllGlobals();
	resetWalletCache();
});

const CFG_KEYS = Object.keys(CFG).sort();

describe('bolides roster', () => {
	it('gives every car four bars in 0-5, none of them flat', () => {
		for (const b of BOLIDES) {
			const bars = [b.bars.speed, b.bars.accel, b.bars.grip, b.bars.trail];
			for (const v of bars) {
				expect(Number.isInteger(v)).toBe(true);
				expect(v).toBeGreaterThanOrEqual(0);
				expect(v).toBeLessThanOrEqual(5);
			}
			// Only the reference car may read as average on every axis.
			if (b.id !== DEFAULT_CAR) expect(Math.max(...bars) - Math.min(...bars)).toBeGreaterThanOrEqual(2);
		}
	});

	it('keeps the roadster as the free literal reference row', () => {
		const r = carById('roadster');
		expect(r).toBe(BOLIDES[0]);
		expect(r.price).toBe(0);
		expect(r.cfg.shield).toBe(0);
		for (const k of CFG_KEYS) {
			expect(r.cfg[k as keyof typeof CFG]).toBe(CFG[k as keyof typeof CFG]);
		}
	});

	it('resolves every cfg to the CFG key set plus shield, all finite', () => {
		for (const b of BOLIDES) {
			expect(Object.keys(b.cfg).sort()).toEqual([...CFG_KEYS, 'shield'].sort());
			for (const [k, v] of Object.entries(b.cfg)) {
				expect(Number.isFinite(v), `${b.id}.${k}`).toBe(true);
			}
		}
	});

	it('keeps grace an integer (it indexes the trail array)', () => {
		for (const b of BOLIDES) expect(Number.isInteger(b.cfg.grace), b.id).toBe(true);
		// No car scales grace: the sweep measured grace 2 and grace 18 as the same race, so a
		// grace multiplier is a free Trace bar. Re-measure before adding one back.
		for (const b of BOLIDES) expect(b.cfg.grace, b.id).toBe(CFG.grace);
	});

	it('derives the bars from the cfg, so the shop cannot lie about a car', () => {
		for (const b of BOLIDES) expect(b.bars, b.id).toEqual(carBars(b.cfg));
	});

	it('gives every paid car a bar under the free roadster, and none a clean sweep', () => {
		const axes = ['speed', 'accel', 'grip', 'trail'] as const;
		const free = carById(DEFAULT_CAR).bars;
		for (const b of BOLIDES) {
			if (b.price === 0) continue;
			expect(axes.some((k) => b.bars[k] < free[k]), `${b.id} must pay somewhere`).toBe(true);
			expect(axes.every((k) => b.bars[k] > free[k]), `${b.id} must not be a pure upgrade`).toBe(false);
		}
	});

	it('falls back to the roadster for an unknown id', () => {
		expect(carById('nope').id).toBe(DEFAULT_CAR);
		expect(carCfg('')).toBe(carCfg(DEFAULT_CAR));
	});

	it('shields only the bunker', () => {
		for (const b of BOLIDES) expect(b.cfg.shield, b.id).toBe(b.id === 'bunker' ? 20 : 0);
	});

	it('prices strictly increase after the free car', () => {
		expect(BOLIDES.map((b) => b.price)).toEqual([0, 60, 90, 120, 150]);
	});

	it('defaults the selection when storage is empty or garbage', () => {
		expect(selectedCar()).toBe(DEFAULT_CAR);
		localStorage.setItem('bolides-car', '{{{');
		expect(selectedCar()).toBe(DEFAULT_CAR);
		localStorage.setItem('bolides-car', 'bunker'); // not owned
		expect(selectedCar()).toBe(DEFAULT_CAR);
	});
});
