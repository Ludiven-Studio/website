/**
 * MOTIFS — pure engine (no UI). Original puzzle in the "rectangle partition"
 * family (Shikaku-like). Split the whole grid into rectangles; each rectangle
 * holds exactly one clue cell stating its SHAPE (square / tall / wide / any) and
 * sometimes its AREA. Generation guarantees a unique solution.
 */

import type { Rng } from '../prng';

export type Shape = 'square' | 'tall' | 'wide' | 'any';

export interface Clue {
	r: number;
	c: number;
	shape: Shape; // 'any' = undefined shape
	area: number | null; // shown cell count, or null if hidden
}

export interface Rect {
	r0: number;
	c0: number;
	h: number;
	w: number;
}

export interface MotifsPuzzle {
	size: number;
	clues: Clue[];
	rects: Rect[]; // by piece id (= index)
	solution: number[][]; // piece id per cell
}

export interface DiffLevel {
	label: string;
	size: number;
	relaxFrac: number; // share of shape/area hints removed (harder = more)
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 5, relaxFrac: 0.15 },
	moyen: { label: 'Moyen', size: 6, relaxFrac: 0.45 },
	difficile: { label: 'Difficile', size: 7, relaxFrac: 0.8 },
};

export function shapeOf(h: number, w: number): Shape {
	return h === w ? 'square' : h > w ? 'tall' : 'wide';
}

const shapeMatch = (clue: Shape, h: number, w: number) => clue === 'any' || clue === shapeOf(h, w);

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Can (h×w) be split into two rectangles each of area >= 2? */
function canSplit(h: number, w: number): boolean {
	if (h >= 2 && w >= 2) return true;
	if (h === 1 && w >= 4) return true; // 1×w strip -> 1×p + 1×(w-p), p in [2..w-2]
	if (w === 1 && h >= 4) return true;
	return false;
}

/** Recursively split into rectangles of dims <= 4, area in [2..6], never 1×1. */
function partition(r0: number, c0: number, h: number, w: number, rng: Rng, out: Rect[]): void {
	const tooBig = h > 4 || w > 4 || h * w > 6;
	if (!(canSplit(h, w) && (tooBig || rng() < 0.55))) {
		out.push({ r0, c0, h, w }); // kept piece (area >= 2 by construction)
		return;
	}
	// Feasible orientations that keep both halves at area >= 2.
	const vOK = w >= 2 && (h >= 2 || w >= 4);
	const hOK = h >= 2 && (w >= 2 || h >= 4);
	const vertical = vOK && hOK ? (w > h ? true : w < h ? false : rng() < 0.5) : vOK;
	if (vertical) {
		const lo = h >= 2 ? 1 : 2;
		const hi = h >= 2 ? w - 1 : w - 2;
		const cut = lo + Math.floor(rng() * (hi - lo + 1));
		partition(r0, c0, h, cut, rng, out);
		partition(r0, c0 + cut, h, w - cut, rng, out);
	} else {
		const lo = w >= 2 ? 1 : 2;
		const hi = w >= 2 ? h - 1 : h - 2;
		const cut = lo + Math.floor(rng() * (hi - lo + 1));
		partition(r0, c0, cut, w, rng, out);
		partition(r0 + cut, c0, h - cut, w, rng, out);
	}
}

function cluesInRect(
	clueGrid: number[][],
	r: number,
	c: number,
	h: number,
	w: number,
): number[] {
	const found: number[] = [];
	for (let rr = r; rr < r + h; rr++)
		for (let cc = c; cc < c + w; cc++) if (clueGrid[rr][cc] >= 0) found.push(clueGrid[rr][cc]);
	return found;
}

/** Count tilings consistent with the clues, stopping at `limit` (uniqueness). */
export function countSolutions(clues: Clue[], size: number, limit = 2): number {
	const clueGrid: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
	clues.forEach((cl, i) => (clueGrid[cl.r][cl.c] = i));
	const cover: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));

	let count = 0;
	const firstUncovered = (): [number, number] | null => {
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (cover[r][c] === -1) return [r, c];
		return null;
	};

	const dfs = (): void => {
		if (count >= limit) return;
		const cell = firstUncovered();
		if (!cell) {
			count++;
			return;
		}
		const [r, c] = cell;
		// The first uncovered cell must be the top-left corner of its rectangle.
		for (let h = 1; r + h - 1 < size; h++) {
			if (cover[r + h - 1][c] !== -1) break;
			for (let w = 1; c + w - 1 < size; w++) {
				let free = true;
				for (let rr = r; rr < r + h; rr++)
					if (cover[rr][c + w - 1] !== -1) { free = false; break; }
				if (!free) break;
				const ci = cluesInRect(clueGrid, r, c, h, w);
				if (ci.length > 1) break; // more width only adds clues
				if (ci.length === 1) {
					const clue = clues[ci[0]];
					if (shapeMatch(clue.shape, h, w) && (clue.area == null || clue.area === h * w)) {
						for (let rr = r; rr < r + h; rr++)
							for (let cc = c; cc < c + w; cc++) cover[rr][cc] = ci[0];
						dfs();
						for (let rr = r; rr < r + h; rr++)
							for (let cc = c; cc < c + w; cc++) cover[rr][cc] = -1;
						if (count >= limit) return;
					}
				}
			}
		}
	};
	dfs();
	return count;
}

/**
 * Short French explanation for the solution rectangle the hint places.
 * Honest: only claims a forcing proof when the clue's shape uniquely
 * determines the dimensions (area given + matching shape); otherwise hedges.
 */
export function hintReason(rect: Rect, puzzle: MotifsPuzzle): string {
	const { h, w } = rect;
	// Find the clue sitting inside this rectangle (one per piece by construction).
	const clue = puzzle.clues.find(
		(cl) => cl.r >= rect.r0 && cl.r < rect.r0 + h && cl.c >= rect.c0 && cl.c < rect.c0 + w,
	);

	const kind =
		h === w
			? `un carré ${w}×${h}`
			: h > w
				? `un rectangle vertical ${w}×${h}`
				: `un rectangle horizontal ${w}×${h}`;
	const areaPart = clue && clue.area != null ? ` (${clue.area} cases)` : '';

	// Shape known + area known and consistent → the dimensions are forced.
	const shapeGiven = clue != null && clue.shape !== 'any';
	const areaGiven = clue != null && clue.area != null;
	const lead =
		shapeGiven && areaGiven ? 'Cet indice ne peut former que' : "D'après l'indice de forme,";
	return `${lead} ${kind}${areaPart} ici.`;
}

export function generateMotifs(diff: DiffLevel, rng: Rng = Math.random): MotifsPuzzle {
	const { size } = diff;

	for (let attempt = 0; attempt < 400; attempt++) {
		const rects: Rect[] = [];
		partition(0, 0, size, size, rng, rects);
		if (rects.length < 2) continue;

		// One clue cell per rectangle, with full shape + area info.
		const clueGrid: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
		const clues: Clue[] = rects.map((rect, id) => {
			const cr = rect.r0 + Math.floor(rng() * rect.h);
			const cc = rect.c0 + Math.floor(rng() * rect.w);
			clueGrid[cr][cc] = id;
			return { r: cr, c: cc, shape: shapeOf(rect.h, rect.w), area: rect.h * rect.w };
		});

		if (countSolutions(clues, size) !== 1) continue;

		// Relax shape/area hints while the solution stays unique.
		const ops = shuffle(
			[
				...clues.map((_, i) => ({ i, kind: 'area' as const })),
				...clues.map((_, i) => ({ i, kind: 'shape' as const })),
			],
			rng,
		);
		let budget = Math.round(diff.relaxFrac * ops.length);
		for (const op of ops) {
			if (budget <= 0) break;
			const clue = clues[op.i];
			if (op.kind === 'area') {
				if (clue.area == null) continue;
				clue.area = null;
				if (countSolutions(clues, size) === 1) budget--;
				else clue.area = rects[op.i].h * rects[op.i].w;
			} else {
				if (clue.shape === 'any') continue;
				const prev = clue.shape;
				clue.shape = 'any';
				if (countSolutions(clues, size) === 1) budget--;
				else clue.shape = prev;
			}
		}

		const solution: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
		rects.forEach((rect, id) => {
			for (let rr = rect.r0; rr < rect.r0 + rect.h; rr++)
				for (let cc = rect.c0; cc < rect.c0 + rect.w; cc++) solution[rr][cc] = id;
		});

		return { size, clues, rects, solution };
	}

	throw new Error('Motifs: failed to generate a puzzle');
}
