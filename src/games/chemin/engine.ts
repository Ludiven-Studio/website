/**
 * LE CHEMIN (LinkedIn "Zip") — pure engine (no UI).
 * Draw a single path that visits every cell exactly once, passing the
 * numbered checkpoints 1 → 2 → … → k in order, without crossing any wall.
 * Generation guarantees a unique solution.
 */

import type { Rng } from '../prng';

export interface DiffLevel {
	label: string;
	size: number;
	checkpoints: number; // numbered cells (incl. both ends); walls force uniqueness
}

export interface CheminPuzzle {
	size: number;
	numbers: number[][]; // 0 = none, else checkpoint label 1..k
	path: [number, number][]; // solution, in visiting order
	k: number;
	walls: [number, number][]; // blocked edges as flat-index pairs [a, b], a < b
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 5, checkpoints: 4 },
	moyen: { label: 'Moyen', size: 6, checkpoints: 4 },
	difficile: { label: 'Difficile', size: 6, checkpoints: 2 },
};

const NEI = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
] as const;

const EMPTY: Set<number> = new Set();

/** Canonical id of the edge between two adjacent flat indices. */
const edgeId = (a: number, b: number, total: number) =>
	(a < b ? a : b) * total + (a < b ? b : a);

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

const unvisitedDegree = (idx: number, visited: boolean[], n: number, walls: Set<number>): number => {
	const total = n * n;
	const r = Math.floor(idx / n);
	const c = idx % n;
	let d = 0;
	for (const [dr, dc] of NEI) {
		const nr = r + dr;
		const nc = c + dc;
		const ni = nr * n + nc;
		if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[ni] && !walls.has(edgeId(idx, ni, total)))
			d++;
	}
	return d;
};

/** Remaining unvisited cells stay connected (through non-walled edges). */
function stillConnected(visited: boolean[], n: number, walls: Set<number>): boolean {
	const total = n * n;
	let start = -1;
	let remaining = 0;
	for (let i = 0; i < total; i++)
		if (!visited[i]) {
			remaining++;
			if (start === -1) start = i;
		}
	if (remaining === 0) return true;
	const seen = new Uint8Array(total);
	const stack = [start];
	seen[start] = 1;
	let reached = 0;
	while (stack.length) {
		const cur = stack.pop()!;
		reached++;
		const r = Math.floor(cur / n);
		const c = cur % n;
		for (const [dr, dc] of NEI) {
			const nr = r + dr;
			const nc = c + dc;
			const ni = nr * n + nc;
			if (
				nr >= 0 && nr < n && nc >= 0 && nc < n &&
				!visited[ni] && !seen[ni] && !walls.has(edgeId(cur, ni, total))
			) {
				seen[ni] = 1;
				stack.push(ni);
			}
		}
	}
	return reached === remaining;
}

/** At most two "leaves" (degree-1 unvisited cells) — else a dead branch. */
function feasible(visited: boolean[], n: number, walls: Set<number>): boolean {
	let leaves = 0;
	for (let i = 0; i < n * n; i++) {
		if (visited[i]) continue;
		if (unvisitedDegree(i, visited, n, walls) === 1 && ++leaves > 2) return false;
	}
	return true;
}

/** Build a random Hamiltonian path with Warnsdorff ordering + backtracking. */
function hamiltonianPath(n: number, rng: Rng): [number, number][] | null {
	const total = n * n;

	for (let attempt = 0; attempt < 60; attempt++) {
		const visited = new Array(total).fill(false);
		const path: number[] = [];
		const start = Math.floor(rng() * total);
		visited[start] = true;
		path.push(start);
		let budget = 200000;

		const freeNeighbours = (idx: number): number[] => {
			const r = Math.floor(idx / n);
			const c = idx % n;
			const out: number[] = [];
			for (const [dr, dc] of NEI) {
				const nr = r + dr;
				const nc = c + dc;
				if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[nr * n + nc]) out.push(nr * n + nc);
			}
			return out;
		};

		const dfs = (idx: number): boolean => {
			if (path.length === total) return true;
			if (budget-- <= 0) return false;
			const nbs = shuffle(freeNeighbours(idx), rng).sort(
				(a, b) => freeNeighbours(a).length - freeNeighbours(b).length,
			);
			for (const nb of nbs) {
				visited[nb] = true;
				path.push(nb);
				if (stillConnected(visited, n, EMPTY) && dfs(nb)) return true;
				visited[nb] = false;
				path.pop();
			}
			return false;
		};

		if (dfs(start)) return path.map((i): [number, number] => [Math.floor(i / n), i % n]);
	}
	return null;
}

/**
 * Find up to `limit` valid solution paths (flat-index arrays) for the given
 * checkpoints and walls. Used both to count and to target walls.
 */
export function solveSome(
	numbers: number[][],
	n: number,
	k: number,
	walls: Set<number>,
	limit = 2,
	maxNodes = Infinity,
): number[][] | null {
	const total = n * n;
	let startIdx = -1;
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) if (numbers[r][c] === 1) startIdx = r * n + c;
	if (startIdx === -1) return [];

	const visited = new Array(total).fill(false);
	const path: number[] = [startIdx];
	const out: number[][] = [];
	let nodes = 0;
	let aborted = false;

	const dfs = (idx: number, depth: number, nextLabel: number) => {
		if (out.length >= limit || aborted) return;
		if (++nodes > maxNodes) {
			aborted = true;
			return;
		}
		if (depth === total) {
			if (nextLabel === k + 1) out.push([...path]);
			return;
		}
		const r = Math.floor(idx / n);
		const c = idx % n;
		for (const [dr, dc] of NEI) {
			const nr = r + dr;
			const nc = c + dc;
			if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
			const ni = nr * n + nc;
			if (visited[ni] || walls.has(edgeId(idx, ni, total))) continue;
			const lab = numbers[nr][nc];
			if (lab !== 0 && lab !== nextLabel) continue; // wrong checkpoint order
			visited[ni] = true;
			path.push(ni);
			if (feasible(visited, n, walls) && stillConnected(visited, n, walls))
				dfs(ni, depth + 1, lab !== 0 ? nextLabel + 1 : nextLabel);
			path.pop();
			visited[ni] = false;
			if (out.length >= limit) return;
		}
	};

	visited[startIdx] = true;
	dfs(startIdx, 1, 2); // label 1 consumed at start
	return aborted ? null : out;
}

/** Count valid solutions (stop at `limit`). */
export function countSolutions(
	numbers: number[][],
	n: number,
	k: number,
	walls: Set<number> = EMPTY,
	limit = 2,
): number {
	return (solveSome(numbers, n, k, walls, limit) ?? []).length;
}

const NODE_BUDGET = 120000; // per solver call; slow boards are abandoned & regenerated

/** One generation attempt; returns null if a solver call blows the budget. */
function attemptChemin(diff: DiffLevel, rng: Rng): CheminPuzzle | null {
	const n = diff.size;
	const total = n * n;
	const path = hamiltonianPath(n, rng) ?? fallbackSnake(n);
	const flat = path.map(([r, c]) => r * n + c);

	// Edges used by the solution — never wallable (keeps the solution valid).
	const solEdges = new Set<number>();
	for (let i = 1; i < flat.length; i++) solEdges.add(edgeId(flat[i - 1], flat[i], total));

	// Numbered checkpoints, evenly spread along the path (incl. both ends).
	const numbers: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
	const count = Math.max(2, Math.min(diff.checkpoints, total));
	const indices = new Set<number>([0, total - 1]);
	for (let i = 1; i < count - 1; i++) indices.add(Math.round((i * (total - 1)) / (count - 1)));
	const sorted = [...indices].sort((a, b) => a - b);
	sorted.forEach((pi, label) => {
		const [r, c] = path[pi];
		numbers[r][c] = label + 1;
	});
	const k = sorted.length;

	// All non-solution edges (candidate walls). Pre-wall a fraction (sparser
	// graph -> fast solver, denser Zip-style puzzle), then refine to uniqueness.
	const nonSol: number[] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			const a = r * n + c;
			if (c + 1 < n) {
				const e = edgeId(a, a + 1, total);
				if (!solEdges.has(e)) nonSol.push(e);
			}
			if (r + 1 < n) {
				const e = edgeId(a, a + n, total);
				if (!solEdges.has(e)) nonSol.push(e);
			}
		}
	const walls = new Set<number>();
	const prewall = Math.floor(nonSol.length * (n >= 7 ? 0.7 : 0.55));
	for (const e of shuffle(nonSol, rng).slice(0, prewall)) walls.add(e);

	const sameFlat = (s: number[]) => s.length === flat.length && s.every((v, i) => v === flat[i]);
	for (let guard = 0; guard < total * total; guard++) {
		const sols = solveSome(numbers, n, k, walls, 2, NODE_BUDGET);
		if (sols === null) return null; // too slow -> abandon this board
		if (sols.length <= 1) break; // unique
		const alt = shuffle(sols, rng).find((s) => !sameFlat(s)) ?? sols[0];
		let walled = false;
		// Wall every edge where this alternative diverges from the solution at
		// once (kills it and constrains more) -> far fewer solver iterations.
		for (let i = 1; i < alt.length; i++) {
			const e = edgeId(alt[i - 1], alt[i], total);
			if (!solEdges.has(e) && !walls.has(e)) {
				walls.add(e);
				walled = true;
			}
		}
		if (!walled) break; // no constrainable edge (shouldn't happen)
	}

	const wallPairs: [number, number][] = [...walls].map((id) => [
		Math.floor(id / total),
		id % total,
	]);
	return { size: n, numbers, path, k, walls: wallPairs };
}

/** Generate a uniquely-solvable Chemin puzzle with walls. */
export function generateChemin(diff: DiffLevel, rng: Rng = Math.random): CheminPuzzle {
	for (let a = 0; a < 12; a++) {
		const p = attemptChemin(diff, rng);
		if (p) return p;
	}
	// Last resort: wall every non-solution edge -> the solution is the only path.
	const n = diff.size;
	const total = n * n;
	const path = hamiltonianPath(n, rng) ?? fallbackSnake(n);
	const flat = path.map(([r, c]) => r * n + c);
	const solEdges = new Set<number>();
	for (let i = 1; i < flat.length; i++) solEdges.add(edgeId(flat[i - 1], flat[i], total));
	const numbers: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
	numbers[path[0][0]][path[0][1]] = 1;
	numbers[path[total - 1][0]][path[total - 1][1]] = 2;
	const walls: [number, number][] = [];
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			const a = r * n + c;
			if (c + 1 < n && !solEdges.has(edgeId(a, a + 1, total))) walls.push([a, a + 1]);
			if (r + 1 < n && !solEdges.has(edgeId(a, a + n, total))) walls.push([a, a + n]);
		}
	return { size: n, numbers, path, k: 2, walls };
}

/** Deterministic boustrophedon path — guaranteed Hamiltonian fallback. */
function fallbackSnake(n: number): [number, number][] {
	const path: [number, number][] = [];
	for (let r = 0; r < n; r++) {
		if (r % 2 === 0) for (let c = 0; c < n; c++) path.push([r, c]);
		else for (let c = n - 1; c >= 0; c--) path.push([r, c]);
	}
	return path;
}
