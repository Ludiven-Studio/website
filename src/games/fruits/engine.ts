/**
 * CALCUL DE FRUITS — pure engine (no UI). Fruit-algebra QCM: a small system of
 * equations (fruit emojis that add / subtract / multiply to numbers); the player
 * finds the value of one fruit among 4 numeric choices. Triangular generation →
 * always uniquely solvable. Seeded for the daily challenge.
 */

import type { Rng } from '../prng';

export type Op = '+' | '−' | '×';
export type Token = { kind: 'fruit'; idx: number } | { kind: 'op'; op: Op };
export interface Equation { tokens: Token[]; result: number; }
export interface Question {
	fruits: string[]; // emoji per unknown
	equations: Equation[];
	askIdx: number; // which fruit's value to find
	options: number[]; // 4 numeric choices, shuffled
	answerIndex: number; // index of the correct option
	rule: string; // solving steps (revealed after answering)
}

export interface DiffLevel {
	label: string;
	n: number; // number of fruits/unknowns
	max: number; // max fruit value
	mul: boolean; // allow multiplication
	sub: boolean; // allow subtraction
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', n: 2, max: 9, mul: false, sub: false },
	moyen: { label: 'Moyen', n: 3, max: 10, mul: false, sub: true },
	difficile: { label: 'Difficile', n: 3, max: 12, mul: true, sub: true },
};

const POOL = ['🍎', '🍌', '🍒', '🍇', '🍊', '🍓', '🥝', '🍍', '🍑', '🍐'];

const ri = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
function shuffle<T>(arr: T[], rng: Rng): T[] {
	const r = [...arr];
	for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
	return r;
}

/** Evaluate an equation (× before + / −) given the fruit values — used in tests/solver. */
export function evalEquation(eq: Equation, values: number[]): number {
	const nums: number[] = [];
	const ops: Op[] = [];
	for (const t of eq.tokens) { if (t.kind === 'fruit') nums.push(values[t.idx]); else ops.push(t.op); }
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

/** Generate one fruit-algebra question for the given difficulty. */
export function generateQuestion(diff: DiffLevel, rng: Rng = Math.random): Question {
	const n = diff.n;
	const fruits = shuffle(POOL, rng).slice(0, n);
	const values: number[] = [];
	while (values.length < n) { const x = ri(rng, 2, diff.max); if (!values.includes(x)) values.push(x); }

	const equations: Equation[] = [];
	const steps: string[] = [];

	// eq0: reveal fruit 0 by repeating it (A + A [+ A] = c·A)
	const c = ri(rng, 2, 3);
	const t0: Token[] = [];
	for (let k = 0; k < c; k++) { if (k > 0) t0.push({ kind: 'op', op: '+' }); t0.push({ kind: 'fruit', idx: 0 }); }
	equations.push({ tokens: t0, result: c * values[0] });
	steps.push(`${fruits[0]} = ${c * values[0]} ÷ ${c} = ${values[0]}`);

	// each next fruit linked to an already-known one (triangular → unique)
	for (let i = 1; i < n; i++) {
		const j = i - 1; // previous fruit, already solved
		if (diff.mul && rng() < 0.6) {
			equations.push({ tokens: [{ kind: 'fruit', idx: j }, { kind: 'op', op: '×' }, { kind: 'fruit', idx: i }], result: values[j] * values[i] });
			steps.push(`${fruits[i]} = ${values[j] * values[i]} ÷ ${values[j]} = ${values[i]}`);
		} else if (diff.sub && values[j] > values[i] && rng() < 0.45) {
			equations.push({ tokens: [{ kind: 'fruit', idx: j }, { kind: 'op', op: '−' }, { kind: 'fruit', idx: i }], result: values[j] - values[i] });
			steps.push(`${fruits[i]} = ${fruits[j]} − ${values[j] - values[i]} = ${values[i]}`);
		} else {
			equations.push({ tokens: [{ kind: 'fruit', idx: j }, { kind: 'op', op: '+' }, { kind: 'fruit', idx: i }], result: values[j] + values[i] });
			steps.push(`${fruits[i]} = ${values[j] + values[i]} − ${values[j]} = ${values[i]}`);
		}
	}

	const askIdx = ri(rng, 0, n - 1);
	const answer = values[askIdx];

	const opts = new Set<number>([answer]);
	for (const cand of shuffle([answer - 1, answer + 1, answer - 2, answer + 2, ...values], rng)) {
		if (opts.size >= 4) break;
		if (cand > 0 && cand !== answer) opts.add(cand);
	}
	for (let extra = answer + 3; opts.size < 4; extra++) if (extra > 0 && extra !== answer) opts.add(extra);
	const options = shuffle([...opts], rng);

	return { fruits, equations, askIdx, options, answerIndex: options.indexOf(answer), rule: steps.join(' ; ') };
}
