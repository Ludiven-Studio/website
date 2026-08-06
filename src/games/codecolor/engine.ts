/**
 * CODECOLOR — Mastermind-like (pure engine, no UI).
 * Guess a hidden code of DISTINCT colour pegs. After each guess two counts are returned:
 * `exact` (right colour + right position) and `partial` (right colour, wrong position).
 * The code is deterministic from a seeded Rng (daily).
 */

import type { Rng } from '../prng';

export interface Level {
	label: string;
	slots: number; // code length
	colors: number; // palette size used (always >= slots)
	tries: number; // max guesses — high (30) so it's effectively "solve it, no pressure"
}

export const LEVELS: Record<string, Level> = {
	facile: { label: 'Facile', slots: 4, colors: 6, tries: 30 },
	moyen: { label: 'Moyen', slots: 5, colors: 7, tries: 30 },
	difficile: { label: 'Difficile', slots: 6, colors: 8, tries: 30 },
	// The palette stops at 8 hues, so Expert widens the code instead: 7 of the 8 colours.
	expert: { label: 'Expert', slots: 7, colors: 8, tries: 30 },
};

export interface Feedback {
	exact: number; // bien placés (right colour + position)
	partial: number; // présents (right colour, wrong position)
}

export interface MasterPuzzle {
	slots: number;
	colors: number;
	tries: number;
	code: number[]; // distinct colour indices 0..colors-1
}

/** Random code of `slots` DISTINCT colour indices (shuffle 0..colors-1, take slots). Deterministic from rng. */
export function generateCode(level: Level, rng: Rng = Math.random): number[] {
	const pool = Array.from({ length: level.colors }, (_, i) => i);
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, level.slots);
}

export function generatePuzzle(level: Level, rng: Rng = Math.random): MasterPuzzle {
	return { slots: level.slots, colors: level.colors, tries: level.tries, code: generateCode(level, rng) };
}

/**
 * Mastermind scoring (generic, handles repeats too): `exact` = positions matching;
 * `partial` = additional colour matches out of position = Σ_colour min(#code, #guess) over non-exact positions.
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

// ----------------------------------------------------------------------------------------------
// Hints — a deduction the player can use, never a peg of the secret.
// ----------------------------------------------------------------------------------------------

/** Palette labels, shared with the UI so a hint can name a colour. */
export const COLOR_NAMES = ['Rouge', 'Orange', 'Jaune', 'Vert', 'Cyan', 'Bleu', 'Violet', 'Rose'];

// Feminine form: every hint sentence is built on "la couleur …".
const COLOR_ADJ = ['rouge', 'orange', 'jaune', 'verte', 'cyan', 'bleue', 'violette', 'rose'];

export interface GuessRow {
	guess: number[];
	fb: Feedback;
}

export type HintKind = 'color-out' | 'slot-out' | 'count' | 'tip';

export interface HintResult {
	kind: HintKind;
	key: string; // identifies the fact, so the caller can ask for a different one next time
	reason: string;
	color?: number;
	slot?: number;
	count?: number;
}

/**
 * Every distinct-colour code still consistent with the feedback of each past guess.
 * Brute force is fine here: the palette caps at 8 colours and 7 slots → P(8,7) = 40320 codes.
 */
export function consistentCodes(slots: number, colors: number, rows: GuessRow[]): number[][] {
	const out: number[][] = [];
	const cur = new Array<number>(slots);
	const used = new Array<boolean>(colors).fill(false);
	const walk = (i: number): void => {
		if (i === slots) {
			for (const r of rows) {
				const fb = score(cur, r.guess);
				if (fb.exact !== r.fb.exact || fb.partial !== r.fb.partial) return;
			}
			out.push(cur.slice());
			return;
		}
		for (let c = 0; c < colors; c++) {
			if (used[c]) continue;
			used[c] = true;
			cur[i] = c;
			walk(i + 1);
			used[c] = false;
		}
	};
	walk(0);
	return out;
}

/**
 * One deduction drawn from the feedback so far — never a peg of the secret.
 * Tiers: a colour that no consistent code contains → a (colour, slot) pair no consistent code
 * uses → how many codes are left. `seen` holds the keys already handed out, so asking again
 * gives a new fact. Falls back to a neutral tip only when nothing can be deduced yet.
 */
export function findHint(
	slots: number,
	colors: number,
	rows: GuessRow[],
	seen: ReadonlySet<string> = new Set(),
): HintResult {
	const named = (c: number): string => COLOR_ADJ[c] ?? COLOR_NAMES[c] ?? `n°${c + 1}`;

	if (!rows.length)
		return {
			kind: 'tip',
			key: 'tip',
			reason: `Aucun retour pour l'instant : pose un premier essai de ${slots} couleurs, les déductions viendront de ses deux compteurs.`,
		};

	const codes = consistentCodes(slots, colors, rows);
	if (!codes.length)
		return { kind: 'tip', key: 'tip', reason: `Plus aucun code ne colle : relis les compteurs, un essai a dû être mal lu.` };

	const anywhere = new Array<boolean>(colors).fill(false);
	const atSlot: boolean[][] = Array.from({ length: slots }, () => new Array<boolean>(colors).fill(false));
	for (const code of codes)
		for (let i = 0; i < slots; i++) {
			anywhere[code[i]] = true;
			atSlot[i][code[i]] = true;
		}

	for (let c = 0; c < colors; c++) {
		const key = `c:${c}`;
		if (anywhere[c] || seen.has(key)) continue;
		return {
			kind: 'color-out',
			key,
			color: c,
			reason: `La couleur ${named(c)} n'apparaît dans aucun code compatible avec tes essais : écarte-la.`,
		};
	}

	for (let i = 0; i < slots; i++)
		for (let c = 0; c < colors; c++) {
			const key = `s:${i}:${c}`;
			if (atSlot[i][c] || seen.has(key)) continue;
			return {
				kind: 'slot-out',
				key,
				color: c,
				slot: i,
				reason: `Aucun code compatible ne place la couleur ${named(c)} en case ${i + 1}.`,
			};
		}

	return {
		kind: 'count',
		key: `n:${codes.length}`,
		count: codes.length,
		reason:
			codes.length === 1
				? `Un seul code reste compatible avec tes essais : tes retours suffisent à le déduire.`
				: `Il reste ${codes.length} codes compatibles avec tes essais.`,
	};
}
