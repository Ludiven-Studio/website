import { describe, it, expect } from 'vitest';
import {
	deal, draw, canFoundation, canTableau, isRun, autoMove, tableauToTableau, jokerToTableau,
	foundationCount, isWon, hasMoves, rankOf, suitOf, type State, type TabCard,
} from './engine';
import { mulberry32 } from '../prng';

const card = (rank: number, suit: number): number => suit * 13 + (rank - 1); // rank 1..13, suit 0..3
const up = (c: number): TabCard => ({ c, up: true });

// Minimal hand-built state (empty stock/waste/foundations) for rule tests.
const blank = (tableau: TabCard[][] = [[], [], [], [], [], [], []]): State => ({
	stock: [], waste: [], foundations: [[], [], [], []], tableau, drawCount: 1, passesLeft: Infinity,
});

describe('réussite deal', () => {
	it('is deterministic for a seed and different across seeds', () => {
		expect(JSON.stringify(deal(7))).toBe(JSON.stringify(deal(7)));
		expect(JSON.stringify(deal(7))).not.toBe(JSON.stringify(deal(8)));
	});

	it('deals 7 columns (col i = i+1 cards, only the last face-up) and 24 to the stock; 52 unique cards', () => {
		const s = deal(42, 3);
		const all: number[] = [...s.stock];
		s.tableau.forEach((pile, col) => {
			expect(pile.length).toBe(col + 1);
			pile.forEach((t, r) => expect(t.up).toBe(r === col));
			all.push(...pile.map((t) => t.c));
		});
		expect(s.stock.length).toBe(24);
		expect(s.waste.length).toBe(0);
		expect(new Set(all).size).toBe(52);
		expect(Math.min(...all)).toBe(0);
		expect(Math.max(...all)).toBe(51);
	});
});

describe('rules', () => {
	it('foundation accepts the Ace, then the next rank of the same suit only', () => {
		let s = blank();
		expect(canFoundation(s, card(1, 0))).toBe(true);  // A♠ on empty
		expect(canFoundation(s, card(2, 0))).toBe(false); // 2♠ before the Ace
		s = { ...s, foundations: [[card(1, 0)], [], [], []] };
		expect(canFoundation(s, card(2, 0))).toBe(true);  // 2♠ on A♠
		expect(canFoundation(s, card(2, 3))).toBe(false); // wrong suit
		expect(canFoundation(s, card(3, 0))).toBe(false); // skips a rank
	});

	it('tableau accepts a King on empty and a descending alternating-colour card otherwise', () => {
		const s = blank([[up(card(7, 0))], [], [], [], [], [], []]); // 7♠ (black) on column 0
		expect(canTableau(s, card(13, 1), 1)).toBe(true);  // K♥ on empty column
		expect(canTableau(s, card(6, 1), 0)).toBe(true);   // 6♥ (red) on 7♠
		expect(canTableau(s, card(6, 3), 0)).toBe(false);  // 6♣ (black) — same colour
		expect(canTableau(s, card(5, 1), 0)).toBe(false);  // wrong rank
		expect(canTableau(s, card(12, 2), 1)).toBe(false); // only a King on empty
	});

	it('detects a valid face-up descending alternating run', () => {
		const s = blank([[up(card(8, 0)), up(card(7, 1)), up(card(6, 0))]]); // 8♠ 7♥ 6♠
		expect(isRun(s, 0, 0)).toBe(true);
		expect(isRun(s, 0, 1)).toBe(true);
		const bad = blank([[up(card(8, 0)), up(card(7, 0))]]); // same colour
		expect(isRun(bad, 0, 0)).toBe(false);
	});
});

describe('moves', () => {
	it('draw turns drawCount cards, and recycles the waste when the stock is empty (costing a pass)', () => {
		const s: State = { ...blank(), stock: [10, 11, 12, 13, 14], drawCount: 3 };
		const d = draw(s)!;
		expect(d.waste.length).toBe(3);
		expect(d.stock.length).toBe(2);

		const empty: State = { ...blank(), stock: [], waste: [1, 2, 3], passesLeft: 1 };
		const rec = draw(empty)!;
		expect(rec.stock.length).toBe(3);
		expect(rec.waste.length).toBe(0);
		expect(rec.passesLeft).toBe(0);
		expect(draw(rec)).not.toBeNull(); // can now draw from the recycled stock
		expect(draw({ ...empty, waste: [], stock: [] })).toBeNull(); // nothing to do
		expect(draw({ ...empty, passesLeft: 0 })).toBeNull(); // no pass left
	});

	it('tableauToTableau moves a run and flips the newly exposed card', () => {
		const s = blank([
			[{ c: card(4, 3), up: false }, up(card(8, 0)), up(card(7, 1))], // ...8♠ 7♥ (7♥ moves)
			[up(card(9, 1))], // 9♥ (red) — but we move onto a black 8? build our own target
		]);
		// Move 8♠-7♥ onto a red 9 in column 1: put 9♦ there
		s.tableau[1] = [up(card(9, 2))]; // 9♦ (red)
		const r = tableauToTableau(s, 0, 1, 1)!;
		expect(r.tableau[1].map((t) => t.c)).toEqual([card(9, 2), card(8, 0), card(7, 1)]);
		expect(r.tableau[0].length).toBe(1);
		expect(r.tableau[0][0].up).toBe(true); // the face-down 4♣ got flipped
	});

	it('autoMove sends the waste Ace to its foundation, else to a valid tableau', () => {
		let s: State = { ...blank([[up(card(7, 0))], [], [], [], [], [], []]), waste: [card(1, 3)] }; // A♣ on waste
		s = autoMove(s, { kind: 'waste' })!;
		expect(s.foundations[3]).toEqual([card(1, 3)]); // A♣ went to foundation
		expect(s.waste.length).toBe(0);

		let t: State = { ...blank([[up(card(7, 0))], [], [], [], [], [], []]), waste: [card(6, 1)] }; // 6♥ → onto 7♠
		t = autoMove(t, { kind: 'waste' })!;
		expect(t.tableau[0].map((x) => x.c)).toEqual([card(7, 0), card(6, 1)]);
	});

	it('jokerToTableau moves a face-up group onto any column ignoring the build rule (not onto foundations)', () => {
		// Column 0: [4♣ down, 9♥, 3♠] — 9♥/3♠ are NOT a valid run, but a joker can still relocate them.
		const s = blank([[{ c: card(4, 3), up: false }, up(card(9, 1)), up(card(3, 0))], [up(card(2, 0))], [], [], [], [], []]);
		const r = jokerToTableau(s, { kind: 'tab', col: 0, idx: 1 }, 1)!; // onto 2♠ — illegal normally
		expect(r.tableau[1].map((t) => t.c)).toEqual([card(2, 0), card(9, 1), card(3, 0)]);
		expect(r.tableau[0].length).toBe(1);
		expect(r.tableau[0][0].up).toBe(true); // exposed 4♣ flipped
		expect(jokerToTableau(s, { kind: 'tab', col: 0, idx: 1 }, 0)).toBeNull(); // same column → no-op
	});

	it('reports win when all 52 cards reach the foundations', () => {
		const s: State = { ...blank(), foundations: [0, 1, 2, 3].map((su) => Array.from({ length: 13 }, (_, r) => su * 13 + r)) };
		expect(foundationCount(s)).toBe(52);
		expect(isWon(s)).toBe(true);
	});

	it('hasMoves is false on a dead end (no draw, no legal placement)', () => {
		// 7 full columns, all black tops (never stackable — needs alternating colour), none an Ace.
		const s = blank([
			[up(card(2, 0))], [up(card(3, 0))], [up(card(4, 0))], [up(card(5, 0))],
			[up(card(2, 3))], [up(card(3, 3))], [up(card(4, 3))],
		]);
		expect(hasMoves(s)).toBe(false);
		expect(hasMoves({ ...s, stock: [5] })).toBe(true); // a stock card → drawing is always a move
	});

	it('exposes rank/suit helpers consistently', () => {
		expect(rankOf(card(1, 0))).toBe(1);
		expect(rankOf(card(13, 2))).toBe(13);
		expect(suitOf(card(5, 2))).toBe(2);
		expect(typeof mulberry32(1)()).toBe('number');
	});
});
