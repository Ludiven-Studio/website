import { describe, it, expect } from 'vitest';
import { encodePacked, decodePacked, formatScore, type ScoreFormat } from './scoreFormat';

describe('packed encode/decode', () => {
	it('round-trips and orders lexicographically', () => {
		expect(encodePacked(100000, [3, 425])).toBe(300425);
		expect(decodePacked(100000, 2, 300425)).toEqual([3, 425]);
		// fewer strokes always wins, time only breaks ties
		expect(encodePacked(100000, [3, 99999])).toBeLessThan(encodePacked(100000, [4, 0]));
		expect(encodePacked(100000, [3, 100])).toBeLessThan(encodePacked(100000, [3, 200]));
	});
});

describe('formatScore', () => {
	it('renders plain formats', () => {
		expect(formatScore({ kind: 'plain', fmt: 'score' }, 1500)).toBe('1500 pts');
		expect(formatScore({ kind: 'plain', fmt: 'time' }, 125)).toBe('02:05');
		expect(formatScore({ kind: 'plain', fmt: 'num' }, 7)).toBe('7');
		expect(formatScore({ kind: 'plain', fmt: 'name' }, 42)).toBe('');
	});

	it('pluralizes counts', () => {
		const f: ScoreFormat = { kind: 'count', one: 'essai', many: 'essais' };
		expect(formatScore(f, 1)).toBe('1 essai');
		expect(formatScore(f, 3)).toBe('3 essais');
	});

	it('scales durations; keeps hundredths past the threshold when decimals ≥ 2', () => {
		expect(formatScore({ kind: 'duration', div: 10, decimals: 1 }, 123)).toBe('12.3 s'); // esquive tenths
		expect(formatScore({ kind: 'duration', div: 1000, decimals: 2, mmssAbove: 60000 }, 8340)).toBe('08.34 s'); // drift ms (fixed-width)
		expect(formatScore({ kind: 'duration', div: 1000, decimals: 2, mmssAbove: 60000 }, 65000)).toBe('01:05.00');
	});

	it('renders time races in centiseconds (ss.cc / mm:ss.cc)', () => {
		const centis: ScoreFormat = { kind: 'duration', div: 100, decimals: 2, mmssAbove: 6000 };
		expect(formatScore(centis, 583)).toBe('05.83 s'); // fixed width (padded)
		expect(formatScore(centis, 4312)).toBe('43.12 s');
		expect(formatScore(centis, 8345)).toBe('01:23.45');
	});

	it('renders packed count + time', () => {
		const f: ScoreFormat = { kind: 'packed', radix: 100000, fields: [{ as: 'int', unit: 'coups' }, { as: 'mmss', div: 10 }] };
		expect(formatScore(f, encodePacked(100000, [3, 420]))).toBe('3 coups · 00:42');
		// centisecond packed (billard/golf/angry): "coups · mm:ss.cc"
		const cc: ScoreFormat = { kind: 'packed', radix: 10_000_000, fields: [{ as: 'int', unit: 'coups' }, { as: 'mmss.cc', div: 100 }] };
		expect(formatScore(cc, encodePacked(10_000_000, [3, 8345]))).toBe('3 coups · 01:23.45');
	});

	it('branches on a loss threshold', () => {
		const demineur: ScoreFormat = { kind: 'threshold', at: 100000, below: { kind: 'plain', fmt: 'time' }, aboveLabel: '💣 ', aboveShowsDelta: true };
		expect(formatScore(demineur, 83)).toBe('01:23');
		expect(formatScore(demineur, 100005)).toBe('💣 5');
		const codecolor: ScoreFormat = { kind: 'threshold', at: 100000, below: { kind: 'count', one: 'essai', many: 'essais' }, aboveLabel: '❌' };
		expect(formatScore(codecolor, 4)).toBe('4 essais');
		expect(formatScore(codecolor, 100003)).toBe('❌');
	});
});
