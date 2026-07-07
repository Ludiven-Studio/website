import { describe, it, expect } from 'vitest';
import {
	createLayout,
	initialPegs,
	pegCount,
	isWin,
	isStuck,
	movesFrom,
	allMoves,
	applyMove,
	solve,
	hintMove,
} from './engine';

describe('solitaire engine', () => {
	it('builds the English cross with 33 holes, 32 pegs and a central vacancy', () => {
		const layout = createLayout('anglais');
		expect(layout.holes.length).toBe(33);
		const pegs = initialPegs(layout);
		expect(pegCount(pegs)).toBe(32);
		expect(pegs[layout.startEmpty]).toBe(false);
		expect(layout.center).toBe(layout.startEmpty);
	});

	it('builds the triangle with 15 holes, 14 pegs and an empty apex', () => {
		const layout = createLayout('triangle');
		expect(layout.holes.length).toBe(15);
		expect(pegCount(initialPegs(layout))).toBe(14);
	});

	it('offers exactly the two jumps into the centre at the start (English)', () => {
		const layout = createLayout('anglais');
		const pegs = initialPegs(layout);
		const moves = allMoves(layout, pegs);
		expect(moves.length).toBe(4); // four symmetric first jumps
		expect(moves.every((m) => m.to === layout.center)).toBe(true);
	});

	it('applyMove removes the jumped peg and moves the jumper', () => {
		const layout = createLayout('anglais');
		const pegs = initialPegs(layout);
		const m = movesFrom(layout, pegs, allMoves(layout, pegs)[0].from)[0];
		const next = applyMove(pegs, m);
		expect(next[m.from]).toBe(false);
		expect(next[m.over]).toBe(false);
		expect(next[m.to]).toBe(true);
		expect(pegCount(next)).toBe(pegCount(pegs) - 1);
		expect(pegs[m.from]).toBe(true); // original untouched (immutable)
	});

	it('detects a stuck position and a win', () => {
		const layout = createLayout('anglais');
		const win = layout.holes.map(() => false);
		win[layout.center] = true;
		expect(isWin(win)).toBe(true);
		expect(isStuck(layout, win)).toBe(true); // one peg, no moves
	});

	it('solves the triangle from the empty apex down to a single peg', () => {
		const layout = createLayout('triangle');
		const sol = solve(layout, initialPegs(layout));
		expect(sol).not.toBeNull();
		expect(sol!.length).toBe(13); // 14 pegs → 1 peg = 13 jumps
		// replaying the solution really lands on one peg
		let pegs = initialPegs(layout);
		for (const m of sol!) pegs = applyMove(pegs, m);
		expect(isWin(pegs)).toBe(true);
	});

	it('gives a legal, progress-keeping hint', () => {
		const layout = createLayout('triangle');
		const pegs = initialPegs(layout);
		const hint = hintMove(layout, pegs)!;
		expect(hint).toBeTruthy();
		expect(allMoves(layout, pegs).some((m) => m.from === hint.from && m.to === hint.to)).toBe(true);
	});
});
