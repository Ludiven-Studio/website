/**
 * SYMBOLES — pure engine (no UI).
 * Generate a sequence of visual symbols (cells) from a hidden rule; the player
 * picks the next symbol among 4 choices (QCM). Seeded for the daily challenge.
 * A cell is a CSS-drawn token: shape + color + rotation + count.
 */

import type { Rng } from '../prng';

export type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon';

export interface Cell {
	shape: Shape;
	color: number; // index into COLORS palette
	rotation: number; // degrees, multiples of 45/90
	count: number; // 1..4 mini-shapes in the cell
}

export interface Question {
	terms: Cell[]; // shown terms
	answer: Cell; // next term
	options: Cell[]; // 4 choices incl. answer, shuffled
	rule: string; // human label, revealed after answering
}

interface Generated {
	terms: Cell[];
	answer: Cell;
	rule: string;
}

export interface DiffLevel {
	label: string;
	families: ((rng: Rng) => Generated)[];
}

/** Palette indices map to CSS colors in the UI. Keep in sync with SymbolesGame. */
export const COLORS = ['#5b8def', '#e6566f', '#2f9e6f', '#f0a830', '#9b6cf0', '#22b5c9'];
export const SHAPES: Shape[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon'];

const ri = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const mod = (n: number, m: number) => ((n % m) + m) % m;

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Stable identity of a cell — used for option uniqueness and answer matching. */
export function cellKey(c: Cell): string {
	return `${c.shape}|${c.color}|${mod(c.rotation, 360)}|${c.count}`;
}

const cellEq = (a: Cell, b: Cell) => cellKey(a) === cellKey(b);

/** A fixed-attribute random base cell. */
const baseCell = (rng: Rng): Cell => ({
	shape: pick(rng, SHAPES),
	color: ri(rng, 0, COLORS.length - 1),
	rotation: 0,
	count: 1,
});

/* ---------- Rule families ---------- */

// Period-2/3 pattern that repeats: A B A B … or A B C A B C …
const repeat = (rng: Rng): Generated => {
	const period = ri(rng, 2, 3);
	const motif: Cell[] = [];
	for (let i = 0; i < period; i++) {
		let c = baseCell(rng);
		// ensure cells in the motif differ from each other
		let guard = 0;
		while (motif.some((m) => cellEq(m, c)) && guard++ < 12) c = baseCell(rng);
		motif.push(c);
	}
	const at = (i: number) => ({ ...motif[mod(i, period)] });
	return {
		terms: [0, 1, 2, 3, 4].map(at),
		answer: at(5),
		rule: period === 2 ? 'le motif se répète (A B A B…)' : 'le motif se répète (A B C A B C…)',
	};
};

// Two distinct symbols alternating.
const alternate = (rng: Rng): Generated => {
	const a = baseCell(rng);
	let b = baseCell(rng);
	let guard = 0;
	while (cellEq(a, b) && guard++ < 12) b = baseCell(rng);
	const at = (i: number) => ({ ...(i % 2 === 0 ? a : b) });
	return { terms: [0, 1, 2, 3, 4].map(at), answer: at(5), rule: 'deux symboles en alternance' };
};

// Same color, shape advances in the ordered list (+step).
const shapeCycle = (rng: Rng): Generated => {
	const start = ri(rng, 0, SHAPES.length - 1);
	const step = pick(rng, [1, 2]);
	const color = ri(rng, 0, COLORS.length - 1);
	const at = (i: number): Cell => ({
		shape: SHAPES[mod(start + step * i, SHAPES.length)],
		color,
		rotation: 0,
		count: 1,
	});
	return { terms: [0, 1, 2, 3, 4].map(at), answer: at(5), rule: 'les formes défilent dans l’ordre' };
};

// Same shape, color cycles (+step).
const colorCycle = (rng: Rng): Generated => {
	const start = ri(rng, 0, COLORS.length - 1);
	const step = pick(rng, [1, 2]);
	const shape = pick(rng, SHAPES);
	const at = (i: number): Cell => ({
		shape,
		color: mod(start + step * i, COLORS.length),
		rotation: 0,
		count: 1,
	});
	return { terms: [0, 1, 2, 3, 4].map(at), answer: at(5), rule: 'les couleurs défilent' };
};

// Same symbol, rotation increases by a fixed step.
const rotate = (rng: Rng): Generated => {
	const shape = pick(rng, ['triangle', 'square', 'star', 'diamond', 'hexagon'] as Shape[]);
	const color = ri(rng, 0, COLORS.length - 1);
	const step = pick(rng, [45, 90]) * (rng() < 0.35 ? -1 : 1);
	const at = (i: number): Cell => ({ shape, color, rotation: step * i, count: 1 });
	return {
		terms: [0, 1, 2, 3, 4].map(at),
		answer: at(5),
		rule: `le symbole pivote de ${step > 0 ? '+' : ''}${step}°`,
	};
};

// Same symbol, count of mini-shapes grows then wraps in 1..4.
const countGrow = (rng: Rng): Generated => {
	const shape = pick(rng, SHAPES);
	const color = ri(rng, 0, COLORS.length - 1);
	const start = ri(rng, 1, 2);
	const at = (i: number): Cell => ({ shape, color, rotation: 0, count: mod(start - 1 + i, 4) + 1 });
	return {
		terms: [0, 1, 2, 3, 4].map(at),
		answer: at(5),
		rule: 'le nombre d’éléments augmente (et reboucle)',
	};
};

// Two attributes change together: rotation + color cycle.
const combo = (rng: Rng): Generated => {
	const shape = pick(rng, ['triangle', 'square', 'star', 'diamond', 'hexagon'] as Shape[]);
	const cStart = ri(rng, 0, COLORS.length - 1);
	const rStep = pick(rng, [45, 90]);
	const cStep = pick(rng, [1, 2]);
	const at = (i: number): Cell => ({
		shape,
		color: mod(cStart + cStep * i, COLORS.length),
		rotation: rStep * i,
		count: 1,
	});
	return {
		terms: [0, 1, 2, 3, 4].map(at),
		answer: at(5),
		rule: `il pivote de +${rStep}° et la couleur défile`,
	};
};

// Two interleaved sub-sequences: A0 B0 A1 B1 A2 -> answer B2.
const interleaved = (rng: Rng): Generated => {
	const shapeA = pick(rng, SHAPES);
	const colorA = ri(rng, 0, COLORS.length - 1);
	const stepA = pick(rng, [45, 90]);
	const shapeB = pick(rng, SHAPES);
	const colorB = ri(rng, 0, COLORS.length - 1);
	const A = (i: number): Cell => ({ shape: shapeA, color: colorA, rotation: stepA * i, count: 1 });
	const B = (i: number): Cell => ({ shape: shapeB, color: colorB, rotation: 0, count: mod(i, 4) + 1 });
	return { terms: [A(0), B(0), A(1), B(1), A(2)], answer: B(2), rule: 'deux suites entrelacées' };
};

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', families: [repeat, alternate] },
	moyen: { label: 'Moyen', families: [shapeCycle, colorCycle, rotate, countGrow] },
	difficile: { label: 'Difficile', families: [combo, interleaved] },
};

/* ---------- Distractors ---------- */

/** Mutate one attribute of a cell to build a plausible-but-wrong option. */
function nudge(c: Cell, which: number, rng: Rng): Cell {
	const out = { ...c };
	switch (mod(which, 4)) {
		case 0:
			out.shape = SHAPES[mod(SHAPES.indexOf(c.shape) + (rng() < 0.5 ? 1 : -1), SHAPES.length)];
			break;
		case 1:
			out.color = mod(c.color + (rng() < 0.5 ? 1 : -1), COLORS.length);
			break;
		case 2:
			out.rotation = c.rotation + pick(rng, [45, -45, 90, -90]);
			break;
		default:
			out.count = mod(c.count - 1 + (rng() < 0.5 ? 1 : 3), 4) + 1;
	}
	return out;
}

function makeOptions(g: Generated, rng: Rng): Cell[] {
	const { answer } = g;
	const byKey = new Map<string, Cell>([[cellKey(answer), answer]]);
	const order = shuffle([0, 1, 2, 3, 0, 1, 2, 3], rng);
	let i = 0;
	while (byKey.size < 4 && i < order.length) {
		const cand = nudge(answer, order[i++], rng);
		byKey.set(cellKey(cand), cand);
	}
	// Safety: fill with shape variations until 4 distinct.
	let k = 1;
	while (byKey.size < 4) {
		const cand: Cell = { ...answer, shape: SHAPES[mod(SHAPES.indexOf(answer.shape) + k++, SHAPES.length)] };
		byKey.set(cellKey(cand), cand);
	}
	return shuffle([...byKey.values()], rng);
}

/** Generate one QCM question for the given difficulty. */
export function generateQuestion(diff: DiffLevel, rng: Rng = Math.random): Question {
	const family = diff.families[Math.floor(rng() * diff.families.length)];
	const g = family(rng);
	return { terms: g.terms, answer: g.answer, options: makeOptions(g, rng), rule: g.rule };
}
