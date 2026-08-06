/**
 * CIRCUIT (Netwalk / Pipes) — pure engine (no UI).
 * Rotate every tile until the whole network hangs off the generator with no loose end.
 *
 * A random spanning tree over the grid IS the solution, so a board is solvable by
 * construction: generation only spins the tiles, it never searches and never retries.
 */

import type { Rng } from '../prng';

export interface DiffLevel {
	label: string;
	size: number;
	/** The grid loops on itself — the borders stop being a free clue. */
	wrap: boolean;
	/** 0 = bushy tree (short branches, easy to read), 1 = long corridors (hard). */
	bias: number;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 5, wrap: false, bias: 0.3 },
	moyen: { label: 'Moyen', size: 7, wrap: false, bias: 0.55 },
	difficile: { label: 'Difficile', size: 9, wrap: false, bias: 0.8 },
	expert: { label: 'Expert', size: 9, wrap: true, bias: 0.85 },
};

export const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;

export interface CircuitPuzzle {
	size: number;
	wrap: boolean;
	source: number; // flat index of the generator
	start: number[]; // masks as dealt (scrambled)
	solution: number[]; // the spanning tree
}

/** One bit per side, clockwise from the top. */
export const BIT = [1, 2, 4, 8] as const; // N E S W
const STEP: readonly (readonly [number, number])[] = [[-1, 0], [0, 1], [1, 0], [0, -1]];
const OPP = [2, 3, 0, 1] as const;

/** A tile whose look survives every rotation carries no information. */
const spinnable = (mask: number): boolean => mask !== 0 && mask !== 15;

export const rotCW = (mask: number): number => ((mask << 1) | (mask >> 3)) & 15;

export function rotate(mask: number, turns: number): number {
	let m = mask;
	for (let t = ((turns % 4) + 4) % 4; t > 0; t--) m = rotCW(m);
	return m;
}

/** Flat index of the neighbour on side `d`, or -1 off a non-wrapping grid. */
export function neighbour(idx: number, d: number, size: number, wrap: boolean): number {
	const r = Math.floor(idx / size) + STEP[d][0];
	const c = (idx % size) + STEP[d][1];
	if (wrap) return (((r % size) + size) % size) * size + (((c % size) + size) % size);
	if (r < 0 || r >= size || c < 0 || c >= size) return -1;
	return r * size + c;
}

/** Smallest number of clockwise quarter-turns taking `from` to `to` (0 if unreachable). */
export function turnsTo(from: number, to: number): number {
	let m = from;
	for (let t = 0; t < 4; t++) {
		if (m === to) return t;
		m = rotCW(m);
	}
	return 0;
}

/**
 * Growing-tree maze over the grid. `bias` picks how often we extend the newest active
 * cell (deep corridors, mostly elbows and straights) instead of a random one (bushy tree,
 * lots of T-pieces that read at a glance).
 */
function spanningTree(size: number, wrap: boolean, bias: number, rng: Rng): { masks: number[]; source: number } {
	const total = size * size;
	const masks = new Array<number>(total).fill(0);
	const seen = new Array<boolean>(total).fill(false);
	const source = Math.floor(rng() * total) % total;

	seen[source] = true;
	const active = [source];
	while (active.length > 0) {
		const at = rng() < bias ? active.length - 1 : Math.floor(rng() * active.length);
		const cell = active[at];
		const open: number[] = [];
		for (let d = 0; d < 4; d++) {
			const nb = neighbour(cell, d, size, wrap);
			if (nb >= 0 && !seen[nb]) open.push(d);
		}
		if (open.length === 0) {
			active.splice(at, 1);
			continue;
		}
		const d = open[Math.floor(rng() * open.length)];
		const nb = neighbour(cell, d, size, wrap);
		masks[cell] |= BIT[d];
		masks[nb] |= BIT[OPP[d]];
		seen[nb] = true;
		active.push(nb);
	}
	return { masks, source };
}

/** Cells reached from the source through links both sides agree on. */
export function litCells(masks: number[], size: number, wrap: boolean, source: number): boolean[] {
	const lit = new Array<boolean>(masks.length).fill(false);
	if (masks.length === 0) return lit;
	lit[source] = true;
	const queue = [source];
	while (queue.length > 0) {
		const cell = queue.pop() as number;
		for (let d = 0; d < 4; d++) {
			if (!(masks[cell] & BIT[d])) continue;
			const nb = neighbour(cell, d, size, wrap);
			if (nb < 0 || lit[nb] || !(masks[nb] & BIT[OPP[d]])) continue;
			lit[nb] = true;
			queue.push(nb);
		}
	}
	return lit;
}

/** True when no pipe hangs loose and every tile draws from the source. */
export function isSolved(masks: number[], size: number, wrap: boolean, source: number): boolean {
	for (let i = 0; i < masks.length; i++)
		for (let d = 0; d < 4; d++) {
			if (!(masks[i] & BIT[d])) continue;
			const nb = neighbour(i, d, size, wrap);
			if (nb < 0 || !(masks[nb] & BIT[OPP[d]])) return false;
		}
	// Matched ends alone still allow a detached loop: the tile multiset holds exactly
	// size²-1 links, and that is connected only if it is also acyclic.
	return litCells(masks, size, wrap, source).every(Boolean);
}

/** Loose ends of a tile — what the player sees as "this cannot be right". */
export function danglingSides(masks: number[], idx: number, size: number, wrap: boolean): number[] {
	const out: number[] = [];
	for (let d = 0; d < 4; d++) {
		if (!(masks[idx] & BIT[d])) continue;
		const nb = neighbour(idx, d, size, wrap);
		if (nb < 0 || !(masks[nb] & BIT[OPP[d]])) out.push(d);
	}
	return out;
}

export function generateCircuit(diff: DiffLevel, rng: Rng = Math.random): CircuitPuzzle {
	const size = Math.max(2, Math.floor(diff.size));
	const { masks: solution, source } = spanningTree(size, diff.wrap, diff.bias, rng);

	const start = solution.map((m) => rotate(m, Math.floor(rng() * 4)));
	if (isSolved(start, size, diff.wrap, source)) {
		// A spanning tree of 2+ cells always has a leaf, so a spinnable tile always exists.
		const i = start.findIndex(spinnable);
		if (i >= 0) start[i] = rotCW(start[i]);
	}
	return { size, wrap: diff.wrap, source, start, solution };
}

/** Fewest taps to finish from `masks` — the board's par. */
export function parTurns(masks: number[], solution: number[]): number {
	let sum = 0;
	for (let i = 0; i < masks.length; i++) sum += turnsTo(masks[i], solution[i]);
	return sum;
}

export interface CircuitHint {
	idx: number;
	mask: number; // the orientation to snap to
	turns: number; // clockwise quarter-turns to get there
	reason: string;
}

/**
 * Straighten the misplaced tile nearest the generator: hints then grow outwards from the
 * lit part of the network, which is the order a player reasons in anyway.
 */
export function findHint(masks: number[], p: CircuitPuzzle): CircuitHint | null {
	const { size, wrap, source, solution } = p;
	if (isSolved(masks, size, wrap, source)) return null;

	// BFS over the solution tree so "near the generator" means near along the wiring.
	const dist = new Array<number>(masks.length).fill(Infinity);
	dist[source] = 0;
	const queue = [source];
	for (let head = 0; head < queue.length; head++) {
		const cell = queue[head];
		for (let d = 0; d < 4; d++) {
			if (!(solution[cell] & BIT[d])) continue;
			const nb = neighbour(cell, d, size, wrap);
			if (nb < 0 || dist[nb] !== Infinity) continue;
			dist[nb] = dist[cell] + 1;
			queue.push(nb);
		}
	}

	let idx = -1;
	for (let i = 0; i < masks.length; i++)
		if (masks[i] !== solution[i] && (idx < 0 || dist[i] < dist[idx])) idx = i;
	if (idx < 0) return null;

	const lit = litCells(masks, size, wrap, source);
	let reason = 'Cette tuile n\'est pas encore dans le bon sens.';
	if (danglingSides(masks, idx, size, wrap).some((d) => neighbour(idx, d, size, wrap) < 0))
		reason = 'Un tuyau sort de la grille : il n\'y a rien derrière pour le raccorder.';
	else if (
		[0, 1, 2, 3].some((d) => {
			const nb = neighbour(idx, d, size, wrap);
			return nb >= 0 && lit[nb] && masks[nb] === solution[nb];
		})
	)
		reason = 'Un voisin déjà alimenté est bien orienté : il n\'y a qu\'un raccord possible ici.';

	return { idx, mask: solution[idx], turns: turnsTo(masks[idx], solution[idx]), reason };
}

/** Pure: returns a new grid with the hinted tile snapped into place. */
export function applyHint(masks: number[], hint: CircuitHint): number[] {
	const next = masks.slice();
	next[hint.idx] = hint.mask;
	return next;
}
