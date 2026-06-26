/**
 * TRANSVASE (Water Sort) — pure engine (no UI).
 * Pour the top block of one tube onto another (same top colour, or empty tube,
 * with room) until every tube is empty or full of a single colour. Generation
 * guarantees a solvable puzzle; a bounded DFS solver also powers the hint.
 */

import type { Rng } from '../prng';

export type Tube = number[]; // colours bottom→top; 1..colors; empty = []

export interface WaterPuzzle {
	tubes: Tube[]; // initial state
	height: number;
	colors: number;
	tubesCount: number;
}

export interface Move {
	from: number;
	to: number;
}

export interface DiffLevel {
	label: string;
	colors: number;
	empties: number;
	height: number;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', colors: 4, empties: 2, height: 4 },
	moyen: { label: 'Moyen', colors: 6, empties: 2, height: 4 },
	difficile: { label: 'Difficile', colors: 9, empties: 2, height: 4 },
};

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/* ---------- pure rules ---------- */

export const topColor = (t: Tube): number | null => (t.length ? t[t.length - 1] : null);

/** Size of the contiguous same-colour block at the top of a tube. */
export function topBlock(t: Tube): number {
	if (!t.length) return 0;
	const c = t[t.length - 1];
	let k = 0;
	for (let i = t.length - 1; i >= 0 && t[i] === c; i--) k++;
	return k;
}

export const isComplete = (t: Tube, height: number): boolean =>
	t.length === height && t.every((x) => x === t[0]);

export function legalMove(tubes: Tube[], from: number, to: number, height: number): boolean {
	if (from === to) return false;
	const src = tubes[from];
	const dst = tubes[to];
	if (!src.length) return false;
	if (dst.length >= height) return false;
	return dst.length === 0 || dst[dst.length - 1] === src[src.length - 1];
}

/** Apply a (legal) move, returning a new tubes array. Moves the whole top block, capped by room. */
export function applyMove(tubes: Tube[], move: Move, height: number): Tube[] {
	const res = tubes.map((t) => t.slice());
	const src = res[move.from];
	const dst = res[move.to];
	const k = Math.min(topBlock(src), height - dst.length);
	for (let i = 0; i < k; i++) dst.push(src.pop()!);
	return res;
}

export function isSolved(tubes: Tube[], height: number): boolean {
	return tubes.every((t) => t.length === 0 || isComplete(t, height));
}

/* ---------- solver ---------- */

const stateKey = (tubes: Tube[]): string => tubes.map((t) => t.join('.')).sort().join('|');

/** Legal, non-pointless moves, ordered best-first (completing > consolidating > to-empty). */
function orderedMoves(tubes: Tube[], height: number): Move[] {
	const out: { m: Move; score: number }[] = [];
	for (let from = 0; from < tubes.length; from++) {
		const src = tubes[from];
		if (!src.length) continue;
		if (isComplete(src, height)) continue; // never move from a finished tube
		const block = topBlock(src);
		const wholeUniform = block === src.length; // tube holds a single colour only
		for (let to = 0; to < tubes.length; to++) {
			if (!legalMove(tubes, from, to, height)) continue;
			const dst = tubes[to];
			if (dst.length === 0 && wholeUniform) continue; // pure relocation, pointless
			let score = 0;
			const space = height - dst.length;
			if (dst.length > 0) score += 5; // consolidating onto same colour
			if (Math.min(block, space) === space && dst.length + block >= height) score += 5; // fills dst
			if (block === Math.min(block, space)) score += 1; // whole block fits
			out.push({ m: { from, to }, score });
		}
	}
	out.sort((a, b) => b.score - a.score);
	return out.map((o) => o.m);
}

/** Find one solution from the current state, or null (also bounded → null when too hard). */
export function findSolution(tubes: Tube[], height: number, maxStates = 200000): Move[] | null {
	const visited = new Set<string>();
	const path: Move[] = [];
	let states = 0;
	let capped = false;

	const dfs = (ts: Tube[]): boolean => {
		if (isSolved(ts, height)) return true;
		if (states++ > maxStates) {
			capped = true;
			return false;
		}
		const key = stateKey(ts);
		if (visited.has(key)) return false;
		visited.add(key);
		for (const m of orderedMoves(ts, height)) {
			path.push(m);
			if (dfs(applyMove(ts, m, height))) return true;
			path.pop();
			if (capped) return false;
		}
		return false;
	};

	return dfs(tubes.map((t) => t.slice())) ? path.slice() : null;
}

/* ---------- generation ---------- */

export function generateWaterSort(diff: DiffLevel, rng: Rng = Math.random): WaterPuzzle {
	const { colors, empties, height } = diff;

	for (let attempt = 0; attempt < 400; attempt++) {
		const pool: number[] = [];
		for (let c = 1; c <= colors; c++) for (let i = 0; i < height; i++) pool.push(c);
		const mixed = shuffle(pool, rng);

		const tubes: Tube[] = [];
		for (let i = 0; i < colors; i++) tubes.push(mixed.slice(i * height, (i + 1) * height));
		for (let i = 0; i < empties; i++) tubes.push([]);

		if (isSolved(tubes, height)) continue; // trivial deal
		if (findSolution(tubes, height)) {
			return { tubes, height, colors, tubesCount: tubes.length };
		}
	}

	throw new Error('Transvase: failed to generate a solvable puzzle');
}

/* ---------- hint ---------- */

export interface HintResult {
	from: number;
	to: number;
	reason: string;
}

/**
 * First move of a SHORTEST solution (BFS). Following it repeatedly strictly
 * reduces the distance to a solved state, so hints always converge (no ping-pong).
 * Bounded by maxStates → null when the state is too hard to search in budget.
 */
function firstMoveBFS(start: Tube[], height: number, maxStates: number): Move | null {
	if (isSolved(start, height)) return null;
	const visited = new Set<string>([stateKey(start)]);
	const queue: { tubes: Tube[]; first: Move }[] = [];

	const expand = (ts: Tube[], first: Move | null): Move | 'queued' | null => {
		for (const m of orderedMoves(ts, height)) {
			const nt = applyMove(ts, m, height);
			const key = stateKey(nt);
			if (visited.has(key)) continue;
			visited.add(key);
			const root = first ?? m;
			if (isSolved(nt, height)) return root;
			queue.push({ tubes: nt, first: root });
		}
		return 'queued';
	};

	const seed = expand(start, null);
	if (seed && seed !== 'queued') return seed;

	for (let head = 0; head < queue.length; head++) {
		if (visited.size > maxStates) return null;
		const { tubes: ts, first } = queue[head];
		const found = expand(ts, first);
		if (found && found !== 'queued') return found;
	}
	return null;
}

/** Next useful pour toward a solution from the current state (null if none / too hard). */
export function findHint(tubes: Tube[], height: number): HintResult | null {
	const m = firstMoveBFS(tubes, height, 120000) ?? findSolution(tubes, height)?.[0] ?? null;
	if (!m) return null;
	return {
		from: m.from,
		to: m.to,
		reason: `Verse le tube ${m.from + 1} dans le tube ${m.to + 1}.`,
	};
}
