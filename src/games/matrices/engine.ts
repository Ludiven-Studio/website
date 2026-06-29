/**
 * MATRICES — pure engine (no UI). IQ-test "Raven progressive matrices".
 *
 * A cell is pure GEOMETRY: a container (frame / wheel / quadrants) plus a list
 * of positioned elements (dots / shapes, each with its own colour & fill). A set
 * of "template" families generate a 3×3 grid where attributes transform across
 * rows and columns; the bottom-right cell is missing and the player picks it
 * among 6 options (one correct). The renderer is dumb — it just draws the
 * geometry the engine produced. Seeded for the daily challenge.
 */

import type { Rng } from '../prng';

export type Container = 'plain' | 'triangle' | 'square' | 'circle' | 'wheel8' | 'quad';
export type EltKind = 'dot' | 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon';

export interface Elt {
	x: number; // 0..100 viewBox
	y: number;
	size: number; // radius / half-extent
	kind: EltKind;
	filled: boolean;
	color: number; // index into COLORS
}

export interface Cell {
	container: Container;
	color: number; // container stroke colour
	elements: Elt[];
}

export const COLORS = ['#16a394', '#5b8def', '#e6566f', '#f0a830', '#9b6cf0', '#e8743b'];
const PALETTE = [0, 1, 2, 3, 4, 5];

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

/** Canonical identity of a cell — matches the rendered pixels 1:1.
 *  Order-independent, rounded; exact overlaps collapse (same drawing). */
export function cellKey(c: Cell): string {
	const els = [
		...new Set(c.elements.map((e) => `${Math.round(e.x)},${Math.round(e.y)},${e.kind},${e.filled ? 1 : 0},${e.color},${Math.round(e.size)}`)),
	]
		.sort()
		.join(';');
	return `${c.container}|${c.color}|${els}`;
}

/* ---------- Position helpers ---------- */

const C = 50;
const QUAD = [ { x: 34, y: 34 }, { x: 66, y: 34 }, { x: 66, y: 66 }, { x: 34, y: 66 } ]; // 0 TL,1 TR,2 BR,3 BL (clockwise)

function wheelSlot(k: number): { x: number; y: number } {
	const a = ((-90 + k * 45) * Math.PI) / 180; // k=0 → top, clockwise
	return { x: C + 30 * Math.cos(a), y: C + 30 * Math.sin(a) };
}

/** N dots laid out around a centre: arrangement 0=vertical, 1=diagonal, 2=horizontal. */
function dotsLayout(n: number, arrangement: number, cy: number): { x: number; y: number }[] {
	const step = 13;
	const out: { x: number; y: number }[] = [];
	for (let i = 0; i < n; i++) {
		const t = i - (n - 1) / 2;
		if (arrangement === 0) out.push({ x: C, y: cy + t * step });
		else if (arrangement === 1) out.push({ x: C + t * step * 0.85, y: cy + t * step * 0.85 });
		else out.push({ x: C + t * step, y: cy });
	}
	return out;
}

/** Up to 4 identical motifs clustered in a plain cell. */
function clusterLayout(n: number): { x: number; y: number }[] {
	if (n <= 1) return [{ x: C, y: C }];
	if (n === 2) return [{ x: 36, y: C }, { x: 64, y: C }];
	if (n === 3) return [{ x: C, y: 35 }, { x: 36, y: 65 }, { x: 64, y: 65 }];
	return [{ x: 36, y: 36 }, { x: 64, y: 36 }, { x: 36, y: 64 }, { x: 64, y: 64 }];
}
const sizeForCount = (n: number) => (n <= 1 ? 24 : n === 2 ? 17 : 14);

/* ---------- Difficulty ---------- */

type RuleKind = 'rows' | 'cols' | 'latin';
const idxOf = (kind: RuleKind, r: number, c: number) => (kind === 'rows' ? r : kind === 'cols' ? c : mod(r + c, 3));

export type TemplateName = 'simple' | 'dots' | 'wheel' | 'quad';

export interface DiffLevel {
	label: string;
	simpleVary: number; // attributes varied by the "simple figure" template
	allowLatin: boolean;
	templates: TemplateName[];
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', simpleVary: 2, allowLatin: false, templates: ['simple', 'dots'] },
	moyen: { label: 'Moyen', simpleVary: 3, allowLatin: true, templates: ['simple', 'dots', 'wheel'] },
	difficile: { label: 'Difficile', simpleVary: 4, allowLatin: true, templates: ['dots', 'wheel', 'quad', 'simple'] },
};

/** Number of multiple-choice options (incl. the correct one). */
export const N_OPTIONS = 4;

export interface Question {
	grid: Cell[]; // 9 cells (r*3+c); index 8 is the answer cell
	options: Cell[]; // N_OPTIONS choices, shuffled, exactly one == grid[8]
	answerIndex: number;
	rule: string;
}

interface Gen { grid: Cell[]; rule: string; }

/* ---------- Template: simple figure (shape/colour/count/fill attributes) ---------- */

const SIMPLE_SHAPES: EltKind[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon'];

function tSimple(diff: DiffLevel, rng: Rng): Gen {
	const threeVal = ['shape', 'color', 'count'] as const;
	const axis = shuffle([...threeVal], rng).slice(0, 2); // both-axis carriers (3-valued)
	const restPool = shuffle([threeVal.find((a) => !axis.includes(a))!, 'filled'], rng);
	const vary = [axis[0], axis[1], ...restPool].slice(0, diff.simpleVary);

	const rowPool: RuleKind[] = diff.allowLatin ? ['rows', 'latin'] : ['rows'];
	const colPool: RuleKind[] = diff.allowLatin ? ['cols', 'latin'] : ['cols'];
	const anyPool: RuleKind[] = diff.allowLatin ? ['rows', 'cols', 'latin'] : ['rows', 'cols'];
	const ruleOf: Record<string, RuleKind> = { [axis[0]]: pick(rng, rowPool), [axis[1]]: pick(rng, colPool) };
	for (let i = 2; i < vary.length; i++) ruleOf[vary[i]] = pick(rng, anyPool);

	const shapeVals: EltKind[] = vary.includes('shape') ? shuffle(SIMPLE_SHAPES, rng).slice(0, 3) : [pick(rng, SIMPLE_SHAPES)];
	const colorVals = vary.includes('color') ? shuffle(PALETTE, rng).slice(0, 3) : [ri(rng, 0, 5)];
	const cs = ri(rng, 1, 2);
	const countVals = vary.includes('count') ? [cs, cs + 1, cs + 2] : [pick(rng, [1, 2, 3])];
	const fillVals = vary.includes('filled') ? shuffle([true, false], rng) : [rng() < 0.6];

	const val = <T>(a: string, vals: T[], r: number, c: number): T => (ruleOf[a] ? vals[idxOf(ruleOf[a], r, c) % vals.length] : vals[0]);

	const grid: Cell[] = [];
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) {
			const shape = val('shape', shapeVals, r, c);
			const color = val('color', colorVals, r, c);
			const count = val('count', countVals, r, c);
			const filled = val('filled', fillVals, r, c);
			const elements = clusterLayout(count).map((p) => ({ x: p.x, y: p.y, size: sizeForCount(count), kind: shape, filled, color }));
			grid.push({ container: 'plain', color, elements });
		}
	const labels: Record<string, string> = { shape: 'forme', color: 'couleur', count: 'nombre', filled: 'remplissage' };
	const rule = 'attributs qui changent par ligne et par colonne (' + vary.map((a) => labels[a]).join(', ') + ')';
	return { grid, rule };
}

/* ---------- Template: container + dots (example 1) ---------- */

function tDots(_diff: DiffLevel, rng: Rng): Gen {
	const contVals = shuffle<Container>(['triangle', 'square', 'circle'], rng); // by column
	const cs = ri(rng, 1, 2);
	const countByCol = [cs, cs + 1, cs + 2]; // ascending → answer column (c=2) has the most dots
	const arrByRow = shuffle([0, 1, 2], rng); // disposition by row
	const nCol = rng() < 0.5 ? 1 : 2;
	const dotColors = shuffle(PALETTE, rng).slice(0, nCol);
	const contColor = ri(rng, 0, 5);

	const grid: Cell[] = [];
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) {
			const container = contVals[c];
			const n = countByCol[c];
			const cy = container === 'triangle' ? 60 : C;
			const elements = dotsLayout(n, arrByRow[r], cy).map((p, i) => ({ x: p.x, y: p.y, size: 5, kind: 'dot' as EltKind, filled: true, color: dotColors[i % nCol] }));
			grid.push({ container, color: contColor, elements });
		}
	return { grid, rule: 'le conteneur et le nombre de points changent par colonne ; leur disposition par ligne' };
}

/* ---------- Template: rotating wheel (example 2) ---------- */

function tWheel(diff: DiffLevel, rng: Rng): Gen {
	const D = diff.allowLatin && rng() < 0.5 ? 3 : 2;
	const baseSlots = shuffle([0, 1, 2, 3, 4, 5, 6, 7], rng).slice(0, D);
	const nCol = D >= 2 && rng() < 0.6 ? Math.min(D, 3) : 1;
	const palette = shuffle(PALETTE, rng);
	const dotColors = baseSlots.map((_, i) => (nCol === 1 ? palette[0] : palette[i % nCol]));
	const steps = [1, 2, 3, 5, 6, 7]; // avoid 0 and 4 (4 maps opposite → symmetry)
	const stepR = pick(rng, steps);
	const stepC = pick(rng, steps);
	const contColor = ri(rng, 0, 5);

	const grid: Cell[] = [];
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) {
			const elements = baseSlots.map((s, i) => {
				const p = wheelSlot(mod(s + r * stepR + c * stepC, 8));
				return { x: p.x, y: p.y, size: 5, kind: 'dot' as EltKind, filled: true, color: dotColors[i] };
			});
			grid.push({ container: 'wheel8', color: contColor, elements });
		}
	return { grid, rule: 'les points tournent autour de la roue (d’un pas par ligne et par colonne)' };
}

/* ---------- Template: moving quadrants (example 3) ---------- */

function tQuad(_diff: DiffLevel, rng: Rng): Gen {
	const M = 2;
	const baseQ = shuffle([0, 1, 2, 3], rng).slice(0, M);
	const colors = shuffle(PALETTE, rng).slice(0, M);
	const allApp = [
		{ kind: 'circle' as EltKind, filled: true }, { kind: 'circle' as EltKind, filled: false },
		{ kind: 'square' as EltKind, filled: true }, { kind: 'square' as EltKind, filled: false },
	];
	const appByCol = [shuffle(allApp, rng).slice(0, 3), shuffle(allApp, rng).slice(0, 3)]; // per element, by column
	const stepR = pick(rng, [1, 2, 3]); // quadrant rotation by row
	const contColor = ri(rng, 0, 5);

	const grid: Cell[] = [];
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) {
			const elements = baseQ.map((q, i) => {
				const p = QUAD[mod(q + r * stepR, 4)];
				const ap = appByCol[i][c];
				return { x: p.x, y: p.y, size: ap.kind === 'square' ? 9 : 8, kind: ap.kind, filled: ap.filled, color: colors[i] };
			});
			grid.push({ container: 'quad', color: contColor, elements });
		}
	return { grid, rule: 'les formes se déplacent de quadrant (par ligne) et changent d’aspect (par colonne)' };
}

const TEMPLATES: Record<TemplateName, (d: DiffLevel, rng: Rng) => Gen> = {
	simple: tSimple, dots: tDots, wheel: tWheel, quad: tQuad,
};

/* ---------- Distractors ---------- */

const cloneCell = (c: Cell): Cell => ({ container: c.container, color: c.color, elements: c.elements.map((e) => ({ ...e })) });

/** Candidate positions not already occupied in `cell` (avoids visual overlaps). */
function freePositions(cell: Cell, pos: { x: number; y: number }[]): { x: number; y: number }[] {
	const occ = new Set(cell.elements.map((e) => `${Math.round(e.x)},${Math.round(e.y)}`));
	return pos.filter((p) => !occ.has(`${Math.round(p.x)},${Math.round(p.y)}`));
}

const uniq = <T>(a: T[]): T[] => [...new Set(a)];
const pickOther = <T>(rng: Rng, arr: T[], cur: T): T => {
	const c = arr.filter((x) => x !== cur);
	return c.length ? pick(rng, c) : cur;
};

/**
 * A *plausible* wrong cell: the answer with ONE attribute nudged — and only using
 * values that already appear in the grid, on dimensions that actually vary. This
 * keeps distractors "in vocabulary" (no brand-new colour/shape/fill) and close to
 * the answer, so options share most of their look with the correct one.
 */
function mutate(answer: Cell, grid: Cell[], rng: Rng): Cell | null {
	const out = cloneCell(answer);
	if (out.elements.length === 0) return null;
	const els = grid.flatMap((g) => g.elements);
	const colorsUsed = uniq(els.map((e) => e.color));
	const kindsUsed = uniq(els.map((e) => e.kind));
	const fillsUsed = uniq(els.map((e) => e.filled));
	const countsUsed = uniq(grid.map((g) => g.elements.length));
	const posUsed = els.map((e) => ({ x: e.x, y: e.y }));

	// Only offer mutations on dimensions that genuinely vary across the grid.
	const ops: string[] = [];
	if (colorsUsed.length > 1) ops.push('color');
	if (kindsUsed.length > 1) ops.push('kind');
	if (fillsUsed.length > 1) ops.push('fill');
	if (countsUsed.length > 1) ops.push('count');
	if (freePositions(out, posUsed).length > 0) ops.push('move');
	if (out.elements.length > 1 && (colorsUsed.length > 1 || kindsUsed.length > 1)) ops.push('swap');
	if (ops.length === 0) return null; // nothing on-theme → caller falls back to real grid cells

	const i = Math.floor(rng() * out.elements.length);
	const el = out.elements[i];
	switch (pick(rng, ops)) {
		case 'color':
			el.color = pickOther(rng, colorsUsed, el.color);
			break;
		case 'kind':
			el.kind = pickOther(rng, kindsUsed, el.kind);
			break;
		case 'fill':
			el.filled = !el.filled; // both fill states exist in the grid
			break;
		case 'count': {
			let target = pickOther(rng, countsUsed, out.elements.length);
			while (out.elements.length > target && out.elements.length > 1) out.elements.pop();
			while (out.elements.length < target) {
				const free = freePositions(out, posUsed);
				if (!free.length) break;
				const np = pick(rng, free);
				out.elements.push({ ...pick(rng, out.elements), x: np.x, y: np.y });
			}
			break;
		}
		case 'move': {
			const np = pick(rng, freePositions(out, posUsed));
			el.x = np.x;
			el.y = np.y;
			break;
		}
		default: {
			// swap appearance between two elements → same vocabulary, plausible re-arrangement
			let j = Math.floor(rng() * out.elements.length);
			if (j === i) j = (j + 1) % out.elements.length;
			const a = out.elements[i], b = out.elements[j];
			[a.color, b.color] = [b.color, a.color];
			[a.kind, b.kind] = [b.kind, a.kind];
			[a.filled, b.filled] = [b.filled, a.filled];
		}
	}
	return out;
}

/** A grid is usable if the answer can't be trivially copied from a neighbour. */
function valid(grid: Cell[]): boolean {
	const a = cellKey(grid[8]);
	return a !== cellKey(grid[7]) && a !== cellKey(grid[5]) && new Set(grid.map(cellKey)).size >= 4;
}

/** Generate one matrix QCM question. `force` selects a specific template (tests). */
export function generateQuestion(diff: DiffLevel, rng: Rng = Math.random, force?: TemplateName): Question {
	let gen: Gen = TEMPLATES[force ?? diff.templates[0]](diff, rng);
	for (let attempt = 0; attempt < 40; attempt++) {
		const name = force ?? pick(rng, diff.templates);
		gen = TEMPLATES[name](diff, rng);
		if (valid(gen.grid)) break;
	}

	const grid = gen.grid;
	const answer = grid[8];
	const byKey = new Map<string, Cell>([[cellKey(answer), answer]]);
	// 1) plausible near-misses (answer with one in-vocabulary attribute nudged)
	let guard = 0;
	while (byKey.size < N_OPTIONS && guard++ < 240) {
		const m = mutate(answer, grid, rng);
		if (m) byKey.set(cellKey(m), m);
	}
	// 2) real cells from elsewhere in the grid (also fully on-theme)
	for (const cell of shuffle(grid.slice(0, 8), rng)) {
		if (byKey.size >= N_OPTIONS) break;
		byKey.set(cellKey(cell), cell);
	}
	// 3) last-resort: recolour within the grid's palette
	const colorsUsed = uniq(grid.flatMap((g) => g.elements.map((e) => e.color)));
	let k = 1;
	while (byKey.size < N_OPTIONS) {
		const m = cloneCell(answer);
		const palette = colorsUsed.length ? colorsUsed : [...Array(COLORS.length).keys()];
		if (m.elements[0]) m.elements[0].color = palette[k++ % palette.length];
		else m.color = palette[k++ % palette.length];
		byKey.set(cellKey(m), m);
	}

	return { grid, options: shuffle([...byKey.values()], rng), answerIndex: 8, rule: gen.rule };
}
