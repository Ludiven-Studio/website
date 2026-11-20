import { describe, it, expect } from 'vitest';
import { cleanPlayerName, MAX_NAME } from './names';

// Names other players see on the boards: the site, the function and the apps share this cleaner.
describe('hostile player names', () => {
	it.each([
		'<script>alert(1)</script>',
		'<img src=x onerror=alert(1)>',
		'a>b',
		'https://evil.example',
		'go to www.evil',
		'evil.com',
		'promo.fr now',
	])('blanks %j', (raw) => {
		expect(cleanPlayerName(raw)).toBe('');
	});

	it.each([null, undefined, 42, {}, ['a']])('turns %j into a string without throwing', (raw) => {
		expect(() => cleanPlayerName(raw)).not.toThrow();
		expect(typeof cleanPlayerName(raw)).toBe('string');
	});

	it('cuts a very long name and squeezes its spaces', () => {
		expect(cleanPlayerName('a'.repeat(10_000))).toHaveLength(MAX_NAME);
		expect(cleanPlayerName('  Raph \t\n  Ben  ')).toBe('Raph Ben');
	});

	it('keeps accents and a plain emoji', () => {
		expect(cleanPlayerName('Élodie 🎯')).toBe('Élodie 🎯');
	});

	it('blanks an insult hidden behind digits or capitals', () => {
		expect(cleanPlayerName('C0NN3')).toBe('');
		expect(cleanPlayerName('MÉRDE')).toBe('');
	});

	// Known holes, kept visible. The cleaner lives in supabase/functions/_shared, shared with submit-score:
	// changing it means redeploying that function, which waits for Raphaël.
	it.fails('drops control and direction characters (a right-to-left override flips a row on the board)', () => {
		expect(cleanPlayerName('abc‮dcba')).toBe('abcdcba');
		expect(cleanPlayerName('a\u0000b')).toBe('ab');
	});

	it.fails('blanks an insult spelled one letter at a time', () => {
		expect(cleanPlayerName('m e r d e')).toBe('');
	});

	it.fails('never cuts an emoji in half at the length limit', () => {
		const s = cleanPlayerName('a'.repeat(MAX_NAME - 1) + '🎯');
		expect(/[\uD800-\uDBFF]$/.test(s)).toBe(false);
	});
});
