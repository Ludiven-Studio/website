import { describe, it, expect } from 'vitest';
import { DAILY_LB } from '../data/dailyLb';
import { decodePacked, encodePacked, fmtCentis, fmtExact, fmtSeconds, formatScore } from './scoreFormat';

// Extreme values: a chrono fed a broken epoch, a forged or overflowing leaderboard row.
const GARBAGE = /NaN|undefined|Infinity|null/;

describe('clocks never show NaN', () => {
	it.each([NaN, Infinity, -Infinity, -1, -0.5])('fmtSeconds(%s) shows 0 s', (x) => {
		expect(fmtSeconds(x)).toBe('0 s');
	});

	it.each([NaN, Infinity, -5])('fmtCentis(%s) and fmtExact show no garbage', (x) => {
		expect(fmtCentis(x)).not.toMatch(GARBAGE);
		expect(fmtExact(x, 100)).not.toMatch(GARBAGE);
		expect(fmtExact(x, 10)).not.toMatch(GARBAGE);
	});

	it('shows a day-long chrono in minutes, not hours', () => {
		expect(fmtSeconds(86_400)).toBe('1440:00');
	});
});

describe('every daily leaderboard format', () => {
	const formats = Object.entries(DAILY_LB);

	it.each(formats)('%s renders extreme rows without garbage', (_, cfg) => {
		for (const v of [0, 1, 59, 60, 99, 100, 9_999_999, 10_000_000, 2 ** 31 - 1, Number.MAX_SAFE_INTEGER, -1])
			expect(formatScore(cfg.fmt, v), String(v)).not.toMatch(GARBAGE);
	});

	const packed = formats.filter(([, c]) => c.fmt.kind === 'packed');

	it('includes packed formats to check', () => {
		expect(packed.length).toBeGreaterThan(0);
	});

	it.each(packed)('%s packs into a safe integer and decodes its edges exactly', (_, cfg) => {
		if (cfg.fmt.kind !== 'packed') return;
		const { radix, fields } = cfg.fmt;
		expect(radix ** fields.length).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
		const top = fields.map(() => radix - 1);
		expect(decodePacked(radix, fields.length, encodePacked(radix, top))).toEqual(top);
		const zero = fields.map(() => 0);
		expect(decodePacked(radix, fields.length, encodePacked(radix, zero))).toEqual(zero);
	});
});

describe('packing a field out of range', () => {
	it('a field at the radix spills into the next one: callers must clamp below it', () => {
		// Documents why the games clamp their time field to radix - 1 (9_999_999 centiseconds).
		expect(decodePacked(10, 2, encodePacked(10, [1, 10]))).toEqual([2, 0]);
	});
});
