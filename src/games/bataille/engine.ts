/**
 * BATAILLE NAVALE LOGIQUE (Bimaru / Solitaire Battleships) — pure engine (no UI).
 * Find a hidden fleet. Cells are water or ship; ships never touch (8-neighbourhood).
 * Row/column clues give the number of ship cells; a few cells are revealed.
 * Generation guarantees a unique solution.
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
	extraGivens: number; // clues revealed beyond the minimal unique set (more = easier)
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', extraGivens: 5 },
	moyen: { label: 'Moyen', extraGivens: 2 },
	difficile: { label: 'Difficile', extraGivens: 0 },
};

export interface BataillePuzzle {
	size: number;
	fleet: number[];
	solution: boolean[][]; // true = ship
	rowCounts: number[];
	colCounts: number[];
	given: Given[][];
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

/** Ship segment lengths (orthogonal components) match the fleet, and all are straight. */
function fleetMatches(grid: number[][], fleetSorted: number[], n: number): boolean {
	const seen: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
	const lengths: number[] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (grid[r][c] !== 1 || seen[r][c]) continue;
			const comp: [number, number][] = [[r, c]];
			seen[r][c] = true;
			for (let h = 0; h < comp.length; h++) {
				const [cr, cc] = comp[h];
				for (const [nr, nc] of [
					[cr - 1, cc],
					[cr + 1, cc],
					[cr, cc - 1],
					[cr, cc + 1],
				] as [number, number][]) {
					if (nr >= 0 && nr < n && nc >= 0 && nc < n && grid[nr][nc] === 1 && !seen[nr][nc]) {
						seen[nr][nc] = true;
						comp.push([nr, nc]);
					}
				}
			}
			const rows = new Set(comp.map(([cr]) => cr));
			const cols = new Set(comp.map(([, cc]) => cc));
			if (rows.size > 1 && cols.size > 1) return false; // not a straight ship
			lengths.push(comp.length);
		}
	if (lengths.length !== fleetSorted.length) return false;
	lengths.sort((a, b) => b - a);
	return lengths.every((v, i) => v === fleetSorted[i]);
}

/**
 * Cell-by-cell solver. Each cell is ship(1) or water(0); forced by revealed clues and
 * by row/column counts; pruned by the local ship rules (no ship cell has a diagonal
 * ship neighbour, no ship cell bends). Fleet composition checked at the end. Fast even
 * near uniqueness. Stops at `limit`.
 */
export function countSolutions(
	size: number,
	fleet: number[],
	rowCounts: number[],
	colCounts: number[],
	given: Given[][],
	limit = 2,
): number {
	const n = size;
	const fleetSorted = [...fleet].sort((a, b) => b - a);
	const grid: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1)); // -1 undecided
	const rowLeft = [...rowCounts];
	const colLeft = [...colCounts];
	let count = 0;

	const canShip = (r: number, c: number): boolean => {
		if (rowLeft[r] <= 0 || colLeft[c] <= 0) return false;
		if (grid[r - 1]?.[c - 1] === 1) return false; // diagonal ship neighbours
		if (grid[r - 1]?.[c + 1] === 1) return false;
		if (grid[r][c - 1] === 1 && grid[r - 1]?.[c] === 1) return false; // L-bend
		return true;
	};

	const dfs = (idx: number) => {
		if (count >= limit) return;
		if (idx === n * n) {
			if (fleetMatches(grid, fleetSorted, n)) count++;
			return;
		}
		const r = Math.floor(idx / n);
		const c = idx % n;

		const setShip = () => {
			grid[r][c] = 1;
			rowLeft[r]--;
			colLeft[c]--;
			dfs(idx + 1);
			grid[r][c] = -1;
			rowLeft[r]++;
			colLeft[c]++;
		};
		const setWater = () => {
			grid[r][c] = 0;
			dfs(idx + 1);
			grid[r][c] = -1;
		};

		const g = given[r][c];
		if (g === 'ship') {
			if (canShip(r, c)) setShip();
			return;
		}
		if (g === 'water') {
			setWater();
			return;
		}
		// Forcing by counts.
		const remRow = n - c; // undecided cells left in this row (c..n-1)
		const remCol = n - r; // undecided cells left in this column (r..n-1)
		if (rowLeft[r] > remRow || colLeft[c] > remCol) return; // impossible
		if (rowLeft[r] === 0 || colLeft[c] === 0) {
			setWater();
			return;
		}
		if (rowLeft[r] === remRow || colLeft[c] === remCol) {
			if (canShip(r, c)) setShip();
			return;
		}
		// Branch: ship first (more constrained), then water.
		if (canShip(r, c)) setShip();
		if (count >= limit) return;
		setWater();
	};

	dfs(0);
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
 * Each call returns one rule's worth of cells (same value + reason), e.g. a whole "0"
 * line filled in one go. Order: correction → 0-lines → completed count → forced ships →
 * diagonal-of-ship → ship borders → proof by contradiction (last resort, always sound).
 */
export function findHint(marks: Mark[][], puzzle: BataillePuzzle): HintResult | null {
	const { size: n, fleet, solution, rowCounts, colCounts, given } = puzzle;

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
	// Effective ship count of a row/col (givens + player ships).
	const rowShips = (r: number) => {
		let k = 0;
		for (let c = 0; c < n; c++) if (isShip(r, c)) k++;
		return k;
	};
	const colShips = (c: number) => {
		let k = 0;
		for (let r = 0; r < n; r++) if (isShip(r, c)) k++;
		return k;
	};
	const rowEmpties = (r: number) => {
		const out: number[] = [];
		for (let c = 0; c < n; c++) if (empty(r, c)) out.push(c);
		return out;
	};
	const colEmpties = (c: number) => {
		const out: number[] = [];
		for (let r = 0; r < n; r++) if (empty(r, c)) out.push(r);
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
				// Why this ship is wrong: diagonal contact, or row/col over its count.
				const diag =
					isShip(r - 1, c - 1) || isShip(r - 1, c + 1) || isShip(r + 1, c - 1) || isShip(r + 1, c + 1);
				if (diag)
					reason = `Cette case ne peut pas être un bateau (elle touche un bateau en diagonale) — c'est de l'eau.`;
				else if (rowShips(r) > rowCounts[r])
					reason = `Cette case ne peut pas être un bateau (elle dépasse le compte de la ligne) — c'est de l'eau.`;
				else if (colShips(c) > colCounts[c])
					reason = `Cette case ne peut pas être un bateau (elle dépasse le compte de la colonne) — c'est de l'eau.`;
				else reason = `Cette case ne peut pas être un bateau — c'est de l'eau.`;
			} else {
				reason = `Cette case ne peut pas être de l'eau — c'est un bateau.`;
			}
			return { cells: [{ r, c }], value: want, reason };
		}

	// 2) Lines/columns clued 0 → every empty cell is water (fill them all at once).
	{
		const cells: { r: number; c: number }[] = [];
		const seen = new Set<number>();
		const add = (r: number, c: number) => {
			if (empty(r, c) && correct(r, c) === 'water' && !seen.has(r * n + c)) {
				seen.add(r * n + c);
				cells.push({ r, c });
			}
		};
		for (let r = 0; r < n; r++) if (rowCounts[r] === 0) for (let c = 0; c < n; c++) add(r, c);
		for (let c = 0; c < n; c++) if (colCounts[c] === 0) for (let r = 0; r < n; r++) add(r, c);
		if (cells.length)
			return {
				cells,
				value: 'water',
				reason: `Une ligne ou colonne marquée 0 n'a aucun bateau : toutes ses cases sont de l'eau.`,
			};
	}

	// 3) A line whose ship count is already reached → its remaining empties are water.
	for (let r = 0; r < n; r++)
		if (rowShips(r) === rowCounts[r]) {
			const es = rowEmpties(r).filter((c) => correct(r, c) === 'water');
			if (es.length)
				return {
					cells: es.map((c) => ({ r, c })),
					value: 'water',
					reason: `Cette ligne a déjà ses ${rowCounts[r]} case${rowCounts[r] > 1 ? 's' : ''} de bateau : le reste est de l'eau.`,
				};
		}
	for (let c = 0; c < n; c++)
		if (colShips(c) === colCounts[c]) {
			const es = colEmpties(c).filter((r) => correct(r, c) === 'water');
			if (es.length)
				return {
					cells: es.map((r) => ({ r, c })),
					value: 'water',
					reason: `Cette colonne a déjà ses ${colCounts[c]} case${colCounts[c] > 1 ? 's' : ''} de bateau : le reste est de l'eau.`,
				};
		}

	// 4) A line whose remaining empties exactly equal the missing ships → all ships.
	for (let r = 0; r < n; r++) {
		const es = rowEmpties(r);
		const need = rowCounts[r] - rowShips(r);
		if (es.length && need === es.length && es.every((c) => correct(r, c) === 'ship'))
			return {
				cells: es.map((c) => ({ r, c })),
				value: 'ship',
				reason: `Il reste exactement ${need} case${need > 1 ? 's' : ''} pour ${need} bateau${need > 1 ? 'x' : ''} dans cette ligne : ce sont des bateaux.`,
			};
	}
	for (let c = 0; c < n; c++) {
		const es = colEmpties(c);
		const need = colCounts[c] - colShips(c);
		if (es.length && need === es.length && es.every((r) => correct(r, c) === 'ship'))
			return {
				cells: es.map((r) => ({ r, c })),
				value: 'ship',
				reason: `Il reste exactement ${need} case${need > 1 ? 's' : ''} pour ${need} bateau${need > 1 ? 'x' : ''} dans cette colonne : ce sont des bateaux.`,
			};
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
			const cnt = countSolutions(n, fleet, rowCounts, colCounts, g2, 1);
			g2[r][c] = null;
			if (cnt === 0)
				return {
					cells: [{ r, c }],
					value: want,
					reason: `En mettant l'autre valeur ici, plus aucune flotte ne respecte les compteurs : c'est donc ${want === 'ship' ? 'un bateau' : "de l'eau"}.`,
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

	// Reveal `extraGivens` more solution cells as clues (among still-empty cells) → easier levels.
	const addExtra = (given: Given[][], solution: boolean[][]) => {
		const empties = shuffle(
			Array.from({ length: n * n }, (_, i): [number, number] => [Math.floor(i / n), i % n]).filter(
				([r, c]) => given[r][c] === null,
			),
			rng,
		);
		for (let i = 0; i < diff.extraGivens && i < empties.length; i++) {
			const [r, c] = empties[i];
			given[r][c] = solution[r][c] ? 'ship' : 'water';
		}
	};

	for (let attempt = 0; attempt < 200; attempt++) {
		const solution = placeFleet(n, fleet, rng);
		if (!solution) continue;

		const rowCounts = new Array(n).fill(0);
		const colCounts = new Array(n).fill(0);
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++)
				if (solution[r][c]) {
					rowCounts[r]++;
					colCounts[c]++;
				}

		const given: Given[][] = Array.from({ length: n }, () => new Array(n).fill(null) as Given[]);
		let unique = countSolutions(n, fleet, rowCounts, colCounts, given, 2) === 1;
		if (!unique) {
			// Reveal cells (ship cells first, they disambiguate most) until unique.
			const cells = shuffle(
				Array.from({ length: n * n }, (_, i): [number, number] => [Math.floor(i / n), i % n]),
				rng,
			).sort((a, b) => Number(solution[b[0]][b[1]]) - Number(solution[a[0]][a[1]]));
			for (const [r, c] of cells) {
				given[r][c] = solution[r][c] ? 'ship' : 'water';
				if (countSolutions(n, fleet, rowCounts, colCounts, given, 2) === 1) {
					unique = true;
					break;
				}
			}
		}
		if (unique) {
			addExtra(given, solution);
			return { size: n, fleet, solution, rowCounts, colCounts, given };
		}
	}

	// Fallback: tiny unique puzzle (single 1-cell ship in the corner).
	const solution = Array.from({ length: n }, () => new Array(n).fill(false));
	solution[0][0] = true;
	const rowCounts = new Array(n).fill(0);
	const colCounts = new Array(n).fill(0);
	rowCounts[0] = 1;
	colCounts[0] = 1;
	const given: Given[][] = Array.from({ length: n }, () => new Array(n).fill(null) as Given[]);
	return { size: n, fleet: [1], solution, rowCounts, colCounts, given };
}
