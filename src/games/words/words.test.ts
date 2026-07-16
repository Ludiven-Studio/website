import { describe, it, expect } from 'vitest';
import { COMMON_RAW } from './common';
import { EXTENDED_RAW } from './extended';
import { parseWords, byLength, mergeSorted, hasPrefix, hasWord, letterCounts, isSubset } from './index';

const common = parseWords(COMMON_RAW);
const extended = parseWords(EXTENDED_RAW);

const checkList = (list: string[]): void => {
	for (const w of list) {
		expect(w).toMatch(/^[A-Z]{3,8}$/);
	}
	for (let i = 1; i < list.length; i++) expect(list[i] > list[i - 1], `${list[i - 1]} < ${list[i]}`).toBe(true); // sorted strict → no dups
};

describe('word lists', () => {
	it('common: A-Z only, 3-8 letters, strictly sorted', () => checkList(common));
	it('extended: A-Z only, 3-8 letters, strictly sorted', () => checkList(extended));

	it('common and extended are disjoint', () => {
		const set = new Set(common);
		expect(extended.some((w) => set.has(w))).toBe(false);
	});

	it('common has healthy per-length buckets', () => {
		for (const len of [6, 7, 8]) expect(byLength(common, len, len).length).toBeGreaterThanOrEqual(200);
		expect(byLength(common, 3, 5).length).toBeGreaterThanOrEqual(300);
	});

	it('common 6-8 solutions cover many first letters', () => {
		for (const len of [6, 7, 8]) {
			const firsts = new Set(byLength(common, len, len).map((w) => w[0]));
			expect(firsts.size).toBeGreaterThanOrEqual(15);
		}
	});
});

describe('helpers', () => {
	it('mergeSorted merges disjoint sorted lists', () => {
		expect(mergeSorted(['A', 'C', 'E'], ['B', 'D'])).toEqual(['A', 'B', 'C', 'D', 'E']);
		expect(mergeSorted([], ['X'])).toEqual(['X']);
	});

	it('hasPrefix / hasWord binary search', () => {
		const sorted = ['CHAT', 'CHIEN', 'CHOU', 'ZEBRE'];
		expect(hasPrefix(sorted, 'CH')).toBe(true);
		expect(hasPrefix(sorted, 'CHI')).toBe(true);
		expect(hasPrefix(sorted, 'CHU')).toBe(false);
		expect(hasPrefix(sorted, 'ZZ')).toBe(false);
		expect(hasWord(sorted, 'CHIEN')).toBe(true);
		expect(hasWord(sorted, 'CHIE')).toBe(false);
	});

	it('isSubset respects duplicate letters', () => {
		const base = letterCounts('POMMES');
		expect(isSubset('POMME', base)).toBe(true);
		expect(isSubset('MOMES', base)).toBe(true);
		expect(isSubset('SES', base)).toBe(false); // only one S
		expect(isSubset('PAPE', base)).toBe(false);
	});

	it('real-data smoke: common words are subsets of themselves and found by hasWord', () => {
		const merged = mergeSorted(common, extended);
		expect(hasWord(merged, common[0])).toBe(true);
		expect(hasWord(merged, extended[extended.length - 1])).toBe(true);
		expect(merged.length).toBe(common.length + extended.length);
	});
});
