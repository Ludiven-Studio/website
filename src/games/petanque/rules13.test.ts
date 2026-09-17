import { describe, it, expect } from 'vitest';
import {
	initMatch13, applyJack, applyPlacedJack, applySettled, finishEnd,
	jackCheck, pointHolder, endScore, whoPlays, nextCircle, other,
	MIN_JACK, MAX_JACK, EDGE, BOULES_PER_SIDE, type Match13, type Played, type Side,
} from './rules13';
import { PITCH_L } from './terrain';

const at = (x: number, y: number, side: number): Played => ({ x, y, side, live: true });
const jackAt = (x: number, y: number): Played => ({ x, y, side: -1, live: true });

describe('the jack', () => {
	const circle = { x: 2, y: 1 };

	it('must land between 6 and 10 m and off the limits', () => {
		expect(jackCheck(circle, { x: 2, y: 1 + MIN_JACK + 1 })).toBe('ok');
		expect(jackCheck(circle, { x: 2, y: 1 + MIN_JACK - 0.2 })).toBe('short');
		expect(jackCheck(circle, { x: 2, y: 1 + MAX_JACK + 0.2 })).toBe('long');
		expect(jackCheck(circle, { x: 2, y: PITCH_L + 1 })).toBe('out');
		expect(jackCheck(circle, { x: 2, y: PITCH_L - EDGE / 2 })).toBe('out'); // inside, but hugging the line
	});

	it('an invalid jack hands the placing to the opponent, not the throw', () => {
		const m = initMatch13(13, 0);
		const bad = applyJack(m, { x: 2, y: 2 });
		expect(bad.phase).toBe('place-jack');
		expect(bad.turn).toBe(1); // the opponent places it
		// ...but the thrower still plays the first boule of the end.
		expect(applyPlacedJack(bad).turn).toBe(0);
		expect(applyPlacedJack(bad).phase).toBe('play');
	});
});

describe('the point', () => {
	const j = jackAt(2, 8);

	it('goes to the closest live boule', () => {
		expect(pointHolder([at(2, 8.3, 0), at(2, 8.6, 1)], j)).toBe(0);
		expect(pointHolder([at(2, 8.9, 0), at(2, 8.2, 1)], j)).toBe(1);
		expect(pointHolder([], j)).toBe(null);
	});

	it('ignores a boule that left the pitch', () => {
		const dead = { ...at(2, 8.1, 1), live: false };
		expect(pointHolder([at(2, 8.5, 0), dead], j)).toBe(0);
	});

	it('calls equal distances a tie', () => {
		expect(pointHolder([at(2, 8.4, 0), at(2, 7.6, 1)], j)).toBe('tie');
	});
});

describe('who plays next — the rule that makes the game', () => {
	const j = jackAt(2, 8);
	const state = (turn: Side, left: [number, number]): Match13 =>
		({ ...initMatch13(13, 0), phase: 'play', turn, left });

	it('the side WITHOUT the point plays', () => {
		expect(whoPlays(state(0, [2, 3]), [at(2, 8.2, 0)], j)).toBe(1);
		expect(whoPlays(state(1, [3, 2]), [at(2, 8.2, 1)], j)).toBe(0);
	});

	it('lets one side throw three in a row while it keeps losing the point', () => {
		let m: Match13 = { ...initMatch13(13, 0), phase: 'play', turn: 0, left: [3, 3] };
		const bs: Played[] = [];
		// 0 points first and holds it, so 1 must keep coming back.
		bs.push(at(2, 8.1, 0));
		m = applySettled(m, bs, j);
		expect(m.turn).toBe(1);
		for (const y of [8.7, 8.5, 8.3]) {
			bs.push(at(2, y, 1));
			m = applySettled(m, bs, j);
		}
		expect(m.left).toEqual([2, 0]); // side 1 emptied its hand without ever taking the point
		expect(m.turn).toBe(0); // now side 0 plays out the rest
	});

	it('falls back to the other side when the one without the point is empty', () => {
		expect(whoPlays(state(0, [2, 0]), [at(2, 8.2, 0)], j)).toBe(0);
		expect(whoPlays(state(0, [0, 0]), [at(2, 8.2, 0)], j)).toBe(null);
	});

	it('on a tie the side that just played replays', () => {
		expect(whoPlays(state(1, [3, 3]), [at(2, 8.4, 0), at(2, 7.6, 1)], j)).toBe(1);
	});

	it('the first boule of the end goes to whoever threw the jack', () => {
		expect(whoPlays({ ...state(1, [3, 3]), jackThrower: 1 }, [], j)).toBe(1);
	});
});

describe('scoring an end', () => {
	const j = jackAt(2, 8);

	it('counts every boule closer than the opponent’s best', () => {
		const bs = [at(2, 8.1, 0), at(2, 8.2, 0), at(2, 8.9, 0), at(2, 8.5, 1)];
		expect(endScore(bs, j)).toEqual({ side: 0, points: 2 });
	});

	it('a clean sweep is worth every boule', () => {
		const bs = [at(2, 8.1, 0), at(2, 8.2, 0), at(2, 8.3, 0)];
		expect(endScore(bs, j)).toEqual({ side: 0, points: 3 });
	});

	it('equal closest boules make a null end', () => {
		expect(endScore([at(2, 8.4, 0), at(2, 7.6, 1)], j).side).toBe(null);
	});

	it('a jack knocked out kills the end and it is replayed by the same thrower', () => {
		const m: Match13 = { ...initMatch13(13, 0), phase: 'play', turn: 0, left: [1, 2] };
		const dead = { ...jackAt(2, 8), live: false };
		const after = applySettled(m, [at(2, 8.1, 0)], dead);
		expect(after.phase).toBe('end-done');
		const next = finishEnd(after, [at(2, 8.1, 0)], dead);
		expect(next.scores).toEqual([0, 0]);
		expect(next.jackThrower).toBe(0);
		expect(next.endNo).toBe(2);
		expect(next.left).toEqual([BOULES_PER_SIDE, BOULES_PER_SIDE]);
	});
});

describe('the match', () => {
	it('the winner of the end throws the next jack, from where the jack lay, the other way', () => {
		const m: Match13 = { ...initMatch13(13, 0), phase: 'end-done', left: [0, 0], dir: 1 };
		const j = jackAt(2.4, 8);
		const next = finishEnd(m, [at(2, 8.1, 1), at(2, 8.6, 0)], j);
		expect(next.scores).toEqual([0, 1]);
		expect(next.jackThrower).toBe(1);
		expect(next.dir).toBe(-1);
		expect(next.circle.x).toBeCloseTo(2.4, 6);
		expect(next.phase).toBe('throw-jack');
	});

	it('keeps the circle far enough from the end line for a 6 m throw', () => {
		expect(nextCircle(14.9, 1)).toBeLessThanOrEqual(PITCH_L - EDGE - MIN_JACK);
		expect(nextCircle(0.1, -1)).toBeGreaterThanOrEqual(EDGE + MIN_JACK);
		expect(nextCircle(4, 1)).toBeCloseTo(4, 6); // already fine, left alone
	});

	it('first to the target wins and the match stops', () => {
		const m: Match13 = { ...initMatch13(13, 0), scores: [11, 5], phase: 'end-done', left: [0, 0] };
		const j = jackAt(2, 8);
		const next = finishEnd(m, [at(2, 8.1, 0), at(2, 8.2, 0), at(2, 8.9, 1)], j);
		expect(next.scores).toEqual([13, 5]);
		expect(next.phase).toBe('match-done');
		expect(next.winner).toBe(0);
	});

	it('a short game stops at 7', () => {
		const m: Match13 = { ...initMatch13(7, 0), scores: [5, 3], phase: 'end-done', left: [0, 0] };
		const next = finishEnd(m, [at(2, 8.1, 0), at(2, 8.2, 0), at(2, 8.9, 1)], jackAt(2, 8));
		expect(next.winner).toBe(0);
	});

	// One end, start to finish, checking the alternation is the official one at every boule.
	it('plays a whole end and hands out the right score', () => {
		let m = initMatch13(13, 0);
		const j = jackAt(2, 7.5);
		m = applyJack(m, j);
		expect(m.phase).toBe('play');
		expect(m.turn).toBe(0);

		// (thrower, distance) — each boule is played by whoever the rules just named.
		const plays: [Side, number][] = [];
		const bs: Played[] = [];
		const ys = [7.9, 7.7, 8.4, 7.6, 9.2, 8.1];
		for (const y of ys) {
			expect(m.phase).toBe('play');
			plays.push([m.turn, y]);
			bs.push(at(2, y, m.turn));
			m = applySettled(m, bs, j);
		}
		expect(m.phase).toBe('end-done');
		expect(m.left).toEqual([0, 0]);
		// The order is the whole point — counting 3 each would pass no matter what, since the
		// hands are what they are. Side 0 replays at step 3 (still behind), side 1 at step 5.
		expect(plays.map((p) => p[0])).toEqual([0, 1, 0, 0, 1, 1]);

		const res = endScore(bs, j);
		const final = finishEnd(m, bs, j);
		expect(res.side).not.toBe(null);
		expect(res.points).toBeGreaterThanOrEqual(1);
		expect(final.scores[res.side as Side]).toBe(res.points);
		expect(final.jackThrower).toBe(res.side);
	});
});

describe('purity', () => {
	it('no entry point mutates the state it is given', () => {
		const m = initMatch13(13, 0);
		const snap = JSON.stringify(m);
		const j = jackAt(2, 7.5);
		applyJack(m, j);
		applySettled({ ...m, phase: 'play' }, [at(2, 7.6, 0)], j);
		finishEnd({ ...m, phase: 'end-done' }, [at(2, 7.6, 0)], j);
		expect(JSON.stringify(m)).toBe(snap);
	});

	it('other() flips the side', () => {
		expect(other(0)).toBe(1);
		expect(other(1)).toBe(0);
	});
});
