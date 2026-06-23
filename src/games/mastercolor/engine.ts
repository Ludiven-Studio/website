/**
 * MASTER COLOR — Mastermind-like (pure engine, no UI).
 * Guess a hidden code of colour pegs. After each guess two counts are returned:
 * `exact` (right colour + right position) and `partial` (right colour, wrong position).
 * Repeats are allowed in the code. The code is deterministic from a seeded Rng (daily).
 */

import type { Rng } from '../prng';

export interface Level {
	label: string;
	slots: number; // code length
	colors: number; // palette size used
	tries: number; // max guesses
}

export const LEVELS: Record<string, Level> = {
	facile: { label: 'Facile', slots: 4, colors: 6, tries: 10 },
	moyen: { label: 'Moyen', slots: 5, colors: 7, tries: 11 },
	difficile: { label: 'Difficile', slots: 5, colors: 8, tries: 12 },
};

export interface Feedback {
	exact: number; // bien placés (right colour + position)
	partial: number; // présents (right colour, wrong position)
}

export interface MasterPuzzle {
	slots: number;
	colors: number;
	tries: number;
	code: number[]; // colour index 0..colors-1 per slot
}

/** Random code of `slots` colour indices in 0..colors-1 (repeats allowed). Deterministic from rng. */
export function generateCode(level: Level, rng: Rng = Math.random): number[] {
	const code: number[] = [];
	for (let i = 0; i < level.slots; i++) code.push(Math.floor(rng() * level.colors));
	return code;
}

export function generatePuzzle(level: Level, rng: Rng = Math.random): MasterPuzzle {
	return { slots: level.slots, colors: level.colors, tries: level.tries, code: generateCode(level, rng) };
}

/**
 * Mastermind scoring (handles repeats): `exact` = positions matching; `partial` = additional
 * colour matches out of position = Σ_colour min(#code, #guess) over non-exact positions.
 */
export function score(code: number[], guess: number[]): Feedback {
	const codeLeft: Record<number, number> = {};
	const guessLeft: Record<number, number> = {};
	let exact = 0;
	for (let i = 0; i < code.length; i++) {
		if (code[i] === guess[i]) {
			exact++;
		} else {
			codeLeft[code[i]] = (codeLeft[code[i]] ?? 0) + 1;
			guessLeft[guess[i]] = (guessLeft[guess[i]] ?? 0) + 1;
		}
	}
	let partial = 0;
	for (const k in guessLeft) partial += Math.min(guessLeft[k], codeLeft[k] ?? 0);
	return { exact, partial };
}

/** Solved when every peg is exact. */
export function isWin(fb: Feedback, slots: number): boolean {
	return fb.exact === slots;
}
