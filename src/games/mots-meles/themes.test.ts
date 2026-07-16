import { describe, it, expect } from 'vitest';
import { THEMES, normalize } from './engine';
import { COMMON_RAW } from '../words/common';
import { EXTENDED_RAW } from '../words/extended';
import { parseWords } from '../words';

// THEMES ↔ shared-lists consistency: every theme word in the 3-8 range must be a
// known French word, so Méli-Mélo / Mot Secret / Lettres Croisées accept it too.
// A failure here usually means a typo in THEMES — or a legit word to add to
// MUST_INCLUDE in scripts/build-words.mjs (then rerun it).

// Proper nouns are fine as theme words but excluded from the game dictionaries.
const PROPER_THEMES = new Set(['Pays']);
const PROPER_WORDS = new Set(['SATURNE']);

describe('mots-meles themes', () => {
	const dict = new Set([...parseWords(COMMON_RAW), ...parseWords(EXTENDED_RAW)]);

	it('words are pre-normalized (uppercase ASCII)', () => {
		for (const t of THEMES) for (const w of t.words) expect(w, `${t.name}:${w}`).toBe(normalize(w));
	});

	it('every 3-8 letter theme word is in the shared dictionary', () => {
		for (const t of THEMES) {
			if (PROPER_THEMES.has(t.name)) continue;
			for (const w of t.words) {
				if (w.length < 3 || w.length > 8 || PROPER_WORDS.has(w)) continue;
				expect(dict.has(w), `${t.name}:${w} missing — typo, or add it to MUST_INCLUDE in scripts/build-words.mjs`).toBe(true);
			}
		}
	});
});
