/**
 * CALCUL DE FRUITS — pure engine (no UI). Fruit-algebra QCM: a small set of
 * equations (fruit emojis that add / multiply to numbers); the player finds the
 * value of ONE fruit among 4 numeric choices.
 *  - facile : 3-fruit "staircase" (additions only). The asked fruit is the LAST
 *             link, so all three equations are needed — no line gives it away.
 *  - moyen  : same staircase but one link is a multiplication.
 *  - difficile : a real simultaneous system (two sums + one product) where no
 *             equation isolates a fruit → you must combine them. Uniqueness of
 *             the solution is brute-force checked at generation (a product can
 *             otherwise admit two positive roots).
 * Seeded for the daily challenge.
 */

import type { Rng } from '../prng';

export type Op = '+' | '−' | '×';
export type Token = { kind: 'fruit'; idx: number; coef?: number } | { kind: 'op'; op: Op };
export interface Equation { tokens: Token[]; result: number; }
export interface Question {
	fruits: string[];
	equations: Equation[];
	askIdx: number;
	options: number[];
	answerIndex: number;
	rule: string;
}

export interface DiffLevel {
	label: string;
	n: number;
	max: number;
	mul: boolean;    // staircase: one link is a multiplication
	system: boolean; // simultaneous system (two sums + one product) — hardest
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', n: 3, max: 9, mul: false, system: false },
	moyen: { label: 'Moyen', n: 3, max: 10, mul: true, system: false },
	difficile: { label: 'Difficile', n: 3, max: 10, mul: false, system: true },
};

// Single-item, unambiguous fruits only — avoid 🍒 (two cherries) / 🍇 (a bunch), which read
// as "several fruits" and make players miscount an unknown that stands for ONE value.
const POOL = ['🍎', '🍌', '🍊', '🍋', '🍐', '🍑', '🍓', '🍍', '🥝', '🍉', '🥭', '🍅'];

const ri = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
function shuffle<T>(arr: T[], rng: Rng): T[] {
	const r = [...arr];
	for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
	return r;
}
const fruit = (idx: number): Token => ({ kind: 'fruit', idx });
const op = (o: Op): Token => ({ kind: 'op', op: o });

/** Evaluate an equation (× before + / −), respecting per-fruit coefficients. */
export function evalEquation(eq: Equation, values: number[]): number {
	const nums: number[] = [];
	const ops: Op[] = [];
	for (const t of eq.tokens) { if (t.kind === 'fruit') nums.push((t.coef ?? 1) * values[t.idx]); else ops.push(t.op); }
	const v: number[] = [nums[0]];
	const o: Exclude<Op, '×'>[] = [];
	for (let k = 0; k < ops.length; k++) {
		if (ops[k] === '×') v[v.length - 1] *= nums[k + 1];
		else { o.push(ops[k] as Exclude<Op, '×'>); v.push(nums[k + 1]); }
	}
	let r = v[0];
	for (let k = 0; k < o.length; k++) r = o[k] === '+' ? r + v[k + 1] : r - v[k + 1];
	return r;
}

/** Count integer solutions of the system in [1, hi]^n (stops at 2 — we only need "unique?"). */
function solutionCount(equations: Equation[], n: number, hi: number): number {
	const vals = new Array<number>(n).fill(1);
	let count = 0;
	const rec = (i: number): void => {
		if (count > 1) return;
		if (i === n) { if (equations.every((eq) => evalEquation(eq, vals) === eq.result)) count++; return; }
		for (let v = 1; v <= hi; v++) { vals[i] = v; rec(i + 1); if (count > 1) return; }
	};
	rec(0);
	return count;
}

interface Gen { fruits: string[]; values: number[]; equations: Equation[]; askIdx: number; }

/** Staircase (facile / moyen): eq0 pins fruit 0, each next link ties in one more fruit.
 *  The asked fruit is the LAST one, so every equation is needed to reach it. */
function genStaircase(diff: DiffLevel, rng: Rng): Gen {
	const n = diff.n;
	const fruits = shuffle(POOL, rng).slice(0, n);
	const values: number[] = [];
	while (values.length < n) { const x = ri(rng, 2, diff.max); if (!values.includes(x)) values.push(x); }
	const equations: Equation[] = [];

	// eq0 pins fruit 0 (A + A [+ A] = c·A)
	const c = ri(rng, 2, 3);
	const t0: Token[] = [];
	for (let k = 0; k < c; k++) { if (k > 0) t0.push(op('+')); t0.push(fruit(0)); }
	equations.push({ tokens: t0, result: c * values[0] });

	// links 1..n-1: one of them is a product when the level allows multiplication
	const mulLink = diff.mul ? ri(rng, 1, n - 1) : -1;
	for (let i = 1; i < n; i++) {
		const j = i - 1;
		if (i === mulLink) equations.push({ tokens: [fruit(j), op('×'), fruit(i)], result: values[j] * values[i] });
		else equations.push({ tokens: [fruit(j), op('+'), fruit(i)], result: values[j] + values[i] });
	}
	return { fruits, values, equations, askIdx: n - 1 };
}

/** Light simultaneous system (difficile): two pair-sums + one product, no equation
 *  isolates a fruit → the three must be combined. Uniqueness is brute-force checked. */
function genSystemLite(diff: DiffLevel, rng: Rng): Gen {
	const fruits = shuffle(POOL, rng).slice(0, 3);
	let values: number[] = [];
	let equations: Equation[] = [];
	for (let tries = 0; tries < 400; tries++) {
		values = [];
		while (values.length < 3) { const x = ri(rng, 2, diff.max); if (!values.includes(x)) values.push(x); }
		const [a, b, cc] = values;
		equations = [
			{ tokens: [fruit(0), op('+'), fruit(1)], result: a + b }, // A + B
			{ tokens: [fruit(1), op('+'), fruit(2)], result: b + cc }, // B + C
			{ tokens: [fruit(0), op('×'), fruit(2)], result: a * cc }, // A × C
		];
		// Any solution satisfies the two sums, so every fruit is ≤ max sum result: that bounds the search.
		const hi = Math.max(a + b, b + cc);
		if (solutionCount(equations, 3, hi) === 1) break;
		if (tries === 399) equations[2] = { tokens: [fruit(0), op('+'), fruit(2)], result: a + cc }; // safe fallback (linear, always unique)
	}
	return { fruits, values, equations, askIdx: ri(rng, 0, 2) };
}

/** Generate one fruit-algebra question for the given difficulty. */
export function generateQuestion(diff: DiffLevel, rng: Rng = Math.random): Question {
	const { fruits, values, equations, askIdx } = diff.system ? genSystemLite(diff, rng) : genStaircase(diff, rng);

	const answer = values[askIdx];
	const opts = new Set<number>([answer]);
	for (const cand of shuffle([answer - 1, answer + 1, answer - 2, answer + 2, ...values], rng)) {
		if (opts.size >= 4) break;
		if (cand > 0 && cand !== answer) opts.add(cand);
	}
	for (let extra = answer + 3; opts.size < 4; extra++) if (extra > 0 && extra !== answer) opts.add(extra);
	const options = shuffle([...opts], rng);

	const rule = fruits.map((f, i) => `${f} = ${values[i]}`).join(' · ');
	return { fruits, equations, askIdx, options, answerIndex: options.indexOf(answer), rule };
}
