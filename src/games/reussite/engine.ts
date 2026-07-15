/**
 * RÉUSSITE — Klondike solitaire (pure engine, no rendering / no network).
 * A deck seeded from a number (same deal for everyone on a given day), the classic rules
 * (foundations up by suit from the Ace, tableau down in alternating colours, only Kings on
 * an empty column), and draw-1 / draw-3 with a recycle limit. All move functions are pure
 * and return a NEW state (or null when illegal), so the component keeps an undo stack.
 */

import { mulberry32, type Rng } from '../prng';

// A card is an integer 0..51. rank = id%13 + 1 (1=Ace … 13=King); suit = id/13 (0♠ 1♥ 2♦ 3♣).
export const rankOf = (c: number): number => (c % 13) + 1;
export const suitOf = (c: number): number => (c / 13) | 0;
export const isRed = (c: number): boolean => { const s = suitOf(c); return s === 1 || s === 2; };

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUITS = ['♠', '♥', '♦', '♣'];

export interface TabCard { c: number; up: boolean; } // a tableau card + whether it's face-up

export interface State {
	stock: number[]; // face-down draw pile (draw from the end)
	waste: number[]; // face-up discard (top = last)
	foundations: number[][]; // 4 piles indexed by suit, ascending from the Ace
	tableau: TabCard[][]; // 7 columns
	drawCount: number; // 1 or 3
	passesLeft: number; // remaining recycles of the stock (Infinity = unlimited)
}

// A source the player acts on: the waste top, or a card at (col, idx) in the tableau.
export type Src = { kind: 'waste' } | { kind: 'tab'; col: number; idx: number };

/* ---------- Deal ---------- */

function shuffle(rng: Rng): number[] {
	const a = Array.from({ length: 52 }, (_, i) => i);
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

/** Deterministic Klondike deal: 7 columns (col i gets i+1 cards, last face-up), rest to stock. */
export function deal(seed: number, drawCount = 1, passes = Infinity, rng: Rng = mulberry32(seed >>> 0)): State {
	const d = shuffle(rng);
	const tableau: TabCard[][] = [];
	let k = 0;
	for (let col = 0; col < 7; col++) {
		const pile: TabCard[] = [];
		for (let r = 0; r <= col; r++) pile.push({ c: d[k++], up: r === col });
		tableau.push(pile);
	}
	return { stock: d.slice(k), waste: [], foundations: [[], [], [], []], tableau, drawCount, passesLeft: passes };
}

function clone(s: State): State {
	return {
		stock: s.stock.slice(),
		waste: s.waste.slice(),
		foundations: s.foundations.map((f) => f.slice()),
		tableau: s.tableau.map((col) => col.map((t) => ({ ...t }))),
		drawCount: s.drawCount,
		passesLeft: s.passesLeft,
	};
}

/* ---------- Rules ---------- */

/** A card may go to its foundation if it's the Ace (empty) or the next rank up of the same suit. */
export function canFoundation(s: State, c: number): boolean {
	const f = s.foundations[suitOf(c)];
	return f.length === 0 ? rankOf(c) === 1 : rankOf(f[f.length - 1]) + 1 === rankOf(c);
}

/** A card may land on a tableau column if the column is empty and it's a King, or the top
 *  card is one rank higher and the opposite colour. */
export function canTableau(s: State, c: number, col: number): boolean {
	const pile = s.tableau[col];
	if (pile.length === 0) return rankOf(c) === 13;
	const t = pile[pile.length - 1];
	if (!t.up) return false;
	return isRed(t.c) !== isRed(c) && rankOf(t.c) === rankOf(c) + 1;
}

/** True if tableau[col] from `idx` to the end is a face-up, descending, alternating-colour run. */
export function isRun(s: State, col: number, idx: number): boolean {
	const pile = s.tableau[col];
	if (idx < 0 || idx >= pile.length || !pile[idx].up) return false;
	for (let i = idx; i < pile.length - 1; i++) {
		const a = pile[i], b = pile[i + 1];
		if (!b.up || rankOf(a.c) !== rankOf(b.c) + 1 || isRed(a.c) === isRed(b.c)) return false;
	}
	return true;
}

/* ---------- Moves (each returns a new State, or null if illegal) ---------- */

/** Draw from the stock to the waste (drawCount cards); when the stock is empty, recycle the
 *  waste if a pass remains. Returns null if nothing can be drawn/recycled. */
export function draw(s: State): State | null {
	if (s.stock.length > 0) {
		const n = clone(s);
		const take = Math.min(s.drawCount, n.stock.length);
		for (let i = 0; i < take; i++) n.waste.push(n.stock.pop()!);
		return n;
	}
	if (s.waste.length > 0 && s.passesLeft > 0) {
		const n = clone(s);
		n.stock = n.waste.reverse(); // put them back in the original order
		n.waste = [];
		n.passesLeft -= 1;
		return n;
	}
	return null;
}

/** Flip the newly exposed card of a column face-up (after removing cards from it). */
function flipExposed(pile: TabCard[]): void {
	if (pile.length && !pile[pile.length - 1].up) pile[pile.length - 1].up = true;
}

function wasteTop(s: State): number | null {
	return s.waste.length ? s.waste[s.waste.length - 1] : null;
}

export function wasteToFoundation(s: State): State | null {
	const c = wasteTop(s);
	if (c == null || !canFoundation(s, c)) return null;
	const n = clone(s);
	n.foundations[suitOf(c)].push(n.waste.pop()!);
	return n;
}

export function wasteToTableau(s: State, col: number): State | null {
	const c = wasteTop(s);
	if (c == null || !canTableau(s, c, col)) return null;
	const n = clone(s);
	n.tableau[col].push({ c: n.waste.pop()!, up: true });
	return n;
}

export function tableauToFoundation(s: State, col: number): State | null {
	const pile = s.tableau[col];
	if (!pile.length) return null;
	const c = pile[pile.length - 1].c;
	if (!pile[pile.length - 1].up || !canFoundation(s, c)) return null;
	const n = clone(s);
	n.foundations[suitOf(c)].push(n.tableau[col].pop()!.c);
	flipExposed(n.tableau[col]);
	return n;
}

/** Move the run tableau[from][idx..] onto column `to`. */
export function tableauToTableau(s: State, from: number, idx: number, to: number): State | null {
	if (from === to || !isRun(s, from, idx)) return null;
	const moving = s.tableau[from].slice(idx);
	if (!canTableau(s, moving[0].c, to)) return null;
	const n = clone(s);
	n.tableau[to].push(...moving.map((t) => ({ ...t })));
	n.tableau[from].length = idx;
	flipExposed(n.tableau[from]);
	return n;
}

export function foundationToTableau(s: State, suit: number, to: number): State | null {
	const f = s.foundations[suit];
	if (!f.length) return null;
	const c = f[f.length - 1];
	if (!canTableau(s, c, to)) return null;
	const n = clone(s);
	n.tableau[to].push({ c: n.foundations[suit].pop()!, up: true });
	return n;
}

/* ---------- Tap: send a card to its best legal destination ---------- */

/** Auto-move for a tap: foundation first (single cards only), then the first valid tableau
 *  column. For a mid-run tableau card, only a tableau move is considered. Returns null if none. */
export function autoMove(s: State, src: Src): State | null {
	if (src.kind === 'waste') {
		return wasteToFoundation(s) ?? firstTableau(s, wasteTop(s), (col) => wasteToTableau(s, col));
	}
	const pile = s.tableau[src.col];
	if (!pile.length || !isRun(s, src.col, src.idx)) return null;
	const single = src.idx === pile.length - 1;
	if (single) {
		const f = tableauToFoundation(s, src.col);
		if (f) return f;
	}
	return firstTableau(s, pile[src.idx].c, (col) => tableauToTableau(s, src.col, src.idx, col), src.col);
}

// Try each tableau column (optionally skipping `skip`); return the first successful move.
function firstTableau(s: State, c: number | null, move: (col: number) => State | null, skip = -1): State | null {
	if (c == null) return null;
	// prefer a non-empty column that accepts it, then an empty one (avoids needlessly emptying)
	for (const wantEmpty of [false, true]) {
		for (let col = 0; col < 7; col++) {
			if (col === skip) continue;
			if ((s.tableau[col].length === 0) !== wantEmpty) continue;
			if (canTableau(s, c, col)) { const r = move(col); if (r) return r; }
		}
	}
	return null;
}

/* ---------- Status ---------- */

export const foundationCount = (s: State): number => s.foundations.reduce((a, f) => a + f.length, 0);
export const isWon = (s: State): boolean => foundationCount(s) === 52;

/** Any legal move left? (used to detect a dead end and offer to end the run) */
export function hasMoves(s: State): boolean {
	if (s.stock.length > 0 || (s.waste.length > 0 && s.passesLeft > 0)) return true; // can draw/recycle
	const w = wasteTop(s);
	if (w != null && (canFoundation(s, w) || anyTableau(s, w))) return true;
	for (let col = 0; col < 7; col++) {
		const pile = s.tableau[col];
		if (!pile.length) continue;
		const top = pile[pile.length - 1];
		if (top.up && canFoundation(s, top.c)) return true;
		// any face-up run start that can move to another column
		for (let i = 0; i < pile.length; i++) {
			if (!pile[i].up) continue;
			if (isRun(s, col, i) && anyTableau(s, pile[i].c, col)) return true;
			break; // first face-up card is the deepest movable run start
		}
	}
	return false;
}

function anyTableau(s: State, c: number, skip = -1): boolean {
	for (let col = 0; col < 7; col++) if (col !== skip && canTableau(s, c, col)) return true;
	return false;
}
