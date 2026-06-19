/**
 * TENTE (Tents & Trees) — pure engine (no UI).
 * Place one tent per tree, each tent orthogonally adjacent to its tree (1-to-1),
 * no two tents touch (8-neighbourhood), row/column counts give the number of tents.
 * Generation guarantees a unique solution.
 */

import type { Rng } from '../prng';

export type Coord = [number, number];

export interface DiffLevel {
	label: string;
	size: number;
	tents: number; // target number of tents (= number of trees)
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 6, tents: 6 },
	moyen: { label: 'Moyen', size: 8, tents: 11 },
	difficile: { label: 'Difficile', size: 10, tents: 18 },
};

export interface TentePuzzle {
	size: number;
	trees: Coord[];
	tents: Coord[]; // the unique solution
	rowCounts: number[];
	colCounts: number[];
}

const key = (r: number, c: number) => r * 100 + c;

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

const ORTHO: Coord[] = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
];

function orthoNeighbours(r: number, c: number, n: number): Coord[] {
	const out: Coord[] = [];
	for (const [dr, dc] of ORTHO) {
		const nr = r + dr;
		const nc = c + dc;
		if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push([nr, nc]);
	}
	return out;
}

function touches8(r: number, c: number, taken: Set<number>): boolean {
	for (let dr = -1; dr <= 1; dr++)
		for (let dc = -1; dc <= 1; dc++) {
			if (dr === 0 && dc === 0) continue;
			if (taken.has(key(r + dr, c + dc))) return true;
		}
	return false;
}

/**
 * Count solutions by branching on trees: each tree picks one orthogonally-adjacent
 * tent cell (≤4 options), enforcing distinctness, the 8-neighbour no-touch rule and
 * the row/column counts. MRV ordering keeps it fast even on 10×10.
 *
 * This counts tree→tent assignments; since every valid tent placement admits at
 * least one such assignment, a count of exactly 1 proves the tent placement is
 * unique (the generator only accepts those). Stops once `limit` is reached.
 */
export function countSolutions(
	trees: Coord[],
	rowCounts: number[],
	colCounts: number[],
	n: number,
	limit = 2,
): number {
	const treeSet = new Set<number>(trees.map(([r, c]) => key(r, c)));
	const cand: number[][] = trees.map(([r, c]) =>
		orthoNeighbours(r, c, n)
			.filter(([nr, nc]) => !treeSet.has(key(nr, nc)))
			.map(([nr, nc]) => key(nr, nc)),
	);
	const tents = new Set<number>(); // chosen tent cells
	const rowLeft = [...rowCounts];
	const colLeft = [...colCounts];
	let count = 0;

	const canPlace = (cell: number): boolean => {
		const r = Math.floor(cell / 100);
		const c = cell % 100;
		if (rowLeft[r] <= 0 || colLeft[c] <= 0) return false;
		if (tents.has(cell)) return false;
		for (let dr = -1; dr <= 1; dr++)
			for (let dc = -1; dc <= 1; dc++) {
				if (dr === 0 && dc === 0) continue;
				if (tents.has((r + dr) * 100 + (c + dc))) return false;
			}
		return true;
	};

	const dfs = (remaining: number[]) => {
		if (count >= limit) return;
		if (remaining.length === 0) {
			count++;
			return;
		}
		// MRV: branch on the tree with the fewest currently-placeable tents.
		let best = -1;
		let bestOpts: number[] = [];
		for (const ti of remaining) {
			const opts = cand[ti].filter(canPlace);
			if (opts.length === 0) return; // dead end
			if (best === -1 || opts.length < bestOpts.length) {
				best = ti;
				bestOpts = opts;
				if (opts.length === 1) break;
			}
		}
		const rest = remaining.filter((t) => t !== best);
		for (const cell of bestOpts) {
			const r = Math.floor(cell / 100);
			const c = cell % 100;
			tents.add(cell);
			rowLeft[r]--;
			colLeft[c]--;
			dfs(rest);
			rowLeft[r]++;
			colLeft[c]++;
			tents.delete(cell);
			if (count >= limit) return;
		}
	};

	dfs(trees.map((_, i) => i));
	return count;
}

export function generateTente(diff: DiffLevel, rng: Rng = Math.random): TentePuzzle {
	const n = diff.size;
	const target = diff.tents;

	for (let attempt = 0; attempt < 400; attempt++) {
		// 1) Greedily place non-touching tents.
		const taken = new Set<number>();
		const tents: Coord[] = [];
		for (const [r, c] of shuffle(
			Array.from({ length: n * n }, (_, i): Coord => [Math.floor(i / n), i % n]),
			rng,
		)) {
			if (tents.length >= target) break;
			if (touches8(r, c, taken)) continue;
			taken.add(key(r, c));
			tents.push([r, c]);
		}
		if (tents.length < target) continue;

		// 2) Assign each tent a distinct orthogonal tree cell.
		const used = new Set<number>(taken); // tents + trees occupy cells
		const trees: Coord[] = [];
		let ok = true;
		for (const [r, c] of shuffle(tents, rng)) {
			const cand = shuffle(orthoNeighbours(r, c, n), rng).filter(([nr, nc]) => !used.has(key(nr, nc)));
			if (!cand.length) {
				ok = false;
				break;
			}
			const [tr, tc] = cand[0];
			used.add(key(tr, tc));
			trees.push([tr, tc]);
		}
		if (!ok) continue;

		// 3) Counts.
		const rowCounts = new Array(n).fill(0);
		const colCounts = new Array(n).fill(0);
		for (const [r, c] of tents) {
			rowCounts[r]++;
			colCounts[c]++;
		}

		// 4) Uniqueness.
		if (countSolutions(trees, rowCounts, colCounts, n, 2) === 1) {
			return { size: n, trees, tents, rowCounts, colCounts };
		}
	}

	// Fallback (very rare): a tiny trivially-unique puzzle.
	const trees: Coord[] = [[0, 1]];
	const tents: Coord[] = [[0, 0]];
	const rowCounts = new Array(n).fill(0);
	const colCounts = new Array(n).fill(0);
	rowCounts[0] = 1;
	colCounts[0] = 1;
	return { size: n, trees, tents, rowCounts, colCounts };
}

export interface HintResult {
	r: number;
	c: number;
	value: 'tent' | 'grass';
	reason: string;
}

/**
 * Find the next logically-deducible cell for the player and explain the technique.
 * `marks` is the player grid ('tent' | 'grass' | null). The returned value always
 * matches the solution (tent iff the cell is in puzzle.tents, else grass). Tree
 * cells are never targeted. Techniques are tried in order; a reason is only emitted
 * when its precondition truly holds on the current marks.
 */
export function findHint(marks: ('tent' | 'grass' | null)[][], puzzle: TentePuzzle): HintResult | null {
	const { size: n, trees, tents, rowCounts, colCounts } = puzzle;
	const treeSet = new Set<number>(trees.map(([r, c]) => key(r, c)));
	const solSet = new Set<number>(tents.map(([r, c]) => key(r, c)));
	const isTree = (r: number, c: number) => treeSet.has(key(r, c));
	const correct = (r: number, c: number): 'tent' | 'grass' => (solSet.has(key(r, c)) ? 'tent' : 'grass');

	const inb = (r: number, c: number) => r >= 0 && r < n && c >= 0 && c < n;
	const hasAdjacentTree = (r: number, c: number): boolean =>
		orthoNeighbours(r, c, n).some(([nr, nc]) => isTree(nr, nc));
	const touchesPlayerTent = (r: number, c: number): boolean => {
		for (let dr = -1; dr <= 1; dr++)
			for (let dc = -1; dc <= 1; dc++) {
				if (dr === 0 && dc === 0) continue;
				const nr = r + dr;
				const nc = c + dc;
				if (inb(nr, nc) && marks[nr][nc] === 'tent') return true;
			}
		return false;
	};

	// 1) Correction — a player mark that contradicts the solution.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (isTree(r, c)) continue;
			const m = marks[r][c];
			if (m == null) continue;
			if (m === correct(r, c)) continue;
			if (m === 'tent') {
				// Wrong tent → grass. Detect the concrete reason if possible.
				const detail = touchesPlayerTent(r, c)
					? 'deux tentes se toucheraient'
					: !hasAdjacentTree(r, c)
						? 'aucun arbre adjacent'
						: null;
				const reason = detail
					? `Ici il ne peut pas y avoir de tente (${detail}).`
					: 'Ici il ne peut pas y avoir de tente.';
				return { r, c, value: 'grass', reason };
			}
			// Wrong grass where the solution wants a tent.
			return { r, c, value: 'tent', reason: 'Cette case doit être une tente.' };
		}

	// A cell that could still legally take a tent: empty, not 'grass', not 8-adjacent
	// to an existing player tent (which would violate the no-touch rule).
	const couldHoldTent = (r: number, c: number): boolean =>
		!isTree(r, c) && marks[r][c] == null && !touchesPlayerTent(r, c);

	// 2) Tree with a single possible cell for its tent.
	for (const [tr, tc] of trees) {
		const opts = orthoNeighbours(tr, tc, n).filter(([nr, nc]) => couldHoldTent(nr, nc));
		if (opts.length === 1) {
			const [r, c] = opts[0];
			if (correct(r, c) === 'tent')
				return { r, c, value: 'tent', reason: "Cet arbre n'a qu'une case possible pour sa tente." };
		}
	}

	// 3) Empty cell touching a player tent → grass (no two tents touch).
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (isTree(r, c) || marks[r][c] != null) continue;
			if (touchesPlayerTent(r, c) && correct(r, c) === 'grass')
				return {
					r,
					c,
					value: 'grass',
					reason: 'Une tente est juste à côté : deux tentes ne se touchent jamais → herbe.',
				};
		}

	// Count placed tents per row / column.
	const placedRow = new Array(n).fill(0);
	const placedCol = new Array(n).fill(0);
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++)
			if (marks[r][c] === 'tent') {
				placedRow[r]++;
				placedCol[c]++;
			}

	// 4) Row/col count already reached → remaining empties are grass.
	for (const kind of ['row', 'col'] as const) {
		for (let i = 0; i < n; i++) {
			const placed = kind === 'row' ? placedRow[i] : placedCol[i];
			const target = kind === 'row' ? rowCounts[i] : colCounts[i];
			if (placed !== target) continue;
			for (let j = 0; j < n; j++) {
				const r = kind === 'row' ? i : j;
				const c = kind === 'row' ? j : i;
				if (isTree(r, c) || marks[r][c] != null) continue;
				if (correct(r, c) === 'grass') {
					const where = kind === 'row' ? 'ligne' : 'colonne';
					return { r, c, value: 'grass', reason: `Cette ${where} a déjà ses ${target} tentes → herbe.` };
				}
			}
		}
	}

	// 5) Free cells exactly equal the remaining tents needed → those are tents.
	for (const kind of ['row', 'col'] as const) {
		for (let i = 0; i < n; i++) {
			const placed = kind === 'row' ? placedRow[i] : placedCol[i];
			const target = kind === 'row' ? rowCounts[i] : colCounts[i];
			const need = target - placed;
			if (need <= 0) continue;
			const free: [number, number][] = [];
			for (let j = 0; j < n; j++) {
				const r = kind === 'row' ? i : j;
				const c = kind === 'row' ? j : i;
				if (couldHoldTent(r, c)) free.push([r, c]);
			}
			if (free.length === need) {
				const [r, c] = free[0];
				if (correct(r, c) === 'tent') {
					const where = kind === 'row' ? 'ligne' : 'colonne';
					return {
						r,
						c,
						value: 'tent',
						reason: `Il reste exactement ${need} cases possibles pour ${need} tentes dans cette ${where}.`,
					};
				}
			}
		}
	}

	// 6) Empty cell with no orthogonally-adjacent tree → grass.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (isTree(r, c) || marks[r][c] != null) continue;
			if (!hasAdjacentTree(r, c) && correct(r, c) === 'grass')
				return { r, c, value: 'grass', reason: 'Aucune tente possible ici (pas d\'arbre voisin) → herbe.' };
		}

	// 7) Fallback — any cell whose mark differs from its correct value.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (isTree(r, c)) continue;
			const v = correct(r, c);
			if (marks[r][c] === v) continue;
			const what = v === 'tent' ? 'une tente' : "de l'herbe";
			return { r, c, value: v, reason: `Par déduction, cette case est ${what}.` };
		}

	return null;
}
