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
	const step = 15;
	const out: { x: number; y: number }[] = [];
	for (let i = 0; i < n; i++) {
		const t = i - (n - 1) / 2;
		if (arrangement === 0) out.push({ x: C, y: cy + t * step });
		else if (arrangement === 1) out.push({ x: C + t * step * 0.85, y: cy + t * step * 0.85 });
		else out.push({ x: C + t * step, y: cy });
	}
	return out;
}

/** Up to 4 identical motifs clustered in a plain cell — spaced so they never touch. */
function clusterLayout(n: number): { x: number; y: number }[] {
	if (n <= 1) return [{ x: C, y: C }];
	if (n === 2) return [{ x: 29, y: C }, { x: 71, y: C }];
	if (n === 3) return [{ x: C, y: 29 }, { x: 29, y: 69 }, { x: 71, y: 69 }];
	return [{ x: 31, y: 31 }, { x: 69, y: 31 }, { x: 31, y: 69 }, { x: 69, y: 69 }];
}
const sizeForCount = (n: number) => (n <= 1 ? 25 : n === 2 ? 14 : n === 3 ? 12 : 11);

/* ---------- Difficulty ---------- */

export type TemplateName = 'simple' | 'dots' | 'wheel' | 'quad';

export interface DiffLevel {
	label: string;
	vary: number; // number of things (features) that change across the grid
	templates: TemplateName[];
}

const ALL: TemplateName[] = ['simple', 'dots', 'wheel', 'quad'];

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', vary: 2, templates: ALL },
	moyen: { label: 'Moyen', vary: 3, templates: ALL },
	difficile: { label: 'Difficile', vary: 4, templates: ALL },
};

/** Number of multiple-choice options (incl. the correct one). */
export const N_OPTIONS = 4;

export interface Question {
	grid: Cell[]; // 9 cells (r*3+c); index 8 is the answer cell
	options: Cell[]; // N_OPTIONS choices, shuffled, exactly one == grid[8]
	answerIndex: number;
	rule: string;
	varied: number; // how many features actually vary (== difficulty target)
}

interface Gen { grid: Cell[]; rule: string; varied: number; }

/* ---------- Feature plan: pick exactly `vary` features, covering both axes ---------- */

type Axis = 'rows' | 'cols';
const aIdx = (ax: Axis, r: number, c: number) => (ax === 'rows' ? r : c);

/**
 * Choose `vary` features and assign each an axis. The two "carriers" come from
 * pool3 (3-valued features) and take rows + cols → both axes always vary, so the
 * grid is solvable and never trivially constant. Extras (incl. 2-valued ones)
 * take a random axis. Returns feature → axis (only active features are present).
 */
function planFeatures(pool3: string[], pool2: string[], vary: number, rng: Rng): Record<string, Axis> {
	const carriers = shuffle(pool3, rng).slice(0, 2);
	const restPool = shuffle([...pool3.filter((f) => !carriers.includes(f)), ...pool2], rng);
	const extras = restPool.slice(0, Math.max(0, vary - 2));
	const plan: Record<string, Axis> = { [carriers[0]]: 'rows', [carriers[1]]: 'cols' };
	for (const f of extras) plan[f] = pick(rng, ['rows', 'cols'] as Axis[]);
	return plan;
}

const FR: Record<string, string> = {
	shape: 'forme', color: 'couleur', count: 'nombre', fill: 'remplissage',
	container: 'conteneur', arrangement: 'disposition', dotColor: 'couleur', move: 'position', kind: 'forme',
};
const ruleText = (plan: Record<string, Axis>): string =>
	'éléments qui changent : ' + [...new Set(Object.keys(plan).map((f) => FR[f]))].join(', ');

/* ---------- Template: simple figure (shape / colour / count / fill) ---------- */

const SIMPLE_SHAPES: EltKind[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon'];

function tSimple(vary: number, rng: Rng): Gen {
	const plan = planFeatures(['shape', 'color', 'count'], ['fill'], vary, rng);
	const shapeVals: EltKind[] = plan.shape ? shuffle(SIMPLE_SHAPES, rng).slice(0, 3) : [pick(rng, SIMPLE_SHAPES)];
	const colorVals = plan.color ? shuffle(PALETTE, rng).slice(0, 3) : [ri(rng, 0, 5)];
	const cs = ri(rng, 1, 2);
	const countVals = plan.count ? [cs, cs + 1, cs + 2] : [pick(rng, [1, 2, 3])];
	const fillVals = plan.fill ? shuffle([true, false], rng) : [rng() < 0.6];
	const v = <T>(f: string, vals: T[], r: number, c: number): T => (plan[f] ? vals[aIdx(plan[f], r, c) % vals.length] : vals[0]);

	const grid: Cell[] = [];
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) {
			const shape = v('shape', shapeVals, r, c);
			const color = v('color', colorVals, r, c);
			const count = v('count', countVals, r, c);
			const filled = v('fill', fillVals, r, c);
			const elements = clusterLayout(count).map((p) => ({ x: p.x, y: p.y, size: sizeForCount(count), kind: shape, filled, color }));
			grid.push({ container: 'plain', color, elements });
		}
	return { grid, rule: ruleText(plan), varied: Object.keys(plan).length };
}

/* ---------- Template: container + dots (example 1) ---------- */

function tDots(vary: number, rng: Rng): Gen {
	const plan = planFeatures(['container', 'count', 'arrangement', 'dotColor'], [], vary, rng);
	const contVals: Container[] = plan.container ? shuffle<Container>(['triangle', 'square', 'circle'], rng) : [pick(rng, ['triangle', 'square', 'circle'] as Container[])];
	const arrActive = !!plan.arrangement;
	const cs = arrActive ? 2 : ri(rng, 1, 2); // keep dots ≥2 so the disposition is visible
	const countVals = plan.count ? [cs, cs + 1, cs + 2] : [arrActive ? ri(rng, 2, 3) : ri(rng, 1, 3)];
	const arrVals = plan.arrangement ? shuffle([0, 1, 2], rng).slice(0, 3) : [pick(rng, [0, 1, 2])];
	const colorVals = plan.dotColor ? shuffle(PALETTE, rng).slice(0, 3) : [ri(rng, 0, 5)];
	const contColor = ri(rng, 0, 5);
	const vi = (f: string, len: number, r: number, c: number) => (plan[f] ? aIdx(plan[f], r, c) % len : 0);

	const grid: Cell[] = [];
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) {
			const container = contVals[vi('container', contVals.length, r, c)];
			const n = countVals[vi('count', countVals.length, r, c)];
			const arrangement = arrVals[vi('arrangement', arrVals.length, r, c)];
			const color = colorVals[vi('dotColor', colorVals.length, r, c)];
			const cy = container === 'triangle' ? 60 : C;
			const elements = dotsLayout(n, arrangement, cy).map((p) => ({ x: p.x, y: p.y, size: 5, kind: 'dot' as EltKind, filled: true, color }));
			grid.push({ container, color: contColor, elements });
		}
	return { grid, rule: ruleText(plan), varied: Object.keys(plan).length };
}

/* ---------- Template: wheel with dots on spokes (example 2) ---------- */

function tWheel(vary: number, rng: Rng): Gen {
	const plan = planFeatures(['move', 'color', 'count'], ['fill'], vary, rng);
	const order = shuffle([0, 1, 2, 3, 4, 5, 6, 7], rng).slice(0, 3); // up to 3 dot slots
	const step = pick(rng, [1, 2, 3, 5, 6, 7]); // avoid 0 and 4 (4 = opposite → symmetry)
	const colorVals = plan.color ? shuffle(PALETTE, rng).slice(0, 3) : [ri(rng, 0, 5)];
	const countVals = plan.count ? [1, 2, 3] : [ri(rng, 2, 3)];
	const fillVals = plan.fill ? shuffle([true, false], rng) : [true];
	const deco = shuffle(PALETTE, rng); // per-dot colours when colour isn't a rule (multi-colour variety)
	const contColor = ri(rng, 0, 5);

	const grid: Cell[] = [];
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) {
			const cnt = plan.count ? countVals[aIdx(plan.count, r, c) % countVals.length] : countVals[0];
			const off = plan.move ? step * aIdx(plan.move, r, c) : 0;
			const filled = plan.fill ? fillVals[aIdx(plan.fill, r, c) % fillVals.length] : fillVals[0];
			const baseColor = plan.color ? colorVals[aIdx(plan.color, r, c) % colorVals.length] : null;
			const elements = order.slice(0, cnt).map((s, i) => {
				const p = wheelSlot(mod(s + off, 8));
				return { x: p.x, y: p.y, size: 5, kind: 'circle' as EltKind, filled, color: baseColor ?? deco[i % deco.length] };
			});
			grid.push({ container: 'wheel8', color: contColor, elements });
		}
	return { grid, rule: ruleText(plan), varied: Object.keys(plan).length };
}

/* ---------- Template: moving quadrants (example 3) ---------- */

function tQuad(vary: number, rng: Rng): Gen {
	const plan = planFeatures(['move', 'color', 'kind'], ['fill'], vary, rng);
	const baseQ = shuffle([0, 1, 2, 3], rng).slice(0, 2);
	const step = pick(rng, [1, 2, 3]);
	const kindVals: EltKind[] = plan.kind ? shuffle(['circle', 'square', 'triangle'] as EltKind[], rng).slice(0, 3) : [pick(rng, ['circle', 'square', 'triangle'] as EltKind[])];
	const colorVals = plan.color ? shuffle(PALETTE, rng).slice(0, 3) : [ri(rng, 0, 5)];
	const fillVals = plan.fill ? shuffle([true, false], rng) : [rng() < 0.6];
	const deco = shuffle(PALETTE, rng);
	const contColor = ri(rng, 0, 5);

	const grid: Cell[] = [];
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) {
			const off = plan.move ? step * aIdx(plan.move, r, c) : 0;
			const kind = plan.kind ? kindVals[aIdx(plan.kind, r, c) % kindVals.length] : kindVals[0];
			const filled = plan.fill ? fillVals[aIdx(plan.fill, r, c) % fillVals.length] : fillVals[0];
			const baseColor = plan.color ? colorVals[aIdx(plan.color, r, c) % colorVals.length] : null;
			const elements = baseQ.map((q, i) => {
				const p = QUAD[mod(q + off, 4)];
				return { x: p.x, y: p.y, size: kind === 'square' ? 9 : 8, kind, filled, color: baseColor ?? deco[i % deco.length] };
			});
			grid.push({ container: 'quad', color: contColor, elements });
		}
	return { grid, rule: ruleText(plan), varied: Object.keys(plan).length };
}

const TEMPLATES: Record<TemplateName, (vary: number, rng: Rng) => Gen> = {
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
	let gen: Gen = TEMPLATES[force ?? diff.templates[0]](diff.vary, rng);
	for (let attempt = 0; attempt < 40; attempt++) {
		const name = force ?? pick(rng, diff.templates);
		gen = TEMPLATES[name](diff.vary, rng);
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
	const palette = [...Array(COLORS.length).keys()]; // full palette (last resort only)
	let k = 1;
	while (byKey.size < N_OPTIONS && k <= COLORS.length + 2) {
		const m = cloneCell(answer);
		if (m.elements[0]) m.elements[0].color = palette[k++ % palette.length];
		else m.color = palette[k++ % palette.length];
		byKey.set(cellKey(m), m);
	}

	return { grid, options: shuffle([...byKey.values()], rng), answerIndex: 8, rule: gen.rule, varied: gen.varied };
}
