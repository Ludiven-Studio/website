/**
 * MOT SECRET — pure engine (no UI). Motus-like: guess a hidden French word in 6 tries;
 * the first letter is revealed and every guess must start with it. Feedback per letter:
 * good (right spot) / present (elsewhere) / absent, with standard two-pass duplicate
 * counting. Solutions come from the COMMON tier; guesses accept COMMON ∪ EXTENDED.
 */

import { mulberry32 } from '../prng';
import { COMMON_RAW } from '../words/common';
import { EXTENDED_RAW } from '../words/extended';
import { parseWords, byLength, mergeSorted, hasWord } from '../words';

export type LetterState = 'good' | 'present' | 'absent';
export interface GuessRow { guess: string; states: LetterState[]; }

export interface DiffLevel { label: string; len: number; }
export const DIFFS: Record<string, DiffLevel> = {
	facile: { label: 'Facile', len: 6 },
	moyen: { label: 'Moyen', len: 7 },
	difficile: { label: 'Difficile', len: 8 },
};

export const MAX_TRIES = 6;

const COMMON = parseWords(COMMON_RAW);
const ALL = mergeSorted(COMMON, parseWords(EXTENDED_RAW));
const pools = new Map<number, string[]>();

/** COMMON words of exactly `len` letters (memoized) — the solution pool. */
export function solutionPool(len: number): string[] {
	let p = pools.get(len);
	if (!p) { p = byLength(COMMON, len, len); pools.set(len, p); }
	return p;
}

/** Deterministic solution for a seed + length. */
export function pickSolution(seed: number, len: number): string {
	const pool = solutionPool(len);
	return pool[Math.floor(mulberry32(seed)() * pool.length)];
}

export type GuessCheck = { ok: true } | { ok: false; reason: 'length' | 'first' | 'dict' };

export function isValidGuess(guess: string, solution: string): GuessCheck {
	if (guess.length !== solution.length) return { ok: false, reason: 'length' };
	if (guess[0] !== solution[0]) return { ok: false, reason: 'first' };
	if (!hasWord(ALL, guess)) return { ok: false, reason: 'dict' };
	return { ok: true };
}

/** Two-pass evaluation: goods first, then presents while unmatched letters remain. */
export function evaluate(guess: string, solution: string): LetterState[] {
	const states: LetterState[] = new Array(guess.length).fill('absent');
	const left = new Map<string, number>();
	for (let i = 0; i < guess.length; i++) {
		if (guess[i] === solution[i]) states[i] = 'good';
		else left.set(solution[i], (left.get(solution[i]) ?? 0) + 1);
	}
	for (let i = 0; i < guess.length; i++) {
		if (states[i] === 'good') continue;
		const n = left.get(guess[i]) ?? 0;
		if (n > 0) { states[i] = 'present'; left.set(guess[i], n - 1); }
	}
	return states;
}

/** Best-known state per letter across all rows (good > present > absent) — keyboard tinting. */
export function bestKnown(rows: GuessRow[]): Record<string, LetterState> {
	const rank: Record<LetterState, number> = { absent: 0, present: 1, good: 2 };
	const out: Record<string, LetterState> = {};
	for (const row of rows) {
		for (let i = 0; i < row.guess.length; i++) {
			const ch = row.guess[i], st = row.states[i];
			if (out[ch] == null || rank[st] > rank[out[ch]]) out[ch] = st;
		}
	}
	return out;
}

/** Letters confirmed at their position so far (row pre-fill hints); index 0 is the revealed first letter. */
export function knownGood(rows: GuessRow[], len: number, first: string): (string | null)[] {
	const out: (string | null)[] = new Array(len).fill(null);
	out[0] = first;
	for (const row of rows) for (let i = 0; i < len; i++) if (row.states[i] === 'good') out[i] = row.guess[i];
	return out;
}
