/**
 * REINES (LinkedIn "Queens") — pure engine (no UI).
 * n×n grid split into n colour regions. Place one queen per row, per column
 * and per region, with no two queens adjacent (orthogonal or diagonal).
 * Generation guarantees a unique solution.
 */

import type { Rng } from '../prng';

export interface DiffLevel {
	label: string;
	size: number;
}

export interface ReinesPuzzle {
	size: number;
	regions: number[][]; // region id 0..n-1 per cell
	solution: number[]; // solution[row] = col of the queen
}

export type CellState = 0 | 1 | 2; // empty | cross | queen

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 6 },
	moyen: { label: 'Moyen', size: 7 },
	difficile: { label: 'Difficile', size: 8 },
};

// Fixed, clearly distinct palette (one solid colour per region, n <= 8).
// First 6 (used on the 6×6 board) are maximally distinct — no two confusable cyan/blue tones.
export const PALETTE = [
	'#f49a91', // red / coral
	'#f7c25c', // orange
	'#f6e87a', // yellow
	'#95d68a', // green
	'#84a9f2', // blue
	'#c2a0ee', // purple
	'#5fcabf', // teal (only on 7×7+)
	'#f29ac9', // pink (only on 8×8)
];

/** Colour of a region id — a deterministic, unique mapping for ids 0..7. */
export const regionColor = (id: number) => PALETTE[id % PALETTE.length];

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Random valid queen placement: a permutation with no diagonally-adjacent
 *  queens on consecutive rows (the only adjacency possible with 1 per row/col). */
function randomSolution(n: number, rng: Rng): number[] | null {
	const sol = new Array(n).fill(-1);
	const usedCol = new Array(n).fill(false);

	const place = (r: number): boolean => {
		if (r === n) return true;
		for (const c of shuffle(
			Array.from({ length: n }, (_, i) => i),
			rng,
		)) {
			if (usedCol[c]) continue;
			if (r > 0 && Math.abs(sol[r - 1] - c) === 1) continue; // diagonal adjacency
			sol[r] = c;
			usedCol[c] = true;
			if (place(r + 1)) return true;
			usedCol[c] = false;
			sol[r] = -1;
		}
		return false;
	};

	return place(0) ? sol : null;
}

const NEI4 = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
] as const;

/** Grow n connected regions from the queen cells via randomised frontier fill
 *  (fast, reliably unique-solvable; region shapes stay irregular by nature). */
function growRegions(n: number, solution: number[], rng: Rng): number[][] {
	const regions: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));
	const frontier: [number, number, number][] = []; // r, c, region

	const addNeighbours = (r: number, c: number, id: number) => {
		for (const [dr, dc] of NEI4) {
			const nr = r + dr;
			const nc = c + dc;
			if (nr >= 0 && nr < n && nc >= 0 && nc < n && regions[nr][nc] === -1) frontier.push([nr, nc, id]);
		}
	};

	for (let id = 0; id < n; id++) {
		regions[id][solution[id]] = id;
		addNeighbours(id, solution[id], id);
	}

	let remaining = n * n - n;
	while (remaining > 0 && frontier.length) {
		const idx = Math.floor(rng() * frontier.length);
		const [r, c, id] = frontier.splice(idx, 1)[0];
		if (regions[r][c] !== -1) continue;
		regions[r][c] = id;
		remaining--;
		addNeighbours(r, c, id);
	}

	// Safety: attach any leftover cell to a neighbouring region (kept contiguous).
	if (remaining > 0) {
		let changed = true;
		while (changed && remaining > 0) {
			changed = false;
			for (let r = 0; r < n; r++)
				for (let c = 0; c < n; c++)
					if (regions[r][c] === -1)
						for (const [dr, dc] of NEI4) {
							const nr = r + dr;
							const nc = c + dc;
							if (nr >= 0 && nr < n && nc >= 0 && nc < n && regions[nr][nc] !== -1) {
								regions[r][c] = regions[nr][nc];
								remaining--;
								changed = true;
								break;
							}
						}
		}
	}
	return regions;
}

/** True if two cells are adjacent (orthogonal or diagonal). */
const adjacent = (r1: number, c1: number, r2: number, c2: number) =>
	Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;

export type ConflictReason = 'ligne' | 'colonne' | 'zone' | 'contact';

export interface Conflicts {
	cells: Set<string>; // "r,c" of every queen in conflict
	reasons: Set<ConflictReason>;
	regions: Set<number>; // region ids holding 2+ queens
}

/**
 * Pure conflict check shared by the UI and the tests.
 * Two queens conflict if they share a row, a column, a colour region, or are
 * adjacent (the 8 surrounding cells).
 */
export function findConflicts(regions: number[][], queens: [number, number][]): Conflicts {
	const cells = new Set<string>();
	const reasons = new Set<ConflictReason>();
	const regionCount = new Map<number, number>();
	for (const [r, c] of queens) {
		const id = regions[r]?.[c];
		if (id === undefined) continue; // ignore out-of-bounds queens (defensive)
		regionCount.set(id, (regionCount.get(id) ?? 0) + 1);
	}

	for (let i = 0; i < queens.length; i++) {
		for (let j = i + 1; j < queens.length; j++) {
			const [r1, c1] = queens[i];
			const [r2, c2] = queens[j];
			const reg1 = regions[r1]?.[c1];
			const reg2 = regions[r2]?.[c2];
			let reason: ConflictReason | null = null;
			if (r1 === r2) reason = 'ligne';
			else if (c1 === c2) reason = 'colonne';
			else if (reg1 !== undefined && reg1 === reg2) reason = 'zone';
			else if (adjacent(r1, c1, r2, c2)) reason = 'contact';
			if (reason) {
				cells.add(`${r1},${c1}`);
				cells.add(`${r2},${c2}`);
				reasons.add(reason);
			}
		}
	}

	const conflictRegions = new Set<number>();
	for (const [id, n] of regionCount) if (n >= 2) conflictRegions.add(id);
	return { cells, reasons, regions: conflictRegions };
}

/** Count solutions of a regions board, stopping at `limit`. */
export function countSolutions(regions: number[][], n: number, limit = 2): number {
	const cols = new Array(n).fill(false);
	const usedRegion = new Array(n).fill(false);
	const placed: number[] = []; // placed[row] = col
	let count = 0;

	const dfs = (r: number) => {
		if (count >= limit) return;
		if (r === n) {
			count++;
			return;
		}
		for (let c = 0; c < n; c++) {
			if (cols[c]) continue;
			const id = regions[r][c];
			if (usedRegion[id]) continue;
			if (r > 0 && adjacent(r, c, r - 1, placed[r - 1])) continue;
			cols[c] = true;
			usedRegion[id] = true;
			placed[r] = c;
			dfs(r + 1);
			cols[c] = false;
			usedRegion[id] = false;
			if (count >= limit) return;
		}
	};

	dfs(0);
	return count;
}

export interface HintResult {
	r: number;
	c: number;
	value: 'queen' | 'cross';
	reason: string;
}

/**
 * Find the next logically-deducible move and explain the technique (French).
 * `marks`: player grid, 0 empty / 1 cross / 2 queen. Corrects a misplaced queen
 * first; then the only possible cell of a unit (queen), an attacked cell (cross),
 * finally an honest fallback. A proposed 'queen' is always solution[r] === c.
 */
export function findHint(marks: CellState[][], puzzle: ReinesPuzzle): HintResult | null {
	const { size: n, regions, solution } = puzzle;
	const isQueen = (r: number, c: number) => marks[r]?.[c] === 2;
	const isSolQueen = (r: number, c: number) => solution[r] === c;

	// Placed queens (player), for attack tests.
	const queens: [number, number][] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) if (isQueen(r, c)) queens.push([r, c]);

	// A cell is attacked if a placed queen shares its row/col/region or is 8-adjacent.
	const attackedBy = (r: number, c: number): boolean =>
		queens.some(
			([qr, qc]) =>
				!(qr === r && qc === c) &&
				(qr === r ||
					qc === c ||
					regions[qr]?.[qc] === regions[r]?.[c] ||
					adjacent(qr, qc, r, c)),
		);

	// 1) Correction — a player queen off the solution.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!isQueen(r, c) || isSolQueen(r, c)) continue;
			let why = '';
			for (const [qr, qc] of queens) {
				if (qr === r && qc === c) continue;
				if (qr === r) why = 'en conflit de ligne';
				else if (qc === c) why = 'en conflit de colonne';
				else if (regions[qr]?.[qc] === regions[r]?.[c]) why = 'en conflit de zone';
				else if (adjacent(qr, qc, r, c)) why = 'deux reines se touchent';
				if (why) break;
			}
			const cause = why ? ` (${why})` : '';
			return {
				r,
				c: solution[r],
				value: 'queen',
				reason: `Cette reine est mal placée${cause} — la reine de cette ligne va en colonne ${solution[r] + 1}.`,
			};
		}

	const emptyNonAttacked = (cells: [number, number][]): [number, number][] =>
		cells.filter(([r, c]) => marks[r]?.[c] === 0 && !attackedBy(r, c));

	// 2) Only possible cell of a row / column / region -> queen.
	const rowCells = (i: number): [number, number][] =>
		Array.from({ length: n }, (_, c): [number, number] => [i, c]);
	const colCells = (i: number): [number, number][] =>
		Array.from({ length: n }, (_, r): [number, number] => [r, i]);
	const regionCells = (id: number): [number, number][] => {
		const out: [number, number][] = [];
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++) if (regions[r][c] === id) out.push([r, c]);
		return out;
	};
	const hasQueen = (cells: [number, number][]) => cells.some(([r, c]) => isQueen(r, c));

	const units: { kind: 'ligne' | 'colonne' | 'zone'; cells: [number, number][] }[] = [];
	for (let i = 0; i < n; i++) units.push({ kind: 'ligne', cells: rowCells(i) });
	for (let i = 0; i < n; i++) units.push({ kind: 'colonne', cells: colCells(i) });
	for (let id = 0; id < n; id++) units.push({ kind: 'zone', cells: regionCells(id) });

	for (const { kind, cells } of units) {
		if (hasQueen(cells)) continue;
		const free = emptyNonAttacked(cells);
		if (free.length !== 1) continue;
		const [r, c] = free[0];
		if (!isSolQueen(r, c)) continue; // safety: must match the solution
		return {
			r,
			c,
			value: 'queen',
			reason: `Cette ${kind} n'a qu'une case possible pour sa reine.`,
		};
	}

	// 3) An attacked empty cell -> cross.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (marks[r]?.[c] !== 0) continue;
			if (isSolQueen(r, c)) continue; // never cross a real queen cell
			if (attackedBy(r, c))
				return {
					r,
					c,
					value: 'cross',
					reason: 'Cette case est attaquée par une reine → croix.',
				};
		}

	// 4) Fallback — next missing solution queen.
	for (let r = 0; r < n; r++)
		if (!isQueen(r, solution[r]))
			return { r, c: solution[r], value: 'queen', reason: 'La reine de cette ligne va ici.' };

	return null;
}

/** Generate a uniquely-solvable Reines puzzle. */
export function generateReines(diff: DiffLevel, rng: Rng = Math.random): ReinesPuzzle {
	const n = diff.size;
	for (let attempt = 0; attempt < 200; attempt++) {
		const solution = randomSolution(n, rng);
		if (!solution) continue;
		// A few region layouts per solution before re-seeding the solution.
		for (let g = 0; g < 12; g++) {
			const regions = growRegions(n, solution, rng);
			if (countSolutions(regions, n, 2) === 1) {
				return { size: n, regions, solution };
			}
		}
	}
	// Extremely unlikely fallback: return last attempt's layout.
	const solution = randomSolution(n, rng) ?? Array.from({ length: n }, (_, i) => i);
	const regions = growRegions(n, solution, rng);
	return { size: n, regions, solution };
}
