/**
 * BATAILLE NAVALE LOGIQUE — pure engine (no UI).
 * Find a hidden fleet. Cells are water or ship; ships never touch (8-neighbourhood).
 * Minesweeper-style clues: some water cells show the count of ship cells in their
 * orthogonal neighbourhood (see CLUE_OFFSETS). Generation guarantees a unique solution.
 */

import type { Rng } from '../prng';

export type Given = 'ship' | 'water' | null;
export type SegType =
	| 'single'
	| 'left'
	| 'right'
	| 'top'
	| 'bottom'
	| 'mid-h'
	| 'mid-v'
	| null;

export interface SizeLevel {
	label: string;
	size: number;
	fleet: number[]; // ship lengths, sorted desc (min length 2)
}

export const SIZES: Record<string, SizeLevel> = {
	'5': { label: '5×5', size: 5, fleet: [3, 2, 2] },
	'6': { label: '6×6', size: 6, fleet: [3, 3, 2, 2] },
	'7': { label: '7×7', size: 7, fleet: [4, 3, 2, 2] },
};

export interface DiffLevel {
	label: string;
	extraClues: number; // clues revealed beyond the minimal unique set (more = easier)
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', extraClues: 5 },
	moyen: { label: 'Moyen', extraClues: 2 },
	difficile: { label: 'Difficile', extraClues: 0 },
};

/** A revealed proximity clue: cell (r,c) is water and shows `n` = ship cells in its neighbourhood. */
export interface ClueCell {
	r: number;
	c: number;
	n: number;
}

export interface BataillePuzzle {
	size: number;
	fleet: number[];
	solution: boolean[][]; // true = ship
	clues: ClueCell[]; // proximity numbers (always on water cells)
	given: Given[][]; // clue cells mapped to 'water'; locks input + drives shipGrid
}

interface Placement {
	cells: [number, number][];
	idx: number; // canonical order key
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Segment shape of a ship cell, from its ship neighbours (for rendering). */
export function segType(grid: boolean[][], r: number, c: number): SegType {
	if (!grid[r][c]) return null;
	const n = grid.length;
	const up = r > 0 && grid[r - 1][c];
	const down = r < n - 1 && grid[r + 1][c];
	const left = c > 0 && grid[r][c - 1];
	const right = c < n - 1 && grid[r][c + 1];
	if (!up && !down && !left && !right) return 'single';
	if (left && right) return 'mid-h';
	if (up && down) return 'mid-v';
	if (right) return 'left';
	if (left) return 'right';
	if (down) return 'top';
	return 'bottom';
}

/**
 * Neighbourhood a proximity clue counts over. Orthogonal only (no diagonals); add the four
 * diagonal offsets here to count diagonals too. Independent of the no-touch rule, which always
 * uses the full 8-neighbourhood.
 */
export const CLUE_OFFSETS: readonly [number, number][] = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
];

/** Count of ship cells in the clue neighbourhood of (r,c). */
export function proximity(grid: boolean[][], r: number, c: number, n: number): number {
	let k = 0;
	for (const [dr, dc] of CLUE_OFFSETS) {
		const nr = r + dr;
		const nc = c + dc;
		if (nr >= 0 && nr < n && nc >= 0 && nc < n && grid[nr][nc]) k++;
	}
	return k;
}

function allPlacements(n: number, L: number): Placement[] {
	const out: Placement[] = [];
	if (L === 1) {
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++) out.push({ cells: [[r, c]], idx: (r * n + c) * 2 });
		return out;
	}
	// horizontal
	for (let r = 0; r < n; r++)
		for (let c = 0; c + L <= n; c++) {
			const cells: [number, number][] = [];
			for (let k = 0; k < L; k++) cells.push([r, c + k]);
			out.push({ cells, idx: (r * n + c) * 2 });
		}
	// vertical
	for (let c = 0; c < n; c++)
		for (let r = 0; r + L <= n; r++) {
			const cells: [number, number][] = [];
			for (let k = 0; k < L; k++) cells.push([r + k, c]);
			out.push({ cells, idx: (r * n + c) * 2 + 1 });
		}
	return out;
}

function fits(grid: number[][], cells: [number, number][], n: number): boolean {
	for (const [r, c] of cells) {
		if (grid[r][c] !== 0) return false;
		for (let dr = -1; dr <= 1; dr++)
			for (let dc = -1; dc <= 1; dc++) {
				const nr = r + dr;
				const nc = c + dc;
				if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
				// neighbour occupied by a ship not part of this placement
				if (grid[nr][nc] === 1 && !cells.some(([cr, cc]) => cr === nr && cc === nc)) return false;
			}
	}
	return true;
}

/**
 * Placement-based solver: place each fleet ship (in length order) into every legal position,
 * enforcing no-touch via `fits`. Equal-length ships are placed in increasing canonical order
 * so each distinct grid is counted once. Per-clue ship counts prune overflow during placement;
 * the full clue equality + given coverage are verified once the fleet is placed. Stops at
 * `limit`. Fast on small boards thanks to the no-touch pruning between placements.
 */
export function countSolutions(
	size: number,
	fleet: number[],
	clues: ClueCell[],
	given: Given[][],
	limit = 2,
): number {
	const n = size;
	const fleetSorted = [...fleet].sort((a, b) => b - a);
	const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(0)); // 0 water, 1 ship

	// Placements per distinct ship length (computed once).
	const placeCache = new Map<number, Placement[]>();
	const placementsFor = (L: number) => {
		let ps = placeCache.get(L);
		if (!ps) {
			ps = allPlacements(n, L);
			placeCache.set(L, ps);
		}
		return ps;
	};

	// Clue bookkeeping: which clues each cell feeds, and the running ship count per clue.
	const cellClues: number[][] = Array.from({ length: n * n }, () => []);
	clues.forEach((cl, j) => {
		for (const [dr, dc] of CLUE_OFFSETS) {
			const nr = cl.r + dr;
			const nc = cl.c + dc;
			if (nr >= 0 && nr < n && nc >= 0 && nc < n) cellClues[nr * n + nc].push(j);
		}
	});
	const clueShip = new Array(clues.length).fill(0);

	// Cells that must / must not be ship.
	const shipGivens: [number, number][] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) if (given[r][c] === 'ship') shipGivens.push([r, c]);
	const forbidden = (r: number, c: number) => given[r][c] === 'water';

	let count = 0;

	// Apply a placement; return false if it pushes any clue over its number (already applied).
	const apply = (cells: [number, number][]): boolean => {
		let ok = true;
		for (const [r, c] of cells) {
			grid[r][c] = 1;
			for (const j of cellClues[r * n + c]) {
				clueShip[j]++;
				if (clueShip[j] > clues[j].n) ok = false;
			}
		}
		return ok;
	};
	const undo = (cells: [number, number][]) => {
		for (const [r, c] of cells) {
			grid[r][c] = 0;
			for (const j of cellClues[r * n + c]) clueShip[j]--;
		}
	};

	const place = (i: number, minIdx: number) => {
		if (count >= limit) return;
		if (i === fleetSorted.length) {
			for (let j = 0; j < clues.length; j++) if (clueShip[j] !== clues[j].n) return;
			for (const [r, c] of shipGivens) if (grid[r][c] !== 1) return;
			count++;
			return;
		}
		const L = fleetSorted[i];
		const sameAsPrev = i > 0 && fleetSorted[i - 1] === L;
		const nextSame = i + 1 < fleetSorted.length && fleetSorted[i + 1] === L;
		for (const p of placementsFor(L)) {
			if (sameAsPrev && p.idx < minIdx) continue; // canonical order for equal ships
			if (p.cells.some(([r, c]) => forbidden(r, c))) continue;
			if (!fits(grid, p.cells, n)) continue;
			const ok = apply(p.cells);
			// Next ship of equal length must come later in canonical order (de-dup).
			if (ok) place(i + 1, nextSame ? p.idx + 1 : 0);
			undo(p.cells);
			if (count >= limit) return;
		}
	};

	place(0, 0);
	return count;
}

function placeFleet(n: number, fleet: number[], rng: Rng): boolean[][] | null {
	const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
	const place = (i: number): boolean => {
		if (i === fleet.length) return true;
		const cands = shuffle(allPlacements(n, fleet[i]), rng);
		for (const p of cands) {
			if (!fits(grid, p.cells, n)) continue;
			for (const [r, c] of p.cells) grid[r][c] = 1;
			if (place(i + 1)) return true;
			for (const [r, c] of p.cells) grid[r][c] = 0;
		}
		return false;
	};
	if (!place(0)) return null;
	return grid.map((row) => row.map((v) => v === 1));
}

export type Mark = 0 | 1 | 2; // 0 empty, 1 ship, 2 water (player marks)

export interface HintResult {
	cells: { r: number; c: number }[];
	value: 'ship' | 'water';
	reason: string;
}

/**
 * Find the next logically-deducible cell for the player and explain the technique
 * in French. `marks` is the player grid (0 empty / 1 ship / 2 water); given cells are
 * locked and never targeted. The effective grid = givens + player marks. The returned
 * value always matches the solution.
 *
 * Each call returns one rule's worth of cells (same value + reason). Order: correction →
 * clue-0 → clue satisfied → clue forced full → diagonal-of-ship → ship borders → proof by
 * contradiction (last resort, always sound).
 */
export function findHint(marks: Mark[][], puzzle: BataillePuzzle): HintResult | null {
	const { size: n, fleet, solution, clues, given } = puzzle;

	const locked = (r: number, c: number) => given[r][c] !== null;
	const correct = (r: number, c: number): 'ship' | 'water' => (solution[r][c] ? 'ship' : 'water');
	// Effective ship: a given ship or a player-marked ship.
	const isShip = (r: number, c: number) =>
		r >= 0 && r < n && c >= 0 && c < n && (given[r][c] === 'ship' || marks[r][c] === 1);
	// Decided = given, or player marked ship/water.
	const decided = (r: number, c: number) => locked(r, c) || marks[r][c] !== 0;
	// Free & still empty (a valid hint target). Bounds-safe (used on 8-neighbours).
	const empty = (r: number, c: number) =>
		r >= 0 && r < n && c >= 0 && c < n && !locked(r, c) && marks[r][c] === 0;
	// Clue neighbourhood cells of (r,c), in bounds.
	const neighbours = (r: number, c: number): { r: number; c: number }[] => {
		const out: { r: number; c: number }[] = [];
		for (const [dr, dc] of CLUE_OFFSETS) {
			const nr = r + dr;
			const nc = c + dc;
			if (nr >= 0 && nr < n && nc >= 0 && nc < n) out.push({ r: nr, c: nc });
		}
		return out;
	};

	// 1) Correction — a player-marked cell that disagrees with the solution.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (locked(r, c) || marks[r][c] === 0) continue;
			const want = correct(r, c);
			const has: 'ship' | 'water' = marks[r][c] === 1 ? 'ship' : 'water';
			if (has === want) continue;
			let reason: string;
			if (has === 'ship') {
				const diag =
					isShip(r - 1, c - 1) || isShip(r - 1, c + 1) || isShip(r + 1, c - 1) || isShip(r + 1, c + 1);
				reason = diag
					? `Cette case ne peut pas être un bateau (elle touche un bateau en diagonale) — c'est de l'eau.`
					: `Cette case ne peut pas être un bateau — c'est de l'eau.`;
			} else {
				reason = `Cette case ne peut pas être de l'eau — c'est un bateau.`;
			}
			return { cells: [{ r, c }], value: want, reason };
		}

	// Proximity clue rules (N2/N3/N4). A clue at (r,c) shows k = ship cells in its 8-nbr.
	for (const cl of clues) {
		const nbrs = neighbours(cl.r, cl.c);
		const shipN = nbrs.filter((p) => isShip(p.r, p.c)).length;
		const emptyN = nbrs.filter((p) => empty(p.r, p.c));
		if (emptyN.length === 0) continue;

		// N4) clue = 0 → none of the neighbours is a ship; all empties are water.
		if (cl.n === 0) {
			const cells = emptyN.filter((p) => correct(p.r, p.c) === 'water');
			if (cells.length)
				return {
					cells,
					value: 'water',
					reason: `Cette case indique 0 : aucune des cases autour n'est un bateau.`,
				};
		}

		// N2) clue satisfied (k ships already found) → remaining empties are water.
		if (shipN === cl.n) {
			const cells = emptyN.filter((p) => correct(p.r, p.c) === 'water');
			if (cells.length)
				return {
					cells,
					value: 'water',
					reason: `Cette case indique ${cl.n} : ses ${cl.n} bateau${cl.n > 1 ? 'x' : ''} ${cl.n > 1 ? 'sont déjà trouvés' : 'est déjà trouvé'}, le reste autour est de l'eau.`,
				};
		}

		// N3) ships found + empties exactly equals k → every empty neighbour is a ship.
		if (shipN + emptyN.length === cl.n) {
			const cells = emptyN.filter((p) => correct(p.r, p.c) === 'ship');
			if (cells.length)
				return {
					cells,
					value: 'ship',
					reason: `Cette case indique ${cl.n} et il reste exactement ${emptyN.length} case${emptyN.length > 1 ? 's' : ''} libre${emptyN.length > 1 ? 's' : ''} autour : ${emptyN.length > 1 ? 'ce sont des bateaux' : 'c\'est un bateau'}.`,
				};
		}
	}

	// 5) Every empty cell diagonally adjacent to a ship → water (ships never touch).
	{
		const cells: { r: number; c: number }[] = [];
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++) {
				if (!empty(r, c) || correct(r, c) !== 'water') continue;
				if (isShip(r - 1, c - 1) || isShip(r - 1, c + 1) || isShip(r + 1, c - 1) || isShip(r + 1, c + 1))
					cells.push({ r, c });
			}
		if (cells.length)
			return {
				cells,
				value: 'water',
				reason: `Les bateaux ne se touchent jamais, même en diagonale : ces cases voisines d'un bateau sont de l'eau.`,
			};
	}

	// 6) Around a completed (sealed) single ship → water all around.
	{
		const cells: { r: number; c: number }[] = [];
		const seen = new Set<number>();
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++) {
				if (!isShip(r, c)) continue;
				const horiz = isShip(r, c - 1) || isShip(r, c + 1);
				const vert = isShip(r - 1, c) || isShip(r + 1, c);
				const orthSealed =
					(c === 0 || decided(r, c - 1)) &&
					(c === n - 1 || decided(r, c + 1)) &&
					(r === 0 || decided(r - 1, c)) &&
					(r === n - 1 || decided(r + 1, c));
				if (horiz || vert || !orthSealed) continue;
				for (let dr = -1; dr <= 1; dr++)
					for (let dc = -1; dc <= 1; dc++) {
						if (dr === 0 && dc === 0) continue;
						const nr = r + dr;
						const nc = c + dc;
						if (empty(nr, nc) && correct(nr, nc) === 'water' && !seen.has(nr * n + nc)) {
							seen.add(nr * n + nc);
							cells.push({ r: nr, c: nc });
						}
					}
			}
		if (cells.length)
			return { cells, value: 'water', reason: `Ce bateau est complet : les cases autour sont de l'eau.` };
	}

	// 7) Last resort — proof by contradiction. After step 1 the player marks are all correct,
	//    so given + marks has a unique solution; forcing any empty cell to the opposite value
	//    leaves no valid fleet. One solver call (on the first empty cell) suffices.
	const g2: Given[][] = given.map((row, r) =>
		row.map((g, c) => (g != null ? g : marks[r][c] === 1 ? 'ship' : marks[r][c] === 2 ? 'water' : null)),
	);
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!empty(r, c)) continue;
			const want = correct(r, c);
			g2[r][c] = want === 'ship' ? 'water' : 'ship';
			const cnt = countSolutions(n, fleet, clues, g2, 1);
			g2[r][c] = null;
			if (cnt === 0)
				return {
					cells: [{ r, c }],
					value: want,
					reason: `En mettant l'autre valeur ici, plus aucune flotte ne respecte les indices : c'est donc ${want === 'ship' ? 'un bateau' : "de l'eau"}.`,
				};
		}

	return null;
}

export function generateBataille(
	sizeLvl: SizeLevel,
	diff: DiffLevel,
	rng: Rng = Math.random,
): BataillePuzzle {
	const n = sizeLvl.size;
	const fleet = [...sizeLvl.fleet].sort((a, b) => b - a);

	// Water cells of a solution, shuffled then sorted by descending proximity (high-info first).
	const waterCells = (solution: boolean[][]): [number, number][] =>
		shuffle(
			Array.from({ length: n * n }, (_, i): [number, number] => [Math.floor(i / n), i % n]).filter(
				([r, c]) => !solution[r][c],
			),
			rng,
		).sort((a, b) => proximity(solution, b[0], b[1], n) - proximity(solution, a[0], a[1], n));

	for (let attempt = 0; attempt < 200; attempt++) {
		const solution = placeFleet(n, fleet, rng);
		if (!solution) continue;

		const waters = waterCells(solution);
		const clues: ClueCell[] = [];
		const given: Given[][] = Array.from({ length: n }, () => new Array(n).fill(null) as Given[]);
		const addClue = (r: number, c: number) => {
			clues.push({ r, c, n: proximity(solution, r, c, n) });
			given[r][c] = 'water';
		};

		// Greedy: reveal water cells as clues until the solution is unique.
		let i = 0;
		while (countSolutions(n, fleet, clues, given, 2) !== 1 && i < waters.length) {
			const [r, c] = waters[i++];
			addClue(r, c);
		}
		if (countSolutions(n, fleet, clues, given, 2) !== 1) continue;

		// Easier levels: reveal a few more numbers.
		for (let k = 0; k < diff.extraClues && i < waters.length; k++, i++) {
			const [r, c] = waters[i];
			addClue(r, c);
		}
		return { size: n, fleet, solution, clues, given };
	}

	// Fallback: tiny unique puzzle (single 1-cell ship in the corner, all water cells clued).
	const solution = Array.from({ length: n }, () => new Array(n).fill(false));
	solution[0][0] = true;
	const clues: ClueCell[] = [];
	const given: Given[][] = Array.from({ length: n }, () => new Array(n).fill(null) as Given[]);
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++)
			if (!solution[r][c]) {
				clues.push({ r, c, n: proximity(solution, r, c, n) });
				given[r][c] = 'water';
			}
	return { size: n, fleet: [1], solution, clues, given };
}
