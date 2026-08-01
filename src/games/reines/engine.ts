/**
 * REINES (LinkedIn "Queens") — pure engine (no UI).
 * n×n grid split into n colour regions. Place one queen per row, per column
 * and per region, with no two queens adjacent (orthogonal or diagonal).
 * Generation guarantees a unique solution and a guess-free logical path
 * (every board passes solveByLogic, deterministic deductions only).
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

/** Grow n connected regions from the queen cells via randomised frontier fill.
 *  Region sizes are drawn uneven on purpose (rich-get-richer targets): small
 *  zones pin queens, which makes unique, logic-solvable boards far more likely. */
function growRegions(n: number, solution: number[], rng: Rng): number[][] {
	// Uneven size targets summing to n*n (each region starts at 1 = its queen cell).
	const targets = new Array<number>(n).fill(1);
	for (let rest = n * n - n; rest > 0; rest--) {
		let x = rng() * (n * n - rest);
		let id = 0;
		for (; id < n - 1; id++) {
			x -= targets[id];
			if (x <= 0) break;
		}
		targets[id]++;
	}

	const regions: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));
	const sizes = new Array<number>(n).fill(1);
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
		// Prefer frontier cells of regions still under their target size.
		const under: number[] = [];
		for (let i = 0; i < frontier.length; i++)
			if (sizes[frontier[i][2]] < targets[frontier[i][2]]) under.push(i);
		const idx = under.length
			? under[Math.floor(rng() * under.length)]
			: Math.floor(rng() * frontier.length);
		const [r, c, id] = frontier.splice(idx, 1)[0];
		if (regions[r][c] !== -1) continue;
		regions[r][c] = id;
		sizes[id]++;
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

type UnitKind = 'ligne' | 'colonne' | 'zone';

interface UnitRef {
	kind: UnitKind;
	index: number;
}
interface SinglePlaced extends UnitRef {
	r: number;
	c: number;
}
interface ConfineResult {
	cells: [number, number][]; // eliminated cells
	axis: 'ligne' | 'colonne';
	ids: number[]; // zones of the confined group
	lines: number[]; // 0-based line indices
	dual: boolean; // true: lines -> zones direction
}
interface WipeResult extends UnitRef {
	r: number; // eliminated cell; kind/index = the unit its queen would wipe
	c: number;
}

// French names of the zones, aligned with PALETTE (hint wording).
const FR_COLORS = ['corail', 'orange', 'jaune', 'verte', 'bleue', 'violette', 'turquoise', 'rose'];
const zoneName = (id: number) => `zone ${FR_COLORS[id % FR_COLORS.length]}`;
const unitName = (u: UnitRef) => (u.kind === 'zone' ? zoneName(u.index) : `${u.kind} ${u.index + 1}`);
const joinFr = (xs: string[]) =>
	xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} et ${xs[xs.length - 1]}`;

function confineReason(e: ConfineResult): string {
	const lines = joinFr(e.lines.map((i) => `${e.axis} ${i + 1}`));
	const zones = joinFr(e.ids.map(zoneName));
	const nl = e.lines.length > 1;
	const nz = e.ids.length > 1;
	return e.dual
		? `${nl ? 'Les' : 'La'} ${lines} n'offre${nl ? 'nt' : ''} que ${nz ? 'les' : 'la'} ${zones} → croix pour ${nz ? 'ces zones' : 'cette zone'} ailleurs.`
		: `${nz ? 'Les' : 'La'} ${zones} tien${nz ? 'nent' : 't'} sur ${nl ? 'les' : 'la'} ${lines} → croix pour les autres zones sur ${nl ? `ces ${e.axis}s` : `cette ${e.axis}`}.`;
}

/** Shared deduction engine: candidate grid + the human rule set. Each rule
 *  applies its deduction and reports what it did (for solver and hints). */
function createLogic(regions: number[][], n: number) {
	const cand: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(true));
	const queenCol = new Array<number>(n).fill(-1);
	let placed = 0;

	const attacks = (r1: number, c1: number, r2: number, c2: number) =>
		r1 === r2 || c1 === c2 || regions[r1][c1] === regions[r2][c2] || adjacent(r1, c1, r2, c2);

	const place = (r: number, c: number) => {
		queenCol[r] = c;
		placed++;
		for (let rr = 0; rr < n; rr++)
			for (let cc = 0; cc < n; cc++) {
				if (rr === r && cc === c) continue;
				if (cand[rr][cc] && attacks(r, c, rr, cc)) cand[rr][cc] = false;
			}
	};

	const colHasQueen = (c: number) => queenCol.includes(c);
	const regionHasQueen = (id: number) =>
		queenCol.some((qc, r) => qc !== -1 && regions[r][qc] === id);
	const regionCells = (id: number): [number, number][] => {
		const out: [number, number][] = [];
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++) if (regions[r][c] === id && cand[r][c]) out.push([r, c]);
		return out;
	};

	// Last free cell of a queenless row / column / zone -> place its queen.
	const singles = (): SinglePlaced | 'dead' | null => {
		for (let r = 0; r < n; r++) {
			if (queenCol[r] !== -1) continue;
			const cs: number[] = [];
			for (let c = 0; c < n; c++) if (cand[r][c]) cs.push(c);
			if (cs.length === 0) return 'dead';
			if (cs.length === 1) {
				place(r, cs[0]);
				return { r, c: cs[0], kind: 'ligne', index: r };
			}
		}
		for (let c = 0; c < n; c++) {
			if (colHasQueen(c)) continue;
			const rs: number[] = [];
			for (let r = 0; r < n; r++) if (cand[r][c]) rs.push(r);
			if (rs.length === 0) return 'dead';
			if (rs.length === 1) {
				place(rs[0], c);
				return { r: rs[0], c, kind: 'colonne', index: c };
			}
		}
		for (let id = 0; id < n; id++) {
			if (regionHasQueen(id)) continue;
			const cells = regionCells(id);
			if (cells.length === 0) return 'dead';
			if (cells.length === 1) {
				place(cells[0][0], cells[0][1]);
				return { r: cells[0][0], c: cells[0][1], kind: 'zone', index: id };
			}
		}
		return null;
	};

	const combos = (arr: number[], k: number): number[][] => {
		const out: number[][] = [];
		const acc: number[] = [];
		const rec = (start: number) => {
			if (acc.length === k) {
				out.push([...acc]);
				return;
			}
			for (let i = start; i < arr.length; i++) {
				acc.push(arr[i]);
				rec(i + 1);
				acc.pop();
			}
		};
		rec(0);
		return out;
	};

	// k zones confined to k rows/cols own those lines; dual: k lines spanning
	// exactly k zones lock those zones in. maxK = 1 (tier 2) or 3 (tier 3+).
	const confinement = (maxK: number): ConfineResult | null => {
		const freeRegions: number[] = [];
		for (let id = 0; id < n; id++) if (!regionHasQueen(id)) freeRegions.push(id);
		for (const axis of ['row', 'col'] as const) {
			const regionSets = new Map(
				freeRegions.map((id) => {
					const s = new Set<number>();
					for (const [r, c] of regionCells(id)) s.add(axis === 'row' ? r : c);
					return [id, s];
				}),
			);
			for (let k = 1; k <= maxK; k++) {
				for (const group of combos(freeRegions, k)) {
					const union = new Set<number>();
					for (const id of group) for (const v of regionSets.get(id)!) union.add(v);
					if (union.size !== k) continue;
					const cells: [number, number][] = [];
					const inGroup = new Set(group);
					for (const v of union)
						for (let o = 0; o < n; o++) {
							const r = axis === 'row' ? v : o;
							const c = axis === 'row' ? o : v;
							if (cand[r][c] && !inGroup.has(regions[r][c])) {
								cand[r][c] = false;
								cells.push([r, c]);
							}
						}
					if (cells.length)
						return {
							cells,
							axis: axis === 'row' ? 'ligne' : 'colonne',
							ids: group,
							lines: [...union],
							dual: false,
						};
				}
			}
			const freeLines: number[] = [];
			for (let i = 0; i < n; i++) {
				if (axis === 'row' ? queenCol[i] !== -1 : colHasQueen(i)) continue;
				freeLines.push(i);
			}
			const lineRegions = new Map(
				freeLines.map((i) => {
					const s = new Set<number>();
					for (let o = 0; o < n; o++) {
						const r = axis === 'row' ? i : o;
						const c = axis === 'row' ? o : i;
						if (cand[r][c]) s.add(regions[r][c]);
					}
					return [i, s];
				}),
			);
			for (let k = 1; k <= maxK; k++) {
				for (const group of combos(freeLines, k)) {
					const union = new Set<number>();
					for (const i of group) for (const v of lineRegions.get(i)!) union.add(v);
					if (union.size !== k) continue;
					const cells: [number, number][] = [];
					const inGroup = new Set(group);
					for (const id of union)
						for (let r = 0; r < n; r++)
							for (let c = 0; c < n; c++) {
								if (!cand[r][c] || regions[r][c] !== id) continue;
								if (!inGroup.has(axis === 'row' ? r : c)) {
									cand[r][c] = false;
									cells.push([r, c]);
								}
							}
					if (cells.length)
						return {
							cells,
							axis: axis === 'row' ? 'ligne' : 'colonne',
							ids: [...union],
							lines: group,
							dual: true,
						};
				}
			}
		}
		return null;
	};

	// A candidate whose queen would wipe every cell of another queenless unit
	// cannot be a queen ("if I play here, that zone dies").
	const attackWipe = (): WipeResult | null => {
		const wouldWipe = (r: number, c: number, cells: [number, number][]) =>
			cells.length > 0 && cells.every(([r2, c2]) => attacks(r, c, r2, c2));
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++) {
				if (!cand[r][c]) continue;
				for (let id = 0; id < n; id++) {
					if (id === regions[r][c] || regionHasQueen(id)) continue;
					if (wouldWipe(r, c, regionCells(id))) {
						cand[r][c] = false;
						return { r, c, kind: 'zone', index: id };
					}
				}
				for (let rr = 0; rr < n; rr++) {
					if (rr === r || queenCol[rr] !== -1) continue;
					const cells: [number, number][] = [];
					for (let cc = 0; cc < n; cc++) if (cand[rr][cc]) cells.push([rr, cc]);
					if (wouldWipe(r, c, cells)) {
						cand[r][c] = false;
						return { r, c, kind: 'ligne', index: rr };
					}
				}
				for (let cc = 0; cc < n; cc++) {
					if (cc === c || colHasQueen(cc)) continue;
					const cells: [number, number][] = [];
					for (let rr = 0; rr < n; rr++) if (cand[rr][cc]) cells.push([rr, cc]);
					if (wouldWipe(r, c, cells)) {
						cand[r][c] = false;
						return { r, c, kind: 'colonne', index: cc };
					}
				}
			}
		return null;
	};

	return { queenCol, placedCount: () => placed, place, singles, confinement, attackWipe };
}

/**
 * Deterministic human-style solver. Applies only forced deductions, so a
 * solved board is guaranteed to have a single solution AND a no-guess path:
 *  - tier 1: propagation from placed queens + last free cell of a row/col/zone
 *  - tier 2: + a zone confined to one row/col excludes the rest of that line
 *  - tier 3: + k zones confined to k lines (k <= 3), and the dual
 *  - tier 4: + a cell whose queen would empty another unit is excluded
 * Returns the solution (col per row) or null if stuck / contradiction.
 */
export function solveByLogic(regions: number[][], n: number, tier: 1 | 2 | 3 | 4): number[] | null {
	const L = createLogic(regions, n);
	for (let guard = 0; guard < n * n * 8; guard++) {
		if (L.placedCount() === n) return L.queenCol;
		const s = L.singles();
		if (s === 'dead') return null;
		if (s) continue;
		if (tier >= 2 && L.confinement(tier >= 3 ? 3 : 1)) continue;
		if (tier >= 4 && L.attackWipe()) continue;
		return null;
	}
	return null;
}

export interface HintResult {
	r: number;
	c: number;
	value: 'queen' | 'cross';
	reason: string;
}

/** Apply a hint to the player grid (pure, returns a new grid).
 *  A queen drops the other queens of its row — one per row — but never the
 *  player's crosses, which carry their own reasoning. */
export function applyHint(marks: CellState[][], h: HintResult): CellState[][] {
	const next = marks.map((row) => [...row]) as CellState[][];
	if (h.value === 'queen') {
		for (let c = 0; c < next[h.r].length; c++) if (next[h.r][c] === 2) next[h.r][c] = 0;
		next[h.r][h.c] = 2;
	} else {
		next[h.r][h.c] = 1;
	}
	return next;
}

/**
 * Find the next logically-deducible move and explain the technique (French).
 * `marks`: player grid, 0 empty / 1 cross / 2 queen. Corrects a wrong mark
 * first; then crosses attacked cells; then follows the same deterministic rule
 * chain as solveByLogic (so a hint is always a justified deduction, never an
 * arbitrary reveal). A proposed 'queen' is always solution[r] === c.
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

	// 2) A cross sitting on the real queen cell poisons every deduction — fix it.
	for (let r = 0; r < n; r++)
		if (marks[r]?.[solution[r]] === 1)
			return {
				r,
				c: solution[r],
				value: 'queen',
				reason: "La croix posée ici est erronée — c'est justement la case de la reine de cette ligne.",
			};

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

	// 4) Next deduction of the logic solver, seeded with the placed queens.
	// Deductions already crossed by the player advance the internal state only.
	const L = createLogic(regions, n);
	for (const [r, c] of queens) L.place(r, c);
	const tier = tierForSize(n);
	for (let guard = 0; guard < n * n * 8; guard++) {
		if (L.placedCount() === n) break;
		const s = L.singles();
		if (s === 'dead') break; // inconsistent state -> honest fallback
		if (s) {
			if (!isSolQueen(s.r, s.c)) break; // safety: must match the solution
			return {
				r: s.r,
				c: s.c,
				value: 'queen',
				reason: `Seule case encore possible de la ${unitName(s)}.`,
			};
		}
		const e = L.confinement(tier >= 3 ? 3 : 1);
		if (e) {
			const fresh = e.cells.find(([rr, cc]) => marks[rr]?.[cc] === 0 && !isSolQueen(rr, cc));
			if (fresh)
				return { r: fresh[0], c: fresh[1], value: 'cross', reason: confineReason(e) };
			continue;
		}
		if (tier >= 4) {
			const w = L.attackWipe();
			if (w) {
				if (marks[w.r]?.[w.c] === 0 && !isSolQueen(w.r, w.c))
					return {
						r: w.r,
						c: w.c,
						value: 'cross',
						reason: `Une reine ici couvrirait toutes les cases restantes de la ${unitName(w)} → croix.`,
					};
				continue;
			}
		}
		break;
	}

	// 5) Fallback — next missing solution queen (degraded boards only).
	for (let r = 0; r < n; r++)
		if (!isQueen(r, solution[r]))
			return { r, c: solution[r], value: 'queen', reason: 'La reine de cette ligne va ici.' };

	return null;
}

/** Rule tier a board of size n may require: 6/7 stay solvable with confinement
 *  techniques only; 8 may also need the one-step "wipe" exclusions (tier 4). */
const tierForSize = (n: number): 3 | 4 => (n >= 8 ? 4 : 3);

/** Generate a Reines puzzle with a unique solution AND a guess-free logical
 *  path (every step deducible with the solveByLogic rule tier of its size). */
export function generateReines(diff: DiffLevel, rng: Rng = Math.random): ReinesPuzzle {
	const n = diff.size;
	const tier = tierForSize(n);
	for (let attempt = 0; attempt < 600; attempt++) {
		const solution = randomSolution(n, rng);
		if (!solution) continue;
		// A few region layouts per solution before re-seeding the solution.
		for (let g = 0; g < 8; g++) {
			const regions = growRegions(n, solution, rng);
			if (solveByLogic(regions, n, tier)) return { size: n, regions, solution };
		}
	}
	// Degraded fallback: give up on the no-guess path but keep uniqueness.
	for (let attempt = 0; attempt < 300; attempt++) {
		const solution = randomSolution(n, rng);
		if (!solution) continue;
		for (let g = 0; g < 12; g++) {
			const regions = growRegions(n, solution, rng);
			if (countSolutions(regions, n, 2) === 1) return { size: n, regions, solution };
		}
	}
	// Extremely unlikely fallback: return last attempt's layout.
	const solution = randomSolution(n, rng) ?? Array.from({ length: n }, (_, i) => i);
	const regions = growRegions(n, solution, rng);
	return { size: n, regions, solution };
}
