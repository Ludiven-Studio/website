/**
 * CALCUL DE FRUITS — pure engine (no UI). Fruit-algebra QCM: a small system of
 * equations (fruit emojis that add / subtract / multiply to numbers); the player
 * finds the value of one fruit among 4 numeric choices.
 *  - facile / moyen : "staircase" system (each equation pins one fruit) — easy.
 *  - difficile      : a real simultaneous linear system (coefficients, no equation
 *                     isolates a fruit) + a product clue → needs elimination.
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
	mul: boolean;
	sub: boolean;
	system: boolean; // true → simultaneous linear system (harder)
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', n: 2, max: 9, mul: false, sub: false, system: false },
	moyen: { label: 'Moyen', n: 3, max: 10, mul: false, sub: true, system: false },
	difficile: { label: 'Difficile', n: 3, max: 12, mul: true, sub: false, system: true },
};

const POOL = ['🍎', '🍌', '🍒', '🍇', '🍊', '🍓', '🥝', '🍍', '🍑', '🍐'];

const ri = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
function shuffle<T>(arr: T[], rng: Rng): T[] {
	const r = [...arr];
	for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
	return r;
}
const det3 = (m: number[][]) =>
	m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
	- m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
	+ m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

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

/** Staircase generation (facile / moyen): each equation pins one fruit. */
function genStaircase(diff: DiffLevel, rng: Rng): { fruits: string[]; values: number[]; equations: Equation[] } {
	const n = diff.n;
	const fruits = shuffle(POOL, rng).slice(0, n);
	const values: number[] = [];
	while (values.length < n) { const x = ri(rng, 2, diff.max); if (!values.includes(x)) values.push(x); }
	const equations: Equation[] = [];

	const c = ri(rng, 2, 3);
	const t0: Token[] = [];
	for (let k = 0; k < c; k++) { if (k > 0) t0.push({ kind: 'op', op: '+' }); t0.push({ kind: 'fruit', idx: 0 }); }
	equations.push({ tokens: t0, result: c * values[0] });

	for (let i = 1; i < n; i++) {
		const j = i - 1;
		if (diff.mul && rng() < 0.6) equations.push({ tokens: [{ kind: 'fruit', idx: j }, { kind: 'op', op: '×' }, { kind: 'fruit', idx: i }], result: values[j] * values[i] });
		else if (diff.sub && values[j] > values[i] && rng() < 0.45) equations.push({ tokens: [{ kind: 'fruit', idx: j }, { kind: 'op', op: '−' }, { kind: 'fruit', idx: i }], result: values[j] - values[i] });
		else equations.push({ tokens: [{ kind: 'fruit', idx: j }, { kind: 'op', op: '+' }, { kind: 'fruit', idx: i }], result: values[j] + values[i] });
	}
	return { fruits, values, equations };
}

/** Simultaneous linear system (difficile): coefficients, no equation isolates a fruit, + a product clue. */
function genSystem(diff: DiffLevel, rng: Rng): { fruits: string[]; values: number[]; equations: Equation[] } {
	const fruits = shuffle(POOL, rng).slice(0, 3);
	const values: number[] = [];
	while (values.length < 3) { const x = ri(rng, 2, diff.max); if (!values.includes(x)) values.push(x); }

	let M: number[][] = [];
	for (let tries = 0; tries < 300; tries++) {
		M = [];
		for (let r = 0; r < 3; r++) {
			let row: number[];
			do { row = [ri(rng, 0, 3), ri(rng, 0, 3), ri(rng, 0, 3)]; } while (row.filter((c) => c > 0).length < 2); // no isolation
			M.push(row);
		}
		if (Math.abs(det3(M)) >= 1) break; // invertible → unique solution
	}
	const equations: Equation[] = M.map((row) => {
		const tokens: Token[] = [];
		for (let i = 0; i < 3; i++) { if (row[i] === 0) continue; if (tokens.length) tokens.push({ kind: 'op', op: '+' }); tokens.push({ kind: 'fruit', idx: i, coef: row[i] }); }
		return { tokens, result: row[0] * values[0] + row[1] * values[1] + row[2] * values[2] };
	});
	const [pi, pj] = shuffle([0, 1, 2], rng).slice(0, 2); // a product clue
	equations.push({ tokens: [{ kind: 'fruit', idx: pi }, { kind: 'op', op: '×' }, { kind: 'fruit', idx: pj }], result: values[pi] * values[pj] });
	return { fruits, values, equations };
}

/** Generate one fruit-algebra question for the given difficulty. */
export function generateQuestion(diff: DiffLevel, rng: Rng = Math.random): Question {
	const { fruits, values, equations } = diff.system ? genSystem(diff, rng) : genStaircase(diff, rng);

	const askIdx = ri(rng, 0, values.length - 1);
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
