// deno test supabase/functions/_shared/shotPrizes_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { bounds, claimSince, closing, endedPeriods, LAST_READ_MS, openPeriods, paidPlaces, prize, readable, rowsFrom } from './shotPrizes.ts';

Deno.test('the prizes are the game\'s table', () => {
	assertEquals([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((r) => prize(false, r)), [500, 300, 200, 150, 125, 100, 90, 80, 70, 60, 0]);
	assertEquals([1, 2, 3, 4, 10, 11, 20, 21, 50, 51].map((r) => prize(true, r)), [2000, 1200, 800, 400, 400, 200, 200, 100, 100, 0]);
	assertEquals(prize(false, 0), 0);
	assertEquals([paidPlaces(false), paidPlaces(true)], [10, 50]);
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
	assertEquals(rows.map((r) => [r.player_id, r.rank, r.score, r.coins]), [
		['p0', 1, 46, 500], ['p1', 2, 45, 300], ['p4', 4, 42, 150], ['p5', 5, 41, 125], ['p6', 6, 40, 100],
		['p7', 7, 39, 90], ['p8', 8, 38, 80], ['p9', 9, 37, 70], ['p10', 10, 36, 60],
	]);
	assertEquals(Object.keys(rows[0]).sort(), ['board', 'coins', 'period', 'player_id', 'rank', 'score']);
});

Deno.test('a deleted account\'s line is skipped and the places below move up', () => {
	const rows = rowsFrom([
		{ playerId: 'x', rank: 0, score: 48, metadata: '{"nick":"","gone":"1"}' },
		{ playerId: 'a', rank: 1, score: 40, metadata: '{"nick":"Marcel"}' },
		{ playerId: 'b', rank: 2, score: 30 },
	], 'shots_day', false, '2026-11-18');
	assertEquals(rows.map((r) => [r.player_id, r.rank, r.coins]), [['a', 1, 500], ['b', 2, 300]]);
});

Deno.test('the last reading is 10 s before the reset, and none past it stands for the period', () => {
	const day = bounds(false, '2026-11-22');
	assertEquals([new Date(day.start).toISOString(), new Date(day.end).toISOString()], ['2026-11-22T00:00:00.000Z', '2026-11-23T00:00:00.000Z']);
	assertEquals(new Date(bounds(true, '2026-11-16').end).toISOString(), '2026-11-23T00:00:00.000Z', 'the week ends with Sunday');
	const t = (s: string) => Date.parse(s);
	assertEquals(new Date(day.end - LAST_READ_MS).toISOString(), '2026-11-22T23:59:50.000Z');
	assertEquals(readable(false, '2026-11-22', t('2026-11-22T23:59:50Z')), true);
	assertEquals(readable(true, '2026-11-16', t('2026-11-22T23:59:57.9Z')), true);
	assertEquals(readable(false, '2026-11-22', t('2026-11-22T23:59:58Z')), false, 'too near the reset');
	assertEquals(readable(false, '2026-11-22', t('2026-11-23T00:00:01Z')), false, 'after the reset');
	assertEquals(readable(false, '2026-11-22', t('2026-11-21T23:59:59Z')), false, 'before the day');
	assertEquals(readable(false, '2026-11-23', t('2026-11-23T00:03:00Z')), false, 'Unity may not have reset yet');
	assertEquals(readable(true, '2026-11-23', t('2026-11-23T00:07:00Z')), true);
});

Deno.test('the drafts read the running day and week', () => {
	const at = (s: string) => openPeriods(new Date(s)).map((p) => `${p.board}:${p.period}`);
	assertEquals(at('2026-11-19T10:07:00Z'), ['shots_day:2026-11-19', 'shots_week:2026-11-16']);
	assertEquals(at('2026-11-22T23:52:00Z'), ['shots_day:2026-11-22', 'shots_week:2026-11-16'], 'Sunday ends the week');
	assertEquals(at('2026-11-23T00:07:00Z'), ['shots_day:2026-11-23', 'shots_week:2026-11-23']);
});

Deno.test('a run catches up every period that ended in the last 8 days, each board on its own', () => {
	const ended = (s: string) => endedPeriods(new Date(s)).map((p) => `${p.board}:${p.period}`);
	// Monday 00:07 after a lost Sunday snapshot: the day and the week both come back.
	const monday = ended('2026-11-23T00:07:00Z');
	assertEquals(monday.includes('shots_day:2026-11-22') && monday.includes('shots_week:2026-11-16'), true);
	assertEquals(monday.includes('shots_day:2026-11-23') || monday.includes('shots_week:2026-11-23'), false, 'nothing still running');
	assertEquals(monday.filter((p) => p.startsWith('shots_day'))[0], 'shots_day:2026-11-17', 'nothing before the first snapshot');
	const later = ended('2026-12-10T12:00:00Z');
	assertEquals(later.filter((p) => p.startsWith('shots_day')).length, 8);
	assertEquals(later.filter((p) => p.startsWith('shots_week')), ['shots_week:2026-11-30']);
	assertEquals(ended('2026-11-17T12:00:00Z'), []);
});

Deno.test('a prize stays claimable as long as it is kept: 30 days from when it was paid', () => {
	assertEquals(claimSince(Date.parse('2026-12-20T09:00:00Z')), '2026-11-20T09:00:00.000Z');
	// A week from 16/11, paid on 23/11 at midnight, is still claimed on 20/12 (the former 15 days by period start dropped it on 02/12).
	assertEquals(claimSince(Date.parse('2026-12-20T09:00:00Z')) <= '2026-11-23T00:00:00.000Z', true);
});
