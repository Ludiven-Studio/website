import { describe, it, expect } from 'vitest';
import { cleanName, validateEvent, validateSignup, MAX_NAME, type EventDraft } from './meetupRules';

const NOW = new Date('2026-09-21T12:00:00Z');
const at = (h: number): string => new Date(NOW.getTime() + h * 3600_000).toISOString();

const draft = (over: Partial<EventDraft> = {}): EventDraft => ({
	startsAt: at(26),
	endsAt: at(29),
	format: 'doublette',
	playersNeeded: 4,
	roleNeeded: 'any',
	organizerName: 'Raph',
	organizerSeats: 1,
	...over,
});

describe('cleanName', () => {
	it('keeps a plain first name', () => {
		expect(cleanName('  Jean-Luc  ')).toBe('Jean-Luc');
		expect(cleanName('Marie   Claire')).toBe('Marie Claire');
	});

	it('rejects the two things this field could be abused for', () => {
		// It is the only free text in the product, so it is the only ad surface.
		expect(cleanName('http://spam.fr')).toBeNull();
		expect(cleanName('viens sur www.truc.fr')).toBeNull();
		expect(cleanName('<b>Jo</b>')).toBeNull();
	});

	it('rejects too short and truncates too long', () => {
		expect(cleanName('J')).toBeNull();
		expect(cleanName('')).toBeNull();
		expect(cleanName('a'.repeat(60))).toHaveLength(MAX_NAME);
	});
});

describe('validateEvent', () => {
	it('accepts a normal game', () => {
		expect(validateEvent(draft(), NOW)).toBeNull();
	});

	it('refuses the past and the far future', () => {
		expect(validateEvent(draft({ startsAt: at(-1), endsAt: at(1) }), NOW)).toMatch(/futur/);
		expect(validateEvent(draft({ startsAt: at(61 * 24), endsAt: at(61 * 24 + 2) }), NOW)).toMatch(/60 jours/);
	});

	it('refuses an impossible slot', () => {
		expect(validateEvent(draft({ endsAt: at(25) }), NOW)).toMatch(/après le début/);
		expect(validateEvent(draft({ endsAt: at(39) }), NOW)).toMatch(/12 heures/);
		expect(validateEvent(draft({ startsAt: 'pas une date' }), NOW)).toMatch(/invalide/);
	});

	it('refuses anything off the closed lists', () => {
		expect(validateEvent(draft({ format: 'quadrette' }), NOW)).toMatch(/Format/);
		expect(validateEvent(draft({ playersNeeded: 3 }), NOW)).toMatch(/joueurs/);
		expect(validateEvent(draft({ roleNeeded: 'gardien' }), NOW)).toMatch(/Rôle/);
		expect(validateEvent(draft({ organizerSeats: 0 }), NOW)).toMatch(/places/);
		expect(validateEvent(draft({ organizerSeats: 5 }), NOW)).toMatch(/places/);
	});

	it('refuses an organizer who fills more than the game holds', () => {
		expect(validateEvent(draft({ playersNeeded: 2, organizerSeats: 3 }), NOW)).toMatch(/plus de places/);
	});
});

describe('validateSignup', () => {
	it('accepts and refuses on the same three grounds', () => {
		expect(validateSignup('Léa', 2, 'tireur')).toBeNull();
		expect(validateSignup('L', 2, 'tireur')).toMatch(/Prénom/);
		expect(validateSignup('Léa', 9, 'tireur')).toMatch(/places/);
		expect(validateSignup('Léa', 2, 'milieu')).toMatch(/Rôle/);
	});
});
