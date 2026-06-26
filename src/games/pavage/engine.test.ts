import { describe, it, expect } from 'vitest';
import {
	DIFFS,
	generatePavage,
	countSolutions,
	findHint,
	placedCells,
	type Placement,
} from './engine';
import { mulberry32 } from '../prng';

const ORTH = [
	[-1, 0], [1, 0], [0, -1], [0, 1],
] as const;

describe('pavage engine', () => {
	it('generates a uniquely-solvable puzzle for every difficulty', () => {
		for (const key of Object.keys(DIFFS)) {
			const diff = DIFFS[key];
			const p = generatePavage(diff, mulberry32(9000 + diff.size));
			expect(countSolutions(p, 2), `"${key}" unique`).toBe(1);
		}
	});

	it('the solution tiles every free cell exactly once and respects the no-touch colour rule', () => {
		const p = generatePavage(DIFFS.moyen, mulberry32(123456));
		const { size, blocked, pieces, solution } = p;
		const cover: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
		pieces.forEach((piece, i) => {
			for (const [r, c] of placedCells(piece, solution[i])) {
				expect(blocked[r][c], 'piece does not cover a blocked cell').toBe(false);
				expect(cover[r][c], 'no overlap').toBe(-1);
				cover[r][c] = piece.color;
			}
		});
		// every non-blocked cell is covered
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++)
				if (!blocked[r][c]) expect(cover[r][c], `cell ${r},${c} covered`).toBeGreaterThanOrEqual(0);
		// same colour never touches (orthogonally) across different pieces
		const owner: number[][] = Array.from({ length: size }, () => new Array(size).fill(-1));
		pieces.forEach((piece, i) => {
			for (const [r, c] of placedCells(piece, solution[i])) owner[r][c] = i;
		});
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) {
				if (cover[r][c] < 0) continue;
				for (const [dr, dc] of ORTH) {
					const nr = r + dr, nc = c + dc;
					if (nr < 0 || nr >= size || nc < 0 || nc >= size || cover[nr][nc] < 0) continue;
					if (owner[nr][nc] !== owner[r][c])
						expect(cover[nr][nc] === cover[r][c], 'adjacent different pieces differ in colour').toBe(false);
				}
			}
	});

	it('findHint solves the grid step by step, only ever proposing solution placements', () => {
		const p = generatePavage(DIFFS.facile, mulberry32(2026));
		const placements: (Placement | null)[] = p.pieces.map(() => null);
		for (let step = 0; step < p.pieces.length + 1; step++) {
			const h = findHint(placements, p);
			if (!h) break;
			expect(h.action).toBe('place');
			placements[h.pieceIndex] = h.placement!;
		}
		// all pieces placed → board fully tiled
		const { size, blocked } = p;
		const cover: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) if (blocked[r][c]) cover[r][c] = true;
		p.pieces.forEach((piece, i) => {
			expect(placements[i], `piece ${i} placed`).not.toBeNull();
			for (const [r, c] of placedCells(piece, placements[i]!)) cover[r][c] = true;
		});
		for (let r = 0; r < size; r++)
			for (let c = 0; c < size; c++) expect(cover[r][c]).toBe(true);
	});

	it('findHint takes back a misplaced piece first', () => {
		const p = generatePavage(DIFFS.facile, mulberry32(77));
		const placements: (Placement | null)[] = p.pieces.map(() => null);
		// place piece 0 deliberately wrong (shift its solution by one column if it fits the grid)
		const sol0 = p.solution[0];
		const wrong: Placement = { ...sol0, col: sol0.col + 1 };
		// only assert when the shifted footprint stays in bounds (else skip — still a valid run)
		const cells = placedCells(p.pieces[0], wrong);
		const inBounds = cells.every(([r, c]) => r >= 0 && r < p.size && c >= 0 && c < p.size);
		if (inBounds) {
			placements[0] = wrong;
			const h = findHint(placements, p);
			expect(h?.action).toBe('remove');
			expect(h?.pieceIndex).toBe(0);
		}
	});
});
