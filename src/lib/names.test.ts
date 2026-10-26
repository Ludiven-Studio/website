import { describe, expect, it } from 'vitest';
import { cleanPlayerName, isOffensive } from './names';

describe('the leaderboards name filter', () => {
	it('refuses insults in the five EFIGS languages, disguised or not', () => {
		for (const name of ['Connard', 'c0nnard', 'FUCK you', 'f.u.c.k', 'Hijo de puta', 'gilipollas', 'Arschloch', 'Hurensohn', 'Vaffanculo', 'stronzo', 'merda', 'pute', 'P*ta mierda']) {
			expect(isOffensive(name), name).toBe(true);
		}
	});

	it('keeps names that only contain a short word', () => {
		for (const name of ['Constance', 'Hercule', 'Marsch', 'Cocktail', 'Assassin', 'Therapist', 'Dickens', 'Dragon1234', 'Bijou', 'Raph', 'Jéjay']) {
			expect(isOffensive(name), name).toBe(false);
		}
	});

	it('shows a refused name as no name', () => {
		expect(cleanPlayerName('  Salope  ')).toBe('');
		expect(cleanPlayerName('www.spam.com')).toBe('');
		expect(cleanPlayerName('<b>x</b>')).toBe('');
		expect(cleanPlayerName('  Bijou   le dragon ')).toBe('Bijou le dragon');
		expect(cleanPlayerName('a'.repeat(30))).toHaveLength(20);
	});
});
