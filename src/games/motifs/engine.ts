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

/** Recursively split a rectangle into pieces of dims <= 4 and area <= 6. */
function partition(r0: number, c0: number, h: number, w: number, rng: Rng, out: Rect[]): void {
	const canKeep = h <= 4 && w <= 4 && h * w <= 6;
	if (canKeep && (h === 1 && w === 1 ? true : rng() < 0.45)) {
		out.push({ r0, c0, h, w });
		return;
	}
	// Choose a split orientation; fall back to the other if not splittable.
	const preferVert = w > h ? true : w < h ? false : rng() < 0.5;
	const splitVert = preferVert ? w > 1 : !(h > 1) && w > 1;
	if (splitVert) {
		const cut = 1 + Math.floor(rng() * (w - 1));
		partition(r0, c0, h, cut, rng, out);
		partition(r0, c0 + cut, h, w - cut, rng, out);
	} else if (h > 1) {
		const cut = 1 + Math.floor(rng() * (h - 1));
		partition(r0, c0, cut, w, rng, out);
		partition(r0 + cut, c0, h - cut, w, rng, out);
	} else {
		out.push({ r0, c0, h, w }); // 1×w or h×1 that we chose not to split
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
