/**
 * MATRICES — pure engine (no UI). IQ-test "Raven progressive matrices".
 * A 3×3 grid of figures; each attribute (shape/colour/count/rotation) follows a
 * rule across the grid. The bottom-right cell is missing; the player picks it
 * among 6 options (one correct). Seeded for the daily challenge.
 */

import type { Rng } from '../prng';

export type Shape =
	| 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon'
	| 'heart' | 'plus' | 'arrow' | 'semicircle' | 'quarter';

export interface Cell {
	shape: Shape;
	color: number; // index into COLORS
	count: number; // 1..3 mini-shapes
	rotation: number; // 0/90/180 (only visible on rotatable shapes)
}

export const COLORS = ['#5b8def', '#e6566f', '#2f9e6f', '#f0a830', '#9b6cf0', '#22b5c9'];

/** A 90° rotation is visually distinct for these shapes only. */
export const ROT_VISIBLE: Record<Shape, boolean> = {
	circle: false, square: false, triangle: true, diamond: false, star: false, hexagon: false,
	heart: false, plus: false, arrow: true, semicircle: true, quarter: true,
};
const ALL_SHAPES: Shape[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon', 'heart', 'plus', 'arrow', 'semicircle', 'quarter'];
const ROT_SHAPES: Shape[] = ALL_SHAPES.filter((s) => ROT_VISIBLE[s]);

const ri = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(rng: Rng, a: T[]): T => a[Math.floor(rng() * a.length)];
const mod = (n: number, m: number) => ((n % m) + m) % m;

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const r = [...arr];
	for (let i = r.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[r[i], r[j]] = [r[j], r[i]];
	}
	return r;
}

/** Canonical identity of a cell — matches its on-screen appearance 1:1. */
export function cellKey(c: Cell): string {
	const rot = ROT_VISIBLE[c.shape] ? mod(c.rotation, 360) : 0;
	return `${c.shape}|${c.color}|${c.count}|${rot}`;
}

type Attr = 'shape' | 'color' | 'count' | 'rotation';
type RuleKind = 'rows' | 'cols' | 'latin';
const ATTRS: Attr[] = ['shape', 'color', 'count', 'rotation'];

/** value index (0..2) for cell (r,c) under a rule. */
const idxOf = (kind: RuleKind, r: number, c: number): number =>
	kind === 'rows' ? r : kind === 'cols' ? c : mod(r + c, 3);

export interface DiffLevel {
	label: string;
	vary: number; // number of varying attributes
	allowLatin: boolean;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', vary: 2, allowLatin: false },
	moyen: { label: 'Moyen', vary: 3, allowLatin: true },
	difficile: { label: 'Difficile', vary: 4, allowLatin: true },
};

export interface Question {
	grid: Cell[]; // 9 cells (index r*3+c); index 8 is the answer cell
	options: Cell[]; // 6 choices, shuffled, exactly one == grid[8]
	answerIndex: number; // index in grid of the missing/answer cell (always 8)
	rule: string; // human explanation (revealed after answering)
}

const RULE_LABEL: Record<Attr, Record<RuleKind, string>> = {
	shape: {
		rows: 'chaque ligne a sa forme',
		cols: 'chaque colonne a sa forme',
		latin: 'chaque ligne et colonne contient les 3 formes',
	},
	color: {
		rows: 'chaque ligne a sa couleur',
		cols: 'chaque colonne a sa couleur',
		latin: 'chaque ligne et colonne contient les 3 couleurs',
	},
	count: {
		rows: 'le nombre dépend de la ligne',
		cols: 'le nombre change le long de la ligne',
		latin: 'chaque ligne et colonne contient les 3 quantités',
	},
	rotation: {
		rows: 'l’orientation dépend de la ligne',
		cols: 'la figure pivote le long de la ligne',
		latin: 'chaque ligne et colonne contient les 3 orientations',
	},
};

/** Generate one matrix QCM question for the given difficulty. */
export function generateQuestion(diff: DiffLevel, rng: Rng = Math.random): Question {
	const varying = shuffle(ATTRS, rng).slice(0, diff.vary);
	const rotationVaries = varying.includes('rotation');
	// Guarantee variation BOTH down the columns (a rows/latin attribute) AND across the rows
	// (a cols/latin attribute) → no row or column is ever a row of identical figures.
	const rowPool: RuleKind[] = diff.allowLatin ? ['rows', 'latin'] : ['rows'];
	const colPool: RuleKind[] = diff.allowLatin ? ['cols', 'latin'] : ['cols'];
	const anyPool: RuleKind[] = diff.allowLatin ? ['rows', 'cols', 'latin'] : ['rows', 'cols'];
	const ruleOf: Partial<Record<Attr, RuleKind>> = {};
	ruleOf[varying[0]] = pick(rng, rowPool);
	ruleOf[varying[1]] = pick(rng, colPool);
	for (let i = 2; i < varying.length; i++) ruleOf[varying[i]] = pick(rng, anyPool);

	// Values per attribute (3 distinct when varying, else 1).
	const shapePool = rotationVaries ? ROT_SHAPES : ALL_SHAPES;
	const shapeVals = varying.includes('shape') ? shuffle(shapePool, rng).slice(0, 3) : [pick(rng, shapePool)];
	const colorVals = varying.includes('color') ? shuffle([0, 1, 2, 3, 4, 5], rng).slice(0, 3) : [ri(rng, 0, COLORS.length - 1)];
	const countStart = ri(rng, 1, 2); // [1,2,3] or [2,3,4] → up to a 2×2 cluster per cell
	const countVals = varying.includes('count') ? [countStart, countStart + 1, countStart + 2] : [1];
	const rotVals = varying.includes('rotation') ? [0, 90, 180] : [0];

	const valFor = <T>(a: Attr, vals: T[], r: number, c: number): T => {
		const kind = ruleOf[a];
		return kind ? vals[idxOf(kind, r, c)] : vals[0];
	};

	const grid: Cell[] = [];
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++)
			grid.push({
				shape: valFor('shape', shapeVals, r, c),
				color: valFor('color', colorVals, r, c),
				count: valFor('count', countVals, r, c),
				rotation: valFor('rotation', rotVals, r, c),
			});

	const answer = grid[8];

	// Distractors: mutate one attribute toward another value seen in the grid (tempting).
	const usedShapes = [...new Set(grid.map((g) => g.shape))];
	const usedColors = [...new Set(grid.map((g) => g.color))];
	const usedCounts = [...new Set(grid.map((g) => g.count))];
	const usedRots = [...new Set(grid.map((g) => g.rotation))];
	const byKey = new Map<string, Cell>([[cellKey(answer), answer]]);
	const mutate = (): Cell => {
		const out = { ...answer };
		switch (pick(rng, ATTRS)) {
			case 'shape': out.shape = pick(rng, usedShapes.length > 1 ? usedShapes : ALL_SHAPES); break;
			case 'color': out.color = pick(rng, usedColors.length > 1 ? usedColors : [0, 1, 2, 3, 4, 5]); break;
			case 'count': out.count = pick(rng, usedCounts.length > 1 ? usedCounts : [1, 2, 3, 4]); break;
			default:
				if (ROT_VISIBLE[out.shape]) out.rotation = pick(rng, usedRots.length > 1 ? usedRots : [0, 90, 180]);
				else out.color = mod(out.color + 1, COLORS.length);
		}
		if (!ROT_VISIBLE[out.shape]) out.rotation = 0;
		return out;
	};
	let guard = 0;
	while (byKey.size < 6 && guard++ < 100) {
		const m = mutate();
		byKey.set(cellKey(m), m);
	}
	let k = 1;
	while (byKey.size < 6) {
		const m: Cell = { ...answer, shape: ALL_SHAPES[mod(ALL_SHAPES.indexOf(answer.shape) + k++, ALL_SHAPES.length)] };
		if (!ROT_VISIBLE[m.shape]) m.rotation = 0;
		byKey.set(cellKey(m), m);
	}

	const rule = varying.map((a) => RULE_LABEL[a][ruleOf[a] as RuleKind]).join(' ; ');
	return { grid, options: shuffle([...byKey.values()], rng), answerIndex: 8, rule };
}
