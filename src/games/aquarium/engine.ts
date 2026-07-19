/**
 * AQUARIUM — pure engine (no UI).
 * The grid is partitioned into connected regions (aquariums). Water settles by
 * gravity: inside a region, water is level — a cell holds water iff its row is at
 * or below the region's water line (water fills from the bottom). Row/column clues
 * give the number of water cells. Generation guarantees a unique solution.
 */

import type { Rng } from '../prng';

export interface DiffLevel {
	label: string;
	size: number;
	minRegion: number;
	maxRegion: number;
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', size: 6, minRegion: 3, maxRegion: 5 },
	moyen: { label: 'Moyen', size: 7, minRegion: 4, maxRegion: 6 },
	difficile: { label: 'Difficile', size: 8, minRegion: 4, maxRegion: 7 },
};

export interface AquariumPuzzle {
	size: number;
	regionOf: number[][]; // region id per cell
	solution: boolean[][]; // true = water
	rowCounts: number[];
	colCounts: number[];
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Partition the grid into connected regions of size ~[minR, maxR]. */
function partition(n: number, minR: number, maxR: number, rng: Rng): number[][] {
	const region: number[][] = Array.from({ length: n }, () => new Array(n).fill(-1));
	let id = 0;
	for (const [sr, sc] of shuffle(
		Array.from({ length: n * n }, (_, i): [number, number] => [Math.floor(i / n), i % n]),
		rng,
	)) {
		if (region[sr][sc] !== -1) continue;
		region[sr][sc] = id;
		let count = 1;
		const target = minR + Math.floor(rng() * (maxR - minR + 1));
		while (count < target) {
			const frontier: [number, number][] = [];
			for (let r = 0; r < n; r++)
				for (let c = 0; c < n; c++)
					if (region[r][c] === id) {
						for (const [nr, nc] of [
							[r - 1, c],
							[r + 1, c],
							[r, c - 1],
							[r, c + 1],
						] as [number, number][]) {
							if (nr >= 0 && nr < n && nc >= 0 && nc < n && region[nr][nc] === -1)
								frontier.push([nr, nc]);
						}
					}
			if (!frontier.length) break;
			const [gr, gc] = frontier[Math.floor(rng() * frontier.length)];
			region[gr][gc] = id;
			count++;
		}
		id++;
	}
	return region;
}

interface RegionInfo {
	cells: [number, number][];
	rows: number[]; // distinct rows present, ascending
}

function regionInfos(regionOf: number[][], n: number): RegionInfo[] {
	const map = new Map<number, [number, number][]>();
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			const id = regionOf[r][c];
			if (!map.has(id)) map.set(id, []);
			map.get(id)!.push([r, c]);
		}
	const infos: RegionInfo[] = [];
	for (const cells of map.values()) {
		const rows = [...new Set(cells.map(([r]) => r))].sort((a, b) => a - b);
		infos.push({ cells, rows });
	}
	return infos;
}

/** Water configurations for a region: thresholds (water = rows >= L) plus "empty". */
function waterConfigs(info: RegionInfo): [number, number][][] {
	const configs: [number, number][][] = [];
	for (const L of info.rows) configs.push(info.cells.filter(([r]) => r >= L));
	configs.push([]); // empty
	return configs;
}

/**
 * Count solutions: assign one water configuration per region so that the
 * row/column water counts match. Region waters are disjoint, so each assignment
 * gives a distinct grid → this is an exact unique-solution check.
 */
export function countSolutions(
	regionOf: number[][],
	rowCounts: number[],
	colCounts: number[],
	n: number,
	limit = 2,
): number {
	const infos = regionInfos(regionOf, n);
	// Precompute per-region candidate configs as row/col contribution vectors.
	const cands = infos.map((info) =>
		waterConfigs(info).map((cells) => {
			const rc = new Array(n).fill(0);
			const cc = new Array(n).fill(0);
			for (const [r, c] of cells) {
				rc[r]++;
				cc[c]++;
			}
			return { rc, cc };
		}),
	);
	// MRV-ish: process regions with fewest candidates first (and bigger spread).
	const order = infos.map((_, i) => i).sort((a, b) => cands[a].length - cands[b].length);

	const rowSum = new Array(n).fill(0);
	const colSum = new Array(n).fill(0);
	let count = 0;
	let nodes = 0;
	// Node cap: some region layouts make the search exponential. Rather than hang,
	// give up and report "ambiguous" (= limit) so callers reject and regenerate.
	const NODE_CAP = 120000;

	const dfs = (k: number) => {
		if (count >= limit) return;
		if (++nodes > NODE_CAP) { count = limit; return; }
		if (k === order.length) {
			for (let i = 0; i < n; i++) if (rowSum[i] !== rowCounts[i] || colSum[i] !== colCounts[i]) return;
			count++;
			return;
		}
		const gi = order[k];
		for (const { rc, cc } of cands[gi]) {
			let ok = true;
			for (let i = 0; i < n; i++) {
				if (colSum[i] + cc[i] > colCounts[i] || rowSum[i] + rc[i] > rowCounts[i]) {
					ok = false;
					break;
				}
			}
			if (!ok) continue;
			for (let i = 0; i < n; i++) {
				rowSum[i] += rc[i];
				colSum[i] += cc[i];
			}
			dfs(k + 1);
			for (let i = 0; i < n; i++) {
				rowSum[i] -= rc[i];
				colSum[i] -= cc[i];
			}
			if (count >= limit) return;
		}
	};

	dfs(0);
	return count;
}

export interface HintResult {
	r: number;
	c: number;
	value: 'water' | 'air';
	reason: string;
}

/**
 * Find the next logically-deducible cell for the player and explain the technique.
 * `marks`: player grid (0 empty, 1 water, 2 air). Corrects a wrong mark first, then
 * gravity / same-row / counter deductions, finally an honest fallback. The returned
 * value always matches the solution.
 */
export function findHint(marks: number[][], puzzle: AquariumPuzzle): HintResult | null {
	const { size: n, regionOf, solution, rowCounts, colCounts } = puzzle;
	const correct = (r: number, c: number): 'water' | 'air' => (solution[r][c] ? 'water' : 'air');
	const isEmpty = (r: number, c: number) => marks[r][c] === 0;
	const isWater = (r: number, c: number) => marks[r][c] === 1;
	const isAir = (r: number, c: number) => marks[r][c] === 2;
	const same = (r: number, c: number, rr: number, cc: number) => regionOf[r][c] === regionOf[rr][cc];

	// 1) Correction — a player mark that contradicts the solution.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (isEmpty(r, c)) continue;
			const v = correct(r, c);
			const marked: 'water' | 'air' = isWater(r, c) ? 'water' : 'air';
			if (marked === v) continue;
			const wrongLabel = marked === 'water' ? "de l'eau" : "vide d'eau";
			const goodLabel = v === 'water' ? "de l'eau" : "de l'air";
			return {
				r,
				c,
				value: v,
				reason: `Cette case ne peut pas être ${wrongLabel} ici (gravité/compteur) — c'est ${goodLabel}.`,
			};
		}

	// 2) Gravité — sous de l'eau : empty cell with same-region water directly above.
	for (let r = 1; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!isEmpty(r, c)) continue;
			if (same(r, c, r - 1, c) && isWater(r - 1, c) && correct(r, c) === 'water')
				return {
					r,
					c,
					value: 'water',
					reason: "L'eau remplit par le bas : sous de l'eau du même bassin → eau.",
				};
		}

	// 3) Gravité — au-dessus d'air : empty cell with same-region air directly below.
	for (let r = 0; r < n - 1; r++)
		for (let c = 0; c < n; c++) {
			if (!isEmpty(r, c)) continue;
			if (same(r, c, r + 1, c) && isAir(r + 1, c) && correct(r, c) === 'air')
				return {
					r,
					c,
					value: 'air',
					reason: "Au-dessus d'une case vide d'eau du même bassin → pas d'eau.",
				};
		}

	// 4) Même rangée d'un bassin : empty cell whose same-region same-row neighbour is decided.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			if (!isEmpty(r, c)) continue;
			for (let cc = 0; cc < n; cc++) {
				if (cc === c || !same(r, c, r, cc) || isEmpty(r, cc)) continue;
				const neighbour: 'water' | 'air' = isWater(r, cc) ? 'water' : 'air';
				if (neighbour === correct(r, c))
					return {
						r,
						c,
						value: neighbour,
						reason: "Dans un bassin, l'eau est de niveau : même état sur la rangée.",
					};
				break;
			}
		}

	// Per-line / per-column water tallies on the effective grid.
	const rowWater = (r: number) => {
		let k = 0;
		for (let c = 0; c < n; c++) if (isWater(r, c)) k++;
		return k;
	};
	const colWater = (c: number) => {
		let k = 0;
		for (let r = 0; r < n; r++) if (isWater(r, c)) k++;
		return k;
	};
	const rowEmpties = (r: number) => {
		const out: number[] = [];
		for (let c = 0; c < n; c++) if (isEmpty(r, c)) out.push(c);
		return out;
	};
	const colEmpties = (c: number) => {
		const out: number[] = [];
		for (let r = 0; r < n; r++) if (isEmpty(r, c)) out.push(r);
		return out;
	};

	// 5) Compteur atteint → air : line/col already has its water; remaining empties are air.
	for (let r = 0; r < n; r++) {
		if (rowWater(r) !== rowCounts[r]) continue;
		const empties = rowEmpties(r);
		for (const c of empties)
			if (correct(r, c) === 'air')
				return {
					r,
					c,
					value: 'air',
					reason: `Cette ligne a déjà ses ${rowCounts[r]} cases d'eau → pas d'eau.`,
				};
	}
	for (let c = 0; c < n; c++) {
		if (colWater(c) !== colCounts[c]) continue;
		const empties = colEmpties(c);
		for (const r of empties)
			if (correct(r, c) === 'air')
				return {
					r,
					c,
					value: 'air',
					reason: `Cette colonne a déjà ses ${colCounts[c]} cases d'eau → pas d'eau.`,
				};
	}

	// 6) Cases libres = compteur restant → eau : remaining empties exactly fill the count.
	for (let r = 0; r < n; r++) {
		const need = rowCounts[r] - rowWater(r);
		const empties = rowEmpties(r);
		if (need > 0 && empties.length === need)
			for (const c of empties)
				if (correct(r, c) === 'water')
					return {
						r,
						c,
						value: 'water',
						reason: `Il reste ${need} case${need > 1 ? 's' : ''} pour ${need} case${need > 1 ? 's' : ''} d'eau dans cette ligne.`,
					};
	}
	for (let c = 0; c < n; c++) {
		const need = colCounts[c] - colWater(c);
		const empties = colEmpties(c);
		if (need > 0 && empties.length === need)
			for (const r of empties)
				if (correct(r, c) === 'water')
					return {
						r,
						c,
						value: 'water',
						reason: `Il reste ${need} case${need > 1 ? 's' : ''} pour ${need} case${need > 1 ? 's' : ''} d'eau dans cette colonne.`,
					};
	}

	// 7) Fallback — first cell differing from the solution.
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++) {
			const v = correct(r, c);
			const marked: 'water' | 'air' | 'empty' = isEmpty(r, c) ? 'empty' : isWater(r, c) ? 'water' : 'air';
			if (marked === v) continue;
			return {
				r,
				c,
				value: v,
				reason: `Par déduction, cette case est ${v === 'water' ? "de l'eau" : "de l'air"}.`,
			};
		}

	return null;
}

export function generateAquarium(diff: DiffLevel, rng: Rng = Math.random): AquariumPuzzle {
	const n = diff.size;
	for (let attempt = 0; attempt < 300; attempt++) {
		const regionOf = partition(n, diff.minRegion, diff.maxRegion, rng);
		const infos = regionInfos(regionOf, n);

		// Random water line per region, biased away from all-empty / all-full.
		const solution: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
		for (const info of infos) {
			const configs = waterConfigs(info);
			const cells = configs[Math.floor(rng() * configs.length)];
			for (const [r, c] of cells) solution[r][c] = true;
		}

		const rowCounts = new Array(n).fill(0);
		const colCounts = new Array(n).fill(0);
		let water = 0;
		for (let r = 0; r < n; r++)
			for (let c = 0; c < n; c++)
				if (solution[r][c]) {
					rowCounts[r]++;
					colCounts[c]++;
					water++;
				}
		// Avoid degenerate grids (almost empty / almost full).
		if (water < n || water > n * n - n) continue;

		if (countSolutions(regionOf, rowCounts, colCounts, n, 2) === 1) {
			return { size: n, regionOf, solution, rowCounts, colCounts };
		}
	}

	// Fallback: a single full-water region (trivially unique).
	const regionOf = Array.from({ length: n }, () => new Array(n).fill(0));
	const solution = Array.from({ length: n }, () => new Array(n).fill(true));
	const rowCounts = new Array(n).fill(n);
	const colCounts = new Array(n).fill(n);
	return { size: n, regionOf, solution, rowCounts, colCounts };
}
