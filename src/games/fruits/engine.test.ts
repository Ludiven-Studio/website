import { describe, it, expect } from 'vitest';
import { DIFFS, generateQuestion, evalEquation, type Question } from './engine';
import { mulberry32 } from '../prng';

// Solve the linear sub-system (equations without ×) by Gaussian elimination → fruit values.
function solveValues(q: Question): number[] {
	const n = q.fruits.length;
	const rows: number[][] = [];
	for (const eq of q.equations) {
		if (eq.tokens.some((t) => t.kind === 'op' && t.op === '×')) continue; // skip product clues
		const co = new Array(n).fill(0);
		let sign = 1;
		for (const t of eq.tokens) {
			if (t.kind === 'op') sign = t.op === '−' ? -1 : 1;
			else { co[t.idx] += sign * (t.coef ?? 1); sign = 1; }
		}
		rows.push([...co, eq.result]);
	}
	// take n independent rows and eliminate
	const M = rows.slice(0, n).map((r) => [...r]);
	for (let c = 0; c < n; c++) {
		let p = c; while (p < M.length && Math.abs(M[p][c]) < 1e-9) p++;
		[M[c], M[p]] = [M[p], M[c]];
		const pivot = M[c][c];
		for (let j = c; j <= n; j++) M[c][j] /= pivot;
		for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
	}
	return M.map((r) => Math.round(r[n]));
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

	it('equations (incl. coefficients & products) evaluate to their results; answer matches the solution', () => {
		for (const key of Object.keys(DIFFS)) {
			for (let s = 0; s < 12; s++) {
				const q = generateQuestion(DIFFS[key], mulberry32(54321 + s * 7 + DIFFS[key].n));
				const values = solveValues(q);
				for (const eq of q.equations) expect(evalEquation(eq, values)).toBe(eq.result);
				expect(q.options[q.answerIndex]).toBe(values[q.askIdx]);
			}
		}
	});

	it('difficile is a real system: ≥4 equations, none isolates a single fruit, has coefficients and a ×', () => {
		for (let s = 0; s < 30; s++) {
			const q = generateQuestion(DIFFS.difficile, mulberry32(11 * (s + 1)));
			expect(q.equations.length).toBeGreaterThanOrEqual(4);
			for (const eq of q.equations) {
				const fruitTokens = eq.tokens.filter((t) => t.kind === 'fruit').length;
				expect(fruitTokens, 'no single-fruit equation').toBeGreaterThanOrEqual(2);
			}
			expect(q.equations.some((e) => e.tokens.some((t) => t.kind === 'op' && t.op === '×')), 'has ×').toBe(true);
			expect(q.equations.some((e) => e.tokens.some((t) => t.kind === 'fruit' && (t.coef ?? 1) > 1)), 'has a coefficient').toBe(true);
		}
	});
});
