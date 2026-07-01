import { describe, it, expect } from 'vitest';
import { DIFFS, generateQuestion, evalEquation, type Question } from './engine';
import { mulberry32 } from '../prng';

const hasMul = (q: Question) => q.equations.some((e) => e.tokens.some((t) => t.kind === 'op' && t.op === '×'));

/** Brute-force every integer assignment in [1, hi]^n (capped at 2 solutions — we test uniqueness). */
function solutions(q: Question, hi = 25): number[][] {
	const n = q.fruits.length;
	const vals = new Array<number>(n).fill(1);
	const sols: number[][] = [];
	const rec = (i: number): void => {
		if (sols.length > 1) return;
		if (i === n) { if (q.equations.every((eq) => evalEquation(eq, vals) === eq.result)) sols.push([...vals]); return; }
		for (let v = 1; v <= hi; v++) { vals[i] = v; rec(i + 1); if (sols.length > 1) return; }
	};
	rec(0);
	return sols;
}

describe('fruits engine', () => {
	it('one correct option among 4 distinct, deterministic', () => {
		for (const key of Object.keys(DIFFS)) {
			for (let s = 0; s < 40; s++) {
				const q = generateQuestion(DIFFS[key], mulberry32(1000 * (s + 1) + DIFFS[key].n));
				expect(q.options.length).toBe(4);
				expect(new Set(q.options).size).toBe(4);
				expect(q.options.every((o) => o > 0)).toBe(true);
				expect(q.fruits.length).toBe(DIFFS[key].n);
				expect(q.rule.length).toBeGreaterThan(0);
			}
		}
		const a = generateQuestion(DIFFS.difficile, mulberry32(2026));
		const b = generateQuestion(DIFFS.difficile, mulberry32(2026));
		expect(a).toEqual(b);
	});

	it('every puzzle has a UNIQUE solution and the marked answer is that value', () => {
		for (const key of Object.keys(DIFFS)) {
			for (let s = 0; s < 40; s++) {
				const q = generateQuestion(DIFFS[key], mulberry32(54321 + s * 7 + DIFFS[key].n));
				const sols = solutions(q);
				expect(sols.length, `unique solution (${key} seed ${s})`).toBe(1);
				for (const eq of q.equations) expect(evalEquation(eq, sols[0])).toBe(eq.result);
				expect(q.options[q.answerIndex]).toBe(sols[0][q.askIdx]);
			}
		}
	});

	it('facile: additions only, asks the terminal fruit so every equation is needed', () => {
		for (let s = 0; s < 40; s++) {
			const q = generateQuestion(DIFFS.facile, mulberry32(7 * (s + 1)));
			expect(hasMul(q)).toBe(false);
			expect(q.askIdx).toBe(q.fruits.length - 1);
		}
	});

	it('moyen: staircase with a multiplication, still asks the terminal fruit', () => {
		for (let s = 0; s < 40; s++) {
			const q = generateQuestion(DIFFS.moyen, mulberry32(13 * (s + 1)));
			expect(hasMul(q)).toBe(true);
			expect(q.askIdx).toBe(q.fruits.length - 1);
		}
	});

	it('difficile: a real system (no equation isolates a fruit) with a multiplication', () => {
		for (let s = 0; s < 40; s++) {
			const q = generateQuestion(DIFFS.difficile, mulberry32(11 * (s + 1)));
			expect(hasMul(q)).toBe(true);
			for (const eq of q.equations) {
				const fruitTokens = eq.tokens.filter((t) => t.kind === 'fruit').length;
				expect(fruitTokens, 'no single-fruit equation').toBeGreaterThanOrEqual(2);
			}
		}
	});
});
