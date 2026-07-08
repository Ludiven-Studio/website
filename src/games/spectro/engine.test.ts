import { describe, it, expect } from 'vitest';
import { generateMelody, judge, comboMult, rankOf, DIFFS } from './engine';

describe('spectro engine', () => {
	it('is deterministic: same seed + difficulty → same melody', () => {
		expect(generateMelody(1234, 1)).toEqual(generateMelody(1234, 1));
	});

	it('respects difficulty length and keeps pitches in a sane range', () => {
		for (let d = 0; d < 3; d++) {
			const m = generateMelody(42, d);
			expect(m.notes.length).toBe(DIFFS[d].count);
			expect(m.tempo).toBe(DIFFS[d].tempo);
			for (const n of m.notes) {
				expect(n.dur).toBeGreaterThan(0);
				expect(n.midi).toBeGreaterThanOrEqual(DIFFS[d].root); // pentatonic degrees ≥ 0
				expect(n.midi).toBeLessThanOrEqual(DIFFS[d].root + 24); // ≤ 2 octaves up
			}
			expect(m.lo).toBeLessThan(m.hi);
			expect(m.beats).toBe(m.notes.reduce((s, n) => s + n.dur, 0));
		}
	});

	it('notes are laid out contiguously in time', () => {
		const m = generateMelody(7, 2);
		let t = 0;
		for (const n of m.notes) {
			expect(n.start).toBe(t);
			t += n.dur;
		}
	});

	it('grades by cents and scores accordingly', () => {
		expect(judge(0)).toEqual({ grade: 'Parfait', points: 100 });
		expect(judge(25).grade).toBe('Parfait');
		expect(judge(26).grade).toBe('Bien');
		expect(judge(70).grade).toBe('Bien');
		expect(judge(120).grade).toBe('Ok');
		expect(judge(200)).toEqual({ grade: 'Raté', points: 0 });
	});

	it('combo multiplier ramps and caps', () => {
		expect(comboMult(0)).toBe(1);
		expect(comboMult(4)).toBe(1);
		expect(comboMult(5)).toBe(1.5);
		expect(comboMult(10)).toBe(2);
		expect(comboMult(100)).toBe(4); // capped
	});

	it('maps mean points to ranks', () => {
		expect(rankOf(100)).toBe('S');
		expect(rankOf(80)).toBe('A');
		expect(rankOf(65)).toBe('B');
		expect(rankOf(45)).toBe('C');
		expect(rankOf(10)).toBe('D');
	});
});
