import { describe, it, expect } from 'vitest';
import { generateGrid, solveGrid, rollCells, wordPoints, adjacent, validPath, spellPath, gridPoints, DICE_FR, DIFFS, SIZE } from './engine';
import { mulberry32 } from '../prng';

describe('meli-melo engine', () => {
	it('adjacent: corner 3, edge 5, center 8 neighbors; not self', () => {
		const count = (i: number): number => Array.from({ length: 16 }, (_, j) => j).filter((j) => adjacent(i, j)).length;
		expect(count(0)).toBe(3); // corner
		expect(count(1)).toBe(5); // edge
		expect(count(5)).toBe(8); // center
		expect(adjacent(5, 5)).toBe(false);
		expect(adjacent(3, 4)).toBe(false); // row wrap is not adjacent
	});

	it('wordPoints: classic Boggle table', () => {
		expect(wordPoints('ami')).toBe(1);
		expect(wordPoints('amis')).toBe(1);
		expect(wordPoints('amies')).toBe(2);
		expect(wordPoints('amitie')).toBe(3);
		expect(wordPoints('amities')).toBe(5);
		expect(wordPoints('actrices')).toBe(11);
	});

	it('validPath: adjacency chain, no repeats', () => {
		expect(validPath([0, 1, 2, 3])).toBe(true);
		expect(validPath([0, 5, 10, 15])).toBe(true); // diagonal
		expect(validPath([0, 2])).toBe(false); // gap
		expect(validPath([0, 1, 0])).toBe(false); // repeat
		expect(validPath([3, 4])).toBe(false); // row wrap
	});

	it('solveGrid on a hand-made grid + mini dictionary', () => {
		// C H A T
		// X X X X
		// X X X X
		// X X X X   (X = Q, unusable filler)
		const cells = 'CHATQQQQQQQQQQQQ'.split('');
		const dict = ['CHAT', 'TACHA', 'THA', 'CAT', 'HAT'].sort();
		const found = solveGrid(cells, dict);
		expect(found).toContain('CHAT'); // straight line
		expect(found).toContain('HAT');
		expect(found).not.toContain('CAT'); // C and A not adjacent
		expect(found).not.toContain('TACHA'); // would reuse the A cell
	});

	it('spellPath reads the traced cells', () => {
		expect(spellPath([0, 1, 2], 'CHATQQQQQQQQQQQQ'.split(''))).toBe('CHA');
	});

	it('rollCells uses one face of each die', () => {
		const cells = rollCells(mulberry32(9));
		expect(cells).toHaveLength(SIZE * SIZE);
		// each cell letter must be attributable to a DISTINCT die (backtracking matching)
		const assign = (k: number, free: string[]): boolean => {
			if (k === cells.length) return true;
			for (let i = 0; i < free.length; i++) {
				if (!free[i].includes(cells[k])) continue;
				const rest = free.slice(); rest.splice(i, 1);
				if (assign(k + 1, rest)) return true;
			}
			return false;
		};
		expect(assign(0, DICE_FR.slice()), 'cells match a die permutation').toBe(true);
	});

	it('generateGrid is deterministic and respects richness bands', () => {
		const a = generateGrid(7, DIFFS.moyen);
		expect(JSON.stringify(a)).toBe(JSON.stringify(generateGrid(7, DIFFS.moyen)));
		expect(JSON.stringify(a)).not.toBe(JSON.stringify(generateGrid(8, DIFFS.moyen)));

		for (const diff of Object.values(DIFFS)) {
			for (let seed = 1; seed <= 30; seed++) {
				const g = generateGrid(seed, diff);
				expect(g.cells).toHaveLength(16);
				expect(g.totalPoints).toBe(gridPoints(g.solutions));
				expect(g.totalPoints).toBeGreaterThanOrEqual(diff.minPoints);
				expect(g.totalPoints).toBeLessThanOrEqual(diff.maxPoints);
				expect(g.solutions).toEqual([...new Set(g.solutions)].sort());
				for (const w of g.solutions) expect(w.length).toBeGreaterThanOrEqual(3);
			}
		}
	});

	it('solutions round-trip: every solution has a real path in the grid', () => {
		const g = generateGrid(3, DIFFS.facile);
		const hasPath = (word: string): boolean => {
			const used = new Array<boolean>(16).fill(false);
			const dfs = (i: number, k: number): boolean => {
				if (g.cells[i] !== word[k]) return false;
				if (k === word.length - 1) return true;
				used[i] = true;
				for (let j = 0; j < 16; j++) if (!used[j] && adjacent(i, j) && dfs(j, k + 1)) { used[i] = false; return true; }
				used[i] = false;
				return false;
			};
			for (let i = 0; i < 16; i++) if (dfs(i, 0)) return true;
			return false;
		};
		for (const w of g.solutions) expect(hasPath(w), `${w} traceable`).toBe(true);
	});
});
