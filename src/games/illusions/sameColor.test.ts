import { describe, it, expect } from 'vitest';
import { ADELSON, ROUNDS, shadowAxisDistance, tileColor, isLight, scaleHex } from './sameColor';

describe('même couleur', () => {
	it('every "same" round compares byte-identical colours, the trap round does not', () => {
		for (const r of ROUNDS) {
			if (r.same) expect(r.patches[0], r.id).toBe(r.patches[1]);
			else expect(r.patches[0], r.id).not.toBe(r.patches[1]);
		}
		expect(ROUNDS.filter((r) => !r.same).map((r) => r.id)).toEqual(['twist']);
	});

	it('Adelson: A is a lit dark tile, B a shaded light tile, both #787878', () => {
		const [ai, aj] = ADELSON.a;
		const [bi, bj] = ADELSON.b;
		expect(isLight(ai, aj)).toBe(false);
		expect(isLight(bi, bj)).toBe(true);
		expect(tileColor(ai, aj, false)).toBe('#787878');
		expect(tileColor(bi, bj, true)).toBe('#787878');
	});

	it('Adelson: B sits well inside the shadow, A well outside it', () => {
		const r = ADELSON.cyl.shadowR;
		const corners = (i: number, j: number): [number, number][] => [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
		for (const p of corners(...ADELSON.b)) expect(shadowAxisDistance(p)).toBeLessThan(r - 0.15);
		for (const p of corners(...ADELSON.a)) expect(shadowAxisDistance(p)).toBeGreaterThan(r + 0.5);
	});

	it('Adelson: B is ringed by shaded dark tiles, A by lit light ones', () => {
		const r = ADELSON.cyl.shadowR;
		const ring = (i: number, j: number) =>
			[[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([x, y]) => x >= 0 && y >= 0 && x < ADELSON.n && y < ADELSON.n);
		for (const [i, j] of ring(...ADELSON.b)) {
			expect(isLight(i, j)).toBe(false);
			expect(shadowAxisDistance([i + 0.5, j + 0.5])).toBeLessThan(r);
		}
		for (const [i, j] of ring(...ADELSON.a)) {
			expect(isLight(i, j)).toBe(true);
			expect(shadowAxisDistance([i + 0.5, j + 0.5])).toBeGreaterThan(r + 0.3);
		}
	});

	it('scaleHex multiplies each channel', () => {
		expect(scaleHex('#808080', 0.5)).toBe('#404040');
		expect(scaleHex('#cfcfcf', 1)).toBe('#cfcfcf');
	});
});
