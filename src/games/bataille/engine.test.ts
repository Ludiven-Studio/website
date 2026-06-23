import { describe, it, expect } from 'vitest';
import { mulberry32, dateSeed } from '../prng';
import {
	SIZES,
	generateHunt,
	segType,
	sonarCount,
	shipCells,
	isSunk,
	isWon,
	type HuntPuzzle,
	type Shot,
} from './engine';

const emptyShots = (n: number): Shot[][] => Array.from({ length: n }, () => new Array<Shot>(n).fill(0));

const noTouch = (grid: boolean[][]): boolean => {
	const n = grid.length;
	for (let r = 0; r < n; r++)
		for (let c = 0; c < n; c++)
			if (grid[r][c])
				for (const [dr, dc] of [
					[-1, -1],
					[-1, 1],
					[1, -1],
					[1, 1],
				])
					if (grid[r + dr]?.[c + dc]) return false;
	return true;
};

describe('bataille hunt engine', () => {
	for (const key of Object.keys(SIZES)) {
		const sl = SIZES[key];
		it(`${key}: generates a valid no-touch fleet`, () => {
			for (let s = 0; s < 4; s++) {
				const p = generateHunt(sl, mulberry32(4000 + s * 31 + sl.size));
				let cells = 0;
				for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (p.ships[r][c]) cells++;
				expect(cells).toBe(sl.fleet.reduce((a, b) => a + b, 0));
				expect(noTouch(p.ships)).toBe(true);
				// shipId components match the fleet lengths.
				const sizes = new Map<number, number>();
				for (let r = 0; r < p.size; r++)
					for (let c = 0; c < p.size; c++) {
						const id = p.shipId[r][c];
						if (id >= 0) sizes.set(id, (sizes.get(id) ?? 0) + 1);
					}
				const lengths = [...sizes.values()].sort((a, b) => b - a);
				expect(lengths).toEqual([...sl.fleet].sort((a, b) => b - a));
			}
		});
	}

	it('is reproducible from a seed (daily)', () => {
		const seed = dateSeed(new Date('2026-06-23T00:00:00Z'));
		const a = generateHunt(SIZES.moyen, mulberry32(seed));
		const b = generateHunt(SIZES.moyen, mulberry32(seed));
		expect(a.ships).toEqual(b.ships);
		expect(a.shipId).toEqual(b.shipId);
	});

	it('sonarCount counts ship cells in the 3×3 area (radius 1, clamped at edges)', () => {
		const ships = [
			[true, false, false],
			[false, true, false],
			[false, false, true],
		];
		expect(sonarCount(ships, 1, 1, 3)).toBe(3); // centre sees all three
		expect(sonarCount(ships, 0, 0, 3)).toBe(2); // corner sees (0,0)+(1,1)
		expect(sonarCount(ships, 0, 2, 3)).toBe(1); // only (1,1) in range
	});

	it('isSunk only once every cell of a ship is hit', () => {
		const p = generateHunt(SIZES.facile, mulberry32(123));
		const cells = shipCells(p, 0);
		const shots = emptyShots(p.size);
		cells.slice(0, -1).forEach(({ r, c }) => (shots[r][c] = 1));
		expect(isSunk(p, shots, 0)).toBe(false);
		const last = cells[cells.length - 1];
		shots[last.r][last.c] = 1;
		expect(isSunk(p, shots, 0)).toBe(true);
	});

	it('isWon iff all ship cells are hit (misses are irrelevant)', () => {
		const p = generateHunt(SIZES.facile, mulberry32(55));
		const shots = emptyShots(p.size);
		// Some random misses on water — must not affect the win check.
		shots[0][0] = p.ships[0][0] ? 1 : 2;
		expect(isWon(p, shots)).toBe(false);
		for (let r = 0; r < p.size; r++)
			for (let c = 0; c < p.size; c++) if (p.ships[r][c]) shots[r][c] = 1;
		expect(isWon(p, shots)).toBe(true);
	});

	it('segType reads ship shapes', () => {
		const p = generateHunt(SIZES.facile, mulberry32(321));
		for (let r = 0; r < p.size; r++)
			for (let c = 0; c < p.size; c++) {
				const t = segType(p.ships, r, c);
				if (p.ships[r][c]) expect(t).not.toBeNull();
				else expect(t).toBeNull();
			}
	});
});
