import { describe, it, expect } from 'vitest';
import { pickSolutionAt, solutionPool, isValidGuess, evaluate, bestKnown, knownGood, DIFFS, type GuessRow } from './engine';
import { EXTENDED_RAW } from '../words/extended';
import { parseWords } from '../words';

const row = (guess: string, solution: string): GuessRow => ({ guess, states: evaluate(guess, solution) });

describe('mot-secret engine', () => {
	it('pickSolutionAt is deterministic and draws from the pool', () => {
		for (const diff of Object.values(DIFFS)) {
			const a = pickSolutionAt(diff.len, 42);
			expect(pickSolutionAt(diff.len, 42)).toBe(a);
			expect(a).toHaveLength(diff.len);
			expect(solutionPool(diff.len)).toContain(a);
		}
		expect(pickSolutionAt(6, 1)).not.toBe(pickSolutionAt(6, 2));
	});

	it('pickSolutionAt never repeats within a pass over the pool', () => {
		for (const len of [6, 7, 8]) {
			const n = solutionPool(len).length;
			const seen = new Set<string>();
			for (let i = 0; i < n; i++) seen.add(pickSolutionAt(len, i));
			expect(seen.size).toBe(n);
		}
	});

	it('solution pools are large', () => {
		for (const len of [6, 7, 8]) expect(solutionPool(len).length).toBeGreaterThanOrEqual(800);
	});

	it('isValidGuess: length, first letter, dictionary', () => {
		const solution = solutionPool(7)[0];
		const wrongLen = solutionPool(6)[0];
		expect(isValidGuess(wrongLen, solution)).toEqual({ ok: false, reason: 'length' });
		const otherFirst = solutionPool(7).find((w) => w[0] !== solution[0])!;
		expect(isValidGuess(otherFirst, solution)).toEqual({ ok: false, reason: 'first' });
		expect(isValidGuess(solution[0] + 'ZZZQQX'.slice(0, 6), solution)).toEqual({ ok: false, reason: 'dict' });
		expect(isValidGuess(solution, solution)).toEqual({ ok: true });
		// an EXTENDED word with the same first letter + length is accepted as a guess
		const ext = parseWords(EXTENDED_RAW).find((w) => w.length === 7 && w[0] === solution[0]);
		if (ext) expect(isValidGuess(ext, solution)).toEqual({ ok: true });
	});

	it('evaluate: basic good/present/absent', () => {
		expect(evaluate('POMME', 'POMME')).toEqual(['good', 'good', 'good', 'good', 'good']);
		expect(evaluate('PORTE', 'POMME')).toEqual(['good', 'good', 'absent', 'absent', 'good']);
	});

	it('evaluate: duplicate letters use two-pass counting', () => {
		// one M is good; the guess's other M matches the one M left in the solution
		expect(evaluate('MOMIE', 'POMME')).toEqual(['present', 'good', 'good', 'absent', 'good']);
		// guess has more duplicates than the solution
		expect(evaluate('EEE', 'ETE')).toEqual(['good', 'absent', 'good']);
		expect(evaluate('SEES', 'ESSE')).toEqual(['present', 'present', 'present', 'present']);
	});

	it('bestKnown: good beats present, never downgraded', () => {
		const solution = 'POMME';
		const known = bestKnown([row('MOMIE', solution), row('MELON', solution)]);
		expect(known['M']).toBe('good'); // good at index 2 in MOMIE wins over M present in MELON
		expect(known['O']).toBe('good');
		expect(known['L']).toBe('absent');
	});

	it('knownGood accumulates across rows and pins the first letter', () => {
		const solution = 'POMME';
		expect(knownGood([], 5, 'P')).toEqual(['P', null, null, null, null]);
		const rows = [row('PORTE', solution), row('POMPE', solution)];
		expect(knownGood(rows, 5, 'P')).toEqual(['P', 'O', 'M', null, 'E']);
	});
});
