/**
 * SYMBOLES — pure engine (no UI).
 * Generate a sequence of visual symbols (cells) from a hidden rule; the player
 * picks the next symbol among 4 choices (QCM). Seeded for the daily challenge.
 * A cell is a glyph token: shape + color + rotation + horizontal flip + count.
 */

import type { Rng } from '../prng';

export type Shape =
	| 'circle'
	| 'square'
	| 'triangle'
	| 'diamond'
	| 'star'
	| 'hexagon'
	| 'plus'
	| 'heart'
	| 'arrow'
	| 'semicircle'
	| 'quarter'
	| 'ell'
	| 'flag'
	| 'zee';

export interface Cell {
	shape: Shape;
	color: number; // index into COLORS palette
	rotation: number; // degrees, multiples of 90
	flip: boolean; // horizontal mirror (symmetry)
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

export const SHAPES: Shape[] = [
	'circle', 'square', 'triangle', 'diamond', 'star', 'hexagon', 'plus', 'heart',
	'arrow', 'semicircle', 'quarter', 'ell', 'flag', 'zee',
];

/**
 * Per-shape symmetry metadata.
 * rotVisible: a 90° rotation is visually distinct (so rotation may be applied).
 * chiral: the mirror image equals NO rotation of the shape (so flip is meaningful).
 * Invariant: rotation is only ever set on rotVisible shapes, flip only on chiral
 * shapes — this keeps every (shape,rot,flip) combo a distinct picture, so two
 * options can never look identical.
 */
export const META: Record<Shape, { rotVisible: boolean; chiral: boolean }> = {
	circle: { rotVisible: false, chiral: false },
	square: { rotVisible: false, chiral: false },
	triangle: { rotVisible: true, chiral: false },
	diamond: { rotVisible: false, chiral: false },
	star: { rotVisible: false, chiral: false },
	hexagon: { rotVisible: false, chiral: false },
	plus: { rotVisible: false, chiral: false },
	heart: { rotVisible: false, chiral: false },
	arrow: { rotVisible: true, chiral: false },
	semicircle: { rotVisible: true, chiral: false },
	quarter: { rotVisible: true, chiral: false },
	ell: { rotVisible: true, chiral: true },
	flag: { rotVisible: true, chiral: true },
	zee: { rotVisible: true, chiral: true },
};

const ROT_SHAPES = SHAPES.filter((s) => META[s].rotVisible);
const CHIRAL_SHAPES = SHAPES.filter((s) => META[s].chiral);

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

/** Canonical identity of a cell — matches its on-screen appearance 1:1. */
export function cellKey(c: Cell): string {
	const rot = META[c.shape].rotVisible ? mod(c.rotation, 360) : 0;
	const flip = META[c.shape].chiral ? c.flip : false;
	return `${c.shape}|${c.color}|${rot}|${flip}|${c.count}`;
}

const cellEq = (a: Cell, b: Cell) => cellKey(a) === cellKey(b);

/** A plain upright cell with random shape + color. */
const baseCell = (rng: Rng): Cell => ({
	shape: pick(rng, SHAPES),
	color: ri(rng, 0, COLORS.length - 1),
	rotation: 0,
	flip: false,
	count: 1,
});

/* ---------- Rule families ---------- */

// Period-2/3 pattern that repeats: A B A B … or A B C A B C …
const repeat = (rng: Rng): Generated => {
	const period = ri(rng, 2, 3);
	const motif: Cell[] = [];
	for (let i = 0; i < period; i++) {
		let c = baseCell(rng);
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

// Same symbol, rotation increases by a fixed step (asymmetric glyph).
const rotate = (rng: Rng): Generated => {
	const shape = pick(rng, ROT_SHAPES);
	const color = ri(rng, 0, COLORS.length - 1);
	const step = pick(rng, [90, -90]);
	const at = (i: number): Cell => ({ shape, color, rotation: step * i, flip: false, count: 1 });
	return {
		terms: [0, 1, 2, 3, 4].map(at),
		answer: at(5),
		rule: `le symbole pivote de ${step > 0 ? '+' : ''}${step}°`,
	};
};

// Chiral symbol that reflects: it alternates with its mirror image.
const mirror = (rng: Rng): Generated => {
	const shape = pick(rng, CHIRAL_SHAPES);
	const color = ri(rng, 0, COLORS.length - 1);
	const rot0 = pick(rng, [0, 90, 180, 270]);
	const at = (i: number): Cell => ({ shape, color, rotation: rot0, flip: i % 2 === 1, count: 1 });
	return {
		terms: [0, 1, 2, 3, 4].map(at),
		answer: at(5),
		rule: 'le symbole se reflète (miroir) en alternance',
	};
};

// Same symbol, count of mini-shapes grows then wraps in 1..4.
const countGrow = (rng: Rng): Generated => {
	const shape = pick(rng, SHAPES);
	const color = ri(rng, 0, COLORS.length - 1);
	const start = ri(rng, 1, 2);
	const at = (i: number): Cell => ({
		shape,
		color,
		rotation: 0,
		flip: false,
		count: mod(start - 1 + i, 4) + 1,
	});
	return {
		terms: [0, 1, 2, 3, 4].map(at),
		answer: at(5),
		rule: 'le nombre d’éléments augmente (et reboucle)',
	};
};

// Chiral symbol that both rotates (+90°) and reflects each step.
const rotateMirror = (rng: Rng): Generated => {
	const shape = pick(rng, CHIRAL_SHAPES);
	const color = ri(rng, 0, COLORS.length - 1);
	const step = pick(rng, [90, -90]);
	const at = (i: number): Cell => ({ shape, color, rotation: step * i, flip: i % 2 === 1, count: 1 });
	return {
		terms: [0, 1, 2, 3, 4].map(at),
		answer: at(5),
		rule: `il pivote de ${step > 0 ? '+' : ''}${step}° et se reflète`,
	};
};

// Asymmetric symbol rotating while the count of elements grows.
const rotateCount = (rng: Rng): Generated => {
	const shape = pick(rng, ROT_SHAPES);
	const color = ri(rng, 0, COLORS.length - 1);
	const rStep = pick(rng, [90, -90]);
	const start = ri(rng, 1, 2);
	const at = (i: number): Cell => ({
		shape,
		color,
		rotation: rStep * i,
		flip: false,
		count: mod(start - 1 + i, 4) + 1,
	});
	return {
		terms: [0, 1, 2, 3, 4].map(at),
		answer: at(5),
		rule: `il pivote de ${rStep > 0 ? '+' : ''}${rStep}° et le nombre d’éléments augmente`,
	};
};

// Two interleaved sub-sequences: one rotates, one reflects.
// A0 B0 A1 B1 A2 -> answer B2.
const interleaved = (rng: Rng): Generated => {
	const shapeA = pick(rng, ROT_SHAPES);
	const colorA = ri(rng, 0, COLORS.length - 1);
	const stepA = pick(rng, [90, -90]);
	const shapeB = pick(rng, CHIRAL_SHAPES);
	const colorB = ri(rng, 0, COLORS.length - 1);
	const A = (i: number): Cell => ({ shape: shapeA, color: colorA, rotation: stepA * i, flip: false, count: 1 });
	const B = (i: number): Cell => ({ shape: shapeB, color: colorB, rotation: 0, flip: i % 2 === 1, count: 1 });
	return { terms: [A(0), B(0), A(1), B(1), A(2)], answer: B(2), rule: 'deux suites entrelacées' };
};

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', families: [repeat, alternate] },
	moyen: { label: 'Moyen', families: [rotate, mirror, countGrow] },
	difficile: { label: 'Difficile', families: [rotateMirror, rotateCount, interleaved] },
};

/* ---------- Distractors ---------- */

/** Mutate one attribute of a cell, respecting its symmetry metadata. */
function nudge(c: Cell, rng: Rng): Cell {
	const out = { ...c };
	const kinds = ['shape', 'color', 'count'];
	if (META[c.shape].rotVisible) kinds.push('rot');
	if (META[c.shape].chiral) kinds.push('flip');
	switch (pick(rng, kinds)) {
		case 'shape': {
			out.shape = SHAPES[mod(SHAPES.indexOf(c.shape) + (rng() < 0.5 ? 1 : -1), SHAPES.length)];
			if (!META[out.shape].rotVisible) out.rotation = 0;
			if (!META[out.shape].chiral) out.flip = false;
			break;
		}
		case 'color':
			out.color = mod(c.color + (rng() < 0.5 ? 1 : -1), COLORS.length);
			break;
		case 'count':
			out.count = mod(c.count - 1 + (rng() < 0.5 ? 1 : 3), 4) + 1;
			break;
		case 'rot':
			out.rotation = c.rotation + pick(rng, [90, -90, 180]);
			break;
		default:
			out.flip = !c.flip;
	}
	return out;
}

function makeOptions(g: Generated, rng: Rng): Cell[] {
	const { answer } = g;
	const byKey = new Map<string, Cell>([[cellKey(answer), answer]]);
	let guard = 0;
	while (byKey.size < 4 && guard++ < 40) {
		const cand = nudge(answer, rng);
		byKey.set(cellKey(cand), cand);
	}
	// Safety: fill with shape variations until 4 distinct.
	let k = 1;
	while (byKey.size < 4) {
		const cand: Cell = {
			...answer,
			rotation: 0,
			flip: false,
			shape: SHAPES[mod(SHAPES.indexOf(answer.shape) + k++, SHAPES.length)],
		};
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
