// deno test supabase/functions/_shared/shotPrizes_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { closing, paidPlaces, prize, rowsFrom } from './shotPrizes.ts';

Deno.test('the prizes are the game\'s table', () => {
	assertEquals([1, 2, 3, 4, 10, 11].map((r) => prize(false, r)), [300, 150, 150, 75, 75, 0]);
	assertEquals([1, 3, 4, 11, 50, 51].map((r) => prize(true, r)), [1500, 800, 300, 100, 100, 0]);
	assertEquals(prize(false, 0), 0);
	assertEquals([paidPlaces(false), paidPlaces(true)], [10, 50]);
});

Deno.test('a run before midnight closes the day, and the week on a Sunday', () => {
	assertEquals(closing(new Date('2026-11-18T23:59:10Z')), [{ board: 'shots_day', week: false, period: '2026-11-18' }]);
	assertEquals(closing(new Date('2026-11-22T23:59:10Z')), [
		{ board: 'shots_day', week: false, period: '2026-11-22' },
		{ board: 'shots_week', week: true, period: '2026-11-16' },
	]);
});

Deno.test('only paid places with points are kept, and no name', () => {
	const rows = rowsFrom([
		{ playerId: 'a', rank: 0, score: 46.0302 },
		{ playerId: 'b', rank: 1, score: 31.01 },
		{ playerId: 'c', rank: 9, score: 12 },
		{ playerId: 'd', rank: 10, score: 11 },
		{ playerId: 'e', rank: 2, score: 0 },
		{ playerId: '', rank: 3, score: 9 },
	], 'shots_day', false, '2026-11-18');
	assertEquals(rows, [
		{ board: 'shots_day', period: '2026-11-18', player_id: 'a', rank: 1, score: 46, coins: 300 },
		{ board: 'shots_day', period: '2026-11-18', player_id: 'b', rank: 2, score: 31, coins: 150 },
		{ board: 'shots_day', period: '2026-11-18', player_id: 'c', rank: 10, score: 12, coins: 75 },
	]);
});
