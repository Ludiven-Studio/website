/**
 * SUITE MYSTÈRE — pure engine (no UI).
 * Generate a numeric sequence from a hidden rule; the player picks the next
 * term among 4 choices (QCM). Seeded for the daily challenge.
 */

import type { Rng } from '../prng';

export interface Question {
	terms: number[]; // shown terms
	answer: number; // next term
	options: number[]; // 4 choices incl. answer, shuffled
	rule: string; // human label, revealed after answering
}

interface Generated {
	terms: number[];
	answer: number;
	rule: string;
}

export interface DiffLevel {
	label: string;
	families: ((rng: Rng) => Generated)[];
}

const ri = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/* ---------- Rule families ---------- */

const arithmetic = (rng: Rng): Generated => {
	const a = ri(rng, 0, 9);
	let d = ri(rng, 1, 6);
	if (rng() < 0.4) d = -d;
	const f = (i: number) => a + d * i;
	return { terms: [0, 1, 2, 3, 4].map(f), answer: f(5), rule: `on ajoute ${d > 0 ? `+${d}` : d}` };
};

const geometric = (rng: Rng): Generated => {
	const r = ri(rng, 2, 3);
	const a = ri(rng, 1, 4);
	const f = (i: number) => a * r ** i;
	return { terms: [0, 1, 2, 3].map(f), answer: f(4), rule: `on multiplie ×${r}` };
};

const alternating = (rng: Rng): Generated => {
	const start = ri(rng, 1, 6);
	let d1 = ri(rng, 1, 5);
	let d2 = ri(rng, 1, 5);
	if (d1 === d2) d2 += 1;
	const seq = [start];
	for (let i = 0; i < 5; i++) seq.push(seq[seq.length - 1] + (i % 2 === 0 ? d1 : d2));
	return { terms: seq.slice(0, 5), answer: seq[5], rule: `+${d1} puis +${d2}, en alternance` };
};

const squares = (rng: Rng): Generated => {
	const s = ri(rng, 1, 3);
	const f = (i: number) => (i + s) ** 2;
	return { terms: [0, 1, 2, 3, 4].map(f), answer: f(5), rule: `les carrés` };
};

const quadratic = (rng: Rng): Generated => {
	const a = ri(rng, 1, 2);
	const b = ri(rng, -3, 3);
	const c = ri(rng, 0, 5);
	const f = (i: number) => a * i * i + b * i + c;
	return { terms: [0, 1, 2, 3, 4].map(f), answer: f(5), rule: `suite quadratique (a·n² + b·n + c)` };
};

const fibonacci = (rng: Rng): Generated => {
	const seq = [ri(rng, 1, 4), ri(rng, 1, 5)];
	for (let i = 0; i < 4; i++) seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
	return { terms: seq.slice(0, 5), answer: seq[5], rule: `chaque terme = somme des deux précédents` };
};

const interleaved = (rng: Rng): Generated => {
	const a1 = ri(rng, 1, 5);
	const d1 = ri(rng, 1, 4);
	const a2 = ri(rng, 6, 12);
	let d2 = ri(rng, 1, 4);
	if (d2 === d1) d2 += 1;
	const A = (i: number) => a1 + d1 * i;
	const B = (i: number) => a2 + d2 * i;
	// A0 B0 A1 B1 A2 -> answer B2
	return { terms: [A(0), B(0), A(1), B(1), A(2)], answer: B(2), rule: `deux suites entrelacées` };
};

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', families: [arithmetic] },
	moyen: { label: 'Moyen', families: [geometric, alternating, squares] },
	difficile: { label: 'Difficile', families: [fibonacci, quadratic, interleaved] },
};

/* ---------- Distractors ---------- */

function makeOptions(g: Generated, rng: Rng): number[] {
	const { terms, answer } = g;
	const last = terms[terms.length - 1];
	const prev = terms[terms.length - 2] ?? last;
	const unit = Math.max(1, Math.abs(last - prev));
	const deltas = shuffle([unit, -unit, 1, -1, 2, -2, unit + 1, -(unit + 1), 2 * unit, -2 * unit], rng);

	const options = new Set<number>([answer]);
	for (const d of deltas) {
		if (options.size >= 4) break;
		options.add(answer + d);
	}
	let k = 3;
	while (options.size < 4) options.add(answer + k++); // safety
	return shuffle([...options], rng);
}

/** Generate one QCM question for the given difficulty. */
export function generateQuestion(diff: DiffLevel, rng: Rng = Math.random): Question {
	const family = diff.families[Math.floor(rng() * diff.families.length)];
	const g = family(rng);
	return { terms: g.terms, answer: g.answer, options: makeOptions(g, rng), rule: g.rule };
}
