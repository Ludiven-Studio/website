import { describe, it, expect } from 'vitest';
import { encodePacked, decodePacked, formatScore, fmtCentis, fmtSeconds, type ScoreFormat } from './scoreFormat';

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
		expect(formatScore({ kind: 'plain', fmt: 'time' }, 125)).toBe('2:05');
		expect(formatScore({ kind: 'plain', fmt: 'num' }, 7)).toBe('7');
		expect(formatScore({ kind: 'plain', fmt: 'name' }, 42)).toBe('');
	});

	it('pluralizes counts', () => {
		const f: ScoreFormat = { kind: 'count', one: 'essai', many: 'essais' };
		expect(formatScore(f, 1)).toBe('1 essai');
		expect(formatScore(f, 3)).toBe('3 essais');
	});

	it('shows whole seconds only, minutes above 60 s', () => {
		expect(fmtSeconds(0)).toBe('0 s');
		expect(fmtSeconds(43.99)).toBe('43 s'); // truncated, never ahead of the real time
		expect(fmtSeconds(59)).toBe('59 s');
		expect(fmtSeconds(60)).toBe('1:00');
		expect(fmtSeconds(83.45)).toBe('1:23');
		expect(fmtSeconds(725)).toBe('12:05');
		expect(fmtSeconds(-5)).toBe('0 s');
	});

	it('scales durations to seconds whatever the stored unit', () => {
		expect(formatScore({ kind: 'duration', div: 10 }, 123)).toBe('12 s'); // esquive tenths
		expect(formatScore({ kind: 'duration', div: 1000 }, 8340)).toBe('8 s'); // drift ms
		expect(formatScore({ kind: 'duration', div: 1000 }, 65000)).toBe('1:05');
	});

	it('renders time races from centiseconds', () => {
		const centis: ScoreFormat = { kind: 'duration', div: 100 };
		expect(fmtCentis(583)).toBe('5 s');
		expect(formatScore(centis, 583)).toBe('5 s');
		expect(formatScore(centis, 4312)).toBe('43 s');
		expect(formatScore(centis, 8345)).toBe('1:23');
	});

	it('renders packed count + time', () => {
		const f: ScoreFormat = { kind: 'packed', radix: 100000, fields: [{ as: 'int', unit: 'coups' }, { as: 'time', div: 10 }] };
		expect(formatScore(f, encodePacked(100000, [3, 420]))).toBe('3 coups · 42 s');
		// centisecond packed (billard/golf/angry)
		const cc: ScoreFormat = { kind: 'packed', radix: 10_000_000, fields: [{ as: 'int', unit: 'coups' }, { as: 'time', div: 100 }] };
		expect(formatScore(cc, encodePacked(10_000_000, [3, 8345]))).toBe('3 coups · 1:23');
		// inverted `base` field (réussite): stored (52 - cards) so "more cards" sorts ascending, rendered back to the count
		const reu: ScoreFormat = { kind: 'packed', radix: 10_000_000, fields: [{ as: 'int', unit: 'cartes', base: 52 }, { as: 'time', div: 100 }] };
		expect(formatScore(reu, encodePacked(10_000_000, [52 - 40, 8345]))).toBe('40 cartes · 1:23');
		expect(formatScore(reu, encodePacked(10_000_000, [0, 4312]))).toBe('52 cartes · 43 s');
	});

	it('still orders hundredth-apart records even though it shows the same label', () => {
		const centis: ScoreFormat = { kind: 'duration', div: 100 };
		expect(formatScore(centis, 4300)).toBe(formatScore(centis, 4399)); // same on screen…
		expect(4300).toBeLessThan(4399); // …but the stored value still breaks the tie
	});

	it('branches on a loss threshold', () => {
		const demineur: ScoreFormat = { kind: 'threshold', at: 100000, below: { kind: 'plain', fmt: 'time' }, aboveLabel: '💣 ', aboveShowsDelta: true };
		expect(formatScore(demineur, 83)).toBe('1:23');
		expect(formatScore(demineur, 100005)).toBe('💣 5');
		const codecolor: ScoreFormat = { kind: 'threshold', at: 100000, below: { kind: 'count', one: 'essai', many: 'essais' }, aboveLabel: '❌' };
		expect(formatScore(codecolor, 4)).toBe('4 essais');
		expect(formatScore(codecolor, 100003)).toBe('❌');
	});
});
