import { describe, it, expect } from 'vitest';
import { buildIcs, icsDate } from './meetupIcs';

const base = {
	uid: 'abc-123@ludiven-studio.fr',
	startsAt: '2026-09-26T16:30:00.000Z',
	endsAt: '2026-09-26T19:00:00.000Z',
	summary: 'Pétanque — doublette',
	location: 'Saint-Jean-de-Bournay — Place de la Mairie',
	description: 'Doublette, 4 joueurs',
	url: 'https://www.ludiven-studio.fr/rencontres/?e=abc-123',
	stamp: new Date('2026-09-21T12:00:00.000Z'),
};

describe('icsDate', () => {
	it('is UTC basic format', () => {
		expect(icsDate('2026-09-26T16:30:00.000Z')).toBe('20260926T163000Z');
	});
});

describe('buildIcs', () => {
	it('produces a single CRLF-terminated VEVENT', () => {
		const ics = buildIcs(base);
		expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(ics.split('BEGIN:VEVENT')).toHaveLength(2);
		expect(ics).toContain('DTSTART:20260926T163000Z');
		expect(ics).toContain('DTEND:20260926T190000Z');
		expect(ics).toContain('DTSTAMP:20260921T120000Z');
		expect(ics).toContain('UID:abc-123@ludiven-studio.fr');
	});

	it('escapes the characters that would end a property early', () => {
		const ics = buildIcs({ ...base, description: 'a; b, c\\d\ne' });
		expect(ics).toContain('DESCRIPTION:a\\; b\\, c\\\\d\\ne');
		// The backslash must be escaped first or it would double-escape its own output.
		expect(ics).not.toContain('c\\d');
	});

	it('folds long lines to 75 octets without splitting a character', () => {
		const ics = buildIcs({ ...base, location: 'Éé'.repeat(60) });
		const lines = ics.split('\r\n');
		for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
		// Continuations are the folded ones; unfolding must give the text back.
		const unfolded = ics.replace(/\r\n /g, '');
		expect(unfolded).toContain(`LOCATION:${'Éé'.repeat(60)}`);
	});

	it('leaves a short accented line alone', () => {
		const ics = buildIcs({ ...base, description: 'Mêlée' });
		expect(ics).toContain('\r\nDESCRIPTION:Mêlée\r\n');
	});
});
