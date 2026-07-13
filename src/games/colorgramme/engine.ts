/**
 * COLORGRAMME — pure engine (no UI). A fully-coloured deduction grid.
 * Every cell is one of K colours (no background). For each line, the clue gives,
 * per colour, the ordered lengths of that colour's blocks — but NOT how the
 * colours interleave. The player only ever sees the active colour's numbers, so
 * the interleaving (where each block starts) is the deduction.
 *
 * Generation keeps only puzzles solvable by pure line deduction (`lineSolve`),
 * which also guarantees a unique solution.
 */

import type { Rng } from '../prng';

/** Per line: clue[color-1] = ordered block lengths of that colour. */
export type LineClue = number[][];

export interface ColorgrammePuzzle {
	size: number;
	colors: number; // K
	rowClues: LineClue[];
	colClues: LineClue[];
	solution: number[][]; // every cell 1..K
	given: [number, number][]; // pre-filled (locked) cells so the puzzle stays step-by-step solvable
}

export interface DiffLevel {
	label: string;
	size: number;
	colors: number;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 5, colors: 2 },
	moyen: { label: 'Moyen', size: 6, colors: 3 },
	difficile: { label: 'Difficile', size: 8, colors: 3 }, // 3 colours: keep the big grid but drop the 4th colour (opaque, ungrokkable by eye)
};

/** Clue of one fully-coloured line: ordered block lengths grouped by colour. */
export function lineClueOf(line: number[], colors: number): LineClue {
	const clue: number[][] = Array.from({ length: colors }, () => []);
	let i = 0;
	while (i < line.length) {
		const c = line[i];
		let len = 0;
		while (i < line.length && line[i] === c) { len++; i++; }
		if (c >= 1 && c <= colors) clue[c - 1].push(len);
	}
	return clue;
}

/** Every full colouring obtained by interleaving the per-colour block runs
    (never two same-colour blocks adjacent). */
export function lineColorings(clue: LineClue, size: number): number[][] {
	const res: number[][] = [];
	const ptr = clue.map(() => 0);
	const total = clue.reduce((s, arr) => s + arr.length, 0);
	const cur: number[] = [];

	const place = (lastColor: number, placed: number): void => {
		if (placed === total) {
			if (cur.length === size) res.push([...cur]);
			return;
		}
		for (let ci = 0; ci < clue.length; ci++) {
			const color = ci + 1;
			if (color === lastColor || ptr[ci] >= clue[ci].length) continue;
			const len = clue[ci][ptr[ci]];
			if (cur.length + len > size) continue;
			ptr[ci]++;
			for (let k = 0; k < len; k++) cur.push(color);
			place(color, placed + 1);
			for (let k = 0; k < len; k++) cur.pop();
			ptr[ci]--;
		}
	};
	place(0, 0);
	return res;
}

const bitIndex = (m: number): number => {
	let v = 0;
	while (m > 1) { m >>= 1; v++; }
	return v;
};

function refine(colorings: number[][], size: number, cand: number[]): { changed: boolean; cand: number[] } {
	const proj = new Array(size).fill(0);
	for (const col of colorings) {
		let ok = true;
		for (let i = 0; i < size; i++) if (!((cand[i] >> col[i]) & 1)) { ok = false; break; }
		if (!ok) continue;
		for (let i = 0; i < size; i++) proj[i] |= 1 << col[i];
	}
	const out = cand.slice();
	let changed = false;
	for (let i = 0; i < size; i++) {
		const nv = cand[i] & proj[i];
		if (nv !== cand[i]) changed = true;
		out[i] = nv;
	}
	return { changed, cand: out };
}

/** Iterated line deduction. Returns the fully-determined grid, or null if the
    clues are not enough to deduce every cell without guessing. */
export function lineSolve(
	rowClues: LineClue[],
	colClues: LineClue[],
	size: number,
	colors: number,
): number[][] | null {
	const full = ((1 << (colors + 1)) - 1) & ~1; // colours 1..K (bit 0 unused)
	const cand: number[][] = Array.from({ length: size }, () => new Array(size).fill(full));
	const rowOpts = rowClues.map((cl) => lineColorings(cl, size));
	const colOpts = colClues.map((cl) => lineColorings(cl, size));

	let changed = true;
	while (changed) {
		changed = false;
		for (let r = 0; r < size; r++) {
			const res = refine(rowOpts[r], size, cand[r]);
			if (res.changed) { cand[r] = res.cand; changed = true; }
		}
		for (let c = 0; c < size; c++) {
			const colCand = cand.map((row) => row[c]);
			const res = refine(colOpts[c], size, colCand);
			if (res.changed) {
				for (let r = 0; r < size; r++) cand[r][c] = res.cand[r];
				changed = true;
			}
		}
	}

	const grid = Array.from({ length: size }, () => new Array(size).fill(-1));
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			const m = cand[r][c];
			if (m === 0 || (m & (m - 1)) !== 0) return null; // empty or not a singleton
			grid[r][c] = bitIndex(m);
		}
	return grid;
}

/** Count solutions consistent with the clues, stopping at `limit` (uniqueness). */
export function countSolutions(
	rowClues: LineClue[],
	colClues: LineClue[],
	size: number,
	limit = 2,
): number {
	const rowOpts = rowClues.map((cl) => lineColorings(cl, size));
	const colOpts = colClues.map((cl) => lineColorings(cl, size));
	const grid = Array.from({ length: size }, () => new Array(size).fill(0));
	let count = 0;

	const colPrefixOK = (rowsPlaced: number): boolean => {
		for (let c = 0; c < size; c++) {
			const ok = colOpts[c].some((col) => {
				for (let r = 0; r < rowsPlaced; r++) if (col[r] !== grid[r][c]) return false;
				return true;
			});
			if (!ok) return false;
		}
		return true;
	};

	const dfs = (r: number): void => {
		if (count >= limit) return;
		if (r === size) { count++; return; }
		for (const row of rowOpts[r]) {
			for (let c = 0; c < size; c++) grid[r][c] = row[c];
			if (colPrefixOK(r + 1)) dfs(r + 1);
			if (count >= limit) return;
		}
	};
	dfs(0);
	return count;
}

const clues = (grid: number[][], size: number, K: number): { rowClues: LineClue[]; colClues: LineClue[] } => ({
	rowClues: grid.map((row) => lineClueOf(row, K)),
	colClues: Array.from({ length: size }, (_, c) => lineClueOf(grid.map((row) => row[c]), K)),
});

/** FR colour names for the palette (1..K). Beyond the list, fall back to a generic. */
const COLOR_NAMES = ['rouge', 'bleu', 'jaune', 'vert'];
const colorName = (v: number): string => COLOR_NAMES[v - 1] ?? 'cette couleur';

export interface HintResult {
	r: number;
	c: number;
	value: number; // colour id 1..K
	reason: string;
}

/**
 * Find the next logically-deducible cell for the player and explain the technique.
 * 1) Correction: a painted cell whose colour ≠ solution.
 * 2) Block overlap: a still-empty cell forced to one colour across EVERY line
 *    colouring consistent with what the player has already placed.
 * 3) Fallback: first empty cell → its solution colour.
 * The returned value always equals the solution.
 */
export function findHint(grid: number[][], puzzle: ColorgrammePuzzle): HintResult | null {
	const { size, rowClues, colClues, solution } = puzzle;

	// 1) Correction — a painted cell that contradicts the picture.
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			const x = grid[r][c];
			if (x === 0 || x === solution[r][c]) continue;
			// Which axis disagrees? (the painted x breaks that line's block clue)
			const rowBad = !lineColorings(rowClues[r], size).some((col) =>
				lineMatchesGrid(col, grid[r]),
			);
			const where = rowBad ? `la ligne ${r + 1}` : `la colonne ${c + 1}`;
			return {
				r,
				c,
				value: solution[r][c],
				reason: `Ligne ${r + 1}, colonne ${c + 1} : ${colorName(x)} est impossible ici — aucune façon de placer les blocs de ${where} ne le permet. C'est ${colorName(solution[r][c])}.`,
			};
		}

	// 2) Block overlap — forced colour on a row or column, where the player is empty.
	for (let r = 0; r < size; r++) {
		const forced = forcedCells(rowClues[r], grid[r], size);
		for (let c = 0; c < size; c++)
			if (grid[r][c] === 0 && forced[c] !== 0) {
				if (forced[c] !== solution[r][c]) continue; // safety: only ever the solution
				return {
					r,
					c,
					value: forced[c],
					reason: `Ligne ${r + 1} : quelle que soit la façon d'y placer les blocs, cette case est toujours ${colorName(forced[c])}. C'est forcé.`,
				};
			}
	}
	for (let c = 0; c < size; c++) {
		const colLine = grid.map((row) => row[c]);
		const forced = forcedCells(colClues[c], colLine, size);
		for (let r = 0; r < size; r++)
			if (grid[r][c] === 0 && forced[r] !== 0) {
				if (forced[r] !== solution[r][c]) continue;
				return {
					r,
					c,
					value: forced[r],
					reason: `Colonne ${c + 1} : quelle que soit la façon d'y placer les blocs, cette case est toujours ${colorName(forced[r])}. C'est forcé.`,
				};
			}
	}

	// 3) Fallback — first empty cell.
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++)
			if (grid[r][c] === 0)
				return {
					r,
					c,
					value: solution[r][c],
					reason: `Ligne ${r + 1}, colonne ${c + 1} : en croisant les indices de ligne et de colonne, cette case est ${colorName(solution[r][c])}.`,
				};

	return null;
}

/** A line colouring is consistent with the player's partial line (0 = unknown). */
function lineMatchesGrid(coloring: number[], line: number[]): boolean {
	for (let i = 0; i < line.length; i++) if (line[i] !== 0 && line[i] !== coloring[i]) return false;
	return true;
}

/**
 * Cells forced to a single colour across all line colourings consistent with the
 * player's current line. Returns an array: forced[i] = colour, or 0 if not forced.
 */
function forcedCells(clue: LineClue, line: number[], size: number): number[] {
	const out = new Array(size).fill(0);
	const proj = new Array(size).fill(0); // bitmask of colours seen at each cell
	let any = false;
	for (const col of lineColorings(clue, size)) {
		if (!lineMatchesGrid(col, line)) continue;
		any = true;
		for (let i = 0; i < size; i++) proj[i] |= 1 << col[i];
	}
	if (!any) return out;
	for (let i = 0; i < size; i++) {
		const m = proj[i];
		if (m !== 0 && (m & (m - 1)) === 0) out[i] = bitIndex(m); // singleton → forced
	}
	return out;
}

/**
 * "Human" solver: ONLY positive single-line forced fills (forcedCells), iterated
 * over rows then columns to a fixpoint. Deliberately weaker than lineSolve (no
 * negative cross-elimination), so a grid it completes is findable step by step by
 * eye. `seed` supplies known cells (givens) and is not mutated.
 */
export function easySolve(rowClues: LineClue[], colClues: LineClue[], size: number, seed: number[][]): number[][] {
	const g = seed.map((row) => row.slice());
	let changed = true;
	while (changed) {
		changed = false;
		for (let r = 0; r < size; r++) {
			const forced = forcedCells(rowClues[r], g[r], size);
			for (let c = 0; c < size; c++) if (g[r][c] === 0 && forced[c] !== 0) { g[r][c] = forced[c]; changed = true; }
		}
		for (let c = 0; c < size; c++) {
			const colLine = g.map((row) => row[c]);
			const forced = forcedCells(colClues[c], colLine, size);
			for (let r = 0; r < size; r++) if (g[r][c] === 0 && forced[r] !== 0) { g[r][c] = forced[r]; changed = true; }
		}
	}
	return g;
}

/**
 * Minimal given cells so `easySolve` completes the whole grid: reveal stalled
 * cells one at a time until the human solver finishes. Deterministic (row-major
 * scan → stable dailies). Returns null if it needs more than `cap` givens.
 */
function computeGivens(sol: number[][], rowClues: LineClue[], colClues: LineClue[], size: number, cap: number): [number, number][] | null {
	const given: [number, number][] = [];
	for (;;) {
		const seed = Array.from({ length: size }, () => new Array(size).fill(0));
		for (const [r, c] of given) seed[r][c] = sol[r][c];
		const solved = easySolve(rowClues, colClues, size, seed);
		let stuck: [number, number] | null = null;
		for (let r = 0; r < size && !stuck; r++) for (let c = 0; c < size; c++) if (solved[r][c] === 0) { stuck = [r, c]; break; }
		if (!stuck) return given; // easy-solvable from the givens
		if (given.length >= cap) return null; // too many needed → prefer another puzzle
		given.push(stuck);
	}
}

export function generateColorgramme(diff: DiffLevel, rng: Rng = Math.random): ColorgrammePuzzle {
	const { size, colors: K } = diff;
	const givenCap = Math.ceil(size * size * 0.2); // reject puzzles that would need too many reveals

	for (let attempt = 0; attempt < 4000; attempt++) {
		const sol = Array.from({ length: size }, () =>
			Array.from({ length: size }, () => 1 + Math.floor(rng() * K)),
		);

		// Every colour used, and no line of a single colour (too trivial).
		const used = new Set(sol.flat());
		if (used.size < K) continue;
		let uniform = false;
		for (let r = 0; r < size && !uniform; r++) if (sol[r].every((v) => v === sol[r][0])) uniform = true;
		for (let c = 0; c < size && !uniform; c++) if (sol.every((row) => row[c] === sol[0][c])) uniform = true;
		if (uniform) continue;

		const { rowClues, colClues } = clues(sol, size, K);
		const solved = lineSolve(rowClues, colClues, size, K);
		if (!solved) continue;
		let eq = true;
		for (let r = 0; r < size && eq; r++)
			for (let c = 0; c < size; c++) if (solved[r][c] !== sol[r][c]) { eq = false; break; }
		if (!eq) continue;

		// Guarantee a step-by-step (single-line) path: reveal minimal given cells.
		const given = computeGivens(sol, rowClues, colClues, size, givenCap);
		if (!given) continue; // needs too many reveals → try another

		return { size, colors: K, rowClues, colClues, solution: sol, given };
	}

	throw new Error('Colorgramme: failed to generate a puzzle');
}
