// deno test supabase/functions/_shared/shotPrizes_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { closing, paidPlaces, prize, rowsFrom } from './shotPrizes.ts';

Deno.test('the prizes are the game\'s table', () => {
	assertEquals([1, 2, 3, 4, 10].map((r) => prize(false, r)), [500, 250, 250, 0, 0]);
	assertEquals([1, 3, 4, 50].map((r) => prize(true, r)), [2000, 1000, 0, 0]);
	assertEquals(prize(false, 0), 0);
	assertEquals([paidPlaces(false), paidPlaces(true)], [3, 3]);
});

Deno.test('the cron\'s day closes the day, and the week on a Sunday', () => {
	assertEquals(closing('2026-11-18', new Date('2026-11-18T23:59:10Z')), [{ board: 'shots_day', week: false, period: '2026-11-18' }]);
	assertEquals(closing('2026-11-22', new Date('2026-11-22T23:59:40Z')), [
		{ board: 'shots_day', week: false, period: '2026-11-22' },
		{ board: 'shots_week', week: true, period: '2026-11-16' },
	]);
});

Deno.test('a call that comes past midnight closes nothing: Unity has reset the rankings', () => {
	assertEquals(closing('2026-11-18', new Date('2026-11-19T00:00:02Z')), null);
	assertEquals(closing('2026-11-18', new Date('2026-11-17T23:59:00Z')), null, 'nor a day to come');
	assertEquals(closing('18/11/2026', new Date('2026-11-18T23:59:00Z')), null, 'nor a malformed day');
});

Deno.test('only paid places with points are kept, and no name', () => {
	const lines = Array.from({ length: 12 }, (_, i) => ({ playerId: 'p' + i, rank: i, score: 46.0302 - i }));
	lines[2].score = 0; // a series of 0 wins nothing
	lines[3].playerId = ''; // no id: skipped
	const rows = rowsFrom(lines, 'shots_day', false, '2026-11-18');
	assertEquals(rows.map((r) => [r.player_id, r.rank, r.score, r.coins]), [['p0', 1, 46, 500], ['p1', 2, 45, 250]]);
	assertEquals(Object.keys(rows[0]).sort(), ['board', 'coins', 'period', 'player_id', 'rank', 'score']);
});

Deno.test('a deleted account\'s line is skipped and the places below move up', () => {
	const rows = rowsFrom([
		{ playerId: 'x', rank: 0, score: 48, metadata: '{"nick":"","gone":"1"}' },
		{ playerId: 'a', rank: 1, score: 40, metadata: '{"nick":"Marcel"}' },
		{ playerId: 'b', rank: 2, score: 30 },
	], 'shots_day', false, '2026-11-18');
	assertEquals(rows.map((r) => [r.player_id, r.rank, r.coins]), [['a', 1, 500], ['b', 2, 250]]);
});
