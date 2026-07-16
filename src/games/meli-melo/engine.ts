/**
 * MÉLI-MÉLO — pure engine (no UI). Boggle-like: a 4×4 letter grid rolled from the classic
 * French 16-dice set; find words (≥3 letters) by chaining 8-direction adjacent cells, each
 * cell used once per word. All findable words are precomputed at generation (DFS with
 * prefix pruning over COMMON ∪ EXTENDED) — instant submit validation + end-screen stats.
 * Difficulty = richness band of total findable points. Seeded (mulberry32) for the daily.
 */

import { mulberry32, type Rng } from '../prng';
import { COMMON_RAW } from '../words/common';
import { EXTENDED_RAW } from '../words/extended';
import { parseWords, mergeSorted, hasPrefix, hasWord } from '../words';

export const SIZE = 4;
export const DURATION_S = 90;

/** Classic French Boggle dice (16 × 6 faces). */
export const DICE_FR: readonly string[] = [
	'ETUKNO', 'EVGTIN', 'DECAMP', 'IELRUW',
	'EHIFSE', 'RECALS', 'ENTDOS', 'OFXRIA',
	'AVNDZE', 'ULEGPT', 'BMAQJO', 'TLIBRA',
	'SPULTE', 'AIMSOR', 'ENHRIS', 'MOTICU',
];

export interface DiffLevel { label: string; minPoints: number; maxPoints: number; }
export const DIFFS: Record<string, DiffLevel> = {
	// Bands calibrated on 300 rolls (p25=33, p50=55, p75=81, p90=128) so every
	// band keeps enough probability mass for the attempt loop to hit it fast.
	facile: { label: 'Facile', minPoints: 100, maxPoints: 999999 },
	moyen: { label: 'Moyen', minPoints: 55, maxPoints: 99 },
	difficile: { label: 'Difficile', minPoints: 25, maxPoints: 54 },
};

export interface BoggleGrid {
	cells: string[]; // 16 letters, row-major
	solutions: string[]; // all findable words, sorted
	totalPoints: number;
}

const ALL_SORTED = mergeSorted(parseWords(COMMON_RAW), parseWords(EXTENDED_RAW));

/** Classic Boggle scoring. */
export function wordPoints(w: string): number {
	if (w.length <= 4) return 1;
	if (w.length === 5) return 2;
	if (w.length === 6) return 3;
	if (w.length === 7) return 5;
	return 11;
}

/** 8-direction adjacency on 0..15 indices. */
export function adjacent(a: number, b: number): boolean {
	if (a === b) return false;
	const dr = Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE));
	const dc = Math.abs((a % SIZE) - (b % SIZE));
	return dr <= 1 && dc <= 1;
}

const NEIGHBORS: number[][] = Array.from({ length: SIZE * SIZE }, (_, i) =>
	Array.from({ length: SIZE * SIZE }, (_, j) => j).filter((j) => adjacent(i, j)));

/** Roll the 16 dice (shuffled positions, one face each). */
export function rollCells(rng: Rng): string[] {
	const order = DICE_FR.slice();
	for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
	return order.map((die) => die[Math.floor(rng() * die.length)]);
}

/** All dictionary words traceable in the grid (dedup, ≥3 letters), sorted. */
export function solveGrid(cells: string[], sorted: string[] = ALL_SORTED): string[] {
	const found = new Set<string>();
	const used = new Array<boolean>(cells.length).fill(false);
	const dfs = (i: number, cur: string): void => {
		const next = cur + cells[i];
		if (next.length > 8 || !hasPrefix(sorted, next)) return;
		if (next.length >= 3 && hasWord(sorted, next)) found.add(next);
		used[i] = true;
		for (const j of NEIGHBORS[i]) if (!used[j]) dfs(j, next);
		used[i] = false;
	};
	for (let i = 0; i < cells.length; i++) dfs(i, '');
	return [...found].sort();
}

export const gridPoints = (solutions: string[]): number => solutions.reduce((s, w) => s + wordPoints(w), 0);

/** Deterministic grid for a seed + difficulty. Never throws (closest-to-band fallback). */
export function generateGrid(seed: number, diff: DiffLevel): BoggleGrid {
	let fallback: BoggleGrid | null = null;
	let fallbackDist = Infinity;
	for (let attempt = 0; attempt < 60; attempt++) {
		const rng = mulberry32((seed ^ (attempt * 0x9e3779b1)) >>> 0);
		const cells = rollCells(rng);
		const solutions = solveGrid(cells);
		const totalPoints = gridPoints(solutions);
		const grid: BoggleGrid = { cells, solutions, totalPoints };
		if (totalPoints >= diff.minPoints && totalPoints <= diff.maxPoints) return grid;
		const dist = totalPoints < diff.minPoints ? diff.minPoints - totalPoints : totalPoints - diff.maxPoints;
		if (dist < fallbackDist) { fallback = grid; fallbackDist = dist; }
	}
	return fallback!; // 60 attempts always yield at least one rolled grid
}

export const spellPath = (path: number[], cells: string[]): string => path.map((i) => cells[i]).join('');

export function validPath(path: number[]): boolean {
	for (let i = 0; i < path.length; i++) {
		if (path.indexOf(path[i]) !== i) return false; // repeats
		if (i > 0 && !adjacent(path[i - 1], path[i])) return false;
	}
	return true;
}
