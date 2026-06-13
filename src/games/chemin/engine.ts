/**
 * LE CHEMIN (LinkedIn "Zip") — pure engine (no UI).
 * Draw a single path that visits every cell exactly once, passing the
 * numbered checkpoints 1 → 2 → … → k in order (start = 1, end = k).
 * Generation guarantees a unique solution.
 */

import type { Rng } from '../prng';

export interface DiffLevel {
	label: string;
	size: number;
	checkpoints: number; // base count (fewer = harder); may grow to force uniqueness
}

export interface CheminPuzzle {
	size: number;
	numbers: number[][]; // 0 = none, else checkpoint label 1..k
	path: [number, number][]; // solution, in visiting order
	k: number;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 5, checkpoints: 5 },
	moyen: { label: 'Moyen', size: 6, checkpoints: 5 },
	difficile: { label: 'Difficile', size: 7, checkpoints: 5 },
};

const NEI = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
] as const;

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

const unvisitedDegree = (idx: number, visited: boolean[], n: number): number => {
	const r = Math.floor(idx / n);
	const c = idx % n;
	let d = 0;
	for (const [dr, dc] of NEI) {
		const nr = r + dr;
		const nc = c + dc;
		if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[nr * n + nc]) d++;
	}
	return d;
};

/** Remaining unvisited cells stay connected (flood fill from any unvisited). */
function stillConnected(visited: boolean[], n: number): boolean {
	let start = -1;
	let remaining = 0;
	for (let i = 0; i < n * n; i++)
		if (!visited[i]) {
			remaining++;
			if (start === -1) start = i;
		}
	if (remaining === 0) return true;
	const seen = new Uint8Array(n * n);
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
			if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited[ni] && !seen[ni]) {
				seen[ni] = 1;
				stack.push(ni);
			}
		}
	}
	return reached === remaining;
}

/**
 * Hamiltonian feasibility prune for the path-counting search.
 * The remaining cells must form a single path, which has at most two endpoints,
 * so an unvisited cell with a single unvisited neighbour (a "leaf") can only be
 * an endpoint. More than two leaves — or any isolated cell — is a dead branch.
 */
function feasible(visited: boolean[], n: number): boolean {
	// (Isolated cells with >1 remaining are caught by stillConnected; a lone
	//  final cell legitimately has degree 0, so we only bound the leaves here.)
	let leaves = 0;
	for (let i = 0; i < n * n; i++) {
		if (visited[i]) continue;
		if (unvisitedDegree(i, visited, n) === 1 && ++leaves > 2) return false;
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
			// Warnsdorff: try neighbours with the fewest onward options first.
			const nbs = shuffle(freeNeighbours(idx), rng).sort(
				(a, b) => freeNeighbours(a).length - freeNeighbours(b).length,
			);
			for (const nb of nbs) {
				visited[nb] = true;
				path.push(nb);
				if (stillConnected(visited, n) && dfs(nb)) return true;
				visited[nb] = false;
				path.pop();
			}
			return false;
		};

		if (dfs(start)) return path.map((i): [number, number] => [Math.floor(i / n), i % n]);
	}
	return null;
}

/** Count valid solutions given checkpoint numbers (stop at limit). */
export function countSolutions(numbers: number[][], n: number, k: number, limit = 2): number {
	const total = n * n;
	let startIdx = -1;
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) if (numbers[r][c] === 1) startIdx = r * n + c;
	if (startIdx === -1) return 0;

	const visited = new Array(total).fill(false);
	let count = 0;

	const dfs = (idx: number, depth: number, nextLabel: number) => {
		if (count >= limit) return;
		if (depth === total) {
			if (nextLabel === k + 1) count++;
			return;
		}
		const r = Math.floor(idx / n);
		const c = idx % n;
		for (const [dr, dc] of NEI) {
			const nr = r + dr;
			const nc = c + dc;
			if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
			const ni = nr * n + nc;
			if (visited[ni]) continue;
			const lab = numbers[nr][nc];
			if (lab !== 0 && lab !== nextLabel) continue; // wrong checkpoint order
			visited[ni] = true;
			if (feasible(visited, n) && stillConnected(visited, n))
				dfs(ni, depth + 1, lab !== 0 ? nextLabel + 1 : nextLabel);
			visited[ni] = false;
			if (count >= limit) return;
		}
	};

	visited[startIdx] = true;
	dfs(startIdx, 1, 2); // label 1 consumed at start
	return count;
}

/** Generate a uniquely-solvable Chemin puzzle. */
export function generateChemin(diff: DiffLevel, rng: Rng = Math.random): CheminPuzzle {
	const { size: n } = diff;
	const path = hamiltonianPath(n, rng) ?? fallbackSnake(n);
	const total = n * n;

	// Candidate checkpoint path-indices: always include start (0) and end (total-1).
	const buildNumbers = (indices: number[]): { numbers: number[][]; k: number } => {
		const sorted = [...new Set(indices)].sort((a, b) => a - b);
		const numbers: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
		sorted.forEach((pi, label) => {
			const [r, c] = path[pi];
			numbers[r][c] = label + 1;
		});
		return { numbers, k: sorted.length };
	};

	// Start from `checkpoints` evenly spread, add more until the solution is unique.
	let count = Math.max(2, Math.min(diff.checkpoints, total));
	for (let tries = 0; tries < total; tries++) {
		const indices = [0, total - 1];
		for (let i = 1; i < count - 1; i++) indices.push(Math.round((i * (total - 1)) / (count - 1)));
		const { numbers, k } = buildNumbers(indices);
		if (countSolutions(numbers, n, k, 2) === 1) return { size: n, numbers, path, k };
		count = Math.min(count + 1, total); // more checkpoints -> fewer paths -> unique
		if (count === total) {
			const { numbers, k } = buildNumbers(path.map((_, i) => i));
			return { size: n, numbers, path, k };
		}
	}
	const { numbers, k } = buildNumbers(path.map((_, i) => i));
	return { size: n, numbers, path, k };
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
