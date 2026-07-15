/**
 * MOTS TOURNÉS — pure engine (no UI). A "Wend"-style word puzzle: a letter grid is partitioned
 * into snaking paths, one per themed French word. The player traces each word over orthogonally
 * adjacent cells; the paths tile the whole grid. Only the word LENGTHS are shown (plus the theme),
 * never the words. Seeded (mulberry32) for the daily. Every word has a UNIQUE traceable path in the
 * finished grid, so a correct trace is never ambiguous and the puzzle has no dead ends.
 */

import { mulberry32, type Rng } from '../prng';
import { THEMES, normalize } from '../mots-meles/engine';

export type Cell = [number, number];
export interface Region { word: string; cells: Cell[]; }
export interface Puzzle {
	theme: string;
	rows: number;
	cols: number;
	letters: string[][];
	regions: Region[];
	lengths: number[]; // word lengths, sorted (the only per-word hint shown)
}

export interface DiffLevel {
	label: string;
	rows: number;
	cols: number;
	minWords: number;
	maxWords: number;
	minLen: number;
	maxLen: number;
	maxEmpty: number; // cells that may be left blank (walls) → eases generation + varied shapes
}

export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', rows: 4, cols: 4, minWords: 3, maxWords: 4, minLen: 4, maxLen: 6, maxEmpty: 2 },
	moyen: { label: 'Moyen', rows: 5, cols: 5, minWords: 4, maxWords: 5, minLen: 4, maxLen: 7, maxEmpty: 3 },
	difficile: { label: 'Difficile', rows: 6, cols: 5, minWords: 5, maxWords: 6, minLen: 4, maxLen: 8, maxEmpty: 4 },
};

/** Blank (wall) cells carry this sentinel; the trace can't pass through them. */
export const EMPTY = '';

/* ---------- Small helpers ---------- */

const key = (r: number, c: number): number => r * 100 + c;

export function neighbors(r: number, c: number, rows: number, cols: number): Cell[] {
	const out: Cell[] = [];
	if (r > 0) out.push([r - 1, c]);
	if (r < rows - 1) out.push([r + 1, c]);
	if (c > 0) out.push([r, c - 1]);
	if (c < cols - 1) out.push([r, c + 1]);
	return out;
}

function shuffle<T>(a: T[], rng: Rng): T[] {
	const x = a.slice();
	for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
	return x;
}

/** The string read along `cells` in `letters`. */
export const spell = (cells: Cell[], letters: string[][]): string => cells.map(([r, c]) => letters[r][c]).join('');

/** Index of the first word in `remaining` equal to `s`, else -1. */
export const matchWord = (s: string, remaining: string[]): number => remaining.indexOf(s);

/** Count the simple orthogonally-adjacent paths that spell `word` in `letters` (uniqueness check). */
export function countPaths(letters: string[][], word: string): number {
	const rows = letters.length, cols = letters[0].length;
	const used = new Set<number>();
	let count = 0;
	const dfs = (r: number, c: number, i: number): void => {
		if (letters[r][c] !== word[i]) return;
		if (i === word.length - 1) { count++; return; }
		used.add(key(r, c));
		for (const [nr, nc] of neighbors(r, c, rows, cols)) if (!used.has(key(nr, nc))) dfs(nr, nc, i + 1);
		used.delete(key(r, c));
	};
	for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (letters[r][c] === word[0]) dfs(r, c, 0);
	return count;
}

/* ---------- Generation ---------- */

/** Pick distinct words summing to exactly `n` cells, count in [minW,maxW] (randomised DFS). */
function chooseWords(words: string[], n: number, minW: number, maxW: number, rng: Rng): string[] | null {
	const pool = shuffle(words, rng);
	let found: string[] | null = null;
	const dfs = (start: number, sum: number, picked: string[]): void => {
		if (found) return;
		if (sum === n && picked.length >= minW && picked.length <= maxW) { found = picked.slice(); return; }
		if (sum >= n || picked.length >= maxW) return;
		for (let i = start; i < pool.length && !found; i++) {
			if (sum + pool[i].length > n) continue;
			picked.push(pool[i]); dfs(i + 1, sum + pool[i].length, picked); picked.pop();
		}
	};
	dfs(0, 0, []);
	return found;
}

/** Partition the (non-wall) rows×cols cells into vertex-disjoint simple paths of exactly `lengths`. */
function tile(rows: number, cols: number, lengths: number[], rng: Rng, walls: Set<number> = new Set()): Cell[][] | null {
	const filled: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
	for (const w of walls) filled[Math.floor(w / cols)][w % cols] = true; // walls count as pre-filled
	const remaining = new Map<number, number>();
	for (const l of lengths) remaining.set(l, (remaining.get(l) ?? 0) + 1);
	const paths: Cell[][] = [];
	let budget = 300_000;

	const firstFree = (): Cell | null => {
		for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!filled[r][c]) return [r, c];
		return null;
	};
	const grow = (path: Cell[], len: number): boolean => {
		if (--budget <= 0) return false;
		if (path.length === len) return true;
		const [r, c] = path[path.length - 1];
		for (const [nr, nc] of shuffle(neighbors(r, c, rows, cols), rng)) {
			if (filled[nr][nc]) continue;
			filled[nr][nc] = true; path.push([nr, nc]);
			if (grow(path, len)) return true;
			path.pop(); filled[nr][nc] = false;
		}
		return false;
	};
	const solve = (): boolean => {
		if (budget <= 0) return false;
		const s = firstFree();
		if (!s) return true;
		const lens = shuffle([...remaining.keys()].filter((l) => (remaining.get(l) ?? 0) > 0), rng);
		for (const len of lens) {
			remaining.set(len, remaining.get(len)! - 1);
			filled[s[0]][s[1]] = true;
			const path: Cell[] = [s];
			if (grow(path, len)) { paths.push(path); if (solve()) return true; paths.pop(); }
			for (const [r, c] of path) filled[r][c] = false;
			remaining.set(len, remaining.get(len)! + 1);
		}
		return false;
	};
	return solve() ? paths : null;
}

/** Deterministic themed puzzle for a seed + difficulty. */
export function generatePuzzle(seed: number, diff: DiffLevel): Puzzle {
	const N = diff.rows * diff.cols;
	let fallback: Puzzle | null = null;
	for (let attempt = 0; attempt < 120; attempt++) {
		const rng = mulberry32((seed ^ (attempt * 0x9e3779b1)) >>> 0);
		const theme = THEMES[Math.floor(rng() * THEMES.length)];
		const bank = Array.from(new Set(theme.words.map(normalize))).filter((w) => w.length >= diff.minLen && w.length <= diff.maxLen);
		// Leave a few cells blank sometimes (varied shapes + easier fit); prefer a full grid.
		const e = rng() < 0.6 ? 0 : 1 + Math.floor(rng() * diff.maxEmpty);
		const walls = new Set<number>();
		while (walls.size < e) walls.add(Math.floor(rng() * N));
		const sel = chooseWords(bank, N - e, diff.minWords, diff.maxWords, rng);
		if (!sel) continue;
		const paths = tile(diff.rows, diff.cols, sel.map((w) => w.length), rng, walls);
		if (!paths) continue;

		// Assign a distinct word to each path by matching length; wall cells stay blank (EMPTY).
		const byLen = new Map<number, string[]>();
		for (const w of shuffle(sel, rng)) { const a = byLen.get(w.length) ?? []; a.push(w); byLen.set(w.length, a); }
		const letters: string[][] = Array.from({ length: diff.rows }, () => new Array(diff.cols).fill(EMPTY));
		const regions: Region[] = [];
		for (const path of paths) {
			const w = byLen.get(path.length)!.pop()!;
			path.forEach(([r, c], i) => { letters[r][c] = w[i]; });
			regions.push({ word: w, cells: path.map(([r, c]) => [r, c] as Cell) });
		}
		const puzzle: Puzzle = { theme: theme.name, rows: diff.rows, cols: diff.cols, letters, regions, lengths: sel.map((w) => w.length).sort((a, b) => a - b) };
		fallback = puzzle;
		// Uniqueness: each word must be traceable in exactly one place (blank cells block traversal).
		if (regions.every((rg) => countPaths(letters, rg.word) === 1)) return puzzle;
	}
	// All 90 attempts hit an ambiguity — return the last valid tiling (still fully solvable).
	return fallback ?? { theme: '—', rows: diff.rows, cols: diff.cols, letters: Array.from({ length: diff.rows }, () => new Array(diff.cols).fill('A')), regions: [], lengths: [] };
}
