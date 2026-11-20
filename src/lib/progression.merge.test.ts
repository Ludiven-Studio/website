import { describe, it, expect } from 'vitest';
import { mergeIntoLocal, type GameProgress } from './progression';

const local = (stars: 1 | 2 | 3, best: number): GameProgress => ({ stars: { 4: stars }, best: { 4: best } });
const row = (stars: number, best_score: number) => [{ level: 4, stars, best_score }];

describe('mergeIntoLocal', () => {
	it('takes the server row when it has more stars', () => {
		expect(mergeIntoLocal(local(2, 30), row(3, 50), true)).toEqual(local(3, 50));
	});

	it('keeps more local stars and their score', () => {
		expect(mergeIntoLocal(local(3, 50), row(2, 20), true)).toEqual(local(3, 50));
	});

	it('on a tie keeps a better local time (an offline improvement is not undone)', () => {
		expect(mergeIntoLocal(local(3, 20), row(3, 45), true)).toEqual(local(3, 20));
		expect(mergeIntoLocal(local(3, 45), row(3, 20), true)).toEqual(local(3, 20));
	});

	it('on a tie keeps the higher score for a points game', () => {
		expect(mergeIntoLocal(local(2, 900), row(2, 700), false)).toEqual(local(2, 900));
		expect(mergeIntoLocal(local(2, 700), row(2, 900), false)).toEqual(local(2, 900));
	});

	it('on a tie with no metric keeps the local score', () => {
		expect(mergeIntoLocal(local(1, 10), row(1, 99))).toEqual(local(1, 10));
	});

	it('adds a level only the server has', () => {
		expect(mergeIntoLocal({ stars: {}, best: {} }, row(1, 12), true)).toEqual(local(1, 12));
	});
});
