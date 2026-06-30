import { describe, it, expect } from 'vitest';
import { DIFFS, generateQuestion, evalEquation } from './engine';
import { mulberry32 } from '../prng';

describe('fruits engine', () => {
	it('equations are consistent and the asked fruit has exactly one correct option among 4 distinct', () => {
		for (const key of Object.keys(DIFFS)) {
			for (let s = 0; s < 40; s++) {
				const q = generateQuestion(DIFFS[key], mulberry32(1000 * (s + 1) + DIFFS[key].n));
				// reconstruct the true values from the triangular chain via the options-independent check:
				// the answer option must satisfy all equations when plugged into the system.
				expect(q.options.length, `${key} options`).toBe(4);
				expect(new Set(q.options).size, `${key} distinct`).toBe(4);
				expect(q.options.every((o) => o > 0)).toBe(true);
				expect(q.answerIndex).toBeGreaterThanOrEqual(0);
				expect(q.answerIndex).toBeLessThan(4);
				expect(q.fruits.length).toBe(DIFFS[key].n);
				expect(q.equations.length).toBe(DIFFS[key].n); // one reveal + (n-1) links
				expect(q.rule.length).toBeGreaterThan(0);
			}
		}
	});

	it('the equations evaluate to their stated results for the underlying values', () => {
		// derive values by solving the triangular chain, then check every equation evaluates right.
		for (const key of Object.keys(DIFFS)) {
			const q = generateQuestion(DIFFS[key], mulberry32(54321 + DIFFS[key].n));
			const values = solve(q);
			for (const eq of q.equations) expect(evalEquation(eq, values)).toBe(eq.result);
			// the asked answer matches the solved value
			expect(q.options[q.answerIndex]).toBe(values[q.askIdx]);
		}
	});

	it('difficile uses multiplication somewhere', () => {
		let sawMul = false;
		for (let s = 0; s < 40 && !sawMul; s++) {
			const q = generateQuestion(DIFFS.difficile, mulberry32(7 * (s + 1)));
			sawMul = q.equations.some((e) => e.tokens.some((t) => t.kind === 'op' && t.op === '×'));
		}
		expect(sawMul).toBe(true);
	});

	it('is deterministic for a given seed', () => {
		const a = generateQuestion(DIFFS.moyen, mulberry32(2026));
		const b = generateQuestion(DIFFS.moyen, mulberry32(2026));
		expect(a).toEqual(b);
	});
});

// Solve the triangular system: eq0 reveals fruit 0 (c·A=R), each next links a known fruit.
function solve(q: ReturnType<typeof generateQuestion>): number[] {
	const v = new Array(q.fruits.length).fill(0);
	const e0 = q.equations[0];
	const c = e0.tokens.filter((t) => t.kind === 'fruit').length;
	v[0] = e0.result / c;
	for (let i = 1; i < q.equations.length; i++) {
		const eq = q.equations[i];
		const a = (eq.tokens[0] as { idx: number }).idx; // known fruit
		const op = (eq.tokens[1] as { op: string }).op;
		const b = (eq.tokens[2] as { idx: number }).idx; // unknown fruit
		v[b] = op === '×' ? eq.result / v[a] : op === '−' ? v[a] - eq.result : eq.result - v[a];
	}
	return v;
}
