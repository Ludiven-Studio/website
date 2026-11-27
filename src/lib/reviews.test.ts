import { describe, expect, it } from 'vitest';
import { playProblem, ratingOf, reviewTile, starLabel, studioAverage } from './reviews';
import type { Review, Reviews } from './statsAdmin';

const NOW = new Date('2026-11-27T12:00:00Z');
const rating = (app: string, store: 'appstore' | 'play', average: number | null, count: number, live = true) => ({ app, store, live, average, count, countries: [], version: '', url: '' });
const review = (app: string, at: string, stars: number, reply: string | null = null): Review =>
	({ app, store: 'play', stars, at, title: '', text: 'texte', lang: 'fr', version: '1.0.0', reply, replyAt: null, link: '' });
const DATA: Reviews = {
	generatedAt: NOW.toISOString(), play: 'ok', errors: [],
	apps: [
		{ app: 'nino-rush', name: 'Nino Rush', stores: [rating('nino-rush', 'appstore', 4.5, 6), rating('nino-rush', 'play', 4, 4)], last30: { average: 4, count: 2 } },
		{ app: 'petanque-meet', name: 'Pétanque Meet', stores: [rating('petanque-meet', 'appstore', null, 0, false), rating('petanque-meet', 'play', null, 0)], last30: { average: null, count: 0 } },
	],
	reviews: [review('nino-rush', '2026-11-26T09:00:00Z', 2), review('nino-rush', '2026-11-25T09:00:00Z', 1, 'Merci'), review('nino-rush', '2026-11-01T09:00:00Z', 5)],
};

describe('the stores ratings on the admin pages', () => {
	it('writes a rating, none yet, or not in that store', () => {
		expect(starLabel(rating('a', 'play', 4.25, 1234))).toBe('★ 4,3 (1\u202f234)');
		expect(starLabel(rating('a', 'play', null, 0))).toBe('aucune note');
		expect(starLabel(rating('a', 'appstore', null, 0, false))).toBe('–');
		expect(starLabel(undefined)).toBe('–');
	});

	it('weighs every store by its count and finds a board app by key or name', () => {
		expect(studioAverage(DATA)).toEqual({ average: 4.3, count: 10 });
		expect(ratingOf(DATA, 'appstore', 'nino-rush')?.count).toBe(6);
		expect(ratingOf(DATA, 'play', undefined, 'Nino Rush')?.average).toBe(4);
		expect(ratingOf(null, 'play', 'nino-rush')).toBeUndefined();
	});

	it('gives the home tile the figure, the count and the low reviews left without a reply', () => {
		expect(reviewTile(DATA, NOW)).toEqual({ figure: '★ 4,3', lines: ['10 notes, tous stores et applis', '2 avis Google sur 7 jours, dont 1 à 1 ou 2 étoiles sans réponse'] });
		const closed = reviewTile({ ...DATA, play: 'closed', reviews: [] }, NOW);
		expect(closed.lines[1]).toBe('Google Play : accès pas encore ouvert');
		expect(playProblem('ok')).toBeNull();
	});
});
