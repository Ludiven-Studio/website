import { describe, it, expect } from 'vitest';
import { generatePuzzle, countPaths, spell, matchWord, neighbors, DIFFS, type Puzzle } from './engine';
import { THEMES, normalize } from '../mots-meles/engine';
import { mulberry32 } from '../prng';

const themeWords = new Set(THEMES.flatMap((t) => t.words.map(normalize)));

function validate(p: Puzzle): void {
	const seen = new Set<number>();
	for (const rg of p.regions) {
		// cells spell the word
		expect(spell(rg.cells, p.letters)).toBe(rg.word);
		expect(rg.cells.length).toBe(rg.word.length);
		expect(themeWords.has(rg.word)).toBe(true);
		for (let i = 0; i < rg.cells.length; i++) {
			const [r, c] = rg.cells[i];
			const k = r * 100 + c;
			expect(seen.has(k), 'no overlap').toBe(false); // paths are vertex-disjoint
			seen.add(k);
			if (i > 0) { const [pr, pc] = rg.cells[i - 1]; expect(Math.abs(pr - r) + Math.abs(pc - c)).toBe(1); } // orthogonal step
		}
		// unique traceable path → no ambiguity, no dead ends
		expect(countPaths(p.letters, rg.word)).toBe(1);
	}
	const empties = p.letters.flat().filter((x) => x === '').length;
	expect(seen.size).toBe(p.rows * p.cols - empties); // the paths tile every non-blank cell
	// every non-blank cell belongs to exactly one region (seen), every blank cell to none
	for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) expect(seen.has(r * 100 + c)).toBe(p.letters[r][c] !== '');
	expect(new Set(p.regions.map((r) => r.word)).size).toBe(p.regions.length); // all distinct
	expect(p.lengths).toEqual(p.regions.map((r) => r.word.length).sort((a, b) => a - b));
}

describe('mots-tournés generator', () => {
	it('is deterministic and varies across seeds', () => {
		expect(JSON.stringify(generatePuzzle(7, DIFFS.moyen))).toBe(JSON.stringify(generatePuzzle(7, DIFFS.moyen)));
		expect(JSON.stringify(generatePuzzle(7, DIFFS.moyen))).not.toBe(JSON.stringify(generatePuzzle(8, DIFFS.moyen)));
	});

	it('produces valid tiled puzzles with uniquely-traceable words (batch of seeds)', () => {
		for (const key of Object.keys(DIFFS)) {
			const d = DIFFS[key];
			for (let seed = 1; seed <= 40; seed++) {
				const p = generatePuzzle(seed, d);
				expect(p.regions.length, `${key} seed ${seed} not empty`).toBeGreaterThanOrEqual(d.minWords);
				expect(p.regions.length).toBeLessThanOrEqual(d.maxWords);
				expect(p.letters.flat().filter((x) => x === '').length).toBeLessThanOrEqual(d.maxEmpty); // blanks stay within budget
				validate(p);
			}
		}
	});

	it('word lengths respect the difficulty bounds and fill every non-blank cell', () => {
		const p = generatePuzzle(3, DIFFS.difficile);
		const empties = p.letters.flat().filter((x) => x === '').length;
		expect(p.rows * p.cols - empties).toBe(p.regions.reduce((a, r) => a + r.word.length, 0));
		for (const rg of p.regions) { expect(rg.word.length).toBeGreaterThanOrEqual(DIFFS.difficile.minLen); expect(rg.word.length).toBeLessThanOrEqual(DIFFS.difficile.maxLen); }
	});
});

describe('helpers', () => {
	it('neighbors are orthogonal and clamped to the grid', () => {
		expect(neighbors(0, 0, 3, 3).sort()).toEqual([[0, 1], [1, 0]].sort());
		expect(neighbors(1, 1, 3, 3).length).toBe(4);
	});

	it('spell / matchWord / countPaths on a hand grid', () => {
		// C A T
		// . . S   (a bottom-right L: CATS winds C(0,0)→A(0,1)→T(0,2)→S(1,2))
		const letters = [['C', 'A', 'T'], ['X', 'Y', 'S']];
		expect(spell([[0, 0], [0, 1], [0, 2], [1, 2]], letters)).toBe('CATS');
		expect(matchWord('CATS', ['DOG', 'CATS'])).toBe(1);
		expect(matchWord('NOPE', ['DOG', 'CATS'])).toBe(-1);
		expect(countPaths(letters, 'CATS')).toBe(1);
		expect(countPaths(letters, 'CAT')).toBe(1);
		expect(countPaths([['A', 'A'], ['A', 'A']], 'AA')).toBe(8); // 4 cells × 2 neighbours each
		expect(typeof mulberry32(1)()).toBe('number');
	});
});
