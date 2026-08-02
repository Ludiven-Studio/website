import { describe, it, expect } from 'vitest';
import { makeGrid, lineCells, matchIndex, normalize, findHint, DIFFS, type Cell } from './engine';

describe('mots-meles engine', () => {
	it('normalize strips accents and non-letters to A–Z uppercase', () => {
		expect(normalize('Pêche')).toBe('PECHE');
		expect(normalize('éÉèàûç')).toBe('EEEAUC');
		expect(normalize("l'île")).toBe('LILE');
	});

	it('makeGrid is deterministic for the same seed', () => {
		const a = makeGrid(4242, DIFFS.moyen);
		const b = makeGrid(4242, DIFFS.moyen);
		expect(a).toEqual(b);
		expect(makeGrid(1, DIFFS.moyen)).not.toEqual(makeGrid(2, DIFFS.moyen));
	});

	it('every placed word actually sits in the grid at its cells, and the grid is fully filled', () => {
		for (const key of Object.keys(DIFFS)) {
			for (let s = 0; s < 30; s++) {
				const g = makeGrid(100 + s, DIFFS[key]);
				expect(g.letters.length).toBe(g.size);
				for (const row of g.letters) {
					expect(row.length).toBe(g.size);
					for (const ch of row) expect(ch).toMatch(/^[A-Z]$/); // no empty / null cells
				}
				for (const p of g.words) {
					expect(p.cells.length).toBe(p.word.length);
					p.cells.forEach(([r, c], i) => expect(g.letters[r][c]).toBe(p.word[i]));
				}
			}
		}
	});

	it('places a reasonable number of words per difficulty', () => {
		for (let s = 0; s < 20; s++) {
			expect(makeGrid(500 + s, DIFFS.facile).words.length).toBeGreaterThanOrEqual(5);
			expect(makeGrid(700 + s, DIFFS.difficile).words.length).toBeGreaterThanOrEqual(7);
		}
	});

	it('lineCells returns the straight path, or null when not aligned', () => {
		expect(lineCells([2, 1], [2, 4], 9)).toEqual([[2, 1], [2, 2], [2, 3], [2, 4]]); // horizontal
		expect(lineCells([0, 0], [3, 3], 9)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]); // diagonal
		expect(lineCells([4, 4], [1, 4], 9)).toEqual([[4, 4], [3, 4], [2, 4], [1, 4]]); // reversed vertical
		expect(lineCells([0, 0], [2, 5], 9)).toBeNull(); // not aligned
		expect(lineCells([3, 3], [3, 3], 9)).toEqual([[3, 3]]); // single cell
	});

	it('matchIndex matches a word from either drag direction', () => {
		const g = makeGrid(2026, DIFFS.moyen);
		const p = g.words[0];
		const fwd: Cell[] = p.cells.map((c) => [c[0], c[1]]);
		const rev: Cell[] = [...fwd].reverse();
		expect(matchIndex(fwd, g.words)).toBe(0);
		expect(matchIndex(rev, g.words)).toBe(0);
		expect(matchIndex([[0, 0]], g.words)).toBe(-1); // a single cell is never a (≥4-letter) word
	});

	it('findHint gives one start cell while words are missing, and never the word itself', () => {
		for (const key of Object.keys(DIFFS)) {
			const g = makeGrid(3131, DIFFS[key]);
			const found: number[] = [];
			const hinted: Cell[] = [];
			while (found.length < g.words.length) {
				const h = findHint(g, found, hinted);
				expect(h, 'a hint exists while the grid is unsolved').not.toBeNull();
				// Only a cell and a French note — no word, no path.
				expect(Object.keys(h!).sort()).toEqual(['cell', 'reason']);
				expect(h!.reason).toMatch(/^Un mot de \d+ lettres commence ici, (à l'horizontale|à la verticale|en diagonale)\.$/);
				const idx = g.words.findIndex((p, i) => !found.includes(i) && p.cells[0][0] === h!.cell[0] && p.cells[0][1] === h!.cell[1]);
				expect(idx, 'the cell starts a still-unfound word').toBeGreaterThanOrEqual(0);
				hinted.push(h!.cell);
				found.push(idx);
			}
			expect(findHint(g, found)).toBeNull(); // nothing left to hint
		}
	});
});
