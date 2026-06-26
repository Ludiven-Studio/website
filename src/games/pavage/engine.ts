/**
 * PAVAGE — pure engine (no UI).
 * Fit Tetris-like pieces (polyominoes) into a square grid. Each piece has a
 * colour; two pieces of the same colour may never touch side by side
 * (orthogonally). Some cells may be blocked. Generation guarantees a unique
 * solution. Pieces may rotate (90°) but never mirror.
 */

import type { Rng } from '../prng';

export type Cell = [number, number]; // [row, col]

export interface Piece {
	id: number;
	color: number; // colour index (0..palette-1)
	cells: Cell[]; // normalized display orientation (origin at top-left of bbox)
}

export interface Placement {
	row: number; // top-left of the placed orientation's bbox
	col: number;
	rotation: number; // index into rotations(piece.cells)
}

export interface PavagePuzzle {
	size: number;
	blocked: boolean[][];
	pieces: Piece[];
	solution: Placement[]; // solution[i] places pieces[i]
	palette: number; // number of distinct colours
	rotate: boolean; // whether pieces may be rotated (else shown solution-side up)
}

export interface DiffLevel {
	label: string;
	size: number;
	blocked: number; // target blocked cells
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 5, blocked: 3 },
	moyen: { label: 'Moyen', size: 6, blocked: 4 },
	difficile: { label: 'Difficile', size: 7, blocked: 7 },
};

const ORTH = [
	[-1, 0], [1, 0], [0, -1], [0, 1],
] as const;

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/* ---------- piece geometry ---------- */

function normalize(cells: Cell[]): Cell[] {
	let mr = Infinity, mc = Infinity;
	for (const [r, c] of cells) {
		if (r < mr) mr = r;
		if (c < mc) mc = c;
	}
	return cells
		.map(([r, c]): Cell => [r - mr, c - mc])
		.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function cellsKey(cells: Cell[]): string {
	return normalize(cells).map(([r, c]) => `${r},${c}`).join(' ');
}

function rotateCW(cells: Cell[]): Cell[] {
	return cells.map(([r, c]): Cell => [c, -r]);
}

/** Up to 4 distinct rotations (no mirror), normalized and deduplicated. */
export function rotations(cells: Cell[]): Cell[][] {
	const out: Cell[][] = [];
	const seen = new Set<string>();
	let cur = normalize(cells);
	for (let i = 0; i < 4; i++) {
		const n = normalize(cur);
		const k = cellsKey(n);
		if (!seen.has(k)) {
			seen.add(k);
			out.push(n);
		}
		cur = rotateCW(cur);
	}
	return out;
}

/** Rotation/translation-invariant shape identity. */
function shapeKey(orient: Cell[][]): string {
	return orient.map((o) => cellsKey(o)).sort()[0];
}

/** Absolute cells covered by a piece placed with the given placement. */
export function placedCells(piece: Piece, pl: Placement): Cell[] {
	const o = rotations(piece.cells)[pl.rotation];
	return o.map(([r, c]): Cell => [r + pl.row, c + pl.col]);
}

const fpKey = (cells: Cell[]): string =>
	cells.map(([r, c]) => `${r},${c}`).sort().join(' ');

/** Placement realizing a concrete absolute footprint with this piece. */
function placementFor(piece: Piece, footprint: Cell[]): Placement | null {
	const k = cellsKey(footprint);
	const orient = rotations(piece.cells);
	const ri = orient.findIndex((o) => cellsKey(o) === k);
	if (ri < 0) return null;
	let mr = Infinity, mc = Infinity;
	for (const [r, c] of footprint) {
		if (r < mr) mr = r;
		if (c < mc) mc = c;
	}
	return { row: mr, col: mc, rotation: ri };
}

/* ---------- generation helpers ---------- */

function freeConnected(size: number, blocked: boolean[][]): boolean {
	let start: Cell | null = null;
	let total = 0;
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++)
			if (!blocked[r][c]) {
				total++;
				if (!start) start = [r, c];
			}
	if (!start) return false;
	const seen = new Set<string>([`${start[0]},${start[1]}`]);
	const stack: Cell[] = [start];
	while (stack.length) {
		const [r, c] = stack.pop()!;
		for (const [dr, dc] of ORTH) {
			const nr = r + dr, nc = c + dc;
			if (nr >= 0 && nr < size && nc >= 0 && nc < size && !blocked[nr][nc]) {
				const key = `${nr},${nc}`;
				if (!seen.has(key)) {
					seen.add(key);
					stack.push([nr, nc]);
				}
			}
		}
	}
	return seen.size === total;
}

/** Partition the free cells into connected zones of size 3..6 (mostly 4-5). */
function makePartition(size: number, blocked: boolean[][], rng: Rng): number[][] | null {
	const zone: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
	const free = (r: number, c: number) =>
		r >= 0 && r < size && c >= 0 && c < size && !blocked[r][c];
	let id = 0;

	for (let sr = 0; sr < size; sr++)
		for (let sc = 0; sc < size; sc++) {
			if (blocked[sr][sc] || zone[sr][sc] !== -1) continue;
			const target = 4 + Math.floor(rng() * 2); // 4 or 5
			const cells: Cell[] = [[sr, sc]];
			zone[sr][sc] = id;
			while (cells.length < target) {
				const frontier: Cell[] = [];
				for (const [r, c] of cells)
					for (const [dr, dc] of ORTH) {
						const nr = r + dr, nc = c + dc;
						if (free(nr, nc) && zone[nr][nc] === -1) frontier.push([nr, nc]);
					}
				if (frontier.length === 0) break;
				const [pr, pc] = frontier[Math.floor(rng() * frontier.length)];
				zone[pr][pc] = id;
				cells.push([pr, pc]);
			}
			id++;
		}

	// Merge zones smaller than 3 into their smallest neighbour.
	for (;;) {
		const sizes = new Map<number, number>();
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++)
				if (zone[r][c] >= 0) sizes.set(zone[r][c], (sizes.get(zone[r][c]) || 0) + 1);
		let small = -1;
		for (const [z, s] of sizes) if (s < 3) { small = z; break; }
		if (small < 0) break;
		let best = -1, bestSize = Infinity;
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) {
				if (zone[r][c] !== small) continue;
				for (const [dr, dc] of ORTH) {
					const nr = r + dr, nc = c + dc;
					if (nr >= 0 && nr < size && nc >= 0 && nc < size && zone[nr][nc] >= 0 && zone[nr][nc] !== small) {
						const ns = sizes.get(zone[nr][nc])!;
						if (ns < bestSize) { bestSize = ns; best = zone[nr][nc]; }
					}
				}
			}
		if (best < 0) return null; // isolated tiny zone, cannot merge
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (zone[r][c] === small) zone[r][c] = best;
	}

	// Reject oversized zones (keep nice 3..6 pieces).
	const finalSizes = new Map<number, number>();
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++)
			if (zone[r][c] >= 0) finalSizes.set(zone[r][c], (finalSizes.get(zone[r][c]) || 0) + 1);
	for (const s of finalSizes.values()) if (s > 6) return null;

	// Renumber zone ids to a dense 0..n-1 range.
	const remap = new Map<number, number>();
	let next = 0;
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			if (zone[r][c] < 0) continue;
			const z = zone[r][c];
			if (!remap.has(z)) remap.set(z, next++);
			zone[r][c] = remap.get(z)!;
		}
	return zone;
}

/** Adjacency graph of zones (orthogonal contact). */
function adjacency(zone: number[][], size: number, nZones: number): Set<number>[] {
	const adj: Set<number>[] = Array.from({ length: nZones }, () => new Set<number>());
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) {
			const z = zone[r][c];
			if (z < 0) continue;
			for (const [dr, dc] of ORTH) {
				const nr = r + dr, nc = c + dc;
				if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
					const nz = zone[nr][nc];
					if (nz >= 0 && nz !== z) { adj[z].add(nz); adj[nz].add(z); }
				}
			}
		}
	return adj;
}

/** Proper colouring with maxColors (backtracking, most-constrained first). */
function colorize(adj: Set<number>[], maxColors: number, rng: Rng): number[] | null {
	const n = adj.length;
	const color = new Array(n).fill(-1);
	const order = [...Array(n).keys()].sort((a, b) => adj[b].size - adj[a].size);
	const dfs = (i: number): boolean => {
		if (i === n) return true;
		const v = order[i];
		const used = new Set<number>();
		for (const u of adj[v]) if (color[u] >= 0) used.add(color[u]);
		const cand = shuffle([...Array(maxColors).keys()].filter((c) => !used.has(c)), rng);
		for (const c of cand) {
			color[v] = c;
			if (dfs(i + 1)) return true;
			color[v] = -1;
		}
		return false;
	};
	return dfs(0) ? color : null;
}

/* ---------- solver / uniqueness ---------- */

/**
 * Count the distinct valid tilings (up to `limit`). Distinct = different final
 * coloured grid: identical pieces (same shape + colour) are grouped so swapping
 * them is not counted twice. Because same-colour pieces never touch, the
 * coloured grid uniquely determines the partition — so this is the right notion.
 */
export function countSolutions(puzzle: PavagePuzzle, limit = 2): number {
	const { size, blocked, pieces } = puzzle;

	interface Group { orient: Cell[][]; color: number; count: number; }
	const map = new Map<string, Group>();
	for (const p of pieces) {
		// Without rotation, a piece keeps its single displayed orientation; with
		// rotation it can take any of its (deduped) rotations.
		const orient = puzzle.rotate ? rotations(p.cells) : [normalize(p.cells)];
		const sig = puzzle.rotate ? shapeKey(rotations(p.cells)) : cellsKey(p.cells);
		const key = `${sig}|${p.color}`;
		const g = map.get(key);
		if (g) g.count++;
		else map.set(key, { orient, color: p.color, count: 1 });
	}
	const groups = [...map.values()];

	// occ: -1 free, -2 blocked, >=0 covered (stores the covering colour).
	const occ: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) if (blocked[r][c]) occ[r][c] = -2;

	let count = 0;
	const firstFree = (): Cell | null => {
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (occ[r][c] === -1) return [r, c];
		return null;
	};

	const dfs = (): void => {
		if (count >= limit) return;
		const t = firstFree();
		if (!t) { count++; return; }
		const [tr, tc] = t;
		for (const g of groups) {
			if (g.count <= 0) continue;
			for (const o of g.orient) {
				for (const [ar, ac] of o) {
					const dr = tr - ar, dc = tc - ac;
					let ok = true;
					for (const [cr, cc] of o) {
						const r = cr + dr, c = cc + dc;
						if (r < 0 || r >= size || c < 0 || c >= size || occ[r][c] !== -1) { ok = false; break; }
					}
					if (!ok) continue;
					for (const [cr, cc] of o) {
						const r = cr + dr, c = cc + dc;
						for (const [er, ec] of ORTH) {
							const nr = r + er, nc = c + ec;
							if (nr >= 0 && nr < size && nc >= 0 && nc < size && occ[nr][nc] === g.color) { ok = false; break; }
						}
						if (!ok) break;
					}
					if (!ok) continue;
					for (const [cr, cc] of o) occ[cr + dr][cc + dc] = g.color;
					g.count--;
					dfs();
					g.count++;
					for (const [cr, cc] of o) occ[cr + dr][cc + dc] = -1;
					if (count >= limit) return;
				}
			}
		}
	};
	dfs();
	return count;
}

/* ---------- generation ---------- */

export function generatePavage(
	diff: DiffLevel,
	rng: Rng = Math.random,
	rotate = false,
): PavagePuzzle {
	const { size } = diff;

	for (let attempt = 0; attempt < 1500; attempt++) {
		// 1) blocked cells
		const blocked: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
		const order = shuffle([...Array(size * size).keys()], rng);
		for (let i = 0; i < diff.blocked; i++) {
			const p = order[i];
			blocked[(p / size) | 0][p % size] = true;
		}
		if (!freeConnected(size, blocked)) continue;
		if (size * size - diff.blocked < 6) continue;

		// 2) partition into pieces (the solution)
		const zone = makePartition(size, blocked, rng);
		if (!zone) continue;
		let nZones = 0;
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (zone[r][c] + 1 > nZones) nZones = zone[r][c] + 1;
		if (nZones < 2) continue;

		const zoneCells: Cell[][] = Array.from({ length: nZones }, () => []);
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (zone[r][c] >= 0) zoneCells[zone[r][c]].push([r, c]);

		// 3) proper colouring (fewest colours first → stronger no-touch constraint)
		const adj = adjacency(zone, size, nZones);
		let colors: number[] | null = null;
		for (let k = 2; k <= 4 && !colors; k++) colors = colorize(adj, k, rng);
		if (!colors) continue;
		const present = [...new Set(colors)].sort((a, b) => a - b);
		const cmap = new Map(present.map((c, i) => [c, i]));
		colors = colors.map((c) => cmap.get(c)!);
		const palette = present.length;

		// 4) build pieces (random display rotation) + solution placements
		const pieces: Piece[] = [];
		const solution: Placement[] = [];
		for (let z = 0; z < nZones; z++) {
			const shape = normalize(zoneCells[z]);
			const orient = rotations(shape);
			// No rotation → show the solution orientation; otherwise a random one.
			const display = rotate ? orient[Math.floor(rng() * orient.length)] : shape;
			const piece: Piece = { id: z, color: colors[z], cells: display };
			const pl = placementFor(piece, zoneCells[z]);
			if (!pl) { z = -1; pieces.length = 0; solution.length = 0; break; } // shouldn't happen; restart build
			pieces.push(piece);
			solution.push(pl);
		}
		if (pieces.length !== nZones) continue;

		// shuffle tray order
		const idx = shuffle([...Array(nZones).keys()], rng);
		const P = idx.map((oi, ni): Piece => ({ ...pieces[oi], id: ni }));
		const S = idx.map((oi) => solution[oi]);

		const puzzle: PavagePuzzle = { size, blocked, pieces: P, solution: S, palette, rotate };

		// 5) uniqueness
		if (countSolutions(puzzle, 2) === 1) return puzzle;
	}

	throw new Error('Pavage: failed to generate a puzzle');
}

/* ---------- hint ---------- */

export interface HintResult {
	pieceIndex: number;
	action: 'place' | 'remove';
	placement?: Placement; // present when action === 'place'
	reason: string;
}

/**
 * Next logical step. First removes a misplaced piece (footprint outside the
 * unique solution); otherwise places the piece forced onto the first free cell.
 * Returns null when nothing remains to do.
 */
export function findHint(
	placements: (Placement | null)[],
	puzzle: PavagePuzzle,
): HintResult | null {
	const { pieces, solution, size, blocked } = puzzle;

	const solFps = pieces.map((p, i) => ({
		cells: placedCells(p, solution[i]),
		key: fpKey(placedCells(p, solution[i])),
		shape: shapeKey(rotations(p.cells)),
		color: p.color,
	}));
	const solSet = new Set(solFps.map((f) => f.key));

	// 1) A placed piece sitting outside the solution → take it back.
	for (let i = 0; i < pieces.length; i++) {
		const pl = placements[i];
		if (!pl) continue;
		if (!solSet.has(fpKey(placedCells(pieces[i], pl))))
			return {
				pieceIndex: i,
				action: 'remove',
				reason: 'Cette pièce n\'est pas à sa place dans la solution — retire-la pour réessayer.',
			};
	}

	// Occupancy from the (now all-correct) placed pieces.
	const occ: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
	const occupiedFps = new Set<string>();
	for (let r = 0; r < size; r++)
		for (let c = 0; c < size; c++) if (blocked[r][c]) occ[r][c] = true;
	for (let i = 0; i < pieces.length; i++) {
		const pl = placements[i];
		if (!pl) continue;
		const cells = placedCells(pieces[i], pl);
		occupiedFps.add(fpKey(cells));
		for (const [r, c] of cells) occ[r][c] = true;
	}

	// First free cell.
	let target: Cell | null = null;
	for (let r = 0; r < size && !target; r++)
		for (let c = 0; c < size && !target; c++) if (!occ[r][c]) target = [r, c];
	if (!target) return null; // solved
	const [tr, tc] = target;

	// The solution footprint covering it (still free), then any matching unplaced piece.
	const f = solFps.find(
		(s) => !occupiedFps.has(s.key) && s.cells.some(([r, c]) => r === tr && c === tc),
	);
	if (!f) return null;
	for (let j = 0; j < pieces.length; j++) {
		if (placements[j]) continue;
		if (pieces[j].color !== f.color) continue;
		if (shapeKey(rotations(pieces[j].cells)) !== f.shape) continue;
		const pl = placementFor(pieces[j], f.cells);
		if (!pl) continue;
		return {
			pieceIndex: j,
			action: 'place',
			placement: pl,
			reason: 'Cette pièce est forcée à cet endroit par déduction.',
		};
	}
	return null;
}
