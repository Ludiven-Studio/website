import { describe, expect, it } from 'vitest';
import { initMolkky, applyThrow, pointsFor, scoreAfter, TARGET, BUST_TO } from './rules';

describe('mölkky rules', () => {
	it('scores a lone pin by its number and several by their count', () => {
		expect(pointsFor([])).toBe(0);
		expect(pointsFor([9])).toBe(9);
		expect(pointsFor([9, 12, 3])).toBe(3);
	});

	it('passes the turn and keeps the throw for the HUD', () => {
		const s = applyThrow(initMolkky(['A', 'B']), [7]);
		expect(s.players[0].score).toBe(7);
		expect(s.turn).toBe(1);
		expect(s.last).toMatchObject({ player: 0, points: 7, bust: false });
	});

	it('wins on exactly 50 and drops to 25 past it', () => {
		let s = initMolkky(['A', 'B']);
		s = { ...s, players: [{ ...s.players[0], score: 44 }, s.players[1]] };
		const over = applyThrow(s, [12]);
		expect(over.players[0].score).toBe(BUST_TO);
		expect(over.last?.bust).toBe(true);
		expect(over.winner).toBeNull();
		const win = applyThrow(s, [6]);
		expect(win.players[0].score).toBe(TARGET);
		expect(win.winner).toBe(0);
		expect(win.turn).toBe(0);
		expect(applyThrow(win, [5])).toBe(win); // a decided game takes no more throws
	});

	it('puts a player out after three misses in a row, and a hit resets the count', () => {
		let s = initMolkky(['A', 'B', 'C']);
		s = applyThrow(s, []); // A 1
		s = applyThrow(s, [2]); // B
		s = applyThrow(s, [3]); // C
		s = applyThrow(s, [4]); // A hits: reset
		expect(s.players[0].misses).toBe(0);
		for (let k = 0; k < 3; k++) {
			s = applyThrow(s, []); // B misses
			s = applyThrow(s, [1]); // C
			if (k < 2) s = applyThrow(s, [1]); // A
		}
		expect(s.players[1].out).toBe(true);
		expect(s.turn).toBe(0); // B is skipped: after C comes A
	});

	it('gives the game to the last player left in', () => {
		let s = initMolkky(['A', 'B']);
		for (let k = 0; k < 3; k++) {
			s = applyThrow(s, []); // A misses
			if (s.winner === null) s = applyThrow(s, [1]); // B
		}
		expect(s.players[0].out).toBe(true);
		expect(s.winner).toBe(1);
	});

	it('reads a bust ahead of time', () => {
		expect(scoreAfter(40, 10)).toBe(50);
		expect(scoreAfter(40, 11)).toBe(-1);
	});
});
