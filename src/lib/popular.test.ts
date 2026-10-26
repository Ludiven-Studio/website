import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchPlayRows, rankPlayed } from './popular';

const rows = (...ids: string[]) => ids.map((game_id) => ({ game_id }));

describe('rankPlayed', () => {
	it('ranks by rows and maps a daily logged under <id>-t to its game', () => {
		const ranked = rankPlayed(rows('reines', 'petanque-t', 'petanque-t', 'chemin', 'reines', 'petanque-t'), [
			'chemin',
			'reines',
			'petanque',
		]);
		expect(ranked).toEqual(['petanque', 'reines', 'chemin']);
	});

	it('leaves out games nobody played and ids the catalogue does not know', () => {
		expect(rankPlayed(rows('eclats-inf', 'gone', 'sudoku'), ['sudoku', 'tubes'])).toEqual(['sudoku']);
	});

	it('keeps the catalogue order on a tie', () => {
		expect(rankPlayed(rows('b', 'a', 'c'), ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
	});
});

describe('fetchPlayRows', () => {
	afterEach(() => vi.unstubAllGlobals());

	const reply = (status: number, body: unknown = []) =>
		({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

	it('pages past 1000 rows and stops at the 416 after a full last page', async () => {
		const full = rows(...Array.from({ length: 1000 }, () => 'sudoku'));
		const fetch = vi.fn().mockResolvedValueOnce(reply(200, full)).mockResolvedValueOnce(reply(416));
		vi.stubGlobal('fetch', fetch);
		const got = await fetchPlayRows(30, new Date('2026-10-26T10:00:00Z'));
		expect(got).toHaveLength(1000);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch.mock.calls[0][0]).toContain('challenge_date=gte.2026-09-26');
		expect(fetch.mock.calls[1][0]).toContain('offset=1000');
	});

	it('says null when Supabase cannot be reached', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
		expect(await fetchPlayRows(30)).toBeNull();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(500)));
		expect(await fetchPlayRows(30)).toBeNull();
	});
});
